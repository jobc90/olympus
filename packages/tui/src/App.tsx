import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { OlympusClient } from '@olympus-dev/client';
import type { PhasePayload, AgentPayload, TaskPayload, LogPayload } from '@olympus-dev/protocol';

// Use dynamic import for 'ws' to get WebSocket class
// The caller must pass the WebSocket constructor

interface AppProps {
  client: OlympusClient;
  autoSubscribeRunId?: string;
}

const PHASE_NAMES: Record<number, string> = {
  [-1]: 'Smart Intake',
  0: 'Contract-First Design',
  1: 'Multi-Layer DAG',
  2: 'Plan Review',
  3: 'Plan Lock',
  4: 'Code Execution',
  5: 'Merge & Review',
  6: 'Improvements',
  7: 'Final Test',
  8: 'Judgment',
};

export function App({ client, autoSubscribeRunId }: AppProps) {
  const [connected, setConnected] = useState(false);
  const [phase, setPhase] = useState<PhasePayload | null>(null);
  const [tasks, setTasks] = useState<TaskPayload[]>([]);
  const [logs, setLogs] = useState<LogPayload[]>([]);
  const [agentStreams, setAgentStreams] = useState<Map<string, string>>(new Map());
  const [currentRunId, setCurrentRunId] = useState<string | null>(autoSubscribeRunId ?? null);

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    // Handle connection and auto-subscribe
    unsubs.push(client.on('connected', () => {
      setConnected(true);
      // Subscribe to auto-subscribe run ID if provided
      if (autoSubscribeRunId) {
        client.subscribe(autoSubscribeRunId);
        setCurrentRunId(autoSubscribeRunId);
      }
    }));

    unsubs.push(client.onSnapshot((snap) => {
      setPhase({ phase: snap.phase, phaseName: snap.phaseName, status: 'started' });
      setTasks(snap.tasks);
    }));

    unsubs.push(client.onPhase((p) => setPhase(p)));

    unsubs.push(client.onTask((t) => {
      setTasks((prev) => {
        const idx = prev.findIndex((x) => x.taskId === t.taskId);
        if (idx >= 0) { const next = [...prev]; next[idx] = t; return next; }
        return [...prev, t];
      });
    }));

    unsubs.push(client.onAgentChunk((a) => {
      setAgentStreams((prev) => {
        const next = new Map(prev);
        next.set(a.agentId, (next.get(a.agentId) ?? '') + (a.content ?? ''));
        return next;
      });
    }));

    unsubs.push(client.onAgentComplete(() => {
      setAgentStreams(new Map());
    }));

    unsubs.push(client.onLog((l) => {
      setLogs((prev) => [...prev.slice(-19), l]);
    }));

    unsubs.push(client.onError((e) => {
      setLogs((prev) => [...prev.slice(-19), { level: 'error', message: `${e.code}: ${e.message}` }]);
    }));

    client.connect();
    return () => { unsubs.forEach((u) => u()); client.disconnect(); };
  }, [client, autoSubscribeRunId]);

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">⚡ Olympus TUI</Text>
        <Text> </Text>
        <Text color={connected ? 'green' : 'red'}>
          {connected ? '● Connected' : '○ Disconnected'}
        </Text>
      </Box>

      {/* Phase Progress */}
      {phase && (
        <Box marginBottom={1} flexDirection="column">
          <Text bold>Phase {phase.phase}: {phase.phaseName}</Text>
          <Box>
            {Object.keys(PHASE_NAMES).map((p) => {
              const num = Number(p);
              const isCurrent = num === phase.phase;
              const isDone = num < phase.phase;
              return (
                <Text key={p} color={isCurrent ? 'cyan' : isDone ? 'green' : 'gray'}>
                  {isDone ? '●' : isCurrent ? '◉' : '○'}{' '}
                </Text>
              );
            })}
          </Box>
        </Box>
      )}

      {/* Tasks */}
      {tasks.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold underline>Tasks</Text>
          {tasks.map((t) => (
            <Text key={t.taskId}>
              <Text color={t.status === 'completed' ? 'green' : t.status === 'in_progress' ? 'yellow' : t.status === 'failed' ? 'red' : 'gray'}>
                {t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '⟳' : t.status === 'failed' ? '✗' : '○'}
              </Text>
              {' '}{t.subject}
            </Text>
          ))}
        </Box>
      )}

      {/* Agent Streams */}
      {agentStreams.size > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold underline>Agent Output</Text>
          {[...agentStreams.entries()].map(([id, content]) => (
            <Box key={id} flexDirection="column">
              <Text color="magenta" bold>{id}</Text>
              <Text>{content.slice(-200)}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Logs */}
      <Box flexDirection="column">
        <Text bold underline>Logs</Text>
        {logs.map((l, i) => (
          <Text key={i} color={l.level === 'error' ? 'red' : l.level === 'warn' ? 'yellow' : 'gray'}>
            [{l.level}] {l.message}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
