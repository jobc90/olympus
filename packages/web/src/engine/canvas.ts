// ============================================================================
// Canvas Rendering Engine - Multi-worker Olympus Mountain scene
// ============================================================================

import type { GridPos } from './isometric';
import { drawIsometricTile, gridToScreen } from './isometric';
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
  demoMode: boolean;
  layout: LayoutProvider;
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

  interface Drawable {
    depth: number;
    draw: () => void;
  }
  const drawables: Drawable[] = [];

  const furniture = layout.buildFurnitureLayout(workerCount);
  for (const item of furniture) {
    drawables.push({
      depth: item.row + item.col,
      draw: () => drawFurniture(ctx, item.type, item.col, item.row, state.tick),
    });
  }

  // Sanctuary positions for monitor screen state overlay
  const deskPositions = [
    { col: 14, row: 12 }, { col: 14, row: 15 }, { col: 14, row: 18 },
    { col: 20, row: 12 }, { col: 20, row: 15 }, { col: 20, row: 18 },
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
        drawNameTag(ctx, sp.x, sp.y + 2, workerCfg.name, workerCfg.color);
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

  const codexPos = { col: 17, row: 3 };
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
      drawNameTag(ctx, sp.x, sp.y + 2, config.codex.name, '#FFD700');
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
        drawNameTag(ctx, sp.x, sp.y + 2, config.gemini!.name, '#9C27B0');
      },
    });
  }

  drawables.sort((a, b) => a.depth - b.depth);
  for (const d of drawables) d.draw();

  const zones = layout.buildZones(workerCount);
  for (const zone of Object.values(zones)) {
    if (zone.id.startsWith('sanctuary_')) {
      const idx = parseInt(zone.id.replace('sanctuary_', ''), 10);
      const workerCfg = config.workers[idx];
      if (workerCfg) {
        drawZoneLabel(ctx, `${workerCfg.name}'s Sanctuary`, workerCfg.emoji, zone.center.col, zone.center.row, 0.5);
        continue;
      }
    }
    drawZoneLabel(ctx, zone.label, zone.emoji, zone.center.col, zone.center.row, 0.5);
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
  drawNightOverlay(ctx, width, height, state.dayNightPhase, glowSpots);

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
  } else if (config.demoMode) {
    ctx.fillStyle = '#FF9800';
    ctx.fillText('Demo Mode', width - 16, 24);
  } else {
    ctx.fillStyle = '#F44336';
    ctx.fillText('Disconnected', width - 16, 24);
  }
  ctx.restore();
}
