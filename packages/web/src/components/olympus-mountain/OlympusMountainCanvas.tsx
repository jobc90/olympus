// ============================================================================
// OlympusMountainCanvas — Main canvas rendering the full Olympus Mountain scene
// ============================================================================

import { useRef, useEffect, useState, useCallback, type MouseEvent } from 'react';
import type { WorkerConfig, CodexConfig, GeminiConfig, WorkerAvatar, CodexAvatar, GeminiAvatar } from '../../lib/types';
import { gridToScreen } from '../../engine/isometric';
import {
  renderFrame,
  type OlympusMountainState,
  type WorkerConfig as CanvasWorkerConfig,
  type CodexConfig as CanvasCodexConfig,
  type GeminiConfig as CanvasGeminiConfig,
  type LayoutProvider,
} from '../../engine/canvas';
import {
  MAP_COLS,
  MAP_ROWS,
  getFloorColor,
  createWalkGrid,
  buildFurnitureLayout,
  buildZones,
} from '../../olympus-mountain/layout';

// ---------------------------------------------------------------------------
// The layout provider bridges Olympus Mountain layout to the engine
// ---------------------------------------------------------------------------

const layoutProvider: LayoutProvider = {
  MAP_COLS,
  MAP_ROWS,
  getFloorColor,
  createWalkGrid,
  buildFurnitureLayout,
  buildZones: (workerCount: number) => {
    const zones = buildZones(workerCount);
    const result: Record<string, { id: string; label: string; emoji: string; center: { col: number; row: number } }> = {};
    for (const [key, zone] of Object.entries(zones)) {
      result[key] = { id: zone.id, label: zone.label, emoji: zone.emoji, center: zone.center };
    }
    return result;
  },
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_WIDTH = 1100;
const BASE_HEIGHT = 620;
const ASPECT_RATIO = BASE_WIDTH / BASE_HEIGHT;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface OlympusMountainCanvasProps {
  olympusMountainState: OlympusMountainState;
  workers: WorkerConfig[];
  codexConfig: CodexConfig;
  geminiConfig?: GeminiConfig;
  onTick: () => void;
  /** Internal render resolution width (default: 1100) */
  width?: number;
  /** Internal render resolution height (default: 620) */
  height?: number;
  className?: string;
  scale?: number;
  connected?: boolean;
  onWorkerClick?: (workerId: string) => void;
  onPerformanceUpdate?: (metrics: { fps: number; frameTimeMs: number }) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OlympusMountainCanvas({
  olympusMountainState,
  workers,
  codexConfig,
  geminiConfig,
  onTick,
  width = BASE_WIDTH,
  height = BASE_HEIGHT,
  className = '',
  scale = 1,
  connected = false,
  onWorkerClick,
  onPerformanceUpdate,
}: OlympusMountainCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const perfWindowRef = useRef<{ startedAt: number; frames: number; frameTimeSum: number }>({
    startedAt: 0,
    frames: 0,
    frameTimeSum: 0,
  });

  // Container-based responsive sizing
  const [containerWidth, setContainerWidth] = useState(0);

  const handleResize = useCallback(() => {
    if (containerRef.current) {
      setContainerWidth(containerRef.current.clientWidth);
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Initial measure
    setContainerWidth(el.clientWidth);

    const observer = new ResizeObserver(() => handleResize());
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleResize]);

  // Calculate display dimensions from container width, maintaining aspect ratio
  const displayWidth = containerWidth > 0 ? containerWidth : width;
  const displayHeight = Math.round(displayWidth / ASPECT_RATIO);

  // DPR-aware rendering for sharp output
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const canvasPixelWidth = Math.round(width * scale * dpr);
  const canvasPixelHeight = Math.round(height * scale * dpr);

  // Store latest props in refs to avoid stale closures in the render loop
  const propsRef = useRef({
    olympusMountainState, workers, codexConfig, geminiConfig, connected, onTick, width, height, scale, dpr, onWorkerClick,
    onPerformanceUpdate,
  });
  useEffect(() => {
    propsRef.current = {
      olympusMountainState, workers, codexConfig, geminiConfig, connected, onTick, width, height, scale, dpr, onWorkerClick, onPerformanceUpdate,
    };
  });

  useEffect(() => {
    const render = (timestamp: number) => {
      const {
        olympusMountainState: os,
        workers: ws,
        codexConfig: cc,
        geminiConfig: gc,
        connected: cn,
        onTick: ot,
        width: w,
        height: h,
        scale: sc,
        dpr: deviceDpr,
        onPerformanceUpdate: perfUpdate,
      } = propsRef.current;

      // 30 fps cap
      const frameDelta = timestamp - lastTimeRef.current;
      if (frameDelta >= 1000 / 30) {
        lastTimeRef.current = timestamp;
        ot();

        const canvas = canvasRef.current;
        if (!canvas) {
          animRef.current = requestAnimationFrame(render);
          return;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          animRef.current = requestAnimationFrame(render);
          return;
        }

        ctx.save();
        const totalScale = sc * deviceDpr;
        if (totalScale !== 1) {
          ctx.scale(totalScale, totalScale);
        }

        // Map WorkerConfig[] to CanvasWorkerConfig[]
        const canvasWorkers: CanvasWorkerConfig[] = ws.map(w => ({
          id: w.id,
          name: w.name,
          emoji: w.emoji,
          color: w.color,
          avatar: w.avatar as WorkerAvatar,
        }));

        const canvasCodex: CanvasCodexConfig = {
          name: cc.name,
          emoji: cc.emoji,
          avatar: cc.avatar as CodexAvatar,
        };

        const canvasGemini: CanvasGeminiConfig | undefined = gc ? {
          name: gc.name,
          emoji: gc.emoji,
          avatar: gc.avatar as GeminiAvatar,
        } : undefined;

        renderFrame(ctx, w, h, os, {
          workers: canvasWorkers,
          codex: canvasCodex,
          gemini: canvasGemini,
          connected: cn,
          layout: layoutProvider,
        });

        ctx.restore();

        if (perfUpdate) {
          const perf = perfWindowRef.current;
          if (perf.startedAt === 0) {
            perf.startedAt = timestamp;
          }
          perf.frames += 1;
          perf.frameTimeSum += frameDelta;

          const elapsed = timestamp - perf.startedAt;
          if (elapsed >= 1000) {
            const fps = perf.frames > 0 ? (perf.frames * 1000) / elapsed : 0;
            const frameTimeMs = perf.frames > 0 ? perf.frameTimeSum / perf.frames : 0;
            perfUpdate({
              fps: Number(fps.toFixed(1)),
              frameTimeMs: Number(frameTimeMs.toFixed(1)),
            });
            perf.startedAt = timestamp;
            perf.frames = 0;
            perf.frameTimeSum = 0;
          }
        }
      }

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
      }
    };
  }, []);

  const handleCanvasClick = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    const { onWorkerClick: clickHandler, olympusMountainState: stateSnapshot } = propsRef.current;
    if (!clickHandler || stateSnapshot.workers.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = (e.clientX - rect.left) * (width / rect.width);
    const y = (e.clientY - rect.top) * (height / rect.height);

    let closestWorkerId: string | null = null;
    let minDistance = Number.POSITIVE_INFINITY;
    for (const worker of stateSnapshot.workers) {
      const screen = gridToScreen(worker.pos);
      const dx = x - screen.x;
      const dy = y - screen.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDistance) {
        minDistance = dist;
        closestWorkerId = worker.id;
      }
    }

    if (closestWorkerId && minDistance <= 36) {
      clickHandler(closestWorkerId);
    }
  }, [height, width]);

  return (
    <div ref={containerRef} className={`w-full ${className}`}>
      <canvas
        ref={canvasRef}
        width={canvasPixelWidth}
        height={canvasPixelHeight}
        onClick={handleCanvasClick}
        className="rounded-xl"
        style={{
          width: '100%',
          height: displayHeight,
          imageRendering: 'pixelated',
          backgroundColor: '#0a0a0f',
        }}
      />
    </div>
  );
}
