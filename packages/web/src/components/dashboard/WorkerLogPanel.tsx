// ============================================================================
// WorkerLogPanel — Selected worker terminal modal
// ============================================================================

import { useEffect } from 'react';
import type { WorkerConfigEntry } from '../../hooks/useOlympus';
import { PtyTerminal } from './PtyTerminal';

interface WorkerLogPanelProps {
  workerId: string;
  workerConfig?: WorkerConfigEntry;
  liveOutput?: string;
  connected?: boolean;
  onTerminalInput?: (data: string) => void;
  onTerminalResize?: (cols: number, rows: number) => void;
  onClose: () => void;
}

export function WorkerLogPanel({
  workerId,
  workerConfig,
  liveOutput,
  connected = false,
  onTerminalInput,
  onTerminalResize,
  onClose,
}: WorkerLogPanelProps) {
  const displayName = workerConfig?.name ?? workerId;
  const color = workerConfig?.color ?? 'var(--text-primary)';

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.62)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-[min(1440px,96vw)] h-[90vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-primary, #0A0F1C)',
          borderColor: `${color}55`,
          boxShadow: `0 20px 60px ${color}20`,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
            <span className="font-pixel text-sm truncate" style={{ color }}>{displayName}</span>
            <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>Terminal</span>
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

        <div className="flex-1 min-h-0 p-2">
          <PtyTerminal
            workerName={displayName}
            output={liveOutput ?? ''}
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
