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
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type {
  TeamPhase,
  TeamSession,
  TeamSessionOptions,
  TeamWorkItem,
  TeamPlan,
  TeamWiStatus,
  CliProvider,
} from '@olympus-dev/protocol';
import { runCli } from './cli-runner.js';
import { WorktreeManager } from './worktree-manager.js';
import type { GeminiAdvisor } from './gemini-advisor.js';
import { extractContextWithLlm } from './llm-context-extractor.js';

const execFile = promisify(execFileCb);

const MAX_RETRIES = 2;
const PLAN_TIMEOUT_MS = 120_000;
const WI_TIMEOUT_MS = 900_000;
const SESSION_MAX_AGE_MS = 3_600_000; // 1 hour
const GEMINI_REVIEW_TIMEOUT_MS = 20_000;

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

    // A file cannot be in both ownedFiles and readOnlyFiles for the same WI
    for (const file of readOnlyFiles) {
      if (ownedFiles.includes(file)) {
        throw new Error(`File "${file}" in ${id} cannot be in both ownedFiles and readOnlyFiles`);
      }
    }

    const blockedBy = Array.isArray(w.blockedBy) ? w.blockedBy.map(String) : [];
    const rawProvider = typeof w.provider === 'string' ? w.provider : undefined;
    const provider: CliProvider | undefined =
      rawProvider === 'claude' || rawProvider === 'codex' ? rawProvider : undefined;

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
      provider,
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
 * Check file ownership: returns list of files changed that are NOT in ownedFiles.
 * Empty ownedFiles means "can create new files freely" — skip check.
 */
export function checkFileOwnership(changedFiles: string[], ownedFiles: string[]): string[] {
  if (ownedFiles.length === 0) return []; // No restrictions when ownedFiles is empty
  return changedFiles.filter(f => !ownedFiles.includes(f));
}

/**
 * Build predecessor context string from a WI's completed dependencies.
 * Prefers structured extractedContext over raw diff when available.
 */
export function buildPredecessorContext(
  wi: TeamWorkItem,
  workItems: TeamWorkItem[],
  completedDiffs: Map<string, string>,
): string {
  return wi.blockedBy
    .map(depId => {
      const depWi = workItems.find(w => w.id === depId);
      const ctx = depWi?.extractedContext;
      if (ctx) {
        const parts = [`### ${depId}: ${depWi?.title ?? ''}`];
        if (ctx.summary) parts.push(`Summary: ${ctx.summary}`);
        if (ctx.filesChanged.length > 0) parts.push(`Files: ${ctx.filesChanged.join(', ')}`);
        if (ctx.decisions.length > 0) parts.push(`Decisions: ${ctx.decisions.join('; ')}`);
        return parts.join('\n');
      }
      // Fallback to raw diff
      const diff = completedDiffs.get(depId);
      if (!diff) return '';
      return `### ${depId}: ${depWi?.title ?? ''}\n${diff}`;
    })
    .filter(Boolean)
    .join('\n\n');
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
  private abortControllers = new Map<string, AbortController>();
  private worktreeManagers = new Map<string, WorktreeManager>();
  private options: TeamOrchestratorOptions;
  private sessionsFilePath: string;

  constructor(options: TeamOrchestratorOptions) {
    super();
    this.options = options;
    this.sessionsFilePath = join(homedir(), '.olympus', 'active-teams.json');
    this.loadSessionsFromFile().catch(() => {});
  }

  // ──────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────

  async start(prompt: string, projectPath: string, chatId?: number, options?: TeamSessionOptions): Promise<string> {
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
      defaultProvider: options?.defaultProvider,
      options,
    };

    this.sessions.set(teamId, session);

    const ac = new AbortController();
    this.abortControllers.set(teamId, ac);

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

    // Abort running CLI processes immediately
    const ac = this.abortControllers.get(teamId);
    if (ac) {
      ac.abort();
      this.abortControllers.delete(teamId);
    }

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

      // Persist plan artifacts to .team/ for debugging and audit
      const teamDir = join(session.projectPath, '.team');
      try {
        await mkdir(teamDir, { recursive: true });

        const reqMd = plan.requirements
          .map(r => `- [${r.id}] ${r.description} (${r.priority})`)
          .join('\n');
        await writeFile(join(teamDir, 'requirements.md'), `# Requirements\n\n${reqMd}\n`);

        const ownership: Record<string, string> = {};
        for (const wi of plan.workItems) {
          for (const file of wi.ownedFiles) ownership[file] = wi.id;
        }
        await writeFile(join(teamDir, 'ownership.json'), JSON.stringify(ownership, null, 2));
      } catch {
        // Best-effort persistence — do not block execution
      }

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
    } finally {
      this.saveSessionsToFile().catch(() => {});
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
    "prompt": "Complete implementation instructions with full context...",
    "provider": "claude|codex — claude for complex/architectural, codex for mechanical/repetitive"
  }]
}

