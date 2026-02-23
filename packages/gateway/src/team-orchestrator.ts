/**
 * TeamOrchestrator — Gateway-level orchestration for Team Engineering Protocol v4.
 *
 * Manages the full lifecycle: Plan → Setup worktrees → DAG-parallel execute →
 * Sequential merge → Verify → Cleanup.
 */

import { EventEmitter } from 'node:events';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import type {
  TeamPhase,
  TeamSession,
  TeamWorkItem,
  TeamPlan,
  TeamWiStatus,
} from '@olympus-dev/protocol';
import { runCli } from './cli-runner.js';
import { WorktreeManager } from './worktree-manager.js';
import type { GeminiAdvisor } from './gemini-advisor.js';

const execFile = promisify(execFileCb);

const MAX_RETRIES = 2;
const PLAN_TIMEOUT_MS = 120_000;
const WI_TIMEOUT_MS = 900_000;

// ──────────────────────────────────────────────
// Helper functions (exported for testing)
// ──────────────────────────────────────────────

/**
 * Topological sort using Kahn's algorithm.
 * Returns WI IDs in execution order; throws on cycles.
 */
export function topologicalSort(workItems: TeamWorkItem[]): string[] {
  const idSet = new Set(workItems.map(wi => wi.id));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const wi of workItems) {
    inDegree.set(wi.id, 0);
    adjacency.set(wi.id, []);
  }

  for (const wi of workItems) {
    for (const dep of wi.blockedBy) {
      if (!idSet.has(dep)) throw new Error(`Unknown dependency: ${dep} in ${wi.id}`);
      adjacency.get(dep)!.push(wi.id);
      inDegree.set(wi.id, (inDegree.get(wi.id) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const result: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);
    for (const neighbor of adjacency.get(current) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  if (result.length !== workItems.length) {
    throw new Error('Circular dependency detected in work items');
  }

  return result;
}

/**
 * Extract JSON from text that may contain markdown code fences or surrounding prose.
 */
export function extractJson(text: string): unknown {
  // Try bare JSON first
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Fall through to fence extraction
    }
  }

  // Try markdown code fence
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    return JSON.parse(fenceMatch[1].trim());
  }

  // Try to find JSON object in text
  const jsonMatch = text.match(/(\{[\s\S]*\})/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[1]);
  }

  throw new Error('No valid JSON found in text');
}

/**
 * Validate a parsed plan: schema, file ownership uniqueness, blockedBy references.
 */
export function validatePlan(raw: unknown): TeamPlan {
  const obj = raw as Record<string, unknown>;

  if (!obj || typeof obj !== 'object') throw new Error('Plan must be an object');
  if (!Array.isArray(obj.requirements)) throw new Error('Plan must have requirements array');
  if (!Array.isArray(obj.workItems)) throw new Error('Plan must have workItems array');
  if (obj.workItems.length === 0) throw new Error('Plan must have at least one work item');
  if (obj.workItems.length > 8) throw new Error('Too many work items (max 8)');

  const workItems: TeamWorkItem[] = [];
  const allIds = new Set<string>();
  const fileOwnership = new Map<string, string>();

  for (const wi of obj.workItems) {
    const w = wi as Record<string, unknown>;
    if (!w.id || !w.title || !w.prompt) {
      throw new Error(`Work item missing required fields: ${JSON.stringify(w)}`);
    }

    const id = String(w.id);
    if (allIds.has(id)) throw new Error(`Duplicate work item ID: ${id}`);
    allIds.add(id);

    const ownedFiles = Array.isArray(w.ownedFiles) ? w.ownedFiles.map(String) : [];
    const readOnlyFiles = Array.isArray(w.readOnlyFiles) ? w.readOnlyFiles.map(String) : [];
    const blockedBy = Array.isArray(w.blockedBy) ? w.blockedBy.map(String) : [];

    // Check file ownership uniqueness
    for (const file of ownedFiles) {
      const existing = fileOwnership.get(file);
      if (existing) {
        throw new Error(`File "${file}" owned by both ${existing} and ${id}`);
      }
      fileOwnership.set(file, id);
    }

    workItems.push({
      id,
      title: String(w.title),
      description: String(w.description ?? ''),
      ownedFiles,
      readOnlyFiles,
      blockedBy,
      prompt: String(w.prompt),
      status: 'pending',
      retryCount: 0,
    });
  }

  // Validate blockedBy references
  for (const wi of workItems) {
    for (const dep of wi.blockedBy) {
      if (!allIds.has(dep)) {
        throw new Error(`Work item ${wi.id} depends on unknown WI: ${dep}`);
      }
    }
  }

  // Validate DAG (no cycles)
  topologicalSort(workItems);

  // Collect shared files from plan (if provided)
  const sharedFiles = Array.isArray(obj.sharedFiles) ? obj.sharedFiles.map(String) : [];

  return {
    requirements: (obj.requirements as Array<Record<string, unknown>>).map((r, i) => ({
      id: String(r.id ?? `R${i + 1}`),
      description: String(r.description ?? ''),
      priority: (['must', 'should', 'nice'].includes(String(r.priority)) ? String(r.priority) : 'should') as 'must' | 'should' | 'nice',
    })),
    workItems,
    sharedFiles,
  };
}

