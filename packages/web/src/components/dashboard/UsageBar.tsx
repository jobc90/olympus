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
        className="rounded-2xl px-4 py-4 font-mono text-xs"
        style={{
          background: 'linear-gradient(145deg, rgba(17, 24, 39, 0.92), rgba(11, 18, 31, 0.9))',
          border: '1px solid var(--border)',
          color: 'var(--text-secondary)',
        }}
      >
        <span style={{ opacity: 0.6 }}>Usage data will appear when a Claude CLI session is active with the dashboard plugin.</span>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl px-4 py-4 font-mono text-sm space-y-3"
      style={{
        background: 'linear-gradient(145deg, rgba(17, 24, 39, 0.92), rgba(11, 18, 31, 0.9))',
        border: '1px solid var(--border)',
        color: 'var(--text-primary)',
      }}
    >
      <div className="text-lg font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
        Model Usage
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(16, 23, 37, 0.75)' }}>
          <div className="flex items-center gap-1.5 text-xs mb-1">
            <span>🤖</span>
            <span className="font-semibold" style={{ color: '#E1BEE7' }}>Claude</span>
          </div>
          <div className="text-xs space-y-1.5">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span className="truncate">
                {data.model ? (
                  <>
                    {data.model.displayName}{' '}
                    <span style={{ color: 'var(--text-secondary)' }}>({data.model.id})</span>
                  </>
                ) : (
                  <span style={{ color: 'var(--text-secondary)' }}>No model</span>
                )}
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap min-h-[16px]">
              {data.context ? (
                <>
                  <ProgressBar percent={data.context.percentage} />
                  <span>{formatTokens(data.context.totalTokens)}/{formatTokens(data.context.contextSize)}</span>
                  <span style={{ color: '#66BB6A' }}>
                    {data.cost ? `$${data.cost.totalCostUsd.toFixed(2)}` : '-'}
                  </span>
                </>
              ) : (
                <>
                  <span style={{ color: 'var(--text-secondary)' }}>Context unavailable</span>
                  <span style={{ color: '#66BB6A' }}>
                    {data.cost ? `$${data.cost.totalCostUsd.toFixed(2)}` : '-'}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center flex-wrap gap-1 min-h-[16px]">
              {data.rateLimit5h && !data.rateLimit5h.isError ? (
                <RateWidget label="5h" percent={data.rateLimit5h.utilization} resetAt={data.rateLimit5h.resetsAt} />
              ) : (
                <span style={{ color: 'var(--text-secondary)' }}>5h: -</span>
              )}
              <Sep />
              {data.rateLimit7d && !data.rateLimit7d.isError ? (
                <RateWidget label="7d" percent={data.rateLimit7d.utilization} resetAt={data.rateLimit7d.resetsAt} />
              ) : (
                <span style={{ color: 'var(--text-secondary)' }}>7d: -</span>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(16, 23, 37, 0.75)' }}>
          <div className="flex items-center gap-1.5 text-xs mb-1">
            <span>🔷</span>
            <span className="font-semibold" style={{ color: '#7DD3FC' }}>Codex</span>
          </div>
          {data.codexUsage ? (
            <div className="text-xs space-y-1">
              <div>{data.codexUsage.model}</div>
              {!data.codexUsage.isError && data.codexUsage.primaryPercent !== null && (
                <RateWidget label="5h" percent={data.codexUsage.primaryPercent} resetAt={data.codexUsage.primaryResetAt} />
              )}
              {!data.codexUsage.isError && data.codexUsage.secondaryPercent !== null && (
                <RateWidget label="7d" percent={data.codexUsage.secondaryPercent} resetAt={data.codexUsage.secondaryResetAt} />
              )}
            </div>
          ) : (
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>No usage data</div>
          )}
        </div>

        <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(16, 23, 37, 0.75)' }}>
          <div className="flex items-center gap-1.5 text-xs mb-1">
            <span>💎</span>
            <span className="font-semibold" style={{ color: '#9AE6B4' }}>Gemini</span>
          </div>
          {data.geminiUsage ? (
            <div className="text-xs space-y-1">
              <div>{data.geminiUsage.model}</div>
              {!data.geminiUsage.isError && data.geminiUsage.usedPercent !== null && (
                <RateWidget label="used" percent={data.geminiUsage.usedPercent} resetAt={data.geminiUsage.resetAt} />
              )}
            </div>
          ) : (
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>No usage data</div>
          )}
        </div>
      </div>
    </div>
  );
}
