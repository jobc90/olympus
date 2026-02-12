import { useState, useEffect } from 'react';
import type { ThemeName } from '../../lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SettingsConfig {
  gateway: { url: string; token: string };
  theme: string;
  demoMode?: boolean;
}

interface SettingsPanelProps {
  config: SettingsConfig;
  onUpdate: (config: SettingsConfig) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Theme data
// ---------------------------------------------------------------------------

const THEMES: { id: ThemeName; label: string; emoji: string; desc: string; swatches: string[] }[] = [
  {
    id: 'midnight',
    label: 'Midnight',
    emoji: '\u{1F319}',
    desc: 'Deep dark with cyan accents',
    swatches: ['#0a0f1a', '#4FC3F7', '#1a2332'],
  },
  {
    id: 'void',
    label: 'Void',
    emoji: '\u{1F573}\uFE0F',
    desc: 'Coldest & darkest',
    swatches: ['#000000', '#8B5CF6', '#0a0a0a'],
  },
  {
    id: 'warm',
    label: 'Warm',
    emoji: '\u{1F525}',
    desc: 'Warm tones, amber glow',
    swatches: ['#1a1410', '#F59E0B', '#2a1f18'],
  },
  {
    id: 'neon',
    label: 'Neon',
    emoji: '\u26A1',
    desc: 'Pink-purple neon',
    swatches: ['#0d0015', '#FF00FF', '#1a0025'],
  },
];

// ---------------------------------------------------------------------------
// ThemeSelector sub-component
// ---------------------------------------------------------------------------

function ThemeSelector({
  current,
  onChange,
}: {
  current: string;
  onChange: (t: ThemeName) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {THEMES.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className="p-3 rounded-xl border text-left transition-all"
          style={{
            borderColor: current === t.id ? 'var(--accent-primary)' : 'var(--border)',
            background: current === t.id ? 'rgba(79, 195, 247, 0.1)' : 'transparent',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">{t.emoji}</span>
            <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
              {t.label}
            </span>
          </div>
          <div className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
            {t.desc}
          </div>
          {/* Color swatches */}
          <div className="flex gap-1">
            {t.swatches.map((color, i) => (
              <div
                key={i}
                className="w-5 h-5 rounded-full border"
                style={{ background: color, borderColor: 'var(--border)' }}
              />
            ))}
          </div>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingsPanel
// ---------------------------------------------------------------------------

export default function SettingsPanel({ config, onUpdate, onClose }: SettingsPanelProps) {
  const [tab, setTab] = useState<'gateway' | 'theme' | 'about'>('gateway');
  const [draft, setDraft] = useState({ ...config });

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const updateGateway = (field: 'url' | 'token', value: string) => {
    setDraft((d) => ({
      ...d,
      gateway: { ...d.gateway, [field]: value },
    }));
  };

  const updateTheme = (theme: ThemeName) => {
    setDraft((d) => ({ ...d, theme }));
  };

  const toggleDemoMode = () => {
    setDraft((d) => ({ ...d, demoMode: !d.demoMode }));
  };

  const handleSave = () => {
    onUpdate(draft);
    onClose();
  };

  const tabs = ['gateway', 'theme', 'about'] as const;
  const tabLabels: Record<string, string> = {
    gateway: '\u{1F50C} Gateway',
    theme: '\u{1F3A8} Theme',
    about: '\u{2139}\uFE0F About',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            Settings
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            {'\u2715'}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 px-4 py-2.5 text-sm font-medium transition-colors"
              style={{
                color: tab === t ? 'var(--accent-primary)' : 'var(--text-secondary)',
                borderBottom: tab === t ? '2px solid var(--accent-primary)' : '2px solid transparent',
              }}
            >
              {tabLabels[t]}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 max-h-96 overflow-y-auto space-y-4">
          {tab === 'gateway' && (
            <>
              <div>
                <label
                  className="text-xs block mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Gateway URL
                </label>
                <input
                  value={draft.gateway.url}
                  onChange={(e) => updateGateway('url', e.target.value)}
                  placeholder="http://localhost:18789"
                  className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent-primary)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                />
              </div>
              <div>
                <label
                  className="text-xs block mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Auth Token
                </label>
                <input
                  type="password"
                  value={draft.gateway.token}
                  onChange={(e) => updateGateway('token', e.target.value)}
                  placeholder="Optional"
                  className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent-primary)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                />
              </div>
              <div
                className="flex items-center justify-between p-3 rounded-xl"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                }}
              >
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    Demo Mode
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Simulate workers without gateway
                  </div>
                </div>
                <button
                  onClick={toggleDemoMode}
                  className="w-11 h-6 rounded-full transition-colors"
                  style={{
                    background: draft.demoMode ? 'var(--accent-primary)' : 'var(--border)',
                  }}
                >
                  <div
                    className="w-5 h-5 rounded-full bg-white shadow transition-transform"
                    style={{
                      transform: draft.demoMode ? 'translateX(20px)' : 'translateX(2px)',
                    }}
                  />
                </button>
              </div>
            </>
          )}

          {tab === 'theme' && (
            <ThemeSelector current={draft.theme} onChange={updateTheme} />
          )}

          {tab === 'about' && (
            <div className="space-y-4">
              <div
                className="p-4 rounded-xl"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                }}
              >
                <div className="text-sm font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                  Olympus Dashboard
                </div>
                <div className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <div>Version: v0.5.1</div>
                  <div>Multi-AI Orchestration Platform</div>
                </div>
              </div>
              <div
                className="p-4 rounded-xl"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                }}
              >
                <div className="text-sm font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                  Connection
                </div>
                <div className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <div>Gateway: {draft.gateway.url}</div>
                  <div>Token: {draft.gateway.token ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : 'Not set'}</div>
                  <div>Demo Mode: {draft.demoMode ? 'On' : 'Off'}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer: Save button */}
        <div
          className="px-6 py-4 border-t flex justify-end gap-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{
              background: 'var(--accent-primary)',
              color: '#fff',
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
