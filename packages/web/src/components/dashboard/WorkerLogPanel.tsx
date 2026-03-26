// ============================================================================
// WorkerLogPanel — Selected worker terminal modal
// ============================================================================

import { useEffect } from 'react';
import type { WorkerConfigEntry, WorkerTerminalProjection } from '../../hooks/useOlympus';
import { PtyTerminal } from './PtyTerminal';

interface WorkerLogPanelProps {
  workerId: string;
  workerConfig?: WorkerConfigEntry;
  projection?: WorkerTerminalProjection | null;
  liveOutput?: string;
  connected?: boolean;
  onTerminalInput?: (data: string) => void;
  onTerminalResize?: (cols: number, rows: number) => void;
  onClose: () => void;
}

export function WorkerLogPanel({
  workerId,
  workerConfig,
  projection,
  liveOutput,
  connected = false,
  onTerminalInput,
  onTerminalResize,
  onClose,
}: WorkerLogPanelProps) {
  const displayName = workerConfig?.name ?? workerId;
  const color = workerConfig?.color ?? 'var(--text-primary)';
  const projectionAge = projection?.payload.generatedAt
    ? `${Math.max(0, Math.floor((Date.now() - projection.payload.generatedAt) / 1000))}s ago`
    : 'unavailable';

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Lock background scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.62)', backdropFilter: 'blur(2px)' }}
      onWheel={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-[min(1640px,98vw)] h-[94vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: '#0a0f1b',
          borderColor: `${color}55`,
          boxShadow: `0 20px 60px ${color}20`,
        }}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(12, 17, 31, 0.9)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
            <span className="font-mono text-xs truncate" style={{ color }}>{displayName}</span>
            <span className="text-[11px] font-mono" style={{ color: 'var(--text-secondary)' }}>Projected Console</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 transition-colors flex-shrink-0"
            style={{ color: 'var(--text-secondary)' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div
          className="mx-3 mt-3 rounded-xl border px-3 py-2 text-xs"
          style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(8, 13, 26, 0.35)', color: 'var(--text-secondary)' }}
        >
          <div className="flex flex-wrap items-center gap-2 font-mono">
            <span>runtime: {projection?.runtimeKind ?? 'unknown'}</span>
            <span>snapshot: {projectionAge}</span>
            <span>{projection?.inputLocked ? 'input locked' : 'input forwarded'}</span>
          </div>
          <div className="mt-1">
            This panel follows gateway projection snapshots and recent worker output. Use native tmux attach for a full interactive terminal.
          </div>
        </div>

        <div className="flex-1 min-h-0 p-1.5">
          <PtyTerminal
            workerName={displayName}
            output={liveOutput ?? ''}
            snapshot={projection?.snapshotText ?? ''}
            connected={connected}
            accentColor={typeof color === 'string' ? color : undefined}
            heightClass="h-full min-h-[320px]"
            onInput={(data) => onTerminalInput?.(data)}
            onResize={onTerminalResize}
          />
        </div>
      </div>
    </div>
  );
}
