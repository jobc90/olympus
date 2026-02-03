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

        // Re-subscribe to runs after reconnection
        for (const runId of this.subscribedRuns) {
          this.send(createMessage('subscribe', { runId }));
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

  /** Cancel a run or task */
  cancel(runId?: string, taskId?: string): void {
    this.send(createMessage('cancel', { runId, taskId }));
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
