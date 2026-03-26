import { useState, useEffect, useRef, useCallback } from 'react';
import { OlympusClient } from '@olympus-dev/client';
import { DEFAULT_GATEWAY_PORT, DEFAULT_GATEWAY_HOST } from '@olympus-dev/protocol';
import { behaviorToOlympusMountainState } from '../lib/state-mapper';
import { WORKER_AVATAR_POOL } from '../lib/avatar-pool';
import type { WorkerBehavior, WorkerDashboardState } from '../lib/types';
import type {
  CliRunResult,
  RegisteredWorker,
  StatuslineUsageData,
} from '@olympus-dev/protocol';

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

export interface SyncStatusEntry {
  lastPollAt: number | null;
  lastWsEventAt: number | null;
  pollFailureCount: number;
  lastPollError: string | null;
}

export interface ProjectTaskSummaryEntry {
  projectId: string;
  counts: {
    blocked: number;
    failed: number;
    risky: number;
    completed: number;
    total: number;
  };
  summary: string;
}

export interface WorkerProjectionTaskEntry {
  taskId: string;
  authorityTaskId: string | null;
  displayLabel: string | null;
  title: string | null;
  status: string | null;
  projectId: string | null;
  parentTaskId: string | null;
  assignedWorkerId: string | null;
  priority: number | null;
  prompt: string | null;
  source: 'authority' | 'worker' | 'runtime';
}

export interface WorkerTerminalProjection {
  workerId: string;
  workerName: string;
  projectPath: string;
  runtimeKind: string;
  snapshotText: string;
  inputLocked: boolean;
  activeTask: WorkerProjectionTaskEntry | null;
  payload: {
    generatedAt: number;
  };
}

export interface OlympusDashboardState {
  connected: boolean;
  error: string | null;
  // V2 Agent/Worker state
  agentState: string;
  agentProgress: AgentProgress | null;
  agentTaskId: string | null;
  workers: Map<string, WorkerInfo>;
  taskHistory: TaskHistoryItem[];
  pendingApproval: PendingApproval | null;
  workerTasks: WorkerTaskEntry[];
  // Olympus Mountain dashboard extensions
  workerConfigs: WorkerConfigEntry[];
  workerBehaviors: Record<string, string>;
  workerDashboardStates: Record<string, WorkerDashboardState>;
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
  // Codex greeting from Gemini initial analysis
  codexGreeting: { text: string; timestamp: number } | null;
  // Worker task completion events for ChatWindow
  lastWorkerCompletion: {
    workerId: string;
    workerName: string;
    summary: string;
    success: boolean;
    timestamp: number;
  } | null;
  // Worker task assignment events for ChatWindow (R2)
  lastWorkerAssignment: {
    taskId: string;
    workerId: string;
    workerName: string;
    prompt: string;
    summary: string;
    timestamp: number;
  } | null;
  // Worker task Codex summary for ChatWindow (replaces raw completion text)
  lastWorkerSummary: {
    workerId: string;
    workerName: string;
    summary: string;
    taskId: string;
    timestamp: number;
  } | null;
  // Worker task failure events for ChatWindow (R2)
  lastWorkerFailure: {
    workerId: string;
    workerName: string;
    summary: string;
    timestamp: number;
  } | null;
  // Worker log panel
  workerLogs: Map<string, WorkerLogEntry[]>;
  workerProjections: Map<string, WorkerTerminalProjection>;
  projectSummaries: ProjectTaskSummaryEntry[];
  selectedWorkerId: string | null;
  syncStatus: SyncStatusEntry;
}

type OlympusInternalState = OlympusDashboardState;

export interface UseOlympusOptions {
  port?: number;
  host?: string;
  apiKey?: string;
}

// ---------------------------------------------------------------------------
// Worker color palette for auto-assignment
// ---------------------------------------------------------------------------

const WORKER_COLORS = ['#4FC3F7', '#FF7043', '#66BB6A', '#AB47BC', '#FFCA28', '#EF5350'];
const ACTIVE_BEHAVIORS = new Set(['working', 'thinking', 'reviewing', 'deploying', 'analyzing', 'collaborating', 'chatting']);
const WORKER_LOGS_STORAGE_KEY = 'olympus-worker-logs-v1';
const WORKER_OUTPUTS_STORAGE_KEY = 'olympus-worker-outputs-v1';
const MAX_PERSISTED_WORKER_LOGS = 20;
const MAX_PERSISTED_WORKER_OUTPUT = 120_000;
const WORKER_BEHAVIOR_VALUES: WorkerBehavior[] = [
  'working', 'idle', 'thinking', 'completed', 'error', 'offline',
  'chatting', 'reviewing', 'deploying', 'resting', 'collaborating',
  'starting', 'supervising', 'directing', 'analyzing', 'meeting',
];
const WORKER_BEHAVIOR_SET = new Set<WorkerBehavior>(WORKER_BEHAVIOR_VALUES);

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function buildWorkerConfigs(workers: RegisteredWorker[]): WorkerConfigEntry[] {
  const usedAvatars = new Set<string>();
  // Sort by id for deterministic assignment order across polls
  const sorted = [...workers].sort((a, b) => a.id.localeCompare(b.id));
  const configMap = new Map<string, WorkerConfigEntry>();

  for (const w of sorted) {
    const h = simpleHash(w.id);
    let idx = h % WORKER_AVATAR_POOL.length;
    // Resolve hash collision: find next available avatar
    let attempts = 0;
    while (usedAvatars.has(WORKER_AVATAR_POOL[idx]) && attempts < WORKER_AVATAR_POOL.length) {
      idx = (idx + 1) % WORKER_AVATAR_POOL.length;
      attempts++;
    }
    const avatarName = WORKER_AVATAR_POOL[idx];
    usedAvatars.add(avatarName);
    configMap.set(w.id, {
      id: w.id,
      name: w.name,
      color: WORKER_COLORS[h % WORKER_COLORS.length],
      avatar: avatarName,
      projectPath: w.projectPath,
      registeredName: w.name,
    });
  }

  // Return in original order
  return workers.map(w => configMap.get(w.id)!);
}

