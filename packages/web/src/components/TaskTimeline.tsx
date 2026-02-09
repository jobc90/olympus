import React from 'react';
import { Card, CardHeader } from './Card';

export interface TaskHistoryItem {
  id: string;
  command: string;
  status: 'success' | 'partial' | 'failed';
  summary: string;
  duration: number;
  timestamp: number;
  workerCount: number;
}

interface TaskTimelineProps {
  tasks: TaskHistoryItem[];
}

const STATUS_CONFIG: Record<string, { icon: string; color: string }> = {
  success: { icon: '✅', color: 'text-success' },
  partial: { icon: '⚠️', color: 'text-warning' },
  failed: { icon: '❌', color: 'text-error' },
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function TaskTimeline({ tasks }: TaskTimelineProps) {
  if (tasks.length === 0) return null;

  return (
    <Card>
      <CardHeader>Task History ({tasks.length})</CardHeader>
      <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
        {tasks.map((task) => {
          const cfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.failed;
          return (
            <div
              key={task.id}
              className="flex items-start gap-2 p-2 rounded-lg bg-surface-hover/50 hover:bg-surface-hover transition-colors"
            >
              <span className="mt-0.5">{cfg.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-text-secondary truncate">{task.command}</div>
                <div className="text-xs text-text-muted mt-0.5">{task.summary}</div>
                <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
                  <span>{formatRelativeTime(task.timestamp)}</span>
                  <span>{formatDuration(task.duration)}</span>
                  {task.workerCount > 0 && <span>{task.workerCount} worker{task.workerCount > 1 ? 's' : ''}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
