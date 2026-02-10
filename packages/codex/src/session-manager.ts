import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { OutputMonitor } from './output-monitor.js';
import type { ManagedSession, SessionManagerConfig, SessionStatus } from './types.js';
import { SESSION_CONSTANTS } from './types.js';

/**
 * CodexSessionManager — 다중 tmux 세션 관리
 *
 * Gateway SessionManager와 차이:
 * - Gateway: chatId 기반 (Telegram 전용), 2-state (active/closed)
 * - Codex:   projectPath 기반, 6-state lifecycle, OutputMonitor 내장
 *
 * 세션 생명주기:
 * starting → ready ↔ busy ↔ idle → closed
 *                          ↓
 *                        error → closed
 *
 * Events:
 * - 'session:screen'       — 세션에서 필터링된 출력 도착
 * - 'session:status'       — 세션 상태 변경
 * - 'session:command-sent'  — 명령 전송 완료
 */
export class CodexSessionManager extends EventEmitter {
  private sessions: Map<string, ManagedSession> = new Map();
  private monitors: Map<string, OutputMonitor> = new Map();
  private outputLogDir: string;

  constructor(private config: SessionManagerConfig = {}) {
    super();
    this.outputLogDir = config.outputLogDir ?? join(tmpdir(), 'olympus-codex-logs');
    mkdirSync(this.outputLogDir, { recursive: true, mode: 0o700 });
  }

  /**
   * 세션 생성 — Claude CLI를 tmux 세션에서 시작
   */
  async createSession(projectPath: string, name?: string): Promise<ManagedSession> {
    const maxSessions = this.config.maxSessions ?? 5;
    const activeSessions = this.getActiveSessions();
    if (activeSessions.length >= maxSessions) {
      throw new Error(`최대 세션 수 초과 (${maxSessions})`);
    }

    const sessionName = name ?? `olympus-${basename(projectPath)}`;
    const sessionId = randomUUID().slice(0, 8);

    // Find Claude CLI
    let claudePath = 'claude';
    try {
      claudePath = execFileSync('which', ['claude'], { encoding: 'utf-8' }).trim();
    } catch { /* fallback to 'claude' */ }

    // Create tmux session
    execFileSync('tmux', [
      'new-session', '-d',
      '-s', sessionName,
      '-c', projectPath,
      claudePath,
    ], { stdio: 'pipe' });

    // Enable extended-keys (tmux >= 3.2)
    try {
      execFileSync('tmux', ['set', '-t', sessionName, 'extended-keys', 'always'], { stdio: 'pipe' });
    } catch { /* tmux < 3.2 */ }

    const logPath = join(this.outputLogDir, `session-${sessionId}.log`);
    const monitor = new OutputMonitor(sessionId, sessionName, logPath);

    const session: ManagedSession = {
      id: sessionId,
      name: sessionName,
      projectPath,
      tmuxSession: sessionName,
      status: 'starting',
      lastActivity: Date.now(),
      contextDbPath: join(homedir(), '.olympus', 'projects', basename(projectPath), 'memory.db'),
      commandQueue: [],
      createdAt: Date.now(),
    };

    this.sessions.set(sessionId, session);
    this.monitors.set(sessionId, monitor);

    // Wire monitor events
    monitor.on('output', (content: string) => {
      session.lastActivity = Date.now();
      this.emit('session:screen', { sessionId, content });
    });

    monitor.on('prompt-detected', () => {
      if (session.status === 'starting' || session.status === 'busy') {
        this.transitionStatus(sessionId, session.commandQueue.length > 0 ? 'busy' : 'ready');
        this.drainSessionQueue(sessionId);
      }
    });

    monitor.on('error', (msg: string) => {
      this.transitionStatus(sessionId, 'error');
      this.emit('session:error', { sessionId, error: msg });
    });

    // Start output monitoring
    monitor.start();

    return session;
  }

