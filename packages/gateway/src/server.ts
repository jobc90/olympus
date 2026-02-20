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
import { validateWsApiKey, loadConfig, resolveV2Config } from './auth.js';
import { RpcRouter, registerSystemMethods, registerAgentMethods, registerMemoryMethods } from './rpc/index.js';
import type { RpcRequestPayload } from '@olympus-dev/protocol';
import { DEFAULT_AGENT_CONFIG } from '@olympus-dev/protocol';
import { CodexAgent } from './agent/agent.js';
import { CommandAnalyzer } from './agent/analyzer.js';
import { ExecutionPlanner } from './agent/planner.js';
import { ResultReviewer } from './agent/reviewer.js';
import { AgentReporter } from './agent/reporter.js';
import { createAIProvider } from './agent/providers/index.js';
import { WorkerManager } from './workers/manager.js';
import { ChannelManager, DashboardChannel, TelegramChannel } from './channels/index.js';
import { MemoryStore } from './memory/store.js';
import { CliSessionStore } from './cli-session-store.js';
import type { CodexAdapter } from './codex-adapter.js';
import { WorkerRegistry } from './worker-registry.js';
import { LocalContextStoreManager, extractContext } from '@olympus-dev/core';
import type { GeminiAdvisor } from './gemini-advisor.js';
import { UsageMonitor } from './usage-monitor.js';

export interface GatewayOptions {
  port?: number;
  host?: string;
  maxConcurrentRuns?: number;
  codexAdapter?: CodexAdapter;
  geminiAdvisor?: GeminiAdvisor;
  /** Server mode: legacy (full agent/worker), hybrid (both), codex (slim — no agent/worker) */
  mode?: 'legacy' | 'hybrid' | 'codex';
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
  private rpcRouter: RpcRouter;
  private agent: CodexAgent | null = null;
  private workerManager: WorkerManager | null = null;
  private channelManager: ChannelManager;
  private memoryStore: MemoryStore | null = null;
  private cliSessionStore: CliSessionStore;
  private codexAdapter: CodexAdapter | null = null;
  private geminiAdvisor: GeminiAdvisor | null = null;
  private workerRegistry: WorkerRegistry;
  private localContextManager: LocalContextStoreManager;
  private usageMonitor: UsageMonitor | null = null;
  private lastGreeting: { type: string; text: string; timestamp: number } | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private sessionCleanupTimer: ReturnType<typeof setInterval> | null = null;
  private startTime = Date.now();
  private port: number;
  private host: string;
  private mode: 'legacy' | 'hybrid' | 'codex';

