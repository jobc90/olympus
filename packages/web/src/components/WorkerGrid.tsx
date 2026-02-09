import React, { useState } from 'react';
import { Card, CardHeader } from './Card';
import type { WorkerInfo } from '../hooks/useOlympus';

const STATUS_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  running: { icon: '⚡', color: 'text-success', bg: 'bg-success/10' },
  completed: { icon: '✅', color: 'text-primary', bg: 'bg-primary/10' },
  failed: { icon: '❌', color: 'text-error', bg: 'bg-error/10' },
};

interface WorkerGridProps {
  workers: Map<string, WorkerInfo>;
}

export function WorkerGrid({ workers }: WorkerGridProps) {
  const [expandedWorker, setExpandedWorker] = useState<string | null>(null);
  const workerList = Array.from(workers.values());

  if (workerList.length === 0) return null;

  const running = workerList.filter(w => w.status === 'running').length;
  const completed = workerList.filter(w => w.status === 'completed').length;
  const failed = workerList.filter(w => w.status === 'failed').length;

  return (
    <Card>
      <CardHeader>Workers ({workerList.length})</CardHeader>

      {/* Summary Stats */}
      <div className="flex gap-3 mb-3 text-xs">
        {running > 0 && <span className="text-success">⚡ {running} running</span>}
        {completed > 0 && <span className="text-primary">✅ {completed} done</span>}
        {failed > 0 && <span className="text-error">❌ {failed} failed</span>}
      </div>

      {/* Worker List */}
      <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
        {workerList.map((worker) => {
          const cfg = STATUS_CONFIG[worker.status] ?? STATUS_CONFIG.running;
          const isExpanded = expandedWorker === worker.workerId;

          return (
            <div
              key={worker.workerId}
              className={`${cfg.bg} border border-border/50 rounded-lg p-2 cursor-pointer transition-colors hover:border-border`}
              onClick={() => setExpandedWorker(isExpanded ? null : worker.workerId)}
            >
              <div className="flex items-center gap-2">
                <span>{cfg.icon}</span>
                <span className="font-mono text-xs text-text-secondary">{worker.workerId.slice(0, 8)}</span>
                <span className={`text-xs ${cfg.color}`}>{worker.status}</span>
                <span className="text-xs text-text-muted ml-auto line-clamp-1">{worker.projectPath}</span>
              </div>

              {/* Expanded Output */}
              {isExpanded && worker.output && (
                <pre className="mt-2 p-2 bg-background rounded text-xs text-text-secondary font-mono max-h-[200px] overflow-y-auto custom-scrollbar whitespace-pre-wrap">
                  {worker.output.slice(-2000)}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
