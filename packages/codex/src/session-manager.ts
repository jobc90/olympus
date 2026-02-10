import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { basename, join } from 'node:path';
import { homedir } from 'node:os';
import type { ManagedSession, SessionManagerConfig, SessionStatus } from './types.js';
import { SESSION_CONSTANTS } from './types.js';

/**
 * CodexSessionManager — 인메모리 세션 레지스트리
 *
 * Gateway SessionManager와 차이:
 * - Gateway: chatId 기반 (Telegram 전용), 2-state (active/closed)
 * - Codex:   projectPath 기반, 6-state lifecycle, 이벤트 기반 실행
 *
 * 세션 생명주기:
 * ready ↔ busy → closed
 *           ↓
 *         error → closed
 *
 * Events:
 * - 'session:execute'      — 외부에서 실행해야 할 명령 (codex-adapter → runCli)
 * - 'session:status'       — 세션 상태 변경
 * - 'session:command-sent'  — 명령 전송 완료
 */
export class CodexSessionManager extends EventEmitter {
  private sessions: Map<string, ManagedSession> = new Map();

  constructor(private config: SessionManagerConfig = {}) {
    super();
  }

  async createSession(projectPath: string, name?: string): Promise<ManagedSession> {
    const maxSessions = this.config.maxSessions ?? 5;
    const activeSessions = this.getActiveSessions();
    if (activeSessions.length >= maxSessions) {
      throw new Error(`최대 세션 수 초과 (${maxSessions})`);
    }

    const sessionName = name ?? `codex-${basename(projectPath)}`;
    const sessionId = randomUUID().slice(0, 8);

    const session: ManagedSession = {
      id: sessionId,
      name: sessionName,
      projectPath,
      status: 'ready',
      lastActivity: Date.now(),
      contextDbPath: join(homedir(), '.olympus', 'projects', basename(projectPath), 'memory.db'),
      commandQueue: [],
      createdAt: Date.now(),
    };

    this.sessions.set(sessionId, session);
    this.emit('session:status', { sessionId, status: 'ready' });
    return session;
  }

  async discoverExistingSessions(): Promise<ManagedSession[]> {
    return [];
  }

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

    this.executeCommand(session, input);
    return true;
  }

  closeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    this.transitionStatus(sessionId, 'closed');
    return true;
  }

  listSessions(): ManagedSession[] {
    return [...this.sessions.values()];
  }

  getSession(sessionId: string): ManagedSession | undefined {
    return this.sessions.get(sessionId);
  }

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

  getActiveSessions(): ManagedSession[] {
    return [...this.sessions.values()].filter(
      s => s.status !== 'closed' && s.status !== 'error'
    );
  }

  shutdown(): void {
    for (const [id] of this.sessions) {
      this.transitionStatus(id, 'closed');
    }
  }

  /**
   * 작업 완료 알림 (외부에서 호출 — codex-adapter가 runCli 결과 후)
   */
  notifyTaskComplete(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.transitionStatus(sessionId, session.commandQueue.length > 0 ? 'busy' : 'ready');
    this.drainSessionQueue(sessionId);
  }

  // ── Private ──

  private executeCommand(session: ManagedSession, input: string): void {
    this.transitionStatus(session.id, 'busy');
    session.currentTask = input.slice(0, 100);
    session.lastActivity = Date.now();

    this.emit('session:execute', {
      sessionId: session.id,
      input,
      projectPath: session.projectPath,
    });

    this.emit('session:command-sent', { sessionId: session.id, input });
  }

  private drainSessionQueue(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.commandQueue.length === 0) return;
    if (session.status === 'busy') return;

    const next = session.commandQueue.shift()!;
    this.executeCommand(session, next);
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
