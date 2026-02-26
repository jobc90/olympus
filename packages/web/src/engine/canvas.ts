// ============================================================================
// Canvas Rendering Engine — Top-Down Olympus Mountain scene
// ============================================================================

import type { GridPos } from './topdown';
import { gridToScreen, getFootPos, TILE_PX, MAP_OFFSET_X, MAP_OFFSET_Y, depthOf } from './topdown';
import { drawBackground, drawTempleGround, drawZoneLabel } from '../sprites/decorations';
import { drawFurniture, drawRoomba } from '../sprites/furniture';
import { drawMapWorkerCharacter, drawNameTag, drawStatusAura, drawUnicorn, drawCupid } from '../sprites/characters';
import { drawBubble, drawParticle } from '../sprites/effects';

// ---------------------------------------------------------------------------
// Types used by the renderer
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

export type WorkerAvatar = 'athena' | 'poseidon' | 'ares' | 'apollo' | 'artemis' | 'hermes' | 'hephaestus' | 'dionysus' | 'demeter' | 'aphrodite' | 'hera' | 'hades' | 'persephone' | 'prometheus' | 'helios' | 'nike' | 'pan' | 'hecate' | 'iris' | 'heracles' | 'selene' | 'hestia' | 'eros' | 'gaia' | 'nyx';
export type CodexAvatar = 'zeus';
export type GeminiAvatar = 'hera';
const ALWAYS_LABELED_ZONE_IDS = new Set([
  'zeus_temple',
  'agora',
  'olympus_garden',
  'celestial_observatory',
  'ambrosia_hall',
  'athenas_library',
  'hephaestus_forge',
]);

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

// ---------------------------------------------------------------------------
// Active behavior check
// ---------------------------------------------------------------------------

const ACTIVE_WORK_BEHAVIORS = new Set([
  'working', 'thinking', 'reviewing', 'deploying', 'collaborating',
  'chatting', 'analyzing', 'directing', 'meeting', 'starting', 'error',
]);
const NON_VISUAL_ZONE_IDS = new Set(['oracle_stone', 'oracle_chamber', 'gods_plaza']);

// ---------------------------------------------------------------------------
// Codex (Zeus) position in top-down grid
// ---------------------------------------------------------------------------

function getCodexPos(anim: CharacterAnim, tick: number): GridPos {
  if (anim === 'raise_hand' || anim === 'wave' || anim === 'nod') {
    const patrol = [
      { col: 15, row: 2 }, { col: 16, row: 2 }, { col: 16, row: 3 }, { col: 15, row: 3 },
    ];
    return patrol[Math.floor(tick / 90) % patrol.length];
  }
  if (anim === 'point' || anim === 'hand_task') return { col: 17, row: 2 };
  if (anim === 'sit_typing' || anim === 'keyboard_mash') return { col: 16, row: 2 };
  return { col: 16, row: 2 }; // Zeus throne
}

// ---------------------------------------------------------------------------
// Zone overlay tinting
// ---------------------------------------------------------------------------

function collectActiveZoneIds(
  zones: Record<string, Zone>,
  state: OlympusMountainState,
  config: RenderConfig,
): Set<string> {
  const activeZoneIds = new Set<string>();
  for (const runtime of state.workers) {
    const workerCfg = config.workers.find((w) => w.id === runtime.id);
    if (!workerCfg || !ACTIVE_WORK_BEHAVIORS.has(workerCfg.behavior ?? '')) continue;
    for (const [zoneId, zone] of Object.entries(zones)) {
      if (
        runtime.pos.col >= zone.minCol && runtime.pos.col <= zone.maxCol &&
        runtime.pos.row >= zone.minRow && runtime.pos.row <= zone.maxRow
      ) {
        activeZoneIds.add(zoneId);
        break;
      }
    }
  }
  return activeZoneIds;
}

