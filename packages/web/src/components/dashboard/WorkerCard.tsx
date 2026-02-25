// ============================================================================
// WorkerCard — Individual worker status card
// ============================================================================

import type { WorkerConfig, WorkerDashboardState, WorkerAvatar } from '../../lib/types';
import { BEHAVIOR_INFO, formatRelativeTime } from '../../lib/state-mapper';
import { drawWorker } from '../../sprites/characters';

interface WorkerCardProps {
  worker: WorkerConfig;
  state: WorkerDashboardState | undefined;
  onChatClick?: (workerId: string) => void;
  onDetailClick?: (workerId: string) => void;
}

function PixelAvatar({ worker, size = 98 }: { worker: WorkerConfig; size?: number }) {
  const canvasRef = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;
    // HD char 45×67px, centered: hdDrawY=(size-67)/2=16, footY=16+67+2=85 → size-13
    drawWorker(ctx, size / 2, size - 13, 'stand', 's', 0, worker.avatar as WorkerAvatar, worker.color, '');
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
  const behavior = state?.behavior ?? 'idle';
  const info = BEHAVIOR_INFO[behavior];
  const projectPath = worker.projectPath ? worker.projectPath.replace(/^\/Users\/[^/]+\//, '~/') : worker.id;
  const statusText = `${info.emoji} ${info.label}`;
  const taskLabel = state?.currentTask?.title ?? 'No active task';
  const lastActivity = state?.lastActivity ? formatRelativeTime(state.lastActivity) : 'no activity';

  return (
    <div
      className="group relative rounded-2xl p-3 transition-all duration-200 h-[206px] overflow-hidden flex flex-col"
      style={{
        background: 'linear-gradient(165deg, rgba(17, 24, 39, 0.94), rgba(10, 16, 28, 0.94))',
        border: `1px solid ${info.neonColor}45`,
      }}
    >
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
        style={{
          boxShadow: `0 12px 30px ${info.neonColor}1c`,
        }}
      />

      <div className="flex items-start gap-3 min-h-0">
        <PixelAvatar worker={worker} size={98} />
        <div
          className="flex-1 min-w-0 h-[98px] rounded-lg border px-2.5 py-2 text-[11px] font-mono flex flex-col justify-between"
          style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(8, 13, 26, 0.45)' }}
        >
          <div className="truncate leading-tight" style={{ color: 'var(--text-primary)' }}>
            {worker.name}
          </div>
          <div className="truncate leading-tight" style={{ color: 'var(--text-secondary)' }}>
            {projectPath}
          </div>
          <div className="truncate leading-tight" style={{ color: info.neonColor }}>
            {statusText}
          </div>
        </div>
      </div>

      <div
        className="mt-2 rounded-lg border px-2 py-1.5 text-[10px] font-mono flex items-center justify-between gap-2"
        style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(8, 13, 26, 0.45)' }}
      >
        <span className="truncate" style={{ color: 'var(--text-secondary)' }} title={taskLabel}>
          {taskLabel}
        </span>
        <span className="shrink-0" style={{ color: info.neonColor }}>
          {lastActivity}
        </span>
      </div>

      <div className="flex items-center justify-end gap-1.5 mt-2">
        {onChatClick && (
          <button
            className="text-[11px] font-mono px-2 py-1 rounded-md border hover:bg-white/10 transition-colors"
            style={{ color: 'var(--text-primary)', borderColor: 'var(--border)' }}
            onClick={(e) => { e.stopPropagation(); onChatClick(worker.id); }}
          >
            Chat
          </button>
        )}
        {onDetailClick && (
          <button
            className="text-[11px] font-mono px-2 py-1 rounded-md border hover:bg-white/10 transition-colors"
            style={{ color: info.neonColor, borderColor: `${info.neonColor}66` }}
            onClick={(e) => { e.stopPropagation(); onDetailClick(worker.id); }}
          >
            Terminal
          </button>
        )}
      </div>
    </div>
  );
}
