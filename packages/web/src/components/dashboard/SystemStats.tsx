// ============================================================================
// SystemStats — Top statistics bar
// ============================================================================

import { useEffect, useState } from 'react';

interface SystemStatsProps {
  stats: {
    totalWorkers: number;
    activeWorkers: number;
    totalTokens: number;
    failedTasks: number;
  };
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function AnimatedNumber({ value, format }: { value: number; format?: (n: number) => string }) {
  const [mounted, setMounted] = useState(false);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    setMounted(true);
    setDisplay(value);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mounted) return;
    const diff = value - display;
    if (Math.abs(diff) < 1) {
      setDisplay(value);
      return;
    }
    const step = Math.ceil(Math.abs(diff) / 10);
    const timer = setTimeout(() => {
      setDisplay(prev => prev + (diff > 0 ? step : -step));
    }, 30);
    return () => clearTimeout(timer);
  }, [value, display, mounted]);

  if (!mounted) return <span className="font-pixel">-</span>;

  return <span className="font-pixel">{format ? format(Math.round(display)) : Math.round(display)}</span>;
}

export default function SystemStats({ stats }: SystemStatsProps) {
  const items = [
    { label: 'Workers', value: stats.totalWorkers, icon: '\u{1F916}', color: 'var(--accent-primary)' },
    { label: 'Active', value: stats.activeWorkers, icon: '\u{26A1}', color: 'var(--accent-success)' },
    { label: 'Tokens', value: stats.totalTokens, icon: '\u{1FA99}', color: 'var(--accent-warning)', format: formatTokens },
    { label: 'Failed', value: stats.failedTasks, icon: '\u{274C}', color: 'var(--accent-danger)' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map(item => (
        <div
          key={item.label}
          className="flex flex-col items-center gap-1 rounded-xl px-3 py-3 transition-all hover:scale-105"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
          }}
        >
          <span className="text-base">{item.icon}</span>
          <span className="text-lg" style={{ color: item.color }}>
            <AnimatedNumber value={item.value} format={item.format} />
          </span>
          <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}
