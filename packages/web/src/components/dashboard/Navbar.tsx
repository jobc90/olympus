// ============================================================================
// Navbar — Top navigation bar
// ============================================================================

import ConnectionStatus from '../shared/ConnectionStatus';

interface NavbarProps {
  connected: boolean;
  activeTab: 'console' | 'monitor';
  onTabChange: (tab: 'console' | 'monitor') => void;
  onSettingsClick: () => void;
}

export default function Navbar({ connected, activeTab, onTabChange, onSettingsClick }: NavbarProps) {
  const tabs = [
    { key: 'console' as const, label: 'Console', icon: '\u{1F4CA}' },
    { key: 'monitor' as const, label: 'Monitor', icon: '\u26F0\uFE0F' },
  ];

  return (
    <nav
      className="sticky top-0 z-50 border-b"
      style={{
        borderColor: 'var(--border)',
        backdropFilter: 'blur(14px)',
        background: 'linear-gradient(90deg, rgba(10, 14, 25, 0.95), rgba(16, 20, 34, 0.92), rgba(10, 14, 25, 0.95))',
      }}
    >
      <div className="mx-auto max-w-[1680px] px-4 py-3 flex items-center gap-4">
        <div className="flex items-center gap-3 min-w-[170px]">
          <span className="text-xl">{'\u26A1'}</span>
          <div className="leading-tight">
            <div className="font-semibold text-sm tracking-wide" style={{ color: '#F7DFC2' }}>
              Olympus Command
            </div>
            <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
              Control Deck
            </div>
          </div>
        </div>

        <div
          className="flex-1 flex items-center gap-1 p-1 rounded-xl border"
          style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(16, 21, 35, 0.8)' }}
        >
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors text-center"
              style={{
                backgroundColor: activeTab === tab.key ? 'rgba(79, 195, 247, 0.18)' : 'transparent',
                color: activeTab === tab.key ? '#A5E5FF' : 'var(--text-secondary)',
                border: activeTab === tab.key ? '1px solid rgba(79, 195, 247, 0.45)' : '1px solid transparent',
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <ConnectionStatus connected={connected} compact />
          <button
            onClick={onSettingsClick}
            className="px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            title="Settings"
          >
            Settings
          </button>
        </div>
      </div>
    </nav>
  );
}
