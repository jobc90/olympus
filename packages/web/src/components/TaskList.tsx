import React from 'react';
import type { TaskPayload } from '@olympus-dev/protocol';

interface Props {
  tasks: TaskPayload[];
}

const STATUS_ICONS: Record<string, { icon: string; color: string }> = {
  pending: { icon: '○', color: 'text-gray-500' },
  in_progress: { icon: '◉', color: 'text-yellow-400' },
  completed: { icon: '✓', color: 'text-green-400' },
  failed: { icon: '✗', color: 'text-red-400' },
};

export function TaskList({ tasks }: Props) {
  if (tasks.length === 0) return null;
  return (
    <div className="bg-gray-800/50 rounded-lg p-4">
      <h2 className="text-sm font-semibold text-gray-400 mb-2">TASKS</h2>
      <div className="space-y-1">
        {tasks.map((t) => {
          const s = STATUS_ICONS[t.status] ?? STATUS_ICONS.pending;
          return (
            <div key={t.taskId} className="flex items-center gap-2 text-sm">
              <span className={s.color}>{s.icon}</span>
              <span className="text-gray-200">{t.subject}</span>
              {t.featureSet && <span className="text-gray-600 text-xs">({t.featureSet})</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
