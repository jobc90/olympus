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
  const isTemple = col >= 14 && row <= 4;
  const isAgora = col >= 14 && row >= 5 && row <= 9;
  const isSanctuary = col >= 13 && row >= 10;
  const isGarden = col <= 7 && row <= 7;
  const isAmbrosia = col <= 7 && row >= 12;
  const isProcession = (col === 11 || col === 12 || col === 13) && row >= 2 && row <= 18;

  // Sacred road from gate to temple (highest gold ratio)
  if (isProcession) {
    return parity ? '#F8DFAE' : '#C99559';
  }
  // Zeus temple marble + gold
  if (isTemple) {
    return parity ? '#FFF5E1' : '#D6B072';
  }
  // Agora neutral-white marble
  if (isAgora) {
    return parity ? '#E8EEF5' : '#BAC8D8';
  }
  // Worker sanctuaries cool blue marble for instant separation
  if (isSanctuary) {
    return parity ? '#DEE7F2' : '#A8B8CC';
  }
  if (isGarden) {
    return parity ? '#DCE7D8' : '#AFC39F';
  }
  if (isAmbrosia) {
    return parity ? '#F2DFC2' : '#CFA87A';
  }
  return parity ? '#EFE7D9' : '#CEBEA7';
}

// ---------------------------------------------------------------------------
// Furniture layout builder
// ---------------------------------------------------------------------------

