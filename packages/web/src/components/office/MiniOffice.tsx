// ============================================================================
// MiniOffice — Small office preview for the dashboard
// ============================================================================

import type { WorkerConfig, WorkerDashboardState, CodexConfig, ThemeName } from '../../lib/types';
import type { OfficeState } from '../../engine/canvas';
import { OfficeCanvas } from './OfficeCanvas';

interface MiniOfficeProps {
  workers: WorkerConfig[];
  workerStates: Record<string, WorkerDashboardState>;
  codexConfig: CodexConfig;
  theme?: ThemeName;
  officeState?: OfficeState;
  onTick?: () => void;
}

// Placeholder office state when no hook is connected yet
function createPlaceholderState(workers: WorkerConfig[]): OfficeState {
  return {
    workers: workers.map((w, i) => ({
      id: w.id,
      pos: { col: 3 + (i % 2) * 4, row: 3 + Math.floor(i / 2) * 3 },
      direction: 's' as const,
      anim: 'sit_typing' as const,
    })),
    codex: { anim: 'stand' as const },
    bubbles: [],
    particles: [],
    tick: 0,
    dayNightPhase: 0,
  };
}

export function MiniOffice({
  workers,
  workerStates,
  codexConfig,
  officeState,
  onTick,
}: MiniOfficeProps) {
  const state = officeState ?? createPlaceholderState(workers);
  const tickFn = onTick ?? (() => {});

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-pixel text-sm flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <span>Office</span>
        </h2>
        <button
          className="text-xs font-mono px-2 py-1 rounded-md hover:bg-white/10 transition-colors"
          style={{ color: 'var(--accent-primary)' }}
        >
          Full View
        </button>
      </div>
      <div className="group flex justify-center">
        <div
          className="relative rounded-xl overflow-hidden transition-all duration-300 group-hover:ring-2"
          style={{ border: '1px solid var(--border)', maxWidth: 800 }}
        >
          {/* LIVE PREVIEW label */}
          <div
            className="absolute top-2 left-3 z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-mono uppercase tracking-wider"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)', opacity: 0.9 }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#66BB6A' }} />
            Live Preview
          </div>
          {/* Render at full resolution (1100x620) but display scaled down */}
          <OfficeCanvas
            officeState={state}
            workers={workers}
            codexConfig={codexConfig}
            onTick={tickFn}
            width={1100}
            height={620}
            displayWidth={800}
            displayHeight={450}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-4">
            <span
              className="text-xs font-mono px-3 py-1 rounded-full"
              style={{ backgroundColor: 'var(--accent-primary)', color: '#000' }}
            >
              Click to expand
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