function asWorkerBehavior(input: string | undefined): WorkerBehavior {
  if (input && WORKER_BEHAVIOR_SET.has(input as WorkerBehavior)) return input as WorkerBehavior;
  return 'idle';
}

function createDashboardState(behavior: WorkerBehavior, now = Date.now()): WorkerDashboardState {
  return {
    behavior,
    olympusMountainState: behaviorToOlympusMountainState(behavior),
    currentTask: null,
    taskHistory: [],
    tokenUsage: [],
    totalTokens: 0,
    totalTasks: 0,
    lastActivity: now,
    sessionLog: [],
    uptime: 0,
  };
}

function pushSessionLog(logs: string[], line: string, max = 10): string[] {
  if (!line.trim()) return logs;
  if (logs[logs.length - 1] === line) return logs;
  return [...logs, line].slice(-max);
}

function sessionKeyMatchesWorker(sessionKey: string, workerId: string, workerName?: string): boolean {
  const key = sessionKey.toLowerCase();
  if (key.includes(workerId.toLowerCase())) return true;
  if (workerName && key.includes(workerName.toLowerCase())) return true;
  return false;
}

function getPreferredTelegramChatId(): number | undefined {
  if (typeof window === 'undefined') return undefined;
  const raw = window.localStorage.getItem('olympus.telegram.chatId')
    ?? window.localStorage.getItem('olympus-telegram-chat-id');
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
}

function loadWorkerLogsFromStorage(): Map<string, WorkerLogEntry[]> {
  if (typeof window === 'undefined') return new Map();
  try {
    const raw = window.localStorage.getItem(WORKER_LOGS_STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, WorkerLogEntry[]>;
    if (!parsed || typeof parsed !== 'object') return new Map();
    const map = new Map<string, WorkerLogEntry[]>();
    for (const [workerId, entries] of Object.entries(parsed)) {
      if (!Array.isArray(entries) || entries.length === 0) continue;
      map.set(workerId, entries.slice(-MAX_PERSISTED_WORKER_LOGS));
    }
    return map;
  } catch {
    return new Map();
  }
}

function saveWorkerLogsToStorage(workerLogs: Map<string, WorkerLogEntry[]>): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: Record<string, WorkerLogEntry[]> = {};
    for (const [workerId, entries] of workerLogs.entries()) {
      if (!entries.length) continue;
      payload[workerId] = entries.slice(-MAX_PERSISTED_WORKER_LOGS);
    }
    window.localStorage.setItem(WORKER_LOGS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore localStorage errors
  }
}

