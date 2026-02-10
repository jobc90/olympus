import React, { useState } from 'react';
import { Card, CardHeader } from './Card';
import type { CliHistoryItem } from '../hooks/useOlympus';

interface Props {
  history: CliHistoryItem[];
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

export function AgentHistoryPanel({ history }: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (history.length === 0) return null;

  return (
    <Card>
      <CardHeader>CLI History ({history.length})</CardHeader>
      <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
        {history.map((item, i) => (
          <div
            key={`${item.sessionKey}-${item.timestamp}`}
            className="p-2 rounded-lg bg-surface-hover/50 hover:bg-surface-hover transition-colors cursor-pointer"
            onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-xs text-success">$</span>
                <span className="text-xs text-text-secondary truncate">
                  {item.sessionKey}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-text-muted flex-shrink-0">
                <span>${item.cost.toFixed(4)}</span>
                <span>{formatDuration(item.durationMs)}</span>
                <span>{formatRelativeTime(item.timestamp)}</span>
              </div>
            </div>

            {/* Token counts */}
            <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
              <span>in: {item.usage.inputTokens.toLocaleString()}</span>
              <span>out: {item.usage.outputTokens.toLocaleString()}</span>
            </div>

            {/* Expanded: show response text */}
            {expandedIdx === i && item.text && (
              <div className="mt-2 p-2 rounded bg-[#1a1a2e] max-h-[200px] overflow-y-auto">
                <pre className="whitespace-pre-wrap text-xs text-[#e0e0e0] leading-relaxed">
                  {item.text}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
