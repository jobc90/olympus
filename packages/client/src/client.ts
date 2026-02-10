import {
  DEFAULT_GATEWAY_PORT,
  DEFAULT_GATEWAY_HOST,
  GATEWAY_PATH,
  PROTOCOL_VERSION,
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_BASE_DELAY_MS,
  HEARTBEAT_INTERVAL_MS,
  createMessage,
  parseMessage,
  type WsMessage,
  type SnapshotPayload,
  type PhasePayload,
  type AgentPayload,
  type TaskPayload,
  type LogPayload,
  type RunStatus,
  type CliRunResult,
} from '@olympus-dev/protocol';

export interface OlympusClientOptions {
  port?: number;
  host?: string;
  clientType: 'tui' | 'web' | 'cli';
  apiKey?: string;
  autoReconnect?: boolean;
  /** Supply WebSocket class - default globalThis.WebSocket, or pass 'ws' in Node */
  WebSocket?: typeof globalThis.WebSocket;
}

export type MessageHandler = (msg: WsMessage) => void;

export class OlympusClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private options: Required<Omit<OlympusClientOptions, 'apiKey'>> & { apiKey?: string };
  private _connected = false;
  private _sessionId: string | null = null;
  private subscribedRuns = new Set<string>();
  private subscribedSessions = new Set<string>();

  constructor(options: OlympusClientOptions) {
    this.options = {
      port: DEFAULT_GATEWAY_PORT,
      host: DEFAULT_GATEWAY_HOST,
      autoReconnect: true,
      WebSocket: globalThis.WebSocket,
      ...options,
    };
  }

  get connected(): boolean {
    return this._connected;
  }
  get sessionId(): string | null {
    return this._sessionId;
  }

  /** Subscribe to message type */
  on(type: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  /** Convenience: subscribe to typed events */
  onPhase(handler: (p: PhasePayload) => void): () => void {
    return this.on('phase:change', (m) => handler(m.payload as PhasePayload));
  }
  onAgentStart(handler: (p: AgentPayload) => void): () => void {
    return this.on('agent:start', (m) => handler(m.payload as AgentPayload));
  }
  onAgentChunk(handler: (p: AgentPayload) => void): () => void {
    return this.on('agent:chunk', (m) => handler(m.payload as AgentPayload));
  }
  onAgentComplete(handler: (p: AgentPayload) => void): () => void {
    return this.on('agent:complete', (m) =>
      handler(m.payload as AgentPayload)
    );
  }
  onAgentError(handler: (p: AgentPayload) => void): () => void {
    return this.on('agent:error', (m) => handler(m.payload as AgentPayload));
  }
  onTask(handler: (p: TaskPayload) => void): () => void {
    return this.on('task:update', (m) => handler(m.payload as TaskPayload));
  }
  onLog(handler: (p: LogPayload) => void): () => void {
    return this.on('log', (m) => handler(m.payload as LogPayload));
  }
  onSnapshot(handler: (p: SnapshotPayload) => void): () => void {
    return this.on('snapshot', (m) => handler(m.payload as SnapshotPayload));
  }
  onRunsList(handler: (runs: RunStatus[]) => void): () => void {
    return this.on('runs:list', (m) => handler((m.payload as { runs: RunStatus[] }).runs));
  }
  onSessionsList(handler: (payload: unknown) => void): () => void {
    return this.on('sessions:list', (m) => handler(m.payload));
  }
  onError(handler: (error: { code: string; message: string }) => void): () => void {
    return this.on('error', (m) => handler(m.payload as { code: string; message: string }));
  }

  connect(): void {
    const url = `ws://${this.options.host}:${this.options.port}${GATEWAY_PATH}`;
    const WS = this.options.WebSocket;
    this.ws = new WS(url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.send(
        createMessage('connect', {
          clientType: this.options.clientType,
          protocolVersion: PROTOCOL_VERSION,
          apiKey: this.options.apiKey,
        })
      );
      this.startPing();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      const msg = parseMessage(
        typeof event.data === 'string' ? event.data : String(event.data)
      );
      if (!msg) return;

      if (msg.type === 'connected') {
        this._connected = true;
        this._sessionId = (msg.payload as { sessionId: string }).sessionId;

        // Re-subscribe to runs and sessions after reconnection
        for (const runId of this.subscribedRuns) {
          this.send(createMessage('subscribe', { runId }));
        }
        for (const sessionId of this.subscribedSessions) {
          this.send(createMessage('subscribe', { sessionId }));
        }
      }

      const handlers = this.handlers.get(msg.type);
      if (handlers) for (const h of handlers) h(msg);
      // Also fire wildcard
      const wildcards = this.handlers.get('*');
      if (wildcards) for (const h of wildcards) h(msg);
    };

    this.ws.onclose = () => {
      this._connected = false;
      this.stopPing();
      if (
        this.options.autoReconnect &&
        this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS
      ) {
        const delay =
          RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts);
        this.reconnectAttempts++;
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
      }
    };

    this.ws.onerror = () => {
      /* onclose will fire */
    };
  }

  disconnect(): void {
    this.options.autoReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopPing();
    this.ws?.close(1000, 'Client disconnect');
    this._connected = false;
  }

  /** Subscribe to events for a specific run */
  subscribe(runId: string): void {
    this.subscribedRuns.add(runId);
    this.send(createMessage('subscribe', { runId }));
  }

  /** Unsubscribe from events for a specific run */
  unsubscribe(runId: string): void {
    this.subscribedRuns.delete(runId);
    this.send(createMessage('unsubscribe', { runId }));
  }

  /** Subscribe to events for a specific session */
  subscribeSession(sessionId: string): void {
    this.subscribedSessions.add(sessionId);
    this.send(createMessage('subscribe', { sessionId }));
  }

  /** Unsubscribe from session events */
  unsubscribeSession(sessionId: string): void {
    this.subscribedSessions.delete(sessionId);
    this.send(createMessage('unsubscribe', { sessionId }));
  }

  /**
   * @deprecated Use onSessionScreen instead. session:output has been replaced by session:screen.
   */
  onSessionOutput(handler: (p: { sessionId: string; content: string }) => void): () => void {
    return this.on('session:screen', (m) => handler(m.payload as { sessionId: string; content: string }));
  }

  /** Convenience: subscribe to session screen snapshot (terminal mirror for Dashboard) */
  onSessionScreen(handler: (p: { sessionId: string; content: string }) => void): () => void {
    return this.on('session:screen', (m) => handler(m.payload as { sessionId: string; content: string }));
  }

  /** Convenience: subscribe to session error events */
  onSessionError(handler: (p: { sessionId: string; error: string }) => void): () => void {
    return this.on('session:error', (m) => handler(m.payload as { sessionId: string; error: string }));
  }

  /** Convenience: subscribe to session closed events */
  onSessionClosed(handler: (p: { sessionId: string }) => void): () => void {
    return this.on('session:closed', (m) => handler(m.payload as { sessionId: string }));
  }

  /** Convenience: subscribe to codex session events */
  onCodexSessionEvent(handler: (p: { sessionId: string; status: string; projectName?: string }) => void): () => void {
    return this.on('codex:session-event', (m) => handler(m.payload as { sessionId: string; status: string; projectName?: string }));
  }

  /** Cancel a run or task */
  cancel(runId?: string, taskId?: string): void {
    this.send(createMessage('cancel', { runId, taskId }));
  }

  // ── RPC Methods ─────────────────────────────

  /**
   * Send an RPC request and return a promise that resolves with the result.
   * Handles rpc:ack → rpc:result/rpc:error flow.
   */
  rpc<T = unknown>(method: string, params?: Record<string, unknown>, timeoutMs = 60_000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const msg = createMessage('rpc', { method, params });
      const requestId = msg.id;

      let timer: ReturnType<typeof setTimeout> | null = null;
      let cleanupResult: (() => void) | null = null;
      let cleanupError: (() => void) | null = null;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        if (cleanupResult) cleanupResult();
        if (cleanupError) cleanupError();
      };

      cleanupResult = this.on('rpc:result', (m) => {
        const payload = m.payload as { requestId: string; result: unknown };
        if (payload.requestId === requestId) {
          cleanup();
          resolve(payload.result as T);
        }
      });

      cleanupError = this.on('rpc:error', (m) => {
        const payload = m.payload as { requestId: string; code: string; message: string };
        if (payload.requestId === requestId) {
          cleanup();
          reject(new Error(`RPC Error [${payload.code}]: ${payload.message}`));
        }
      });

      timer = setTimeout(() => {
        cleanup();
        reject(new Error(`RPC timeout after ${timeoutMs}ms: ${method}`));
      }, timeoutMs);

      this.send(msg);
    });
  }

  /** Send a command to the Codex Agent */
  async sendCommand(command: string, projectPath?: string, autoApprove?: boolean): Promise<{ taskId: string; status: string; message: string }> {
    return this.rpc('agent.command', { command, projectPath, autoApprove });
  }

  /** Get current agent status */
  async getAgentStatus(): Promise<{ state: string; currentTask: unknown; activeWorkers: number }> {
    return this.rpc('agent.status');
  }

  /** Cancel current agent task */
  async cancelAgent(): Promise<{ cancelled: boolean; message: string }> {
    return this.rpc('agent.cancel');
  }

  /** Get agent task history */
  async getAgentHistory(limit?: number, offset?: number): Promise<{ tasks: unknown[]; total: number }> {
    return this.rpc('agent.history', { limit, offset });
  }

  /** List active workers */
  async listWorkers(): Promise<{ workers: unknown[] }> {
    return this.rpc('workers.list');
  }

  /** Terminate a worker */
  async terminateWorker(workerId: string): Promise<{ terminated: boolean; message: string }> {
    return this.rpc('workers.terminate', { workerId });
  }

  /** Get worker output */
  async getWorkerOutput(workerId: string): Promise<{ output: string; totalLength: number }> {
    return this.rpc('workers.output', { workerId });
  }

  /** Approve a pending agent task */
  async approveTask(taskId: string): Promise<{ approved: boolean; message: string }> {
    return this.rpc('agent.approve', { taskId });
  }

  /** Reject a pending agent task */
  async rejectTask(taskId: string, reason?: string): Promise<{ rejected: boolean; message: string }> {
    return this.rpc('agent.reject', { taskId, reason });
  }

  /** Subscribe to agent approval events */
  onAgentApproval(handler: (p: { taskId: string; request: unknown }) => void): () => void {
    return this.on('agent:approval', (m) => handler(m.payload as { taskId: string; request: unknown }));
  }

  /** Get system health */
  async getHealth(): Promise<{ status: string; uptime: number; version: string }> {
    return this.rpc('health');
  }

  /** Get system status */
  async getStatus(): Promise<{ agentState: string; activeWorkers: number; connectedClients: number }> {
    return this.rpc('status');
  }

  // ── Codex RPC Methods ──────────────────────────

  /** Route input through Codex Orchestrator */
  async codexRoute(text: string, source: string): Promise<{ requestId: string; decision: { type: string; targetSessions: string[]; processedInput: string; confidence: number; reason: string }; response?: { type: string; content: string; metadata: Record<string, unknown>; rawOutput: string; agentInsight?: string } }> {
    return this.rpc('codex.route', { text, source });
  }

  /** List Codex-managed sessions */
  async codexSessions(): Promise<Array<{ id: string; name: string; projectPath: string; status: string; lastActivity: number }>> {
    return this.rpc('codex.sessions');
  }

  /** List Codex-registered projects */
  async codexProjects(): Promise<Array<{ name: string; path: string; aliases: string[]; techStack: string[] }>> {
    return this.rpc('codex.projects');
  }

  /** Search across all Codex projects */
  async codexSearch(query: string, limit?: number): Promise<Array<{ projectName: string; projectPath: string; matchType: string; content: string; score: number; timestamp: number }>> {
    return this.rpc('codex.search', { query, limit });
  }

  /** Get Codex status */
  async codexStatus(): Promise<{ initialized: boolean; sessionCount: number; projectCount: number }> {
    return this.rpc('codex.status');
  }

  /** Subscribe to agent progress events */
  onAgentProgress(handler: (p: { taskId: string; state: string; message: string; progress?: number }) => void): () => void {
    return this.on('agent:progress', (m) => handler(m.payload as { taskId: string; state: string; message: string; progress?: number }));
  }

  /** Subscribe to agent result events */
  onAgentResult(handler: (p: { taskId: string; report: unknown }) => void): () => void {
    return this.on('agent:result', (m) => handler(m.payload as { taskId: string; report: unknown }));
  }

  /** Subscribe to worker events */
  onWorkerStarted(handler: (p: { workerId: string; projectPath: string }) => void): () => void {
    return this.on('worker:started', (m) => handler(m.payload as { workerId: string; projectPath: string }));
  }

  onWorkerOutput(handler: (p: { workerId: string; content: string }) => void): () => void {
    return this.on('worker:output', (m) => handler(m.payload as { workerId: string; content: string }));
  }

  onWorkerDone(handler: (p: { workerId: string; result: unknown }) => void): () => void {
    return this.on('worker:done', (m) => handler(m.payload as { workerId: string; result: unknown }));
  }

  /** Subscribe to CLI run completion events */
  onCliComplete(handler: (p: CliRunResult) => void): () => void {
    return this.on('cli:complete', (m) => handler(m.payload as CliRunResult));
  }

  private send(msg: WsMessage): void {
    if (this.ws?.readyState === 1 /* OPEN */) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      this.send(createMessage('ping', {}));
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
