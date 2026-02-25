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

  // ── Sacred Olive Grove (olympus_garden: col 1-10, rows 1-4) ──────────────
  items.push({ type: 'olive_tree', col: 2, row: 1 });
  items.push({ type: 'olive_tree', col: 8, row: 1 });
  items.push({ type: 'olive_tree', col: 5, row: 2 });
  items.push({ type: 'olive_tree', col: 1, row: 3 });
  items.push({ type: 'olive_tree', col: 9, row: 3 });
  items.push({ type: 'stone_bench', col: 4, row: 3 });
  items.push({ type: 'stone_bench', col: 7, row: 3 });
  items.push({ type: 'urn', col: 3, row: 4 });
  items.push({ type: 'urn', col: 8, row: 4 });

  // ── Zeus Sanctum (zeus_temple: col 12-20, rows 1-4) ──────────────────────
  items.push({ type: 'temple_column', col: 13, row: 1 });
  items.push({ type: 'temple_column', col: 19, row: 1 });
  items.push({ type: 'temple_column', col: 13, row: 4 });
  items.push({ type: 'temple_column', col: 19, row: 4 });
  items.push({ type: 'god_statue', col: 16, row: 1 });
  items.push({ type: 'altar', col: 16, row: 2 });
  items.push({ type: 'sacred_brazier', col: 14, row: 2 });
  items.push({ type: 'sacred_brazier', col: 18, row: 2 });
  items.push({ type: 'urn', col: 12, row: 3 });
  items.push({ type: 'urn', col: 20, row: 3 });

  // ── Temple of the Muses (celestial_observatory: col 22-32, rows 1-4) ─────
  items.push({ type: 'marble_column', col: 23, row: 1 });
  items.push({ type: 'marble_column', col: 31, row: 1 });
  items.push({ type: 'marble_column', col: 23, row: 4 });
  items.push({ type: 'marble_column', col: 31, row: 4 });
  items.push({ type: 'god_statue', col: 27, row: 2 });
  items.push({ type: 'altar', col: 27, row: 3 });
  items.push({ type: 'urn', col: 25, row: 1 });
  items.push({ type: 'urn', col: 29, row: 1 });
  items.push({ type: 'stone_bench', col: 25, row: 4 });
  items.push({ type: 'stone_bench', col: 29, row: 4 });

  // ── Grand Agora — Marble Courtyard (col 1-15, rows 5-12) ─────────────────
  // Doric columns at zone corners
  items.push({ type: 'doric_column', col: 2, row: 5 });
  items.push({ type: 'doric_column', col: 14, row: 5 });
  items.push({ type: 'doric_column', col: 2, row: 12 });
  items.push({ type: 'doric_column', col: 14, row: 12 });
  // Central fountain
  items.push({ type: 'fountain', col: 8, row: 8 });
  // Sacred braziers flanking the fountain
  items.push({ type: 'sacred_brazier', col: 4, row: 6 });
  items.push({ type: 'sacred_brazier', col: 12, row: 6 });
  items.push({ type: 'sacred_brazier', col: 4, row: 11 });
  items.push({ type: 'sacred_brazier', col: 12, row: 11 });
  // Stone benches
  items.push({ type: 'stone_bench', col: 6, row: 7 });
  items.push({ type: 'stone_bench', col: 10, row: 7 });
  items.push({ type: 'stone_bench', col: 6, row: 10 });
  items.push({ type: 'stone_bench', col: 10, row: 10 });
  // Laurel trees
  items.push({ type: 'laurel_tree', col: 3, row: 9 });
  items.push({ type: 'laurel_tree', col: 13, row: 9 });
  // Decorative urns near corner columns
  items.push({ type: 'urn', col: 1, row: 7 });
  items.push({ type: 'urn', col: 15, row: 7 });
  items.push({ type: 'urn', col: 1, row: 10 });
  items.push({ type: 'urn', col: 15, row: 10 });
  // God statues flanking processional entrance
  items.push({ type: 'god_statue', col: 5, row: 5 });
  items.push({ type: 'god_statue', col: 11, row: 5 });

  // ── Sanctuary A — Demigod Chambers (col 17-21) ───────────────────────────
  // Fixed columns at corners
  items.push({ type: 'doric_column', col: 17, row: 5 });
  items.push({ type: 'doric_column', col: 21, row: 5 });
  items.push({ type: 'doric_column', col: 17, row: 13 });
  items.push({ type: 'doric_column', col: 21, row: 13 });
  // Braziers on east wall of each chamber
  items.push({ type: 'sacred_brazier', col: 20, row: 6 });
  items.push({ type: 'sacred_brazier', col: 20, row: 9 });
  items.push({ type: 'sacred_brazier', col: 20, row: 12 });

  // ── Sanctuary B — Hero's Halls (col 23-32) ───────────────────────────────
  // Fixed columns
  items.push({ type: 'marble_column', col: 32, row: 5 });
  items.push({ type: 'marble_column', col: 32, row: 12 });
  // Laurel trees on far wall
  items.push({ type: 'laurel_tree', col: 30, row: 6 });
  items.push({ type: 'laurel_tree', col: 30, row: 9 });
  items.push({ type: 'laurel_tree', col: 30, row: 12 });
  // Urns near the divider wall
  items.push({ type: 'urn', col: 23, row: 5 });
  items.push({ type: 'urn', col: 23, row: 9 });
  items.push({ type: 'urn', col: 23, row: 12 });

  // Worker-specific sanctuary furniture (marble table + cloud seats)
  const sanctuaryPos = [
    { col: 19, row: 6 },  // A1 (sanctuary_0, rows 5-7)
    { col: 19, row: 9 },  // A2 (sanctuary_1, interior 9-10)
    { col: 19, row: 12 }, // A3 (sanctuary_2, interior 12-13)
    { col: 27, row: 6 },  // B1 (sanctuary_3, rows 5-7)
    { col: 27, row: 9 },  // B2 (sanctuary_4, interior 9-10)
    { col: 27, row: 12 }, // B3 (sanctuary_5, interior 12-13)
  ];
  for (let i = 0; i < Math.min(workerCount, 6); i++) {
    const pos = sanctuaryPos[i];
    items.push({ type: 'marble_round_table', col: pos.col, row: pos.row });
    items.push({ type: 'cloud_seat', col: pos.col - 1, row: pos.row });
    items.push({ type: 'cloud_seat', col: pos.col + 1, row: pos.row });
  }

  // ── Ambrosia Hall — Divine Feast Room (col 1-9, rows 14-17) ─────────────
  // Note: row 13 is a wall (door at col 8, row 13)
  items.push({ type: 'doric_column', col: 1, row: 14 });
  items.push({ type: 'doric_column', col: 9, row: 14 });
  items.push({ type: 'sacred_brazier', col: 2, row: 14 });
  items.push({ type: 'sacred_brazier', col: 8, row: 14 });
  items.push({ type: 'marble_round_table', col: 5, row: 15 });
  items.push({ type: 'cloud_seat', col: 3, row: 15 });
  items.push({ type: 'cloud_seat', col: 7, row: 15 });
  items.push({ type: 'urn', col: 2, row: 17 });
  items.push({ type: 'urn', col: 8, row: 17 });
  items.push({ type: 'laurel_tree', col: 5, row: 17 });

  // ── Athena's Library — Hall of Wisdom (col 11-15, rows 14-17) ────────────
  // Note: row 13 is a wall (door at col 13, row 13)
  items.push({ type: 'marble_column', col: 11, row: 14 });
  items.push({ type: 'marble_column', col: 15, row: 14 });
  items.push({ type: 'god_statue', col: 13, row: 15 });
  items.push({ type: 'altar', col: 13, row: 17 });
  items.push({ type: 'urn', col: 12, row: 16 });
  items.push({ type: 'urn', col: 14, row: 16 });

  // ── Hephaestus Forge — Sacred Smithy (col 17-32, rows 14-17) ─────────────
  items.push({ type: 'marble_column', col: 17, row: 14 });
  items.push({ type: 'marble_column', col: 32, row: 14 });
  items.push({ type: 'god_statue', col: 24, row: 14 });
  items.push({ type: 'altar', col: 24, row: 16 });
  items.push({ type: 'sacred_brazier', col: 19, row: 15 });
  items.push({ type: 'sacred_brazier', col: 22, row: 15 });
  items.push({ type: 'sacred_brazier', col: 26, row: 15 });
  items.push({ type: 'sacred_brazier', col: 29, row: 15 });
  items.push({ type: 'sacred_brazier', col: 32, row: 15 });
  items.push({ type: 'urn', col: 18, row: 17 });
  items.push({ type: 'urn', col: 31, row: 17 });

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
