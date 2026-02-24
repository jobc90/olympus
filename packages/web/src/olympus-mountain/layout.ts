// ============================================================================
// Olympus Mountain Layout — Top-down map (34×19 tiles, TILE_PX=32)
// ============================================================================

import type { FurnitureItem, Zone, ZoneId, TileType } from '../lib/types';
import { buildZoneMap } from './zones';

// ---------------------------------------------------------------------------
// Map Dimensions
// ---------------------------------------------------------------------------

export const MAP_COLS = 34;
export const MAP_ROWS = 19;

// ---------------------------------------------------------------------------
// Floor color per tile — flat zone palette (non checkerboard)
// ---------------------------------------------------------------------------

export function getFloorColor(col: number, row: number): string {
  if (col === 0 || col === MAP_COLS - 1 || row === 0 || row === MAP_ROWS - 1) return '#2A2118';
  if ((col === 11 || col === 21) && row >= 1 && row <= 4) return '#7A6242';
  if (col === 22 && row >= 5 && row <= 13) return '#6A7690';
  if (row === 13 && col >= 1 && col <= 15) return '#7A6242';
  if (col === 10 && row >= 13 && row <= 17) return '#7A6242';
  if ((row === 8 || row === 11) && ((col >= 17 && col <= 21) || (col >= 23 && col <= 32))) return '#7A87A4';
  if (col === 16 && row >= 4 && row <= 17) return '#D4AF69';

  if (col >= 1 && col <= 10 && row >= 1 && row <= 4) return '#D5E8BB'; // garden
  if (col >= 12 && col <= 20 && row >= 1 && row <= 4) return '#F4E6C7'; // zeus temple
  if (col >= 22 && col <= 32 && row >= 1 && row <= 4) return '#D9D5EE'; // observatory
  if (col >= 1 && col <= 15 && row >= 5 && row <= 12) return '#E6D8C2'; // agora
  if (((col >= 17 && col <= 21) || (col >= 23 && col <= 32)) && row >= 5 && row <= 13) return '#D0E1F2'; // sanctuaries
  if (col >= 1 && col <= 9 && row >= 13 && row <= 17) return '#EBD7C3'; // ambrosia
  if (col >= 11 && col <= 15 && row >= 13 && row <= 17) return '#CFDCEF'; // library
  if (col >= 17 && col <= 32 && row >= 14 && row <= 17) return '#E0C4A8'; // forge
  return '#DED1C0';
}

// ---------------------------------------------------------------------------
// Furniture layout builder (top-down coordinates)
// ---------------------------------------------------------------------------

