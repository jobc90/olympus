import { WebSocketServer, WebSocket } from 'ws';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_GATEWAY_PORT,
  DEFAULT_GATEWAY_HOST,
  GATEWAY_PATH,
  HEARTBEAT_INTERVAL_MS,
  PROTOCOL_VERSION,
  createMessage,
  parseMessage,
  type WsMessage,
  type ConnectPayload,
  type CancelPayload,
  type SubscribePayload,
  type UnsubscribePayload,
  type SnapshotPayload,
} from '@olympus-dev/protocol';
import { RunManager, type RunOptions } from './run-manager.js';
import { SessionManager, type SessionEvent } from './session-manager.js';
import { createApiHandler } from './api.js';
import { validateWsApiKey, loadConfig } from './auth.js';

export interface GatewayOptions {
  port?: number;
  host?: string;
  maxConcurrentRuns?: number;
}

interface ClientInfo {
  ws: WebSocket;
  clientType: string;
  connectedAt: number;
  alive: boolean;
  authenticated: boolean;
  subscribedRuns: Set<string>; // Run IDs this client is subscribed to
  subscribedSessions: Set<string>; // Session IDs this client is subscribed to
}

export class Gateway {
  private wss: WebSocketServer | null = null;
  private httpServer: ReturnType<typeof createServer> | null = null;
  private clients = new Map<string, ClientInfo>();
  private runManager: RunManager;
  private sessionManager: SessionManager;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private sessionCleanupTimer: ReturnType<typeof setInterval> | null = null;
  private port: number;
  private host: string;

  constructor(options: GatewayOptions = {}) {
    this.port = options.port ?? DEFAULT_GATEWAY_PORT;
    this.host = options.host ?? DEFAULT_GATEWAY_HOST;

    // Initialize RunManager with event forwarding
    this.runManager = new RunManager({
      maxConcurrentRuns: options.maxConcurrentRuns ?? 5,
      onEvent: (runId, event) => this.broadcastToSubscribers(runId, event),
    });

    // Initialize SessionManager with event forwarding
    this.sessionManager = new SessionManager({
      onSessionEvent: (sessionId, event) => this.broadcastSessionEvent(sessionId, event),
    });
  }

  async start(): Promise<{ port: number; host: string; apiKey: string }> {
    // Ensure API key exists (creates one if not)
    const config = loadConfig();

    return new Promise((resolve, reject) => {
      // Create HTTP server with API handler
      const apiHandler = createApiHandler({
        runManager: this.runManager,
        sessionManager: this.sessionManager,
        onRunCreated: () => this.broadcastRunsList(),
        onSessionEvent: (sessionId, event) => this.broadcastSessionEvent(sessionId, event),
      });

      this.httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        // Let API handler take care of routing
        await apiHandler(req, res);
      });

      // Create WebSocket server on same HTTP server
      this.wss = new WebSocketServer({
        server: this.httpServer,
        path: GATEWAY_PATH,
      });

      this.wss.on('connection', (ws) => this.handleConnection(ws));

      // Heartbeat for WebSocket connections
      this.heartbeatTimer = setInterval(
        () => this.heartbeat(),
        HEARTBEAT_INTERVAL_MS
      );

      // Session cleanup timer (every 5 minutes)
      this.sessionCleanupTimer = setInterval(
        () => this.sessionManager.cleanup(),
        5 * 60 * 1000
      );

      this.httpServer.listen(this.port, this.host, () => {
        resolve({ port: this.port, host: this.host, apiKey: config.apiKey });
      });
      this.httpServer.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    // Cancel all active runs
    this.runManager.cancelAllRuns();

    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.sessionCleanupTimer) clearInterval(this.sessionCleanupTimer);
    for (const [, client] of this.clients) {
      client.ws.close(1001, 'Gateway shutting down');
    }
    this.clients.clear();

