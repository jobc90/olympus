// ============================================================================
// Zone Definitions — Named areas in the Olympus Mountain temple
// ============================================================================

import type { Zone, ZoneId } from '../lib/types';

// ---------------------------------------------------------------------------
// Zone templates
// ---------------------------------------------------------------------------

export const ZONES_TEMPLATE: Record<ZoneId, Omit<Zone, 'id'>> = {
  sanctuary_0: { label: 'Sanctuary 0', emoji: '⚒️', center: { col: 17, row: 11 }, minCol: 16, maxCol: 18, minRow: 10, maxRow: 12 },
  sanctuary_1: { label: 'Sanctuary 1', emoji: '⚒️', center: { col: 17, row: 14 }, minCol: 16, maxCol: 18, minRow: 13, maxRow: 15 },
  sanctuary_2: { label: 'Sanctuary 2', emoji: '⚒️', center: { col: 17, row: 17 }, minCol: 16, maxCol: 18, minRow: 16, maxRow: 18 },
  sanctuary_3: { label: 'Sanctuary 3', emoji: '⚒️', center: { col: 21, row: 11 }, minCol: 20, maxCol: 22, minRow: 10, maxRow: 12 },
  sanctuary_4: { label: 'Sanctuary 4', emoji: '⚒️', center: { col: 21, row: 14 }, minCol: 20, maxCol: 22, minRow: 13, maxRow: 15 },
  sanctuary_5: { label: 'Sanctuary 5', emoji: '⚒️', center: { col: 21, row: 17 }, minCol: 20, maxCol: 22, minRow: 16, maxRow: 18 },
  zeus_temple: { label: "Zeus's Temple", emoji: '⚡', center: { col: 12, row: 3 }, minCol: 9, maxCol: 15, minRow: 1, maxRow: 5 },
  ambrosia_hall: { label: 'Ambrosia Hall', emoji: '🍷', center: { col: 4, row: 16 }, minCol: 1, maxCol: 8, minRow: 13, maxRow: 18 },
  agora: { label: 'Agora', emoji: '🏛️', center: { col: 7, row: 8 }, minCol: 3, maxCol: 12, minRow: 6, maxRow: 11 },
  oracle_stone: { label: 'Oracle Stone', emoji: '📜', center: { col: 3, row: 10 }, minCol: 1, maxCol: 5, minRow: 9, maxRow: 11 },
  athenas_library: { label: "Athena's Library", emoji: '📚', center: { col: 9, row: 13 }, minCol: 8, maxCol: 11, minRow: 12, maxRow: 15 },
  olympus_garden: { label: 'Olympus Garden', emoji: '🌿', center: { col: 4, row: 3 }, minCol: 1, maxCol: 8, minRow: 1, maxRow: 5 },
  oracle_chamber: { label: 'Oracle Chamber', emoji: '🔮', center: { col: 9, row: 17 }, minCol: 7, maxCol: 11, minRow: 16, maxRow: 18 },
  propylaea: { label: 'Propylaea', emoji: '🏛️', center: { col: 12, row: 18 }, minCol: 10, maxCol: 13, minRow: 17, maxRow: 19 },
  gods_plaza: { label: 'Agora of Gods', emoji: '🏛️', center: { col: 8, row: 10 }, minCol: 1, maxCol: 14, minRow: 6, maxRow: 18 },
};

// ---------------------------------------------------------------------------
// Build zone map for N workers
// ---------------------------------------------------------------------------

export function buildZoneMap(workerCount: number): Record<ZoneId, Zone> {
  const zones: Partial<Record<ZoneId, Zone>> = {};
  for (const [id, tmpl] of Object.entries(ZONES_TEMPLATE)) {
    const zoneId = id as ZoneId;
    // Only include sanctuaries that have workers
    if (zoneId.startsWith('sanctuary_')) {
      const idx = parseInt(zoneId.replace('sanctuary_', ''), 10);
      if (idx >= workerCount) continue;
    }
    zones[zoneId] = { id: zoneId, ...tmpl };
  }
  return zones as Record<ZoneId, Zone>;
}

// ---------------------------------------------------------------------------
// Get zone by id
// ---------------------------------------------------------------------------

export function getZone(id: ZoneId, workerCount: number): Zone | undefined {
  const zones = buildZoneMap(workerCount);
  return zones[id];
}

// ---------------------------------------------------------------------------
// Get a random walkable point within a zone
// ---------------------------------------------------------------------------

export function getRandomPointInZone(zone: Zone): { col: number; row: number } {
  const col = zone.minCol + Math.floor(Math.random() * (zone.maxCol - zone.minCol + 1));
  const row = zone.minRow + Math.floor(Math.random() * (zone.maxRow - zone.minRow + 1));
  return { col, row };
}
