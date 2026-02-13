import type { StatuslineUsageData } from '@olympus-dev/protocol';

function getColor(percent: number): string {
  if (percent > 80) return '#EF5350';
  if (percent > 50) return '#FFA726';
  return '#66BB6A';
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}시간${m > 0 ? `${m}분` : ''}`;
  return `${m}분`;
}

function formatResetTime(resetAt: string | number | null): string {
  if (!resetAt) return '';
  const resetDate = typeof resetAt === 'number' ? new Date(resetAt * 1000) : new Date(resetAt);
  const diffMs = resetDate.getTime() - Date.now();
  if (diffMs <= 0) return '';
  return formatDuration(diffMs);
}

const Sep = () => (
  <span className="mx-1.5" style={{ color: 'var(--text-secondary)', opacity: 0.4 }}>│</span>
);

function ProgressBar({ percent }: { percent: number }) {
  const color = getColor(percent);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-3 rounded-sm"
        style={{
          width: 72,
          background: `linear-gradient(to right, ${color} ${percent}%, var(--border) ${percent}%)`,
        }}
      />
      <span style={{ color }}>{Math.round(percent)}%</span>
    </span>
  );
}

function RateWidget({ label, percent, resetAt }: { label: string; percent: number | null; resetAt: string | number | null }) {
  if (percent === null) return null;
  const color = getColor(percent);
  const reset = formatResetTime(resetAt);
  return (
    <span>
      {label && <span style={{ color: 'var(--text-secondary)' }}>{label}: </span>}
      <span style={{ color }}>{Math.round(percent)}%</span>
      {reset && <span style={{ color: 'var(--text-secondary)' }}> ({reset})</span>}
    </span>
  );
}

interface UsageBarProps {
  data: StatuslineUsageData | null;
}

export default function UsageBar({ data }: UsageBarProps) {
  if (!data || !data.timestamp) {
    return (
      <div
        className="rounded-xl px-4 py-3 font-mono text-sm"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
      >
        Waiting for statusline data...
      </div>
    );
  }

  return (
    <div
      className="rounded-xl px-4 py-3 font-mono text-sm space-y-1.5"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
    >
      {/* Row 1: Claude — model + context + cost + rate limits */}
      <div className="flex items-center flex-wrap gap-y-0.5">
        <span>🤖 <span className="font-semibold" style={{ color: '#CE93D8' }}>Claude</span></span>
        {data.model && (
          <><Sep /><span>{data.model.displayName} <span style={{ color: 'var(--text-secondary)' }}>({data.model.id})</span></span></>
        )}
        {data.context && (
          <><Sep /><ProgressBar percent={data.context.percentage} /><Sep /><span>{formatTokens(data.context.totalTokens)}/{formatTokens(data.context.contextSize)}</span></>
        )}
        {data.cost && (
          <><Sep /><span style={{ color: '#66BB6A' }}>${data.cost.totalCostUsd.toFixed(2)}</span></>
        )}
        {data.rateLimit5h && !data.rateLimit5h.isError && (
          <><Sep /><RateWidget label="5h" percent={data.rateLimit5h.utilization} resetAt={data.rateLimit5h.resetsAt} /></>
        )}
        {data.rateLimit7d && !data.rateLimit7d.isError && (
          <><Sep /><RateWidget label="7d" percent={data.rateLimit7d.utilization} resetAt={data.rateLimit7d.resetsAt} /></>
        )}
      </div>

      {/* Row 2: Codex — model + rate limits */}
      <div className="flex items-center flex-wrap gap-y-0.5">
        {data.codexUsage ? (
          <>
            <span>🔷 <span className="font-semibold" style={{ color: '#4FC3F7' }}>Codex</span></span>
            <Sep /><span>{data.codexUsage.model}</span>
            {!data.codexUsage.isError && data.codexUsage.primaryPercent !== null && (
              <><Sep /><RateWidget label="5h" percent={data.codexUsage.primaryPercent} resetAt={data.codexUsage.primaryResetAt} /></>
            )}
            {!data.codexUsage.isError && data.codexUsage.secondaryPercent !== null && (
              <><Sep /><RateWidget label="7d" percent={data.codexUsage.secondaryPercent} resetAt={data.codexUsage.secondaryResetAt} /></>
            )}
          </>
        ) : (
          <span style={{ color: 'var(--text-secondary)' }}>🔷 Codex — no data</span>
        )}
      </div>

      {/* Row 3: Gemini — model + usage */}
      <div className="flex items-center flex-wrap gap-y-0.5">
        {data.geminiUsage ? (
          <>
            <span>💎 <span className="font-semibold" style={{ color: '#66BB6A' }}>Gemini</span></span>
            <Sep /><span>{data.geminiUsage.model}</span>
            {!data.geminiUsage.isError && data.geminiUsage.usedPercent !== null && (
              <><Sep /><RateWidget label="" percent={data.geminiUsage.usedPercent} resetAt={data.geminiUsage.resetAt} /></>
            )}
          </>
        ) : (
          <span style={{ color: 'var(--text-secondary)' }}>💎 Gemini — no data</span>
        )}
      </div>
    </div>
  );
}
