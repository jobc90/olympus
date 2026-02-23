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
        className="rounded-2xl p-10 text-center"
        style={{
          background: 'linear-gradient(145deg, rgba(17, 24, 39, 0.92), rgba(11, 18, 31, 0.9))',
          border: '1px solid var(--border)',
        }}
      >
        <span className="text-3xl mb-3 block">{'\u{2692}\uFE0F'}</span>
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
    <section
      className="rounded-2xl border p-4"
      style={{
        background: 'linear-gradient(145deg, rgba(17, 24, 39, 0.92), rgba(11, 18, 31, 0.9))',
        borderColor: 'var(--border)',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Active Workers
        </h2>
        <span className="text-xs font-mono uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
          {workers.length} workers
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
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
    </section>
  );
}