function loadWorkersFromStorage(): Map<string, WorkerInfo> {
  if (typeof window === 'undefined') return new Map();
  try {
    const raw = window.localStorage.getItem(WORKER_OUTPUTS_STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, WorkerInfo>;
    if (!parsed || typeof parsed !== 'object') return new Map();
    const map = new Map<string, WorkerInfo>();
    for (const [workerId, info] of Object.entries(parsed)) {
      if (!info || typeof info !== 'object') continue;
      map.set(workerId, {
        workerId,
        projectPath: String(info.projectPath ?? ''),
        status: info.status === 'completed' || info.status === 'failed' ? info.status : 'running',
        output: String(info.output ?? '').slice(-MAX_PERSISTED_WORKER_OUTPUT),
      });
    }
    return map;
  } catch {
    return new Map();
  }
}

function saveWorkersToStorage(workers: Map<string, WorkerInfo>): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: Record<string, WorkerInfo> = {};
    for (const [workerId, info] of workers.entries()) {
      payload[workerId] = {
        workerId,
        projectPath: info.projectPath,
        status: info.status,
        output: info.output.slice(-MAX_PERSISTED_WORKER_OUTPUT),
      };
    }
    window.localStorage.setItem(WORKER_OUTPUTS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore localStorage errors
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useOlympus(options: UseOlympusOptions = {}) {
  const clientRef = useRef<OlympusClient | null>(null);
  const [state, setState] = useState<OlympusInternalState>({
    connected: false,
    error: null,
    agentState: 'IDLE',
    agentProgress: null,
    agentTaskId: null,
    workers: loadWorkersFromStorage(),
    taskHistory: [],
    pendingApproval: null,
    workerTasks: [],
    // Olympus Mountain extensions
    workerConfigs: [],
    workerBehaviors: {},
    workerDashboardStates: {},
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
    codexGreeting: null,
    lastWorkerCompletion: null,
    lastWorkerAssignment: null,
    lastWorkerSummary: null,
    lastWorkerFailure: null,
    workerLogs: loadWorkerLogsFromStorage(),
    workerProjections: new Map(),
    projectSummaries: [],
    selectedWorkerId: null,
    syncStatus: {
      lastPollAt: null,
      lastWsEventAt: null,
      pollFailureCount: 0,
      lastPollError: null,
    },
  });

  const { port, host, apiKey } = options;
  const prevBehaviorsRef = useRef<Record<string, string>>({});
  const connectTimeRef = useRef<number>(Date.now());
  const pollWorkersRef = useRef<(() => Promise<void>) | null>(null);

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
      setState((s) => ({
        ...s,
        connected: true,
        error: null,
        syncStatus: {
          ...s.syncStatus,
          lastWsEventAt: Date.now(),
        },
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
        };
      });
    });

    client.onAgentApproval((p) => {
      const { taskId, request } = p as { taskId: string; request: PendingApproval };
      setState((s) => ({
        ...s,
        pendingApproval: { ...request, taskId },
      }));
    });

    // Unified worker status lifecycle event from Gateway
    client.on('worker:status', (m) => {
      const payload = m.payload as {
        workerId?: string;
        behavior?: string;
        lastActivityAt?: number;
        activeTaskId?: string | null;
        activeTaskPrompt?: string | null;
      };
      if (!payload.workerId) return;
      const workerId = payload.workerId;
      const behavior = asWorkerBehavior(payload.behavior);
      const eventTs = payload.lastActivityAt ?? Date.now();

      setState((s) => {
        const existing = s.workerDashboardStates[workerId] ?? createDashboardState(behavior, eventTs);
        if (eventTs < existing.lastActivity) {
          return {
            ...s,
            syncStatus: {
              ...s.syncStatus,
              lastWsEventAt: Date.now(),
            },
          };
        }

        const nextCurrentTask = payload.activeTaskId
          ? {
              id: payload.activeTaskId,
              title: payload.activeTaskPrompt?.trim() || existing.currentTask?.title || '작업 진행 중',
              status: 'active' as const,
              startedAt: existing.currentTask?.id === payload.activeTaskId ? existing.currentTask.startedAt : eventTs,
            }
          : null;

        const workerTasks = payload.activeTaskId && !s.workerTasks.some(t => t.taskId === payload.activeTaskId)
          ? [
              {
                taskId: payload.activeTaskId,
                workerId,
                workerName: s.workerConfigs.find(cfg => cfg.id === workerId)?.registeredName ?? workerId,
                prompt: payload.activeTaskPrompt ?? '',
                status: 'active' as const,
                startedAt: eventTs,
              },
              ...s.workerTasks,
            ].slice(0, 50)
          : s.workerTasks;

        return {
          ...s,
          workerBehaviors: {
            ...s.workerBehaviors,
            [workerId]: behavior,
          },
          workerDashboardStates: {
            ...s.workerDashboardStates,
            [workerId]: {
              ...existing,
              behavior,
              olympusMountainState: behaviorToOlympusMountainState(behavior),
              currentTask: nextCurrentTask,
              lastActivity: eventTs,
              sessionLog: payload.activeTaskPrompt
                ? pushSessionLog(existing.sessionLog, payload.activeTaskPrompt)
                : existing.sessionLog,
            },
          },
          workerTasks,
          syncStatus: {
            ...s.syncStatus,
            lastWsEventAt: Date.now(),
          },
        };
      });

      if (behavior === 'completed' || behavior === 'error') {
        setTimeout(() => {
          setState((s) => {
            const current = s.workerBehaviors[workerId];
            if (current !== behavior) return s;
            const dashboard = s.workerDashboardStates[workerId];
            return {
              ...s,
              workerBehaviors: {
                ...s.workerBehaviors,
                [workerId]: 'idle',
              },
              workerDashboardStates: dashboard
                ? {
                    ...s.workerDashboardStates,
                    [workerId]: {
                      ...dashboard,
                      behavior: 'idle',
                      olympusMountainState: behaviorToOlympusMountainState('idle'),
                    },
                  }
                : s.workerDashboardStates,
            };
          });
        }, 3000);
      }
    });

    // Unified activity stream from Gateway (Console + Monitor + Telegram parity)
    client.on('activity:event', (m) => {
      const payload = m.payload as {
        id?: string;
        type?: string;
        workerName?: string;
        workerId?: string;
        message?: string;
        timestamp?: number;
        severity?: string;
      };
      const message = payload.message;
      if (!message) return;
      const now = Date.now();
      const id = payload.id ?? crypto.randomUUID();
      const colorBySeverity = payload.severity === 'error'
        ? '#FF6B6B'
        : payload.severity === 'warn'
          ? '#FFCA28'
          : undefined;

      setState((s) => {
        if (s.activityEvents.some(evt => evt.id === id)) {
          return {
            ...s,
            syncStatus: {
              ...s.syncStatus,
              lastWsEventAt: now,
            },
          };
        }
        return {
          ...s,
          activityEvents: [
            ...s.activityEvents,
            {
              id,
              type: payload.type ?? 'event',
              agentName: payload.workerName ?? payload.workerId ?? 'system',
              message,
              timestamp: payload.timestamp ?? now,
              color: colorBySeverity,
            },
          ].slice(-50),
          syncStatus: {
            ...s.syncStatus,
            lastWsEventAt: now,
          },
        };
      });
    });

    // Worker task events (즉시 행동 반영)
    client.on('worker:task:assigned', (m) => {
      const payload = m.payload as { workerId: string; taskId: string; prompt?: string; workerName?: string };
      if (payload.workerId) {
        setState((s) => {
          const now = Date.now();
          const workerLogs = new Map(s.workerLogs);
          const entries = [...(workerLogs.get(payload.workerId) ?? [])];
          entries.push({
            taskId: payload.taskId,
            prompt: payload.prompt ?? '',
            status: 'running',
            startedAt: now,
          });
          workerLogs.set(payload.workerId, entries.slice(-20));

          const existingDashboard = s.workerDashboardStates[payload.workerId] ?? createDashboardState('working', now);
          const nextDashboard: WorkerDashboardState = {
            ...existingDashboard,
            behavior: 'working',
            olympusMountainState: behaviorToOlympusMountainState('working'),
            currentTask: {
              id: payload.taskId,
              title: payload.prompt?.trim() || '작업 진행 중',
              status: 'active',
              startedAt: now,
            },
            lastActivity: now,
            sessionLog: payload.prompt ? pushSessionLog(existingDashboard.sessionLog, payload.prompt) : existingDashboard.sessionLog,
          };
          return {
            ...s,
            workerBehaviors: { ...s.workerBehaviors, [payload.workerId]: 'working' },
            workerDashboardStates: {
              ...s.workerDashboardStates,
              [payload.workerId]: nextDashboard,
            },
            workerTasks: [
              ...s.workerTasks.filter(t => t.status !== 'active' || t.workerId !== payload.workerId),
              {
                taskId: payload.taskId,
                workerId: payload.workerId,
                workerName: payload.workerName ?? payload.workerId,
                prompt: payload.prompt ?? '',
                status: 'active' as const,
                startedAt: now,
              },
            ],
            workerLogs,
            lastWorkerAssignment: {
              taskId: payload.taskId,
              workerId: payload.workerId,
              workerName: payload.workerName ?? payload.workerId,
              prompt: payload.prompt ?? '',
              summary: payload.prompt ? `Started: ${payload.prompt.slice(0, 50)}...` : 'Started task',
              timestamp: now,
            },
            syncStatus: {
              ...s.syncStatus,
              lastWsEventAt: now,
            },
          };
        });

        // Keep polling state in sync with event-driven status updates
        pollWorkersRef.current?.();
      }
    });

    client.on('worker:task:completed', (m) => {
      const payload = m.payload as { workerId?: string; taskId: string; status?: string; summary?: string; workerName?: string; durationMs?: number; success?: boolean; rawText?: string; cost?: number; geminiReview?: { quality: string; summary: string; concerns: string[]; reviewedAt?: number } };
      const wId = payload.workerId;
      if (wId) {
        setState((s) => {
          const now = Date.now();
          const success = payload.success ?? (payload.status === 'completed');
          const completedTask = s.workerTasks.find(t => t.taskId === payload.taskId) ??
            { taskId: payload.taskId, workerId: wId, workerName: payload.workerName ?? wId, prompt: '', startedAt: now };
          const newTask: WorkerTaskEntry = {
            ...completedTask,
            status: success ? 'completed' : 'failed',
            completedAt: now,
            summary: payload.summary,
            durationMs: payload.durationMs ?? (now - completedTask.startedAt),
          };
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
            durationMs: payload.durationMs ?? (now - completedTask.startedAt),
            cost: payload.cost,
            geminiReview: payload.geminiReview ? {
              quality: payload.geminiReview.quality,
              summary: payload.geminiReview.summary,
              concerns: payload.geminiReview.concerns,
            } : undefined,
            startedAt: logIdx >= 0 ? entries[logIdx].startedAt : completedTask.startedAt,
            completedAt: now,
          };
          if (logIdx >= 0) {
            entries[logIdx] = logEntry;
          } else {
            entries.push(logEntry);
          }
          workerLogs.set(wId, entries.slice(-20));

          const completionBehavior: WorkerBehavior = success ? 'completed' : 'error';
          const existingDashboard = s.workerDashboardStates[wId] ?? createDashboardState(completionBehavior, now);
          const taskHistoryStatus: 'completed' | 'failed' = success ? 'completed' : 'failed';
          const nextTaskHistory = [
            {
              id: payload.taskId,
              title: completedTask.prompt || payload.summary || (success ? '작업 완료' : '작업 실패'),
              status: taskHistoryStatus,
              startedAt: completedTask.startedAt,
              completedAt: now,
            },
            ...existingDashboard.taskHistory,
          ].slice(0, 30);
          const nextDashboard: WorkerDashboardState = {
            ...existingDashboard,
            behavior: completionBehavior,
            olympusMountainState: behaviorToOlympusMountainState(completionBehavior),
            currentTask: null,
            taskHistory: nextTaskHistory,
            totalTasks: existingDashboard.totalTasks + 1,
            lastActivity: now,
            sessionLog: payload.summary
              ? pushSessionLog(existingDashboard.sessionLog, payload.summary)
              : existingDashboard.sessionLog,
          };

          return {
            ...s,
            workerBehaviors: {
              ...s.workerBehaviors,
              [wId]: success ? 'completed' : 'error',
            },
            workerDashboardStates: {
              ...s.workerDashboardStates,
              [wId]: nextDashboard,
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
              timestamp: now,
            },
            geminiReviews,
            workerLogs,
            syncStatus: {
              ...s.syncStatus,
              lastWsEventAt: now,
            },
          };
        });

        // Auto-reset behavior to idle after 3 seconds
        setTimeout(() => {
          setState((s) => {
            const currentBehavior = s.workerBehaviors[wId];
            if (currentBehavior !== 'completed' && currentBehavior !== 'error') return s;
            return {
              ...s,
              workerBehaviors: {
                ...s.workerBehaviors,
                [wId]: 'idle',
              },
              workerDashboardStates: s.workerDashboardStates[wId]
                ? {
                    ...s.workerDashboardStates,
                    [wId]: {
                      ...s.workerDashboardStates[wId],
                      behavior: 'idle',
                      olympusMountainState: behaviorToOlympusMountainState('idle'),
                    },
                  }
                : s.workerDashboardStates,
            };
          });
        }, 3000);

        // Immediately refresh worker list
        pollWorkersRef.current?.();
      }
    });

    // Worker task timeout events (30분 타임아웃 → 모니터링)
    client.on('worker:task:timeout', (m) => {
      const payload = m.payload as { workerId?: string; taskId: string; workerName?: string };
      // 타임아웃 모니터링: 워커는 여전히 busy → behavior 유지
      if (payload.workerId) {
        setState((s) => {
          const now = Date.now();
          const existingDashboard = s.workerDashboardStates[payload.workerId!] ?? createDashboardState('thinking', now);
          return {
            ...s,
            workerTasks: s.workerTasks.map(t =>
              t.taskId === payload.taskId ? { ...t, status: 'timeout' as const } : t
            ),
            workerBehaviors: {
              ...s.workerBehaviors,
              [payload.workerId!]: 'thinking',
            },
            workerDashboardStates: {
              ...s.workerDashboardStates,
              [payload.workerId!]: {
                ...existingDashboard,
                behavior: 'thinking',
                olympusMountainState: behaviorToOlympusMountainState('thinking'),
                lastActivity: now,
              },
            },
            activityEvents: [
              ...s.activityEvents,
              {
                id: crypto.randomUUID(),
                type: 'timeout',
                agentName: payload.workerName ?? payload.workerId ?? 'unknown',
                message: '30분 타임아웃 — 모니터링 중',
                timestamp: now,
              },
            ].slice(-50),
            syncStatus: {
              ...s.syncStatus,
              lastWsEventAt: now,
            },
          };
        });
      }
    });

    client.on('worker:task:final_after_timeout', (m) => {
      const payload = m.payload as { workerId?: string; taskId: string; status?: string; workerName?: string; success?: boolean };
      const wId = payload.workerId;
      if (wId) {
        setState((s) => {
          const now = Date.now();
          const finalBehavior: WorkerBehavior = payload.success ? 'completed' : 'error';
          const existingDashboard = s.workerDashboardStates[wId] ?? createDashboardState(finalBehavior, now);
          return {
            ...s,
            workerBehaviors: {
              ...s.workerBehaviors,
              [wId]: finalBehavior,
            },
            workerDashboardStates: {
              ...s.workerDashboardStates,
              [wId]: {
                ...existingDashboard,
                behavior: finalBehavior,
                olympusMountainState: behaviorToOlympusMountainState(finalBehavior),
                currentTask: null,
                totalTasks: existingDashboard.totalTasks + 1,
                lastActivity: now,
              },
            },
            activityEvents: [
              ...s.activityEvents,
              {
                id: crypto.randomUUID(),
                type: 'final_after_timeout',
                agentName: payload.workerName ?? wId,
                message: payload.success ? '타임아웃 후 최종 완료' : '타임아웃 후 실패',
                timestamp: now,
              },
            ].slice(-50),
            syncStatus: {
              ...s.syncStatus,
              lastWsEventAt: now,
            },
          };
        });

        // Auto-reset behavior to idle after finalization
        setTimeout(() => {
          setState((s) => {
            const currentBehavior = s.workerBehaviors[wId];
            if (currentBehavior !== 'completed' && currentBehavior !== 'error') return s;
            return {
              ...s,
              workerBehaviors: {
                ...s.workerBehaviors,
                [wId]: 'idle',
              },
              workerDashboardStates: s.workerDashboardStates[wId]
                ? {
                    ...s.workerDashboardStates,
                    [wId]: {
                      ...s.workerDashboardStates[wId],
                      behavior: 'idle',
                      olympusMountainState: behaviorToOlympusMountainState('idle'),
                    },
                  }
                : s.workerDashboardStates,
            };
          });
        }, 3000);

        pollWorkersRef.current?.();
      }
    });

    // Codex greeting from Gemini initial analysis
    client.on('codex:greeting', (m) => {
      const payload = m.payload as { type: string; text: string; timestamp: number };
      if (payload?.text) {
        setState((s) => ({
          ...s,
          codexGreeting: { text: payload.text, timestamp: payload.timestamp || Date.now() },
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

    // Worker task summary update — Codex summarization result
    client.on('worker:task:summary', (m) => {
      const payload = m.payload as { taskId: string; workerId?: string; workerName?: string; summary: string };
      if (payload.workerId) {
        const workerId = payload.workerId;
        setState((s) => {
          const now = Date.now();
          const workerLogs = new Map(s.workerLogs);
          const entries = [...(workerLogs.get(workerId) ?? [])];
          const idx = entries.findIndex(e => e.taskId === payload.taskId);
          if (idx >= 0) {
            entries[idx] = { ...entries[idx], summary: payload.summary };
            workerLogs.set(workerId, entries);
          }
          const existingDashboard = s.workerDashboardStates[workerId] ?? createDashboardState('idle', now);
          return {
            ...s,
            workerLogs,
            workerDashboardStates: {
              ...s.workerDashboardStates,
              [workerId]: {
                ...existingDashboard,
                sessionLog: pushSessionLog(existingDashboard.sessionLog, payload.summary),
                lastActivity: now,
              },
            },
            lastWorkerSummary: {
              workerId,
              workerName: payload.workerName ?? workerId,
              summary: payload.summary,
              taskId: payload.taskId,
              timestamp: now,
            },
            syncStatus: {
              ...s.syncStatus,
              lastWsEventAt: now,
            },
          };
        });
      }
    });

    // Worker task failed (zombie detection)
    client.on('worker:task:failed', (m) => {
      const payload = m.payload as { workerId: string; taskIds: string[] };
      if (payload.workerId) {
        setState((s) => {
          const now = Date.now();
          const workerLogs = new Map(s.workerLogs);
          const entries = [...(workerLogs.get(payload.workerId) ?? [])];
          for (const taskId of payload.taskIds) {
            const idx = entries.findIndex(e => e.taskId === taskId);
            if (idx >= 0) {
              entries[idx] = { ...entries[idx], status: 'failed', completedAt: now };
            }
          }
          workerLogs.set(payload.workerId, entries);
          const existingDashboard = s.workerDashboardStates[payload.workerId] ?? createDashboardState('error', now);
          return {
            ...s,
            workerBehaviors: { ...s.workerBehaviors, [payload.workerId]: 'error' },
            workerDashboardStates: {
              ...s.workerDashboardStates,
              [payload.workerId]: {
                ...existingDashboard,
                behavior: 'error',
                olympusMountainState: behaviorToOlympusMountainState('error'),
                currentTask: null,
                lastActivity: now,
              },
            },
            workerLogs,
            lastWorkerFailure: {
              workerId: payload.workerId,
              workerName: payload.workerId,
              summary: `Worker offline (failed ${payload.taskIds.length} tasks)`,
              timestamp: now,
            },
            syncStatus: {
              ...s.syncStatus,
              lastWsEventAt: now,
            },
          };
        });

        pollWorkersRef.current?.();
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
        const now = Date.now();
        const workers = new Map(s.workers);
        const chunk = (
          (p as { content?: string }).content
          ?? (p as { text?: string }).text
          ?? ''
        );
        if (!chunk) return s;

        const byId = typeof (p as { workerId?: unknown }).workerId === 'string'
          ? (p as { workerId: string }).workerId
          : '';
        const byName = typeof (p as { workerName?: unknown }).workerName === 'string'
          ? s.workerConfigs.find(cfg => cfg.registeredName === (p as { workerName?: string }).workerName)?.id
          : undefined;
        const resolvedWorkerId = byId || byName;
        if (!resolvedWorkerId) return s;

        const existing = workers.get(resolvedWorkerId);
        const projectPath = existing?.projectPath
          ?? s.workerConfigs.find(w => w.id === resolvedWorkerId)?.projectPath
          ?? '';
        const base: WorkerInfo = existing ?? {
          workerId: resolvedWorkerId,
          projectPath,
          status: 'running',
          output: '',
        };

        workers.set(resolvedWorkerId, {
          ...base,
          status: 'running',
          output: (base.output + chunk).slice(-200_000),
        });
        return {
          ...s,
          workers,
          syncStatus: {
            ...s.syncStatus,
            lastWsEventAt: now,
          },
        };
      });
    });

    // Usage data updates
    client.on('usage:update', (m) => {
      const data = m.payload as StatuslineUsageData;
      setState((s) => ({
        ...s,
        usageData: data,
        syncStatus: {
          ...s.syncStatus,
          lastWsEventAt: Date.now(),
        },
      }));
    });

    client.onCliComplete((result: CliRunResult) => {
      setState((s) => {
        const now = Date.now();
        const matchingWorker = s.workerConfigs.find(cfg =>
          sessionKeyMatchesWorker(result.sessionId, cfg.id, cfg.registeredName),
        );
        const workerDashboardStates = { ...s.workerDashboardStates };
        if (matchingWorker) {
          const existingDashboard = workerDashboardStates[matchingWorker.id] ?? createDashboardState('idle', now);
          const totalDelta = result.usage.inputTokens + result.usage.outputTokens;
          workerDashboardStates[matchingWorker.id] = {
            ...existingDashboard,
            tokenUsage: [
              ...existingDashboard.tokenUsage.slice(-49),
              {
                timestamp: now,
                input: result.usage.inputTokens,
                output: result.usage.outputTokens,
                total: totalDelta,
              },
            ],
            totalTokens: existingDashboard.totalTokens + totalDelta,
            lastActivity: now,
            sessionLog: pushSessionLog(existingDashboard.sessionLog, `${result.model} · ${totalDelta} tokens`),
          };
        }

        return {
          ...s,
          workerDashboardStates,
          syncStatus: {
            ...s.syncStatus,
            lastWsEventAt: now,
          },
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
        syncStatus: {
          ...s.syncStatus,
          lastWsEventAt: Date.now(),
        },
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

    const markPollFailure = (reason: string) => {
      setState((s) => ({
        ...s,
        syncStatus: {
          ...s.syncStatus,
          pollFailureCount: s.syncStatus.pollFailureCount + 1,
          lastPollError: reason,
        },
      }));
    };

    const pollWorkers = async () => {
      try {
        const res = await fetch(`http://${host}:${port}/api/workers`, {
          cache: 'no-store',
          headers: apiKey ? { 'x-api-key': apiKey } : {},
        });
        if (!res.ok) {
          markPollFailure(`/api/workers ${res.status}`);
          return;
        }
        const data = await res.json() as { workers: RegisteredWorker[] };
        const registeredWorkers = data.workers ?? [];

        setState((s) => {
          const now = Date.now();
          // Convert to workerConfigs
          const workerConfigs = buildWorkerConfigs(registeredWorkers);

          // Derive behaviors from worker registry truth and recent dashboard state.
          const workerBehaviors: Record<string, string> = {};
          for (const w of registeredWorkers) {
            if (w.status === 'offline') {
              workerBehaviors[w.id] = 'offline';
            } else if (w.status === 'failed' as string) {
              workerBehaviors[w.id] = 'error';
            } else if (w.status === 'busy' && w.currentTaskId) {
              workerBehaviors[w.id] = 'working';
            } else if (w.status === 'busy') {
              workerBehaviors[w.id] = 'thinking';
            } else {
              const existingDashboard = s.workerDashboardStates[w.id];
              const recentlyCompleted = existingDashboard?.behavior === 'completed'
                && (now - existingDashboard.lastActivity) < 30_000;
              if (recentlyCompleted) {
                workerBehaviors[w.id] = 'completed';
              } else {
                const idleDuration = now - w.lastHeartbeat;
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

          const workerDashboardStates: Record<string, WorkerDashboardState> = {};
          for (const worker of registeredWorkers) {
            const behavior = asWorkerBehavior(workerBehaviors[worker.id]);
            const previous = s.workerDashboardStates[worker.id] ?? createDashboardState(behavior, now);
            const activeTask = enrichedTasks.find(t => t.workerId === worker.id && t.status === 'active');
            const nextCurrentTask = activeTask
              ? {
                  id: activeTask.taskId,
                  title: activeTask.prompt || '작업 진행 중',
                  status: 'active' as const,
                  startedAt: activeTask.startedAt,
                }
              : null;
            const hasTaskChanged = (previous.currentTask?.id ?? null) !== (nextCurrentTask?.id ?? null);
            const hasBehaviorChanged = previous.behavior !== behavior;
            const nextLastActivity = hasTaskChanged || hasBehaviorChanged
              ? now
              : Math.max(previous.lastActivity, worker.lastHeartbeat || 0);

            workerDashboardStates[worker.id] = {
              ...previous,
              behavior,
              olympusMountainState: behaviorToOlympusMountainState(behavior),
              currentTask: nextCurrentTask,
              lastActivity: nextLastActivity,
              uptime: Math.max(0, Math.floor((now - worker.registeredAt) / 1000)),
              sessionLog: worker.currentTaskPrompt
                ? pushSessionLog(previous.sessionLog, worker.currentTaskPrompt)
                : previous.sessionLog,
            };
          }

          // System stats
          const totalTokens = Object.values(workerDashboardStates)
            .reduce((sum, workerState) => sum + workerState.totalTokens, 0);
          const failedTasks = enrichedTasks.filter(t => t.status === 'failed').length;

          return {
            ...s,
            workerConfigs,
            workerBehaviors,
            workerDashboardStates,
            codexBehavior,
            workerTasks: enrichedTasks,
            activityEvents: newEvents.slice(-50),
            systemStats: {
              totalWorkers: workerConfigs.length,
              activeWorkers: Object.values(workerBehaviors).filter(b => ACTIVE_BEHAVIORS.has(b)).length,
              totalTokens,
              failedTasks,
            },
            syncStatus: {
              ...s.syncStatus,
              lastPollAt: now,
              lastPollError: null,
            },
          };
        });
      } catch (err) {
        markPollFailure((err as Error).message);
      }
    };

    const pollGemini = async () => {
      try {
        const res = await fetch(`http://${host}:${port}/api/gemini-advisor/status`, {
          cache: 'no-store',
          headers: apiKey ? { 'x-api-key': apiKey } : {},
        });
        if (!res.ok) {
          markPollFailure(`/api/gemini-advisor/status ${res.status}`);
          return;
        }
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
          syncStatus: {
            ...s.syncStatus,
            lastPollAt: Date.now(),
            lastPollError: null,
          },
        }));
      } catch (err) {
        markPollFailure((err as Error).message);
      }
    };

    const pollUsage = async () => {
      try {
        const res = await fetch(`http://${host}:${port}/api/usage`, {
          cache: 'no-store',
          headers: apiKey ? { 'x-api-key': apiKey } : {},
        });
        if (!res.ok) {
          markPollFailure(`/api/usage ${res.status}`);
          return;
        }
        const data = await res.json() as StatuslineUsageData;
        if (data && data.timestamp) {
          setState((s) => ({
            ...s,
            usageData: data,
            syncStatus: {
              ...s.syncStatus,
              lastPollAt: Date.now(),
              lastPollError: null,
            },
          }));
        }
      } catch (err) {
        markPollFailure((err as Error).message);
      }
    };

    const pollProjectSummaries = async () => {
      try {
        const res = await fetch(`http://${host}:${port}/api/projects/summaries`, {
          cache: 'no-store',
          headers: apiKey ? { 'x-api-key': apiKey } : {},
        });
        if (!res.ok) {
          markPollFailure(`/api/projects/summaries ${res.status}`);
          return;
        }
        const data = await res.json() as { summaries?: ProjectTaskSummaryEntry[] };
        setState((s) => ({
          ...s,
          projectSummaries: data.summaries ?? [],
          syncStatus: {
            ...s.syncStatus,
            lastPollAt: Date.now(),
            lastPollError: null,
          },
        }));
      } catch (err) {
        markPollFailure((err as Error).message);
      }
    };

    const pollWorkerTasks = async () => {
      try {
        const res = await fetch(`http://${host}:${port}/api/workers/tasks`, {
          cache: 'no-store',
          headers: apiKey ? { 'x-api-key': apiKey } : {},
        });
        if (!res.ok) {
          markPollFailure(`/api/workers/tasks ${res.status}`);
          return;
        }
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
            if (newTasks.length === 0) {
              return {
                ...s,
                syncStatus: {
                  ...s.syncStatus,
                  lastPollAt: Date.now(),
                  lastPollError: null,
                },
              };
            }
            return {
              ...s,
              workerTasks: [...newTasks, ...s.workerTasks].slice(0, 50),
              syncStatus: {
                ...s.syncStatus,
                lastPollAt: Date.now(),
                lastPollError: null,
              },
            };
          });
        }
      } catch (err) {
        markPollFailure((err as Error).message);
      }
    };

    pollWorkersRef.current = pollWorkers;
    pollWorkers();
    pollGemini();
    pollUsage();
    pollProjectSummaries();
    pollWorkerTasks();
    const interval = setInterval(() => {
      pollWorkers();
      pollGemini();
      pollUsage();
      pollProjectSummaries();
      pollWorkerTasks();
    }, 10_000);
    return () => {
      clearInterval(interval);
      pollWorkersRef.current = null;
    };
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

  useEffect(() => {
    const timer = setTimeout(() => {
      saveWorkerLogsToStorage(state.workerLogs);
    }, 150);
    return () => clearTimeout(timer);
  }, [state.workerLogs]);

  useEffect(() => {
    const timer = setTimeout(() => {
      saveWorkersToStorage(state.workers);
    }, 300);
    return () => clearTimeout(timer);
  }, [state.workers]);

  // =========================================================================
  // Actions (existing)
  // =========================================================================

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
    const chatId = getPreferredTelegramChatId();
    const res = await fetch(`http://${host}:${port}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        message,
        source: 'dashboard',
        ...(chatId ? { chatId } : {}),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
      throw new Error((err as { message?: string }).message ?? `HTTP ${res.status}`);
    }
    return await res.json() as { reply: string };
  }, [host, port, apiKey]);

  const chatWithCodex = useCallback(async (message: string): Promise<{ type: string; response: string }> => {
    const chatId = getPreferredTelegramChatId();
    const res = await fetch(`http://${host}:${port}/api/codex/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        message,
        source: 'dashboard',
        ...(chatId ? { chatId } : {}),
      }),
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

  const refreshWorkerProjection = useCallback(async (workerId: string, lines = 200): Promise<boolean> => {
    if (!workerId) return false;
    try {
      const res = await fetch(
        `http://${host}:${port}/api/workers/${encodeURIComponent(workerId)}/projection?lines=${Math.max(20, Math.floor(lines))}`,
        {
          cache: 'no-store',
          headers: apiKey ? { 'x-api-key': apiKey } : {},
        },
      );
      if (!res.ok) {
        return false;
      }
      const data = await res.json() as { projection?: WorkerTerminalProjection };
      if (!data.projection) return false;

      setState((s) => {
        const workerProjections = new Map(s.workerProjections);
        workerProjections.set(workerId, data.projection!);
        return {
          ...s,
          workerProjections,
          syncStatus: {
            ...s.syncStatus,
            lastPollAt: Date.now(),
            lastPollError: null,
          },
        };
      });
      return true;
    } catch {
      return false;
    }
  }, [host, port, apiKey]);

  const sendWorkerInput = useCallback(async (workerId: string, input: string): Promise<boolean> => {
    if (!workerId || !input) return false;
    try {
      const res = await fetch(`http://${host}:${port}/api/workers/${encodeURIComponent(workerId)}/input`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ input }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, [host, port, apiKey]);

  const resizeWorkerTerminal = useCallback(async (workerId: string, cols: number, rows: number): Promise<boolean> => {
    if (!workerId) return false;
    try {
      const res = await fetch(`http://${host}:${port}/api/workers/${encodeURIComponent(workerId)}/resize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ cols, rows }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, [host, port, apiKey]);

  // Expose only the active dashboard read model and actions used by the current UI.
  return {
    connected: state.connected,
    error: state.error,
    pendingApproval: state.pendingApproval,
    workerConfigs: state.workerConfigs,
    workerDashboardStates: state.workerDashboardStates,
    codexBehavior: state.codexBehavior,
    geminiBehavior: state.geminiBehavior,
    geminiCurrentTask: state.geminiCurrentTask,
    geminiCacheCount: state.geminiCacheCount,
    geminiLastAnalyzed: state.geminiLastAnalyzed,
    activityEvents: state.activityEvents,
    systemStats: state.systemStats,
    usageData: state.usageData,
    workers: state.workers,
    workerTasks: state.workerTasks,
    workerProjections: state.workerProjections,
    projectSummaries: state.projectSummaries,
    lastWorkerCompletion: state.lastWorkerCompletion,
    lastWorkerAssignment: state.lastWorkerAssignment,
    lastWorkerSummary: state.lastWorkerSummary,
    lastWorkerFailure: state.lastWorkerFailure,
    workerLogs: state.workerLogs,
    selectedWorkerId: state.selectedWorkerId,
    codexGreeting: state.codexGreeting,
    syncStatus: state.syncStatus,
    approveTask,
    rejectTask,
    codexRoute,
    codexProjects,
    codexSessions,
    codexSearch,
    chatWithGemini,
    chatWithCodex,
    sendWorkerInput,
    resizeWorkerTerminal,
    refreshWorkerProjection,
    setSelectedWorkerId,
  };
}
