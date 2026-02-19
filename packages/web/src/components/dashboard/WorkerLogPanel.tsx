// ============================================================================
// WorkerLogPanel — Selected worker's task history panel
// ============================================================================

import { useState } from 'react';
import type { WorkerLogEntry, WorkerConfigEntry } from '../../hooks/useOlympus';

interface WorkerLogPanelProps {
  workerId: string;
  workerConfig?: WorkerConfigEntry;
  logs: WorkerLogEntry[];
  onClose: () => void;
}

function formatDuration(ms: number): string {
  if (!ms || ms < 0 || !Number.isFinite(ms)) return '0s';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

const STATUS_STYLES: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  running: { label: 'Running', bg: 'bg-blue-500/20', text: 'text-blue-300', dot: 'bg-blue-400 animate-pulse' },
  completed: { label: 'Done', bg: 'bg-green-500/20', text: 'text-green-300', dot: 'bg-green-400' },
  failed: { label: 'Failed', bg: 'bg-red-500/20', text: 'text-red-300', dot: 'bg-red-400' },
  timeout: { label: 'Timeout', bg: 'bg-yellow-500/20', text: 'text-yellow-300', dot: 'bg-yellow-400' },
};

function ReviewBadge({ review }: { review: { quality: string; summary: string; concerns: string[] } }) {
  const colors: Record<string, string> = {
    good: 'text-green-400 border-green-500/30',
    warning: 'text-yellow-400 border-yellow-500/30',
    critical: 'text-red-400 border-red-500/30',
  };
  const colorClass = colors[review.quality] ?? colors.good;

  return (
    <div className={`mt-1.5 p-2 rounded border text-[10px] font-mono ${colorClass}`} style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <div className="flex items-center gap-1 mb-0.5">
        <span className="font-semibold">Gemini Review:</span>
        <span className="uppercase">{review.quality}</span>
      </div>
      <div style={{ color: 'var(--text-secondary)' }}>{review.summary}</div>
      {review.concerns.length > 0 && (
        <ul className="mt-1 space-y-0.5" style={{ color: 'var(--text-secondary)' }}>
          {review.concerns.map((c, i) => (
            <li key={i}>- {c}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function WorkerLogPanel({ workerId, workerConfig, logs, onClose }: WorkerLogPanelProps) {
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const displayName = workerConfig?.name ?? workerId;
  const color = workerConfig?.color ?? 'var(--text-primary)';

  // Show most recent first
  const sortedLogs = [...logs].reverse();

  return (
    <div
      className="fixed right-0 top-16 bottom-16 w-96 z-50 flex flex-col border-l shadow-2xl"
      style={{
        backgroundColor: 'var(--bg-primary, #0A0F1C)',
        borderColor: `${color}40`,
        boxShadow: `-4px 0 30px ${color}10`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <span className="font-pixel text-sm truncate" style={{ color }}>{displayName}</span>
          <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
            ({sortedLogs.length})
          </span>
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

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {sortedLogs.length === 0 ? (
          <div className="text-center py-8">
            <span className="text-2xl block mb-2" style={{ color: 'var(--text-secondary)' }}>
              {/* scroll icon via unicode */}
            </span>
            <p className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
              아직 작업 이력이 없습니다
            </p>
          </div>
        ) : (
          sortedLogs.map((entry) => {
            const style = STATUS_STYLES[entry.status] ?? STATUS_STYLES.running;
            const isExpanded = expandedTaskId === entry.taskId;

            return (
              <div
                key={entry.taskId}
                className="rounded-lg p-3 border cursor-pointer transition-colors hover:border-opacity-60"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border)',
                }}
                onClick={() => setExpandedTaskId(isExpanded ? null : entry.taskId)}
              >
                {/* Status + Duration row */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${style.dot}`} />
                    <span className={`text-[10px] font-mono font-semibold ${style.text}`}>
                      {style.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {entry.durationMs != null && (
                      <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
                        {formatDuration(entry.durationMs)}
                      </span>
                    )}
                    {entry.cost != null && entry.cost > 0 && (
                      <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
                        ${entry.cost.toFixed(4)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Prompt */}
                <div className="text-xs font-mono line-clamp-2" style={{ color: 'var(--text-primary)' }}>
                  {entry.prompt || 'No prompt'}
                </div>

                {/* Summary */}
                {entry.summary && (
                  <div className="text-[10px] font-mono mt-1 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                    {entry.summary}
                  </div>
                )}

                {/* Gemini Review */}
                {entry.geminiReview && <ReviewBadge review={entry.geminiReview} />}

                {/* Expandable rawText */}
                {isExpanded && entry.rawText && (
                  <div
                    className="mt-2 p-2 rounded text-[10px] font-mono whitespace-pre-wrap overflow-auto"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-secondary)',
                      maxHeight: '200px',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {entry.rawText}
                  </div>
                )}

                {/* Expand hint */}
                {entry.rawText && !isExpanded && (
                  <div className="text-[9px] font-mono mt-1" style={{ color: 'var(--text-tertiary, #555)' }}>
                    Click to expand raw output
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
