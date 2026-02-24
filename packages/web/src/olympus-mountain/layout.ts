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
// Floor color per tile — zone-based checkerboard
// ---------------------------------------------------------------------------

export function getFloorColor(col: number, row: number): string {
  // Border tiles → dark wall
  if (col === 0 || col === MAP_COLS - 1 || row === 0 || row === MAP_ROWS - 1) {
    return '#1A1F2E';
  }

  // Processional path (col 16, rows 5-17)
  if (col === 16 && row >= 5 && row <= 17) {
    const parity = (col + row) % 2 === 0;
    return parity ? '#F9D48A' : '#C49830';
  }

  // ── Upper tier ────────────────────────────────────────────────────────
  // Column divider walls at 11 and 21
  if ((col === 11 || col === 21) && row >= 1 && row <= 4) return '#1A1F2E';

  // Olympus Garden (cols 1-10, rows 1-4)
  if (col >= 1 && col <= 10 && row >= 1 && row <= 4) {
    const parity = (col + row) % 2 === 0;
    return parity ? '#C8E6A0' : '#5A8C38';
  }

  // Zeus Temple (cols 12-20, rows 1-4)
  if (col >= 12 && col <= 20 && row >= 1 && row <= 4) {
    const parity = (col + row) % 2 === 0;
    return parity ? '#FFF8E1' : '#D4A820';
  }

  // Celestial Observatory (cols 22-32, rows 1-4)
  if (col >= 22 && col <= 32 && row >= 1 && row <= 4) {
    const parity = (col + row) % 2 === 0;
    return parity ? '#EDE0FF' : '#7A55CC';
  }

  // ── Horizontal divider between upper and middle (row 5 top boundary)
  if (row === 5) {
    // Sanctuary cols have no wall at row 5 (open)
    // Agora cols open at row 5 too
    // Just treat it as zone floor (fall through below)
  }

  // ── Middle tier ───────────────────────────────────────────────────────
  // Vertical divider between Agora and Sanctuaries at col 16 (processional path handled above)
  // We also add a thin wall col at 22 between sanctuary cols A and B
  if (col === 22 && row >= 5 && row <= 13) {
    const parity = (col + row) % 2 === 0;
    return parity ? '#2A3050' : '#1A1F2E';
  }

  // Agora (cols 1-15, rows 5-12)
  if (col >= 1 && col <= 15 && row >= 5 && row <= 12) {
    const parity = (col + row) % 2 === 0;
    return parity ? '#EEE0CC' : '#A07848';
  }

  // Sanctuary sub-zones (cols 17-21, rows 5-13)
  if (col >= 17 && col <= 21 && row >= 5 && row <= 13) {
    // Divider rows between sanctuary sub-zones
    if (row === 8 || row === 11) {
      const parity = (col + row) % 2 === 0;
      return parity ? '#3A4060' : '#2A3050';
    }
    const parity = (col + row) % 2 === 0;
    return parity ? '#D8EEFF' : '#5A8AC0';
  }

  // Sanctuary sub-zones (cols 23-32, rows 5-13)
  if (col >= 23 && col <= 32 && row >= 5 && row <= 13) {
    if (row === 8 || row === 11) {
      const parity = (col + row) % 2 === 0;
      return parity ? '#3A4060' : '#2A3050';
    }
    const parity = (col + row) % 2 === 0;
    return parity ? '#C8E0F8' : '#4A7AAE';
  }

  // ── Lower tier horizontal divider at row 13 (between agora and ambrosia)
  if (row === 13 && col >= 1 && col <= 15) {
    return '#1A1F2E'; // wall
  }

  // Vertical divider between ambrosia and library (col 10)
  if (col === 10 && row >= 13 && row <= 17) {
    return '#1A1F2E';
  }

  // ── Lower tier ────────────────────────────────────────────────────────
  // Ambrosia Hall (cols 1-9, rows 13-17)
  if (col >= 1 && col <= 9 && row >= 14 && row <= 17) {
    const parity = (col + row) % 2 === 0;
    return parity ? '#F8DFC0' : '#C07840';
  }

  // Athena's Library / Oracle (cols 11-15, rows 14-17)
  if (col >= 11 && col <= 15 && row >= 14 && row <= 17) {
    const parity = (col + row) % 2 === 0;
    return parity ? '#D8E8FF' : '#5070A8';
  }

  // Hephaestus Forge (cols 17-32, rows 14-17)
  if (col >= 17 && col <= 32 && row >= 14 && row <= 17) {
    const parity = (col + row) % 2 === 0;
    return parity ? '#FFD8B0' : '#B85828';
  }

  // Default floor (generic marble)
  const parity = (col + row) % 2 === 0;
  return parity ? '#DDCFC0' : '#AA9080';
}

// ---------------------------------------------------------------------------
// Furniture layout builder (top-down coordinates)
// ---------------------------------------------------------------------------