  constructor(options: GatewayOptions = {}) {
    this.port = options.port ?? DEFAULT_GATEWAY_PORT;
    this.host = options.host ?? DEFAULT_GATEWAY_HOST;
    this.mode = options.mode ?? 'legacy';

    // Initialize RunManager with event forwarding
    this.runManager = new RunManager({
      maxConcurrentRuns: options.maxConcurrentRuns ?? 5,
      onEvent: (runId, event) => this.broadcastToSubscribers(runId, event),
    });

    // Initialize SessionManager with event forwarding
    this.sessionManager = new SessionManager({
      onSessionEvent: (sessionId, event) => this.broadcastSessionEvent(sessionId, event),
    });

    // Initialize CLI Session Store (모드 불문 — CLI Runner는 항상 사용 가능)
    this.cliSessionStore = new CliSessionStore();

    // Initialize Worker Registry
    this.workerRegistry = new WorkerRegistry();

    // Initialize LocalContextStoreManager
    this.localContextManager = new LocalContextStoreManager();

    // Initialize Channel Manager (always needed for broadcast)
    this.channelManager = new ChannelManager();
    const dashboardChannel = new DashboardChannel();
    dashboardChannel.setBroadcast((event, payload) => {
      this.broadcastToAll(event, payload);
    });
    this.channelManager.register(dashboardChannel).catch(() => {});

    // Register Telegram channel if configured
    try {
      const telegramConfig = loadConfig().telegram;
      if (telegramConfig?.token && telegramConfig.allowedUsers?.length > 0) {
        const telegramChannel = new TelegramChannel(telegramConfig);
        this.channelManager.register(telegramChannel).catch(() => {});
      }
    } catch {
      // Telegram channel is optional
    }

    // Initialize RPC Router
    this.rpcRouter = new RpcRouter();

    // ── MemoryStore: 모든 모드에서 초기화 (CLI Runner 결과 저장) ──
    const userConfig = loadConfig();
    const v2Config = resolveV2Config(userConfig);
    this.memoryStore = new MemoryStore(v2Config.memory);

    // ── Mode-specific initialization ──
    if (this.mode !== 'codex') {
      // Legacy/Hybrid: full Agent + Worker initialization

      this.workerManager = new WorkerManager({
        config: v2Config.worker,
        maxConcurrent: v2Config.agent.maxConcurrentWorkers,
        apiKey: v2Config.agent.apiKey,
        apiModel: v2Config.agent.model,
      });

      const agentConfig = v2Config.agent;
      const provider = createAIProvider(agentConfig);
      const analyzer = new CommandAnalyzer(provider);
      const planner = new ExecutionPlanner(provider);
      const reviewer = new ResultReviewer(provider);
      const reporter = new AgentReporter();

      this.agent = new CodexAgent({
        config: agentConfig,
        analyzer,
        planner,
        reviewer,
        reporter,
        workerManager: this.workerManager,
        securityConfig: v2Config.security,
        memoryStore: this.memoryStore,
      });

      // Wire agent events
      this.agent.on('progress', (payload: unknown) => {
        this.broadcastToAll('agent:progress', payload);
      });
      this.agent.on('result', (payload: unknown) => {
        this.broadcastToAll('agent:result', payload);
        const taskSnapshot = this.agent!.currentTask ? { ...this.agent!.currentTask } : null;
        this.persistAgentResult(payload, taskSnapshot);
      });
      this.agent.on('error', (payload: unknown) => {
        this.broadcastToAll('agent:error', payload);
      });
      this.agent.on('approval', (payload: unknown) => {
        this.broadcastToAll('agent:approval', payload);
      });

      // Wire worker events
      this.workerManager.on('worker:started', (payload: unknown) => {
        this.broadcastToAll('worker:started', payload);
      });
      this.workerManager.on('worker:output', (payload: unknown) => {
        this.broadcastToAll('worker:output', payload);
      });
      this.workerManager.on('worker:done', (payload: unknown) => {
        this.broadcastToAll('worker:done', payload);
      });

      // Register system methods with agent/worker info
      registerSystemMethods(this.rpcRouter, {
        getUptime: () => Date.now() - this.startTime,
        getAgentState: () => this.agent!.state,
        getActiveWorkerCount: () => this.workerManager!.getActiveCount(),
        getConnectedClientCount: () => this.clients.size,
        getActiveSessionCount: () => this.sessionManager.getAll().filter(s => s.status === 'active').length,
      });

      // Register agent/worker RPC methods
      registerAgentMethods(this.rpcRouter, {
        agent: this.agent,
        workerManager: this.workerManager,
        sessionManager: this.sessionManager,
        memoryStore: this.memoryStore,
      });
    } else {
      // Codex mode: slim Gateway — no Agent/Worker, only Codex RPC
      registerSystemMethods(this.rpcRouter, {
        getUptime: () => Date.now() - this.startTime,
        getAgentState: () => 'CODEX_MODE',
        getActiveWorkerCount: () => 0,
        getConnectedClientCount: () => this.clients.size,
        getActiveSessionCount: () => this.sessionManager.getAll().filter(s => s.status === 'active').length,
      });

      // Memory RPC — codex 모드에서도 검색/통계 제공
      if (this.memoryStore) {
        registerMemoryMethods(this.rpcRouter, { memoryStore: this.memoryStore });
      }
    }

    // Wire Codex Adapter if provided (hybrid/codex mode)
    if (options.codexAdapter) {
      this.codexAdapter = options.codexAdapter;
      this.codexAdapter.setBroadcast((eventType, payload) => this.broadcastToAll(eventType, payload));
      this.codexAdapter.setLocalContextManager(this.localContextManager);
      this.codexAdapter.setWorkerRegistry(this.workerRegistry);
      this.codexAdapter.registerRpcMethods(this.rpcRouter);
    }

    // Wire Gemini Advisor if provided
    if (options.geminiAdvisor) {
      this.geminiAdvisor = options.geminiAdvisor;
      this.geminiAdvisor.setLocalContextManager(this.localContextManager);
      this.geminiAdvisor.startAnalysis(); // Analysis starts AFTER context store is ready
      this.geminiAdvisor.on('status', (status: unknown) => {
        this.broadcastToAll('gemini:status', status);
      });
      this.geminiAdvisor.on('analysis:complete', (analysis: unknown) => {
        this.broadcastToAll('gemini:analysis', analysis);
      });
      this.geminiAdvisor.on('alert', (alert: unknown) => {
        this.broadcastToAll('gemini:alert', alert);
      });
      // Generate and broadcast Codex briefing after initial analysis completes
      this.geminiAdvisor.once('initial-analysis:complete', () => {
        this.generateCodexBriefing().catch(() => {});
      });
    }

    // Wire worker:died event from WorkerRegistry
    this.workerRegistry.on('worker:died', (payload: { workerId: string; taskIds: string[] }) => {
      this.broadcastToAll('worker:task:failed', payload);
    });

    // Usage monitor — polls statusline sidecar JSON
    this.usageMonitor = new UsageMonitor();
  }

