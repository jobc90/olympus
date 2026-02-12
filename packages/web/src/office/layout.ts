// ============================================================================
// Office Layout — Map dimensions, furniture placement, floor colors, walk grid
// ============================================================================

import type { FurnitureItem, Zone, ZoneId, TileType } from '../lib/types';
import { buildZoneMap } from './zones';

// ---------------------------------------------------------------------------
// Map Dimensions
// ---------------------------------------------------------------------------

export const MAP_COLS = 24;
export const MAP_ROWS = 20;

// ---------------------------------------------------------------------------
// Floor color helper
// ---------------------------------------------------------------------------

export function getFloorColor(col: number, row: number): string {
  // Checkerboard pattern with zone-based tinting
  const base = (col + row) % 2 === 0 ? '#ECEFF1' : '#E0E0E0';

  // Boss office area — golden marble
  if (col >= 12 && col <= 16 && row >= 1 && row <= 4) {
    return (col + row) % 2 === 0 ? '#FFF8E1' : '#FFE0B2';
  }
  // Meeting room — sky blue marble
  if (col >= 12 && col <= 16 && row >= 6 && row <= 9) {
    return (col + row) % 2 === 0 ? '#E3F2FD' : '#BBDEFB';
  }
  // Break room — warm amber marble
  if (col >= 18 && col <= 22 && row >= 1 && row <= 5) {
    return (col + row) % 2 === 0 ? '#FFF3E0' : '#FFE0B2';
  }
  // Lounge — green marble
  if (col >= 18 && col <= 22 && row >= 12 && row <= 16) {
    return (col + row) % 2 === 0 ? '#E8F5E9' : '#C8E6C9';
  }
  // Server room — purple marble
  if (col >= 18 && col <= 22 && row >= 7 && row <= 10) {
    return (col + row) % 2 === 0 ? '#EDE7F6' : '#D1C4E9';
  }

  return base;
}

// ---------------------------------------------------------------------------
// Furniture layout builder
// ---------------------------------------------------------------------------

