// ============================================================================
// OfficeCanvas — Main canvas rendering the full office scene
// ============================================================================

import { useRef, useEffect } from 'react';
import type { WorkerConfig, CodexConfig, WorkerAvatar, CodexAvatar } from '../../lib/types';
import {
  renderFrame,
  type OfficeState,
  type WorkerConfig as CanvasWorkerConfig,
  type CodexConfig as CanvasCodexConfig,
  type LayoutProvider,
} from '../../engine/canvas';
import {
  MAP_COLS,
  MAP_ROWS,
  getFloorColor,
  createWalkGrid,
  buildFurnitureLayout,
  buildZones,
} from '../../office/layout';

// ---------------------------------------------------------------------------
// The layout provider bridges Olympus office/layout to the engine
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
// Props
// ---------------------------------------------------------------------------

interface OfficeCanvasProps {
  officeState: OfficeState;
  workers: WorkerConfig[];
  codexConfig: CodexConfig;
  onTick: () => void;
  width?: number;
  height?: number;
  displayWidth?: number;
  displayHeight?: number;
  className?: string;
  scale?: number;
  demoMode?: boolean;
  connected?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OfficeCanvas({
  officeState,
  workers,
  codexConfig,
  onTick,
  width = 1100,
  height = 620,
  displayWidth,
  displayHeight,
  className = '',
  scale = 1,
  demoMode = true,
  connected = false,
}: OfficeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // Store latest props in refs to avoid stale closures in the render loop
  const propsRef = useRef({
    officeState, workers, codexConfig, connected, demoMode, onTick, width, height, scale,
  });
  useEffect(() => {
    propsRef.current = {
      officeState, workers, codexConfig, connected, demoMode, onTick, width, height, scale,
    };
  });

  useEffect(() => {
    const render = (timestamp: number) => {
      const {
        officeState: os,
        workers: ws,
        codexConfig: cc,
        connected: cn,
        demoMode: dm,
        onTick: ot,
        width: w,
        height: h,
        scale: sc,
      } = propsRef.current;

      // 30 fps cap
      if (timestamp - lastTimeRef.current >= 1000 / 30) {
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
        if (sc !== 1) {
          ctx.scale(sc, sc);
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

        renderFrame(ctx, w, h, os, {
          workers: canvasWorkers,
          codex: canvasCodex,
          connected: cn,
          demoMode: dm,
          layout: layoutProvider,
        });

        ctx.restore();
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

  const cssWidth = displayWidth ?? width;
  const cssHeight = displayHeight ?? height;

  return (
    <canvas
      ref={canvasRef}
      width={Math.round(width * scale)}
      height={Math.round(height * scale)}
      className={`rounded-xl ${className}`}
      style={{
        width: cssWidth,
        height: cssHeight,
        maxWidth: '100%',
        imageRendering: 'pixelated',
        backgroundColor: '#0a0a0f',
      }}
    />
  );
}
