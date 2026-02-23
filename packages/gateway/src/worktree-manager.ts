/**
 * WorktreeManager — Git worktree lifecycle for Team Engineering Protocol v4.
 *
 * Each Work Item gets an isolated worktree branching from the same base commit.
 * After execution, worktrees are merged sequentially.
 */

import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, symlink, readdir, stat, rm, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, relative, dirname } from 'node:path';

const execFile = promisify(execFileCb);

const GIT_TIMEOUT_MS = 30_000;

export interface WorktreeInfo {
  wiId: string;
  branch: string;
  path: string;
}

export interface MergeResult {
  success: boolean;
  conflictFiles?: string[];
}

export class WorktreeManager {
  private projectPath: string;
  private sessionId: string;
  private baseBranch = '';
  private stashed = false;
  private worktrees = new Map<string, WorktreeInfo>();
  private teamDir: string;
  private wtDir: string;
  private mergeBranch: string;
  private gitignoreAppended = false;

  constructor(projectPath: string, sessionId: string) {
    this.projectPath = resolve(projectPath);
    this.sessionId = sessionId;
    this.teamDir = join(this.projectPath, '.team');
    this.wtDir = join(this.teamDir, 'wt');
    this.mergeBranch = `team/${sessionId}/merge`;
  }

  // ──────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────