export function buildFurnitureLayout(workerCount: number): FurnitureItem[] {
  const items: FurnitureItem[] = [];

  // --- Worker desks (up to 6) ---
  const deskPositions = [
    { col: 3, row: 3 },
    { col: 3, row: 6 },
    { col: 3, row: 9 },
    { col: 7, row: 3 },
    { col: 7, row: 6 },
    { col: 7, row: 9 },
  ];
  const chairPositions = [
    { col: 4, row: 3 },
    { col: 4, row: 6 },
    { col: 4, row: 9 },
    { col: 8, row: 3 },
    { col: 8, row: 6 },
    { col: 8, row: 9 },
  ];

  for (let i = 0; i < Math.min(workerCount, 6); i++) {
    // Alternate: odd-indexed desks are standing desks with dual monitors
    const isStanding = i % 2 === 1;
    items.push({ type: isStanding ? 'standing_desk' : 'desk', ...deskPositions[i] });
    items.push({ type: 'chair', ...chairPositions[i] });
    if (isStanding) {
      items.push({ type: 'dual_monitor', ...deskPositions[i] });
    }
  }

  // --- Boss office (Codex) ---
  items.push({ type: 'big_desk', col: 14, row: 2 });
  items.push({ type: 'chair', col: 14, row: 3 });
  items.push({ type: 'floor_window', col: 13, row: 1 });
  items.push({ type: 'potted_plant', col: 16, row: 1 });

  // --- Meeting room ---
  items.push({ type: 'long_table', col: 14, row: 7 });
  items.push({ type: 'meeting_chair', col: 13, row: 7 });
  items.push({ type: 'meeting_chair', col: 15, row: 7 });
  items.push({ type: 'meeting_chair', col: 14, row: 6 });
  items.push({ type: 'meeting_chair', col: 14, row: 8 });
  items.push({ type: 'whiteboard_obj', col: 16, row: 6 });

  // --- Break room ---
  items.push({ type: 'coffee_machine', col: 20, row: 2 });
  items.push({ type: 'snack_shelf', col: 22, row: 2 });
  items.push({ type: 'water_cooler', col: 20, row: 4 });
  items.push({ type: 'small_table', col: 21, row: 3 });
  items.push({ type: 'round_table', col: 19, row: 4 });

  // --- Whiteboard zone ---
  items.push({ type: 'whiteboard_obj', col: 10, row: 12 });

  // --- Library ---
  items.push({ type: 'bookshelf', col: 10, row: 14 });
  items.push({ type: 'bookshelf', col: 10, row: 16 });
  items.push({ type: 'reading_chair', col: 11, row: 15 });

  // --- Lounge ---
  items.push({ type: 'sofa', col: 20, row: 13 });
  items.push({ type: 'coffee_table', col: 20, row: 14 });
  items.push({ type: 'potted_plant', col: 22, row: 12 });
  items.push({ type: 'carpet', col: 20, row: 14 });
  items.push({ type: 'carpet', col: 21, row: 14 });
  items.push({ type: 'carpet', col: 20, row: 15 });
  items.push({ type: 'carpet', col: 21, row: 15 });

  // --- Server room ---
  items.push({ type: 'server_rack', col: 19, row: 8 });
  items.push({ type: 'server_rack', col: 21, row: 8 });
  items.push({ type: 'server_rack', col: 19, row: 10 });

  // --- Entrance ---
  items.push({ type: 'door_mat', col: 1, row: 18 });
  items.push({ type: 'potted_plant', col: 2, row: 17 });

  // --- Decorations scattered ---
  items.push({ type: 'wall_clock', col: 6, row: 1 });
  items.push({ type: 'poster', col: 10, row: 1 });
  items.push({ type: 'potted_plant', col: 10, row: 3 });
  items.push({ type: 'potted_plant', col: 10, row: 9 });

  // Floor windows along top
  items.push({ type: 'floor_window', col: 3, row: 1 });
  items.push({ type: 'floor_window', col: 7, row: 1 });

  // --- New furniture ---
  items.push({ type: 'arcade_machine', col: 21, row: 13 });   // Lounge zone
  items.push({ type: 'vending_machine', col: 21, row: 2 });    // Break room
  items.push({ type: 'trophy_shelf', col: 16, row: 2 });       // Near boss office
  items.push({ type: 'aquarium', col: 3, row: 16 });           // Near entrance

  return items;
}

// ---------------------------------------------------------------------------
// Walk grid (pathfinding)
// ---------------------------------------------------------------------------

export function createWalkGrid(workerCount: number): TileType[][] {
  const grid: TileType[][] = [];
  for (let r = 0; r < MAP_ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < MAP_COLS; c++) {
      // Outer walls
      if (r === 0 || c === 0 || r === MAP_ROWS - 1 || c === MAP_COLS - 1) {
        grid[r][c] = 'wall';
      } else {
        grid[r][c] = 'floor';
      }
    }
  }

  // Internal walls — boss office partition
  for (let r = 1; r <= 5; r++) {
    grid[r][11] = 'wall';
  }
  grid[5][12] = 'door'; // door into boss office
  grid[5][13] = 'door';

  // Meeting room partition
  for (let c = 12; c <= 16; c++) {
    grid[5][c] = c === 13 ? 'door' : 'wall';
    grid[10][c] = c === 14 ? 'door' : 'wall';
  }
  for (let r = 5; r <= 10; r++) {
    if (r === 7 || r === 8) continue; // door on side
    grid[r][17] = 'wall';
  }

  // Break room partition
  for (let r = 1; r <= 5; r++) {
    grid[r][17] = r === 3 ? 'door' : 'wall';
  }

  // Server room partition
  for (let c = 18; c <= 22; c++) {
    grid[6][c] = c === 20 ? 'door' : 'wall';
    grid[11][c] = c === 20 ? 'door' : 'wall';
  }

  // Lounge partition
  for (let c = 18; c <= 22; c++) {
    grid[11][c] = c === 20 ? 'door' : 'wall';
  }

  // Mark furniture tiles
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
// Zone builder (re-export from zones.ts for convenience)
// ---------------------------------------------------------------------------

export function buildZones(workerCount: number): Record<ZoneId, Zone> {
  return buildZoneMap(workerCount);
}
