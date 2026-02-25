// ============================================================================
// Decorations — Pixel room background/ground renderer (reference-style)
// ============================================================================

import { MAP_OFFSET_X, MAP_OFFSET_Y, getTileCenter, TILE_PX } from '../engine/topdown';

interface ZoneBounds {
  id: string;
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type FloorKind = 'wood' | 'tile_light' | 'tile_blue' | 'lounge' | 'forge' | 'garden';

const NON_SURFACE_ZONE_IDS = new Set(['oracle_stone', 'oracle_chamber', 'gods_plaza', 'propylaea']);

function zoneRect(zone: ZoneBounds): Rect {
  return {
    x: MAP_OFFSET_X + zone.minCol * TILE_PX,
    y: MAP_OFFSET_Y + zone.minRow * TILE_PX,
    w: (zone.maxCol - zone.minCol + 1) * TILE_PX,
    h: (zone.maxRow - zone.minRow + 1) * TILE_PX,
  };
}

function floorKindByZone(zoneId: string): FloorKind {
  if (zoneId === 'celestial_observatory' || zoneId === 'zeus_temple') return 'tile_light';
  if (zoneId.startsWith('sanctuary_') || zoneId === 'athenas_library') return 'tile_blue';
  if (zoneId === 'ambrosia_hall') return 'lounge';
  if (zoneId === 'hephaestus_forge') return 'forge';
  if (zoneId === 'olympus_garden') return 'garden';
  return 'tile_light'; // agora and processional path → marble
}

function fillWoodPattern(ctx: CanvasRenderingContext2D, rect: Rect): void {
  // Base wood color
  ctx.fillStyle = '#7B5530';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  const plankH = 14;
  for (let y = rect.y; y < rect.y + rect.h; y += plankH) {
    const offset = ((y / plankH) % 2) * 12;
    for (let x = rect.x - 14 + offset; x < rect.x + rect.w + 14; x += 20) {
      // Plank color variation
      const n = Math.abs(Math.sin((x * 0.15 + y * 0.09) * 0.19));
      ctx.fillStyle = n > 0.6 ? '#9B6E42' : n > 0.3 ? '#7B5530' : '#8A6238';
      ctx.fillRect(Math.round(x), Math.round(y), 16, plankH - 2);
      // Dark gap between planks
      ctx.fillStyle = '#3A2010';
      ctx.fillRect(Math.round(x), Math.round(y + plankH - 2), 16, 2);
      // Top highlight
      ctx.fillStyle = '#B07848';
      ctx.fillRect(Math.round(x), Math.round(y), 16, 1);
      // Vertical plank edge (right side)
      ctx.fillStyle = '#3A2010';
      ctx.fillRect(Math.round(x) + 16, Math.round(y), 1, plankH - 2);
    }
  }
}

function fillLightTilePattern(ctx: CanvasRenderingContext2D, rect: Rect): void {
  // Cream base tile (break room / lounge style)
  ctx.fillStyle = '#D8D0C4';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  const tile = 16;
  // Alternating tile shade
  for (let ty = rect.y; ty < rect.y + rect.h; ty += tile) {
    for (let tx = rect.x; tx < rect.x + rect.w; tx += tile) {
      const even = (Math.floor((tx - rect.x) / tile) + Math.floor((ty - rect.y) / tile)) % 2 === 0;
      ctx.fillStyle = even ? '#DDD5C8' : '#C8C0B4';
      ctx.fillRect(Math.round(tx), Math.round(ty), tile - 1, tile - 1);
    }
  }
  // Dark grout lines
  ctx.fillStyle = '#A09088';
  for (let x = rect.x; x <= rect.x + rect.w; x += tile) {
    ctx.fillRect(Math.round(x), rect.y, 1, rect.h);
  }
  for (let y = rect.y; y <= rect.y + rect.h; y += tile) {
    ctx.fillRect(rect.x, Math.round(y), rect.w, 1);
  }
}

function fillBlueTilePattern(ctx: CanvasRenderingContext2D, rect: Rect): void {
  // Blue tile — sanctuary / library
  ctx.fillStyle = '#5A7898';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  const tile = 16;
  // Alternating blue tiles
  for (let ty = rect.y; ty < rect.y + rect.h; ty += tile) {
    for (let tx = rect.x; tx < rect.x + rect.w; tx += tile) {
      const even = (Math.floor((tx - rect.x) / tile) + Math.floor((ty - rect.y) / tile)) % 2 === 0;
      ctx.fillStyle = even ? '#6A90B0' : '#507090';
      ctx.fillRect(Math.round(tx), Math.round(ty), tile - 1, tile - 1);
    }
  }
  // Dark grout
  ctx.fillStyle = '#405870';
  for (let x = rect.x; x <= rect.x + rect.w; x += tile) {
    ctx.fillRect(Math.round(x), rect.y, 1, rect.h);
  }
  for (let y = rect.y; y <= rect.y + rect.h; y += tile) {
    ctx.fillRect(rect.x, Math.round(y), rect.w, 1);
  }
  // Subtle Greek key inset
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = '#A0C4E0';
  for (let y = rect.y + 14; y < rect.y + rect.h; y += 34) {
    const cx = Math.round(rect.x + rect.w * 0.5);
    const cy = Math.round(y);
    ctx.fillRect(cx - 4, cy - 4, 9, 1);
    ctx.fillRect(cx - 4, cy + 4, 9, 1);
    ctx.fillRect(cx - 4, cy - 4, 1, 9);
    ctx.fillRect(cx + 4, cy - 4, 1, 9);
  }
  ctx.globalAlpha = 1;
}

function fillLoungePattern(ctx: CanvasRenderingContext2D, rect: Rect): void {
  ctx.fillStyle = '#D5C9B6';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.globalAlpha = 0.16;
  for (let y = rect.y + 8; y < rect.y + rect.h; y += 16) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(rect.x + 8, y, rect.w - 16, 1);
  }
  ctx.globalAlpha = 1;
}

