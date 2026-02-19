import { useState, useEffect, useRef, useCallback } from 'react';
import { OlympusClient } from '@olympus-dev/client';
import { DEFAULT_GATEWAY_PORT, DEFAULT_GATEWAY_HOST } from '@olympus-dev/protocol';
import type {
  PhasePayload,
  TaskPayload,
  AgentPayload,
  LogPayload,
  SnapshotPayload,
  RunStatus,
  SessionInfo,
  AvailableSession,
  CliRunResult,
  RegisteredWorker,
  StatuslineUsageData,
  CliSessionRecord,
} from '@olympus-dev/protocol';

export interface SessionOutput {
  sessionId: string;
  content: string;
  timestamp: number;
}

export interface AgentProgress {
  taskId: string;
  state: string;
  message: string;
  progress?: number;
  workerCount?: number;
  completedWorkers?: number;
}

export interface WorkerInfo {
  workerId: string;
  projectPath: string;
  status: 'running' | 'completed' | 'failed';
  output: string;
}

export interface CliHistoryItem {
  sessionKey: string;
  prompt: string;
  text: string;
  usage: { inputTokens: number; outputTokens: number };
  cost: number;
  durationMs: number;
  timestamp: number;
}

export interface CliStreamState {
  sessionKey: string;
  chunks: string[];
  startedAt: number;
  active: boolean;
}

export interface WorkerTaskEntry {
  taskId: string;
  workerId: string;
  workerName: string;
  workerColor?: string;
  prompt: string;
  status: 'active' | 'completed' | 'failed' | 'timeout';
  startedAt: number;
  completedAt?: number;
  summary?: string;
  durationMs?: number;
}

export interface TaskHistoryItem {
  id: string;
  command: string;
  status: 'success' | 'partial' | 'failed';
  summary: string;
  duration: number;
  timestamp: number;
  workerCount: number;
}

export interface PendingApproval {
  taskId: string;
  command: string;
  analysis: Record<string, unknown>;
  plan: Record<string, unknown>;
  timestamp: number;
}

export interface WorkerConfigEntry {
  id: string;
  name: string;
  emoji?: string;
  color: string;
  avatar: string;
  projectPath?: string;
  registeredName?: string;
}

export interface WorkerLogEntry {
  taskId: string;
  prompt: string;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  summary?: string;
  rawText?: string;
  durationMs?: number;
  cost?: number;
  geminiReview?: { quality: string; summary: string; concerns: string[] };
  startedAt: number;
  completedAt?: number;
}

export interface ActivityEventEntry {
  id: string;
  type: string;
  agentName: string;
  message: string;
  timestamp: number;
  color?: string;
}

export interface SystemStatsEntry {
  totalWorkers: number;
  activeWorkers: number;
  totalTokens: number;
  failedTasks: number;
}

export interface OlympusState {
  connected: boolean;
  phase: PhasePayload | null;
  tasks: TaskPayload[];
  logs: LogPayload[];
  agentStreams: Map<string, string>;
  runs: RunStatus[];
  sessions: SessionInfo[];
  availableSessions: AvailableSession[];
  currentRunId: string | null;
  currentSessionId: string | null;
  sessionOutputs: SessionOutput[];
  /** Terminal mirror: full screen snapshot per session (replace, not append) */
  sessionScreens: Map<string, string>;
  error: string | null;
  // V2 Agent/Worker state
  agentState: string;
  agentProgress: AgentProgress | null;
  agentTaskId: string | null;
  workers: Map<string, WorkerInfo>;
  taskHistory: TaskHistoryItem[];
  pendingApproval: PendingApproval | null;
  cliHistory: CliHistoryItem[];
  cliStreams: Map<string, CliStreamState>;
  workerTasks: WorkerTaskEntry[];
  cliSessions: CliSessionRecord[];
  // Olympus Mountain dashboard extensions
  workerConfigs: WorkerConfigEntry[];
  workerBehaviors: Record<string, string>;
  codexBehavior: string;
  geminiBehavior: string;
  geminiCurrentTask: string | null;
  geminiCacheCount: number;
  geminiLastAnalyzed: number | null;
  activityEvents: ActivityEventEntry[];
  systemStats: SystemStatsEntry;
  usageData: StatuslineUsageData | null;
  geminiAlerts: Array<{ id: string; severity: string; message: string; projectPath: string; timestamp: number }>;
  geminiReviews: Array<{ taskId: string; quality: string; summary: string; concerns: string[]; reviewedAt: number }>;
  // Worker task completion events for ChatWindow
  lastWorkerCompletion: {
    workerId: string;
    workerName: string;
    summary: string;
    success: boolean;
    timestamp: number;
  } | null;
  // Worker log panel
  workerLogs: Map<string, WorkerLogEntry[]>;
  selectedWorkerId: string | null;
}

export interface UseOlympusOptions {
  port?: number;
  host?: string;
  apiKey?: string;
}

// ---------------------------------------------------------------------------
// Worker color palette for auto-assignment
// ---------------------------------------------------------------------------

