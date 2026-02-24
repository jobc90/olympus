// ============================================================================
// Zone Definitions — Named areas in the Olympus Mountain top-down map
// MAP: 34 cols × 19 rows, TILE_PX=32px → renders in 1088×608px (centered in 1100×620)
// ============================================================================

import type { Zone, ZoneId } from '../lib/types';

// ---------------------------------------------------------------------------
// Zone layout (top-down grid)
// ---------------------------------------------------------------------------
//
//   Col:  0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33
//   Row 0:  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W
//   Row 1:  W  G  G  G  G  G  G  G  G  G  G  W  T  T  T  T  T  T  T  T  T  W  O  O  O  O  O  O  O  O  O  O  O  W
//   Row 2:  W  G  G  G  G  G  G  G  G  G  G  W  T  T  T  T  T  T  T  T  T  W  O  O  O  O  O  O  O  O  O  O  O  W
//   Row 3:  W  G  G  G  G  G  G  G  G  G  G  W  T  T  T  T  T  T  T  T  T  W  O  O  O  O  O  O  O  O  O  O  O  W
//   Row 4:  W  G  G  G  G  G  G  G  G  G  G  W  T  T  T  T  T  T  T  T  T  W  O  O  O  O  O  O  O  O  O  O  O  W
//   Row 5:  W  A  A  A  A  A  A  A  A  A  A  A  A  A  A  A  P  S0 S0 S0 S0 S0  S3 S3 S3 S3 S3 S3 S3 S3 S3 S3  W
//   Row 6:  W  A  A  A  A  A  A  A  A  A  A  A  A  A  A  A  P  S0 S0 S0 S0 S0  S3 S3 S3 S3 S3 S3 S3 S3 S3 S3  W
//   Row 7:  W  A  A  A  A  A  A  A  A  A  A  A  A  A  A  A  P  S0 S0 S0 S0 S0  S3 S3 S3 S3 S3 S3 S3 S3 S3 S3  W
//   Row 8:  W  A  A  A  A  A  A  A  A  A  A  A  A  A  A  A  P  S1 S1 S1 S1 S1  S4 S4 S4 S4 S4 S4 S4 S4 S4 S4  W
//   Row 9:  W  A  A  A  A  A  A  A  A  A  A  A  A  A  A  A  P  S1 S1 S1 S1 S1  S4 S4 S4 S4 S4 S4 S4 S4 S4 S4  W
//   Row10:  W  A  A  A  A  A  A  A  A  A  A  A  A  A  A  A  P  S1 S1 S1 S1 S1  S4 S4 S4 S4 S4 S4 S4 S4 S4 S4  W
//   Row11:  W  A  A  A  A  A  A  A  A  A  A  A  A  A  A  A  P  S2 S2 S2 S2 S2  S5 S5 S5 S5 S5 S5 S5 S5 S5 S5  W
//   Row12:  W  A  A  A  A  A  A  A  A  A  A  A  A  A  A  A  P  S2 S2 S2 S2 S2  S5 S5 S5 S5 S5 S5 S5 S5 S5 S5  W
//   Row13:  W  B  B  B  B  B  B  B  B  B  W  L  L  L  L  L  P  S2 S2 S2 S2 S2  S5 S5 S5 S5 S5 S5 S5 S5 S5 S5  W
//   Row14:  W  B  B  B  B  B  B  B  B  B  W  L  L  L  L  L  P  F  F  F  F  F  F  F  F  F  F  F  F  F  F  F  W
//   Row15:  W  B  B  B  B  B  B  B  B  B  W  L  L  L  L  L  P  F  F  F  F  F  F  F  F  F  F  F  F  F  F  F  W
//   Row16:  W  B  B  B  B  B  B  B  B  B  W  L  L  L  L  L  P  F  F  F  F  F  F  F  F  F  F  F  F  F  F  F  W
//   Row17:  W  B  B  B  B  B  B  B  B  B  W  L  L  L  L  L  P  F  F  F  F  F  F  F  F  F  F  F  F  F  F  F  W
//   Row18:  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W
//
//  G=garden, T=zeus_temple, O=observatory, A=agora, P=processional_path,
//  S0-S5=sanctuary_0..5, B=ambrosia_hall, L=athenas_library, F=hephaestus_forge

