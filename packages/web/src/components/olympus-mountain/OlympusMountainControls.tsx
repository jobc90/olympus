// ============================================================================
// OlympusMountainControls — Bottom control bar for the Olympus Mountain view
// ============================================================================

import { useState } from 'react';
import type { WorkerConfig, WorkerDashboardState, WorkerBehavior } from '../../lib/types';
import { BEHAVIOR_INFO } from '../../lib/state-mapper';

interface OlympusMountainControlsProps {
  workers: WorkerConfig[];
  workerStates: Record<string, WorkerDashboardState>;
  onSetBehavior?: (workerId: string, behavior: WorkerBehavior) => void;
}

const QUICK_BEHAVIORS: WorkerBehavior[] = [
  'working', 'thinking', 'idle', 'completed', 'reviewing',
  'deploying', 'collaborating', 'chatting', 'resting',
  'error', 'offline', 'starting',
];

export function OlympusMountainControls({
  workers,
  workerStates,
  onSetBehavior,
}: OlympusMountainControlsProps) {
  const [selectedWorker, setSelectedWorker] = useState<string>(workers[0]?.id ?? '');
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="p-3"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderTop: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>Controls</span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs font-mono px-2 py-1 rounded hover:bg-white/10 transition-colors"
          style={{ color: 'var(--text-secondary)' }}
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {expanded && (
        <div className="pt-3" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>Worker:</span>
            <select
              value={selectedWorker}
              onChange={(e) => setSelectedWorker(e.target.value)}
              className="text-xs font-mono px-2 py-1 rounded border bg-transparent"
              style={{
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
                backgroundColor: 'var(--bg-primary)',
              }}
            >
              {workers.map(w => (
                <option key={w.id} value={w.id}>{w.emoji} {w.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-1">
            {QUICK_BEHAVIORS.map(behavior => {
              const info = BEHAVIOR_INFO[behavior];
              return (
                <button
                  key={behavior}
                  onClick={() => onSetBehavior?.(selectedWorker, behavior)}
                  className="text-[10px] font-mono px-2 py-1 rounded-md hover:opacity-80 transition-opacity"
                  style={{
                    backgroundColor: `${info.neonColor}18`,
                    color: info.neonColor,
                    border: `1px solid ${info.neonColor}30`,
                  }}
                >
                  {info.emoji} {info.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
