// ============================================================================
// Isometric Coordinate System
// ============================================================================

export interface GridPos {
  col: number;
  row: number;
}

export interface ScreenPos {
  x: number;
  y: number;
}

export const TILE_W = 40;
export const TILE_H = 20;
export const MAP_OFFSET_X = 500;
export const MAP_OFFSET_Y = 90;

function shadeHex(hex: string, delta: number): string {
  if (!hex.startsWith('#') || (hex.length !== 7 && hex.length !== 4)) {
    return hex;
  }
  const normalized = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
  const n = parseInt(normalized.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 0xff) + delta));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + delta));
  const b = Math.max(0, Math.min(255, (n & 0xff) + delta));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function gridToScreen(pos: GridPos): ScreenPos {
  return {
    x: MAP_OFFSET_X + (pos.col - pos.row) * (TILE_W / 2),
    y: MAP_OFFSET_Y + (pos.col + pos.row) * (TILE_H / 2),
  };
}

export function screenToGrid(screen: ScreenPos): GridPos {
  const sx = screen.x - MAP_OFFSET_X;
  const sy = screen.y - MAP_OFFSET_Y;
  return {
    col: Math.round((sx / (TILE_W / 2) + sy / (TILE_H / 2)) / 2),
    row: Math.round((sy / (TILE_H / 2) - sx / (TILE_W / 2)) / 2),
  };
}

export function drawIsometricTile(
  ctx: CanvasRenderingContext2D,
  pos: GridPos,
  fillColor: string,
  strokeColor?: string,
): void {
  const { x, y } = gridToScreen(pos);
  const north = { x, y: y - TILE_H / 2 };
  const east = { x: x + TILE_W / 2, y };
  const south = { x, y: y + TILE_H / 2 };
  const west = { x: x - TILE_W / 2, y };

  // Base fill
  ctx.beginPath();
  ctx.moveTo(north.x, north.y);
  ctx.lineTo(east.x, east.y);
  ctx.lineTo(south.x, south.y);
  ctx.lineTo(west.x, west.y);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();

  // Pixel-style bevel shading (gives pseudo 3D floor depth)
  ctx.beginPath();
  ctx.moveTo(north.x, north.y);
  ctx.lineTo(south.x, south.y);
  ctx.lineTo(west.x, west.y);
  ctx.closePath();
  ctx.fillStyle = shadeHex(fillColor, -12);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(north.x, north.y);
  ctx.lineTo(east.x, east.y);
  ctx.lineTo(south.x, south.y);
  ctx.closePath();
  ctx.fillStyle = shadeHex(fillColor, 8);
  ctx.fill();

  // Top rim highlight
  ctx.strokeStyle = shadeHex(fillColor, 24);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(west.x + 1, west.y);
  ctx.lineTo(north.x, north.y + 1);
  ctx.lineTo(east.x - 1, east.y);
  ctx.stroke();

  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(north.x, north.y);
    ctx.lineTo(east.x, east.y);
    ctx.lineTo(south.x, south.y);
    ctx.lineTo(west.x, west.y);
    ctx.closePath();
    ctx.stroke();
  }
}

export function drawIsometricBlock(
  ctx: CanvasRenderingContext2D,
  pos: GridPos,
  height: number,
  topColor: string,
  leftColor: string,
  rightColor: string,
): void {
  const { x, y } = gridToScreen(pos);
  const h = height;

  ctx.beginPath();
  ctx.moveTo(x, y - TILE_H / 2 - h);
  ctx.lineTo(x + TILE_W / 2, y - h);
  ctx.lineTo(x, y + TILE_H / 2 - h);
  ctx.lineTo(x - TILE_W / 2, y - h);
  ctx.closePath();
  ctx.fillStyle = topColor;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x - TILE_W / 2, y - h);
  ctx.lineTo(x, y + TILE_H / 2 - h);
  ctx.lineTo(x, y + TILE_H / 2);
  ctx.lineTo(x - TILE_W / 2, y);
  ctx.closePath();
  ctx.fillStyle = leftColor;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x + TILE_W / 2, y - h);
  ctx.lineTo(x, y + TILE_H / 2 - h);
  ctx.lineTo(x, y + TILE_H / 2);
  ctx.lineTo(x + TILE_W / 2, y);
  ctx.closePath();
  ctx.fillStyle = rightColor;
  ctx.fill();

  // Crisp pixel-like edge accents
  ctx.strokeStyle = shadeHex(topColor, 22);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - TILE_W / 2 + 1, y - h);
  ctx.lineTo(x, y - TILE_H / 2 - h + 1);
  ctx.lineTo(x + TILE_W / 2 - 1, y - h);
  ctx.stroke();

  ctx.strokeStyle = shadeHex(leftColor, -16);
  ctx.beginPath();
  ctx.moveTo(x - TILE_W / 2, y - h);
  ctx.lineTo(x, y + TILE_H / 2 - h);
  ctx.lineTo(x, y + TILE_H / 2);
  ctx.stroke();

  ctx.strokeStyle = shadeHex(rightColor, -20);
  ctx.beginPath();
  ctx.moveTo(x + TILE_W / 2, y - h);
  ctx.lineTo(x, y + TILE_H / 2 - h);
  ctx.lineTo(x, y + TILE_H / 2);
  ctx.stroke();
}