/**
 * Get tracked file tree from git, truncated to maxLength.
 */
async function getProjectFileTree(projectPath: string, maxLength = 3000): Promise<string> {
  try {
    const { stdout } = await execFile('git', ['ls-files'], {
      cwd: projectPath,
      timeout: 10_000,
      maxBuffer: 5 * 1024 * 1024,
    });
    const tree = stdout.trim();
    if (tree.length <= maxLength) return tree;
    return tree.slice(0, maxLength) + '\n... (truncated)';
  } catch {
    return '(unable to list files)';
  }
}

// ──────────────────────────────────────────────
// TeamOrchestrator
// ──────────────────────────────────────────────

export interface TeamOrchestratorOptions {
  geminiAdvisor?: GeminiAdvisor;
  workspaceRoot: string;
}

export class TeamOrchestrator extends EventEmitter {
  private sessions = new Map<string, TeamSession>();
  private cancellations = new Set<string>();
  private worktreeManagers = new Map<string, WorktreeManager>();
  private options: TeamOrchestratorOptions;

  constructor(options: TeamOrchestratorOptions) {
    super();
    this.options = options;
  }

  // ──────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────

  async start(prompt: string, projectPath: string, chatId?: number): Promise<string> {
    const teamId = randomUUID().slice(0, 8);
    const session: TeamSession = {
      id: teamId,
      prompt,
      projectPath,
      chatId,
      phase: 'planning',
      workItems: [],
      baseBranch: '',
      startedAt: Date.now(),
    };

    this.sessions.set(teamId, session);

    this.emit('team:started', { teamId, prompt, projectPath });

    // Run pipeline in background
    this.runPipeline(session).catch(err => {
      if (session.phase !== 'failed' && session.phase !== 'cancelled') {
        session.phase = 'failed';
        session.error = (err as Error).message;
        this.emit('team:failed', { teamId, error: session.error, phase: session.phase });
      }
    });

    return teamId;
  }

  getSession(teamId: string): TeamSession | null {
    return this.sessions.get(teamId) ?? null;
  }

  getAllSessions(): TeamSession[] {
    return Array.from(this.sessions.values());
  }

  cancel(teamId: string): boolean {
    const session = this.sessions.get(teamId);
    if (!session) return false;
    if (session.phase === 'completed' || session.phase === 'failed' || session.phase === 'cancelled') return false;

    this.cancellations.add(teamId);
    session.phase = 'cancelled';
    session.error = 'Cancelled by user';
    this.emit('team:phase', { teamId, phase: 'cancelled', message: 'Cancelled by user' });

    // Cleanup worktrees
    const manager = this.worktreeManagers.get(teamId);
    if (manager) {
      manager.cleanup().catch(() => {});
    }

    return true;
  }

  // ──────────────────────────────────────────────
  // Pipeline
  // ──────────────────────────────────────────────