function drawZoneOverlays(
  ctx: CanvasRenderingContext2D,
  zones: Record<string, Zone>,
  activeZoneIds: Set<string>,
): void {
  for (const [zoneId, zone] of Object.entries(zones)) {
    if (NON_VISUAL_ZONE_IDS.has(zoneId)) continue;
    const isActive = activeZoneIds.has(zoneId);
    let color = '#FBC02D';
    let alpha = isActive ? 0.18 : 0.0;
    let lineWidth = isActive ? 3 : 1;

    if (zoneId.startsWith('sanctuary_')) {
      color = '#6EB0E8';
      alpha = isActive ? 0.22 : 0.04;
      lineWidth = isActive ? 3 : 1.5;
    } else if (zoneId === 'zeus_temple') {
      color = '#E0BB63';
    } else if (zoneId === 'agora') {
      color = '#C39B70';
    } else if (zoneId === 'hephaestus_forge') {
      color = '#D77544';
      alpha = isActive ? 0.25 : 0.03;
    } else if (zoneId === 'celestial_observatory') {
      color = '#9487C7';
    } else if (zoneId === 'olympus_garden') {
      color = '#7BA66B';
    }

    ctx.save();
    const x = MAP_OFFSET_X + zone.minCol * TILE_PX;
    const y = MAP_OFFSET_Y + zone.minRow * TILE_PX;
    const w = (zone.maxCol - zone.minCol + 1) * TILE_PX;
    const h = (zone.maxRow - zone.minRow + 1) * TILE_PX;
    if (alpha > 0) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
      ctx.globalAlpha = isActive ? 0.1 : 0.02;
      ctx.fillStyle = color;
      ctx.fillRect(x + 5, y + 5, w - 10, h - 10);
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Selected worker highlight
// ---------------------------------------------------------------------------

function drawSelectedHighlight(
  ctx: CanvasRenderingContext2D,
  footX: number,
  footY: number,
  tick: number,
  accentColor: string,
): void {
  // sprite dims: 45×90 (64×128 upscaled canvas × 0.7 display scale)
  const sw = 45;
  const sh = 90;
  const sx = Math.round(footX - sw / 2);
  const sy = Math.round(footY - sh);
  const pulse = 0.5 + 0.5 * Math.sin(tick * 0.18);

  ctx.save();
  // Dark border base
  ctx.globalAlpha = 0.96;
  ctx.strokeStyle = 'rgba(6, 10, 20, 0.95)';
  ctx.lineWidth = 4;
  ctx.strokeRect(sx - 3, sy - 3, sw + 6, sh + 6);

  // Gold outer stroke
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = '#FFE082';
  ctx.lineWidth = 2;
  ctx.strokeRect(sx - 1, sy - 1, sw + 2, sh + 2);

  // Accent inner stroke
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(sx + 1, sy + 1, sw - 2, sh - 2);

  // Corner pixels
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#FFF3C1';
  const corners = [
    [sx - 3, sy - 3], [sx + sw - 1, sy - 3],
    [sx - 3, sy + sh - 1], [sx + sw - 1, sy + sh - 1],
  ];
  for (const [cx, cy] of corners) {
    ctx.fillRect(cx, cy, 4, 2);
    ctx.fillRect(cx, cy, 2, 4);
  }

  // Beacon arrow above head
  const beaconY = sy - 14 - pulse * 3;
  ctx.fillStyle = 'rgba(6, 10, 20, 0.95)';
  ctx.beginPath();
  ctx.moveTo(footX, beaconY - 2);
  ctx.lineTo(footX - 7, beaconY + 8);
  ctx.lineTo(footX + 7, beaconY + 8);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#FFE082';
  ctx.beginPath();
  ctx.moveTo(footX, beaconY);
  ctx.lineTo(footX - 5, beaconY + 6);
  ctx.lineTo(footX + 5, beaconY + 6);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = accentColor;
  ctx.fillRect(footX - 1, beaconY + 2, 2, 2);

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
  const activeZoneIds = collectActiveZoneIds(zones, state, config);

  // 1. Background sky
  drawBackground(ctx, width, height, state.dayNightPhase, state.tick);

  // 2. Zone-based temple floor (non-tiled)
  drawTempleGround(ctx, layout.MAP_COLS, layout.MAP_ROWS, zones, activeZoneIds, state.dayNightPhase, state.tick);

  // 3. Zone tint overlays
  drawZoneOverlays(ctx, zones, activeZoneIds);

  // 4. Collect all Z-sorted drawables (furniture + characters + NPCs)
  interface Drawable {
    depth: number;
    draw: () => void;
  }
  const drawables: Drawable[] = [];

  // Furniture
  const furniture = layout.buildFurnitureLayout(workerCount);
  for (const item of furniture) {
    drawables.push({
      depth: depthOf(item.col, item.row),
      draw: () => {
        drawFurniture(ctx, item.type, item.col, item.row, state.tick);
      },
    });
  }

  // Monitor screen overlays removed — no longer using desk/monitor furniture
  const deskPositions: Array<{ col: number; row: number }> = [];
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
        const capturedDeskPos = { ...deskPos };
        const capturedScreenState = screenState;
        drawables.push({
          depth: depthOf(deskPos.col, deskPos.row) + 0.001,
          draw: () => {
            const sp = gridToScreen(capturedDeskPos);
            const cx = sp.x + TILE_PX / 2;
            const cy = sp.y + TILE_PX / 2;
            drawMonitorScreenOverlay(ctx, cx, cy, state.tick, capturedScreenState);
          },
        });
      }
    }
  }

  // Workers
  for (const runtime of state.workers) {
    const workerCfg = config.workers.find((w) => w.id === runtime.id);
    if (!workerCfg) continue;
    const capturedRuntime = { ...runtime };
    const capturedCfg = { ...workerCfg };
    drawables.push({
      depth: depthOf(runtime.pos.col, runtime.pos.row) + 0.5,
      draw: () => {
        const foot = getFootPos(capturedRuntime.pos);
        drawStatusAura(ctx, foot.x, foot.y, capturedCfg.behavior ?? '', state.tick);
        drawMapWorkerCharacter(ctx, foot.x, foot.y, capturedCfg.avatar, state.tick, capturedRuntime.anim === 'walk_frame1' || capturedRuntime.anim === 'walk_frame2', capturedRuntime.direction);
        if (config.selectedWorkerId === capturedCfg.id) {
          drawNameTag(ctx, foot.x, foot.y, capturedCfg.name, capturedCfg.color);
        }
      },
    });
  }

  // NPCs (unicorn, cupid)
  for (const npc of state.npcs) {
    const capturedNpc = { ...npc };
    drawables.push({
      depth: depthOf(npc.pos.col, npc.pos.row) + 0.5,
      draw: () => {
        const foot = getFootPos(capturedNpc.pos);
        if (capturedNpc.type === 'unicorn') {
          drawUnicorn(ctx, foot.x, foot.y, capturedNpc.direction, state.tick);
        } else {
          drawCupid(ctx, foot.x, foot.y, capturedNpc.direction, state.tick);
        }
      },
    });
  }

  // Roomba (Pegasus) — wanders in the agora
  const roombaPath = [
    { col: 4, row: 6 }, { col: 5, row: 6 }, { col: 6, row: 7 },
    { col: 7, row: 8 }, { col: 7, row: 9 }, { col: 6, row: 10 },
    { col: 5, row: 11 }, { col: 4, row: 11 }, { col: 3, row: 10 },
    { col: 3, row: 9 }, { col: 3, row: 8 }, { col: 4, row: 6 },
  ];
  const roombaIdx = Math.floor(state.tick / 60) % roombaPath.length;
  const roombaPos = roombaPath[roombaIdx];
  drawables.push({
    depth: depthOf(roombaPos.col, roombaPos.row) + 0.5,
    draw: () => {
      const foot = getFootPos(roombaPos);
      drawRoomba(ctx, foot.x, foot.y, state.tick);
    },
  });

  // Codex (Zeus)
  const codexPos = getCodexPos(state.codex.anim, state.tick);
  drawables.push({
    depth: depthOf(codexPos.col, codexPos.row) + 0.5,
    draw: () => {
      const foot = getFootPos(codexPos);
      drawMapWorkerCharacter(ctx, foot.x, foot.y, 'zeus', state.tick, state.codex.anim === 'walk_frame1' || state.codex.anim === 'walk_frame2');
      if (config.selectedWorkerId === 'codex') {
        drawNameTag(ctx, foot.x, foot.y, config.codex.name, '#FFD700');
      }
    },
  });

  // Gemini (Hera) — agora area
  if (config.gemini && state.gemini && state.gemini.pos) {
    const geminiPos = state.gemini.pos;
    const capturedGeminiPos = { ...geminiPos };
    const capturedGeminiAnim = state.gemini.anim;
    const capturedGeminiDir = state.gemini.direction;
    drawables.push({
      depth: depthOf(geminiPos.col, geminiPos.row) + 0.5,
      draw: () => {
        const foot = getFootPos(capturedGeminiPos);
        drawMapWorkerCharacter(ctx, foot.x, foot.y, 'hera', state.tick, capturedGeminiAnim === 'walk_frame1' || capturedGeminiAnim === 'walk_frame2', capturedGeminiDir);
        if (config.selectedWorkerId === 'gemini') {
          drawNameTag(ctx, foot.x, foot.y, config.gemini!.name, '#9C27B0');
        }
      },
    });
  }

  // No background NPCs — only configured workers appear on the map.

  // Sort by depth (painter's algorithm — lower row draws first)
  drawables.sort((a, b) => a.depth - b.depth);
  for (const d of drawables) d.draw();

  // Always show all major zone labels prominently.
  for (const zone of Object.values(zones)) {
    if (!ALWAYS_LABELED_ZONE_IDS.has(zone.id)) continue;
    drawZoneLabel(ctx, zone.label, zone.emoji, zone.center.col, zone.center.row, 1.0);
  }

  // Sanctuary area: single combined label at block center
  {
    let shrineLabel = 'Sanctuaries';
    let shrineEmoji = '🏛️';
    if (config.selectedWorkerId) {
      for (const zone of Object.values(zones)) {
        if (!zone.id.startsWith('sanctuary_')) continue;
        const idx = parseInt(zone.id.replace('sanctuary_', ''), 10);
        const workerCfg = config.workers[idx];
        if (workerCfg?.id === config.selectedWorkerId) {
          shrineLabel = `${workerCfg.name}'s Shrine`;
          shrineEmoji = workerCfg.emoji;
          break;
        }
      }
    }
    // Center of the sanctuary block (cols 17-32, rows 13-17)
    drawZoneLabel(ctx, shrineLabel, shrineEmoji, 25, 15, 1.0);
  }

  // Particles + bubbles
  for (const particle of state.particles) drawParticle(ctx, particle);
  for (const bubble of state.bubbles) drawBubble(ctx, bubble);

  // Day/night visual toggles are intentionally disabled.

  // Title bar
  ctx.save();
  ctx.font = 'bold 13px monospace';
  ctx.fillStyle = '#DAA520';
  ctx.textAlign = 'left';
  ctx.fillText('\u26F0\uFE0F Mount Olympus', 12, 22);
  ctx.restore();

  // Connection status
  ctx.save();
  ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = config.connected ? '#4CAF50' : '#F44336';
  ctx.fillText(config.connected ? 'Connected' : 'Disconnected', width - 12, 22);
  ctx.restore();

  // Selected worker highlight — drawn last (always on top)
  if (config.selectedWorkerId) {
    const selectedRuntime = state.workers.find((w) => w.id === config.selectedWorkerId);
    const selectedCfg = config.workers.find((w) => w.id === config.selectedWorkerId);
    if (selectedRuntime) {
      const foot = getFootPos(selectedRuntime.pos);
      drawSelectedHighlight(ctx, foot.x, foot.y, state.tick, selectedCfg?.color ?? '#4FC3F7');
    }
  }
}

