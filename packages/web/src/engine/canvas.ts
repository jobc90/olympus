// ============================================================================
// Canvas Rendering Engine - Multi-worker Olympus Mountain scene
// ============================================================================

import type { GridPos } from './isometric';
import { drawIsometricTile, drawIsometricBlock, gridToScreen, TILE_W, TILE_H } from './isometric';
import { drawWalls, drawDividerWall, drawZoneLabel, drawBackground, drawNightOverlay, drawMarbleVeins } from '../sprites/decorations';
import { drawFurniture, drawMonitorScreen, drawRoomba } from '../sprites/furniture';
import { drawWorker, drawCodex, drawGemini, drawNameTag, drawStatusAura, drawUnicorn, drawCupid } from '../sprites/characters';
import { drawBubble, drawParticle } from '../sprites/effects';

// ---------------------------------------------------------------------------
// Types used by the renderer (mirrored from Olympus Mountain layout / behavior)
// ---------------------------------------------------------------------------

export type Direction = 'n' | 's' | 'e' | 'w';

export type CharacterAnim =
  | 'stand'
  | 'walk_frame1'
  | 'walk_frame2'
  | 'sit_typing'
  | 'drink_coffee'
  | 'raise_hand'
  | 'headphones'
  | 'sleep'
  | 'run'
  | 'sit_idle'
  | 'thumbs_up'
  | 'hand_task'
  | 'keyboard_mash'
  | 'stretch'
  | 'celebrate'
  | 'point'
  | 'nod'
  | 'wave';

export type WorkerAvatar = 'athena' | 'poseidon' | 'ares' | 'apollo' | 'artemis' | 'hermes' | 'hephaestus' | 'dionysus' | 'demeter' | 'aphrodite' | 'hera' | 'hades' | 'persephone' | 'prometheus' | 'helios' | 'nike' | 'pan' | 'hecate' | 'iris' | 'heracles' | 'selene';
export type CodexAvatar = 'zeus';
export type GeminiAvatar = 'hera';

export interface Bubble {
  text: string;
  ttl: number;
  x: number;
  y: number;
}

export interface Particle {
  type: 'zzz' | 'sparkle' | 'code' | 'question' | 'check' | 'coffee_steam' | 'smoke' | 'error' | 'lightning' | 'binary' | 'lightbulb' | 'fire' | 'confetti';
  x: number;
  y: number;
  age: number;
  maxAge: number;
}

export interface WorkerRuntime {
  id: string;
  pos: GridPos;
  direction: Direction;
  anim: CharacterAnim;
}

export interface CodexRuntime {
  anim: CharacterAnim;
}

export interface GeminiRuntime {
  behavior: string;
  currentTask: string | null;
  anim: CharacterAnim;
  pos: GridPos;
  direction: Direction;
}

export interface NpcRuntime {
  id: string;
  type: 'unicorn' | 'cupid';
  pos: GridPos;
  direction: Direction;
  path: GridPos[];
  homeZone: string;
}

export interface OlympusMountainState {
  workers: WorkerRuntime[];
  codex: CodexRuntime;
  gemini: GeminiRuntime;
  npcs: NpcRuntime[];
  bubbles: Bubble[];
  particles: Particle[];
  tick: number;
  dayNightPhase: number;
}

export interface WorkerConfig {
  id: string;
  name: string;
  emoji: string;
  color: string;
  avatar: WorkerAvatar;
  behavior?: string;
  skinToneIndex?: number;
}

export interface CodexConfig {
  name: string;
  emoji: string;
  avatar: CodexAvatar;
}

export interface GeminiConfig {
  name: string;
  emoji: string;
  avatar: GeminiAvatar;
}

export interface FurnitureItem {
  type: string;
  col: number;
  row: number;
}

export interface Zone {
  id: string;
  label: string;
  emoji: string;
  center: GridPos;
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
}

// ---------------------------------------------------------------------------
// Layout hooks — these must be provided by the olympus-mountain/layout module
// ---------------------------------------------------------------------------

