import React from 'react';
import { Card, CardHeader } from './Card';
import type { AgentProgress } from '../hooks/useOlympus';

const STATE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  IDLE: { icon: '⏸', label: 'Idle', color: 'text-text-muted' },
  ANALYZING: { icon: '🔍', label: 'Analyzing', color: 'text-primary' },
  PLANNING: { icon: '📋', label: 'Planning', color: 'text-warning' },
  EXECUTING: { icon: '⚡', label: 'Executing', color: 'text-success' },
  REVIEWING: { icon: '🔎', label: 'Reviewing', color: 'text-purple-400' },
  REPORTING: { icon: '📊', label: 'Reporting', color: 'text-blue-400' },
  INTERRUPT: { icon: '⛔', label: 'Interrupted', color: 'text-error' },
};

const STATES_ORDER = ['IDLE', 'ANALYZING', 'PLANNING', 'EXECUTING', 'REVIEWING', 'REPORTING'];

interface AgentPanelProps {
  state: string;
  progress: AgentProgress | null;
  taskId: string | null;
  onCancel?: () => void;
}

export function AgentPanel({ state, progress, taskId, onCancel }: AgentPanelProps) {
  const currentConfig = STATE_CONFIG[state] ?? STATE_CONFIG.IDLE;
  const isActive = state !== 'IDLE';
  const currentIndex = STATES_ORDER.indexOf(state);

  return (
    <Card>
      <CardHeader
        action={isActive && onCancel ? (
          <button onClick={onCancel} className="text-xs text-error hover:text-error/80 transition-colors">
            Cancel
          </button>
        ) : undefined}
      >
        Codex Agent
      </CardHeader>

      {/* State Machine Visualization */}
      <div className="flex items-center gap-1 mb-3">
        {STATES_ORDER.map((s, i) => {
          const cfg = STATE_CONFIG[s];
          const isCompleted = currentIndex > i;
          const isCurrent = state === s;
          return (
            <React.Fragment key={s}>
              <div
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                  isCurrent
                    ? `bg-primary/20 ${cfg.color} font-semibold`
                    : isCompleted
                    ? 'bg-success/10 text-success'
                    : 'bg-surface-hover text-text-muted'
                }`}
              >
                <span>{cfg.icon}</span>
                <span className="hidden xl:inline">{cfg.label}</span>
              </div>
              {i < STATES_ORDER.length - 1 && (
                <span className={`text-xs ${isCompleted ? 'text-success' : 'text-text-muted'}`}>→</span>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Current Status */}
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-lg ${currentConfig.color}`}>{currentConfig.icon}</span>
        <span className={`text-sm font-medium ${currentConfig.color}`}>{currentConfig.label}</span>
        {taskId && (
          <span className="font-mono text-xs text-text-muted ml-auto">{taskId}</span>
        )}
      </div>

      {/* Progress Bar */}
      {progress && progress.progress !== undefined && (
        <div className="mb-2">
          <div className="w-full bg-surface-hover rounded-full h-1.5">
            <div
              className="bg-primary h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, progress.progress)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-text-muted mt-1">
            <span>{progress.message}</span>
            <span>{Math.round(progress.progress)}%</span>
          </div>
        </div>
      )}

      {/* Worker Count */}
      {progress && progress.workerCount !== undefined && progress.workerCount > 0 && (
        <div className="text-xs text-text-secondary">
          Workers: {progress.completedWorkers ?? 0}/{progress.workerCount}
        </div>
      )}

      {/* Idle Message */}
      {!isActive && (
        <p className="text-xs text-text-muted">Agent is idle. Send a command to start.</p>
      )}
    </Card>
  );
}
