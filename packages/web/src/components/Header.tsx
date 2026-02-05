import React from 'react';
import { SparkyMascot } from './SparkyMascot';
import { ConnectionStatus } from './ConnectionStatus';

interface Props {
  connected: boolean;
  error?: string | null;
  onSettingsClick: () => void;
}

export function Header({ connected, error, onSettingsClick }: Props) {
  return (
    <header className="flex items-center justify-between py-4 px-6 border-b border-border">
      {/* Logo & Mascot */}
      <div className="flex items-center gap-4">
        <SparkyMascot size="sm" animated={connected} />
        <div>
          <h1 className="text-2xl font-bold">
            <span className="text-primary">⚡</span>{' '}
            <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Olympus
            </span>
          </h1>
          <span className="text-xs text-text-muted">AI Orchestration Dashboard</span>
        </div>
      </div>

      {/* Right Side */}
      <div className="flex items-center gap-4">
        <ConnectionStatus connected={connected} error={error} />
        <button
          onClick={onSettingsClick}
          className="btn-secondary text-sm flex items-center gap-2"
          aria-label="Settings"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          Settings
        </button>
      </div>
    </header>
  );
}