export interface LayoutProvider {
  MAP_COLS: number;
  MAP_ROWS: number;
  getFloorColor(col: number, row: number): string;
  createWalkGrid(workerCount: number): string[][];
  buildFurnitureLayout(workerCount: number): FurnitureItem[];
  buildZones(workerCount: number): Record<string, Zone>;
}

// ---------------------------------------------------------------------------
// Render config
// ---------------------------------------------------------------------------

interface RenderConfig {
  workers: WorkerConfig[];
  codex: CodexConfig;
  gemini?: GeminiConfig;
  connected: boolean;
  selectedWorkerId?: string | null;
  layout: LayoutProvider;
}

const ACTIVE_WORK_BEHAVIORS = new Set([
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
  'error',
]);

function isInZone(pos: GridPos, zone: Zone): boolean {
  return (
    pos.col >= zone.minCol &&
    pos.col <= zone.maxCol &&
    pos.row >= zone.minRow &&
    pos.row <= zone.maxRow
  );
}

function drawIsoOverlayTile(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  color: string,
  alpha: number,
): void {
  const { x, y } = gridToScreen({ col, row });
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(x, y - TILE_H / 2);
  ctx.lineTo(x + TILE_W / 2, y);
  ctx.lineTo(x, y + TILE_H / 2);
  ctx.lineTo(x - TILE_W / 2, y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function drawFunctionalZoneOverlays(
  ctx: CanvasRenderingContext2D,
  zones: Record<string, Zone>,
  walkGrid: string[][],
  state: OlympusMountainState,
  config: RenderConfig,
): void {
  const activeZoneIds = new Set<string>();
  for (const runtime of state.workers) {
    const workerCfg = config.workers.find((w) => w.id === runtime.id);
    const behavior = workerCfg?.behavior ?? 'idle';
    if (!ACTIVE_WORK_BEHAVIORS.has(behavior)) continue;

    for (const [zoneId, zone] of Object.entries(zones)) {
      if (isInZone(runtime.pos, zone)) {
        activeZoneIds.add(zoneId);
        break;
      }
    }
  }

  for (const [zoneId, zone] of Object.entries(zones)) {
    let color = '#FBC02D';
    let alpha = 0.06;

    if (zoneId.startsWith('sanctuary_')) {
      color = '#6FA8DC';
      alpha = activeZoneIds.has(zoneId) ? 0.2 : 0.1;
    } else if (zoneId === 'gods_plaza' || zoneId === 'ambrosia_hall' || zoneId === 'olympus_garden') {
      color = '#E3C28A';
      alpha = 0.1;
    } else if (zoneId === 'zeus_temple' || zoneId === 'agora') {
      color = '#F2D48C';
      alpha = 0.12;
    }

    for (let row = zone.minRow; row <= zone.maxRow; row++) {
      for (let col = zone.minCol; col <= zone.maxCol; col++) {
        const tile = walkGrid[row]?.[col];
        if (tile === 'wall') continue;
        drawIsoOverlayTile(ctx, col, row, color, alpha);
      }
    }
  }
}

function drawZoneBoundaries(
  ctx: CanvasRenderingContext2D,
  zones: Record<string, Zone>,
  walkGrid: string[][],
): void {
  const zoneColor = (zoneId: string): string => {
    if (zoneId.startsWith('sanctuary_')) return '#7DA6D9';
    if (zoneId === 'zeus_temple') return '#E7BE6D';
    if (zoneId === 'agora') return '#CBAA6B';
    if (zoneId === 'olympus_garden') return '#9CBC8F';
    if (zoneId === 'ambrosia_hall') return '#D8A96B';
    return '#C8B08A';
  };

  for (const [zoneId, zone] of Object.entries(zones)) {
    const border = zoneColor(zoneId);
    for (let row = zone.minRow; row <= zone.maxRow; row++) {
      for (let col = zone.minCol; col <= zone.maxCol; col++) {
        const tile = walkGrid[row]?.[col];
        if (tile === 'wall') continue;
        const inZone = (c: number, r: number): boolean =>
          c >= zone.minCol && c <= zone.maxCol && r >= zone.minRow && r <= zone.maxRow && walkGrid[r]?.[c] !== 'wall';
        const edge =
          !inZone(col - 1, row) ||
          !inZone(col + 1, row) ||
          !inZone(col, row - 1) ||
          !inZone(col, row + 1);
        if (!edge) continue;
        drawIsoOverlayTile(ctx, col, row, border, 0.18);
      }
    }
  }
}

function getCodexPositionByAnim(anim: CharacterAnim, tick: number): GridPos {
  if (anim === 'raise_hand' || anim === 'wave' || anim === 'nod') {
    const patrol = [
      { col: 11, row: 4 },
      { col: 12, row: 4 },
      { col: 13, row: 4 },
      { col: 12, row: 5 },
    ];
    return patrol[Math.floor(tick / 90) % patrol.length];
  }
  if (anim === 'point' || anim === 'hand_task') {
    return { col: 13, row: 4 };
  }
  if (anim === 'sit_typing' || anim === 'keyboard_mash') {
    return { col: 12, row: 2 };
  }
  return { col: 12, row: 3 };
}

function drawSacredRoutes(ctx: CanvasRenderingContext2D, tick: number): void {
  const processionalPath: GridPos[] = [
    { col: 11, row: 18 }, { col: 11, row: 17 }, { col: 12, row: 16 }, { col: 12, row: 15 },
    { col: 11, row: 14 }, { col: 11, row: 13 }, { col: 12, row: 12 }, { col: 12, row: 11 },
    { col: 11, row: 10 }, { col: 11, row: 9 }, { col: 12, row: 8 }, { col: 12, row: 7 },
    { col: 11, row: 6 }, { col: 11, row: 5 }, { col: 12, row: 4 }, { col: 12, row: 3 },
  ];
  for (let i = 0; i < processionalPath.length; i++) {
    const p = processionalPath[i];
    const pulse = 0.05 + (0.03 * ((Math.sin((tick + i * 8) * 0.08) + 1) / 2));
    drawIsoOverlayTile(ctx, p.col, p.row, '#F5C76B', pulse);
  }
}

function drawBrazier(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number, sacred = false): void {
  const base = sacred ? '#D6B171' : '#B18A59';
  const left = sacred ? '#A57A44' : '#8A653C';
  const right = sacred ? '#966A35' : '#75512F';
  drawIsometricBlock(ctx, { col, row }, sacred ? 11 : 9, base, left, right);

  const sp = gridToScreen({ col, row });
  const flameJitter = Math.floor(Math.sin((tick + col * 13 + row * 7) * 0.22) * 2);
  const flameH = sacred ? 16 : 12;
  ctx.fillStyle = '#FFCC68';
  ctx.fillRect(sp.x - 3, sp.y - flameH - 10 + flameJitter, 6, flameH);
  ctx.fillStyle = '#FF7A2F';
  ctx.fillRect(sp.x - 2, sp.y - flameH - 8 + flameJitter, 4, flameH - 4);
  if ((tick + col + row) % 5 !== 0) {
    ctx.fillStyle = '#FFF5B1';
    ctx.fillRect(sp.x - 1, sp.y - flameH - 6 + flameJitter, 2, flameH - 8);
  }
}

function drawIsoDiamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  halfW: number,
  halfH: number,
  fill: string,
  stroke?: string,
): void {
  ctx.beginPath();
  ctx.moveTo(x, y - halfH);
  ctx.lineTo(x + halfW, y);
  ctx.lineTo(x, y + halfH);
  ctx.lineTo(x - halfW, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawTempleColumn(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  height: number,
  tick: number,
): void {
  const sp = gridToScreen({ col, row });

  // Stepped base (stylobate + plinth)
  drawIsometricBlock(ctx, { col, row }, 8, '#DCC6A1', '#B89D79', '#A98A64');
  drawIsometricBlock(ctx, { col, row }, 12, '#E7D4B3', '#C6AB84', '#B6946D');

  const shaftTopY = sp.y - height + 14;
  const shaftBottomY = sp.y - 10;
  const shaftHalfWTop = 9;
  const shaftHalfWBottom = 11;
  const shaftHalfH = 4;

  const top = {
    n: { x: sp.x, y: shaftTopY - shaftHalfH },
    e: { x: sp.x + shaftHalfWTop, y: shaftTopY },
    s: { x: sp.x, y: shaftTopY + shaftHalfH },
    w: { x: sp.x - shaftHalfWTop, y: shaftTopY },
  };
  const bottom = {
    n: { x: sp.x, y: shaftBottomY - shaftHalfH },
    e: { x: sp.x + shaftHalfWBottom, y: shaftBottomY },
    s: { x: sp.x, y: shaftBottomY + shaftHalfH },
    w: { x: sp.x - shaftHalfWBottom, y: shaftBottomY },
  };

  // Shaft faces
  ctx.beginPath();
  ctx.moveTo(top.w.x, top.w.y);
  ctx.lineTo(top.s.x, top.s.y);
  ctx.lineTo(bottom.s.x, bottom.s.y);
  ctx.lineTo(bottom.w.x, bottom.w.y);
  ctx.closePath();
  ctx.fillStyle = '#D6BE97';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(top.s.x, top.s.y);
  ctx.lineTo(top.e.x, top.e.y);
  ctx.lineTo(bottom.e.x, bottom.e.y);
  ctx.lineTo(bottom.s.x, bottom.s.y);
  ctx.closePath();
  ctx.fillStyle = '#C4A57D';
  ctx.fill();

  // Soft back face hint
  ctx.beginPath();
  ctx.moveTo(top.n.x, top.n.y);
  ctx.lineTo(top.e.x, top.e.y);
  ctx.lineTo(bottom.e.x, bottom.e.y);
  ctx.lineTo(bottom.n.x, bottom.n.y);
  ctx.closePath();
  ctx.fillStyle = 'rgba(112, 88, 58, 0.25)';
  ctx.fill();

  // Fluting lines (vertical grooves)
  ctx.strokeStyle = 'rgba(243, 233, 214, 0.42)';
  ctx.lineWidth = 1;
  for (let i = -3; i <= 3; i++) {
    const t = i / 3;
    const x = sp.x + t * 6.5 + (t > 0 ? 1.2 : -1.2);
    ctx.beginPath();
    ctx.moveTo(x, shaftTopY + 1);
    ctx.lineTo(x, shaftBottomY + 1);
    ctx.stroke();
  }

  // Bottom ring (torus)
  drawIsoDiamond(ctx, sp.x, shaftBottomY + 2, 13, 5, '#D8C09A', '#9F815B');
  // Capital (echinus + abacus)
  drawIsoDiamond(ctx, sp.x, shaftTopY - 2, 13, 5, '#EAD8B7', '#A98B63');
  drawIsoDiamond(ctx, sp.x, shaftTopY - 8, 16, 6, '#F1E4C8', '#B19673');
  ctx.fillStyle = '#F7EED8';
  ctx.fillRect(sp.x - 8, shaftTopY - 15, 16, 3);

  // Sacred trim accent (subtle pulse)
  const pulse = 0.42 + 0.22 * ((Math.sin((tick + col * 9 + row * 7) * 0.08) + 1) / 2);
  ctx.fillStyle = `rgba(241, 204, 118, ${pulse.toFixed(3)})`;
  ctx.fillRect(sp.x - 7, shaftTopY - 11, 14, 2);
}

function drawTempleSetPieces(
  ctx: CanvasRenderingContext2D,
  drawables: Array<{ depth: number; draw: () => void }>,
  tick: number,
): void {
  const outerColumns: Array<{ col: number; row: number; h: number }> = [
    { col: 14, row: 2, h: 30 },
    { col: 16, row: 2, h: 30 },
    { col: 18, row: 2, h: 30 },
    { col: 20, row: 2, h: 30 },
    { col: 14, row: 4, h: 26 },
    { col: 20, row: 4, h: 26 },
  ];

  for (const c of outerColumns) {
    drawables.push({
      depth: c.col + c.row - 0.6,
      draw: () => {
        drawTempleColumn(ctx, c.col, c.row, c.h, tick);
      },
    });
  }

  const braziers: Array<{ col: number; row: number; sacred?: boolean }> = [
    { col: 15, row: 5, sacred: true },
    { col: 19, row: 5, sacred: true },
    { col: 13, row: 11 },
    { col: 21, row: 11 },
    { col: 13, row: 17 },
    { col: 21, row: 17 },
    { col: 6, row: 13 },
    { col: 8, row: 4 },
  ];
  for (const b of braziers) {
    drawables.push({
      depth: b.col + b.row - 0.2,
      draw: () => drawBrazier(ctx, b.col, b.row, tick, !!b.sacred),
    });
  }
}

function drawWorkerBehaviorProp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  behavior: string | undefined,
  tick: number,
  _color: string,
): void {
  if (!behavior) return;

  const px = (ox: number, oy: number, w: number, h: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x + ox, y + oy, w, h);
  };
  const iconX = -2;
  const iconY = -28;
  const p = (gx: number, gy: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x + iconX + gx, y + iconY + gy, 1, 1);
  };

  // Minimal shadow-only marker (no occluding boxes)
  px(iconX - 1, iconY + 6, 8, 1, 'rgba(10, 14, 24, 0.42)');

  if (behavior === 'working' || behavior === 'analyzing' || behavior === 'reviewing') {
    p(1, 1, '#66E0FF'); p(2, 1, '#66E0FF'); p(3, 1, '#66E0FF');
    p(0, 2, '#3FA7D6'); p(1, 2, '#3FA7D6'); p(2, 2, '#3FA7D6'); p(3, 2, '#3FA7D6'); p(4, 2, '#3FA7D6');
    p(1, 3, '#5BC0EB'); p(2, 3, '#5BC0EB'); p(3, 3, '#5BC0EB');
    return;
  }
  if (behavior === 'deploying') {
    p(2, 0, '#FFD180'); p(1, 1, '#FF8F3A'); p(2, 1, '#FFB74D'); p(3, 1, '#FF8F3A');
    p(2, 2, '#FFE082'); p(2, 3, '#FF6D00');
    return;
  }
  if (behavior === 'thinking') {
    const blink = (tick % 24) < 18;
    p(2, 0, blink ? '#FFE082' : '#C8A94E');
    p(1, 1, '#FFD54F'); p(2, 1, '#FFD54F'); p(3, 1, '#FFD54F');
    p(2, 2, '#FFD54F');
    p(2, 4, '#FFD54F');
    return;
  }
  if (behavior === 'chatting' || behavior === 'collaborating' || behavior === 'meeting' || behavior === 'directing') {
    p(0, 1, '#D7B8FF'); p(1, 1, '#D7B8FF'); p(2, 1, '#D7B8FF'); p(3, 1, '#D7B8FF'); p(4, 1, '#D7B8FF');
    p(0, 2, '#C7A3F4'); p(4, 2, '#C7A3F4');
    p(2, 3, '#C7A3F4');
    return;
  }
  if (behavior === 'resting' || behavior === 'idle') {
    p(1, 1, '#EAD9BB'); p(2, 1, '#EAD9BB'); p(3, 1, '#EAD9BB');
    p(1, 2, '#C7AA7F'); p(2, 2, '#C7AA7F'); p(3, 2, '#C7AA7F');
    p(4, 1, '#B79468');
    return;
  }
  if (behavior === 'error') {
    const blink = (tick % 20) < 10;
    p(2, 0, blink ? '#FF6B6B' : '#8E1D1D');
    p(2, 1, blink ? '#FF4E4E' : '#8E1D1D');
    p(2, 2, blink ? '#FF4E4E' : '#8E1D1D');
    p(2, 4, blink ? '#FFB6B6' : '#6D1C1C');
    return;
  }
  if (behavior === 'offline') {
    p(0, 1, '#95A3B6'); p(1, 1, '#95A3B6'); p(2, 1, '#95A3B6'); p(3, 1, '#95A3B6'); p(4, 1, '#95A3B6');
    p(1, 2, '#C7D2E2'); p(2, 2, '#C7D2E2'); p(3, 2, '#C7D2E2');
    return;
  }
  if (behavior === 'starting') {
    p(2, 0, '#7DDB84'); p(1, 1, '#A2E7A8'); p(2, 1, '#7DDB84'); p(3, 1, '#A2E7A8');
    p(2, 2, '#7DDB84'); p(2, 3, '#7DDB84');
  }
}

