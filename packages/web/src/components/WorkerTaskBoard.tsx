import React, { useEffect, useState } from 'react';
import { Card, CardHeader } from './Card';
import type { WorkerTaskEntry } from '../hooks/useOlympus';

interface Props {
  tasks: WorkerTaskEntry[];
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function formatCost(durationMs?: number): string {
  if (!durationMs) return '';
  // Rough estimate: $0.001 per minute
  const cost = (durationMs / 60000) * 0.001;
  return `$${cost.toFixed(3)}`;
}

export function WorkerTaskBoard({ tasks }: Props) {
  const [now, setNow] = useState(Date.now());

  // Auto-update elapsed time every second
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const activeTasks = tasks.filter(t => t.status === 'active');
  const completedTasks = tasks.filter(t => t.status !== 'active').slice(0, 10);

  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <span className="flex items-center gap-2">
          Worker Tasks
          {activeTasks.length > 0 && (
            <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
              {activeTasks.length}
            </span>
          )}
        </span>
      </CardHeader>

      <div className="flex-1 overflow-y-auto space-y-2 min-h-0" style={{ maxHeight: '400px' }}>
        {activeTasks.length === 0 && completedTasks.length === 0 ? (
          <div className="text-xs text-text-tertiary font-mono text-center py-8">
            No active tasks — assign work via Telegram or CLI
          </div>
        ) : (
          <>
            {/* Active tasks */}
            {activeTasks.map((task) => {
              const elapsed = now - task.startedAt;
              return (
                <div
                  key={task.taskId}
                  className="flex items-start gap-2 p-2 rounded bg-bg-secondary/30 border border-border/50"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className="text-xs font-semibold font-mono truncate"
                        style={{ color: task.workerColor ?? 'var(--text-primary)' }}
                      >
                        {task.workerName}
                      </span>
                      <span className="text-xs text-text-tertiary font-mono flex-shrink-0">
                        {formatDuration(elapsed)}
                      </span>
                    </div>
                    <div className="text-xs text-text-secondary font-mono mt-0.5 line-clamp-2">
                      {task.prompt || 'Processing...'}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Completed tasks */}
            {completedTasks.map((task) => {
              const icon = task.status === 'completed' ? '✓' : task.status === 'timeout' ? '⏱' : '✗';
              const iconColor = task.status === 'completed' ? 'text-green-400' : task.status === 'timeout' ? 'text-yellow-400' : 'text-red-400';
              return (
                <div
                  key={task.taskId}
                  className="flex items-start gap-2 p-2 rounded bg-bg-secondary/10 border border-border/30 opacity-75"
                >
                  <div className={`flex-shrink-0 mt-0.5 text-xs font-bold ${iconColor}`}>
                    {icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className="text-xs font-semibold font-mono truncate"
                        style={{ color: task.workerColor ?? 'var(--text-primary)' }}
                      >
                        {task.workerName}
                      </span>
                      <span className="text-xs text-text-tertiary font-mono flex-shrink-0">
                        {task.durationMs ? formatDuration(task.durationMs) : '—'}
                        {task.durationMs && formatCost(task.durationMs) && (
                          <span className="ml-2">{formatCost(task.durationMs)}</span>
                        )}
                      </span>
                    </div>
                    <div className="text-xs text-text-tertiary font-mono mt-0.5 line-clamp-2">
                      {task.summary || task.prompt || '—'}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </Card>
  );
}
