import React from 'react';
import { Card, CardHeader } from './Card';
import type { RunStatus, SessionInfo, AvailableSession } from '@olympus-dev/protocol';

interface Props {
  runs: RunStatus[];
  sessions: SessionInfo[];
  availableSessions: AvailableSession[];
  currentRunId: string | null;
  currentSessionId: string | null;
  onSelect: (runId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onCancel: (runId: string) => void;
}

export function SessionList({ runs, sessions, availableSessions, currentRunId, currentSessionId, onSelect, onSelectSession, onCancel }: Props) {
  const activeSessions = sessions.filter(s => s.status === 'active');
  const totalCount = runs.length + activeSessions.length + availableSessions.length;

  if (totalCount === 0) {
    return (
      <Card>
        <CardHeader>Sessions</CardHeader>
        <div className="text-center py-6">
          <div className="text-3xl mb-2 opacity-50">📡</div>
          <p className="text-text-muted text-sm">No active sessions</p>
          <p className="text-text-muted text-xs mt-1">Start one via CLI</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-0">
      <div className="p-4 border-b border-border">
        <CardHeader>
          Sessions
          <span className="ml-2 px-1.5 py-0.5 text-xs bg-primary/20 text-primary rounded">
            {totalCount}
          </span>
        </CardHeader>
      </div>
      <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
        {/* Connected Claude CLI Sessions */}
        {activeSessions.length > 0 && (
          <>
            <div className="px-4 py-2 bg-surface-hover/50 border-b border-border">
              <span className="text-xs text-text-muted uppercase tracking-wider">
                🖥️ Connected
              </span>
            </div>
            {activeSessions.map((session) => (
              <TmuxSessionItem
                key={session.id}
                session={session}
                isActive={currentSessionId === session.id}
                onSelect={() => onSelectSession(session.id)}
              />
            ))}
          </>
        )}

        {/* Available tmux Sessions (not connected) */}
        {availableSessions.length > 0 && (
          <>
            <div className="px-4 py-2 bg-surface-hover/50 border-b border-border">
              <span className="text-xs text-text-muted uppercase tracking-wider">
                📡 Available
              </span>
            </div>
            {availableSessions.map((session) => (
              <AvailableSessionItem
                key={session.tmuxSession}
                session={session}
              />
            ))}
          </>
        )}

        {/* Orchestration Runs */}
        {runs.length > 0 && (
          <>
            <div className="px-4 py-2 bg-surface-hover/50 border-b border-border">
              <span className="text-xs text-text-muted uppercase tracking-wider">
                ⚡ Orchestration
              </span>
            </div>
            {runs.map((run) => (
              <RunItem
                key={run.runId}
                run={run}
                isActive={currentRunId === run.runId}
                onSelect={() => onSelect(run.runId)}
                onCancel={() => onCancel(run.runId)}
              />
            ))}
          </>
        )}
      </div>
    </Card>
  );
}

/** Available tmux Session Item (not connected to Gateway) */
interface AvailableSessionItemProps {
  session: AvailableSession;
}

function AvailableSessionItem({ session }: AvailableSessionItemProps) {
  // Extract display name from tmux session (e.g., "olympus-dev" -> "dev")
  const displayName = session.tmuxSession.replace(/^olympus-/, '');

  return (
    <div className="p-4 border-b border-border last:border-b-0 hover:bg-surface-hover transition-all opacity-70">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-sm text-text-muted truncate max-w-[150px]">
          {displayName}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-text-muted/10 text-text-muted">
          available
        </span>
      </div>

      <p className="text-text-secondary text-xs truncate mb-2">
        {session.projectPath}
      </p>

      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">
          tmux: {session.tmuxSession}
        </span>
      </div>
    </div>
  );
}

/** Tmux Claude CLI Session Item */
interface TmuxSessionItemProps {
  session: SessionInfo;
  isActive: boolean;
  onSelect: () => void;
}

function TmuxSessionItem({ session, isActive, onSelect }: TmuxSessionItemProps) {
  const timeAgo = getTimeAgo(session.lastActivityAt);
  const contextLabel = session.taskContextId
    ? `${session.taskContextId.slice(0, 8)}…`
    : null;

  return (
    <div
      className={`p-4 border-b border-border last:border-b-0 cursor-pointer transition-all ${
        isActive
          ? 'bg-success/10 border-l-2 border-l-success'
          : 'hover:bg-surface-hover'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-sm text-success truncate max-w-[150px]">
          {session.name}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success">
          active
        </span>
      </div>

      <p className="text-text-secondary text-xs truncate mb-2">
        {session.projectPath}
      </p>

      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">
          tmux: {session.tmuxSession}
        </span>
        <span className="text-xs text-text-muted">
          {timeAgo}
        </span>
      </div>
      {contextLabel && (
        <div className="mt-1 text-xs text-text-muted">
          context: {contextLabel}
        </div>
      )}
    </div>
  );
}

/** Orchestration Run Item */
interface RunItemProps {
  run: RunStatus;
  isActive: boolean;
  onSelect: () => void;
  onCancel: () => void;
}

const STATUS_STYLES = {
  running: { bg: 'bg-warning/10', text: 'text-warning' },
  completed: { bg: 'bg-success/10', text: 'text-success' },
  failed: { bg: 'bg-error/10', text: 'text-error' },
  cancelled: { bg: 'bg-text-muted/10', text: 'text-text-muted' },
} as const;

function RunItem({ run, isActive, onSelect, onCancel }: RunItemProps) {
  const status = run.status as keyof typeof STATUS_STYLES;
  const statusStyle = STATUS_STYLES[status] ?? STATUS_STYLES.cancelled;

  return (
    <div
      className={`p-4 border-b border-border last:border-b-0 cursor-pointer transition-all ${
        isActive
          ? 'bg-primary/10 border-l-2 border-l-primary'
          : 'hover:bg-surface-hover'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-sm text-primary truncate max-w-[150px]">
          {run.runId}
        </span>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${statusStyle.bg} ${statusStyle.text}`}
        >
          {run.status}
        </span>
      </div>

      <p className="text-text-secondary text-sm line-clamp-2 mb-2">
        {run.prompt || 'No prompt'}
      </p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">
            Phase {run.phase}
          </span>
          <span className="text-xs text-primary">
            {run.phaseName}
          </span>
        </div>

        {run.status === 'running' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            className="text-xs text-error hover:text-error/80 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

/** Helper to format time ago */
function getTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
