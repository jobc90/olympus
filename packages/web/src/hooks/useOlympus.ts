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
    setState((s) => ({ ...s, currentRunId: runId, tasks: [], phase: null, agentStreams: new Map() }));
  }, []);

  const unsubscribe = useCallback((runId: string) => {
    clientRef.current?.unsubscribe(runId);
    setState((s) => ({
      ...s,
      currentRunId: s.currentRunId === runId ? null : s.currentRunId,
    }));
  }, []);

  const cancel = useCallback((runId?: string, taskId?: string) => {
    clientRef.current?.cancel(runId, taskId);
  }, []);

  return { ...state, subscribe, unsubscribe, cancel };
}
