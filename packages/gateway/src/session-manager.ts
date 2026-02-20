import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { TaskStore, ContextStore, ContextService } from '@olympus-dev/core';

/**
 * Session represents an active CLI session (tmux dependency removed)
 */
export interface Session {
  id: string;
  name: string;  // Session name (e.g., "backend", "frontend", "main")
  chatId: number;
  taskId: string;
  status: 'active' | 'closed';
  projectPath: string;
  workspaceContextId?: string;
  projectContextId?: string;
  taskContextId?: string;
  createdAt: number;
  lastActivityAt: number;
}

export interface SessionContextLink {
  sessionId: string;
  workspaceContextId?: string;
  projectContextId?: string;
  taskContextId?: string;
}

export interface SessionManagerOptions {
  dataDir?: string;
  sessionTimeout?: number; // ms, <= 0 means no timeout (default: no timeout)
  onSessionEvent?: (sessionId: string, event: SessionEvent) => void;
  workspaceRoot?: string;
}

export type SessionEvent =
  | { type: 'screen'; content: string }   // Terminal snapshot diff (for Dashboard mirror)
  | { type: 'error'; error: string }
  | { type: 'closed' };

/**
 * Simple JSON file storage for sessions
 */
class SessionStore {
  private dbPath: string;
  private sessions: Map<string, Session> = new Map();

  constructor(dataDir: string) {
    this.dbPath = join(dataDir, 'sessions.json');
    this.load();
  }

  private load(): void {
    if (existsSync(this.dbPath)) {
      try {
        const data = JSON.parse(readFileSync(this.dbPath, 'utf-8'));
        this.sessions = new Map(Object.entries(data));
      } catch {
        this.sessions = new Map();
      }
    }
  }

  private save(): void {
    const data = Object.fromEntries(this.sessions);
    writeFileSync(this.dbPath, JSON.stringify(data, null, 2));
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  getByChatId(chatId: number): Session | undefined {
    for (const session of this.sessions.values()) {
      if (session.chatId === chatId && session.status === 'active') {
        return session;
      }
    }
    return undefined;
  }

  getAll(): Session[] {
    return [...this.sessions.values()];
  }

  set(session: Session): void {
    this.sessions.set(session.id, session);
    this.save();
  }

  delete(id: string): void {
    this.sessions.delete(id);
    this.save();
  }

  updateActivity(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.lastActivityAt = Date.now();
      this.save();
    }
  }
}

/**
 * SessionManager - Manages CLI sessions (tmux-free)
 */
export class SessionManager {
  private store: SessionStore;
  private sessionTimeout: number;
  private onSessionEvent?: (sessionId: string, event: SessionEvent) => void;
  private workspaceRoot: string;

  constructor(options: SessionManagerOptions = {}) {
    const dataDir = options.dataDir ?? join(homedir(), '.olympus');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    this.store = new SessionStore(dataDir);
    // Default behavior: no idle timeout. Set a positive value to enable timeout cleanup.
    this.sessionTimeout = options.sessionTimeout ?? 0;
    this.onSessionEvent = options.onSessionEvent;
    this.workspaceRoot = options.workspaceRoot ?? process.cwd();
  }

  /**
   * Create a new session record
   */
  async create(chatId: number, projectPath?: string, name?: string): Promise<Session> {
    const sessionName = name ?? 'main';

    // Check if session with same name exists for this chat
    const existingByName = this.getByName(chatId, sessionName);
    if (existingByName) {
      return existingByName;
    }

    const sessionId = randomUUID().slice(0, 8);
    const timestamp = Date.now();
    const workDir = projectPath ?? process.cwd();

    // Create root task for this session
    const taskStore = TaskStore.getInstance();
    const rootTask = taskStore.create({
      name: `Session: ${sessionName}`,
      context: `CLI session '${sessionName}' started for chat ${chatId}`,
      metadata: {
        source: 'cli',
        chatId,
        sessionId,
        sessionName,
      },
    }, 'session-manager');

    const session: Session = {
      id: sessionId,
      name: sessionName,
      chatId,
      taskId: rootTask.id,
      status: 'active',
      projectPath: workDir,
      createdAt: timestamp,
      lastActivityAt: timestamp,
    };

    this.ensureSessionContextLink(session);
    this.store.set(session);

    return session;
  }

