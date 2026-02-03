import React, { useRef, useEffect } from 'react';
import type { LogPayload } from '@olympus-dev/protocol';

interface Props {
  logs: LogPayload[];
}

const LEVEL_COLORS: Record<string, string> = {
  info: 'text-gray-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  debug: 'text-gray-600',
};

export function LogPanel({ logs }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  });

  return (
    <div className="bg-gray-800/50 rounded-lg p-4">
      <h2 className="text-sm font-semibold text-gray-400 mb-2">LOGS</h2>
      <div ref={scrollRef} className="max-h-48 overflow-y-auto font-mono text-xs space-y-0.5">
        {logs.map((l, i) => (
          <div key={i} className={LEVEL_COLORS[l.level] ?? 'text-gray-400'}>
            <span className="opacity-50">[{l.level}]</span> {l.message}
          </div>
        ))}
        {logs.length === 0 && <div className="text-gray-600">Waiting for events...</div>}
      </div>
    </div>
  );
}
