// ============================================================================
// WorkerCard — Individual worker status card
// ============================================================================

import { useState, useEffect } from 'react';
import type { WorkerConfig, WorkerDashboardState, WorkerAvatar } from '../../lib/types';
import { BEHAVIOR_INFO, formatRelativeTime } from '../../lib/state-mapper';
import StatusBadge from '../shared/StatusBadge';
import { drawWorker } from '../../sprites/characters';

interface WorkerCardProps {
  worker: WorkerConfig;
  state: WorkerDashboardState | undefined;
  onChatClick?: (workerId: string) => void;
  onDetailClick?: (workerId: string) => void;
}

function PixelAvatar({ worker, size = 64 }: { worker: WorkerConfig; size?: number }) {
  const canvasRef = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;
    // Character is ~54px tall (scale 3 * 18 rows), y = feet position
    drawWorker(ctx, size / 2, size - 6, 'stand', 's', 0, worker.avatar as WorkerAvatar, worker.color, '');
  };

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="rounded-lg flex-shrink-0"
      style={{
        imageRendering: 'pixelated',
        backgroundColor: `${worker.color}15`,
        border: `1px solid ${worker.color}30`,
      }}
    />
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
      onClick={() => onChatClick?.(worker.id)}
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
              {worker.avatar.charAt(0).toUpperCase() + worker.avatar.slice(1)}
            </span>
            {worker.emoji && <span>{worker.emoji}</span>}
          </div>
          <div className="text-[10px] font-mono truncate" style={{ color: 'var(--text-secondary)' }}>
            {worker.projectPath ? worker.projectPath.replace(/^\/Users\/[^/]+\//, '~/') : worker.name}
          </div>
          <div className="mt-1">
            <StatusBadge behavior={behavior} size="sm" />
          </div>
        </div>
      </div>

      {/* Model info */}
      {state?.sessionLog?.[0] && (
        <div className="mb-1.5">
          <span className="text-[10px] font-mono truncate block" style={{ color: 'var(--text-secondary)' }}>
            {state.sessionLog[0]}
          </span>
        </div>
      )}

      {/* Current task */}
      {state?.currentTask && (
        <div className="mb-2">
          <span className="text-[10px] font-mono truncate block" style={{ color: 'var(--text-secondary)' }}>
            {state.currentTask.title}
          </span>
        </div>
      )}

      {/* Footer: Last activity */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
          Last: {relativeTime}
        </span>
        <span className="text-[10px] font-mono opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: 'var(--text-secondary)' }}>
          Click to chat
        </span>
      </div>
    </div>
  );
}