  /**
   * Get session by ID
   */
  get(sessionId: string): Session | null {
    return this.store.get(sessionId) ?? null;
  }

  /**
   * Get session by chat ID
   */
  getByChatId(chatId: number): Session | null {
    return this.store.getByChatId(chatId) ?? null;
  }

  /**
   * Get all sessions
   */
  getAll(): Session[] {
    return this.store.getAll();
  }

  /**
   * Get session-context mapping information.
   */
  getSessionContextLink(sessionId: string): SessionContextLink | null {
    const session = this.store.get(sessionId);
    if (!session) return null;
    return {
      sessionId,
      workspaceContextId: session.workspaceContextId,
      projectContextId: session.projectContextId,
      taskContextId: session.taskContextId,
    };
  }

  /**
   * Get session by name for a specific chat
   */
  getByName(chatId: number, name: string): Session | null {
    for (const session of this.store.getAll()) {
      if (session.chatId === chatId && session.name === name && session.status === 'active') {
        return session;
      }
    }
    return null;
  }

  /**
   * Get all active sessions for a chat
   */
  getAllByChatId(chatId: number): Session[] {
    return this.store.getAll().filter(s => s.chatId === chatId && s.status === 'active');
  }

  /**
   * Close a session
   */
  closeSession(sessionId: string): boolean {
    const session = this.store.get(sessionId);
    if (!session) return false;

    // Update task status to archived (closed sessions)
    const taskStore = TaskStore.getInstance();
    try {
      taskStore.update(session.taskId, { status: 'archived' }, 'session-manager');
    } catch {
      // Task might already be deleted
    }

    // Delete session from store
    this.store.delete(sessionId);

    // Emit closed event
    this.onSessionEvent?.(sessionId, { type: 'closed' });

    return true;
  }

  /**
   * Reconcile sessions — clean up timed-out and closed sessions.
   * Returns true if any sessions were changed.
   */
  reconcileSessions(): boolean {
    const now = Date.now();
    let changed = false;

    // 1. Purge all closed sessions from store (compaction)
    const closedSessions = this.store.getAll().filter(s => s.status === 'closed');
    for (const closed of closedSessions) {
      this.store.delete(closed.id);
      changed = true;
    }

    // 2. Timeout cleanup for active sessions
    for (const session of this.store.getAll()) {
      if (session.status !== 'active') continue;

      if (this.sessionTimeout > 0 && now - session.lastActivityAt > this.sessionTimeout) {
        this.closeSession(session.id);
        changed = true;
      }
    }

    return changed;
  }

  /**
   * Cleanup old sessions (alias for reconcileSessions for backward compat)
   */
  cleanup(): number {
    const before = this.store.getAll().filter(s => s.status === 'active').length;
    this.reconcileSessions();
    const after = this.store.getAll().filter(s => s.status === 'active').length;
    return before - after;
  }

  /**
   * Get buffered outputs for a session (stub — streaming replaces polling)
   */
  getOutputBuffer(sessionId: string): Array<{ content: string; timestamp: number }> {
    return [];
  }

  /**
   * Ensure a session is linked to workspace/project/task contexts.
   */
  private ensureSessionContextLink(session: Session): void {
    try {
      const contextStore = ContextStore.getInstance();
      const workspace = contextStore.seedWorkspace(this.workspaceRoot);
      const project = contextStore.seedProject(this.workspaceRoot, session.projectPath);
      const taskPath = `${session.projectPath}#session:${session.id}`;

      let task = contextStore.getByPath('task', taskPath);
      if (!task) {
        task = contextStore.create({
          scope: 'task',
          path: taskPath,
          parentId: project.id,
          summary: `Session ${session.name}`,
          content: `Session ${session.id}`,
        }, 'session-manager');
      }

      session.workspaceContextId = workspace.id;
      session.projectContextId = project.id;
      session.taskContextId = task.id;
    } catch {
      // Non-fatal: session can operate without context mapping.
    }
  }
}
