// ============================================================================
// WorkerCard — Individual worker status card
// ============================================================================

import { useState, useEffect } from 'react';
import type { WorkerConfig, WorkerDashboardState, WorkerAvatar } from '../../lib/types';
import { BEHAVIOR_INFO, formatTokens, formatRelativeTime } from '../../lib/state-mapper';
import StatusBadge from '../shared/StatusBadge';
import { drawWorker } from '../../sprites/characters';

interface WorkerCardProps {
  worker: WorkerConfig;
  state: WorkerDashboardState | undefined;
  onChatClick?: (workerId: string) => void;
  onDetailClick?: (workerId: string) => void;
}

function PixelAvatar({ worker, size = 48 }: { worker: WorkerConfig; size?: number }) {
  const canvasRef = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;
    drawWorker(ctx, size / 2, size / 2 + 8, 'stand', 's', 0, worker.avatar as WorkerAvatar, worker.color, '');
  };

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="rounded-lg"
      style={{
        imageRendering: 'pixelated',
        backgroundColor: `${worker.color}15`,
        border: `1px solid ${worker.color}30`,
      }}
    />
  );
}

function TokenBar({ used, max }: { used: number; max: number }) {
  const pct = Math.min(100, (used / max) * 100);
  const color = pct > 80 ? 'var(--accent-danger)' : pct > 50 ? 'var(--accent-warning)' : 'var(--accent-success)';

  return (
    <div className="flex items-center gap-2 w-full">
      <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>Tokens:</span>
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[10px] font-mono" style={{ color }}>{formatTokens(used)}</span>
    </div>
  );
}

export function WorkerCard({ worker, state, onChatClick, onDetailClick }: WorkerCardProps) {
  const [relativeTime, setRelativeTime] = useState('');
  const behavior = state?.behavior ?? 'idle';
  const info = BEHAVIOR_INFO[behavior];

  useEffect(() => {
    const update = () => {
      setRelativeTime(state ? formatRelativeTime(state.lastActivity) : 'unknown');
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [state?.lastActivity, state]);

  return (
    <div
      className="group relative rounded-xl p-4 transition-all duration-300 hover:scale-[1.02] cursor-pointer"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: `1px solid ${info.neonColor}30`,
        boxShadow: `0 0 20px ${info.neonColor}08`,
      }}
    >
      {/* Glow on hover */}
      <div
        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          boxShadow: `inset 0 0 30px ${info.neonColor}10, 0 0 30px ${info.neonColor}10`,
        }}
      />

      {/* Header: Avatar + Name + Status */}
      <div className="flex items-start gap-3 mb-3">
        <PixelAvatar worker={worker} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-pixel text-sm truncate" style={{ color: 'var(--text-primary)' }}>
              {worker.name}
            </span>
            {worker.emoji && <span>{worker.emoji}</span>}
          </div>
          <div className="mt-1">
            <StatusBadge behavior={behavior} size="sm" />
          </div>
        </div>
      </div>

      {/* Model info */}
      {state?.sessionLog?.[0] && (
        <div className="mb-1.5">
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
            {state.sessionLog[0]}
          </span>
        </div>
      )}

      {/* Current task */}
      {state?.currentTask && (
        <div className="mb-2">
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
            {state.currentTask.title}
          </span>
        </div>
      )}

      {/* Token bar */}
      <div className="mb-2">
        <TokenBar used={state?.totalTokens ?? 0} max={state?.contextTokens || 128000} />
      </div>

      {/* Footer: Last activity + Actions */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
          Last: {relativeTime}
        </span>
        <div className="flex items-center gap-1">
          {onChatClick && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChatClick(worker.id); }}
              className="p-1 rounded hover:bg-white/10 transition-colors text-sm"
              title="Chat with worker"
            >
              Chat
            </button>
          )}
          {onDetailClick && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDetailClick(worker.id); }}
              className="p-1 rounded hover:bg-white/10 transition-colors text-sm"
              title="View details"
            >
              Detail
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
