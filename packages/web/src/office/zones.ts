// ============================================================================
// Zone Definitions — Named areas in the office
// ============================================================================

import type { Zone, ZoneId } from '../lib/types';

// ---------------------------------------------------------------------------
// Zone templates
// ---------------------------------------------------------------------------

export const ZONES_TEMPLATE: Record<ZoneId, Omit<Zone, 'id'>> = {
  desk_0:       { label: 'Desk 0',            emoji: '\u2692\uFE0F',     center: { col: 4, row: 3 },  minCol: 2,  maxCol: 5,  minRow: 2,  maxRow: 4 },
  desk_1:       { label: 'Desk 1',            emoji: '\u2692\uFE0F',     center: { col: 4, row: 6 },  minCol: 2,  maxCol: 5,  minRow: 5,  maxRow: 7 },
  desk_2:       { label: 'Desk 2',            emoji: '\u2692\uFE0F',     center: { col: 4, row: 9 },  minCol: 2,  maxCol: 5,  minRow: 8,  maxRow: 10 },
  desk_3:       { label: 'Desk 3',            emoji: '\u2692\uFE0F',     center: { col: 8, row: 3 },  minCol: 6,  maxCol: 9,  minRow: 2,  maxRow: 4 },
  desk_4:       { label: 'Desk 4',            emoji: '\u2692\uFE0F',     center: { col: 8, row: 6 },  minCol: 6,  maxCol: 9,  minRow: 5,  maxRow: 7 },
  desk_5:       { label: 'Desk 5',            emoji: '\u2692\uFE0F',     center: { col: 8, row: 9 },  minCol: 6,  maxCol: 9,  minRow: 8,  maxRow: 10 },
  boss_office:  { label: "Zeus's Throne",      emoji: '\u26A1',           center: { col: 14, row: 3 }, minCol: 12, maxCol: 16, minRow: 1,  maxRow: 4 },
  break_room:   { label: 'Ambrosia Hall',      emoji: '\u{1F377}',       center: { col: 20, row: 3 }, minCol: 18, maxCol: 22, minRow: 1,  maxRow: 5 },
  meeting_room: { label: 'Agora',              emoji: '\u{1F3DB}\uFE0F', center: { col: 14, row: 7 }, minCol: 12, maxCol: 16, minRow: 6,  maxRow: 9 },
  whiteboard:   { label: 'Oracle Stone',       emoji: '\u{1F4DC}',       center: { col: 10, row: 12 }, minCol: 9,  maxCol: 11, minRow: 11, maxRow: 13 },
  library:      { label: "Athena's Library",   emoji: '\u{1F4DA}',       center: { col: 10, row: 15 }, minCol: 9,  maxCol: 12, minRow: 14, maxRow: 17 },
  lounge:       { label: 'Olympus Garden',     emoji: '\u{1F33F}',       center: { col: 20, row: 14 }, minCol: 18, maxCol: 22, minRow: 12, maxRow: 16 },
  server_room:  { label: 'Oracle Chamber',     emoji: '\u{1F52E}',       center: { col: 20, row: 9 }, minCol: 18, maxCol: 22, minRow: 7,  maxRow: 10 },
  entrance:     { label: 'Propylaea',          emoji: '\u{1F3DB}\uFE0F', center: { col: 2, row: 18 }, minCol: 1,  maxCol: 4,  minRow: 17, maxRow: 19 },
};

// ---------------------------------------------------------------------------
// Build zone map for N workers
// ---------------------------------------------------------------------------

export function buildZoneMap(workerCount: number): Record<ZoneId, Zone> {
  const zones: Partial<Record<ZoneId, Zone>> = {};
  for (const [id, tmpl] of Object.entries(ZONES_TEMPLATE)) {
    const zoneId = id as ZoneId;
    // Only include desks that have workers
    if (zoneId.startsWith('desk_')) {
      const idx = parseInt(zoneId.replace('desk_', ''), 10);
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
