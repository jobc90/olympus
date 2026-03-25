import { createMessage, GATEWAY_PATH } from '@olympus-dev/protocol';
import WebSocket from 'ws';
import type {
  ReportTaskResultInput,
  TaskPayload,
  WorkerInputPayload,
  WorkerResizePayload,
  WorkerTaskSnapshot,
} from './worker-task-orchestrator.js';

export interface WorkerGatewaySessionOptions {
  gatewayUrl: string;
  apiKey: string;
  workerId: string;
  onAssignedTask: (task: TaskPayload) => void;
  onInput: (payload: WorkerInputPayload) => void;
  onResize: (payload: WorkerResizePayload) => void;
  onRecoverPendingTasks: (tasks: WorkerTaskSnapshot[]) => Promise<void>;
  fetchImpl?: typeof fetch;
  webSocketFactory?: (url: string) => WebSocketLike;
  reconnectDelayMs?: number;
  heartbeatMs?: number;
  pingMs?: number;
  recoveryPollMs?: number;
  streamFlushMs?: number;
  streamFlushSize?: number;
}

export interface WebSocketLike {
  readonly readyState: number;
  on(event: 'open', listener: () => void): this;
  on(event: 'message', listener: (data: WebSocket.RawData) => void): this;
  on(event: 'close', listener: () => void): this;
  on(event: 'error', listener: () => void): this;
  send(data: string): void;
  close(): void;
}

const DEFAULT_RECONNECT_DELAY_MS = 5_000;
const DEFAULT_HEARTBEAT_MS = 30_000;
const DEFAULT_PING_MS = 25_000;
const DEFAULT_RECOVERY_POLL_MS = 5_000;
const DEFAULT_STREAM_FLUSH_MS = 30;
const DEFAULT_STREAM_FLUSH_SIZE = 2_048;

export function resolveWorkerWebSocketUrl(gatewayUrl: string): string {
  return gatewayUrl.replace(/^http/, 'ws') + GATEWAY_PATH;
}

export class WorkerGatewaySession {
  private readonly fetchImpl: typeof fetch;

  private readonly webSocketFactory: (url: string) => WebSocketLike;

  private readonly reconnectDelayMs: number;

  private readonly heartbeatMs: number;

  private readonly pingMs: number;

  private readonly recoveryPollMs: number;

  private readonly streamFlushMs: number;

  private readonly streamFlushSize: number;

  private readonly wsUrl: string;

  private shuttingDown = false;

  private streamBuffer = '';

  private streamFlushTimer: ReturnType<typeof setTimeout> | null = null;

  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  private recoveryPollInterval: ReturnType<typeof setInterval> | null = null;

  private wsPingTimer: ReturnType<typeof setInterval> | null = null;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private ws: WebSocketLike | null = null;

  constructor(private readonly options: WorkerGatewaySessionOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.webSocketFactory = options.webSocketFactory ?? ((url) => new WebSocket(url));
    this.reconnectDelayMs = options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
    this.heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
    this.pingMs = options.pingMs ?? DEFAULT_PING_MS;
    this.recoveryPollMs = options.recoveryPollMs ?? DEFAULT_RECOVERY_POLL_MS;
    this.streamFlushMs = options.streamFlushMs ?? DEFAULT_STREAM_FLUSH_MS;
    this.streamFlushSize = options.streamFlushSize ?? DEFAULT_STREAM_FLUSH_SIZE;
    this.wsUrl = resolveWorkerWebSocketUrl(options.gatewayUrl);
  }

  async start(): Promise<void> {
    this.heartbeatInterval = setInterval(() => {
      void this.sendHeartbeat();
    }, this.heartbeatMs);
    this.recoveryPollInterval = setInterval(() => {
      void this.recoverPendingTasks();
    }, this.recoveryPollMs);
    this.connectWs();
  }