  private async git(args: string[], cwd?: string): Promise<string> {
    const { stdout } = await execFile('git', args, {
      cwd: cwd ?? this.projectPath,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout.trim();
  }

  getBaseBranch(): string {
    return this.baseBranch;
  }

  getMergeBranch(): string {
    return this.mergeBranch;
  }

  getWorktreePath(wiId: string): string | undefined {
    return this.worktrees.get(wiId)?.path;
  }

  getWorktreeBranch(wiId: string): string | undefined {
    return this.worktrees.get(wiId)?.branch;
  }

  // ──────────────────────────────────────────────
  // Phase: Initialize
  // ──────────────────────────────────────────────

  async initialize(): Promise<void> {
    // Get current branch
    this.baseBranch = await this.git(['rev-parse', '--abbrev-ref', 'HEAD']);

    // Stash dirty changes if any
    const status = await this.git(['status', '--porcelain']);
    if (status.length > 0) {
      await this.git(['stash', 'push', '-m', `team-${this.sessionId}-auto-stash`]);
      this.stashed = true;
    }

    // Create .team/wt/ directory
    await mkdir(this.wtDir, { recursive: true });

    // Append .team/ to .gitignore if not already present
    await this.appendGitignore();
  }

  private async appendGitignore(): Promise<void> {
    const gitignorePath = join(this.projectPath, '.gitignore');
    try {
      const content = await readFile(gitignorePath, 'utf-8');
      if (content.includes('.team/')) return;
      await writeFile(gitignorePath, content.trimEnd() + '\n.team/\n');
      this.gitignoreAppended = true;
    } catch {
      // No .gitignore — create one with .team/
      await writeFile(gitignorePath, '.team/\n');
      this.gitignoreAppended = true;
    }
  }

  // ──────────────────────────────────────────────
  // Phase: Create worktree
  // ──────────────────────────────────────────────

  async createWorktree(wiId: string): Promise<WorktreeInfo> {
    const branch = `team/${this.sessionId}/${wiId}`;
    const wtPath = join(this.wtDir, wiId);

    await this.git(['worktree', 'add', wtPath, '-b', branch]);

    // Symlink node_modules from main project
    await this.symlinkNodeModules(wtPath);

    const info: WorktreeInfo = { wiId, branch, path: wtPath };
    this.worktrees.set(wiId, info);
    return info;
  }

  private async symlinkNodeModules(wtPath: string): Promise<void> {
    // Root node_modules
    const rootNm = join(this.projectPath, 'node_modules');
    const targetNm = join(wtPath, 'node_modules');
    try {
      await stat(rootNm);
      await symlink(rootNm, targetNm, 'junction');
    } catch {
      // node_modules may not exist
    }

    // pnpm monorepo: symlink each package's node_modules
    const packagesDir = join(this.projectPath, 'packages');
    try {
      const pkgs = await readdir(packagesDir);
      for (const pkg of pkgs) {
        const pkgNm = join(packagesDir, pkg, 'node_modules');
        const wtPkgDir = join(wtPath, 'packages', pkg);
        const wtPkgNm = join(wtPkgDir, 'node_modules');
        try {
          await stat(pkgNm);
          await mkdir(wtPkgDir, { recursive: true });
          await symlink(pkgNm, wtPkgNm, 'junction');
        } catch {
          // Package may not have node_modules
        }
      }
    } catch {
      // Not a monorepo
    }
  }

  // ──────────────────────────────────────────────
  // Phase: Commit worktree changes
  // ──────────────────────────────────────────────

  async commitWorktree(wiId: string, message: string): Promise<boolean> {
    const info = this.worktrees.get(wiId);
    if (!info) throw new Error(`Worktree not found: ${wiId}`);

    const status = await this.git(['status', '--porcelain'], info.path);
    if (!status) return false; // nothing to commit

    await this.git(['add', '-A'], info.path);
    await this.git(['commit', '-m', message], info.path);
    return true;
  }

  // ──────────────────────────────────────────────
  // Phase: Merge
  // ──────────────────────────────────────────────

  async createMergeBranch(): Promise<void> {
    // Create merge branch from current base
    await this.git(['checkout', '-b', this.mergeBranch]);
  }

  async mergeWorkItem(wiId: string): Promise<MergeResult> {
    const info = this.worktrees.get(wiId);
    if (!info) throw new Error(`Worktree not found: ${wiId}`);

    try {
      await this.git(['merge', '--no-ff', '-m', `merge: ${wiId}`, info.branch]);
      return { success: true };
    } catch (err) {
      // Check if it's a merge conflict
      const status = await this.git(['status', '--porcelain']);
      const conflictFiles = status
        .split('\n')
        .filter(line => line.startsWith('UU') || line.startsWith('AA') || line.startsWith('DD'))
        .map(line => line.slice(3).trim());

      if (conflictFiles.length > 0) {
        return { success: false, conflictFiles };
      }
      // Non-conflict error — rethrow
      throw err;
    }
  }

  async resolveConflicts(files: string[]): Promise<void> {
    // Simple strategy: accept theirs (the WI branch wins)
    for (const file of files) {
      await this.git(['checkout', '--theirs', '--', file]);
    }
    await this.git(['add', ...files]);
    await this.git(['commit', '--no-edit']);
  }

  async abortMerge(): Promise<void> {
    try {
      await this.git(['merge', '--abort']);
    } catch {
      // May not be in merge state
    }
  }

  // ──────────────────────────────────────────────
  // Phase: Finalize
  // ──────────────────────────────────────────────

  async finalize(): Promise<void> {
    // Switch back to base branch and fast-forward merge
    await this.git(['checkout', this.baseBranch]);
    await this.git(['merge', '--ff-only', this.mergeBranch]);
  }

  // ──────────────────────────────────────────────
  // Phase: Cleanup
  // ──────────────────────────────────────────────

  async cleanup(): Promise<void> {
    // Remove all worktrees
    for (const [, info] of this.worktrees) {
      try {
        await this.git(['worktree', 'remove', '--force', info.path]);
      } catch {
        // Best-effort removal
      }
      try {
        await this.git(['branch', '-D', info.branch]);
      } catch {
        // Branch may already be deleted
      }
    }
    this.worktrees.clear();

    // Delete merge branch
    try {
      // Make sure we're on the base branch
      const currentBranch = await this.git(['rev-parse', '--abbrev-ref', 'HEAD']);
      if (currentBranch !== this.baseBranch) {
        await this.git(['checkout', this.baseBranch]);
      }
      await this.git(['branch', '-D', this.mergeBranch]);
    } catch {
      // Branch may not exist
    }

    // Remove .team directory
    try {
      await rm(this.teamDir, { recursive: true, force: true });
    } catch {
      // Best-effort removal
    }

    // Restore stash if we stashed
    if (this.stashed) {
      try {
        await this.git(['stash', 'pop']);
      } catch {
        console.warn(`[WorktreeManager] Failed to restore stash for session ${this.sessionId}`);
      }
      this.stashed = false;
    }

    // Remove .team/ from .gitignore if we added it
    if (this.gitignoreAppended) {
      try {
        const gitignorePath = join(this.projectPath, '.gitignore');
        const content = await readFile(gitignorePath, 'utf-8');
        const cleaned = content.replace(/\n\.team\/\n?/g, '\n').trimEnd() + '\n';
        await writeFile(gitignorePath, cleaned);
      } catch {
        // Best-effort cleanup
      }
    }
  }
}
