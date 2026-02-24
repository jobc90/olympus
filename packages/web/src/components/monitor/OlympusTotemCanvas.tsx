import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { gridToScreen } from '../../engine/isometric';
import type { OlympusMountainState } from '../../engine/canvas';
import type { WorkerConfig } from '../../lib/types';

interface OlympusTotemCanvasProps {
  olympusMountainState: OlympusMountainState;
  workers: WorkerConfig[];
  connected: boolean;
  selectedWorkerId?: string | null;
  onTick: () => void;
  onWorkerClick?: (workerId: string) => void;
  className?: string;
}

interface HitTarget {
  id: string;
  x: number;
  y: number;
  r: number;
}

interface Point {
  x: number;
  y: number;
}

const BASE_WIDTH = 1280;
const BASE_HEIGHT = 760;
const ASPECT = BASE_WIDTH / BASE_HEIGHT;

const SOURCE_WIDTH = 1100;
const SOURCE_HEIGHT = 620;
const SCALE_X = BASE_WIDTH / SOURCE_WIDTH;
const SCALE_Y = BASE_HEIGHT / SOURCE_HEIGHT;
const OFFSET_X = 108;
const OFFSET_Y = 110;

function fract(n: number): number {
  return n - Math.floor(n);
}

function noise(seed: number): number {
  return fract(Math.sin(seed * 12.9898) * 43758.5453123);
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function shade(hex: string, amount: number): string {
  const value = hex.replace('#', '');
  if (value.length !== 6) return hex;
  const num = Number.parseInt(value, 16);
  if (Number.isNaN(num)) return hex;

  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;

  const nextR = Math.max(0, Math.min(255, r + amount));
  const nextG = Math.max(0, Math.min(255, g + amount));
  const nextB = Math.max(0, Math.min(255, b + amount));

  return `#${((nextR << 16) | (nextG << 8) | nextB).toString(16).padStart(6, '0')}`;
}

function project(col: number, row: number): Point {
  const iso = gridToScreen({ col, row });
  return {
    x: Math.round(iso.x * SCALE_X + OFFSET_X),
    y: Math.round(iso.y * SCALE_Y + OFFSET_Y),
  };
}

function drawIsoTile(ctx: CanvasRenderingContext2D, col: number, row: number, fill: string, stroke: string): void {
  const p = project(col, row);
  const hw = Math.round(24 * SCALE_X);
  const hh = Math.round(12 * SCALE_Y);

  ctx.beginPath();
  ctx.moveTo(p.x, p.y - hh);
  ctx.lineTo(p.x + hw, p.y);
  ctx.lineTo(p.x, p.y + hh);
  ctx.lineTo(p.x - hw, p.y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawIsoBlock(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  height: number,
  top: string,
  left: string,
  right: string,
): void {
  const p = project(col, row);
  const hw = Math.round(24 * SCALE_X);
  const hh = Math.round(12 * SCALE_Y);
  const h = Math.round(height * SCALE_Y);

  ctx.beginPath();
  ctx.moveTo(p.x, p.y - hh - h);
  ctx.lineTo(p.x + hw, p.y - h);
  ctx.lineTo(p.x, p.y + hh - h);
  ctx.lineTo(p.x - hw, p.y - h);
  ctx.closePath();
  ctx.fillStyle = top;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(p.x - hw, p.y - h);
  ctx.lineTo(p.x, p.y + hh - h);
  ctx.lineTo(p.x, p.y + hh);
  ctx.lineTo(p.x - hw, p.y);
  ctx.closePath();
  ctx.fillStyle = left;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(p.x + hw, p.y - h);
  ctx.lineTo(p.x, p.y + hh - h);
  ctx.lineTo(p.x, p.y + hh);
  ctx.lineTo(p.x + hw, p.y);
  ctx.closePath();
  ctx.fillStyle = right;
  ctx.fill();
}

function drawSky(ctx: CanvasRenderingContext2D, tick: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, BASE_HEIGHT);
  g.addColorStop(0, '#121938');
  g.addColorStop(0.55, '#1D2A55');
  g.addColorStop(1, '#0A1022');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

  for (let i = 0; i < 120; i++) {
    const nx = noise(i * 13.7 + 2.1);
    const ny = noise(i * 9.9 + 7.4);
    const twinkle = 0.35 + Math.sin(tick * 0.05 + i) * 0.25;
    const size = nx > 0.7 ? 2 : 1;
    const x = Math.floor(nx * BASE_WIDTH);
    const y = Math.floor(ny * BASE_HEIGHT * 0.45);
    ctx.fillStyle = `rgba(245, 238, 212, ${clamp01(twinkle)})`;
    ctx.fillRect(x, y, size, size);
  }

  const moonX = Math.round(BASE_WIDTH * 0.79);
  const moonY = Math.round(BASE_HEIGHT * 0.13);
  ctx.fillStyle = '#F3E4B2';
  ctx.fillRect(moonX - 16, moonY - 16, 32, 32);
  ctx.fillStyle = '#CBB98A';
  ctx.fillRect(moonX + 6, moonY - 16, 10, 32);
  ctx.fillStyle = 'rgba(243, 228, 178, 0.25)';
  ctx.fillRect(moonX - 34, moonY - 34, 68, 68);
}

function drawTempleMap(ctx: CanvasRenderingContext2D, tick: number): void {
  const centerCol = 17;
  const centerRow = 16;

  for (let row = 6; row <= 27; row++) {
    for (let col = 6; col <= 28; col++) {
      const md = Math.abs(col - centerCol) / 11 + Math.abs(row - centerRow) / 8;
      if (md > 1.06) continue;

      const marble = ((col + row) & 1) === 0 ? '#E9D7B8' : '#DCC39B';
      const sacredBand = row <= 12 ? shade(marble, 10) : marble;
      drawIsoTile(ctx, col, row, sacredBand, '#8F7A5A');

      if (((col * 7 + row * 11) % 13) === 0) {
        const p = project(col, row);
        ctx.fillStyle = 'rgba(120, 102, 75, 0.22)';
        ctx.fillRect(p.x - 2, p.y, 4, 1);
      }
    }
  }

  // Sacred stairs
  for (let step = 0; step < 4; step++) {
    const stairRow = 21 + step;
    const start = 13 - step;
    const end = 21 + step;
    for (let col = start; col <= end; col++) {
      const base = step % 2 === 0 ? '#D2B68A' : '#C4A57A';
      drawIsoTile(ctx, col, stairRow, base, '#7D6548');
    }
  }

  // Sanctum blocks
  const blockTop = '#F3E1BE';
  const blockLeft = '#CBB08A';
  const blockRight = '#B89B72';
  for (let col = 14; col <= 20; col += 2) {
    drawIsoBlock(ctx, col, 10, 44, blockTop, blockLeft, blockRight);
  }

  // Front columns
  const columns = [12, 14, 16, 18, 20, 22];
  for (const col of columns) {
    drawIsoBlock(ctx, col, 14, 52, '#F6E7C6', '#D0B48A', '#C19E72');
  }

  // Zeus altar
  drawIsoBlock(ctx, 17, 13, 18, '#E9D5A6', '#BFA06F', '#AA8A58');
  const altar = project(17, 13);
  ctx.fillStyle = '#FFE17A';
  const pulse = Math.floor((Math.sin(tick * 0.09) + 1) * 2);
  ctx.fillRect(altar.x - 2, altar.y - 28 - pulse, 4, 10 + pulse);
  ctx.fillRect(altar.x - 6, altar.y - 23, 12, 3);
}

function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x - 9, y + 22, 18, 4);
}

function drawWorkerSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  baseColor: string,
  tick: number,
  selected: boolean,
  label: string,
): void {
  const px = (ox: number, oy: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + ox * 2, y + oy * 2, 2, 2);
  };

  const frame = Math.floor(tick / 8) % 2;

  drawShadow(ctx, x, y);

  // Aura ring
  if (selected) {
    const cx = x + 12;
    const cy = y + 12;
    const r = 18;
    ctx.fillStyle = `${baseColor}`;
    for (let yy = -r; yy <= r; yy++) {
      const ny = yy / r;
      const span = Math.floor(r * Math.sqrt(Math.max(0, 1 - ny * ny)));
      ctx.fillRect(cx - span, cy + yy, 1, 1);
      ctx.fillRect(cx + span, cy + yy, 1, 1);
    }
  }

  const tunic = shade(baseColor, 8);
  const tunicDark = shade(baseColor, -28);
  const skin = '#F6D4AF';
  const hair = '#3D2A1F';

  // Head
  for (let yy = 0; yy < 4; yy++) {
    for (let xx = 4; xx < 8; xx++) px(xx, yy + 1, skin);
  }
  for (let xx = 4; xx < 8; xx++) px(xx, 1, hair);
  px(5, 3, '#1B1B1B');
  px(6, 3, '#1B1B1B');

  // Body
  for (let yy = 0; yy < 5; yy++) {
    for (let xx = 3; xx < 9; xx++) px(xx, yy + 5, tunic);
  }
  for (let xx = 3; xx < 9; xx++) px(xx, 9, tunicDark);

  // Arms
  px(2, 6, tunicDark);
  px(2, 7, skin);
  px(9, 6, tunicDark);
  px(9, 7, skin);

  // Legs
  const legOffset = frame === 0 ? 0 : 1;
  px(4, 10 + legOffset, '#2E344D');
  px(5, 10 + legOffset, '#2E344D');
  px(6, 10 + (1 - legOffset), '#2E344D');
  px(7, 10 + (1 - legOffset), '#2E344D');
  px(4, 11 + legOffset, '#151A2B');
  px(7, 11 + (1 - legOffset), '#151A2B');

  // Name chip
  ctx.fillStyle = 'rgba(9, 14, 26, 0.82)';
  const labelW = Math.max(34, label.length * 6 + 8);
  ctx.fillRect(x + 12 - labelW / 2, y + 30, labelW, 12);
  ctx.fillStyle = '#EAE6D9';
  ctx.font = '10px "JetBrains Mono", monospace';
  const tw = ctx.measureText(label).width;
  ctx.fillText(label, x + 12 - tw / 2, y + 39);
}

