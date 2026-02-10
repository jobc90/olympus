import React, { useState, useRef, useEffect } from 'react';
import { Card, CardHeader } from './Card';
import type { CliStreamState } from '../hooks/useOlympus';

interface Props {
  streams: Map<string, CliStreamState>;
}

export function LiveOutputPanel({ streams }: Props) {
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());

  if (streams.size === 0) return null;

  const entries = Array.from(streams.entries());
  // Active streams first, then completed (most recent first)
  entries.sort((a, b) => {
    if (a[1].active && !b[1].active) return -1;
    if (!a[1].active && b[1].active) return 1;
    return b[1].startedAt - a[1].startedAt;
  });

  const toggleCollapse = (key: string) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <Card>
      <CardHeader>Live Output ({streams.size})</CardHeader>
      <div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar">
        {entries.map(([key, stream]) => {
          const isCollapsed = !stream.active && collapsedKeys.has(key);
          return (
            <StreamEntry
              key={key}
              sessionKey={key}
              stream={stream}
              collapsed={isCollapsed}
              onToggle={() => toggleCollapse(key)}
            />
          );
        })}
      </div>
    </Card>
  );
}

interface StreamEntryProps {
  sessionKey: string;
  stream: CliStreamState;
  collapsed: boolean;
  onToggle: () => void;
}

function StreamEntry({ sessionKey, stream, collapsed, onToggle }: StreamEntryProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll for active streams
  useEffect(() => {
    if (stream.active && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [stream.chunks.length, stream.active]);

  // Auto-collapse completed streams
  const [autoCollapsed, setAutoCollapsed] = useState(false);
  useEffect(() => {
    if (!stream.active && !autoCollapsed) {
      setAutoCollapsed(true);
    }
  }, [stream.active, autoCollapsed]);

  const isHidden = !stream.active && (collapsed || autoCollapsed);

  return (
    <div className="rounded-lg bg-surface-hover/50">
      {/* Header */}
      <div
        className="flex items-center justify-between p-2 cursor-pointer hover:bg-surface-hover transition-colors rounded-t-lg"
        onClick={!stream.active ? onToggle : undefined}
      >
        <div className="flex items-center gap-2 min-w-0">
          {stream.active ? (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
          ) : (
            <svg className="w-3 h-3 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
          <span className="text-xs font-mono text-text-secondary truncate">{sessionKey}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted flex-shrink-0">
          <span>{stream.active ? 'running' : 'completed'}</span>
          {!stream.active && (
            <svg className={`w-3 h-3 transition-transform ${isHidden ? '' : 'rotate-180'}`} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          )}
        </div>
      </div>

      {/* Output area */}
      {!isHidden && (
        <div className="mx-2 mb-2 p-2 rounded bg-[#1a1a2e] max-h-[300px] overflow-y-auto custom-scrollbar">
          <pre className="whitespace-pre-wrap text-xs text-[#e0e0e0] leading-relaxed font-mono">
            {stream.chunks.join('')}
          </pre>
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
