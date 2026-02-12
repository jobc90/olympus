// ============================================================================
// StatusBadge — Displays agent behavior with color + icon
// ============================================================================

const BEHAVIOR_INFO: Record<string, { label: string; emoji: string; color: string; neonColor: string; category: string }> = {
  working: { label: 'Working', emoji: '\u{1F4BB}', color: '#4CAF50', neonColor: '#4FC3F7', category: 'active' },
  idle: { label: 'Idle', emoji: '\u{1F634}', color: '#9E9E9E', neonColor: '#B0BEC5', category: 'idle' },
  thinking: { label: 'Thinking', emoji: '\u{1F914}', color: '#FF9800', neonColor: '#FFB74D', category: 'active' },
  completed: { label: 'Completed', emoji: '\u{2705}', color: '#4CAF50', neonColor: '#66BB6A', category: 'active' },
  error: { label: 'Error', emoji: '\u{274C}', color: '#F44336', neonColor: '#EF5350', category: 'alert' },
  offline: { label: 'Offline', emoji: '\u{1F4A4}', color: '#607D8B', neonColor: '#78909C', category: 'idle' },
  chatting: { label: 'Chatting', emoji: '\u{1F4AC}', color: '#2196F3', neonColor: '#42A5F5', category: 'active' },
  reviewing: { label: 'Reviewing', emoji: '\u{1F50D}', color: '#9C27B0', neonColor: '#AB47BC', category: 'active' },
  deploying: { label: 'Deploying', emoji: '\u{1F680}', color: '#FF5722', neonColor: '#FF7043', category: 'active' },
  resting: { label: 'Resting', emoji: '\u{2615}', color: '#795548', neonColor: '#8D6E63', category: 'idle' },
  collaborating: { label: 'Collaborating', emoji: '\u{1F91D}', color: '#00BCD4', neonColor: '#26C6DA', category: 'active' },
  starting: { label: 'Starting', emoji: '\u{1F3C3}', color: '#FFC107', neonColor: '#FFD54F', category: 'system' },
  supervising: { label: 'Supervising', emoji: '\u{1F454}', color: '#3F51B5', neonColor: '#5C6BC0', category: 'active' },
  directing: { label: 'Directing', emoji: '\u{1F4CB}', color: '#673AB7', neonColor: '#7E57C2', category: 'active' },
  analyzing: { label: 'Analyzing', emoji: '\u{1F9E0}', color: '#E91E63', neonColor: '#EC407A', category: 'active' },
  meeting: { label: 'Meeting', emoji: '\u{1F5E3}\u{FE0F}', color: '#009688', neonColor: '#26A69A', category: 'active' },
};

const DEFAULT_INFO = { label: 'Unknown', emoji: '\u{2753}', color: '#9E9E9E', neonColor: '#B0BEC5', category: 'idle' };

interface StatusBadgeProps {
  behavior: string;
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
}

export default function StatusBadge({ behavior, size = 'md', pulse = true }: StatusBadgeProps) {
  const info = BEHAVIOR_INFO[behavior] ?? DEFAULT_INFO;
  const isActive = info.category === 'active';
  const isAlert = info.category === 'alert';

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5 gap-1',
    md: 'text-xs px-2 py-1 gap-1.5',
    lg: 'text-sm px-3 py-1.5 gap-2',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full font-mono ${sizeClasses[size]}`}
      style={{
        backgroundColor: `${info.neonColor}18`,
        color: info.neonColor,
        border: `1px solid ${info.neonColor}40`,
      }}
    >
      {pulse && isActive && (
        <span className="relative flex h-2 w-2">
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
            style={{ backgroundColor: info.neonColor }}
          />
          <span
            className="relative inline-flex h-2 w-2 rounded-full"
            style={{ backgroundColor: info.neonColor }}
          />
        </span>
      )}
      {pulse && !isActive && !isAlert && (
        <span
          className="inline-flex h-2 w-2 rounded-full"
          style={{ backgroundColor: `${info.neonColor}80` }}
        />
      )}
      {pulse && isAlert && (
        <span
          className="inline-flex h-2 w-2 rounded-full animate-pulse"
          style={{ backgroundColor: info.neonColor }}
        />
      )}
      <span>{info.emoji}</span>
      <span>{info.label}</span>
    </span>
  );
}
