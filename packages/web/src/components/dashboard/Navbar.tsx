// ============================================================================
// Navbar — Top navigation bar
// ============================================================================

import ConnectionStatus from '../shared/ConnectionStatus';

interface NavbarProps {
  connected: boolean;
  demoMode?: boolean;
  activeTab: 'console' | 'monitor';
  onTabChange: (tab: 'console' | 'monitor') => void;
  onSettingsClick: () => void;
}

export default function Navbar({ connected, demoMode = false, activeTab, onTabChange, onSettingsClick }: NavbarProps) {
  const tabs = [
    { key: 'console' as const, label: 'Console', icon: '\u{1F4CA}' },
    { key: 'monitor' as const, label: 'Monitor', icon: '\u26F0\uFE0F' },
  ];

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-2 border-b"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2">
        <span className="text-lg">{'\u26A1'}</span>
        <span className="font-pixel text-xs tracking-wider" style={{ color: 'var(--accent-primary)' }}>
          Olympus
        </span>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className="px-3 py-1.5 rounded-md text-xs font-mono transition-colors"
            style={{
              backgroundColor: activeTab === tab.key ? 'color-mix(in srgb, var(--accent-primary) 12%, transparent)' : 'transparent',
              color: activeTab === tab.key ? 'var(--accent-primary)' : 'var(--text-secondary)',
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        <ConnectionStatus connected={connected} demoMode={demoMode} compact />
        <button
          onClick={onSettingsClick}
          className="p-1.5 rounded-md text-sm hover:bg-white/5 transition-colors"
          style={{ color: 'var(--text-secondary)' }}
          title="Settings"
        >
          {'\u2699\uFE0F'}
        </button>
      </div>
    </nav>
  );
}
