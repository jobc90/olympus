// ============================================================================
// GeminiAdvisorPanel — Hera (Gemini) advisor status panel
// ============================================================================

import type { GeminiConfig, WorkerAvatar } from '../../lib/types';
import StatusBadge from '../shared/StatusBadge';
import { drawWorker } from '../../sprites/characters';

interface GeminiAdvisorPanelProps {
  geminiConfig: GeminiConfig;
  geminiBehavior: string;
  cacheCount: number;
  lastAnalyzed: number | null;
  currentTask: string | null;
  formatRelativeTime: (ts: number) => string;
  onChatClick?: () => void;
}

function PixelHeraAvatar({ size = 64 }: { size?: number }) {
  const canvasRef = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;
    drawWorker(ctx, size / 2, size - 6, 'stand', 's', 0, 'hera' as WorkerAvatar, '#AB47BC', '');
  };

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="rounded-lg flex-shrink-0"
      style={{
        imageRendering: 'pixelated',
        backgroundColor: '#AB47BC15',
        border: '1px solid #AB47BC30',
      }}
    />
  );
}

export function GeminiAdvisorPanel({ geminiConfig, geminiBehavior, cacheCount, lastAnalyzed, currentTask, formatRelativeTime, onChatClick }: GeminiAdvisorPanelProps) {
  const behaviorInfo: Record<string, string> = {
    offline: '오프라인',
    idle: '대기 중',
    scanning: '프로젝트 스캔 중',
    analyzing: '분석 중',
    advising: '조언 제공 중',
    caching: '캐시 갱신 중',
  };

  const description = behaviorInfo[geminiBehavior] ?? '대기 중';

  return (
    <div
      className="group relative rounded-xl p-4 transition-all duration-300 hover:scale-[1.02] cursor-pointer"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid #AB47BC30',
        boxShadow: '0 0 20px #AB47BC08',
      }}
      onClick={onChatClick}
    >
      {/* Glow on hover */}
      <div
        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          boxShadow: 'inset 0 0 30px #AB47BC10, 0 0 30px #AB47BC10',
        }}
      />

      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{geminiConfig.emoji}</span>
        <h3 className="font-pixel text-sm" style={{ color: 'var(--text-primary)' }}>
          Gemini Advisor — {geminiConfig.name}
        </h3>
      </div>

      {/* Content */}
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <PixelHeraAvatar size={64} />

        {/* Info */}
        <div className="flex-1 space-y-2">
          <div>
            <StatusBadge behavior={geminiBehavior} size="sm" />
          </div>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {currentTask ? currentTask.slice(0, 60) + (currentTask.length > 60 ? '...' : '') : description}
          </p>
          <div className="flex items-center gap-3 text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
            <span>Cache: {cacheCount}</span>
            <span>Last: {lastAnalyzed ? formatRelativeTime(lastAnalyzed) : 'Never'}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end mt-2">
        <span className="text-[10px] font-mono opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: 'var(--text-secondary)' }}>
          Click to chat
        </span>
      </div>
    </div>
  );
}
