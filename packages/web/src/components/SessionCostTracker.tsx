import React from 'react';
import { Card, CardHeader } from './Card';
import type { CliHistoryItem } from '../hooks/useOlympus';

interface Props {
  history: CliHistoryItem[];
}

export function SessionCostTracker({ history }: Props) {
  if (history.length === 0) return null;

  const totalCost = history.reduce((sum, h) => sum + h.cost, 0);
  const totalInput = history.reduce((sum, h) => sum + h.usage.inputTokens, 0);
  const totalOutput = history.reduce((sum, h) => sum + h.usage.outputTokens, 0);
  const totalRuns = history.length;

  // Group by sessionKey for breakdown
  const bySession = new Map<string, { cost: number; runs: number }>();
  for (const h of history) {
    const existing = bySession.get(h.sessionKey) ?? { cost: 0, runs: 0 };
    bySession.set(h.sessionKey, { cost: existing.cost + h.cost, runs: existing.runs + 1 });
  }

  return (
    <Card>
      <CardHeader>Cost Tracker</CardHeader>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-surface-hover/50 rounded-lg p-2 text-center">
          <div className="text-lg font-mono text-primary">${totalCost.toFixed(4)}</div>
          <div className="text-xs text-text-muted">Total Cost</div>
        </div>
        <div className="bg-surface-hover/50 rounded-lg p-2 text-center">
          <div className="text-lg font-mono text-text-secondary">{totalRuns}</div>
          <div className="text-xs text-text-muted">Runs</div>
        </div>
      </div>

      {/* Token breakdown */}
      <div className="flex items-center justify-between text-xs text-text-muted mb-3 px-1">
        <span>Input: {totalInput.toLocaleString()} tokens</span>
        <span>Output: {totalOutput.toLocaleString()} tokens</span>
      </div>

      {/* Session breakdown */}
      {bySession.size > 1 && (
        <div className="space-y-1 max-h-[120px] overflow-y-auto custom-scrollbar">
          {Array.from(bySession.entries())
            .sort((a, b) => b[1].cost - a[1].cost)
            .map(([key, data]) => (
              <div key={key} className="flex items-center justify-between text-xs px-1">
                <span className="text-text-muted truncate max-w-[60%]">{key}</span>
                <span className="text-text-secondary font-mono">${data.cost.toFixed(4)} ({data.runs})</span>
              </div>
            ))}
        </div>
      )}
    </Card>
  );
}
