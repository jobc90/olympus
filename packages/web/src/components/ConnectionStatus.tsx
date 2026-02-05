import React from 'react';

interface Props {
  connected: boolean;
  error?: string | null;
}

export function ConnectionStatus({ connected, error }: Props) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`status-dot ${
          error ? 'status-dot-error' : connected ? 'status-dot-success' : 'status-dot-warning'
        }`}
      />
      <span className="text-sm text-text-secondary">
        {error ? 'Error' : connected ? 'Connected' : 'Connecting...'}
      </span>
    </div>
  );
}
