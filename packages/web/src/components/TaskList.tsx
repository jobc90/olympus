import React, { useState, useMemo } from 'react';
import type { TaskPayload } from '@olympus-dev/protocol';
import { Card, CardHeader } from './Card';

interface Props {
  tasks: TaskPayload[];
}

interface TaskGroup {
  name: string;
  tasks: TaskPayload[];
  stats: {
    total: number;
    completed: number;
    failed: number;
    in_progress: number;
    pending: number;
  };
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

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const groupsMap = new Map<string, TaskPayload[]>();
    
    tasks.forEach(task => {
      const key = task.featureSet || 'General';
      if (!groupsMap.has(key)) groupsMap.set(key, []);
      groupsMap.get(key)!.push(task);
    });

    const result: TaskGroup[] = [];
    groupsMap.forEach((groupTasks, name) => {
      result.push({
        name,
        tasks: groupTasks,
        stats: {
          total: groupTasks.length,
          completed: groupTasks.filter(t => t.status === 'completed').length,
          failed: groupTasks.filter(t => t.status === 'failed').length,
          in_progress: groupTasks.filter(t => t.status === 'in_progress').length,
          pending: groupTasks.filter(t => t.status === 'pending').length,
        }
      });
    });

    // Sort: General last, then alphabetical
    return result.sort((a, b) => {
      if (a.name === 'General') return 1;
      if (b.name === 'General') return -1;
      return a.name.localeCompare(b.name);
    });
  }, [tasks]);

  const toggleGroup = (name: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const totalTasks = tasks.length;
  const totalCompleted = tasks.filter((t) => t.status === 'completed').length;
  const totalFailed = tasks.filter((t) => t.status === 'failed').length;
  const progress = Math.round((totalCompleted / totalTasks) * 100);

  // Gradient based on failure presence
  const progressGradient = totalFailed > 0 
    ? 'from-primary to-error' 
    : 'from-primary to-success';

  return (
    <Card>
      <CardHeader
        action={
          <span className="text-xs text-text-muted">
            {totalCompleted}/{totalTasks} ({progress}%)
          </span>
        }
      >
        Tasks
      </CardHeader>

      {/* Overall Progress Bar */}
      <div className="h-1 bg-surface-hover rounded-full mb-3 overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${progressGradient} rounded-full transition-all duration-500`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Task List Groups */}
      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
        {groups.map((group) => {
          const isCollapsed = collapsedGroups.has(group.name);
          const groupProgress = Math.round((group.stats.completed / group.stats.total) * 100);
          const hasInProgress = group.stats.in_progress > 0;
          
          return (
            <div key={group.name} className={`space-y-1 ${hasInProgress ? 'bg-warning/5 rounded-lg p-1' : ''}`}>
              {/* Group Header */}
              <button
                className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-surface-hover rounded transition-colors text-left group"
                onClick={() => toggleGroup(group.name)}
              >
                <svg
                  className={`w-3 h-3 text-text-muted transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                
                <span className="text-sm font-medium text-text-secondary flex-1">
                  {group.name}
                </span>

                <div className="flex items-center gap-2">
                  {/* Mini Stats Badges */}
                  {group.stats.failed > 0 && (
                    <span className="text-[10px] px-1.5 rounded-full bg-error/10 text-error font-mono">
                      {group.stats.failed} err
                    </span>
                  )}
                  {group.stats.in_progress > 0 && (
                    <span className="text-[10px] px-1.5 rounded-full bg-warning/10 text-warning font-mono animate-pulse">
                      {group.stats.in_progress} run
                    </span>
                  )}
                  
                  {/* Mini Progress */}
                  <div className="w-12 h-1 bg-surface-hover rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/70"
                      style={{ width: `${groupProgress}%` }}
                    />
                  </div>
                  
                  <span className="text-xs text-text-muted w-8 text-right">
                    {group.stats.completed}/{group.stats.total}
                  </span>
                </div>
              </button>

              {/* Tasks */}
              {!isCollapsed && (
                <div className="space-y-1 pl-2">
                  {group.tasks.map((task) => {
                    const config = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending;
                    const isCompleted = task.status === 'completed';

                    return (
                      <div
                        key={task.taskId}
                        className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${config.bgColor}`}
                      >
                        <div className="flex-shrink-0">{config.icon}</div>

                        <div className="flex-1 min-w-0">
                          <span 
                            className={`text-sm block truncate ${isCompleted ? 'text-text-muted line-through opacity-70' : 'text-text'}`}
                            title={task.subject}
                          >
                            {task.subject}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}