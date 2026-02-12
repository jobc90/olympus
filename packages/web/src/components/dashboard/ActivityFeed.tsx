// ============================================================================
// ActivityFeed — Real-time activity event list
// ============================================================================

import { useEffect, useRef } from 'react';

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
  state_change:  { icon: '\u{1F504}', color: '#4FC3F7' },
  task_start:    { icon: '\u{25B6}\u{FE0F}', color: '#66BB6A' },
  task_complete: { icon: '\u{2705}', color: '#66BB6A' },
  task_fail:     { icon: '\u{274C}', color: '#EF5350' },
  tool_call:     { icon: '\u{1F527}', color: '#AB47BC' },
  message:       { icon: '\u{1F4AC}', color: '#4FC3F7' },
  error:         { icon: '\u{1F6A8}', color: '#EF5350' },
  system:        { icon: '\u{1F5A5}\u{FE0F}', color: '#78909C' },
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

  useEffect(() => {
    if (scrollRef.current && isAtTopRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [events.length]);

  return (
    <div>
      <h2 className="font-pixel text-sm mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
        <span>{'\u{1F4E1}'}</span>
        <span>Activity Feed</span>
      </h2>
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
        {events.length === 0 && (
          <div className="text-center py-8">
            <span className="text-2xl block mb-2">{'\u{1F4E1}'}</span>
            <p className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
              Waiting for events...
            </p>
          </div>
        )}
        {events.map(event => {
          const style = EVENT_STYLES[event.type] ?? DEFAULT_STYLE;
          return (
            <div
              key={event.id}
              className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 transition-colors"
            >
              <span className="text-xs flex-shrink-0 mt-0.5">{style.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono font-bold" style={{ color: event.color ?? style.color }}>
                    {event.agentName}
                  </span>
                  <span className="text-[9px] font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {formatRelativeTime(event.timestamp)}
                  </span>
                </div>
                <p className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>
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