export function buildFurnitureLayout(workerCount: number): FurnitureItem[] {
  const items: FurnitureItem[] = [];

  // ── Zeus Temple (cols 12-20, rows 1-4) ──────────────────────────────
  items.push({ type: 'big_desk', col: 16, row: 2 });
  items.push({ type: 'chair', col: 16, row: 3 });
  items.push({ type: 'altar', col: 14, row: 1 });
  items.push({ type: 'altar', col: 18, row: 1 });
  items.push({ type: 'god_statue', col: 12, row: 1 });
  items.push({ type: 'god_statue', col: 20, row: 1 });
  items.push({ type: 'sacred_brazier', col: 13, row: 3 });
  items.push({ type: 'sacred_brazier', col: 19, row: 3 });
  items.push({ type: 'temple_column', col: 12, row: 2 });
  items.push({ type: 'temple_column', col: 20, row: 2 });

  // ── Olympus Garden (cols 1-10, rows 1-4) ────────────────────────────
  items.push({ type: 'potted_plant', col: 2, row: 1 });
  items.push({ type: 'potted_plant', col: 4, row: 2 });
  items.push({ type: 'potted_plant', col: 7, row: 3 });
  items.push({ type: 'potted_plant', col: 9, row: 1 });
  items.push({ type: 'aquarium', col: 3, row: 3 });
  items.push({ type: 'altar', col: 6, row: 2 });
  items.push({ type: 'marble_column', col: 1, row: 2 });
  items.push({ type: 'marble_column', col: 10, row: 3 });

  // ── Celestial Observatory (cols 22-32, rows 1-4) ─────────────────────
  items.push({ type: 'floor_window', col: 25, row: 2 });
  items.push({ type: 'floor_window', col: 29, row: 1 });
  items.push({ type: 'round_table', col: 24, row: 3 });
  items.push({ type: 'round_table', col: 30, row: 3 });
  items.push({ type: 'marble_column', col: 22, row: 1 });
  items.push({ type: 'marble_column', col: 32, row: 1 });
  items.push({ type: 'wall_clock', col: 27, row: 2 });
  items.push({ type: 'poster', col: 31, row: 2 });

  // ── Agora (cols 1-15, rows 5-12) ─────────────────────────────────────
  items.push({ type: 'long_table', col: 8, row: 8 });
  items.push({ type: 'meeting_chair', col: 6, row: 8 });
  items.push({ type: 'meeting_chair', col: 10, row: 8 });
  items.push({ type: 'meeting_chair', col: 8, row: 7 });
  items.push({ type: 'meeting_chair', col: 8, row: 9 });
  items.push({ type: 'marble_column', col: 3, row: 6 });
  items.push({ type: 'marble_column', col: 13, row: 6 });
  items.push({ type: 'marble_column', col: 3, row: 11 });
  items.push({ type: 'marble_column', col: 13, row: 11 });
  items.push({ type: 'god_statue', col: 8, row: 5 });
  items.push({ type: 'whiteboard_obj', col: 15, row: 9 });
  items.push({ type: 'carpet', col: 8, row: 8 });

  // ── Ambrosia Hall (cols 1-9, rows 14-17) ─────────────────────────────
  items.push({ type: 'coffee_machine', col: 2, row: 14 });
  items.push({ type: 'sofa', col: 6, row: 15 });
  items.push({ type: 'coffee_table', col: 6, row: 16 });
  items.push({ type: 'water_cooler', col: 8, row: 14 });
  items.push({ type: 'snack_shelf', col: 1, row: 16 });
  items.push({ type: 'potted_plant', col: 4, row: 17 });

  // ── Athena's Library (cols 11-15, rows 14-17) ─────────────────────────
  items.push({ type: 'bookshelf', col: 12, row: 14 });
  items.push({ type: 'bookshelf', col: 14, row: 14 });
  items.push({ type: 'reading_chair', col: 13, row: 16 });
  items.push({ type: 'small_table', col: 11, row: 15 });

  // ── Hephaestus Forge (cols 17-32, rows 14-17) ──────────────────────
  items.push({ type: 'server_rack', col: 18, row: 15 });
  items.push({ type: 'server_rack', col: 20, row: 15 });
  items.push({ type: 'arcade_machine', col: 28, row: 15 });
  items.push({ type: 'vending_machine', col: 30, row: 16 });
  items.push({ type: 'trophy_shelf', col: 32, row: 15 });
  items.push({ type: 'sacred_brazier', col: 25, row: 14 });
  items.push({ type: 'altar', col: 23, row: 17 });

  // ── Worker Sanctuaries (right side) ──────────────────────────────────
  // sanctuary_0 (rows 5-7, cols 17-21): desk at col 19, row 6
  // sanctuary_1 (rows 8-10, cols 17-21): desk at col 19, row 9
  // sanctuary_2 (rows 11-13, cols 17-21): desk at col 19, row 12
  // sanctuary_3 (rows 5-7, cols 23-32): desk at col 27, row 6
  // sanctuary_4 (rows 8-10, cols 23-32): desk at col 27, row 9
  // sanctuary_5 (rows 11-13, cols 23-32): desk at col 27, row 12

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
    items.push({ type: i % 2 === 0 ? 'chair' : 'cloud_seat', col: chair.col, row: chair.row });
  }

  // Doric columns at sanctuary zone entrances
  items.push({ type: 'doric_column', col: 17, row: 5 });
  items.push({ type: 'doric_column', col: 21, row: 5 });
  items.push({ type: 'doric_column', col: 23, row: 5 });
  items.push({ type: 'doric_column', col: 32, row: 5 });

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