  private isCancelled(teamId: string): boolean {
    return this.cancellations.has(teamId);
  }

  private setPhase(session: TeamSession, phase: TeamPhase, message: string): void {
    session.phase = phase;
    this.emit('team:phase', { teamId: session.id, phase, message });
  }

  private async runPipeline(session: TeamSession): Promise<void> {
    const teamId = session.id;

    try {
      // Phase 1: PLAN
      this.setPhase(session, 'planning', 'Analyzing task and creating work plan...');
      const plan = await this.planPhase(session);
      if (this.isCancelled(teamId)) return;

      session.plan = plan;
      session.workItems = plan.workItems;

      this.emit('team:plan:ready', {
        teamId,
        requirementCount: plan.requirements.length,
        workItemCount: plan.workItems.length,
        workItems: plan.workItems.map(wi => ({ id: wi.id, title: wi.title, blockedBy: wi.blockedBy })),
      });

      // Phase 2: SETUP
      this.setPhase(session, 'setup', 'Creating isolated worktrees...');
      const manager = new WorktreeManager(session.projectPath, teamId);
      this.worktreeManagers.set(teamId, manager);
      await manager.initialize();
      session.baseBranch = manager.getBaseBranch();

      for (const wi of session.workItems) {
        if (this.isCancelled(teamId)) return;
        const info = await manager.createWorktree(wi.id);
        wi.branch = info.branch;
        wi.worktreePath = info.path;
      }

      // Phase 3: EXECUTE
      this.setPhase(session, 'executing', 'Running work items in parallel...');
      await this.executePhase(session, manager);
      if (this.isCancelled(teamId)) return;

      // Check all WIs completed successfully
      const failedWis = session.workItems.filter(wi => wi.status === 'failed');
      if (failedWis.length > 0) {
        throw new Error(`${failedWis.length} work item(s) failed: ${failedWis.map(wi => wi.id).join(', ')}`);
      }

      // Phase 4: MERGE
      this.setPhase(session, 'merging', 'Merging work item branches...');
      await this.mergePhase(session, manager);
      if (this.isCancelled(teamId)) return;

      // Phase 5: VERIFY
      this.setPhase(session, 'verifying', 'Running build verification...');
      await this.verifyPhase(session);
      if (this.isCancelled(teamId)) return;

      // Phase 6: CLEANUP
      this.setPhase(session, 'cleanup', 'Cleaning up worktrees...');
      await manager.finalize();
      await manager.cleanup();
      this.worktreeManagers.delete(teamId);

      // Complete
      session.completedAt = Date.now();
      const durationMs = session.completedAt - session.startedAt;
      session.totalCost = session.workItems.reduce((sum, wi) => sum + (wi.cliResult?.cost ?? 0), 0);
      session.summary = this.buildSummary(session);
      session.phase = 'completed';

      this.emit('team:completed', {
        teamId,
        summary: session.summary,
        durationMs,
        totalCost: session.totalCost,
        workItemCount: session.workItems.length,
      });
    } catch (err) {
      if (this.isCancelled(teamId)) return;

      session.phase = 'failed';
      session.error = (err as Error).message;
      session.completedAt = Date.now();

      // Cleanup on failure
      const manager = this.worktreeManagers.get(teamId);
      if (manager) {
        await manager.cleanup().catch(() => {});
        this.worktreeManagers.delete(teamId);
      }

      this.emit('team:failed', { teamId, error: session.error, phase: session.phase });
    }
  }

  // ──────────────────────────────────────────────
  // Phase 1: Plan
  // ──────────────────────────────────────────────

