import React, { useState, useEffect, useRef } from 'react';
import { Card, CardHeader } from './Card';
import type { LogPayload } from '@olympus-dev/protocol';

interface Props {
  logs: LogPayload[];
}

interface CategoryInfo {
  tag: string;
  color: string;
  bgColor: string;
}

function categorizeLog(message: string): CategoryInfo {
  if (message.startsWith('[cli:complete]') || message.startsWith('[cli:')) {
    return { tag: 'CLI', color: '#4FC3F7', bgColor: 'rgba(79, 195, 247, 0.1)' };
  }
  if (message.startsWith('[worker]') || message.startsWith('[Worker]')) {
    return { tag: 'Worker', color: '#66BB6A', bgColor: 'rgba(102, 187, 106, 0.1)' };
  }
  if (message.startsWith('[agent]')) {
    return { tag: 'Agent', color: '#AB47BC', bgColor: 'rgba(171, 71, 188, 0.1)' };
  }
  if (message.startsWith('[session]')) {
    return { tag: 'Session', color: '#FF7043', bgColor: 'rgba(255, 112, 67, 0.1)' };
  }
  if (message.startsWith('[codex]')) {
    return { tag: 'Codex', color: '#FFCA28', bgColor: 'rgba(255, 202, 40, 0.1)' };
  }
  return { tag: 'System', color: '#9E9E9E', bgColor: 'rgba(158, 158, 158, 0.1)' };
}

export function GatewayEventLog({ logs }: Props) {
  const [filter, setFilter] = useState<'all' | 'error' | 'warn'>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const filteredLogs = logs.filter((log) => {
    if (filter === 'all') return true;
    return log.level === filter;
  });

  const errorCount = logs.filter((l) => l.level === 'error').length;
  const warnCount = logs.filter((l) => l.level === 'warn').length;

  return (
    <Card className="flex flex-col h-full">
      <CardHeader
        action={
          <div className="flex gap-2 text-xs font-mono">
            <button
              onClick={() => setFilter('all')}
              className={`px-2 py-0.5 rounded border transition-colors ${
                filter === 'all'
                  ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                  : 'border-border/50 text-text-tertiary hover:text-text-secondary'
              }`}
            >
              All ({logs.length})
            </button>
            {errorCount > 0 && (
              <button
                onClick={() => setFilter('error')}
                className={`px-2 py-0.5 rounded border transition-colors ${
                  filter === 'error'
                    ? 'bg-red-500/20 border-red-500/50 text-red-300'
                    : 'border-border/50 text-text-tertiary hover:text-text-secondary'
                }`}
              >
                Error ({errorCount})
              </button>
            )}
            {warnCount > 0 && (
              <button
                onClick={() => setFilter('warn')}
                className={`px-2 py-0.5 rounded border transition-colors ${
                  filter === 'warn'
                    ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300'
                    : 'border-border/50 text-text-tertiary hover:text-text-secondary'
                }`}
              >
                Warn ({warnCount})
              </button>
            )}
          </div>
        }
      >
        <span className="flex items-center gap-2">
          Gateway Events
          <span className="text-xs text-text-tertiary font-normal">
            ({filteredLogs.length})
          </span>
        </span>
      </CardHeader>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-1 font-mono text-xs min-h-0"
        style={{ maxHeight: '240px' }}
      >
        {filteredLogs.length === 0 ? (
          <div className="text-text-tertiary text-center py-4">
            Waiting for gateway events...
          </div>
        ) : (
          filteredLogs.map((log, idx) => {
            const category = categorizeLog(log.message);
            const levelColor =
              log.level === 'error'
                ? 'text-red-400'
                : log.level === 'warn'
                ? 'text-yellow-400'
                : 'text-text-secondary';

            return (
              <div key={idx} className="flex items-start gap-2 py-1 px-2 rounded hover:bg-bg-secondary/30">
                <span
                  className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide flex-shrink-0"
                  style={{
                    color: category.color,
                    backgroundColor: category.bgColor,
                    border: `1px solid ${category.color}40`,
                  }}
                >
                  {category.tag}
                </span>
                <span className={`flex-1 break-words ${levelColor}`}>
                  {log.message}
                </span>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
