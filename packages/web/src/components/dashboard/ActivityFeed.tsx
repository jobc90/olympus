// ============================================================================
// ActivityFeed — Real-time activity event list
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';

interface ActivityEvent {
  id: string;
  type: string;
  agentName: string;
  message: string;
  timestamp: number;
  color?: string;
}

interface ActivityFeedProps {
  events: ActivityEvent[];
  maxHeight?: number;
}

const EVENT_STYLES: Record<string, { icon: string; color: string }> = {
  state_change:          { icon: '\u{1F504}', color: '#4FC3F7' },
  task_start:            { icon: '\u{25B6}\u{FE0F}', color: '#66BB6A' },
  task_complete:         { icon: '\u{2705}', color: '#66BB6A' },
  task_fail:             { icon: '\u{274C}', color: '#EF5350' },
  tool_call:             { icon: '\u{1F527}', color: '#AB47BC' },
  message:               { icon: '\u{1F4AC}', color: '#4FC3F7' },
  error:                 { icon: '\u{1F6A8}', color: '#EF5350' },
  system:                { icon: '\u{1F5A5}\u{FE0F}', color: '#78909C' },
  timeout:               { icon: '\u{23F0}', color: '#FF9800' },
  final_after_timeout:   { icon: '\u{1F3C1}', color: '#FF9800' },
  completed:             { icon: '\u{2705}', color: '#66BB6A' },
};

const DEFAULT_STYLE = EVENT_STYLES.system;

function formatRelativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function ActivityFeed({ events, maxHeight = 400 }: ActivityFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtTopRef = useRef(true);
  const [typeFilter, setTypeFilter] = useState<'all' | 'state' | 'task' | 'error'>('all');
  const [query, setQuery] = useState('');

  const filteredEvents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter(event => {
      const byType =
        typeFilter === 'all' ? true :
        typeFilter === 'state' ? event.type === 'state_change' :
        typeFilter === 'task' ? (
          event.type.includes('task') ||
          event.type === 'timeout' ||
          event.type === 'final_after_timeout' ||
          event.type === 'completed'
        ) :
        (
          event.type === 'error' ||
          event.type === 'task_fail' ||
          /fail|error|timeout/i.test(event.message)
        );
      if (!byType) return false;
      if (!q) return true;
      return event.agentName.toLowerCase().includes(q) || event.message.toLowerCase().includes(q);
    });
  }, [events, query, typeFilter]);

  useEffect(() => {
    if (scrollRef.current && isAtTopRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [filteredEvents.length]);

  return (
    <div>
      <h2 className="font-pixel text-sm mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
        <span>{'\u{1F4E1}'}</span>
        <span>Activity Feed</span>
      </h2>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {(['all', 'state', 'task', 'error'] as const).map(filter => (
          <button
            key={filter}
            onClick={() => setTypeFilter(filter)}
            className="px-2 py-1 rounded text-[10px] font-mono border transition-colors"
            style={{
              borderColor: typeFilter === filter ? 'var(--accent-primary)' : 'var(--border)',
              color: typeFilter === filter ? 'var(--accent-primary)' : 'var(--text-secondary)',
              backgroundColor: typeFilter === filter ? 'color-mix(in srgb, var(--accent-primary) 12%, transparent)' : 'transparent',
            }}
          >
            {filter.toUpperCase()}
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="agent/message filter"
          className="ml-auto rounded px-2 py-1 text-[10px] font-mono border"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}
        />
      </div>
      <div
        ref={scrollRef}
        className="rounded-xl overflow-y-auto space-y-1 p-3"
        style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border)',
          maxHeight,
        }}
        onScroll={() => {
          if (scrollRef.current) {
            isAtTopRef.current = scrollRef.current.scrollTop < 10;
          }
        }}
      >
        {filteredEvents.length === 0 && (
          <div className="text-center py-8">
            <span className="text-2xl block mb-2">{'\u{1F4E1}'}</span>
            <p className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
              No activity yet
            </p>
          </div>
        )}
        {filteredEvents.map(event => {
          const style = EVENT_STYLES[event.type] ?? DEFAULT_STYLE;
          return (
            <div
              key={event.id}
              className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 transition-colors"
            >
              <span className="text-xs flex-shrink-0 mt-0.5">{style.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono font-bold truncate max-w-[80px]" style={{ color: event.color ?? style.color }}>
                    {event.agentName}
                  </span>
                  <span className="text-[9px] font-mono flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                    {formatRelativeTime(event.timestamp)}
                  </span>
                </div>
                <p className="text-xs line-clamp-2" style={{ color: 'var(--text-primary)' }}>
                  {event.message}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