function fillForgePattern(ctx: CanvasRenderingContext2D, rect: Rect): void {
  ctx.fillStyle = '#8F7663';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  for (let y = rect.y + 2; y < rect.y + rect.h; y += 18) {
    ctx.fillStyle = '#7C6657';
    ctx.fillRect(rect.x, y, rect.w, 1);
  }
  for (let i = 0; i < 38; i++) {
    const sx = rect.x + ((i * 31) % Math.max(1, rect.w - 4));
    const sy = rect.y + ((i * 19) % Math.max(1, rect.h - 4));
    ctx.fillStyle = i % 2 === 0 ? '#B98763' : '#6B564A';
    ctx.fillRect(sx, sy, 2, 2);
  }
}

function fillGardenPattern(ctx: CanvasRenderingContext2D, rect: Rect): void {
  ctx.fillStyle = '#90AC76';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  for (let i = 0; i < 42; i++) {
    const sx = rect.x + ((i * 41) % Math.max(1, rect.w - 8));
    const sy = rect.y + ((i * 23) % Math.max(1, rect.h - 8));
    ctx.fillStyle = i % 3 === 0 ? '#7C9967' : '#A4BE8D';
    ctx.fillRect(sx + 1, sy + 1, 6, 4);
    ctx.fillRect(sx + 2, sy, 4, 1);
    ctx.fillRect(sx + 2, sy + 5, 4, 1);
  }
}

function fillFloor(ctx: CanvasRenderingContext2D, rect: Rect, kind: FloorKind): void {
  switch (kind) {
    case 'tile_light':
      fillLightTilePattern(ctx, rect);
      return;
    case 'tile_blue':
      fillBlueTilePattern(ctx, rect);
      return;
    case 'lounge':
      fillLoungePattern(ctx, rect);
      return;
    case 'forge':
      fillForgePattern(ctx, rect);
      return;
    case 'garden':
      fillGardenPattern(ctx, rect);
      return;
    default:
      fillWoodPattern(ctx, rect);
  }
}

function drawRoomFrame(ctx: CanvasRenderingContext2D, rect: Rect): void {
  // Shadow cast to bottom-right.
  ctx.fillStyle = '#00000055';
  ctx.fillRect(rect.x + 3, rect.y + rect.h, rect.w + 2, 4);
  ctx.fillRect(rect.x + rect.w, rect.y + 3, 4, rect.h + 2);

  // Thick dark wall frame.
  ctx.strokeStyle = '#101721';
  ctx.lineWidth = 5;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

  // Inner wall tone + top-left highlight.
  ctx.strokeStyle = '#2A384E';
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x + 2.5, rect.y + 2.5, rect.w - 5, rect.h - 5);
  ctx.fillStyle = '#FFFFFF22';
  ctx.fillRect(rect.x + 3, rect.y + 3, rect.w - 6, 1);
  ctx.fillRect(rect.x + 3, rect.y + 3, 1, rect.h - 6);
}

