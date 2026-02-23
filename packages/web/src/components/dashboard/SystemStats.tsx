// ============================================================================
// SystemStats — Top statistics bar
// ============================================================================

import { useEffect, useState } from 'react';

interface SystemStatsProps {
  stats: {
    totalWorkers: number;
    activeWorkers: number;
  };
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

  if (!mounted) return <span className="font-semibold tabular-nums">-</span>;

  return <span className="font-semibold tabular-nums">{format ? format(Math.round(display)) : Math.round(display)}</span>;
}

export default function SystemStats({ stats }: SystemStatsProps) {
  const items = [
    { label: 'Workers', value: stats.totalWorkers, icon: '\u{1F916}', color: 'var(--accent-primary)' },
    { label: 'Active', value: stats.activeWorkers, icon: '\u{26A1}', color: 'var(--accent-success)' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {items.map(item => (
        <div
          key={item.label}
          className="rounded-2xl px-4 py-4 transition-all"
          style={{
            background: 'linear-gradient(145deg, rgba(17, 24, 39, 0.92), rgba(11, 18, 31, 0.9))',
            border: '1px solid var(--border)',
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-mono uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              {item.label}
            </span>
            <span className="text-lg">{item.icon}</span>
          </div>
          <div className="mt-2 text-3xl leading-none" style={{ color: item.color }}>
            <AnimatedNumber value={item.value} />
          </div>
        </div>
      ))}
    </div>
  );
}
