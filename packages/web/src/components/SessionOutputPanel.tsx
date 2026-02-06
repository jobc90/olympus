import React, { useRef, useEffect } from 'react';
import { Card, CardHeader } from './Card';
import type { SessionOutput } from '../hooks/useOlympus';
import type { SessionInfo } from '@olympus-dev/protocol';

interface Props {
  session: SessionInfo;
  outputs: SessionOutput[];
}

export function SessionOutputPanel({ session, outputs }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [outputs.length]);

  const displayName = session.name?.replace(/^olympus-/, '') ?? session.tmuxSession;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span className="font-mono text-sm text-success">
            {displayName}
          </span>
          <span className="text-xs text-text-muted">
            {session.projectPath}
          </span>
        </div>
      </CardHeader>

      {/* Session Info */}
      <div className="px-4 py-2 bg-surface-hover/50 border-b border-border flex items-center gap-4 text-xs text-text-muted">
        <span>tmux: {session.tmuxSession}</span>
        {session.taskContextId && (
          <span>context: {session.taskContextId.slice(0, 8)}...</span>
        )}
      </div>

      {/* Output Stream */}
      <div
        ref={scrollRef}
        className="flex-1 max-h-[calc(100vh-400px)] overflow-y-auto font-mono text-sm p-4 space-y-3"
      >
        {outputs.length === 0 ? (
          <div className="text-text-muted text-center py-12">
            <div className="text-3xl mb-3 opacity-50">📡</div>
            <p className="text-sm">Listening for session output...</p>
            <p className="text-xs mt-1">Output from Claude CLI will appear here in real-time</p>
          </div>
        ) : (
          outputs.map((output, i) => (
            <div key={i} className="bg-surface-hover rounded p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-text-muted">
                  {new Date(output.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <pre className="whitespace-pre-wrap text-text text-xs leading-relaxed">
                {output.content}
              </pre>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