const WORKER_COLORS = ['#4FC3F7', '#FF7043', '#66BB6A', '#AB47BC', '#FFCA28', '#EF5350'];
const WORKER_AVATARS = ['athena', 'poseidon', 'ares', 'apollo', 'artemis', 'hermes', 'hephaestus', 'dionysus', 'demeter', 'aphrodite', 'hades', 'persephone', 'prometheus', 'helios', 'nike', 'pan', 'hecate', 'iris', 'heracles'];
const ACTIVE_BEHAVIORS = new Set(['working', 'thinking', 'reviewing', 'deploying', 'analyzing', 'collaborating', 'chatting']);

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function registeredWorkerToConfig(w: RegisteredWorker, _index: number): WorkerConfigEntry {
  const h = simpleHash(w.id);
  const avatarName = WORKER_AVATARS[h % WORKER_AVATARS.length];
  return {
    id: w.id,
    name: avatarName.charAt(0).toUpperCase() + avatarName.slice(1),
    color: WORKER_COLORS[h % WORKER_COLORS.length],
    avatar: avatarName,
    projectPath: w.projectPath,
    registeredName: w.name,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useOlympus(options: UseOlympusOptions = {}) {
  const clientRef = useRef<OlympusClient | null>(null);
  const [state, setState] = useState<OlympusState>({
    connected: false,
    phase: null,
    tasks: [],
    logs: [],
    agentStreams: new Map(),
    runs: [],
    sessions: [],
    availableSessions: [],
    currentRunId: null,
    currentSessionId: null,
    sessionOutputs: [],
    sessionScreens: new Map(),
    error: null,
    agentState: 'IDLE',
    agentProgress: null,
    agentTaskId: null,
    workers: new Map(),
    taskHistory: [],
    pendingApproval: null,
    cliHistory: [],
    cliStreams: new Map(),
    workerTasks: [],
    cliSessions: [],
    // Olympus Mountain extensions
    workerConfigs: [],
    workerBehaviors: {},
    codexBehavior: 'supervising',
    geminiBehavior: 'offline',
    geminiCurrentTask: null,
    geminiCacheCount: 0,
    geminiLastAnalyzed: null,
    activityEvents: (() => {
      try {
        const saved = localStorage.getItem('olympus-activity-events');
        return saved ? JSON.parse(saved) : [];
      } catch { return []; }
    })(),
    systemStats: { totalWorkers: 0, activeWorkers: 0, totalTokens: 0, failedTasks: 0 },
    usageData: null,
    geminiAlerts: [],
    geminiReviews: [],
    lastWorkerCompletion: null,
    workerLogs: new Map(),
    selectedWorkerId: null,
  });

  const { port, host, apiKey } = options;
  const prevBehaviorsRef = useRef<Record<string, string>>({});
  const connectTimeRef = useRef<number>(Date.now());

  // =========================================================================
  // Main connection effect (existing)
  // =========================================================================

  useEffect(() => {
    connectTimeRef.current = Date.now();

    // Don't attempt connection without API key
    if (!apiKey) {
      setState((s) => ({ ...s, connected: false, error: 'API key required. Configure in Settings.' }));
      return;
    }

    const client = new OlympusClient({
      clientType: 'web',
      port: port ?? DEFAULT_GATEWAY_PORT,
      host: host ?? DEFAULT_GATEWAY_HOST,
      apiKey,
    });
    clientRef.current = client;

    client.on('connected', () => {
      setState((s) => ({ ...s, connected: true, error: null }));
    });

    client.onRunsList((runs: RunStatus[]) => {
      setState((s) => ({ ...s, runs }));
    });

    client.onSessionsList((payload: unknown) => {
      const data = payload as { sessions?: SessionInfo[]; availableSessions?: AvailableSession[] };
      // Handle both array (old format) and object (new format)
      const newSessions = Array.isArray(data) ? data as SessionInfo[] : (data.sessions ?? []);
      const newAvailable = Array.isArray(data) ? [] : (data.availableSessions ?? []);

      setState((s) => {
        const activeSessions = newSessions.filter(sess => sess.status === 'active');

        // Auto-subscribe to first active session if none currently selected
        if (!s.currentSessionId && !s.currentRunId && activeSessions.length > 0) {
          const first = activeSessions[0];
          client.subscribeSession(first.id);
          return {
            ...s,
            sessions: newSessions,
            availableSessions: newAvailable,
            currentSessionId: first.id,
          };
        }

        return {
          ...s,
          sessions: newSessions,
          availableSessions: newAvailable,
        };
      });
    });

    client.onSnapshot((snap: SnapshotPayload) => {
      setState((s) => ({
        ...s,
        connected: true,
        phase: { phase: snap.phase, phaseName: snap.phaseName, status: 'started' },
        tasks: snap.tasks,
      }));
    });

    client.onPhase((p: PhasePayload) => {
      setState((s) => ({ ...s, phase: p }));
    });

    client.onTask((t: TaskPayload) => {
      setState((s) => {
        const tasks = [...s.tasks];
        const idx = tasks.findIndex((x) => x.taskId === t.taskId);
        if (idx >= 0) tasks[idx] = t;
        else tasks.push(t);
        return { ...s, tasks };
      });
    });

    client.onAgentChunk((a: AgentPayload) => {
      setState((s) => {
        const streams = new Map(s.agentStreams);
        streams.set(a.agentId, (streams.get(a.agentId) ?? '') + (a.content ?? ''));
        return { ...s, agentStreams: streams };
      });
    });

    client.onAgentComplete(() => {
      setState((s) => ({ ...s, agentStreams: new Map() }));
    });

    client.onLog((l: LogPayload) => {
      setState((s) => ({ ...s, logs: [...s.logs.slice(-99), l] }));
    });

    client.onSessionOutput((p) => {
      const payload = p as { sessionId: string; content: string; timestamp?: number };
      setState((s) => ({
        ...s,
        sessionOutputs: [...s.sessionOutputs.slice(-49), { sessionId: payload.sessionId, content: payload.content, timestamp: payload.timestamp ?? Date.now() }],
        logs: [...s.logs.slice(-99), { level: 'info', message: `[session:screen] ${payload.content.slice(0, 200)}${payload.content.length > 200 ? '...' : ''}` }],
      }));
    });

    client.onSessionScreen((p) => {
      const payload = p as { sessionId: string; content: string };
      setState((s) => {
        const screens = new Map(s.sessionScreens);
        screens.set(payload.sessionId, payload.content);
        return { ...s, sessionScreens: screens };
      });
    });

    client.onSessionError((p) => {
      setState((s) => ({
        ...s,
        logs: [...s.logs.slice(-99), { level: 'error', message: `[session:error] ${p.error}` }],
      }));
    });

    client.onSessionClosed((p) => {
      setState((s) => {
        const screens = new Map(s.sessionScreens);
        screens.delete(p.sessionId);
        return {
          ...s,
          currentSessionId: s.currentSessionId === p.sessionId ? null : s.currentSessionId,
          sessionOutputs: s.sessionOutputs.filter(o => o.sessionId !== p.sessionId),
          sessionScreens: screens,
          logs: [...s.logs.slice(-99), { level: 'warn', message: `[session:closed] Session ${p.sessionId} ended` }],
        };
      });
    });

    // Codex session events
    client.onCodexSessionEvent((p) => {
      setState((s) => ({
        ...s,
        logs: [...s.logs.slice(-99), { level: 'info', message: `[codex:session] ${p.projectName ?? p.sessionId}: ${p.status}` }],
      }));
    });

    // V2 Agent events
    client.onAgentProgress((p) => {
      const progress = p as AgentProgress;
      setState((s) => ({
        ...s,
        agentState: progress.state,
        agentProgress: progress,
        agentTaskId: progress.taskId,
        logs: [...s.logs.slice(-99), { level: 'info', message: `[agent] ${progress.message}` }],
      }));
    });

    client.onAgentResult((p) => {
      const { taskId, report } = p as { taskId: string; report: { status: string; summary: string } };
      setState((s) => {
        const historyItem: TaskHistoryItem = {
          id: taskId,
          command: s.agentProgress?.message ?? '',
          status: report.status as 'success' | 'partial' | 'failed',
          summary: report.summary,
          duration: 0,
          timestamp: Date.now(),
          workerCount: s.workers.size,
        };
        return {
          ...s,
          agentState: 'IDLE',
          agentProgress: null,
          agentTaskId: null,
          pendingApproval: null,
          taskHistory: [historyItem, ...s.taskHistory].slice(0, 50),
          logs: [...s.logs.slice(-99), { level: report.status === 'success' ? 'info' : 'error', message: `[agent:result] ${report.summary}` }],
        };
      });
    });

    client.onAgentApproval((p) => {
      const { taskId, request } = p as { taskId: string; request: PendingApproval };
      setState((s) => ({
        ...s,
        pendingApproval: { ...request, taskId },
        logs: [...s.logs.slice(-99), { level: 'warn', message: `[agent:approval] 승인 대기: ${request.command}` }],
      }));
    });

    // Worker task events (즉시 행동 반영)
    client.on('worker:task:assigned', (m) => {
      const payload = m.payload as { workerId: string; taskId: string; prompt?: string; workerName?: string };
      if (payload.workerId) {
        setState((s) => {
          const workerLogs = new Map(s.workerLogs);
          const entries = [...(workerLogs.get(payload.workerId) ?? [])];
          entries.push({
            taskId: payload.taskId,
            prompt: payload.prompt ?? '',
            status: 'running',
            startedAt: Date.now(),
          });
          workerLogs.set(payload.workerId, entries.slice(-20));
          return {
            ...s,
            workerBehaviors: { ...s.workerBehaviors, [payload.workerId]: 'working' },
            workerTasks: [
              ...s.workerTasks.filter(t => t.status !== 'active' || t.workerId !== payload.workerId),
              {
                taskId: payload.taskId,
                workerId: payload.workerId,
                workerName: payload.workerName ?? payload.workerId,
                prompt: payload.prompt ?? '',
                status: 'active' as const,
                startedAt: Date.now(),
              },
            ],
            workerLogs,
          };
        });
      }
    });

    client.on('worker:task:completed', (m) => {
      const payload = m.payload as { workerId?: string; taskId: string; status?: string; summary?: string; workerName?: string; durationMs?: number; success?: boolean; rawText?: string; cost?: number; geminiReview?: { quality: string; summary: string; concerns: string[]; reviewedAt?: number } };
      const wId = payload.workerId;
      if (wId) {
        setState((s) => {
          const completedTask = s.workerTasks.find(t => t.taskId === payload.taskId) ??
            { taskId: payload.taskId, workerId: wId, workerName: payload.workerName ?? wId, prompt: '', startedAt: Date.now() };
          const newTask: WorkerTaskEntry = {
            ...completedTask,
            status: payload.status === 'completed' ? 'completed' : 'failed',
            completedAt: Date.now(),
            summary: payload.summary,
            durationMs: payload.durationMs ?? (Date.now() - completedTask.startedAt),
          };
          const success = payload.success ?? (payload.status === 'completed');
          const geminiReviews = payload.geminiReview
            ? [...s.geminiReviews.slice(-19), {
                taskId: payload.taskId,
                quality: payload.geminiReview.quality,
                summary: payload.geminiReview.summary,
                concerns: payload.geminiReview.concerns,
                reviewedAt: payload.geminiReview.reviewedAt ?? Date.now(),
              }]
            : s.geminiReviews;

          // Update workerLogs
          const workerLogs = new Map(s.workerLogs);
          const entries = [...(workerLogs.get(wId) ?? [])];
          const logIdx = entries.findIndex(e => e.taskId === payload.taskId);
          const logEntry: WorkerLogEntry = {
            taskId: payload.taskId,
            prompt: logIdx >= 0 ? entries[logIdx].prompt : completedTask.prompt ?? '',
            status: success ? 'completed' : 'failed',
            summary: payload.summary,
            rawText: payload.rawText,
            durationMs: payload.durationMs ?? (Date.now() - completedTask.startedAt),
            cost: payload.cost,
            geminiReview: payload.geminiReview ? {
              quality: payload.geminiReview.quality,
              summary: payload.geminiReview.summary,
              concerns: payload.geminiReview.concerns,
            } : undefined,
            startedAt: logIdx >= 0 ? entries[logIdx].startedAt : completedTask.startedAt,
            completedAt: Date.now(),
          };
          if (logIdx >= 0) {
            entries[logIdx] = logEntry;
          } else {
            entries.push(logEntry);
          }
          workerLogs.set(wId, entries.slice(-20));

          return {
            ...s,
            workerBehaviors: {
              ...s.workerBehaviors,
              [wId]: success ? 'completed' : 'error',
            },
            workerTasks: [
              newTask,
              ...s.workerTasks.filter(t => t.taskId !== payload.taskId),
            ].slice(0, 50),
            lastWorkerCompletion: {
              workerId: wId,
              workerName: payload.workerName ?? wId,
              summary: payload.summary ?? (success ? '작업 완료' : '작업 실패'),
              success,
              timestamp: Date.now(),
            },
            geminiReviews,
            workerLogs,
          };
        });
      }
    });

    // Worker task timeout events (30분 타임아웃 → 모니터링)
    client.on('worker:task:timeout', (m) => {
      const payload = m.payload as { workerId?: string; taskId: string; workerName?: string };
      // 타임아웃 모니터링: 워커는 여전히 busy → behavior 유지
      if (payload.workerId) {
        setState((s) => ({
          ...s,
          workerTasks: s.workerTasks.map(t =>
            t.taskId === payload.taskId ? { ...t, status: 'timeout' as const } : t
          ),
          activityEvents: [
            ...s.activityEvents,
            {
              id: crypto.randomUUID(),
              type: 'timeout',
              agentName: payload.workerName ?? payload.workerId ?? 'unknown',
              message: '30분 타임아웃 — 모니터링 중',
              timestamp: Date.now(),
            },
          ].slice(-50),
        }));
      }
    });

    client.on('worker:task:final_after_timeout', (m) => {
      const payload = m.payload as { workerId?: string; taskId: string; status?: string; workerName?: string; success?: boolean };
      const wId = payload.workerId;
      if (wId) {
        setState((s) => ({
          ...s,
          workerBehaviors: {
            ...s.workerBehaviors,
            [wId]: payload.success ? 'completed' : 'error',
          },
          activityEvents: [
            ...s.activityEvents,
            {
              id: crypto.randomUUID(),
              type: 'final_after_timeout',
              agentName: payload.workerName ?? wId,
              message: payload.success ? '타임아웃 후 최종 완료' : '타임아웃 후 실패',
              timestamp: Date.now(),
            },
          ].slice(-50),
        }));
      }
    });

    // Gemini advisor status events
    client.on('gemini:status', (m) => {
      const payload = m.payload as { behavior?: string; currentTask?: string | null; cacheSize?: number; lastAnalyzedAt?: number | null };
      setState((s) => ({
        ...s,
        geminiBehavior: payload.behavior ?? s.geminiBehavior,
        geminiCurrentTask: payload.currentTask ?? s.geminiCurrentTask,
        geminiCacheCount: payload.cacheSize ?? s.geminiCacheCount,
        geminiLastAnalyzed: payload.lastAnalyzedAt ?? s.geminiLastAnalyzed,
      }));
    });

    // Gemini alert events
    client.on('gemini:alert', (m) => {
      const alert = m.payload as { id: string; severity: string; message: string; projectPath: string; timestamp: number };
      setState((s) => ({
        ...s,
        geminiAlerts: [...s.geminiAlerts.slice(-19), alert],
      }));
    });

    // Gemini review → update workerLogs with review data
    client.on('gemini:review', (m) => {
      const payload = m.payload as { taskId: string; workerId?: string; quality: string; summary: string; concerns: string[] };
      if (payload.workerId) {
        setState((s) => {
          const workerLogs = new Map(s.workerLogs);
          const entries = [...(workerLogs.get(payload.workerId!) ?? [])];
          const idx = entries.findIndex(e => e.taskId === payload.taskId);
          if (idx >= 0) {
            entries[idx] = {
              ...entries[idx],
              geminiReview: { quality: payload.quality, summary: payload.summary, concerns: payload.concerns },
            };
            workerLogs.set(payload.workerId!, entries);
          }
          return { ...s, workerLogs };
        });
      }
    });

    // Worker task summary update
    client.on('worker:task:summary', (m) => {
      const payload = m.payload as { taskId: string; workerId?: string; summary: string };
      if (payload.workerId) {
        setState((s) => {
          const workerLogs = new Map(s.workerLogs);
          const entries = [...(workerLogs.get(payload.workerId!) ?? [])];
          const idx = entries.findIndex(e => e.taskId === payload.taskId);
          if (idx >= 0) {
            entries[idx] = { ...entries[idx], summary: payload.summary };
            workerLogs.set(payload.workerId!, entries);
          }
          return { ...s, workerLogs };
        });
      }
    });

    // Worker task failed (zombie detection)
    client.on('worker:task:failed', (m) => {
      const payload = m.payload as { workerId: string; taskIds: string[] };
      if (payload.workerId) {
        setState((s) => {
          const workerLogs = new Map(s.workerLogs);
          const entries = [...(workerLogs.get(payload.workerId) ?? [])];
          for (const taskId of payload.taskIds) {
            const idx = entries.findIndex(e => e.taskId === taskId);
            if (idx >= 0) {
              entries[idx] = { ...entries[idx], status: 'failed', completedAt: Date.now() };
            }
          }
          workerLogs.set(payload.workerId, entries);
          return {
            ...s,
            workerBehaviors: { ...s.workerBehaviors, [payload.workerId]: 'error' },
            workerLogs,
          };
        });
      }
    });

    // V2 Worker events
    client.onWorkerStarted((p) => {
      setState((s) => {
        const workers = new Map(s.workers);
        workers.set(p.workerId, { workerId: p.workerId, projectPath: p.projectPath, status: 'running', output: '' });
        return { ...s, workers };
      });
    });

    client.onWorkerOutput((p) => {
      setState((s) => {
        const workers = new Map(s.workers);
        const existing = workers.get(p.workerId);
        if (existing) {
          workers.set(p.workerId, { ...existing, output: (existing.output + p.content).slice(-5000) });
        }
        return { ...s, workers };
      });
    });

    // CLI stream chunks (real-time stdout)
    client.on('cli:stream', (m) => {
      const payload = m.payload as { sessionKey: string; chunk: string };
      setState((s) => {
        const streams = new Map(s.cliStreams);
        const existing = streams.get(payload.sessionKey);
        if (existing) {
          const chunks = [...existing.chunks, payload.chunk];
          streams.set(payload.sessionKey, { ...existing, chunks: chunks.length > 100 ? chunks.slice(-100) : chunks });
        } else {
          streams.set(payload.sessionKey, { sessionKey: payload.sessionKey, chunks: [payload.chunk], startedAt: Date.now(), active: true });
        }
        return { ...s, cliStreams: streams };
      });
    });

    // Usage data updates
    client.on('usage:update', (m) => {
      const data = m.payload as StatuslineUsageData;
      setState((s) => ({ ...s, usageData: data }));
    });

    client.onCliComplete((result: CliRunResult) => {
      setState((s) => {
        const item: CliHistoryItem = {
          sessionKey: result.sessionId,
          prompt: '',
          text: result.text.slice(0, 2000),
          usage: { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens },
          cost: result.cost,
          durationMs: result.durationMs,
          timestamp: Date.now(),
        };
        // Mark active stream as inactive (sessionKey != result.sessionId)
        const streams = new Map(s.cliStreams);
        for (const [key, stream] of streams) {
          if (stream.active) {
            streams.set(key, { ...stream, active: false });
          }
        }
        return {
          ...s,
          cliHistory: [item, ...s.cliHistory].slice(0, 100),
          cliStreams: streams,
          logs: [...s.logs.slice(-99), { level: 'info', message: `[cli:complete] $${result.cost.toFixed(4)} / ${result.usage.inputTokens + result.usage.outputTokens} tokens` }],
        };
      });
    });

    client.onWorkerDone((p) => {
      const { workerId, result } = p as { workerId: string; result: { status: string; output: string } };
      setState((s) => {
        const workers = new Map(s.workers);
        const existing = workers.get(workerId);
        if (existing) {
          workers.set(workerId, { ...existing, status: result.status === 'completed' ? 'completed' : 'failed', output: result.output || existing.output });
        }
        return { ...s, workers };
      });
    });

    client.onError((e) => {
      setState((s) => ({
        ...s,
        error: `${e.code}: ${e.message}`,
        logs: [...s.logs.slice(-99), { level: 'error', message: `${e.code}: ${e.message}` }],
      }));
    });

    client.connect();
    return () => {
      client.disconnect();
    };
  }, [port, host, apiKey]);

  // =========================================================================
  // Worker polling (GET /api/workers every 10s)
  // =========================================================================

  useEffect(() => {
    if (!apiKey || !host || !port) return;

    const pollWorkers = async () => {
      try {
        const res = await fetch(`http://${host}:${port}/api/workers`, {
          headers: apiKey ? { 'x-api-key': apiKey } : {},
        });
        if (!res.ok) return;
        const data = await res.json() as { workers: RegisteredWorker[] };
        const registeredWorkers = data.workers ?? [];

        setState((s) => {
          // Convert to workerConfigs
          const workerConfigs = registeredWorkers.map((w, i) => registeredWorkerToConfig(w, i));

          // Derive behaviors from worker status + CLI streams
          const workerBehaviors: Record<string, string> = {};
          for (const w of registeredWorkers) {
            // Check CLI stream activity
            const hasActiveStream = Array.from(s.cliStreams.values()).some(
              stream => stream.active && stream.sessionKey.includes(w.id),
            );

            if (w.status === 'failed' as string) {
              workerBehaviors[w.id] = 'error';
            } else if (hasActiveStream) {
              workerBehaviors[w.id] = 'working';
            } else if (w.status === 'busy' && w.currentTaskId) {
              workerBehaviors[w.id] = 'working';
            } else if (w.status === 'busy') {
              workerBehaviors[w.id] = 'thinking';
            } else {
              // Check if recently completed (within last 30s via cliHistory)
              const recentComplete = s.cliHistory.find(
                h => h.sessionKey.includes(w.id) && (Date.now() - h.timestamp) < 30000,
              );
              if (recentComplete) {
                workerBehaviors[w.id] = 'completed';
              } else {
                // Check idle duration
                const idleDuration = Date.now() - w.lastHeartbeat;
                if (idleDuration > 60000 && w.lastHeartbeat > 0) {
                  workerBehaviors[w.id] = 'offline';
                } else {
                  workerBehaviors[w.id] = 'idle';
                }
              }
            }
          }

          // Codex behavior
          let codexBehavior = 'supervising';
          if (!s.connected) {
            codexBehavior = 'offline';
          } else if (registeredWorkers.some(w => w.currentTaskId)) {
            codexBehavior = 'directing';
          } else if (s.agentState !== 'IDLE') {
            codexBehavior = 'analyzing';
          }

          // Detect behavior changes and emit activity events
          const newEvents: ActivityEventEntry[] = [...s.activityEvents];
          for (const w of registeredWorkers) {
            const prevBeh = prevBehaviorsRef.current[w.id];
            const newBeh = workerBehaviors[w.id];
            if (prevBeh && prevBeh !== newBeh) {
              const rw = registeredWorkers.find(r => r.id === w.id);
              const taskContext = rw?.currentTaskPrompt ? `: ${rw.currentTaskPrompt.slice(0, 80)}` : '';
              newEvents.push({
                id: crypto.randomUUID(),
                type: 'state_change',
                agentName: workerConfigs.find(c => c.id === w.id)?.name || w.name || w.id,
                message: `→ ${newBeh}${taskContext}`,
                timestamp: Date.now(),
                color: workerConfigs.find(c => c.id === w.id)?.color,
              });
            }
          }
          prevBehaviorsRef.current = workerBehaviors;

          // Enrich active workerTasks with currentTaskPrompt from polling
          const enrichedTasks = s.workerTasks.map(task => {
            if (task.status === 'active') {
              const rw = registeredWorkers.find(w => w.id === task.workerId);
              if (rw?.currentTaskPrompt && !task.prompt) {
                return { ...task, prompt: rw.currentTaskPrompt };
              }
              // Also update workerName and color from workerConfigs
              const wc = workerConfigs.find(c => c.id === task.workerId);
              if (wc) {
                return { ...task, workerName: wc.name, workerColor: wc.color };
              }
            }
            return task;
          });

          // System stats
          const totalTokens = s.cliHistory.reduce(
            (sum, h) => sum + (h.usage?.inputTokens || 0) + (h.usage?.outputTokens || 0), 0,
          );
          const failedTasks = s.cliHistory.filter(
            h => !h.cost && h.text?.includes('error'),
          ).length;

          return {
            ...s,
            workerConfigs,
            workerBehaviors,
            codexBehavior,
            workerTasks: enrichedTasks,
            activityEvents: newEvents.slice(-50),
            systemStats: {
              totalWorkers: workerConfigs.length,
              activeWorkers: Object.values(workerBehaviors).filter(b => ACTIVE_BEHAVIORS.has(b)).length,
              totalTokens,
              failedTasks,
            },
          };
        });
      } catch {
        // Silently fail polling
      }
    };

    const pollGemini = async () => {
      try {
        const res = await fetch(`http://${host}:${port}/api/gemini-advisor/status`, {
          headers: apiKey ? { 'x-api-key': apiKey } : {},
        });
        if (!res.ok) return;
        const data = await res.json() as {
          running?: boolean;
          behavior?: string;
          currentTask?: string | null;
          cacheSize?: number;
          lastAnalyzedAt?: number | null;
        };
        setState((s) => ({
          ...s,
          geminiBehavior: data.behavior ?? s.geminiBehavior,
          geminiCurrentTask: data.currentTask ?? s.geminiCurrentTask,
          geminiCacheCount: data.cacheSize ?? s.geminiCacheCount,
          geminiLastAnalyzed: data.lastAnalyzedAt ?? s.geminiLastAnalyzed,
        }));
      } catch {
        // Silently fail
      }
    };

    const pollUsage = async () => {
      try {
        const res = await fetch(`http://${host}:${port}/api/usage`, {
          headers: apiKey ? { 'x-api-key': apiKey } : {},
        });
        if (!res.ok) return;
        const data = await res.json() as StatuslineUsageData;
        if (data && data.timestamp) {
          setState((s) => ({ ...s, usageData: data }));
        }
      } catch {
        // Silently fail
      }
    };

    const pollCliSessions = async () => {
      try {
        const res = await fetch(`http://${host}:${port}/api/cli/sessions?limit=20`, {
          headers: apiKey ? { 'x-api-key': apiKey } : {},
        });
        if (!res.ok) return;
        const data = await res.json() as { sessions: CliSessionRecord[] };
        setState((s) => ({ ...s, cliSessions: data.sessions ?? [] }));
      } catch {
        // Silently fail
      }
    };

    const pollWorkerTasks = async () => {
      try {
        const res = await fetch(`http://${host}:${port}/api/workers/tasks`, {
          headers: apiKey ? { 'x-api-key': apiKey } : {},
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.tasks && Array.isArray(data.tasks)) {
          setState((s) => {
            // Merge: keep WebSocket-updated tasks, add any from API that aren't already tracked
            const existingIds = new Set(s.workerTasks.map(t => t.taskId));
            const newTasks = data.tasks
              .filter((t: any) => !existingIds.has(t.taskId))
              .map((t: any) => ({
                taskId: t.taskId,
                workerId: t.workerId,
                workerName: t.workerName,
                prompt: t.prompt ?? '',
                status: t.status === 'running' ? 'active' as const :
                        t.status === 'timeout' ? 'timeout' as const :
                        t.result?.success ? 'completed' as const : 'failed' as const,
                startedAt: t.startedAt,
                completedAt: t.completedAt,
                summary: t.result?.text?.slice(0, 200),
                durationMs: t.completedAt ? t.completedAt - t.startedAt : undefined,
              }));
            if (newTasks.length === 0) return s;
            return { ...s, workerTasks: [...newTasks, ...s.workerTasks].slice(0, 50) };
          });
        }
      } catch {
        // Silently fail
      }
    };

    pollWorkers();
    pollGemini();
    pollUsage();
    pollCliSessions();
    pollWorkerTasks();
    const interval = setInterval(() => { pollWorkers(); pollGemini(); pollUsage(); pollCliSessions(); pollWorkerTasks(); }, 10_000);
    return () => clearInterval(interval);
  }, [apiKey, host, port]);

  // =========================================================================
  // Save activity events to localStorage on change
  // =========================================================================

  useEffect(() => {
    try {
      if (state.activityEvents.length > 0) {
        localStorage.setItem('olympus-activity-events', JSON.stringify(state.activityEvents.slice(-50)));
      }
    } catch {
      // Silently fail localStorage writes
    }
  }, [state.activityEvents]);

  // =========================================================================
  // Actions (existing)
  // =========================================================================

  const subscribe = useCallback((runId: string) => {
    clientRef.current?.subscribe(runId);
    setState((s) => ({ ...s, currentRunId: runId, currentSessionId: null, tasks: [], phase: null, agentStreams: new Map(), sessionOutputs: [] }));
  }, []);

  const unsubscribe = useCallback((runId: string) => {
    clientRef.current?.unsubscribe(runId);
    setState((s) => ({
      ...s,
      currentRunId: s.currentRunId === runId ? null : s.currentRunId,
    }));
  }, []);

  const subscribeSession = useCallback((sessionId: string) => {
    clientRef.current?.subscribeSession(sessionId);
    setState((s) => ({ ...s, currentSessionId: sessionId, currentRunId: null, tasks: [], phase: null, agentStreams: new Map() }));
  }, []);

  const unsubscribeSession = useCallback((sessionId: string) => {
    clientRef.current?.unsubscribeSession(sessionId);
    setState((s) => ({
      ...s,
      currentSessionId: s.currentSessionId === sessionId ? null : s.currentSessionId,
    }));
  }, []);

  const cancel = useCallback((runId?: string, taskId?: string) => {
    clientRef.current?.cancel(runId, taskId);
  }, []);

  const connectAvailableSession = useCallback(async (tmuxSession: string) => {
    try {
      const baseUrl = `http://${host ?? DEFAULT_GATEWAY_HOST}:${port ?? DEFAULT_GATEWAY_PORT}`;
      const res = await fetch(`${baseUrl}/api/sessions/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ chatId: 0, tmuxSession }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
        setState(s => ({ ...s, error: err.message || 'Failed to connect session' }));
        return;
      }
      const data = await res.json();
      const session = data.session;
      if (session?.id) {
        // Subscribe to the newly connected session
        clientRef.current?.subscribeSession(session.id);
        setState(s => ({
          ...s,
          currentSessionId: session.id,
          currentRunId: null,
          tasks: [],
          phase: null,
          agentStreams: new Map(),
          sessionOutputs: [],
          error: null,
        }));
      }
    } catch (e) {
      setState(s => ({ ...s, error: `Failed to connect: ${(e as Error).message}` }));
    }
  }, [host, port, apiKey]);

  const sendAgentCommand = useCallback(async (command: string) => {
    try {
      const gatewayUrl = `http://${host}:${port}`;
      const res = await fetch(`${gatewayUrl}/api/cli/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          prompt: command,
          provider: 'claude',
          dangerouslySkipPermissions: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { message?: string };
        throw new Error(err.message ?? `HTTP ${res.status}`);
      }
      const { result } = await res.json() as { result: { text: string; success: boolean } };
      return result;
    } catch (e) {
      setState(s => ({ ...s, error: `Agent error: ${(e as Error).message}` }));
      return null;
    }
  }, [host, port, apiKey]);

  const cancelAgentTask = useCallback(async () => {
    try {
      await clientRef.current?.cancelAgent();
    } catch (e) {
      setState(s => ({ ...s, error: `Cancel error: ${(e as Error).message}` }));
    }
  }, []);

  const approveTask = useCallback(async (taskId: string) => {
    try {
      await clientRef.current?.approveTask(taskId);
      setState(s => ({ ...s, pendingApproval: null }));
    } catch (e) {
      setState(s => ({ ...s, error: `Approve error: ${(e as Error).message}` }));
    }
  }, []);

  const rejectTask = useCallback(async (taskId: string) => {
    try {
      await clientRef.current?.rejectTask(taskId);
      setState(s => ({ ...s, pendingApproval: null }));
    } catch (e) {
      setState(s => ({ ...s, error: `Reject error: ${(e as Error).message}` }));
    }
  }, []);

  // Codex RPC methods
  const codexRoute = useCallback(async (text: string) => {
    try {
      return await clientRef.current?.codexRoute(text, 'dashboard') ?? null;
    } catch (e) {
      setState(s => ({ ...s, error: `Codex route error: ${(e as Error).message}` }));
      return null;
    }
  }, []);

  const codexProjects = useCallback(async () => {
    try {
      return await clientRef.current?.codexProjects() ?? [];
    } catch {
      return [];
    }
  }, []);

  const codexSessions = useCallback(async () => {
    try {
      return await clientRef.current?.codexSessions() ?? [];
    } catch {
      return [];
    }
  }, []);

  const codexSearch = useCallback(async (query: string) => {
    try {
      return await clientRef.current?.codexSearch(query) ?? [];
    } catch {
      return [];
    }
  }, []);

  // HTTP chat helpers for agent-specific routing
  const chatWithGemini = useCallback(async (message: string): Promise<{ reply: string }> => {
    const res = await fetch(`http://${host}:${port}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
      throw new Error((err as { message?: string }).message ?? `HTTP ${res.status}`);
    }
    return await res.json() as { reply: string };
  }, [host, port, apiKey]);

  const chatWithCodex = useCallback(async (message: string): Promise<{ type: string; response: string }> => {
    const res = await fetch(`http://${host}:${port}/api/codex/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
      throw new Error((err as { message?: string }).message ?? `HTTP ${res.status}`);
    }
    return await res.json() as { type: string; response: string };
  }, [host, port, apiKey]);

  const setSelectedWorkerId = useCallback((workerId: string | null) => {
    setState(s => ({ ...s, selectedWorkerId: workerId }));
  }, []);

  const deleteCliSession = useCallback(async (key: string): Promise<void> => {
    try {
      const res = await fetch(`http://${host}:${port}/api/cli/sessions/${encodeURIComponent(key)}`, {
        method: 'DELETE',
        headers: apiKey ? { 'x-api-key': apiKey } : {},
      });
      if (res.ok) {
        setState(s => ({ ...s, cliSessions: s.cliSessions.filter(sess => sess.key !== key) }));
      }
    } catch {
      // Silently fail
    }
  }, [host, port, apiKey]);

  return {
    ...state,
    subscribe,
    unsubscribe,
    subscribeSession,
    unsubscribeSession,
    cancel,
    connectAvailableSession,
    sendAgentCommand,
    cancelAgentTask,
    approveTask,
    rejectTask,
    codexRoute,
    codexProjects,
    codexSessions,
    codexSearch,
    chatWithGemini,
    chatWithCodex,
    deleteCliSession,
    lastWorkerCompletion: state.lastWorkerCompletion,
    workerLogs: state.workerLogs,
    selectedWorkerId: state.selectedWorkerId,
    setSelectedWorkerId,
  };
}