  async start(): Promise<{ port: number; host: string; apiKey: string }> {
    // I3/L1: Initialize memory store with warning on failure
    if (this.memoryStore) {
      await this.memoryStore.initialize().catch((err) => {
        console.warn(`[Gateway] Memory store init failed (operating without persistence): ${(err as Error).message}`);
      });
    }

    // Initialize CLI session store
    await this.cliSessionStore.initialize().catch((err) => {
      console.warn(`[Gateway] CLI session store init failed (operating without persistence): ${(err as Error).message}`);
    });

    // Start zombie worker detection
    this.workerRegistry.startStaleCheck();

    // Start usage monitor
    if (this.usageMonitor) {
      this.usageMonitor.start();
      this.usageMonitor.on('update', (data) => {
        this.broadcastToAll('usage:update', data);
      });
    }

    // Ensure API key exists (creates one if not)
    const config = loadConfig();

    return new Promise((resolve, reject) => {
      // Create HTTP server with API handler
      const apiHandler = createApiHandler({
        runManager: this.runManager,
        sessionManager: this.sessionManager,
        cliSessionStore: this.cliSessionStore,
        memoryStore: this.memoryStore ?? undefined,
        codexAdapter: this.codexAdapter ?? undefined,
        geminiAdvisor: this.geminiAdvisor ?? undefined,
        workerRegistry: this.workerRegistry,
        localContextManager: this.localContextManager,
        server: this,
        onRunCreated: () => this.broadcastRunsList(),
        onSessionEvent: (sessionId, event) => this.broadcastSessionEvent(sessionId, event),
        onContextEvent: (eventType, payload) => this.broadcastContextEvent(eventType, payload),
        onSessionsChanged: () => this.broadcastSessionsList(),
        onCliComplete: (result) => this.broadcastToAll('cli:complete', result),
        onCliStream: (chunk) => this.broadcastToAll('cli:stream', chunk),
        onWorkerEvent: (eventType, payload) => this.broadcastToAll(eventType, payload),
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

      // Session reconcile timer (every 30 seconds)
      // Cleans timed-out sessions, broadcasts changes
      this.sessionCleanupTimer = setInterval(() => {
        const changed = this.sessionManager.reconcileSessions();
        if (changed) {
          this.broadcastSessionsList();
        }
      }, 30_000);

      this.httpServer.listen(this.port, this.host, () => {
        resolve({ port: this.port, host: this.host, apiKey: config.apiKey });
      });
      this.httpServer.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    // L5: Graceful shutdown — stop accepting new work, drain existing
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.sessionCleanupTimer) clearInterval(this.sessionCleanupTimer);

    // Cancel all active runs
    this.runManager.cancelAllRuns();

    // Terminate agent and workers (if initialized)
    if (this.agent) this.agent.cancel();
    if (this.workerManager) this.workerManager.terminateAll();
    await this.channelManager.destroyAll();

    // Notify clients before closing
    for (const [, client] of this.clients) {
      try {
        client.ws.close(1001, 'Gateway shutting down');
      } catch {
        // Client may already be disconnected
      }
    }
    this.clients.clear();

    // Shutdown Gemini Advisor
    if (this.geminiAdvisor) {
      await this.geminiAdvisor.shutdown().catch(() => {});
    }

    // Stop usage monitor
    if (this.usageMonitor) {
      this.usageMonitor.stop();
    }

    // Stop zombie worker detection
    this.workerRegistry.stopStaleCheck();

    // Close stores last (may have pending writes)
    if (this.memoryStore) this.memoryStore.close();
    this.localContextManager.closeAll();
    this.cliSessionStore.close();
    this.workerRegistry.dispose();

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

  getRpcRouter(): RpcRouter {
    return this.rpcRouter;
  }

  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  getAgent(): CodexAgent | null {
    return this.agent;
  }

  getWorkerManager(): WorkerManager | null {
    return this.workerManager;
  }

  getChannelManager(): ChannelManager {
    return this.channelManager;
  }

  getMemoryStore(): MemoryStore | null {
    return this.memoryStore;
  }

  getWorkerRegistry(): WorkerRegistry {
    return this.workerRegistry;
  }

  getLocalContextManager(): LocalContextStoreManager {
    return this.localContextManager;
  }

  getMode(): string {
    return this.mode;
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

          const payload = msg.payload as SubscribePayload;

          // Handle session subscription
          if (payload.sessionId) {
            client.subscribedSessions.add(payload.sessionId);

            // Replay buffered output for this session
            const bufferedOutputs = this.sessionManager.getOutputBuffer(payload.sessionId);
            for (const entry of bufferedOutputs) {
              this.send(ws, createMessage('session:screen', {
                sessionId: payload.sessionId,
                content: entry.content,
                timestamp: entry.timestamp,
              }));
            }
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

          const payload = msg.payload as UnsubscribePayload;
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

        case 'rpc': {
          const client = this.clients.get(clientId);
          this.rpcRouter.handleRpc(
            msg as WsMessage<RpcRequestPayload>,
            {
              clientId,
              ws,
              authenticated: client?.authenticated ?? false,
            },
            (targetWs, message) => this.send(targetWs as WebSocket, message as WsMessage),
          );
          break;
        }
      }
    });

    ws.on('close', () => {
      // O2: Clean up client subscriptions on disconnect
      const client = this.clients.get(clientId);
      if (client) {
        client.subscribedRuns.clear();
        client.subscribedSessions.clear();
      }
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

    // Reconcile sessions (timeout cleanup)
    this.sessionManager.reconcileSessions();

    // Send list of active sessions
    const sessions = this.sessionManager.getAll().filter(s => s.status === 'active');
    this.send(ws, createMessage('sessions:list', { sessions, availableSessions: [] }));

    // Send current Gemini Advisor status
    if (this.geminiAdvisor) {
      this.send(ws, createMessage('gemini:status', this.geminiAdvisor.getStatus()));
    }

    // Send last Codex greeting to late-connecting clients
    if (this.lastGreeting) {
      this.send(ws, createMessage('codex:greeting', this.lastGreeting));
    }

    // Send current usage data
    if (this.usageMonitor) {
      const usageData = this.usageMonitor.getData();
      if (usageData) {
        this.send(ws, createMessage('usage:update', usageData));
      }
    }
  }

  /**
   * Broadcast session event to clients subscribed to a specific session
   */
  private broadcastSessionEvent(sessionId: string, event: SessionEvent): void {
    let messageType: string;
    let payload: Record<string, unknown>;

    switch (event.type) {
      case 'screen':
        messageType = 'session:screen';
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
   * Broadcast sessions:list to ALL authenticated clients
   * Used when a session is connected, created, or closed
   */
  broadcastSessionsList(): void {
    const sessions = this.sessionManager.getAll().filter(s => s.status === 'active');

    const message = createMessage('sessions:list', { sessions, availableSessions: [] });
    const raw = JSON.stringify(message);

    for (const [, client] of this.clients) {
      if (client.authenticated && client.ws.readyState === WebSocket.OPEN) {
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

  /**
   * Broadcast context events to ALL authenticated clients
   */
  broadcastContextEvent(eventType: string, payload: unknown): void {
    const message = createMessage(eventType, payload);
    const raw = JSON.stringify(message);

    for (const [, client] of this.clients) {
      if (client.authenticated && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(raw);
      }
    }
  }

  /**
   * Generate a Codex briefing from Gemini analysis, worker status, and project context.
   * Attempts Codex CLI for natural Korean greeting; falls back to template on failure.
   */
  private async generateCodexBriefing(): Promise<void> {
    // Collect context pieces
    const geminiContext = this.geminiAdvisor?.buildCodexContext?.() ?? '';
    const workers = this.workerRegistry.getAll();
    const workerLines = workers.length > 0
      ? workers.map(w => `- ${w.name}: ${w.status} (project: ${w.projectPath})`).join('\n')
      : '- No workers registered';

    let projectSummary = '';
    try {
      const rootStore = await this.localContextManager.getRootStore(process.cwd());
      const projects = rootStore.getAllProjects();
      if (projects.length > 0) {
        projectSummary = projects
          .slice(0, 10)
          .map(p => `- ${p.projectName}: ${p.summary ?? 'no summary'}`)
          .join('\n');
      }
    } catch { /* LocalContextStore may not be initialized */ }

    // Try Codex CLI for natural briefing
    try {
      const { runCli } = await import('./cli-runner.js');
      const combinedPrompt = [
        '### SYSTEM',
        'You are Olympus Codex. Generate a brief Korean startup greeting for the user.',
        'Include: project status overview, worker status, key issues/recommendations.',
        'Be concise, friendly, use Korean. No more than 300 words.',
        '',
        '### CONTEXT',
        geminiContext || '(No Gemini analysis available)',
        '',
        '## Worker Status',
        workerLines,
        '',
        '## Project Summary',
        projectSummary || '(No project data available)',
        '',
        '### INSTRUCTION',
        '위 정보를 바탕으로 사용자에게 인사하면서 전체 상황을 브리핑하세요.',
      ].join('\n');

      const result = await runCli({
        prompt: combinedPrompt,
        provider: 'codex',
        model: 'gpt-5.3-codex',
        dangerouslySkipPermissions: true,
        timeoutMs: 60_000,
      });

      if (result.success && result.text) {
        this.lastGreeting = { type: 'briefing', text: result.text, timestamp: Date.now() };
        this.broadcastToAll('codex:greeting', this.lastGreeting);
        return;
      }
    } catch { /* Codex CLI failed, fall back to template */ }

    // Template fallback
    const lines: string[] = ['🏛️ Olympus 시작 브리핑', ''];
    if (projectSummary) {
      lines.push('📊 프로젝트 현황:', projectSummary, '');
    }
    lines.push('👷 워커 현황:', workerLines, '');
    if (geminiContext) {
      lines.push('💡 Gemini 분석:', geminiContext.slice(0, 500), '');
    }
    this.lastGreeting = { type: 'briefing', text: lines.join('\n'), timestamp: Date.now() };
    this.broadcastToAll('codex:greeting', this.lastGreeting);
  }

  /**
   * Broadcast event to ALL authenticated clients
   */
  /**
   * Persist agent task result to memory store for learning.
   * L2 fix: accepts a pre-captured task snapshot to avoid race with resetToIdle.
   */
  private persistAgentResult(payload: unknown, taskSnapshot?: import('@olympus-dev/protocol').AgentTask | null): void {
    if (!this.memoryStore) return;
    try {
      const { taskId, report } = payload as {
        taskId: string;
        report: { status: string; summary: string; changedFiles: string[] };
      };
      const task = taskSnapshot ?? this.agent?.currentTask;
      this.memoryStore.saveTask({
        id: taskId,
        command: task?.command ?? '',
        analysis: task?.analysis ? JSON.stringify(task.analysis) : '',
        plan: task?.plan ? JSON.stringify(task.plan) : '',
        result: report?.summary ?? '',
        success: report?.status === 'success',
        duration: task?.startedAt ? Date.now() - task.startedAt : 0,
        timestamp: Date.now(),
        projectPath: task?.analysis?.targetProject ?? '',
        workerCount: task?.workers.length ?? 0,
      });
    } catch {
      // Memory persistence is best-effort
    }
  }

  private broadcastToAll(eventType: string, payload: unknown): void {
    const message = createMessage(eventType, payload);
    const raw = JSON.stringify(message);

    for (const [clientId, client] of this.clients) {
      if (client.authenticated && client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(raw);
        } catch (err) {
          // J1: Log broadcast errors instead of silently ignoring
          console.warn(`[Gateway] Broadcast to ${clientId} failed: ${(err as Error).message}`);
        }
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
