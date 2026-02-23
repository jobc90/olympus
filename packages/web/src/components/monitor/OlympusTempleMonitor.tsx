import { useMemo } from 'react';
import { drawCodex, drawWorker } from '../../sprites/characters';
import { BEHAVIOR_INFO, formatRelativeTime as defaultFormatRelativeTime } from '../../lib/state-mapper';
import type {
  WorkerConfig,
  WorkerDashboardState,
  WorkerAvatar,
  CodexConfig,
  GeminiConfig,
} from '../../lib/types';
import type { WorkerTaskEntry } from '../../hooks/useOlympus';
import { OlympusMountainCanvas } from '../olympus-mountain/OlympusMountainCanvas';
import type { OlympusMountainState } from '../../engine/canvas';

interface ActivityEventView {
  id: string;
  type: string;
  agentName: string;
  message: string;
  timestamp: number;
  color?: string;
}

interface OlympusTempleMonitorProps {
  connected: boolean;
  workers: WorkerConfig[];
  workerStates: Record<string, WorkerDashboardState>;
  workerTasks: WorkerTaskEntry[];
  activityEvents: ActivityEventView[];
  codexBehavior: string;
  geminiBehavior: string;
  geminiCurrentTask: string | null;
  geminiLastAnalyzed: number | null;
  selectedWorkerId: string | null;
  olympusMountainState: OlympusMountainState;
  codexConfig: CodexConfig;
  geminiConfig?: GeminiConfig;
  onTick: () => void;
  onSelectWorker: (workerId: string) => void;
  onOpenWorkerChat: (workerId: string) => void;
  onOpenWorkerTerminal: (workerId: string) => void;
  onOpenCodexChat: () => void;
  onOpenGeminiChat: () => void;
  formatTokens: (n: number) => string;
  formatRelativeTime?: (ts: number) => string;
}

const WORKING_BEHAVIORS = new Set([
  'working',
  'thinking',
  'reviewing',
  'deploying',
  'collaborating',
  'chatting',
  'directing',
  'analyzing',
  'meeting',
]);

const ACTIVE_ZONE_BEHAVIORS = new Set([
  'working',
  'thinking',
  'reviewing',
  'deploying',
  'collaborating',
  'chatting',
  'analyzing',
  'directing',
  'meeting',
  'starting',
]);

function WorkerPortrait({ worker, size = 70 }: { worker: WorkerConfig; size?: number }) {
  const canvasRef = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;
    drawWorker(ctx, size / 2, size - 8, 'stand', 's', 0, worker.avatar as WorkerAvatar, worker.color, '');
  };

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="rounded-xl"
      style={{
        imageRendering: 'pixelated',
        backgroundColor: `${worker.color}1a`,
        border: `1px solid ${worker.color}40`,
      }}
    />
  );
}

function ZeusPortrait({ size = 90 }: { size?: number }) {
  const canvasRef = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;
    drawCodex(ctx, size / 2, size - 10, 'stand', 0, 'zeus', '');
  };

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="rounded-xl"
      style={{ imageRendering: 'pixelated', backgroundColor: '#FFD7001c', border: '1px solid #FFD70050' }}
    />
  );
}

function HeraPortrait({ size = 90 }: { size?: number }) {
  const canvasRef = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;
    drawWorker(ctx, size / 2, size - 10, 'stand', 's', 0, 'hera', '#AB47BC', '');
  };

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="rounded-xl"
      style={{ imageRendering: 'pixelated', backgroundColor: '#AB47BC1c', border: '1px solid #AB47BC50' }}
    />
  );
}

