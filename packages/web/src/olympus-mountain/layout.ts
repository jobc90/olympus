// ============================================================================
// Olympus Mountain Layout — Map dimensions, furniture placement, floor colors, walk grid
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
  const parity = (col + row) % 2 === 0;
  const isTemple = col >= 9 && col <= 15 && row >= 1 && row <= 5;
  const isAgora = col >= 3 && col <= 12 && row >= 6 && row <= 11;
  const isSanctuary = col >= 16 && col <= 22 && row >= 10 && row <= 18;
  const isGarden = col >= 1 && col <= 8 && row >= 1 && row <= 5;
  const isAmbrosia = col >= 1 && col <= 8 && row >= 13 && row <= 18;
  const isProcession = (col === 11 || col === 12) && row >= 4 && row <= 18;

  // Sacred road from gate to temple.
  if (isProcession) {
    return parity ? '#F5D89C' : '#B97D3F';
  }
  if (isTemple) {
    return parity ? '#FFF1D8' : '#D3AC72';
  }
  if (isAgora) {
    return parity ? '#EFE8DC' : '#C9B79B';
  }
  if (isSanctuary) {
    return parity ? '#DFE9F5' : '#A3B4CB';
  }
  if (isGarden) {
    return parity ? '#DDE9D7' : '#A8BE9B';
  }
  if (isAmbrosia) {
    return parity ? '#F3DEC2' : '#CDA479';
  }
  return parity ? '#EEE5D8' : '#C9B79E';
}

// ---------------------------------------------------------------------------
// Furniture layout builder
// ---------------------------------------------------------------------------

