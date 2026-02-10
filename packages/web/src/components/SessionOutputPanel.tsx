import React, { useRef, useEffect, useState } from 'react';
import { Card, CardHeader } from './Card';
import type { SessionOutput } from '../hooks/useOlympus';
import type { SessionInfo } from '@olympus-dev/protocol';

interface Props {
  session: SessionInfo;
  outputs: SessionOutput[];
  /** Full terminal screen snapshot (replace mode) */
  screen?: string;
}

type ViewMode = 'terminal' | 'log';

export function SessionOutputPanel({ session, outputs, screen }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('terminal');

  useEffect(() => {
    // Auto-scroll only in log mode (terminal mode replaces content)
    if (viewMode === 'log' && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [outputs.length, viewMode]);

  const displayName = session.name?.replace(/^olympus-/, '') ?? session.tmuxSession;
  const hasScreen = !!screen?.trim();

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="font-mono text-sm text-success">
              {displayName}
            </span>
            <span className="text-xs text-text-muted">
              {session.projectPath}
            </span>
          </div>
          {/* View mode toggle */}
          <div className="flex items-center gap-1 bg-surface-hover rounded-md p-0.5">
            <button
              onClick={() => setViewMode('terminal')}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                viewMode === 'terminal'
                  ? 'bg-primary text-white'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              Terminal
            </button>
            <button
              onClick={() => setViewMode('log')}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                viewMode === 'log'
                  ? 'bg-primary text-white'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              Log
            </button>
          </div>
        </div>
      </CardHeader>

      {/* Session Info */}
      <div className="px-4 py-2 bg-surface-hover/50 border-b border-border flex items-center gap-4 text-xs text-text-muted">
        <span>tmux: {session.tmuxSession}</span>
        {session.taskContextId && (
          <span>context: {session.taskContextId.slice(0, 8)}...</span>
        )}
        {viewMode === 'terminal' && hasScreen && (
          <span className="text-success">LIVE</span>
        )}
      </div>

      {/* Terminal Mirror Mode */}
      {viewMode === 'terminal' && (
        <div className="flex-1 max-h-[calc(100vh-400px)] overflow-y-auto bg-[#1a1a2e] p-4">
          {hasScreen ? (
            <pre className="whitespace-pre font-mono text-xs leading-snug text-[#e0e0e0]">
              {screen}
            </pre>
          ) : (
            <div className="text-text-muted text-center py-12">
              <div className="text-3xl mb-3 opacity-50">📺</div>
              <p className="text-sm">Waiting for terminal screen...</p>
              <p className="text-xs mt-1">Live terminal mirror will appear here</p>
            </div>
          )}
        </div>
      )}

      {/* Log Mode (append-based, legacy) */}
      {viewMode === 'log' && (
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
      )}
    </Card>
  );
}