function drawGodSprite(ctx: CanvasRenderingContext2D, x: number, y: number, role: 'zeus' | 'hera', tick: number): void {
  const main = role === 'zeus' ? '#E9BE48' : '#B184E8';
  const dark = role === 'zeus' ? '#9A7424' : '#6C4A92';
  const skin = role === 'zeus' ? '#F1D9B0' : '#F0D8FA';

  const px = (ox: number, oy: number, color: string, size = 3) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + ox * size, y + oy * size, size, size);
  };

  const bob = Math.sin(tick * 0.05 + (role === 'zeus' ? 0 : 1)) * 2;
  const by = y + bob;

  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.fillRect(x - 8, by + 42, 44, 6);

  for (let yy = 0; yy < 6; yy++) {
    for (let xx = 2; xx < 10; xx++) px(xx, yy + 3, main);
  }
  for (let xx = 2; xx < 10; xx++) px(xx, 8, dark);

  for (let yy = 0; yy < 4; yy++) {
    for (let xx = 3; xx < 9; xx++) px(xx, yy, skin);
  }

  px(4, 1, '#1B1B1B');
  px(7, 1, '#1B1B1B');

  if (role === 'zeus') {
    px(3, -2, '#FFD76A');
    px(4, -3, '#FFD76A');
    px(5, -4, '#FFF0A0');
    px(6, -3, '#FFD76A');
    px(7, -2, '#FFD76A');
    px(5, 4, '#FFF2B5');
    px(5, 5, '#FFD76A');
  } else {
    px(3, -2, '#D8B1FF');
    px(4, -3, '#EED8FF');
    px(5, -3, '#EED8FF');
    px(6, -3, '#EED8FF');
    px(7, -2, '#D8B1FF');
    px(5, 4, '#F6E7FF');
  }

  ctx.fillStyle = 'rgba(8, 13, 26, 0.82)';
  const title = role === 'zeus' ? 'ZEUS' : 'HERA';
  ctx.fillRect(x - 5, by + 52, 54, 14);
  ctx.fillStyle = '#F4EEDB';
  ctx.font = '11px "JetBrains Mono", monospace';
  const tw = ctx.measureText(title).width;
  ctx.fillText(title, x + 22 - tw / 2, by + 63);
}

