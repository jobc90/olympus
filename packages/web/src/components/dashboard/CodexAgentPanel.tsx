// ============================================================================
// CodexAgentPanel — Zeus (Codex) agent status panel
// ============================================================================

import type { CodexConfig } from '../../lib/types';
import { drawDiversePortrait } from '../../sprites/characters';

interface CodexAgentPanelProps {
  codexConfig: CodexConfig;
  codexBehavior: string;
  connected: boolean;
  onChatClick?: () => void;
}

function PixelCodexAvatar({ size = 96 }: { size?: number }) {
  const canvasRef = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    drawDiversePortrait(ctx, size, 'zeus', 0);
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
    idle: '대기 중',
    working: '작업 중',
    thinking: '추론 중',
    reviewing: '검토 중',
    summarizing: '요약 중',
    routing: '라우팅 중',
    initializing: '초기화 중',
  };

  const description = behaviorInfo[codexBehavior] ?? '대기 중';
  const connectionText = connected ? '연결됨' : '연결 끊김';
  const dutyText: Record<string, string> = {
    supervising: '팀 상태 모니터링',
    directing: '워커 작업 지시',
    analyzing: '결과 분석 중',
    meeting: '협업 조율 중',
    offline: '대기 중',
    idle: '명령 대기',
    working: '태스크 처리 중',
    thinking: 'LLM 추론 중',
    reviewing: '코드 리뷰 중',
    summarizing: '결과 요약 중',
    routing: '워커 라우팅 중',
    initializing: 'Codex CLI 초기화',
  };

  return (
    <div
      className="group relative rounded-2xl p-2.5 transition-all duration-200 h-[172px] overflow-hidden"
      style={{
        background: 'linear-gradient(150deg, rgba(20, 17, 8, 0.95), rgba(30, 26, 11, 0.9))',
        border: '1px solid #FFD7004a',
      }}
    >
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
        style={{
          boxShadow: '0 14px 30px rgba(255, 215, 0, 0.15)',
        }}
      />

      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-base">{codexConfig.emoji}</span>
        <h3 className="font-semibold text-sm" style={{ color: '#FFF2C4' }}>
          Orchestrator / Codex
        </h3>
      </div>

      {onChatClick && (
        <button
          className="absolute bottom-2.5 right-2.5 text-[11px] font-mono px-2 py-0.5 rounded-md border hover:bg-white/10 transition-colors"
          style={{ color: '#FFF2C4', borderColor: '#FFD70066' }}
          onClick={(e) => { e.stopPropagation(); onChatClick(); }}
        >
          Chat
        </button>
      )}

      <div className="flex items-start gap-2.5">
        <PixelCodexAvatar size={96} />

        <div className="flex-1 h-[96px] text-[11px] font-mono flex flex-col justify-between min-w-0">
          <p className="truncate" style={{ color: '#FFF2C4' }}>
            Zeus
          </p>
          <p className="truncate" style={{ color: '#DCC287' }}>{infoEmoji(codexBehavior)} {description}</p>
          <p className="truncate" style={{ color: connected ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
            {connected ? '🟢' : '🔴'} {connectionText}
          </p>
          <p className="truncate" style={{ color: '#BFAE7A' }}>
            🏛️ {dutyText[codexBehavior] ?? '조율 중'}
          </p>
        </div>
      </div>
    </div>
  );
}

function infoEmoji(behavior: string): string {
  const emojis: Record<string, string> = {
    supervising: '👀',
    directing: '📋',
    analyzing: '📊',
    meeting: '🤝',
    offline: '💤',
  };
  return emojis[behavior] ?? '⚡';
}
