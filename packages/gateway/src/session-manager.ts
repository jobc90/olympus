import { randomUUID } from 'node:crypto';
import { execSync, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, statSync, openSync, readSync, closeSync } from 'node:fs';
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
  private logOffsets: Map<string, number> = new Map();
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

    // Clean up offset
    this.logOffsets.delete(sessionId);

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
      this.onSessionEvent?.(sessionId || '', {
        type: 'error',
        error: (err as Error).message
      });
      return false;
    }
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
   * Start polling for output changes using pipe-pane + file offset
   */
  private startOutputPolling(sessionId: string, _tmuxSession?: string, _tmuxWindow?: string): void {
    const session = this.store.get(sessionId);
    if (!session) return;

    const target = this.getTmuxTarget(session);
    const logPath = this.getLogPath(sessionId);

    // Start pipe-pane to log output to file
    try {
      execFileSync('tmux', ['pipe-pane', '-t', target, '-o', `cat >> "${logPath}"`], { stdio: 'pipe' });
    } catch (err) {
      this.onSessionEvent?.(sessionId, { type: 'error', error: `Failed to start pipe-pane: ${(err as Error).message}` });
      return;
    }

    // Poll every 500ms for new output
    const poller = setInterval(() => {
      try {
        const stats = statSync(logPath);
        const fileSize = stats.size;
        let offset = this.logOffsets.get(sessionId) ?? 0;

        // If file size < offset, reset offset (resync)
        if (fileSize < offset) {
          offset = 0;
          this.logOffsets.set(sessionId, 0);
        }

        // If no new content, skip
        if (fileSize === offset) return;

        // Read only new content from offset (efficient for large files)
        const bytesToRead = fileSize - offset;
        const buffer = Buffer.alloc(bytesToRead);
        const fd = openSync(logPath, 'r');
        try {
          readSync(fd, buffer, 0, bytesToRead, offset);
        } finally {
          closeSync(fd);
        }
        const newContent = buffer.toString('utf-8');

        // Filter noise (don't update offset yet — throttle may defer)
        const filtered = this.filterOutput(newContent);
        if (!filtered || !filtered.trim()) {
          // Only noise — advance offset since we don't need this content
          this.logOffsets.set(sessionId, fileSize);
          return;
        }

        // Anti-spam: skip if change is too small (but still advance offset)
        if (filtered.trim().length < SessionManager.OUTPUT_MIN_CHANGE) {
          this.logOffsets.set(sessionId, fileSize);
          return;
        }

        // If debounce timer exists, accumulate content (don't send yet)
        // Clear existing timer so we batch with new content
        const existingTimer = this.outputDebounceTimers.get(sessionId);
        if (existingTimer) {
          clearTimeout(existingTimer);
          this.outputDebounceTimers.delete(sessionId);
        }

        // Advance offset now — content is buffered in debounce closure
        this.logOffsets.set(sessionId, fileSize);

        // Set debounce timer — wait for output to stabilize before sending
        const capturedFiltered = filtered;
        const timer = setTimeout(() => {
          // Anti-spam: throttle check at send time
          const now = Date.now();
          const lastSentTime = this.lastSentTimestamps.get(sessionId) ?? 0;
          const elapsed = now - lastSentTime;

          if (elapsed < SessionManager.OUTPUT_MIN_INTERVAL) {
            // Re-schedule after remaining interval
            const retryTimer = setTimeout(() => {
              this.lastSentTimestamps.set(sessionId, Date.now());
              this.bufferOutput(sessionId, capturedFiltered);
              this.onSessionEvent?.(sessionId, { type: 'output', content: capturedFiltered });
              this.updateSessionContext(sessionId, capturedFiltered);
              this.outputDebounceTimers.delete(sessionId);
            }, SessionManager.OUTPUT_MIN_INTERVAL - elapsed);
            this.outputDebounceTimers.set(sessionId, retryTimer);
            return;
          }

          this.lastSentTimestamps.set(sessionId, Date.now());
          this.bufferOutput(sessionId, capturedFiltered);
          this.onSessionEvent?.(sessionId, { type: 'output', content: capturedFiltered });
          this.updateSessionContext(sessionId, capturedFiltered);
          this.outputDebounceTimers.delete(sessionId);
        }, SessionManager.OUTPUT_DEBOUNCE_MS);

        this.outputDebounceTimers.set(sessionId, timer);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          // Log file doesn't exist yet, ignore
          return;
        }
        // Session might have died
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
    return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\][^\x07]*\x07/g, '')  // OSC sequences
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b[()][AB012]/g, '')       // Character set selection
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[\?]?[0-9;]*[hlm]/g, ''); // Mode set/reset
  }

  /**
   * Filter out Claude Code banner, user typing, status bar, and other noise from output.
   * Only real Claude AI output should pass through to avoid Telegram spam.
   */
  private filterOutput(content: string): string {
    // Strip ANSI escape codes first
    const cleaned = this.stripAnsi(content);
    const lines = cleaned.split('\n');
    const filtered: string[] = [];
    let lastLineWasEmpty = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip Claude Code banner patterns
      if (line.includes('▐▛███▜▌') || line.includes('▝▜█████▛▘') || line.includes('▘▘ ▝▝')) continue;
      if (line.includes('Claude Code v')) continue;
      if (/Opus \d|Sonnet \d|Haiku \d/.test(line) && line.includes('Claude')) continue;

      // Skip horizontal dividers (long lines of ─ or ━)
      if (/^[─━]{20,}$/.test(trimmed)) continue;

      // Skip "Try" suggestions
      if (line.includes('Try "write a test') || line.includes('Try "explain')) continue;

      // Skip user prompt lines (❯ with optional typed text = user is typing)
      if (/^[\s]*❯/.test(line)) continue;

      // Skip status bar lines (update frequently with token counts, cost, model info)
      if (line.includes('🤖') || line.includes('📁') || line.includes('🔷') || line.includes('💎')) continue;
      if (/\d+[kK]?\s*tokens?/i.test(line) && /\$[\d.]+/.test(line)) continue;

      // Skip Claude Code spinner/progress indicators (braille pattern chars)
      if (/^[\s]*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(line)) continue;

      // Skip Claude Code "Thinking..." / "Working..." UI lines (exact match only, not content starting with these words)
      if (/^(Thinking|Working|Reading|Writing|Searching|Running)\.\.\.$/i.test(trimmed)) continue;

      // Skip consecutive empty lines (but allow single empty lines for formatting)
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