export function OlympusTotemCanvas({
  olympusMountainState,
  workers,
  connected,
  selectedWorkerId,
  onTick,
  onWorkerClick,
  className = '',
}: OlympusTotemCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number>(0);
  const lastFrameRef = useRef(0);
  const hitTargetsRef = useRef<HitTarget[]>([]);
  const [containerWidth, setContainerWidth] = useState(0);

  const propsRef = useRef({ olympusMountainState, workers, connected, selectedWorkerId, onTick, onWorkerClick });
  useEffect(() => {
    propsRef.current = { olympusMountainState, workers, connected, selectedWorkerId, onTick, onWorkerClick };
  }, [olympusMountainState, workers, connected, selectedWorkerId, onTick, onWorkerClick]);

  const updateSize = useCallback(() => {
    if (!containerRef.current) return;
    setContainerWidth(containerRef.current.clientWidth);
  }, []);

  useEffect(() => {
    updateSize();
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => updateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateSize]);

  useEffect(() => {
    const render = (ts: number) => {
      const elapsed = ts - lastFrameRef.current;
      if (elapsed >= 1000 / 30) {
        lastFrameRef.current = ts;

        const {
          olympusMountainState: state,
          workers: workerConfigs,
          connected: isConnected,
          selectedWorkerId: selectedId,
          onTick: tick,
        } = propsRef.current;

        tick();

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) {
          ctx.imageSmoothingEnabled = false;
          drawSky(ctx, state.tick);
          drawTempleMap(ctx, state.tick);

          drawGodSprite(ctx, BASE_WIDTH * 0.33, BASE_HEIGHT * 0.18, 'zeus', state.tick);
          drawGodSprite(ctx, BASE_WIDTH * 0.62, BASE_HEIGHT * 0.18, 'hera', state.tick);

          const workersById = new Map(workerConfigs.map((worker) => [worker.id, worker]));
          const runtimes = [...state.workers].sort((a, b) => (a.pos.col + a.pos.row) - (b.pos.col + b.pos.row));
          const targets: HitTarget[] = [];

          for (const runtime of runtimes) {
            const cfg = workersById.get(runtime.id);
            if (!cfg) continue;

            const screen = project(runtime.pos.col, runtime.pos.row);
            const px = Math.round(screen.x - 12);
            const py = Math.round(screen.y - 40);
            const selected = selectedId === runtime.id;

            drawWorkerSprite(
              ctx,
              px,
              py,
              cfg.color,
              state.tick + runtime.pos.col * 3 + runtime.pos.row,
              selected,
              cfg.name.slice(0, 10).toUpperCase(),
            );

            targets.push({ id: runtime.id, x: px + 12, y: py + 10, r: 18 });
          }

          hitTargetsRef.current = targets;

          if (!isConnected) {
            ctx.fillStyle = 'rgba(9, 13, 25, 0.82)';
            ctx.fillRect(BASE_WIDTH / 2 - 160, BASE_HEIGHT / 2 - 22, 320, 44);
            ctx.strokeStyle = 'rgba(245, 123, 123, 0.58)';
            ctx.strokeRect(BASE_WIDTH / 2 - 160, BASE_HEIGHT / 2 - 22, 320, 44);
            ctx.fillStyle = '#F7B9B9';
            ctx.font = '14px "JetBrains Mono", monospace';
            const txt = 'Gateway disconnected';
            const tw = ctx.measureText(txt).width;
            ctx.fillText(txt, BASE_WIDTH / 2 - tw / 2, BASE_HEIGHT / 2 + 5);
          }
        }
      }

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  const displayWidth = containerWidth > 0 ? containerWidth : BASE_WIDTH;
  const displayHeight = Math.round(displayWidth / ASPECT);

  const handleClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const clickHandler = propsRef.current.onWorkerClick;
    if (!clickHandler) return;

    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const x = (e.clientX - rect.left) * (BASE_WIDTH / rect.width);
    const y = (e.clientY - rect.top) * (BASE_HEIGHT / rect.height);

    let target: HitTarget | null = null;
    let minDistance = Number.POSITIVE_INFINITY;

    for (const candidate of hitTargetsRef.current) {
      const dx = x - candidate.x;
      const dy = y - candidate.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= candidate.r + 8 && distance < minDistance) {
        target = candidate;
        minDistance = distance;
      }
    }

    if (target) clickHandler(target.id);
  };

  return (
    <div ref={containerRef} className={`w-full ${className}`}>
      <canvas
        ref={canvasRef}
        width={BASE_WIDTH}
        height={BASE_HEIGHT}
        onClick={handleClick}
        className="rounded-xl"
        style={{
          width: '100%',
          height: displayHeight,
          imageRendering: 'pixelated',
          backgroundColor: '#0A1020',
          border: '1px solid rgba(251,220,155,0.35)',
          cursor: onWorkerClick ? 'pointer' : 'default',
        }}
      />
    </div>
  );
}
