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
} from '@olympus-dev/protocol';

export interface SessionOutput {
  sessionId: string;
  content: string;
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
  error: string | null;
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
    error: null,
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
      if (Array.isArray(data)) {
        setState((s) => ({ ...s, sessions: data as SessionInfo[] }));
      } else {
        setState((s) => ({
          ...s,
          sessions: data.sessions ?? [],
          availableSessions: data.availableSessions ?? [],
        }));
      }
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
      setState((s) => ({
        ...s,
        sessionOutputs: [...s.sessionOutputs.slice(-49), { sessionId: p.sessionId, content: p.content, timestamp: Date.now() }],
        logs: [...s.logs.slice(-99), { level: 'info', message: `[session:output] ${p.content.slice(0, 200)}${p.content.length > 200 ? '...' : ''}` }],
      }));
    });

    client.onSessionError((p) => {
      setState((s) => ({
        ...s,
        logs: [...s.logs.slice(-99), { level: 'error', message: `[session:error] ${p.error}` }],
      }));
    });

    client.onSessionClosed((p) => {
      setState((s) => ({
        ...s,
        currentSessionId: s.currentSessionId === p.sessionId ? null : s.currentSessionId,
        sessionOutputs: [],
        logs: [...s.logs.slice(-99), { level: 'warn', message: `[session:closed] Session ${p.sessionId} ended` }],
      }));
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
    setState((s) => ({ ...s, currentSessionId: sessionId, currentRunId: null, tasks: [], phase: null, agentStreams: new Map(), sessionOutputs: [] }));
  }, []);

  const unsubscribeSession = useCallback((sessionId: string) => {
    clientRef.current?.unsubscribeSession(sessionId);
    setState((s) => ({
      ...s,
      currentSessionId: s.currentSessionId === sessionId ? null : s.currentSessionId,
      sessionOutputs: [],
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

  return { ...state, subscribe, unsubscribe, subscribeSession, unsubscribeSession, cancel, connectAvailableSession };
}
