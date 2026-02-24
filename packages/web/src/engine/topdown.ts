// ============================================================================
// Top-Down Coordinate System — pixel-agents inspired (TILE_SIZE=16, ZOOM=2)
// ============================================================================

/** Base tile size in source pixels (matches pixel-agents sprite grid) */
export const TILE_SIZE = 16;

/** Integer zoom multiplier — MUST stay integer to prevent pixel blurring */
export const ZOOM = 2;

/** Rendered tile size on screen in CSS pixels */
export const TILE_PX = TILE_SIZE * ZOOM; // 32px

/** Map canvas offset — centers 34×19 map (1088×608) inside 1100×620 canvas */
export const MAP_OFFSET_X = 6;
export const MAP_OFFSET_Y = 6;

// Re-export GridPos/ScreenPos shapes (same interface as isometric.ts for drop-in compat)
export interface GridPos {
  col: number;
  row: number;
}

export interface ScreenPos {
  x: number;
  y: number;
}

/**
 * Convert grid position to the top-left corner of its screen tile.
 * In top-down: (col, row) → (offsetX + col*32, offsetY + row*32)
 */
export function gridToScreen(pos: GridPos): ScreenPos {
  return {
    x: MAP_OFFSET_X + pos.col * TILE_PX,
    y: MAP_OFFSET_Y + pos.row * TILE_PX,
  };
}

/**
 * Convert screen pixel position to grid tile coordinates.
 */
export function screenToGrid(screen: ScreenPos): GridPos {
  return {
    col: Math.floor((screen.x - MAP_OFFSET_X) / TILE_PX),
    row: Math.floor((screen.y - MAP_OFFSET_Y) / TILE_PX),
  };
}

/**
 * Draw a single floor tile at grid position.
 * @param color          primary fill color
 * @param borderColor    optional thin grid line color
 */
export function drawFloorTile(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  color: string,
  borderColor?: string,
): void {
  const x = MAP_OFFSET_X + col * TILE_PX;
  const y = MAP_OFFSET_Y + row * TILE_PX;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, TILE_PX, TILE_PX);
  if (borderColor) {
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x + 0.5, y + 0.5, TILE_PX - 1, TILE_PX - 1);
  }
}

/**
 * Get the screen-space foot position (bottom-center of tile) for a character.
 * Characters in top-down stand on their tile — feet at the bottom edge of the tile.
 */
export function getFootPos(pos: GridPos): ScreenPos {
  return {
    x: MAP_OFFSET_X + pos.col * TILE_PX + TILE_PX / 2,
    y: MAP_OFFSET_Y + pos.row * TILE_PX + TILE_PX,
  };
}

/**
 * Get the screen-space center of a tile.
 */
export function getTileCenter(pos: GridPos): ScreenPos {
  return {
    x: MAP_OFFSET_X + pos.col * TILE_PX + TILE_PX / 2,
    y: MAP_OFFSET_Y + pos.row * TILE_PX + TILE_PX / 2,
  };
}

/**
 * Draw Z-sorted depth value for a grid position.
 * Higher row = rendered later (appears in front).
 * Fractional col added as tiebreaker.
 */
export function depthOf(col: number, row: number): number {
  return row + col * 0.0001;
}