Rules:
- Each file in at most ONE workItem's ownedFiles
- Work items should be independent whenever possible (minimize blockedBy)
- 2-6 work items max
- Each prompt must be self-contained with enough context to implement without seeing other WIs
- Use existing project patterns and conventions`;

    const abortSignal = this.abortControllers.get(session.id)?.signal;

    const result = await runCli({
      prompt: planPrompt,
      provider: 'claude',
      workspaceDir: session.projectPath,
      timeoutMs: PLAN_TIMEOUT_MS,
      dangerouslySkipPermissions: true,
      abortSignal,
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
        abortSignal,
      });
      if (!retryResult.success || !retryResult.text) {
        throw new Error('Plan JSON extraction failed after retry');
      }
      parsed = extractJson(retryResult.text);
    }

    const plan = validatePlan(parsed);

    // Gemini plan review (non-blocking, informational only)
    await this.geminiPlanReview(session, plan);

    return plan;
  }

  private async geminiPlanReview(session: TeamSession, plan: TeamPlan): Promise<void> {
    const advisor = this.options.geminiAdvisor;
    if (!advisor) return;

    try {
      const planJson = JSON.stringify({
        requirements: plan.requirements,
        workItems: plan.workItems.map(wi => ({
          id: wi.id, title: wi.title, ownedFiles: wi.ownedFiles,
          blockedBy: wi.blockedBy, provider: wi.provider,
        })),
      });

      const reviewPrompt = `Review this team work plan. Respond with JSON only.

Plan:
${planJson.slice(0, 3000)}

Task: ${session.prompt.slice(0, 500)}

