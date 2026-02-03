import React from 'react';
import type { PhasePayload } from '@olympus-dev/protocol';

const PHASES = [
  { num: -1, name: 'Smart Intake' },
  { num: 0, name: 'Contract' },
  { num: 1, name: 'DAG' },
  { num: 2, name: 'Review' },
  { num: 3, name: 'Lock' },
  { num: 4, name: 'Execute' },
  { num: 5, name: 'Merge' },
  { num: 6, name: 'Improve' },
  { num: 7, name: 'Test' },
  { num: 8, name: 'Judge' },
];

interface Props {
  phase: PhasePayload | null;
}

export function PhaseProgress({ phase }: Props) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-4">
      <h2 className="text-sm font-semibold text-gray-400 mb-3">ORCHESTRATION PHASES</h2>
      <div className="flex items-center gap-1">
        {PHASES.map((p) => {
          const isCurrent = phase?.phase === p.num;
          const isDone = phase ? p.num < phase.phase : false;
          return (
            <div key={p.num} className="flex flex-col items-center flex-1 min-w-0">
              <div
                className={`w-full h-2 rounded-full transition-colors ${
                  isDone ? 'bg-green-500' : isCurrent ? 'bg-cyan-400 animate-pulse' : 'bg-gray-700'
                }`}
              />
              <span className={`text-[10px] mt-1 truncate ${
                isCurrent ? 'text-cyan-400 font-bold' : isDone ? 'text-green-400' : 'text-gray-600'
              }`}>
                {p.name}
              </span>
            </div>
          );
        })}
      </div>
      {phase && (
        <div className="mt-2 text-sm">
          <span className="text-cyan-400">Phase {phase.phase}</span>
          <span className="text-gray-400">: {phase.phaseName}</span>
          <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
            phase.status === 'completed' ? 'bg-green-500/20 text-green-400' :
            phase.status === 'failed' ? 'bg-red-500/20 text-red-400' :
            'bg-cyan-500/20 text-cyan-400'
          }`}>
            {phase.status}
          </span>
        </div>
      )}
    </div>
  );
}