function drawDoorOpenings(ctx: CanvasRenderingContext2D, mapCols: number, mapRows: number): void {
  const ox = MAP_OFFSET_X;
  const oy = MAP_OFFSET_Y;

  const openings: Array<Rect> = [
    // main vertical corridor doors
    { x: ox + 16 * TILE_PX + 4, y: oy + 8 * TILE_PX + 8, w: TILE_PX - 8, h: 10 },
    { x: ox + 16 * TILE_PX + 4, y: oy + 11 * TILE_PX + 8, w: TILE_PX - 8, h: 10 },
    // lower left connectors
    { x: ox + 8 * TILE_PX + 8, y: oy + 13 * TILE_PX + 4, w: 10, h: TILE_PX - 8 },
    { x: ox + 13 * TILE_PX + 8, y: oy + 13 * TILE_PX + 4, w: 10, h: TILE_PX - 8 },
  ];

  ctx.fillStyle = '#0F1725';
  for (const d of openings) {
    ctx.fillRect(d.x, d.y, d.w, d.h);
    ctx.strokeStyle = '#B4986E';
    ctx.lineWidth = 2;
    ctx.strokeRect(d.x + 0.5, d.y + 0.5, d.w - 1, d.h - 1);
  }

  // outer frame emphasize
  ctx.strokeStyle = '#0A0F1B';
  ctx.lineWidth = 3;
  ctx.strokeRect(ox + 1, oy + 1, mapCols * TILE_PX - 2, mapRows * TILE_PX - 2);
}

export function drawTempleGround(
  ctx: CanvasRenderingContext2D,
  mapCols: number,
  mapRows: number,
  zones: Record<string, ZoneBounds>,
  activeZoneIds: Set<string>,
  dayNightPhase: number,
  tick: number,
): void {
  void dayNightPhase;
  void tick;

  const x = MAP_OFFSET_X;
  const y = MAP_OFFSET_Y;
  const w = mapCols * TILE_PX;
  const h = mapRows * TILE_PX;

  // Deep navy base around rooms (as corridors/wall mass).
  ctx.fillStyle = '#1B2A44';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#172338';
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);

  for (const zone of Object.values(zones)) {
    if (NON_SURFACE_ZONE_IDS.has(zone.id)) continue;
    const rect = zoneRect(zone);
    fillFloor(ctx, rect, floorKindByZone(zone.id));
    drawRoomFrame(ctx, rect);

    if (activeZoneIds.has(zone.id)) {
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#FFF2A8';
      ctx.fillRect(rect.x + 3, rect.y + 3, rect.w - 6, rect.h - 6);
      ctx.globalAlpha = 1;
    }
  }

  drawDoorOpenings(ctx, mapCols, mapRows);
}

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dayNightPhase: number,
  tick?: number,
): void {
  void dayNightPhase;
  void tick;

  const grad = ctx.createLinearGradient(0, 0, width, 0);
  grad.addColorStop(0, '#101A2E');
  grad.addColorStop(0.14, '#1C2D4A');
  grad.addColorStop(0.5, '#213756');
  grad.addColorStop(0.86, '#1C2D4A');
  grad.addColorStop(1, '#101A2E');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Side vignette bars similar to reference framing.
  ctx.fillStyle = '#0C1424';
  ctx.fillRect(0, 0, 34, height);
  ctx.fillRect(width - 34, 0, 34, height);

  ctx.fillStyle = '#2B4265';
  ctx.fillRect(34, 0, 12, height);
  ctx.fillRect(width - 46, 0, 12, height);
}

export function drawZoneLabel(
  ctx: CanvasRenderingContext2D,
  label: string,
  emoji: string,
  col: number,
  row: number,
  alpha: number,
): void {
  const { x, y } = getTileCenter({ col, row });
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  const text = `${emoji} ${label}`;

  const tw = ctx.measureText(text).width;
  const padX = 5;
  const boxW = tw + padX * 2;
  const boxH = 14;
  const textBaseline = y + 4;
  const boxX = Math.round(x - boxW / 2);
  const boxY = Math.round(textBaseline - 10);

  // Dark semi-transparent background
  ctx.fillStyle = 'rgba(8, 14, 26, 0.85)';
  ctx.fillRect(boxX, boxY, Math.ceil(boxW), boxH);

  // Gold border
  ctx.strokeStyle = '#B8860B';
  ctx.lineWidth = 1;
  ctx.strokeRect(boxX + 0.5, boxY + 0.5, Math.ceil(boxW) - 1, boxH - 1);

  // Gold text
  ctx.fillStyle = '#FFD700';
  ctx.fillText(text, x, textBaseline);

  ctx.restore();
}

export function drawNightOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dayNightPhase: number,
  glowSpots?: Array<{ x: number; y: number; color: string }>,
  mapMask?: { mapCols: number; mapRows: number },
): void {
  // Night/day toggle intentionally disabled for fixed reference style map.
  void ctx;
  void width;
  void height;
  void dayNightPhase;
  void glowSpots;
  void mapMask;
}
