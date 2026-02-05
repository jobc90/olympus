import React from 'react';
import type { PhasePayload } from '@olympus-dev/protocol';
import { Card, CardHeader } from './Card';

const PHASES = [
  { num: -1, name: 'Intake', icon: '📥' },
  { num: 0, name: 'Contract', icon: '📋' },
  { num: 1, name: 'DAG', icon: '🔀' },
  { num: 2, name: 'Review', icon: '👁️' },
  { num: 3, name: 'Lock', icon: '🔒' },
  { num: 4, name: 'Execute', icon: '⚡' },
  { num: 5, name: 'Merge', icon: '🔗' },
  { num: 6, name: 'Improve', icon: '✨' },
  { num: 7, name: 'Test', icon: '🧪' },
  { num: 8, name: 'Judge', icon: '⚖️' },
];

interface Props {
  phase: PhasePayload | null;
}

export function PhaseProgress({ phase }: Props) {
  const currentPhaseIndex = phase ? PHASES.findIndex((p) => p.num === phase.phase) : -1;

  return (
    <Card>
      <CardHeader>Orchestration Phases</CardHeader>

      {/* Progress Bar */}
      <div className="relative mb-4">
        <div className="flex gap-1">
          {PHASES.map((p, index) => {
            const isCurrent = phase?.phase === p.num;
            const isDone = currentPhaseIndex > -1 && index < currentPhaseIndex;
            const isFailed = isCurrent && phase?.status === 'failed';

            return (
              <div
                key={p.num}
                className="flex-1 relative group"
              >
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${
                    isFailed
                      ? 'bg-error'
                      : isDone
                      ? 'bg-success'
                      : isCurrent
                      ? 'bg-primary animate-pulse shadow-glow-cyan'
                      : 'bg-surface-hover'
                  }`}
                />

                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-active rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  <span className="mr-1">{p.icon}</span>
                  {p.name}
                </div>
              </div>
            );
          })}
        </div>

        {/* Phase Labels (abbreviated) */}
        <div className="flex gap-1 mt-1">
          {PHASES.map((p, index) => {
            const isCurrent = phase?.phase === p.num;
            const isDone = currentPhaseIndex > -1 && index < currentPhaseIndex;

            return (
              <span
                key={p.num}
                className={`flex-1 text-[9px] text-center truncate transition-colors ${
                  isCurrent
                    ? 'text-primary font-semibold'
                    : isDone
                    ? 'text-success'
                    : 'text-text-muted'
                }`}
              >
                {p.name}
              </span>
            );
          })}
        </div>
      </div>

      {/* Current Phase Info */}
      {phase && (
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div className="flex items-center gap-2">
            <span className="text-lg">
              {PHASES.find((p) => p.num === phase.phase)?.icon || '⚡'}
            </span>
            <div>
              <span className="text-primary font-semibold">Phase {phase.phase}</span>
              <span className="text-text-secondary ml-2">{phase.phaseName}</span>
            </div>
          </div>

          <span
            className={`px-2 py-1 rounded-full text-xs font-medium ${
              phase.status === 'completed'
                ? 'bg-success/20 text-success'
                : phase.status === 'failed'
                ? 'bg-error/20 text-error'
                : 'bg-primary/20 text-primary'
            }`}
          >
            {phase.status}
          </span>
        </div>
      )}

      {!phase && (
        <div className="text-center text-text-muted text-sm py-2">
          Waiting for orchestration to start...
        </div>
      )}
    </Card>
  );
}