  private async planPhase(session: TeamSession): Promise<TeamPlan> {
    const geminiContext = this.options.geminiAdvisor
      ? this.options.geminiAdvisor.buildProjectContext(session.projectPath, { maxLength: 2000 })
      : '';
    const fileTree = await getProjectFileTree(session.projectPath);

    const planPrompt = `You are a software architect. Analyze the task and output a JSON plan.

## Task
${session.prompt}

${geminiContext ? `## Project Context\n${geminiContext}\n` : ''}
## File Tree (tracked files)
${fileTree}

Output ONLY valid JSON (no markdown, no explanation):
{
  "requirements": [{ "id": "R1", "description": "...", "priority": "must|should|nice" }],
  "workItems": [{
    "id": "wi-1",
    "title": "Short descriptive title",
    "description": "Detailed description of what to implement",
    "ownedFiles": ["src/path/to/file.ts"],
    "readOnlyFiles": ["src/types/index.ts"],
    "blockedBy": [],
    "prompt": "Complete implementation instructions with full context..."
  }]
}

Rules:
- Each file in at most ONE workItem's ownedFiles
- Work items should be independent whenever possible (minimize blockedBy)
- 2-6 work items max
- Each prompt must be self-contained with enough context to implement without seeing other WIs
- Use existing project patterns and conventions`;

    const result = await runCli({
      prompt: planPrompt,
      provider: 'claude',
      workspaceDir: session.projectPath,
      timeoutMs: PLAN_TIMEOUT_MS,
      dangerouslySkipPermissions: true,
    });

    if (!result.success || !result.text) {
      throw new Error(`Plan generation failed: ${result.error?.message ?? 'empty response'}`);
    }

    let parsed: unknown;
    try {
      parsed = extractJson(result.text);
    } catch {
      // Retry once with more explicit prompt
      const retryResult = await runCli({
        prompt: planPrompt + '\n\nIMPORTANT: Output ONLY the JSON object. No markdown code fences, no explanation before or after.',
        provider: 'claude',
        workspaceDir: session.projectPath,
        timeoutMs: PLAN_TIMEOUT_MS,
        dangerouslySkipPermissions: true,
      });
      if (!retryResult.success || !retryResult.text) {
        throw new Error('Plan JSON extraction failed after retry');
      }
      parsed = extractJson(retryResult.text);
    }

    return validatePlan(parsed);
  }

  // ──────────────────────────────────────────────
  // Phase 3: Execute (DAG-parallel)
  // ──────────────────────────────────────────────

  private async executePhase(session: TeamSession, manager: WorktreeManager): Promise<void> {
    const teamId = session.id;
    const workItems = session.workItems;

    // Mark initially ready WIs
    for (const wi of workItems) {
      if (wi.blockedBy.length === 0) {
        wi.status = 'ready';
      }
    }

    // DAG execution loop
    const executing = new Map<string, Promise<void>>();

    const tryStartReady = () => {
      for (const wi of workItems) {
        if (wi.status !== 'ready') continue;
        if (this.isCancelled(teamId)) return;

        wi.status = 'running';
        wi.startedAt = Date.now();
        this.emit('team:wi:started', { teamId, wiId: wi.id, title: wi.title });

        const promise = this.executeWorkItem(session, wi, manager)
          .then(() => {
            executing.delete(wi.id);
            // Unblock dependents
            for (const other of workItems) {
              if (other.status === 'pending' && other.blockedBy.every(
                dep => workItems.find(w => w.id === dep)?.status === 'completed'
              )) {
                other.status = 'ready';
              }
            }
          })
          .catch(() => {
            executing.delete(wi.id);
          });

        executing.set(wi.id, promise);
      }
    };

    tryStartReady();

    // Wait for all to complete
    while (executing.size > 0) {
      if (this.isCancelled(teamId)) return;
      await Promise.race(executing.values());
      tryStartReady();
    }
  }

  private async executeWorkItem(
    session: TeamSession,
    wi: TeamWorkItem,
    manager: WorktreeManager,
  ): Promise<void> {
    const teamId = session.id;
    const wiPrompt = `## Work Item: ${wi.id} — ${wi.title}
${wi.prompt}

## File Ownership
You may ONLY modify these files: ${wi.ownedFiles.length > 0 ? wi.ownedFiles.join(', ') : '(create new files as needed)'}
Read-only reference files: ${wi.readOnlyFiles.length > 0 ? wi.readOnlyFiles.join(', ') : '(none)'}

Rules:
- Only modify files listed in your ownership. Create new files if needed.
- If you need changes to read-only files, describe what changes are needed in a comment but do NOT modify them.
- Focus on completing this work item fully.`;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (this.isCancelled(teamId)) return;

      try {
        const result = await runCli({
          prompt: wiPrompt,
          provider: 'claude',
          workspaceDir: wi.worktreePath,
          timeoutMs: WI_TIMEOUT_MS,
          dangerouslySkipPermissions: true,
        });

        wi.cliResult = result;

        if (!result.success) {
          throw new Error(result.error?.message ?? 'CLI execution failed');
        }

        // Commit changes in the worktree
        await manager.commitWorktree(wi.id, `team(${wi.id}): ${wi.title}`);

        wi.status = 'completed';
        wi.completedAt = Date.now();
        wi.durationMs = wi.completedAt - (wi.startedAt ?? wi.completedAt);

        this.emit('team:wi:completed', {
          teamId,
          wiId: wi.id,
          title: wi.title,
          success: true,
          durationMs: wi.durationMs,
        });
        return;
      } catch (err) {
        wi.retryCount = attempt + 1;
        wi.error = (err as Error).message;

        if (attempt < MAX_RETRIES) {
          this.emit('team:wi:failed', {
            teamId,
            wiId: wi.id,
            title: wi.title,
            error: wi.error,
            retryCount: wi.retryCount,
          });
          // Brief pause before retry
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }

    // All retries exhausted
    wi.status = 'failed';
    wi.completedAt = Date.now();
    wi.durationMs = wi.completedAt - (wi.startedAt ?? wi.completedAt);

    this.emit('team:wi:failed', {
      teamId,
      wiId: wi.id,
      title: wi.title,
      error: wi.error ?? 'Unknown error',
      retryCount: wi.retryCount,
    });
  }

  // ──────────────────────────────────────────────
  // Phase 4: Merge
  // ──────────────────────────────────────────────

  private async mergePhase(session: TeamSession, manager: WorktreeManager): Promise<void> {
    const teamId = session.id;
    const sorted = topologicalSort(session.workItems);

    await manager.createMergeBranch();

    let merged = 0;
    let conflicts = 0;
    const total = sorted.length;

    session.mergeProgress = { merged: 0, total, conflicts: 0 };

    for (const wiId of sorted) {
      if (this.isCancelled(teamId)) return;

      const result = await manager.mergeWorkItem(wiId);

      if (!result.success && result.conflictFiles) {
        conflicts++;
        // Auto-resolve with theirs strategy
        try {
          await manager.resolveConflicts(result.conflictFiles);
        } catch {
          await manager.abortMerge();
          throw new Error(`Unresolvable merge conflict in ${wiId}: ${result.conflictFiles.join(', ')}`);
        }
      }

      merged++;
      session.mergeProgress = { merged, total, conflicts };
      this.emit('team:merge:progress', { teamId, merged, total, conflicts });
    }
  }

  // ──────────────────────────────────────────────
  // Phase 5: Verify
  // ──────────────────────────────────────────────

  private async verifyPhase(session: TeamSession): Promise<void> {
    // Run a quick build check in the project directory (on merge branch)
    try {
      await execFile('pnpm', ['build'], {
        cwd: session.projectPath,
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (err) {
      const errMsg = (err as Error).message;
      // Build failure is not fatal — log warning
      console.warn(`[TeamOrchestrator] Build verification warning: ${errMsg.slice(0, 200)}`);
    }
  }

  // ──────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────

  private buildSummary(session: TeamSession): string {
    const lines: string[] = [];
    const durationSec = Math.round(((session.completedAt ?? Date.now()) - session.startedAt) / 1000);

    lines.push(`Team v4 completed in ${durationSec}s | $${(session.totalCost ?? 0).toFixed(4)}`);
    lines.push('');

    for (const wi of session.workItems) {
      const icon = wi.status === 'completed' ? '[OK]' : '[FAIL]';
      const dur = wi.durationMs ? ` (${Math.round(wi.durationMs / 1000)}s)` : '';
      lines.push(`${icon} ${wi.id}: ${wi.title}${dur}`);
    }

    return lines.join('\n');
  }
}