// ---------------------------------------------------------------------------
// Inline monitor screen overlay (top-down view — drawn on desk surface)
// ---------------------------------------------------------------------------

function drawMonitorScreenOverlay(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  tick: number,
  state: string,
): void {
  const sw = 12;
  const sh = 8;
  const sx = cx - sw / 2;
  const sy = cy - TILE_PX / 2 - sh;

  switch (state) {
    case 'working': {
      ctx.fillStyle = '#2F2A20';
      ctx.fillRect(sx, sy, sw, sh);
      ctx.fillStyle = '#F2D675';
      for (let i = 0; i < 3; i++) {
        const w = 3 + ((tick + i * 5) % 6);
        ctx.fillRect(sx + 1, sy + 1 + i * 2, w, 1);
      }
      break;
    }
    case 'error': {
      ctx.fillStyle = tick % 20 < 10 ? '#B71C1C' : '#3A0000';
      ctx.fillRect(sx, sy, sw, sh);
      break;
    }
    case 'idle': {
      ctx.fillStyle = '#3C3323';
      ctx.fillRect(sx, sy, sw, sh);
      const bx = sx + 2 + Math.abs(Math.sin(tick * 0.05)) * (sw - 4);
      ctx.fillStyle = '#D4AF37';
      ctx.fillRect(Math.round(bx), sy + 3, 2, 2);
      break;
    }
    case 'thinking': {
      ctx.fillStyle = '#2E2A1F';
      ctx.fillRect(sx, sy, sw, sh);
      for (let i = 0; i < 3; i++) {
        const alpha = ((tick * 0.08 + i * 0.8) % 2) < 1 ? 1 : 0.3;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#F2D675';
        ctx.fillRect(sx + 2 + i * 3, sy + 3, 2, 2);
      }
      ctx.globalAlpha = 1;
      break;
    }
    default:
      break;
  }
}
