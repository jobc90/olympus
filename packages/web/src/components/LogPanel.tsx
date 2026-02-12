import React, { useRef, useEffect, useState } from 'react';
import type { LogPayload } from '@olympus-dev/protocol';
import { Card, CardHeader } from './Card';

interface Props {
  logs: LogPayload[];
}

const LEVEL_CONFIG: Record<string, { color: string; bgColor: string; icon: string }> = {
  info: {
    color: 'text-text-secondary',
    bgColor: '',
    icon: 'ℹ️',
  },
  warn: {
    color: 'text-warning',
    bgColor: 'bg-warning/5',
    icon: '⚠️',
  },
  error: {
    color: 'text-error',
    bgColor: 'bg-error/5',
    icon: '❌',
  },
  debug: {
    color: 'text-text-muted',
    bgColor: '',
    icon: '🔍',
  },
};

export function LogPanel({ logs }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length, filter]);

  const filteredLogs = filter ? logs.filter((l) => l.level === filter) : logs;

  const logCounts = {
    error: logs.filter((l) => l.level === 'error').length,
    warn: logs.filter((l) => l.level === 'warn').length,
  };

  return (
    <Card className="flex flex-col">
      <CardHeader
        action={
          <div className="flex items-center gap-2">
            {logCounts.error > 0 && (
              <button
                onClick={() => setFilter(filter === 'error' ? null : 'error')}
                className={`text-xs px-1.5 py-0.5 rounded ${
                  filter === 'error' ? 'bg-error/20 text-error' : 'text-error/70 hover:text-error'
                }`}
              >
                {logCounts.error} errors
              </button>
            )}
            {logCounts.warn > 0 && (
              <button
                onClick={() => setFilter(filter === 'warn' ? null : 'warn')}
                className={`text-xs px-1.5 py-0.5 rounded ${
                  filter === 'warn' ? 'bg-warning/20 text-warning' : 'text-warning/70 hover:text-warning'
                }`}
              >
                {logCounts.warn} warnings
              </button>
            )}
            {filter && (
              <button
                onClick={() => setFilter(null)}
                className="text-xs text-text-muted hover:text-text-secondary"
              >
                Clear
              </button>
            )}
          </div>
        }
      >
        Logs
      </CardHeader>

      <div
        ref={scrollRef}
        className="max-h-48 overflow-y-auto font-mono text-xs space-y-0.5"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-text-muted text-center py-8">
            {logs.length === 0 ? (
              <>
                <div className="text-2xl mb-2 opacity-50">📋</div>
                <p>Waiting for events...</p>
              </>
            ) : (
              <p>No {filter} logs</p>
            )}
          </div>
        ) : (
          filteredLogs.map((log, i) => {
            const config = LEVEL_CONFIG[log.level] ?? LEVEL_CONFIG.info;

            return (
              <div
                key={i}
                className={`px-2 py-1 rounded ${config.bgColor} ${config.color} hover:bg-surface-hover transition-colors`}
              >
                <span className="opacity-50 mr-2">{config.icon}</span>
                <span className="opacity-60">[{log.level.toUpperCase().padEnd(5)}]</span>{' '}
                {log.message}
              </div>
            );
          })
        )}
      </div>

      {/* Quick Stats */}
      <div className="pt-3 mt-3 border-t border-border flex items-center justify-between text-xs text-text-muted">
        <span>{logs.length} total logs</span>
        <span>
          {logCounts.error > 0 && <span className="text-error mr-2">{logCounts.error}E</span>}
          {logCounts.warn > 0 && <span className="text-warning">{logCounts.warn}W</span>}
          {logCounts.error === 0 && logCounts.warn === 0 && <span className="text-success">All clear</span>}
        </span>
      </div>
    </Card>
  );
}