export function buildFurnitureLayout(workerCount: number): FurnitureItem[] {
  const items: FurnitureItem[] = [];

  // Processional gate (center-bottom)
  items.push({ type: 'door_mat', col: 11, row: 18 });
  items.push({ type: 'carpet', col: 11, row: 17 });
  items.push({ type: 'carpet', col: 12, row: 16 });
  items.push({ type: 'temple_column', col: 10, row: 18 });
  items.push({ type: 'temple_column', col: 13, row: 18 });
  items.push({ type: 'sacred_brazier', col: 9, row: 17 });
  items.push({ type: 'sacred_brazier', col: 14, row: 17 });

  // Olympus garden (top-left)
  items.push({ type: 'potted_plant', col: 2, row: 2 });
  items.push({ type: 'potted_plant', col: 4, row: 2 });
  items.push({ type: 'potted_plant', col: 6, row: 3 });
  items.push({ type: 'aquarium', col: 5, row: 4 });
  items.push({ type: 'altar', col: 3, row: 4 });
  items.push({ type: 'marble_column', col: 8, row: 2 });

  // Zeus temple (top-center, highest class)
  items.push({ type: 'big_desk', col: 12, row: 2 });
  items.push({ type: 'chair', col: 12, row: 3 });
  items.push({ type: 'altar', col: 12, row: 4 });
  items.push({ type: 'god_statue', col: 10, row: 2 });
  items.push({ type: 'god_statue', col: 14, row: 2 });
  items.push({ type: 'temple_column', col: 9, row: 1 });
  items.push({ type: 'temple_column', col: 15, row: 1 });
  items.push({ type: 'temple_column', col: 9, row: 4 });
  items.push({ type: 'temple_column', col: 15, row: 4 });
  items.push({ type: 'sacred_brazier', col: 10, row: 4 });
  items.push({ type: 'sacred_brazier', col: 14, row: 4 });

  // Agora (left-middle, middle class)
  items.push({ type: 'long_table', col: 7, row: 8 });
  items.push({ type: 'meeting_chair', col: 6, row: 8 });
  items.push({ type: 'meeting_chair', col: 8, row: 8 });
  items.push({ type: 'meeting_chair', col: 7, row: 7 });
  items.push({ type: 'meeting_chair', col: 7, row: 9 });
  items.push({ type: 'marble_column', col: 4, row: 7 });
  items.push({ type: 'marble_column', col: 10, row: 9 });
  items.push({ type: 'god_statue', col: 11, row: 8 });
  items.push({ type: 'carpet', col: 8, row: 9 });

  // Oracle and library strip
  items.push({ type: 'whiteboard_obj', col: 3, row: 10 });
  items.push({ type: 'small_table', col: 4, row: 10 });
  items.push({ type: 'bookshelf', col: 8, row: 13 });
  items.push({ type: 'bookshelf', col: 9, row: 13 });
  items.push({ type: 'reading_chair', col: 10, row: 13 });
  items.push({ type: 'marble_column', col: 11, row: 12 });

  // Ambrosia hall (bottom-left)
  items.push({ type: 'coffee_machine', col: 2, row: 14 });
  items.push({ type: 'snack_shelf', col: 2, row: 17 });
  items.push({ type: 'sofa', col: 5, row: 16 });
  items.push({ type: 'coffee_table', col: 6, row: 17 });
  items.push({ type: 'altar', col: 7, row: 15 });
  items.push({ type: 'potted_plant', col: 3, row: 17 });

  // Worker sanctuaries (right side, low class)
  const sanctuaryDesks = [
    { col: 17, row: 11 }, { col: 17, row: 14 }, { col: 17, row: 17 },
    { col: 21, row: 11 }, { col: 21, row: 14 }, { col: 21, row: 17 },
  ];
  const sanctuaryChairs = [
    { col: 18, row: 11 }, { col: 18, row: 14 }, { col: 18, row: 17 },
    { col: 22, row: 11 }, { col: 22, row: 14 }, { col: 22, row: 17 },
  ];
  for (let i = 0; i < Math.min(workerCount, 6); i++) {
    items.push({ type: i % 2 === 1 ? 'standing_desk' : 'marble_round_table', ...sanctuaryDesks[i] });
    items.push({ type: 'cloud_seat', ...sanctuaryChairs[i] });
    items.push({ type: 'monitor', ...sanctuaryDesks[i] });
    items.push({ type: 'carpet', col: sanctuaryDesks[i].col, row: sanctuaryDesks[i].row - 1 });
  }

  items.push({ type: 'doric_column', col: 16, row: 10 });
  items.push({ type: 'doric_column', col: 16, row: 13 });
  items.push({ type: 'doric_column', col: 16, row: 16 });
  items.push({ type: 'doric_column', col: 22, row: 10 });
  items.push({ type: 'doric_column', col: 22, row: 13 });
  items.push({ type: 'doric_column', col: 22, row: 16 });

  items.push({ type: 'server_rack', col: 16, row: 11 });
  items.push({ type: 'server_rack', col: 20, row: 11 });
  items.push({ type: 'altar', col: 19, row: 11 });
  items.push({ type: 'altar', col: 19, row: 14 });
  items.push({ type: 'altar', col: 19, row: 17 });
  items.push({ type: 'carpet', col: 19, row: 10 });
  items.push({ type: 'carpet', col: 19, row: 13 });
  items.push({ type: 'carpet', col: 19, row: 16 });

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
      if (r === 0 || c === 0 || r === MAP_ROWS - 1 || c === MAP_COLS - 1) {
        grid[r][c] = 'wall';
      } else {
        grid[r][c] = 'floor';
      }
    }
  }

  // Temple retaining wall (horizontal) with central processional gate.
  for (let c = 8; c <= 16; c++) {
    if (c === 11 || c === 12) {
      grid[6][c] = 'door';
    } else {
      grid[6][c] = 'wall';
    }
  }

  // Garden/agora divider.
  for (let c = 1; c <= 5; c++) {
    if (c === 3) {
      grid[8][c] = 'door';
    } else {
      grid[8][c] = 'wall';
    }
  }

  // Sanctuary divider (vertical).
  for (let r = 9; r <= 18; r++) {
    if (r === 11 || r === 14 || r === 17) {
      grid[r][15] = 'door';
    } else {
      grid[r][15] = 'wall';
    }
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
