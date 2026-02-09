import React, { useState, useCallback } from 'react';
import { Card } from './Card';

interface CommandInputProps {
  onSubmit: (command: string) => void;
  disabled?: boolean;
  agentState?: string;
}

export function CommandInput({ onSubmit, disabled = false, agentState }: CommandInputProps) {
  const [command, setCommand] = useState('');
  const isAgentBusy = agentState !== undefined && agentState !== 'IDLE';

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = command.trim();
    if (!trimmed || disabled || isAgentBusy) return;
    onSubmit(trimmed);
    setCommand('');
  }, [command, disabled, isAgentBusy, onSubmit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  }, [handleSubmit]);

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <div className="flex gap-2">
          <textarea
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isAgentBusy ? 'Agent is busy...' : 'Enter a command for the Codex Agent...'}
            disabled={disabled || isAgentBusy}
            rows={2}
            className="flex-1 bg-surface-hover border border-border rounded-lg px-3 py-2 text-sm text-text placeholder-text-muted focus:outline-none focus:border-primary resize-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={disabled || isAgentBusy || !command.trim()}
            className="self-end px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAgentBusy ? '⏳' : '▶'}
          </button>
        </div>
        <p className="text-xs text-text-muted mt-1">
          Press Enter to send. Shift+Enter for new line.
        </p>
      </form>
    </Card>
  );
}
