import { randomUUID } from 'node:crypto';
import { execSync, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { TaskStore, ContextStore, ContextService } from '@olympus-dev/core';

/**
 * Session represents an active Claude CLI tmux session
 */
export interface Session {
  id: string;
  name: string;  // Session name (e.g., "backend", "frontend", "main")
  chatId: number;
  taskId: string;
  tmuxSession: string;
  tmuxWindow?: string;  // Window name within tmux session (for multi-window mode)
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
}

export type SessionEvent =
  | { type: 'output'; content: string }
  | { type: 'error'; error: string }
  | { type: 'closed' };

/**
 * Simple SQLite-like JSON file storage for sessions
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
 * SessionManager - Manages Claude CLI tmux sessions
 */
export class SessionManager {
  private store: SessionStore;
  private sessionTimeout: number;
  private onSessionEvent?: (sessionId: string, event: SessionEvent) => void;
  private outputPollers: Map<string, NodeJS.Timeout> = new Map();
  private outputDebounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private lastSentTimestamps: Map<string, number> = new Map(); // Anti-spam: last sent time per session
  private workspaceRoot: string;
  private outputLogDir: string;
  private logOffsets: Map<string, number> = new Map();  // kept for worker log file offsets
  private lastCapturedContent: Map<string, string> = new Map();
  // Per-session output ring buffer for replay on subscribe (last N outputs)
  private outputBuffers: Map<string, Array<{ content: string; timestamp: number }>> = new Map();
  private static readonly OUTPUT_BUFFER_SIZE = 20;

  // Minimum interval between output events (ms) - prevents keystroke spam
  private static readonly OUTPUT_MIN_INTERVAL = 2000;
  // Minimum content change (chars) to trigger notification
  private static readonly OUTPUT_MIN_CHANGE = 5;
  // Debounce wait time after output stabilizes (ms)
  private static readonly OUTPUT_DEBOUNCE_MS = 1000;

  constructor(options: SessionManagerOptions = {}) {
    const dataDir = options.dataDir ?? join(homedir(), '.olympus');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    this.outputLogDir = join(tmpdir(), 'olympus-logs');
    if (!existsSync(this.outputLogDir)) {
      mkdirSync(this.outputLogDir, { recursive: true, mode: 0o700 });
    }

    this.store = new SessionStore(dataDir);
    // Default behavior: no idle timeout. Set a positive value to enable timeout cleanup.
    this.sessionTimeout = options.sessionTimeout ?? 0;
    this.onSessionEvent = options.onSessionEvent;
    this.workspaceRoot = process.cwd();

    // Restart output polling for active sessions
    for (const session of this.store.getAll()) {
      if (session.status === 'active') {
        // Check if window is alive (for multi-window mode)
        if (this.isTmuxWindowAlive(session.tmuxSession, session.tmuxWindow)) {
          this.startOutputPolling(session.id, session.tmuxSession, session.tmuxWindow);
        } else {
          // Session died while we were offline
          this.closeSession(session.id);
        }
      }
    }
  }

  /**
   * Discover all olympus-* tmux sessions created by `olympus start`
   * Returns array of { tmuxSession, projectPath }
   */
  discoverTmuxSessions(): Array<{ tmuxSession: string; projectPath: string }> {
    try {
      // List all tmux sessions and filter for olympus-*
      const output = execSync('tmux list-sessions -F "#{session_name}:#{session_path}" 2>/dev/null', {
        encoding: 'utf-8',
      });

      const sessions: Array<{ tmuxSession: string; projectPath: string }> = [];
      for (const line of output.trim().split('\n')) {
        if (!line) continue;
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;
        const sessionName = line.slice(0, colonIdx);
        const sessionPath = line.slice(colonIdx + 1);
        if (sessionName.startsWith('olympus-') || sessionName === 'olympus') {
          sessions.push({
            tmuxSession: sessionName,
            projectPath: sessionPath || process.cwd(),
          });
        }
      }
      return sessions;
    } catch {
      return [];
    }
  }

  /**
   * Get session by tmux session name
   */
  getByTmuxSession(tmuxSession: string): Session | null {
    for (const session of this.store.getAll()) {
      if (session.tmuxSession === tmuxSession && session.status === 'active') {
        return session;
      }
    }
    return null;
  }

  /**
   * Connect Telegram chat to an existing tmux session
   * This is used when user selects a session from the list
   */
  async connectToTmuxSession(chatId: number, tmuxSession: string): Promise<Session> {
    // Check if already connected
    const existing = this.getByTmuxSession(tmuxSession);
    if (existing && existing.status === 'active') {
      // Update chatId if different (reconnecting from different chat)
      if (existing.chatId !== chatId) {
        existing.chatId = chatId;
        this.store.set(existing);
      }
      // Ensure polling is running (might have stopped after server restart)
      if (!this.outputPollers.has(existing.id)) {
        this.startOutputPolling(existing.id, existing.tmuxSession);
      }
      this.ensureSessionContextLink(existing);
      this.store.set(existing);
      return existing;
    }

    // Check if tmux session is alive
    if (!this.isTmuxSessionAlive(tmuxSession)) {
      throw new Error(`Tmux session '${tmuxSession}' not found`);
    }

    // Get session path from tmux
    let workDir = process.cwd();
    try {
      workDir = execFileSync('tmux', ['display-message', '-t', tmuxSession, '-p', '#{pane_current_path}'], {
        encoding: 'utf-8',
      }).trim();
    } catch {
      // Fallback to cwd
    }

    const sessionId = randomUUID().slice(0, 8);
    const timestamp = Date.now();

    // Create task for tracking
    const taskStore = TaskStore.getInstance();
    const rootTask = taskStore.create({
      name: `Connected Session: ${tmuxSession}`,
      context: `Telegram chat ${chatId} connected to tmux session ${tmuxSession}`,
      metadata: {
        source: 'telegram',
        chatId,
        sessionId,
        tmuxSession,
      },
    }, 'telegram-bot');

    const session: Session = {
      id: sessionId,
      name: tmuxSession, // Use tmux session name as the session name
      chatId,
      taskId: rootTask.id,
      tmuxSession,
      status: 'active',
      projectPath: workDir,
      createdAt: timestamp,
      lastActivityAt: timestamp,
    };

    this.ensureSessionContextLink(session);
    this.store.set(session);
    this.startOutputPolling(sessionId, tmuxSession);

    return session;
  }

  /**
   * Create a new Claude CLI session
   * If connecting to existing tmux session, just link it
   */
  async create(chatId: number, projectPath?: string, name?: string): Promise<Session> {
    const sessionName = name ?? 'main';

    // Check if session with same name exists for this chat
    const existingByName = this.getByName(chatId, sessionName);
    if (existingByName && this.isTmuxSessionAlive(existingByName.tmuxSession)) {
      return existingByName;
    }
    if (existingByName) {
      // Clean up dead session
      this.store.delete(existingByName.id);
    }

    const sessionId = randomUUID().slice(0, 8);
    const timestamp = Date.now();
    const workDir = projectPath ?? process.cwd();

    // For Telegram-created sessions: create unique tmux session
    const tmuxSession = `olympus-telegram-${sessionId}`;

    // Get claude absolute path
    let claudePath = 'claude';
    try {
      claudePath = execFileSync('which', ['claude'], { encoding: 'utf-8' }).trim();
    } catch {
      // Fall back to 'claude' if which fails
    }

    // Create root task for this session
    const taskStore = TaskStore.getInstance();
    const rootTask = taskStore.create({
      name: `Telegram Chat Session: ${sessionName}`,
      context: `Claude CLI session '${sessionName}' started from Telegram chat ${chatId}`,
      metadata: {
        source: 'telegram',
        chatId,
        sessionId,
        sessionName,
        tmuxSession,
      },
    }, 'telegram-bot');

    try {
      // Create new tmux session with Claude CLI
      execFileSync('tmux', ['new-session', '-d', '-s', tmuxSession, '-c', workDir, claudePath], {
        stdio: 'pipe',
      });
      // Enable extended-keys for Shift+Enter passthrough (Ghostty/Kitty protocol)
      try {
        execFileSync('tmux', ['set', '-t', tmuxSession, 'extended-keys', 'always'], { stdio: 'pipe' });
      } catch { /* tmux < 3.2 */ }
    } catch (err) {
      // Clean up task if tmux fails
      taskStore.delete(rootTask.id);
      throw new Error(`Failed to create tmux session: ${(err as Error).message}`);
    }

    const session: Session = {
      id: sessionId,
      name: sessionName,
      chatId,
      taskId: rootTask.id,
      tmuxSession,
      status: 'active',
      projectPath: workDir,
      createdAt: timestamp,
      lastActivityAt: timestamp,
    };

    this.ensureSessionContextLink(session);
    this.store.set(session);
    this.startOutputPolling(sessionId, tmuxSession);

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

    // Stop output polling
    const poller = this.outputPollers.get(sessionId);
    if (poller) {
      clearInterval(poller);
      this.outputPollers.delete(sessionId);
    }

    // Stop pipe-pane
    const target = this.getTmuxTarget(session);
    if (this.validateTmuxTarget(target)) {
      try {
        execFileSync('tmux', ['pipe-pane', '-t', target], { stdio: 'pipe' });
      } catch {
        // Ignore if already stopped
      }
    }

    // Clean up log file
    const logPath = this.getLogPath(sessionId);
    try {
      unlinkSync(logPath);
    } catch {
      // Ignore if file doesn't exist
    }

    // Clean up offset and captured content
    this.logOffsets.delete(sessionId);
    this.lastCapturedContent.delete(sessionId);

    // Clear debounce timer
    const debounceTimer = this.outputDebounceTimers.get(sessionId);
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      this.outputDebounceTimers.delete(sessionId);
    }
    this.lastSentTimestamps.delete(sessionId);
    this.outputBuffers.delete(sessionId);

    // Kill tmux window (not entire session) if alive
    if (session.tmuxWindow && this.isTmuxWindowAlive(session.tmuxSession, session.tmuxWindow)) {
      try {
        // Kill just the window, not the entire session
        execFileSync('tmux', ['kill-window', '-t', `${session.tmuxSession}:${session.tmuxWindow}`], { stdio: 'pipe' });
      } catch {
        // Ignore if already dead
      }
    } else if (!session.tmuxWindow && this.isTmuxSessionAlive(session.tmuxSession)) {
      // Legacy: kill entire session if no window specified
      try {
        execFileSync('tmux', ['kill-session', '-t', session.tmuxSession], { stdio: 'pipe' });
      } catch {
        // Ignore if already dead
      }
    }

    // Update task status to archived (closed sessions)
    const taskStore = TaskStore.getInstance();
    try {
      taskStore.update(session.taskId, { status: 'archived' }, 'session-manager');
    } catch {
      // Task might already be deleted
    }

    // Delete session from store (no more accumulating closed records)
    this.store.delete(sessionId);

    // Emit closed event
    this.onSessionEvent?.(sessionId, { type: 'closed' });

    return true;
  }

  /**
   * Send input to Claude CLI via tmux send-keys with -l (literal) option
   */
  sendInput(sessionId: string, input: string): boolean {
    const session = this.store.get(sessionId);
    if (!session || session.status !== 'active') return false;

    // Check if window is alive (for multi-window mode)
    if (!this.isTmuxWindowAlive(session.tmuxSession, session.tmuxWindow)) {
      this.closeSession(sessionId);
      return false;
    }

    const target = this.getTmuxTarget(session);
    if (!this.validateTmuxTarget(target)) {
      this.onSessionEvent?.(sessionId, { type: 'error', error: 'Invalid tmux target name' });
      return false;
    }

    // No sanitization needed — execFileSync + send-keys -l handles safety
    const success = this.sendKeys(input, target, sessionId);

    if (success) {
      this.store.updateActivity(sessionId);
    }

    return success;
  }

  /**
   * Send keys to tmux target with literal mode
   */
  private sendKeys(keys: string, tmuxTarget: string, sessionId?: string): boolean {
    const MAX_RETRIES = 2;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Use execFileSync to avoid shell interpolation
        execFileSync('tmux', ['send-keys', '-t', tmuxTarget, '-l', keys], {
          stdio: 'pipe',
        });
        execFileSync('tmux', ['send-keys', '-t', tmuxTarget, 'Enter'], {
          stdio: 'pipe',
        });
        return true;
      } catch (err) {
        const errMsg = (err as Error).message;
        // "no current client" is a transient tmux issue — retry after brief delay
        if (errMsg.includes('no current client') && attempt < MAX_RETRIES) {
          try { execFileSync('sleep', ['0.3'], { stdio: 'pipe' }); } catch { /* ignore */ }
          continue;
        }
        this.onSessionEvent?.(sessionId || '', {
          type: 'error',
          error: errMsg,
        });
        return false;
      }
    }
    return false;
  }

  /**
   * Capture current output from tmux
   */
  captureOutput(sessionId: string, lines: number = 100): string | null {
    const session = this.store.get(sessionId);
    if (!session) return null;

    // Check if window is alive
    if (!this.isTmuxWindowAlive(session.tmuxSession, session.tmuxWindow)) {
      this.closeSession(sessionId);
      return null;
    }

    try {
      const target = this.getTmuxTarget(session);
      const output = execFileSync('tmux', ['capture-pane', '-t', target, '-p', '-S', `-${lines}`], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return output;
    } catch {
      return null;
    }
  }

  /**
   * Reconcile sessions with actual tmux state.
   * - Closes sessions whose tmux has died
   * - Auto-registers newly discovered tmux sessions (chatId=0)
   * - Optionally cleans up timed-out sessions
   * Returns true if any sessions were changed (useful for triggering broadcasts).
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

    // 2. Close dead active sessions
    for (const session of this.store.getAll()) {
      if (session.status !== 'active') continue;

      // Optional timeout cleanup
      if (this.sessionTimeout > 0 && now - session.lastActivityAt > this.sessionTimeout) {
        this.closeSession(session.id);
        changed = true;
        continue;
      }

      // Check if tmux window/session is still alive
      if (!this.isTmuxWindowAlive(session.tmuxSession, session.tmuxWindow)) {
        this.closeSession(session.id);
        changed = true;
      }
    }

    // 3. Auto-register discovered tmux sessions that aren't in the store
    const discovered = this.discoverTmuxSessions();
    const registeredTmux = new Set(
      this.store.getAll().filter(s => s.status === 'active').map(s => s.tmuxSession)
    );

    for (const tmux of discovered) {
      if (registeredTmux.has(tmux.tmuxSession)) continue;

      // Auto-register with chatId=0 (unowned, any client can claim)
      const sessionId = randomUUID().slice(0, 8);
      const timestamp = Date.now();

      const session: Session = {
        id: sessionId,
        name: tmux.tmuxSession,
        chatId: 0,
        taskId: '',
        tmuxSession: tmux.tmuxSession,
        status: 'active',
        projectPath: tmux.projectPath,
        createdAt: timestamp,
        lastActivityAt: timestamp,
      };

      this.store.set(session);
      this.startOutputPolling(sessionId, tmux.tmuxSession);
      changed = true;
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
   * Validate tmux target name
   */
  private validateTmuxTarget(target: string): boolean {
    // Allowlist: only alphanumeric, dash, underscore, colon (for session:window)
    return /^[a-zA-Z0-9_:-]+$/.test(target);
  }

  /**
   * Check if tmux session is alive
   */
  private isTmuxSessionAlive(tmuxSession: string): boolean {
    try {
      execFileSync('tmux', ['has-session', '-t', tmuxSession], { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if tmux window is alive within a session
   */
  private isTmuxWindowAlive(tmuxSession: string, windowName?: string): boolean {
    if (!windowName) return this.isTmuxSessionAlive(tmuxSession);
    try {
      const output = execFileSync('tmux', ['list-windows', '-t', tmuxSession, '-F', '#{window_name}'], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return output.split('\n').some(line => line.trim() === windowName);
    } catch {
      return false;
    }
  }

  /**
   * Get tmux target for a session (session:window format)
   */
  private getTmuxTarget(session: Session): string {
    if (session.tmuxWindow) {
      return `${session.tmuxSession}:${session.tmuxWindow}`;
    }
    return session.tmuxSession;
  }

  /**
   * Get log file path for a session
   */
  private getLogPath(sessionId: string): string {
    return join(this.outputLogDir, `session-${sessionId}.log`);
  }

  /**
   * Start polling for output changes using capture-pane (rendered screen content).
   * Unlike pipe-pane which captures raw PTY bytes (ANSI/cursor codes),
   * capture-pane returns the rendered text as displayed on screen.
   */
  private startOutputPolling(sessionId: string, _tmuxSession?: string, _tmuxWindow?: string): void {
    const session = this.store.get(sessionId);
    if (!session) return;

    const target = this.getTmuxTarget(session);

    // Store the last captured content to detect changes (diff-based)
    this.lastCapturedContent.set(sessionId, '');

    // Poll every 500ms for new output via capture-pane
    const poller = setInterval(() => {
      try {
        // capture-pane -p: print to stdout (rendered screen, no ANSI codes)
        // -S -50: last 50 lines of scrollback
        const captured = execFileSync('tmux', ['capture-pane', '-t', target, '-p', '-S', '-50'], {
          encoding: 'utf-8',
          timeout: 3000,
        });

        const previousCapture = this.lastCapturedContent.get(sessionId) ?? '';

        // Filter noise from the captured content
        const filtered = this.filterOutput(captured);
        if (!filtered || !filtered.trim()) {
          this.lastCapturedContent.set(sessionId, captured);
          return;
        }

        // Compare with previous capture to detect new content
        const previousFiltered = this.filterOutput(previousCapture);
        if (filtered === previousFiltered) {
          return; // No change
        }

        // Find new lines (lines in current but not in previous)
        const prevLines = new Set((previousFiltered || '').split('\n').map(l => l.trim()).filter(Boolean));
        const currentLines = filtered.split('\n').map(l => l.trim()).filter(Boolean);
        const newLines = currentLines.filter(l => !prevLines.has(l));

        if (newLines.length === 0) {
          this.lastCapturedContent.set(sessionId, captured);
          return;
        }

        const newContent = newLines.join('\n');

        // Anti-spam: skip if change is too small
        if (newContent.trim().length < SessionManager.OUTPUT_MIN_CHANGE) {
          this.lastCapturedContent.set(sessionId, captured);
          return;
        }

        // Update stored capture
        this.lastCapturedContent.set(sessionId, captured);

        // Clear existing debounce timer
        const existingTimer = this.outputDebounceTimers.get(sessionId);
        if (existingTimer) {
          clearTimeout(existingTimer);
          this.outputDebounceTimers.delete(sessionId);
        }

        // Set debounce timer — wait for output to stabilize before sending
        const capturedNewContent = newContent;
        const timer = setTimeout(() => {
          // Anti-spam: throttle check at send time
          const now = Date.now();
          const lastSentTime = this.lastSentTimestamps.get(sessionId) ?? 0;
          const elapsed = now - lastSentTime;

          if (elapsed < SessionManager.OUTPUT_MIN_INTERVAL) {
            const retryTimer = setTimeout(() => {
              this.lastSentTimestamps.set(sessionId, Date.now());
              this.bufferOutput(sessionId, capturedNewContent);
              this.onSessionEvent?.(sessionId, { type: 'output', content: capturedNewContent });
              this.updateSessionContext(sessionId, capturedNewContent);
              this.outputDebounceTimers.delete(sessionId);
            }, SessionManager.OUTPUT_MIN_INTERVAL - elapsed);
            this.outputDebounceTimers.set(sessionId, retryTimer);
            return;
          }

          this.lastSentTimestamps.set(sessionId, Date.now());
          this.bufferOutput(sessionId, capturedNewContent);
          this.onSessionEvent?.(sessionId, { type: 'output', content: capturedNewContent });
          this.updateSessionContext(sessionId, capturedNewContent);
          this.outputDebounceTimers.delete(sessionId);
        }, SessionManager.OUTPUT_DEBOUNCE_MS);

        this.outputDebounceTimers.set(sessionId, timer);
      } catch (err) {
        // tmux session might have died
        if ((err as Error).message?.includes('no current')) {
          return; // Session not ready yet
        }
        const errCode = (err as NodeJS.ErrnoException).code;
        if (errCode === 'ETIMEDOUT') return; // capture-pane timed out, retry next cycle
        this.closeSession(sessionId);
      }
    }, 500);

    this.outputPollers.set(sessionId, poller);
  }

  /**
   * Update session's task context with latest output summary
   */
  private updateSessionContext(sessionId: string, newContent: string): void {
    const session = this.store.get(sessionId);
    if (!session?.taskContextId) return;

    try {
      const contextService = ContextService.getInstance({ autoReportPolicy: 'on-threshold', autoReportThreshold: 500 });
      const context = contextService.getById(session.taskContextId);
      if (!context) return;

      // Append new output to context content (keep last 2000 chars)
      const existing = context.content ?? '';
      const updated = (existing + '\n' + newContent).slice(-2000);

      contextService.update(session.taskContextId, {
        content: updated,
        summary: `Session ${session.name}: ${newContent.slice(0, 100)}`,
        expectedVersion: context.version,
      }, 'session-manager');
    } catch {
      // Non-fatal: context update failure shouldn't affect session
    }
  }

  /**
   * Buffer output for replay on subscribe
   */
  private bufferOutput(sessionId: string, content: string): void {
    let buffer = this.outputBuffers.get(sessionId);
    if (!buffer) {
      buffer = [];
      this.outputBuffers.set(sessionId, buffer);
    }
    buffer.push({ content, timestamp: Date.now() });
    if (buffer.length > SessionManager.OUTPUT_BUFFER_SIZE) {
      buffer.shift();
    }
  }

  /**
   * Get buffered outputs for a session (for replay on subscribe)
   */
  getOutputBuffer(sessionId: string): Array<{ content: string; timestamp: number }> {
    return this.outputBuffers.get(sessionId) ?? [];
  }

  /**
   * Strip ANSI escape sequences from text
   */
  private stripAnsi(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, ' ')  // CSI sequences → space (preserve word boundaries)
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\][^\x07]*\x07/g, '')  // OSC sequences
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b[()][AB012]/g, '')       // Character set selection
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[\?]?[0-9;]*[hlm]/g, '') // Mode set/reset
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b[=>]/g, '')              // Keypad mode sequences
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[\??\d*[;]?\d*[A-Za-z]/g, '') // Catch remaining CSI
      .replace(/\s{2,}/g, ' ');              // Collapse multiple spaces from replacements
  }

  /**
   * Filter out Claude Code UI noise from output.
   * Uses allowlist-first approach: known Claude response markers pass immediately,
   * then blocklist removes known noise patterns.
   */
  private filterOutput(content: string): string {
    // Strip ANSI escape codes and control characters first
    let cleaned = this.stripAnsi(content);
    // eslint-disable-next-line no-control-regex
    cleaned = cleaned.replace(/[\x00-\x08\x0e-\x1f]/g, '');
    cleaned = cleaned.replace(/\r/g, '');

    const lines = cleaned.split('\n');
    const filtered: string[] = [];
    let lastLineWasEmpty = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // === ALLOWLIST (pass immediately) ===

      // Claude response lines (⏺ prefix = AI output or tool call)
      if (/^\s*⏺/.test(line)) {
        // Strip the ⏺ prefix and trailing tool UI noise for cleaner output
        const responseText = trimmed.replace(/^⏺\s*/, '');
        if (responseText.length > 0) {
          filtered.push(responseText);
          lastLineWasEmpty = false;
          continue;
        }
      }

      // Tool result lines (⎿ prefix)
      if (/^\s*⎿/.test(line)) {
        const resultText = trimmed.replace(/^⎿\s*/, '');
        if (resultText.length > 0) {
          filtered.push('  ' + resultText);
          lastLineWasEmpty = false;
          continue;
        }
      }

      // === BLOCKLIST (noise removal) ===

      // Claude Code banner patterns (with or without spaces from ANSI stripping)
      if (line.includes('▐▛███▜▌') || line.includes('▝▜█████▛▘')) continue;
      if (/▘▘\s*▝▝/.test(line)) continue;
      if (line.includes('Claude Code v') || line.includes('ClaudeCodev')) continue;
      if (/Opus \d|Sonnet \d|Haiku \d/.test(line)) continue;
      // Claude Code notification messages
      if (/claude\s*install/i.test(line) || /switched.*installer/i.test(line)) continue;
      if (/native\s*installer/i.test(line)) continue;

      // Horizontal dividers (long lines of ─ or ━)
      if (/^[─━]{20,}$/.test(trimmed)) continue;

      // "Try" suggestions
      if (line.includes('Try "write a test') || line.includes('Try "explain')) continue;

      // User prompt lines (❯ prefix)
      if (/^[\s]*❯/.test(line)) continue;

      // New-format status bar (pipe-delimited with emojis: 🤖Opus│...│, 📁project│...)
      if (/🤖.*│/.test(line) || /📁.*│/.test(line)) continue;
      if (/🔷.*│/.test(line) || /💎.*│/.test(line)) continue;
      // Status bar with speed/time/todo indicators (🔥 9.7K/min │ ⏱ 5분 │ 할일: -)
      if (/🔥.*│/.test(line) || /⏱.*│/.test(line)) continue;
      // Generic pipe-delimited status bar (3+ pipe segments)
      if ((line.match(/│/g)?.length ?? 0) >= 3) continue;
      // Model names as status indicators (with or without emoji prefix)
      if (/(?:gemini|gpt|claude|sonnet|opus|haiku|o[1-9])-[\w.-]+│/i.test(line)) continue;
      // Legacy status bar (space-separated)
      if (/\d+[kK]?\s*tokens?/i.test(line) && /\$[\d.]+/.test(line)) continue;
      // Time/cost status lines (e.g., "(5시간3분)" or "(23시간59분)")
      if (/^\s*\(\d+시간\d+분\)\s*$/.test(trimmed)) continue;

      // New-format spinner/progress (star/dot chars + short status text)
      if (/^[\s]*[✶✳✢✻✽·]/.test(line)) continue;
      // Lines containing spinner glyphs mixed with text (broken ANSI artifacts)
      if (/[✶✳✢✻✽⏺]/.test(line) && (line.match(/[✶✳✢✻✽·⏺]/g)?.length ?? 0) >= 2) continue;
      // Legacy braille spinner
      if (/^[\s]*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(line)) continue;

      // Thinking indicator lines (Claude CLI thinking animation)
      if (/\(thinking\)/i.test(line)) continue;

      // Progress status lines (exact match: "Thinking...", "Harmonizing...", etc.)
      if (/^[\s]*(Thinking|Working|Reading|Writing|Searching|Running|Harmonizing|Schlepping)\.{2,}$/i.test(trimmed)) continue;

      // Permission bypass prompt
      if (/^[\s]*⏵/.test(line)) continue;

      // Context/compact notification lines
      if (/Context left until auto-compact/i.test(line)) continue;

      // Lines that are only whitespace + box-drawing or block chars
      if (/^[\s░▒▓█▄▀│├└┘┐┌─━▘▝▖▗▚▐▛▜▟]+$/.test(trimmed)) continue;

      // Partial/broken escape sequences leftover from incomplete ANSI stripping
      if (/^\s*\[<[a-z]?\s*$/.test(trimmed)) continue;

      // Mostly non-ASCII control artifacts (very short lines with no alphanumeric)
      if (trimmed.length > 0 && trimmed.length <= 3 && !/[a-zA-Z0-9가-힣]/.test(trimmed)) continue;

      // Standalone numbers (token counts, costs, line numbers leaking from status bar)
      if (/^\s*[\d,.]+[kKmM]?\s*$/.test(trimmed)) continue;

      // Consecutive empty lines (keep max 1)
      if (!trimmed) {
        if (lastLineWasEmpty) continue;
        lastLineWasEmpty = true;
      } else {
        lastLineWasEmpty = false;
      }

      filtered.push(line);
    }

    return filtered.join('\n').trim();
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
          content: `Session ${session.id} linked to tmux ${session.tmuxSession}`,
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