    return new Promise((resolve) => {
      if (this.wss)
        this.wss.close(() => {
          if (this.httpServer) this.httpServer.close(() => resolve());
          else resolve();
        });
      else resolve();
    });
  }

  get clientCount(): number {
    return this.clients.size;
  }

  getRunManager(): RunManager {
    return this.runManager;
  }

  private handleConnection(ws: WebSocket): void {
    const clientId = randomUUID();

    ws.on('message', (data) => {
      const msg = parseMessage(String(data));
      if (!msg) return;

      switch (msg.type) {
        case 'connect': {
          const payload = msg.payload as ConnectPayload;

          // Validate API key
          const authenticated = validateWsApiKey(payload.apiKey);
          if (!authenticated) {
            this.send(ws, createMessage('error', {
              code: 'UNAUTHORIZED',
              message: 'Invalid API key',
            }));
            ws.close(4001, 'Unauthorized');
            return;
          }

          this.clients.set(clientId, {
            ws,
            clientType: payload.clientType,
            connectedAt: Date.now(),
            alive: true,
            authenticated: true,
            subscribedRuns: new Set(),
            subscribedSessions: new Set(),
          });

          // Send connected acknowledgment
          this.send(
            ws,
            createMessage('connected', {
              protocolVersion: PROTOCOL_VERSION,
              sessionId: clientId,
            })
          );

          // Send initial snapshot (list of runs)
          this.sendSnapshot(ws);
          break;
        }

        case 'subscribe': {
          const client = this.clients.get(clientId);
          if (!client?.authenticated) {
            this.send(ws, createMessage('error', {
              code: 'UNAUTHORIZED',
              message: 'Not authenticated',
            }));
            return;
          }

          const payload = msg.payload as SubscribePayload & { sessionId?: string };

          // Handle session subscription
          if (payload.sessionId) {
            client.subscribedSessions.add(payload.sessionId);
            break;
          }

          // Handle run subscription
          if (payload.runId) {
            client.subscribedRuns.add(payload.runId);

            // Send current state of the subscribed run
            const runStatus = this.runManager.getRunStatus(payload.runId);
            if (runStatus) {
              this.send(ws, createMessage('snapshot', {
                phase: runStatus.phase,
                phaseName: runStatus.phaseName,
                tasks: runStatus.tasks,
                agents: [],
                runId: payload.runId,
              } as SnapshotPayload));
            }
          }
          break;
        }

        case 'unsubscribe': {
          const client = this.clients.get(clientId);
          if (!client) return;

          const payload = msg.payload as UnsubscribePayload & { sessionId?: string };
          if (payload.sessionId) {
            client.subscribedSessions.delete(payload.sessionId);
          }
          if (payload.runId) {
            client.subscribedRuns.delete(payload.runId);
          }
          break;
        }

        case 'cancel': {
          const client = this.clients.get(clientId);
          if (!client?.authenticated) {
            this.send(ws, createMessage('error', {
              code: 'UNAUTHORIZED',
              message: 'Not authenticated',
            }));
            return;
          }

          const payload = msg.payload as CancelPayload;
          if (payload.runId) {
            const cancelled = this.runManager.cancelRun(payload.runId);
            this.send(ws, createMessage('cancelled', {
              runId: payload.runId,
              success: cancelled,
            }));
          }
          break;
        }

        case 'ping': {
          const info = this.clients.get(clientId);
          if (info) info.alive = true;
          this.send(ws, createMessage('pong', {}));
          break;
        }
      }
    });

    ws.on('close', () => {
      this.clients.delete(clientId);
    });
    ws.on('error', () => {
      this.clients.delete(clientId);
    });
  }

  /**
   * Broadcast event to clients subscribed to a specific run
   */
  private broadcastToSubscribers(runId: string, event: { type: string; payload: unknown }): void {
    const message = createMessage(event.type, event.payload);
    const raw = JSON.stringify(message);

    for (const [, client] of this.clients) {
      // Only send to authenticated clients subscribed to this run
      if (
        client.authenticated &&
        client.subscribedRuns.has(runId) &&
        client.ws.readyState === WebSocket.OPEN
      ) {
        client.ws.send(raw);
      }
    }
  }

  private sendSnapshot(ws: WebSocket): void {
    // Send list of all runs as initial snapshot
    const runs = this.runManager.getAllRunStatuses();
    this.send(ws, createMessage('runs:list', { runs }));

    // Send list of active sessions + available tmux sessions
    const sessions = this.sessionManager.getAll().filter(s => s.status === 'active');
    const discovered = this.sessionManager.discoverTmuxSessions();

    // Filter out already-registered tmux sessions from discovered
    const registeredTmux = new Set(sessions.map(s => s.tmuxSession));
    const availableSessions = discovered.filter(d => !registeredTmux.has(d.tmuxSession));

    this.send(ws, createMessage('sessions:list', { sessions, availableSessions }));
  }

  /**
   * Broadcast session event to clients subscribed to a specific session
   */
  private broadcastSessionEvent(sessionId: string, event: SessionEvent): void {
    let messageType: string;
    let payload: Record<string, unknown>;

    switch (event.type) {
      case 'output':
        messageType = 'session:output';
        payload = { sessionId, content: event.content };
        break;
      case 'error':
        messageType = 'session:error';
        payload = { sessionId, error: event.error };
        break;
      case 'closed':
        messageType = 'session:closed';
        payload = { sessionId };
        break;
      default:
        return;
    }

    const message = createMessage(messageType, payload);
    const raw = JSON.stringify(message);

    for (const [, client] of this.clients) {
      if (
        client.authenticated &&
        client.subscribedSessions.has(sessionId) &&
        client.ws.readyState === WebSocket.OPEN
      ) {
        client.ws.send(raw);
      }
    }
  }

  /**
   * Broadcast runs:list to ALL authenticated clients
   * Used when a new run is created or run status changes
   */
  broadcastRunsList(): void {
    const runs = this.runManager.getAllRunStatuses();
    const message = createMessage('runs:list', { runs });
    const raw = JSON.stringify(message);

    for (const [, client] of this.clients) {
      if (client.authenticated && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(raw);
      }
    }
  }

  private send(ws: WebSocket, msg: WsMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  private heartbeat(): void {
    for (const [id, client] of this.clients) {
      if (!client.alive) {
        client.ws.terminate();
        this.clients.delete(id);
        continue;
      }
      client.alive = false;
    }
  }
}
