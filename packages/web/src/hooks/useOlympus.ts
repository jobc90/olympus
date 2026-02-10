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
}

export interface UseOlympusOptions {
  port?: number;
  host?: string;
  apiKey?: string;
}

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
  });

  const { port, host, apiKey } = options;

  useEffect(() => {
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
        // Mark active stream as inactive (sessionKey ≠ result.sessionId)
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
      const result = await clientRef.current?.sendCommand(command);
      return result;
    } catch (e) {
      setState(s => ({ ...s, error: `Agent error: ${(e as Error).message}` }));
      return null;
    }
  }, []);

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

  return { ...state, subscribe, unsubscribe, subscribeSession, unsubscribeSession, cancel, connectAvailableSession, sendAgentCommand, cancelAgentTask, approveTask, rejectTask, codexRoute, codexProjects, codexSessions, codexSearch };
}