  /**
   * 기존 tmux 세션 자동 발견
   */
  async discoverExistingSessions(): Promise<ManagedSession[]> {
    const discovered: ManagedSession[] = [];
    try {
      const output = execFileSync('tmux', [
        'list-sessions', '-F', '#{session_name}:#{session_path}',
      ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });

      for (const line of output.trim().split('\n')) {
        if (!line) continue;
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;
        const sessionName = line.slice(0, colonIdx);
        const sessionPath = line.slice(colonIdx + 1);

        if (!sessionName.startsWith('olympus')) continue;
        if (this.findByTmuxName(sessionName)) continue;

        const session = await this.createSession(sessionPath, sessionName);
        // Already running, skip starting state
        session.status = 'ready';
        this.emit('session:status', { sessionId: session.id, status: 'ready' });
        discovered.push(session);
      }
    } catch { /* tmux not installed or no sessions */ }
    return discovered;
  }

  /**
   * 명령 전송 — busy 시 세션 큐에 적재
   * @returns true if sent immediately, false if queued
   */
  async sendToSession(sessionId: string, input: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status === 'closed' || session.status === 'error') {
      throw new Error(`세션 ${sessionId} 사용 불가 (status: ${session?.status ?? 'not found'})`);
    }

    if (session.status === 'busy') {
      if (session.commandQueue.length >= SESSION_CONSTANTS.SESSION_MAX_COMMAND_QUEUE) {
        throw new Error(`세션 ${sessionId} 큐 가득 참 (${SESSION_CONSTANTS.SESSION_MAX_COMMAND_QUEUE})`);
      }
      session.commandQueue.push(input);
      return false;
    }

    this.sendImmediate(session, input);
    return true;
  }

  /**
   * 세션 종료
   */
  closeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Stop monitor
    const monitor = this.monitors.get(sessionId);
    monitor?.stop();
    this.monitors.delete(sessionId);

    // Kill tmux session
    try {
      execFileSync('tmux', ['kill-session', '-t', session.tmuxSession], { stdio: 'pipe' });
    } catch { /* already dead */ }

    this.transitionStatus(sessionId, 'closed');
    return true;
  }

  /**
   * 세션 목록
   */
  listSessions(): ManagedSession[] {
    return [...this.sessions.values()];
  }

  /**
   * 세션 조회
   */
  getSession(sessionId: string): ManagedSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 이름으로 검색
   */
  findByName(name: string): ManagedSession | undefined {
    const lower = name.toLowerCase();
    for (const session of this.sessions.values()) {
      if (session.name.toLowerCase() === lower ||
          session.name.toLowerCase().includes(lower)) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * tmux 세션 이름으로 검색
   */
  findByTmuxName(tmuxName: string): ManagedSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.tmuxSession === tmuxName) return session;
    }
    return undefined;
  }

  /**
   * 활성 세션 수
   */
  getActiveSessions(): ManagedSession[] {
    return [...this.sessions.values()].filter(
      s => s.status !== 'closed' && s.status !== 'error'
    );
  }

  /**
   * 모든 세션 정리
   */
  shutdown(): void {
    for (const [id] of this.sessions) {
      const monitor = this.monitors.get(id);
      monitor?.stop();
    }
    this.monitors.clear();
  }

  // ── Private ──

  private sendImmediate(session: ManagedSession, input: string): void {
    this.transitionStatus(session.id, 'busy');
    session.currentTask = input.slice(0, 100);
    session.lastActivity = Date.now();

    const target = session.tmuxWindow
      ? `${session.tmuxSession}:${session.tmuxWindow}`
      : session.tmuxSession;

    // execFileSync prevents shell injection (established security pattern)
    execFileSync('tmux', ['send-keys', '-t', target, '-l', input], { stdio: 'pipe' });
    execFileSync('tmux', ['send-keys', '-t', target, 'Enter'], { stdio: 'pipe' });

    this.emit('session:command-sent', { sessionId: session.id, input });
  }

  private drainSessionQueue(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.commandQueue.length === 0) return;
    if (session.status === 'busy') return;

    const next = session.commandQueue.shift()!;
    this.sendImmediate(session, next);
  }

  private transitionStatus(sessionId: string, newStatus: SessionStatus): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const prevStatus = session.status;
    session.status = newStatus;

    if (newStatus !== 'busy') {
      session.currentTask = undefined;
    }

    this.emit('session:status', {
      sessionId,
      status: newStatus,
      prevStatus,
    });
  }
}
