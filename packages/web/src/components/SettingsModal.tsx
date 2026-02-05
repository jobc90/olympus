import React, { useState, useEffect } from 'react';

interface Props {
  config: { host: string; port: number; apiKey: string };
  onSave: (config: { host: string; port: number; apiKey: string }) => void;
  onClose: () => void;
}

function isValidPort(value: string): boolean {
  const num = parseInt(value, 10);
  return !isNaN(num) && num >= 1 && num <= 65535;
}

export function SettingsModal({ config, onSave, onClose }: Props) {
  const [host, setHost] = useState(config.host);
  const [port, setPort] = useState(config.port.toString());
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [portError, setPortError] = useState<string | null>(null);

  // Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handlePortChange = (value: string) => {
    setPort(value);
    if (value && !isValidPort(value)) {
      setPortError('Port must be 1-65535');
    } else {
      setPortError(null);
    }
  };

  const handleSave = () => {
    if (!isValidPort(port)) {
      setPortError('Port must be 1-65535');
      return;
    }
    const newConfig = { host, port: parseInt(port, 10), apiKey };
    localStorage.setItem('olympus-config', JSON.stringify(newConfig));
    onSave(newConfig);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-surface border border-border rounded-xl p-6 w-full max-w-md mx-4 shadow-glow-cyan">
        <h2 className="text-lg font-semibold text-text mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          Gateway Settings
        </h2>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">Host</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Port</label>
              <input
                type="text"
                value={port}
                onChange={(e) => handlePortChange(e.target.value)}
                className={`w-full px-3 py-2 bg-background border rounded-lg text-sm text-text focus:outline-none focus:ring-1 transition-colors ${
                  portError
                    ? 'border-error focus:border-error focus:ring-error/50'
                    : 'border-border focus:border-primary focus:ring-primary/50'
                }`}
              />
              {portError && <span className="text-xs text-error mt-1 block">{portError}</span>}
            </div>
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-1">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="oly_..."
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors font-mono"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} className="btn-primary flex-1">
              Connect
            </button>
            <button onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