  async stop(): Promise<void> {
    this.shuttingDown = true;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.recoveryPollInterval) {
      clearInterval(this.recoveryPollInterval);
      this.recoveryPollInterval = null;
    }
    if (this.wsPingTimer) {
      clearInterval(this.wsPingTimer);
      this.wsPingTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.streamFlushTimer) {
      clearTimeout(this.streamFlushTimer);
      this.streamFlushTimer = null;
    }

    await this.flushWorkerStream();
    this.ws?.close();
    this.ws = null;
  }

  async reportResult(taskId: string, result: ReportTaskResultInput): Promise<void> {
    await this.fetchImpl(`${this.options.gatewayUrl}/api/workers/tasks/${taskId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify(result),
    }).catch(() => {
      // Result reporting is best-effort at this layer.
    });
  }

  queueWorkerStream(chunk: string): void {
    if (this.shuttingDown || !chunk) return;

    this.streamBuffer += chunk;
    if (this.streamBuffer.length >= this.streamFlushSize) {
      if (this.streamFlushTimer) {
        clearTimeout(this.streamFlushTimer);
        this.streamFlushTimer = null;
      }
      void this.flushWorkerStream();
      return;
    }

    if (!this.streamFlushTimer) {
      this.streamFlushTimer = setTimeout(() => {
        this.streamFlushTimer = null;
        void this.flushWorkerStream();
      }, this.streamFlushMs);
    }
  }

  private connectWs(): void {
    this.ws = this.webSocketFactory(this.wsUrl);

    this.ws.on('open', () => {
      this.ws?.send(JSON.stringify(createMessage('connect', {
        clientType: 'worker',
        apiKey: this.options.apiKey,
      })));

      if (this.wsPingTimer) {
        clearInterval(this.wsPingTimer);
      }
      this.wsPingTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify(createMessage('ping', {})));
        }
      }, this.pingMs);

      void this.recoverPendingTasks();
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'connected' || msg.type === 'runs:list' || msg.type === 'sessions:list' || msg.type === 'pong') {
          return;
        }

        if (msg.type === 'worker:task:assigned' && msg.payload?.workerId === this.options.workerId) {
          this.options.onAssignedTask(msg.payload as TaskPayload);
          return;
        }

        if (msg.type === 'worker:input' && msg.payload?.workerId === this.options.workerId) {
          this.options.onInput(msg.payload as WorkerInputPayload);
          return;
        }

        if (msg.type === 'worker:resize' && msg.payload?.workerId === this.options.workerId) {
          this.options.onResize(msg.payload as WorkerResizePayload);
        }
      } catch {
        // Ignore parse failures and malformed frames.
      }
    });

    this.ws.on('close', () => {
      if (this.wsPingTimer) {
        clearInterval(this.wsPingTimer);
        this.wsPingTimer = null;
      }
      if (!this.shuttingDown) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.connectWs();
        }, this.reconnectDelayMs);
      }
    });

    this.ws.on('error', () => {});
  }

  private async sendHeartbeat(): Promise<void> {
    try {
      await this.fetchImpl(`${this.options.gatewayUrl}/api/workers/${this.options.workerId}/heartbeat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.options.apiKey}` },
      });
    } catch {
      // Heartbeat failures are non-fatal.
    }
  }

  private async recoverPendingTasks(): Promise<void> {
    try {
      const res = await this.fetchImpl(`${this.options.gatewayUrl}/api/workers/tasks`, {
        headers: { Authorization: `Bearer ${this.options.apiKey}` },
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) return;

      const body = await res.json() as { tasks?: WorkerTaskSnapshot[] };
      await this.options.onRecoverPendingTasks(body.tasks ?? []);
    } catch {
      // Polling errors are non-fatal.
    }
  }

  private async flushWorkerStream(): Promise<void> {
    if (!this.streamBuffer) return;

    const content = this.streamBuffer;
    this.streamBuffer = '';
    try {
      await this.fetchImpl(`${this.options.gatewayUrl}/api/workers/${this.options.workerId}/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          content,
          timestamp: Date.now(),
        }),
      });
    } catch {
      // Stream relay is best-effort.
    }
  }
}