function trimPath(path?: string): string {
  if (!path) return '-';
  return path.replace(/^\/Users\/[^/]+\//, '~/');
}

export function OlympusTempleMonitor({
  connected,
  workers,
  workerStates,
  workerTasks,
  activityEvents,
  codexBehavior,
  geminiBehavior,
  geminiCurrentTask,
  geminiLastAnalyzed,
  selectedWorkerId,
  olympusMountainState,
  codexConfig,
  geminiConfig,
  onTick,
  onSelectWorker,
  onOpenWorkerChat,
  onOpenWorkerTerminal,
  onOpenCodexChat,
  onOpenGeminiChat,
  formatTokens,
  formatRelativeTime = defaultFormatRelativeTime,
}: OlympusTempleMonitorProps) {
  const activeTasksByWorker = useMemo(() => {
    const map = new Map<string, WorkerTaskEntry>();
    for (const task of workerTasks) {
      if (task.status !== 'active' && task.status !== 'timeout') continue;
      map.set(task.workerId, task);
    }
    return map;
  }, [workerTasks]);

  const selectedWorker = selectedWorkerId
    ? workers.find((w) => w.id === selectedWorkerId) ?? null
    : workers[0] ?? null;
  const selectedState = selectedWorker ? workerStates[selectedWorker.id] : undefined;
  const selectedTask = selectedWorker ? activeTasksByWorker.get(selectedWorker.id) : undefined;
  const recentEvents = activityEvents.slice(0, 7);
  const codexLastAnalyzed = useMemo(() => {
    let latest: number | null = null;
    for (const event of activityEvents) {
      const agent = event.agentName.toLowerCase();
      if (!agent.includes('codex') && !agent.includes('zeus')) continue;
      if (latest === null || event.timestamp > latest) {
        latest = event.timestamp;
      }
    }
    return latest;
  }, [activityEvents]);

  const activeWorkerCount = workers.filter((worker) => {
    const state = workerStates[worker.id];
    return WORKING_BEHAVIORS.has(state?.behavior ?? 'idle');
  }).length;
  const idleWorkerCount = Math.max(0, workers.length - activeWorkerCount);
  const sanctuaryFocusedCount = workers.filter((worker) => {
    const behavior = workerStates[worker.id]?.behavior ?? 'idle';
    return ACTIVE_ZONE_BEHAVIORS.has(behavior);
  }).length;

  return (
    <section className="mt-4 space-y-5">
      <div className="temple-shell rounded-3xl border overflow-hidden">
        <div className="temple-glow-layer" />
        <div className="relative z-10 p-5 lg:p-6">
          <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight" style={{ color: '#F6E8C8' }}>
                Mount Olympus Real-time Monitor
              </h2>
              <p className="text-xs font-mono mt-1" style={{ color: 'var(--text-secondary)' }}>
                Full map view is live. Click any moving character to select the worker.
              </p>
            </div>
            <div className="temple-pill text-xs font-mono">
              {connected ? `${activeWorkerCount}/${workers.length} workers active` : 'Gateway disconnected'}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr,310px] gap-4">
            <div className="rounded-2xl border p-2" style={{ borderColor: 'rgba(251, 220, 155, 0.35)', backgroundColor: 'rgba(8, 12, 22, 0.55)' }}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="temple-pill text-xs font-mono">⚒️ Working Sanctuaries {sanctuaryFocusedCount}</span>
                <span className="temple-pill text-xs font-mono">☕ Idle Agora {idleWorkerCount}</span>
                <span className="temple-pill text-xs font-mono">⚡ Zeus: {BEHAVIOR_INFO[codexBehavior as keyof typeof BEHAVIOR_INFO]?.label ?? codexBehavior}</span>
                <span className="temple-pill text-xs font-mono">🦉 Hera: {BEHAVIOR_INFO[geminiBehavior as keyof typeof BEHAVIOR_INFO]?.label ?? geminiBehavior}</span>
              </div>
              <OlympusMountainCanvas
                olympusMountainState={olympusMountainState}
                workers={workers}
                codexConfig={codexConfig}
                geminiConfig={geminiConfig}
                selectedWorkerId={selectedWorkerId}
                onTick={onTick}
                connected={connected}
                onWorkerClick={onSelectWorker}
              />
            </div>

            <aside className="space-y-4">
              <div className="temple-god-card">
                <div className="flex items-start gap-3">
                  <ZeusPortrait />
                  <div className="min-w-0">
                    <div className="text-xs font-mono uppercase tracking-wider" style={{ color: '#FFD54F' }}>Orchestrator</div>
                    <div className="font-semibold text-lg" style={{ color: '#FFF5D6' }}>Zeus / Codex</div>
                    <div className="text-xs font-mono mt-1" style={{ color: 'var(--text-secondary)' }}>
                      {BEHAVIOR_INFO[codexBehavior as keyof typeof BEHAVIOR_INFO]?.label ?? codexBehavior}
                    </div>
                    <div className="text-[11px] font-mono mt-2 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                      {codexLastAnalyzed ? `Last analyzed ${formatRelativeTime(codexLastAnalyzed)}` : '대기 중'}
                    </div>
                    <button className="temple-btn mt-3" onClick={onOpenCodexChat}>Chat</button>
                  </div>
                </div>
              </div>

              <div className="temple-god-card">
                <div className="flex items-start gap-3">
                  <HeraPortrait />
                  <div className="min-w-0">
                    <div className="text-xs font-mono uppercase tracking-wider" style={{ color: '#CE93D8' }}>Advisor</div>
                    <div className="font-semibold text-lg" style={{ color: '#F4E9FF' }}>Hera / Gemini</div>
                    <div className="text-xs font-mono mt-1" style={{ color: 'var(--text-secondary)' }}>
                      {BEHAVIOR_INFO[geminiBehavior as keyof typeof BEHAVIOR_INFO]?.label ?? geminiBehavior}
                    </div>
                    <div className="text-[11px] font-mono mt-2 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                      {geminiCurrentTask || (geminiLastAnalyzed ? `Last analyzed ${formatRelativeTime(geminiLastAnalyzed)}` : '대기 중')}
                    </div>
                    <button className="temple-btn mt-3" onClick={onOpenGeminiChat}>Chat</button>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border p-4" style={{ borderColor: 'rgba(251, 220, 155, 0.28)', backgroundColor: 'rgba(10, 14, 26, 0.66)' }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold" style={{ color: '#F6E8C8' }}>Selected Worker</h3>
                  {selectedWorker && (
                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
                      {selectedState ? formatRelativeTime(selectedState.lastActivity) : '-'}
                    </span>
                  )}
                </div>

                {!selectedWorker ? (
                  <div className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                    워커를 선택해 주세요.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <WorkerPortrait worker={selectedWorker} size={66} />
                      <div className="min-w-0">
                        <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{selectedWorker.name}</div>
                        <div className="text-[11px] font-mono truncate" style={{ color: 'var(--text-secondary)' }}>
                          {trimPath(selectedWorker.projectPath)}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                      <div className="rounded-lg border p-2" style={{ borderColor: 'var(--border)' }}>
                        <div style={{ color: 'var(--text-secondary)' }}>Status</div>
                        <div style={{ color: BEHAVIOR_INFO[selectedState?.behavior ?? 'idle'].neonColor }}>
                          {BEHAVIOR_INFO[selectedState?.behavior ?? 'idle'].label}
                        </div>
                      </div>
                      <div className="rounded-lg border p-2" style={{ borderColor: 'var(--border)' }}>
                        <div style={{ color: 'var(--text-secondary)' }}>Tokens</div>
                        <div style={{ color: 'var(--text-primary)' }}>{formatTokens(selectedState?.totalTokens ?? 0)}</div>
                      </div>
                      <div className="rounded-lg border p-2" style={{ borderColor: 'var(--border)' }}>
                        <div style={{ color: 'var(--text-secondary)' }}>Tasks</div>
                        <div style={{ color: 'var(--text-primary)' }}>{selectedState?.totalTasks ?? 0}</div>
                      </div>
                      <div className="rounded-lg border p-2" style={{ borderColor: 'var(--border)' }}>
                        <div style={{ color: 'var(--text-secondary)' }}>State</div>
                        <div style={{ color: selectedTask ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                          {selectedTask ? 'Running' : 'Idle'}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border px-3 py-2 text-xs font-mono" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                      {selectedTask?.prompt || selectedState?.currentTask?.title || '활성 작업 없음'}
                    </div>

                    <div className="flex items-center gap-2">
                      <button className="temple-btn" onClick={() => onOpenWorkerChat(selectedWorker.id)}>Chat</button>
                      <button className="temple-btn temple-btn-strong" onClick={() => onOpenWorkerTerminal(selectedWorker.id)}>Terminal</button>
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr,1fr] gap-5">
        <div className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Temple Chronicle</h3>
            <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>Latest events</span>
          </div>
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {recentEvents.length === 0 && (
              <div className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>아직 이벤트가 없습니다.</div>
            )}
            {recentEvents.map((event) => (
              <div key={event.id} className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(8, 13, 26, 0.45)' }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold" style={{ color: event.color ?? 'var(--accent-primary)' }}>{event.agentName}</span>
                  <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>{formatRelativeTime(event.timestamp)}</span>
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--text-primary)' }}>{event.message}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Worker Deck</h3>
            <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{workers.length}</span>
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {workers.map((worker) => {
              const state = workerStates[worker.id];
              const behavior = state?.behavior ?? 'idle';
              const behaviorInfo = BEHAVIOR_INFO[behavior as keyof typeof BEHAVIOR_INFO] ?? BEHAVIOR_INFO.idle;
              const selected = selectedWorker?.id === worker.id;

              return (
                <button
                  key={worker.id}
                  type="button"
                  onClick={() => onSelectWorker(worker.id)}
                  className="w-full text-left rounded-xl border px-3 py-2"
                  style={{
                    borderColor: selected ? worker.color : 'var(--border)',
                    backgroundColor: selected ? `${worker.color}20` : 'rgba(9, 14, 26, 0.48)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{worker.name}</span>
                    <span className="text-[10px] font-mono" style={{ color: behaviorInfo.neonColor }}>{behaviorInfo.label}</span>
                  </div>
                  <div className="text-[11px] font-mono truncate mt-1" style={{ color: 'var(--text-secondary)' }}>
                    {trimPath(worker.projectPath)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
