// ============================================================================
// CodexAgentPanel — Zeus (Codex) agent status panel
// ============================================================================

import type { CodexConfig } from '../../lib/types';
import StatusBadge from '../shared/StatusBadge';
import { drawCodex } from '../../sprites/characters';

interface CodexAgentPanelProps {
  codexConfig: CodexConfig;
  codexBehavior: string;
  connected: boolean;
  onChatClick?: () => void;
}

function PixelCodexAvatar({ size = 64 }: { size?: number }) {
  const canvasRef = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;
    drawCodex(ctx, size / 2, size - 6, 'stand', 0, 'zeus', '');
  };

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="rounded-lg flex-shrink-0"
      style={{
        imageRendering: 'pixelated',
        backgroundColor: '#FFD70015',
        border: '1px solid #FFD70030',
      }}
    />
  );
}

export function CodexAgentPanel({ codexConfig, codexBehavior, connected, onChatClick }: CodexAgentPanelProps) {
  const behaviorInfo: Record<string, string> = {
    supervising: '감독 중',
    directing: '작업 할당 중',
    analyzing: '분석 중',
    meeting: '회의 중',
    offline: '오프라인',
  };

  const description = behaviorInfo[codexBehavior] ?? '대기 중';

  return (
    <div
      className="rounded-xl p-4 transition-all duration-300 hover:scale-[1.01] cursor-pointer"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid #FFD70030',
        boxShadow: '0 0 20px #FFD70008',
      }}
      onClick={onChatClick}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">⚡</span>
        <h3 className="font-pixel text-sm" style={{ color: 'var(--text-primary)' }}>
          Codex Agent — Zeus
        </h3>
      </div>

      {/* Content */}
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <PixelCodexAvatar size={64} />

        {/* Info */}
        <div className="flex-1 space-y-2">
          <div>
            <StatusBadge behavior={codexBehavior} size="sm" />
          </div>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {description}
          </p>
          <div className="flex items-center gap-2 text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
            <span>상태:</span>
            <span style={{ color: connected ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
              {connected ? '연결됨' : '연결 끊김'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