export function buildFurnitureLayout(workerCount: number): FurnitureItem[] {
  const items: FurnitureItem[] = [];

  // Gate / Processional entrance
  items.push({ type: 'door_mat', col: 2, row: 18 });
  items.push({ type: 'carpet', col: 3, row: 17 });
  items.push({ type: 'temple_column', col: 2, row: 17 });
  items.push({ type: 'temple_column', col: 4, row: 18 });
  items.push({ type: 'sacred_brazier', col: 1, row: 16 });
  items.push({ type: 'sacred_brazier', col: 5, row: 17 });

  // Olympus garden (lighter, fewer objects)
  items.push({ type: 'potted_plant', col: 2, row: 2 });
  items.push({ type: 'potted_plant', col: 5, row: 2 });
  items.push({ type: 'potted_plant', col: 3, row: 5 });
  items.push({ type: 'aquarium', col: 6, row: 4 });
  items.push({ type: 'altar', col: 4, row: 4 });
  items.push({ type: 'marble_column', col: 8, row: 2 });
  items.push({ type: 'marble_column', col: 8, row: 6 });

  // Central plaza
  items.push({ type: 'god_statue', col: 7, row: 7 });
  items.push({ type: 'god_statue', col: 10, row: 7 });
  items.push({ type: 'altar', col: 9, row: 9 });
  items.push({ type: 'carpet', col: 9, row: 10 });
  items.push({ type: 'sacred_brazier', col: 7, row: 10 });
  items.push({ type: 'sacred_brazier', col: 11, row: 8 });

  // Athena library + oracle zone
  items.push({ type: 'bookshelf', col: 8, row: 14 });
  items.push({ type: 'bookshelf', col: 9, row: 14 });
  items.push({ type: 'reading_chair', col: 10, row: 14 });
  items.push({ type: 'whiteboard_obj', col: 3, row: 10 });
  items.push({ type: 'small_table', col: 4, row: 10 });
  items.push({ type: 'marble_column', col: 8, row: 13 });

  // Ambrosia hall
  items.push({ type: 'coffee_machine', col: 2, row: 13 });
  items.push({ type: 'snack_shelf', col: 2, row: 16 });
  items.push({ type: 'sofa', col: 5, row: 15 });
  items.push({ type: 'coffee_table', col: 6, row: 16 });
  items.push({ type: 'altar', col: 7, row: 14 });
  items.push({ type: 'potted_plant', col: 3, row: 16 });

  // Zeus temple (highest class)
  items.push({ type: 'big_desk', col: 17, row: 2 });
  items.push({ type: 'chair', col: 17, row: 3 });
  items.push({ type: 'altar', col: 17, row: 5 });
  items.push({ type: 'god_statue', col: 15, row: 2 });
  items.push({ type: 'god_statue', col: 19, row: 2 });
  items.push({ type: 'temple_column', col: 15, row: 1 });
  items.push({ type: 'temple_column', col: 19, row: 1 });
  items.push({ type: 'temple_column', col: 15, row: 4 });
  items.push({ type: 'temple_column', col: 19, row: 4 });
  items.push({ type: 'sacred_brazier', col: 14, row: 3 });
  items.push({ type: 'sacred_brazier', col: 20, row: 3 });
  items.push({ type: 'floor_window', col: 22, row: 1 });

  // Agora (middle class)
  items.push({ type: 'long_table', col: 17, row: 7 });
  items.push({ type: 'meeting_chair', col: 16, row: 7 });
  items.push({ type: 'meeting_chair', col: 18, row: 7 });
  items.push({ type: 'meeting_chair', col: 17, row: 6 });
  items.push({ type: 'meeting_chair', col: 17, row: 8 });
  items.push({ type: 'marble_column', col: 15, row: 9 });
  items.push({ type: 'marble_column', col: 19, row: 9 });
  items.push({ type: 'god_statue', col: 21, row: 7 });
  items.push({ type: 'carpet', col: 17, row: 8 });

  // Worker sanctuaries (low class but clean and readable)
  const sanctuaryDesks = [
    { col: 14, row: 12 }, { col: 14, row: 15 }, { col: 14, row: 18 },
    { col: 20, row: 12 }, { col: 20, row: 15 }, { col: 20, row: 18 },
  ];
  const sanctuaryChairs = [
    { col: 15, row: 12 }, { col: 15, row: 15 }, { col: 15, row: 18 },
    { col: 21, row: 12 }, { col: 21, row: 15 }, { col: 21, row: 18 },
  ];
  for (let i = 0; i < Math.min(workerCount, 6); i++) {
    items.push({ type: i % 2 === 1 ? 'standing_desk' : 'marble_round_table', ...sanctuaryDesks[i] });
    items.push({ type: 'cloud_seat', ...sanctuaryChairs[i] });
    items.push({ type: 'monitor', ...sanctuaryDesks[i] });
    items.push({ type: 'carpet', col: sanctuaryDesks[i].col, row: sanctuaryDesks[i].row - 1 });
  }

  // Sanctuary boundaries with Doric columns (lowest class)
  items.push({ type: 'doric_column', col: 13, row: 11 });
  items.push({ type: 'doric_column', col: 13, row: 14 });
  items.push({ type: 'doric_column', col: 13, row: 17 });
  items.push({ type: 'doric_column', col: 22, row: 11 });
  items.push({ type: 'doric_column', col: 22, row: 14 });
  items.push({ type: 'doric_column', col: 22, row: 17 });

  // Minimal infra + sacred markers
  items.push({ type: 'server_rack', col: 13, row: 11 });
  items.push({ type: 'server_rack', col: 21, row: 11 });
  items.push({ type: 'altar', col: 17, row: 11 });
  items.push({ type: 'altar', col: 17, row: 14 });
  items.push({ type: 'altar', col: 17, row: 17 });
  items.push({ type: 'carpet', col: 17, row: 10 });
  items.push({ type: 'carpet', col: 17, row: 13 });
  items.push({ type: 'carpet', col: 17, row: 16 });

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

  // === 좌/우 분할 벽 (col 12, 세로) ===
  for (let r = 1; r < MAP_ROWS - 1; r++) {
    if (r === 7 || r === 8 || r === 14 || r === 15) {
      grid[r][12] = 'door'; // 통로
    } else {
      grid[r][12] = 'wall';
    }
  }

  // === 우측 상/하 분할 벽 (row 10, 가로) ===
  for (let c = 13; c < MAP_COLS - 1; c++) {
    if (c === 17 || c === 18) {
      grid[10][c] = 'door'; // 통로
    } else {
      grid[10][c] = 'wall';
    }
  }

  // === 우상단 제우스 신전/아고라 분할 (row 4로 변경, 갭 제거) ===
  for (let c = 13; c < MAP_COLS - 1; c++) {
    if (c === 17 || c === 18) {
      grid[4][c] = 'door';
    } else {
      grid[4][c] = 'wall';
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
