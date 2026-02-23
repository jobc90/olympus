// ============================================================================
// Zone Definitions — Named areas in the Olympus Mountain temple
// ============================================================================

import type { Zone, ZoneId } from '../lib/types';

// ---------------------------------------------------------------------------
// Zone templates
// ---------------------------------------------------------------------------

export const ZONES_TEMPLATE: Record<ZoneId, Omit<Zone, 'id'>> = {
  // 수행 성역 (우하단 — 워커 작업 공간, col 13-22, row 11-18)
  sanctuary_0: { label: 'Sanctuary 0', emoji: '⚒️', center: { col: 14, row: 12 }, minCol: 13, maxCol: 16, minRow: 11, maxRow: 13 },
  sanctuary_1: { label: 'Sanctuary 1', emoji: '⚒️', center: { col: 14, row: 15 }, minCol: 13, maxCol: 16, minRow: 14, maxRow: 16 },
  sanctuary_2: { label: 'Sanctuary 2', emoji: '⚒️', center: { col: 14, row: 18 }, minCol: 13, maxCol: 16, minRow: 17, maxRow: 18 },
  sanctuary_3: { label: 'Sanctuary 3', emoji: '⚒️', center: { col: 20, row: 12 }, minCol: 18, maxCol: 22, minRow: 11, maxRow: 13 },
  sanctuary_4: { label: 'Sanctuary 4', emoji: '⚒️', center: { col: 20, row: 15 }, minCol: 18, maxCol: 22, minRow: 14, maxRow: 16 },
  sanctuary_5: { label: 'Sanctuary 5', emoji: '⚒️', center: { col: 20, row: 18 }, minCol: 18, maxCol: 22, minRow: 17, maxRow: 18 },
  // 제우스 신전 (우상단 중앙) — 갭 제거: maxRow 5→4
  zeus_temple:    { label: "Zeus's Temple", emoji: '⚡', center: { col: 17, row: 3 }, minCol: 14, maxCol: 22, minRow: 1, maxRow: 4 },
  // 암브로시아 홀 (좌측 하단 — 휴식) — 확장: maxCol 5→7, minRow 14→12
  ambrosia_hall:  { label: 'Ambrosia Hall', emoji: '🍷', center: { col: 4, row: 15 }, minCol: 1, maxCol: 7, minRow: 12, maxRow: 18 },
  // 아고라 (우측 중간 — 미팅) — 갭 제거: minRow 6→5
  agora:          { label: 'Agora', emoji: '🏛️', center: { col: 17, row: 7 }, minCol: 14, maxCol: 22, minRow: 5, maxRow: 9 },
  // 오라클 스톤 (좌측 중간) — 조정: maxRow 12→11
  oracle_stone:   { label: 'Oracle Stone', emoji: '📜', center: { col: 3, row: 10 }, minCol: 1, maxCol: 5, minRow: 9, maxRow: 11 },
  // 아테나의 도서관 (좌측 중간아래) — Ambrosia 확장에 맞춰 조정
  athenas_library: { label: "Athena's Library", emoji: '📚', center: { col: 9, row: 14 }, minCol: 8, maxCol: 10, minRow: 13, maxRow: 16 },
  // 올림푸스 가든 (좌측 상단) — 확장: maxCol 5→7, maxRow 5→7
  olympus_garden: { label: 'Olympus Garden', emoji: '🌿', center: { col: 4, row: 4 }, minCol: 1, maxCol: 7, minRow: 1, maxRow: 7 },
  // 오라클 챔버 (좌측 하단 구석)
  oracle_chamber: { label: 'Oracle Chamber', emoji: '🔮', center: { col: 8, row: 17 }, minCol: 6, maxCol: 10, minRow: 17, maxRow: 18 },
  // 프로필라에아 (좌측 최하단 — 입구)
  // Exclude the extreme left corner so workers don't target a trap-like tile.
  propylaea:      { label: 'Propylaea', emoji: '🏛️', center: { col: 3, row: 18 }, minCol: 2, maxCol: 4, minRow: 17, maxRow: 19 },
  // 신들의 광장 (좌측 전체 — 자유 이동 공간)
  gods_plaza:     { label: 'Agora of Gods', emoji: '🏛️', center: { col: 6, row: 8 }, minCol: 1, maxCol: 11, minRow: 1, maxRow: 18 },
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
