// ============================================================================
// CliSessionsPanel — CLI session history with cost/tokens/turns
// ============================================================================

import { useState } from 'react';
import type { CliSessionRecord } from '@olympus-dev/protocol';

interface CliSessionsPanelProps {
  sessions: CliSessionRecord[];
  onDelete?: (key: string) => void;
}

function formatTokens(tokens: number): string {
  return tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
}

function formatRelativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function CliSessionsPanel({ sessions, onDelete }: CliSessionsPanelProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const handleToggle = (key: string) => {
    setExpandedKey(expandedKey === key ? null : key);
  };

  return (
    <div>
      <h2 className="font-pixel text-sm mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
        <span>{'\uD83D\uDCBE'}</span>
        <span>CLI Sessions</span>
        {sessions.length > 0 && (
          <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)' }}>
            {sessions.length}
          </span>
        )}
      </h2>
      <div
        className="rounded-xl overflow-y-auto space-y-1 p-3"
        style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border)',
          maxHeight: 400,
        }}
      >
        {sessions.length === 0 && (
          <div className="text-center py-8">
            <span className="text-2xl block mb-2">{'\uD83D\uDCBE'}</span>
            <p className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
              No CLI sessions yet
            </p>
          </div>
        )}
        {sessions.map(session => {
          const isExpanded = expandedKey === session.key;
          const providerIcon = session.provider === 'claude' ? '\u26A1' : '\uD83D\uDD2E';
          const providerColor = session.provider === 'claude' ? '#4FC3F7' : '#FFD700';
          const totalTokens = session.totalInputTokens + session.totalOutputTokens;

          return (
            <div
              key={session.key}
              className="rounded-lg p-2 hover:bg-white/5 transition-colors"
            >
              <div
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => handleToggle(session.key)}
              >
                <span className="text-xs flex-shrink-0" style={{ color: providerColor }}>
                  {providerIcon}
                </span>
                <span className="text-xs font-mono truncate max-w-[100px]" style={{ color: 'var(--text-primary)' }}>
                  {session.provider}-{session.key.slice(0, 6)}
                </span>
                <span className="text-xs font-mono" style={{ color: '#66BB6A' }}>
                  ${session.totalCostUsd.toFixed(4)}
                </span>
                <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
                  {formatTokens(totalTokens)} tokens
                </span>
                <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
                  {session.turnCount} turns
                </span>
                <span className="text-[10px] font-mono flex-shrink-0 ml-auto" style={{ color: 'var(--text-secondary)' }}>
                  {formatRelativeTime(session.updatedAt)}
                </span>
                {onDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(session.key);
                    }}
                    className="text-xs hover:text-error transition-colors ml-1"
                    style={{ color: 'var(--text-secondary)' }}
                    title="Delete session"
                  >
                    {'\uD83D\uDDD1'}
                  </button>
                )}
              </div>
              {isExpanded && (
                <div className="mt-2 pl-5 space-y-1 text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
                  <div>
                    <span className="opacity-70">Model:</span> {session.model}
                  </div>
                  <div>
                    <span className="opacity-70">Last prompt:</span> {session.lastPrompt.slice(0, 100)}{session.lastPrompt.length > 100 ? '...' : ''}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
