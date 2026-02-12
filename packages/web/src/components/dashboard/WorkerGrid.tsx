// ============================================================================
// WorkerGrid — Grid container for worker cards
// ============================================================================

import type { WorkerConfig, WorkerDashboardState } from '../../lib/types';
import { WorkerCard } from './WorkerCard';

interface WorkerGridProps {
  workers: WorkerConfig[];
  workerStates: Record<string, WorkerDashboardState>;
  onChatClick?: (workerId: string) => void;
  onDetailClick?: (workerId: string) => void;
}

export function WorkerGrid({ workers, workerStates, onChatClick, onDetailClick }: WorkerGridProps) {
  if (workers.length === 0) {
    return (
      <div
        className="rounded-xl p-8 text-center"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <span className="text-3xl mb-3 block">Workers</span>
        <p className="font-mono text-sm" style={{ color: 'var(--text-secondary)' }}>
          No workers registered
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
          Connect to an Olympus Gateway to see workers
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-pixel text-sm mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
        <span>Workers</span>
        <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
          ({workers.length})
        </span>
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {workers.map(worker => (
          <WorkerCard
            key={worker.id}
            worker={worker}
            state={workerStates[worker.id]}
            onChatClick={onChatClick}
            onDetailClick={onDetailClick}
          />
        ))}
      </div>
    </div>
  );
}