export function buildFurnitureLayout(workerCount: number): FurnitureItem[] {
  const items: FurnitureItem[] = [];

  // ── Top-left room (green room) ────────────────────────────────────────
  items.push({ type: 'bookshelf', col: 3, row: 1 });
  items.push({ type: 'bookshelf', col: 7, row: 1 });
  items.push({ type: 'potted_plant', col: 2, row: 3 });
  items.push({ type: 'potted_plant', col: 8, row: 3 });
  items.push({ type: 'whiteboard_obj', col: 5, row: 2 });
  items.push({ type: 'round_table', col: 7, row: 2 });

  // ── Top-center room (lead desk) ───────────────────────────────────────
  items.push({ type: 'big_desk', col: 16, row: 2 });
  items.push({ type: 'chair', col: 16, row: 3 });
  items.push({ type: 'bookshelf', col: 12, row: 2 });
  items.push({ type: 'bookshelf', col: 20, row: 2 });
  items.push({ type: 'poster', col: 14, row: 1 });
  items.push({ type: 'poster', col: 18, row: 1 });

  // ── Top-right room (kitchen-like) ─────────────────────────────────────
  items.push({ type: 'vending_machine', col: 23, row: 2 });
  items.push({ type: 'water_cooler', col: 24, row: 2 });
  items.push({ type: 'snack_shelf', col: 31, row: 2 });
  items.push({ type: 'small_table', col: 29, row: 2 });
  items.push({ type: 'floor_window', col: 26, row: 2 });
  items.push({ type: 'floor_window', col: 28, row: 2 });
  items.push({ type: 'floor_window', col: 30, row: 2 });
  items.push({ type: 'round_table', col: 24, row: 3 });
  items.push({ type: 'round_table', col: 30, row: 3 });
  items.push({ type: 'wall_clock', col: 27, row: 1 });

  // ── Main office hall (left-center) ────────────────────────────────────
  items.push({ type: 'long_table', col: 5, row: 7 });
  items.push({ type: 'long_table', col: 11, row: 7 });
  items.push({ type: 'long_table', col: 5, row: 10 });
  items.push({ type: 'long_table', col: 11, row: 10 });
  items.push({ type: 'meeting_chair', col: 4, row: 8 });
  items.push({ type: 'meeting_chair', col: 6, row: 8 });
  items.push({ type: 'meeting_chair', col: 10, row: 8 });
  items.push({ type: 'meeting_chair', col: 12, row: 8 });
  items.push({ type: 'meeting_chair', col: 4, row: 11 });
  items.push({ type: 'meeting_chair', col: 6, row: 11 });
  items.push({ type: 'meeting_chair', col: 10, row: 11 });
  items.push({ type: 'meeting_chair', col: 12, row: 11 });
  items.push({ type: 'monitor', col: 4, row: 7 });
  items.push({ type: 'monitor', col: 10, row: 7 });
  items.push({ type: 'monitor', col: 4, row: 10 });
  items.push({ type: 'monitor', col: 10, row: 10 });
  items.push({ type: 'bookshelf', col: 2, row: 5 });
  items.push({ type: 'bookshelf', col: 14, row: 5 });
  items.push({ type: 'potted_plant', col: 2, row: 12 });
  items.push({ type: 'potted_plant', col: 14, row: 12 });
  items.push({ type: 'whiteboard_obj', col: 15, row: 8 });

  // ── Worker sanctuaries (right stacked rooms) ──────────────────────────
  const sanctuaryDesks: Array<{ col: number; row: number }> = [
    { col: 19, row: 6 },
    { col: 19, row: 9 },
    { col: 19, row: 12 },
    { col: 27, row: 6 },
    { col: 27, row: 9 },
    { col: 27, row: 12 },
  ];
  const sanctuaryChairs: Array<{ col: number; row: number }> = [
    { col: 19, row: 7 },
    { col: 19, row: 10 },
    { col: 19, row: 13 },
    { col: 27, row: 7 },
    { col: 27, row: 10 },
    { col: 27, row: 13 },
  ];

  for (let i = 0; i < Math.min(workerCount, 6); i++) {
    const desk = sanctuaryDesks[i];
    const chair = sanctuaryChairs[i];
    items.push({ type: i % 2 === 0 ? 'desk' : 'standing_desk', col: desk.col, row: desk.row });
    items.push({ type: i % 2 === 0 ? 'monitor' : 'dual_monitor', col: desk.col - 1, row: desk.row });
    items.push({ type: 'chair', col: chair.col, row: chair.row });
  }

  items.push({ type: 'bookshelf', col: 24, row: 6 });
  items.push({ type: 'bookshelf', col: 24, row: 9 });
  items.push({ type: 'bookshelf', col: 24, row: 12 });
  items.push({ type: 'bookshelf', col: 31, row: 6 });
  items.push({ type: 'bookshelf', col: 31, row: 9 });
  items.push({ type: 'bookshelf', col: 31, row: 12 });

  // ── Bottom-left lounge ────────────────────────────────────────────────
  items.push({ type: 'sofa', col: 3, row: 15 });
  items.push({ type: 'sofa', col: 6, row: 15 });
  items.push({ type: 'coffee_table', col: 3, row: 16 });
  items.push({ type: 'coffee_table', col: 6, row: 16 });
  items.push({ type: 'snack_shelf', col: 2, row: 17 });
  items.push({ type: 'snack_shelf', col: 8, row: 17 });
  items.push({ type: 'coffee_machine', col: 2, row: 14 });
  items.push({ type: 'water_cooler', col: 8, row: 14 });
  items.push({ type: 'potted_plant', col: 4, row: 17 });

  // ── Bottom-center archive ─────────────────────────────────────────────
  items.push({ type: 'bookshelf', col: 11, row: 14 });
  items.push({ type: 'bookshelf', col: 12, row: 14 });
  items.push({ type: 'bookshelf', col: 14, row: 14 });
  items.push({ type: 'bookshelf', col: 15, row: 14 });
  items.push({ type: 'reading_chair', col: 13, row: 16 });
  items.push({ type: 'small_table', col: 12, row: 16 });

  // ── Bottom-right ops/forge room ───────────────────────────────────────
  items.push({ type: 'server_rack', col: 18, row: 15 });
  items.push({ type: 'server_rack', col: 20, row: 15 });
  items.push({ type: 'server_rack', col: 22, row: 15 });
  items.push({ type: 'server_rack', col: 24, row: 15 });
  items.push({ type: 'server_rack', col: 26, row: 15 });
  items.push({ type: 'arcade_machine', col: 28, row: 15 });
  items.push({ type: 'vending_machine', col: 30, row: 16 });
  items.push({ type: 'vending_machine', col: 31, row: 16 });
  items.push({ type: 'trophy_shelf', col: 32, row: 15 });
  items.push({ type: 'poster', col: 29, row: 14 });
  items.push({ type: 'poster', col: 24, row: 14 });

  return items;
}

