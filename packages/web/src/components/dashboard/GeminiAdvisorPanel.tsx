// ============================================================================
// GeminiAdvisorPanel — Hera (Gemini) advisor status panel
// ============================================================================

import type { GeminiConfig } from '../../lib/types';
import { drawGemini } from '../../sprites/characters';

interface GeminiAdvisorPanelProps {
  geminiConfig: GeminiConfig;
  geminiBehavior: string;
  cacheCount: number;
  lastAnalyzed: number | null;
  currentTask: string | null;
  formatRelativeTime: (ts: number) => string;
  onChatClick?: () => void;
}

function PixelHeraAvatar({ size = 96 }: { size?: number }) {
  const canvasRef = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;
    drawGemini(ctx, size / 2, size - 6, 'stand', 0, 'hera', '');
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
  const focusText = currentTask
    ? currentTask.slice(0, 32) + (currentTask.length > 32 ? '…' : '')
    : '프로젝트 컨텍스트 대기';

  return (
    <div
      className="group relative rounded-2xl p-2.5 transition-all duration-200 cursor-pointer h-[172px] overflow-hidden"
      style={{
        background: 'linear-gradient(150deg, rgba(28, 11, 36, 0.95), rgba(22, 12, 33, 0.9))',
        border: '1px solid #AB47BC4a',
      }}
      onClick={onChatClick}
    >
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
        style={{
          boxShadow: '0 14px 30px rgba(171, 71, 188, 0.15)',
        }}
      />

      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-base">{geminiConfig.emoji}</span>
        <h3 className="font-semibold text-sm" style={{ color: '#EFD8FF' }}>
          Advisor / Gemini
        </h3>
      </div>

      <div className="flex items-start gap-2.5">
        <PixelHeraAvatar size={96} />

        <div className="flex-1 h-[96px] text-[11px] font-mono flex flex-col justify-between min-w-0">
          <p className="truncate" style={{ color: '#F4E9FF' }}>
            Hera
          </p>
          <p className="truncate" style={{ color: '#DABFE8' }}>
            {infoEmoji(geminiBehavior)} {description}
          </p>
          <p className="truncate" style={{ color: '#C2A2D1' }}>
            🗂️ Cache: {cacheCount} · Last: {lastAnalyzed ? formatRelativeTime(lastAnalyzed) : 'Never'}
          </p>
          <p className="truncate" style={{ color: '#C2A2D1' }}>
            💡 {focusText}
          </p>
        </div>
      </div>
    </div>
  );
}

function infoEmoji(behavior: string): string {
  const emojis: Record<string, string> = {
    idle: '😴',
    scanning: '🔎',
    analyzing: '🧠',
    advising: '🗣️',
    caching: '🗂️',
    offline: '💤',
  };
  return emojis[behavior] ?? '💎';
}
