import React from 'react';
import type { TaskPayload } from '@olympus-dev/protocol';
import { Card, CardHeader } from './Card';

interface Props {
  tasks: TaskPayload[];
}

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; bgColor: string }> = {
  pending: {
    icon: <span className="w-2 h-2 rounded-full border border-text-muted" />,
    color: 'text-text-muted',
    bgColor: '',
  },
  in_progress: {
    icon: <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />,
    color: 'text-warning',
    bgColor: 'bg-warning/5',
  },
  completed: {
    icon: (
      <svg className="w-4 h-4 text-success" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
    ),
    color: 'text-success',
    bgColor: 'bg-success/5',
  },
  failed: {
    icon: (
      <svg className="w-4 h-4 text-error" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
          clipRule="evenodd"
        />
      </svg>
    ),
    color: 'text-error',
    bgColor: 'bg-error/5',
  },
};

export function TaskList({ tasks }: Props) {
  if (tasks.length === 0) {
    return null;
  }

  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const progress = Math.round((completedCount / tasks.length) * 100);

  return (
    <Card>
      <CardHeader
        action={
          <span className="text-xs text-text-muted">
            {completedCount}/{tasks.length} ({progress}%)
          </span>
        }
      >
        Tasks
      </CardHeader>

      {/* Progress Bar */}
      <div className="h-1 bg-surface-hover rounded-full mb-3 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary to-success rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Task List */}
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {tasks.map((task) => {
          const config = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending;

          return (
            <div
              key={task.taskId}
              className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${config.bgColor}`}
            >
              <div className="flex-shrink-0">{config.icon}</div>

              <div className="flex-1 min-w-0">
                <span className={`text-sm ${task.status === 'completed' ? 'text-text-secondary' : 'text-text'}`}>
                  {task.subject}
                </span>
              </div>

              {task.featureSet && (
                <span className="flex-shrink-0 text-xs px-1.5 py-0.5 bg-surface-hover rounded text-text-muted">
                  {task.featureSet}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