// ---------------------------------------------------------------------------
// Walk grid (pathfinding) — top-down
// ---------------------------------------------------------------------------

export function createWalkGrid(workerCount: number): TileType[][] {
  const grid: TileType[][] = [];
  for (let r = 0; r < MAP_ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < MAP_COLS; c++) {
      // Border tiles are walls
      if (r === 0 || c === 0 || r === MAP_ROWS - 1 || c === MAP_COLS - 1) {
        grid[r][c] = 'wall';
      }
      // Column dividers between upper zones
      else if ((c === 11 || c === 21) && r >= 1 && r <= 4) {
        grid[r][c] = 'wall';
      }
      // Divider between agora and lower tier
      else if (r === 13 && c >= 1 && c <= 15) {
        grid[r][c] = 'wall';
      }
      // Divider between ambrosia and library
      else if (c === 10 && r >= 13 && r <= 17) {
        grid[r][c] = 'wall';
      }
      // Separator between sanctuary cols A and B
      else if (c === 22 && r >= 5 && r <= 13) {
        grid[r][c] = 'wall';
      }
      // Sanctuary row dividers
      else if ((r === 8 || r === 11) && (c >= 17 && c <= 21 || c >= 23 && c <= 32)) {
        grid[r][c] = 'wall';
      }
      else {
        grid[r][c] = 'floor';
      }
    }
  }

  // Open processional gates
  if (grid[8]?.[16]) grid[8][16] = 'door';  // processional path at row 8
  if (grid[11]?.[16]) grid[11][16] = 'door'; // processional path at row 11
  if (grid[13]?.[8]) grid[13][8] = 'door';   // agora→ambrosia gate
  if (grid[13]?.[13]) grid[13][13] = 'door'; // agora→library gate

  // Mark furniture tiles as blocked
  const furniture = buildFurnitureLayout(workerCount);
  for (const item of furniture) {
    if (item.type !== 'carpet' && item.type !== 'door_mat') {
      if (grid[item.row]?.[item.col] === 'floor') {
        grid[item.row][item.col] = 'furniture';
      }
    }
  }

  return grid;
}

// ---------------------------------------------------------------------------
// Zone builder (re-export)
// ---------------------------------------------------------------------------

export function buildZones(workerCount: number): Record<ZoneId, Zone> {
  return buildZoneMap(workerCount);
}
