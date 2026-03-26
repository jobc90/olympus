import React, { useMemo, useState } from 'react';
import { Card, CardHeader } from './Card';
import type { WorkerTerminalProjection } from '../hooks/useOlympus';

interface ProjectedTerminalPanelProps {
  workerName?: string;
  workerId?: string | null;
  connected: boolean;
  liveOutput: string;
  projection: WorkerTerminalProjection | null;
  onRefresh?: () => void;
}

type TerminalTab = 'projected' | 'live';

function formatProjectionAge(timestamp: number | undefined): string {
  if (!timestamp) return 'unavailable';
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
  const minutes = Math.floor(deltaSeconds / 60);
  const seconds = deltaSeconds % 60;
  return `${minutes}m ${seconds}s ago`;
}

export function ProjectedTerminalPanel({
  workerName,
  workerId,
  connected,
  liveOutput,
  projection,
  onRefresh,
}: ProjectedTerminalPanelProps) {
  const [tab, setTab] = useState<TerminalTab>('projected');
  const renderedOutput = useMemo(() => {
    if (tab === 'live') {
      return liveOutput.trim() ? liveOutput : 'No live console output yet.';
    }
    if (projection?.snapshotText?.trim()) {
      return projection.snapshotText;
    }
    return connected
      ? 'Projected snapshot not available yet. Refresh after the worker receives output.'
      : 'Gateway disconnected.';
  }, [connected, liveOutput, projection?.snapshotText, tab]);

  const activeTask = projection?.activeTask ?? null;
  const projectionAge = formatProjectionAge(projection?.payload.generatedAt);
  const contractNote = tab === 'projected'
    ? 'Authoritative worker projection from gateway snapshots.'
    : 'Best-effort live output buffer. Use native tmux attach for a full interactive terminal.';

  return (
    <Card className="flex h-full min-h-[360px] flex-col">
      <CardHeader
        action={(
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`rounded-md border px-2 py-1 text-xs font-mono transition-colors ${
                tab === 'projected' ? 'bg-white/10' : 'bg-transparent'
              }`}
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              onClick={() => setTab('projected')}
            >
              Projected View
            </button>
            <button
              type="button"
              className={`rounded-md border px-2 py-1 text-xs font-mono transition-colors ${
                tab === 'live' ? 'bg-white/10' : 'bg-transparent'
              }`}
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              onClick={() => setTab('live')}
            >
              Live Console
            </button>
            <button
              type="button"
              className="rounded-md border px-2 py-1 text-xs font-mono transition-colors hover:bg-white/10"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              onClick={() => onRefresh?.()}
            >
              Refresh
            </button>
          </div>
        )}
      >
        Projected Console
      </CardHeader>

      {!workerId ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border/60 text-sm text-text-secondary">
          Select a worker to inspect the projected worker console.
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-mono">
            <span className="rounded-full border px-2 py-1" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              {workerName ?? workerId}
            </span>
            <span className="rounded-full border px-2 py-1" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              runtime: {projection?.runtimeKind ?? 'unknown'}
            </span>
            <span
              className="rounded-full border px-2 py-1"
              style={{
                borderColor: projection?.inputLocked ? 'rgba(255,180,0,0.4)' : 'var(--border)',
                color: projection?.inputLocked ? 'var(--accent-warning)' : 'var(--text-secondary)',
              }}
            >
              {projection?.inputLocked ? 'input locked' : 'input open'}
            </span>
            <span className="rounded-full border px-2 py-1" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              snapshot: {projectionAge}
            </span>
          </div>

          <div
            className="mb-3 rounded-xl border px-3 py-2 text-xs"
            style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(8, 13, 26, 0.32)', color: 'var(--text-secondary)' }}
          >
            {contractNote}
          </div>

          {activeTask && (
            <div
              className="mb-3 rounded-xl border p-3"
              style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(8, 13, 26, 0.45)' }}
            >
              <div className="mb-1 text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                Active Task
              </div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {activeTask.title ?? activeTask.displayLabel ?? activeTask.taskId}
              </div>
              <div className="mt-1 text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                {activeTask.status ?? activeTask.source}
                {activeTask.projectId ? ` · ${activeTask.projectId}` : ''}
                {activeTask.prompt ? ` · ${activeTask.prompt.slice(0, 120)}` : ''}
              </div>
            </div>
          )}

          <div
            className="flex-1 overflow-auto rounded-xl border p-3"
            style={{ borderColor: 'var(--border)', backgroundColor: '#08101f' }}
          >
            <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-[#D8E4FF]">
              {renderedOutput}
            </pre>
          </div>
        </>
      )}
    </Card>
  );
}