export const ZONES_TEMPLATE: Record<ZoneId, Omit<Zone, 'id'>> = {
  // ── Upper tier (rows 1-4) ──────────────────────────────────────────────
  olympus_garden: {
    label: 'North Studio',
    emoji: '🌱',
    center: { col: 6, row: 2 },
    minCol: 1, maxCol: 10, minRow: 1, maxRow: 4,
  },
  zeus_temple: {
    label: 'Lead Desk',
    emoji: '👑',
    center: { col: 16, row: 2 },
    minCol: 12, maxCol: 20, minRow: 1, maxRow: 4,
  },
  celestial_observatory: {
    label: 'Break Room',
    emoji: '🍽️',
    center: { col: 27, row: 2 },
    minCol: 22, maxCol: 32, minRow: 1, maxRow: 4,
  },

  // ── Middle tier left — Agora (rows 5-12) ──────────────────────────────
  agora: {
    label: 'Main Office',
    emoji: '💻',
    center: { col: 8, row: 9 },
    minCol: 1, maxCol: 15, minRow: 5, maxRow: 12,
  },

  // ── Middle tier right — Sanctuaries (rows 5-13) ───────────────────────
  sanctuary_0: {
    label: 'Pod A',
    emoji: '🧩',
    center: { col: 19, row: 6 },
    minCol: 17, maxCol: 21, minRow: 5, maxRow: 7,
  },
  sanctuary_1: {
    label: 'Pod B',
    emoji: '🧩',
    center: { col: 19, row: 9 },
    minCol: 17, maxCol: 21, minRow: 8, maxRow: 10,
  },
  sanctuary_2: {
    label: 'Pod C',
    emoji: '🧩',
    center: { col: 19, row: 12 },
    minCol: 17, maxCol: 21, minRow: 11, maxRow: 13,
  },
  sanctuary_3: {
    label: 'Pod D',
    emoji: '🧩',
    center: { col: 27, row: 6 },
    minCol: 23, maxCol: 32, minRow: 5, maxRow: 7,
  },
  sanctuary_4: {
    label: 'Pod E',
    emoji: '🧩',
    center: { col: 27, row: 9 },
    minCol: 23, maxCol: 32, minRow: 8, maxRow: 10,
  },
  sanctuary_5: {
    label: 'Pod F',
    emoji: '🧩',
    center: { col: 27, row: 12 },
    minCol: 23, maxCol: 32, minRow: 11, maxRow: 13,
  },

  // ── Lower tier (rows 13-17) ───────────────────────────────────────────
  ambrosia_hall: {
    label: 'Lounge',
    emoji: '☕',
    center: { col: 5, row: 15 },
    minCol: 1, maxCol: 9, minRow: 13, maxRow: 17,
  },
  athenas_library: {
    label: 'Archives',
    emoji: '📚',
    center: { col: 13, row: 15 },
    minCol: 11, maxCol: 15, minRow: 13, maxRow: 17,
  },
  hephaestus_forge: {
    label: 'Ops Room',
    emoji: '🖥️',
    center: { col: 25, row: 15 },
    minCol: 17, maxCol: 32, minRow: 14, maxRow: 17,
  },

  // ── Alias zones (mapped to existing areas) ────────────────────────────
  oracle_stone: {
    label: 'Oracle Desk',
    emoji: '📜',
    center: { col: 13, row: 15 },
    minCol: 11, maxCol: 15, minRow: 13, maxRow: 15,
  },
  oracle_chamber: {
    label: 'Oracle Chamber',
    emoji: '🔮',
    center: { col: 13, row: 16 },
    minCol: 11, maxCol: 15, minRow: 15, maxRow: 17,
  },
  propylaea: {
    label: 'Temple Gate',
    emoji: '🚪',
    center: { col: 16, row: 5 },
    minCol: 15, maxCol: 17, minRow: 4, maxRow: 6,
  },
  gods_plaza: {
    label: 'Gods Plaza',
    emoji: '🏛️',
    center: { col: 8, row: 9 },
    minCol: 1, maxCol: 15, minRow: 5, maxRow: 12,
  },
};

// ---------------------------------------------------------------------------
// Build zone map for N workers
// ---------------------------------------------------------------------------

export function buildZoneMap(workerCount: number): Record<ZoneId, Zone> {
  void workerCount;
  const zones: Partial<Record<ZoneId, Zone>> = {};
  for (const [id, tmpl] of Object.entries(ZONES_TEMPLATE)) {
    const zoneId = id as ZoneId;
    zones[zoneId] = { id: zoneId, ...tmpl };
  }
  return zones as Record<ZoneId, Zone>;
}

export function getZone(id: ZoneId, workerCount: number): Zone | undefined {
  return buildZoneMap(workerCount)[id];
}

export function getRandomPointInZone(zone: Zone): { col: number; row: number } {
  const col = zone.minCol + Math.floor(Math.random() * (zone.maxCol - zone.minCol + 1));
  const row = zone.minRow + Math.floor(Math.random() * (zone.maxRow - zone.minRow + 1));
  return { col, row };
}