Evaluate: completeness, file ownership conflicts, dependency correctness, risk areas.
JSON: {"approved":true|false,"issues":["..."]}`;

      const response = await advisor.reviewText(reviewPrompt, GEMINI_REVIEW_TIMEOUT_MS);
      if (!response) return;

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return;

      const result = JSON.parse(jsonMatch[0]);
      if (result && !result.approved && Array.isArray(result.issues) && result.issues.length > 0) {
        this.emit('team:plan:review', {
          teamId: session.id,
          approved: false,
          issues: result.issues,
        });
      }
    } catch {
      // Plan review is best-effort
    }
  }

  // ──────────────────────────────────────────────
  // Phase 3: Execute (DAG-parallel)
  // ──────────────────────────────────────────────

  private async executePhase(session: TeamSession, manager: WorktreeManager): Promise<void> {
    const teamId = session.id;
    const workItems = session.workItems;
    // Store diff summaries of completed WIs for dependent context injection
    const completedDiffs = new Map<string, string>();

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

        // Build predecessor context from completed dependencies
        const predecessorContext = buildPredecessorContext(wi, workItems, completedDiffs);

        const promise = this.executeWorkItem(session, wi, manager, predecessorContext)
          .then(async () => {
            executing.delete(wi.id);
            // Capture diff summary for future dependents
            if (wi.status === 'completed') {
              const diff = await manager.getWorktreeDiffSummary(wi.id, 1500);
              if (diff) completedDiffs.set(wi.id, diff);
            }
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

    // Wait for all to complete.
    // tryStartReady() is called FIRST each iteration to handle the race where
    // executing.size hits 0 before newly-ready WIs have been started.
    while (true) {
      if (this.isCancelled(teamId)) return;
      tryStartReady();
      if (executing.size === 0) break;
      await Promise.race(executing.values());
    }
  }

  private async executeWorkItem(
    session: TeamSession,
    wi: TeamWorkItem,
    manager: WorktreeManager,
    predecessorContext?: string,
  ): Promise<void> {
    const teamId = session.id;
    const abortSignal = this.abortControllers.get(teamId)?.signal;

    const predecessorSection = predecessorContext
      ? `\n## Predecessor Work Items (already completed — reference their changes)\n${predecessorContext}\n`
      : '';

    const wiPrompt = `## Work Item: ${wi.id} — ${wi.title}
${wi.prompt}

## File Ownership
You may ONLY modify these files: ${wi.ownedFiles.length > 0 ? wi.ownedFiles.join(', ') : '(create new files as needed)'}
Read-only reference files: ${wi.readOnlyFiles.length > 0 ? wi.readOnlyFiles.join(', ') : '(none)'}
${predecessorSection}
Rules:
- Only modify files listed in your ownership. Create new files if needed.
- If you need changes to read-only files, describe what changes are needed in a comment but do NOT modify them.
- Focus on completing this work item fully.`;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (this.isCancelled(teamId)) return;

      try {
        // On retry, fall back from claude → codex to maximize success odds
        const baseProvider = wi.provider ?? session.defaultProvider ?? 'claude';
        const wiProvider = (attempt > 0 && baseProvider === 'claude') ? 'codex' : baseProvider;

        const result = await runCli({
          prompt: wiPrompt,
          provider: wiProvider,
          workspaceDir: wi.worktreePath,
          timeoutMs: WI_TIMEOUT_MS,
          dangerouslySkipPermissions: true,
          abortSignal,
        });

        wi.cliResult = result;

        if (!result.success) {
          throw new Error(result.error?.message ?? 'CLI execution failed');
        }

        // File ownership guard: revert unauthorized file changes before commit
        if (wi.ownedFiles.length > 0) {
          const changedFiles = await manager.getChangedFiles(wi.id);
          const violations = checkFileOwnership(changedFiles, wi.ownedFiles);
          if (violations.length > 0) {
            // Revert unauthorized files in the worktree
            const wtPath = manager.getWorktreePath(wi.id);
            if (wtPath) {
              for (const file of violations) {
                try {
                  await execFile('git', ['checkout', manager.getBaseBranch(), '--', file], {
                    cwd: wtPath,
                    timeout: 10_000,
                  });
                } catch {
                  // File may be newly created — remove it
                  try {
                    await execFile('git', ['rm', '-f', '--', file], {
                      cwd: wtPath,
                      timeout: 10_000,
                    });
                  } catch {
                    // Best-effort
                  }
                }
              }
            }
            wi.ownershipViolations = violations;
            this.emit('team:wi:ownership-violation', {
              teamId,
              wiId: wi.id,
              violations,
            });
          }
        }

        // Commit changes in the worktree
        await manager.commitWorktree(wi.id, `team(${wi.id}): ${wi.title}`);

        // Extract structured context only when other WIs depend on this one.
        // Avoids a 15s LLM call for leaf work items with no dependents.
        const hasDependents = session.workItems.some(w => w.blockedBy.includes(wi.id));
        if (hasDependents) {
          try {
            const extracted = await extractContextWithLlm({
              result: { success: true, text: result.text ?? '' },
              prompt: wi.prompt,
              timeoutMs: 15_000,
            });
            wi.extractedContext = extracted;
          } catch {
            // Context extraction is best-effort
          }
        }

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

        // Try intelligent conflict resolution via Claude CLI
        const resolved = await this.resolveConflictsIntelligently(
          session, manager, wiId, result.conflictFiles,
        );

        if (!resolved) {
          // Fallback: accept theirs (the later WI branch wins)
          try {
            await manager.resolveConflictsTheirs(result.conflictFiles);
          } catch {
            await manager.abortMerge();
            throw new Error(`Unresolvable merge conflict in ${wiId}: ${result.conflictFiles.join(', ')}`);
          }
        }
      }

      merged++;
      session.mergeProgress = { merged, total, conflicts };
      this.emit('team:merge:progress', { teamId, merged, total, conflicts });
    }
  }

  /**
   * Attempt to resolve merge conflicts by running Claude CLI in the merge branch cwd,
   * letting it directly read and edit the conflicted files.
   */
  private async resolveConflictsIntelligently(
    session: TeamSession,
    manager: WorktreeManager,
    wiId: string,
    conflictFiles: string[],
  ): Promise<boolean> {
    try {
      const resolvePrompt = `You are resolving git merge conflicts in a repository. The following files have conflict markers (<<<<<<< ======= >>>>>>>):

${conflictFiles.map(f => `- ${f}`).join('\n')}

## Instructions
1. Read each conflicted file
2. Resolve the conflicts by intelligently merging BOTH sides — keep all meaningful changes
3. Remove ALL conflict markers (<<<<<<< ======= >>>>>>>)
4. Write the resolved content back to each file
5. Do NOT modify any other files

Rules:
- Preserve both sides' changes when possible
- If changes are mutually exclusive, prefer the newer work item's ("theirs") changes
- Make sure the resolved code compiles and is syntactically correct`;

      const abortSignal = this.abortControllers.get(session.id)?.signal;

      const result = await runCli({
        prompt: resolvePrompt,
        provider: 'claude',
        workspaceDir: session.projectPath,
        timeoutMs: 90_000,
        dangerouslySkipPermissions: true,
        abortSignal,
      });

      if (!result.success) return false;

      // Verify no conflict markers remain
      const remaining = await manager.hasConflictMarkers(conflictFiles);
      if (remaining.length > 0) return false;

      // Verify Claude didn't modify files outside the conflict set
      const allChanged = await manager.getUncommittedChanges();
      const extraFiles = allChanged.filter(f => !conflictFiles.includes(f));
      if (extraFiles.length > 0) {
        // Revert unauthorized changes
        for (const file of extraFiles) {
          try {
            await execFile('git', ['checkout', 'HEAD', '--', file], {
              cwd: session.projectPath,
              timeout: 10_000,
            });
          } catch {
            // Best-effort revert
          }
        }
      }

      // Stage resolved files and commit
      await manager.stageAndCommitMerge(conflictFiles);
      return true;
    } catch {
      return false;
    }
  }

  // ──────────────────────────────────────────────
  // Phase 5: Verify
  // ──────────────────────────────────────────────

  private async verifyPhase(session: TeamSession): Promise<void> {
    const opts = session.options;
    const runLint = opts?.runLint ?? true;
    const runTests = opts?.runTests ?? false;
    const llmReview = opts?.llmReview ?? false;
    const teamId = session.id;

    const execOpts = {
      cwd: session.projectPath,
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    };

    // 1. Build (always)
    try {
      await execFile('pnpm', ['build'], execOpts);
    } catch (err) {
      const errMsg = (err as Error).message;
      throw new Error(`Build verification failed: ${errMsg.slice(0, 500)}`);
    }

    // 2. Lint (default: on)
    if (runLint) {
      try {
        await execFile('pnpm', ['lint'], execOpts);
      } catch (err) {
        const errMsg = (err as Error).message;
        throw new Error(`Lint verification failed: ${errMsg.slice(0, 500)}`);
      }
    }

    // 3. Test (default: off)
    if (runTests) {
      try {
        await execFile('pnpm', ['test'], { ...execOpts, timeout: 300_000 });
      } catch (err) {
        const errMsg = (err as Error).message;
        throw new Error(`Test verification failed: ${errMsg.slice(0, 500)}`);
      }
    }

    // 4. LLM code review (default: off)
    if (llmReview) {
      try {
        const manager = this.worktreeManagers.get(teamId);
        const baseBranch = manager?.getBaseBranch() ?? 'main';
        const { stdout: diff } = await execFile('git', ['diff', `${baseBranch}...HEAD`, '--stat'], {
          cwd: session.projectPath,
          timeout: 10_000,
          maxBuffer: 5 * 1024 * 1024,
        });

        const reviewResult = await runCli({
          prompt: `Review this merged code diff for issues. Be concise.\n\n${diff.slice(0, 4000)}`,
          provider: 'codex',
          timeoutMs: 20_000,
          dangerouslySkipPermissions: true,
        });

        if (reviewResult.success && reviewResult.text) {
          this.emit('team:verify:review', {
            teamId,
            review: reviewResult.text.slice(0, 2000),
          });
        }
      } catch {
        // LLM review is best-effort
      }
    }
  }

  // ──────────────────────────────────────────────
  // Session Persistence
  // ──────────────────────────────────────────────

  private async saveSessionsToFile(): Promise<void> {
    try {
      const dir = join(homedir(), '.olympus');
      await mkdir(dir, { recursive: true });

      // Save only completed/failed sessions (not running ones — those lack serializable state)
      const sessions = Array.from(this.sessions.values())
        .filter(s => s.phase === 'completed' || s.phase === 'failed' || s.phase === 'cancelled')
        .map(s => ({
          id: s.id,
          prompt: s.prompt.slice(0, 200),
          projectPath: s.projectPath,
          phase: s.phase,
          startedAt: s.startedAt,
          completedAt: s.completedAt,
          totalCost: s.totalCost,
          error: s.error,
          summary: s.summary,
          workItemCount: s.workItems.length,
        }));

      await writeFile(this.sessionsFilePath, JSON.stringify(sessions, null, 2));
    } catch {
      // Best-effort persistence
    }
  }

  private async loadSessionsFromFile(): Promise<void> {
    try {
      const raw = await readFile(this.sessionsFilePath, 'utf-8');
      const sessions = JSON.parse(raw) as Array<Record<string, unknown>>;
      if (!Array.isArray(sessions)) return;

      const now = Date.now();
      for (const s of sessions) {
        const startedAt = typeof s.startedAt === 'number' ? s.startedAt : 0;
        // Skip sessions older than 1 hour
        if (now - startedAt > SESSION_MAX_AGE_MS) continue;

        const id = String(s.id ?? '');
        if (!id || this.sessions.has(id)) continue;

        this.sessions.set(id, {
          id,
          prompt: String(s.prompt ?? ''),
          projectPath: String(s.projectPath ?? ''),
          phase: String(s.phase ?? 'failed') as TeamPhase,
          workItems: [],
          baseBranch: '',
          startedAt,
          completedAt: typeof s.completedAt === 'number' ? s.completedAt : undefined,
          totalCost: typeof s.totalCost === 'number' ? s.totalCost : undefined,
          error: typeof s.error === 'string' ? s.error : undefined,
          summary: typeof s.summary === 'string' ? s.summary : undefined,
        });
      }
    } catch {
      // File may not exist yet
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
