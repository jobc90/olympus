import type { MergeResult, WorktreeInfo } from '../worktree-manager.js';
import { WorktreeManager as GitWorktreeManager } from '../worktree-manager.js';

export interface ProvisionEphemeralWorkspaceInput {
  projectPath: string;
  sessionId: string;
  taskId: string;
}

export interface MergeEphemeralWorkspaceInput {
  projectPath: string;
  sessionId: string;
  taskId: string;
  commitMessage: string;
}

type WorktreeManagerFactory = (projectPath: string, sessionId: string) => GitWorktreeManager;

export class ProjectRuntimeWorktreeManager {
  private readonly sessions = new Map<string, GitWorktreeManager>();

  constructor(private readonly createManager: WorktreeManagerFactory = (projectPath, sessionId) => new GitWorktreeManager(projectPath, sessionId)) {}

  async provisionEphemeralWorkspace(input: ProvisionEphemeralWorkspaceInput): Promise<WorktreeInfo> {
    const manager = await this.ensureSession(input.projectPath, input.sessionId);
    return manager.createWorktree(input.taskId);
  }

  async mergeEphemeralWorkspace(input: MergeEphemeralWorkspaceInput): Promise<MergeResult> {
    const manager = await this.ensureSession(input.projectPath, input.sessionId);
    await manager.commitWorktree(input.taskId, input.commitMessage);
    try {
      await manager.createMergeBranch();
    } catch {
      // merge branch may already exist for the session
    }
    return manager.mergeWorkItem(input.taskId);
  }

  async cleanupSession(projectPath: string, sessionId: string): Promise<void> {
    const key = this.getKey(projectPath, sessionId);
    const manager = this.sessions.get(key);
    if (!manager) return;
    await manager.cleanup();
    this.sessions.delete(key);
  }

  private async ensureSession(projectPath: string, sessionId: string): Promise<GitWorktreeManager> {
    const key = this.getKey(projectPath, sessionId);
    const existing = this.sessions.get(key);
    if (existing) {
      return existing;
    }

    const manager = this.createManager(projectPath, sessionId);
    await manager.initialize();
    this.sessions.set(key, manager);
    return manager;
  }

  private getKey(projectPath: string, sessionId: string): string {
    return `${projectPath}::${sessionId}`;
  }
}