function drawSelectedWorkerHighlight(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tick: number,
  accentColor: string,
): void {
  const pulse = 0.5 + 0.5 * Math.sin(tick * 0.18);
  const left = Math.round(x - 16 - pulse * 1.5);
  const top = Math.round(y - 55 - pulse * 1.2);
  const width = Math.round(32 + pulse * 3);
  const height = Math.round(44 + pulse * 2);

  ctx.save();

  // Dark border base (high contrast on any tile)
  ctx.globalAlpha = 0.96;
  ctx.strokeStyle = 'rgba(6, 10, 20, 0.95)';
  ctx.lineWidth = 4;
  ctx.strokeRect(left - 1, top - 1, width + 2, height + 2);

  // Gold outer stroke
  ctx.globalAlpha = 0.92;
  ctx.strokeStyle = '#FFE082';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(left, top, width, height);

  // Accent inner stroke (worker color)
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(left + 2, top + 2, width - 4, height - 4);

  // Corner pixels for stronger "selected" feedback
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#FFF3C1';
  ctx.fillRect(left - 2, top - 2, 6, 2);
  ctx.fillRect(left - 2, top - 2, 2, 6);
  ctx.fillRect(left + width - 2, top - 2, 6, 2);
  ctx.fillRect(left + width + 2, top - 2, 2, 6);
  ctx.fillRect(left - 2, top + height + 2, 6, 2);
  ctx.fillRect(left - 2, top + height - 2, 2, 6);
  ctx.fillRect(left + width - 2, top + height + 2, 6, 2);
  ctx.fillRect(left + width + 2, top + height - 2, 2, 6);

  // Beacon above head
  const beaconY = top - 12 - pulse * 2;
  ctx.fillStyle = 'rgba(6, 10, 20, 0.95)';
  ctx.beginPath();
  ctx.moveTo(x, beaconY - 2);
  ctx.lineTo(x - 6, beaconY + 8);
  ctx.lineTo(x + 6, beaconY + 8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#FFE082';
  ctx.beginPath();
  ctx.moveTo(x, beaconY);
  ctx.lineTo(x - 4, beaconY + 6);
  ctx.lineTo(x + 4, beaconY + 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = accentColor;
  ctx.fillRect(x - 1, beaconY + 2, 2, 2);

  ctx.restore();
}


// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: OlympusMountainState,
  config: RenderConfig,
): void {
  ctx.clearRect(0, 0, width, height);

  const workerCount = config.workers.length;
  const layout = config.layout;
  const zones = layout.buildZones(workerCount);

  drawBackground(ctx, width, height, state.dayNightPhase, state.tick);
  drawWalls(ctx, layout.MAP_COLS, layout.MAP_ROWS);

  const walkGrid = layout.createWalkGrid(workerCount);

  for (let row = 0; row < layout.MAP_ROWS; row++) {
    for (let col = 0; col < layout.MAP_COLS; col++) {
      const tile = walkGrid[row]?.[col];
      if (tile === 'wall') {
        if (row > 0 && row < layout.MAP_ROWS - 1 && col > 0 && col < layout.MAP_COLS - 1) {
          drawDividerWall(ctx, col, row);
        }
        continue;
      }
      const color = layout.getFloorColor(col, row);
      drawIsometricTile(ctx, { col, row }, color, '#B0956E40');
      drawMarbleVeins(ctx, col, row);
    }
  }

  drawFunctionalZoneOverlays(ctx, zones, walkGrid, state, config);
  drawZoneBoundaries(ctx, zones, walkGrid);
  drawSacredRoutes(ctx, state.tick);

  interface Drawable {
    depth: number;
    draw: () => void;
  }
  const drawables: Drawable[] = [];
  drawTempleSetPieces(ctx, drawables, state.tick);

  const furniture = layout.buildFurnitureLayout(workerCount);
  for (const item of furniture) {
    drawables.push({
      depth: item.row + item.col,
      draw: () => drawFurniture(ctx, item.type, item.col, item.row, state.tick),
    });
  }

  // Sanctuary positions for monitor screen state overlay
  const deskPositions = [
    { col: 17, row: 11 }, { col: 17, row: 14 }, { col: 17, row: 17 },
    { col: 21, row: 11 }, { col: 21, row: 14 }, { col: 21, row: 17 },
  ];

  for (let i = 0; i < config.workers.length && i < deskPositions.length; i++) {
    const workerCfg = config.workers[i];
    const deskPos = deskPositions[i];
    if (workerCfg.behavior) {
      const behaviorToScreen: Record<string, string> = {
        working: 'working', deploying: 'working', reviewing: 'working',
        error: 'error',
        idle: 'idle', offline: 'idle', resting: 'idle',
        thinking: 'thinking', analyzing: 'thinking', starting: 'thinking',
      };
      const screenState = behaviorToScreen[workerCfg.behavior];
      if (screenState) {
        drawables.push({
          depth: deskPos.row + deskPos.col + 0.1,
          draw: () => {
            const sp = gridToScreen(deskPos);
            drawMonitorScreen(ctx, sp.x, sp.y, state.tick, screenState);
          },
        });
      }
    }
  }

  for (const runtime of state.workers) {
    const workerCfg = config.workers.find(w => w.id === runtime.id);
    if (!workerCfg) continue;
    drawables.push({
      depth: runtime.pos.row + runtime.pos.col,
      draw: () => {
        const sp = gridToScreen(runtime.pos);
        if (workerCfg.behavior) {
          drawStatusAura(ctx, sp.x, sp.y, workerCfg.behavior, state.tick);
        }
        drawWorker(
          ctx, sp.x, sp.y,
          runtime.anim,
          runtime.direction,
          state.tick,
          workerCfg.avatar,
          workerCfg.color,
          workerCfg.emoji,
          workerCfg.skinToneIndex,
        );
        drawWorkerBehaviorProp(ctx, sp.x, sp.y, workerCfg.behavior, state.tick, workerCfg.color);
        if (config.selectedWorkerId === workerCfg.id) {
          drawNameTag(ctx, sp.x, sp.y + 2, workerCfg.name, workerCfg.color);
        }
      },
    });
  }

  // NPCs (Unicorn, Cupid)
  for (const npc of state.npcs) {
    drawables.push({
      depth: npc.pos.row + npc.pos.col,
      draw: () => {
        const sp = gridToScreen(npc.pos);
        if (npc.type === 'unicorn') {
          drawUnicorn(ctx, sp.x, sp.y, npc.direction, state.tick);
        } else if (npc.type === 'cupid') {
          drawCupid(ctx, sp.x, sp.y, npc.direction, state.tick);
        }
      },
    });
  }

  // Roomba pet — moves on a deterministic path based on tick
  const roombaPath = [
    { col: 5, row: 12 }, { col: 6, row: 12 }, { col: 7, row: 12 },
    { col: 8, row: 13 }, { col: 8, row: 14 }, { col: 7, row: 15 },
    { col: 6, row: 16 }, { col: 5, row: 16 }, { col: 4, row: 15 },
    { col: 4, row: 14 }, { col: 4, row: 13 }, { col: 5, row: 12 },
  ];
  const roombaIdx = Math.floor(state.tick / 60) % roombaPath.length;
  const roombaPos = roombaPath[roombaIdx];
  drawables.push({
    depth: roombaPos.row + roombaPos.col,
    draw: () => {
      const sp = gridToScreen(roombaPos);
      drawRoomba(ctx, sp.x, sp.y, state.tick);
    },
  });

  const codexPos = getCodexPositionByAnim(state.codex.anim, state.tick);
  drawables.push({
    depth: codexPos.row + codexPos.col,
    draw: () => {
      const sp = gridToScreen(codexPos);
      drawCodex(
        ctx, sp.x, sp.y,
        state.codex.anim,
        state.tick,
        config.codex.avatar,
        config.codex.emoji,
      );
      if (config.selectedWorkerId === 'codex') {
        drawNameTag(ctx, sp.x, sp.y + 2, config.codex.name, '#FFD700');
      }
    },
  });

  // Gemini (Hera) — positioned dynamically
  if (config.gemini && state.gemini && state.gemini.pos) {
    const geminiPos = state.gemini.pos;
    drawables.push({
      depth: geminiPos.row + geminiPos.col,
      draw: () => {
        const sp = gridToScreen(geminiPos);
        drawGemini(
          ctx, sp.x, sp.y,
          state.gemini.anim,
          state.tick,
          config.gemini!.avatar,
          config.gemini!.emoji,
        );
        if (config.selectedWorkerId === 'gemini') {
          drawNameTag(ctx, sp.x, sp.y + 2, config.gemini!.name, '#9C27B0');
        }
      },
    });
  }

  drawables.sort((a, b) => a.depth - b.depth);
  for (const d of drawables) d.draw();

  // Reduce visual clutter: only show selected worker's sanctuary label.
  if (config.selectedWorkerId) {
    for (const zone of Object.values(zones)) {
      if (!zone.id.startsWith('sanctuary_')) continue;
      const idx = parseInt(zone.id.replace('sanctuary_', ''), 10);
      const workerCfg = config.workers[idx];
      if (workerCfg?.id !== config.selectedWorkerId) continue;
      drawZoneLabel(ctx, `${workerCfg.name}'s Sanctuary`, workerCfg.emoji, zone.center.col, zone.center.row, 0.46);
      break;
    }
  }

  for (const particle of state.particles) drawParticle(ctx, particle);
  for (const bubble of state.bubbles) drawBubble(ctx, bubble);

  // Collect glow spots from monitors/servers for night overlay
  const glowSpots: Array<{ x: number; y: number; color: string }> = [];
  if (state.dayNightPhase > 0.5) {
    for (const item of furniture) {
      if (item.type === 'monitor' || item.type === 'dual_monitor' || item.type === 'desk' || item.type === 'standing_desk') {
        const sp = gridToScreen({ col: item.col, row: item.row });
        glowSpots.push({ x: sp.x, y: sp.y - 20, color: '#4FC3F7' });
      } else if (item.type === 'server_rack') {
        const sp = gridToScreen({ col: item.col, row: item.row });
        glowSpots.push({ x: sp.x, y: sp.y - 20, color: '#4CAF50' });
      } else if (item.type === 'arcade_machine') {
        const sp = gridToScreen({ col: item.col, row: item.row });
        glowSpots.push({ x: sp.x, y: sp.y - 24, color: '#FF1744' });
      }
    }
  }
  drawNightOverlay(ctx, width, height, state.dayNightPhase, glowSpots, {
    mapCols: layout.MAP_COLS,
    mapRows: layout.MAP_ROWS,
  });

  // Title
  ctx.save();
  ctx.font = 'bold 14px monospace';
  ctx.fillStyle = state.dayNightPhase > 0.5 ? '#FFD700' : '#DAA520';
  ctx.textAlign = 'left';
  ctx.fillText('\u26F0\uFE0F Mount Olympus', 16, 24);
  ctx.restore();

  // Connection status
  ctx.save();
  ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  if (config.connected) {
    ctx.fillStyle = '#4CAF50';
    ctx.fillText('Connected', width - 16, 24);
  } else {
    ctx.fillStyle = '#F44336';
    ctx.fillText('Disconnected', width - 16, 24);
  }
  ctx.restore();

  // Selected worker highlight (top-most overlay to keep beacon always visible)
  if (config.selectedWorkerId) {
    const selectedRuntime = state.workers.find((w) => w.id === config.selectedWorkerId);
    const selectedCfg = config.workers.find((w) => w.id === config.selectedWorkerId);
    if (selectedRuntime) {
      const sp = gridToScreen(selectedRuntime.pos);
      drawSelectedWorkerHighlight(ctx, sp.x, sp.y, state.tick, selectedCfg?.color ?? '#4FC3F7');
    }
  }
}
