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
  const isRight = col >= 12;
  const isUpperRight = isRight && row <= 9;
  const isLowerRight = isRight && row >= 10;

  if (isUpperRight) {
    // 제우스 신전 + 아고라: 금빛 대리석
    if (row <= 5) return (col + row) % 2 === 0 ? '#FFF8E1' : '#FFE0B2'; // 신전 (더 금빛)
    return (col + row) % 2 === 0 ? '#E3F2FD' : '#BBDEFB'; // 아고라 (하늘색)
  }
  if (isLowerRight) {
    // 수행 성역: 진한 대리석
    return (col + row) % 2 === 0 ? '#E8E0D5' : '#DDD5C8';
  }
  // 좌측 광장: 밝은 대리석
  // 특수 구역 색상
  if (col >= 1 && col <= 7 && row >= 1 && row <= 7) {
    // 올림푸스 가든: 약간 녹색 틴트 (확장)
    return (col + row) % 2 === 0 ? '#E8F5E9' : '#C8E6C9';
  }
  if (col >= 1 && col <= 7 && row >= 12 && row <= 18) {
    // 암브로시아 홀: 따뜻한 앰버 (확장)
    return (col + row) % 2 === 0 ? '#FFF3E0' : '#FFE0B2';
  }
  return (col + row) % 2 === 0 ? '#F5F0E8' : '#EDE5D8'; // 기본 대리석
}

// ---------------------------------------------------------------------------
// Furniture layout builder
// ---------------------------------------------------------------------------

export function buildFurnitureLayout(workerCount: number): FurnitureItem[] {
  const items: FurnitureItem[] = [];

  // === 좌측: 신들의 광장 ===
  // 올림푸스 가든 (좌상단 — 확장)
  items.push({ type: 'potted_plant', col: 2, row: 2 });
  items.push({ type: 'potted_plant', col: 4, row: 2 });
  items.push({ type: 'potted_plant', col: 6, row: 3 }); // 확장 영역 나무
  items.push({ type: 'potted_plant', col: 3, row: 5 });
  items.push({ type: 'potted_plant', col: 5, row: 6 }); // 확장 영역 나무
  items.push({ type: 'aquarium', col: 2, row: 4 }); // 분수대
  items.push({ type: 'sofa', col: 5, row: 4 }); // 벤치

  // 광장 중앙 장식
  items.push({ type: 'round_table', col: 8, row: 5 }); // 중앙 제단
  items.push({ type: 'potted_plant', col: 10, row: 3 }); // 올리브
  items.push({ type: 'potted_plant', col: 10, row: 7 });

  // 오라클 스톤 (좌측 중간)
  items.push({ type: 'whiteboard_obj', col: 3, row: 10 });
  items.push({ type: 'reading_chair', col: 4, row: 10 });

  // 아테나 도서관 (좌측 중간아래)
  items.push({ type: 'bookshelf', col: 9, row: 14 });
  items.push({ type: 'bookshelf', col: 9, row: 15 });
  items.push({ type: 'reading_chair', col: 10, row: 14 });

  // 암브로시아 홀 (좌하단 — 확장)
  items.push({ type: 'coffee_machine', col: 2, row: 13 });
  items.push({ type: 'small_table', col: 4, row: 14 });
  items.push({ type: 'sofa', col: 5, row: 15 }); // 확장 영역 소파
  items.push({ type: 'coffee_table', col: 6, row: 16 }); // 확장 영역 테이블
  items.push({ type: 'snack_shelf', col: 2, row: 16 });
  items.push({ type: 'water_cooler', col: 2, row: 17 });

  // 프로필라에아 (입구)
  items.push({ type: 'door_mat', col: 2, row: 18 });
  items.push({ type: 'potted_plant', col: 1, row: 17 });

  // 광장 벽 장식
  items.push({ type: 'wall_clock', col: 6, row: 1 });
  items.push({ type: 'poster', col: 9, row: 1 });

  // === 우상단: 제우스 신전 ===
  items.push({ type: 'big_desk', col: 17, row: 2 }); // 왕좌
  items.push({ type: 'chair', col: 17, row: 3 });
  items.push({ type: 'trophy_shelf', col: 15, row: 1 }); // 좌측 장식
  items.push({ type: 'trophy_shelf', col: 19, row: 1 }); // 우측 장식
  items.push({ type: 'floor_window', col: 14, row: 1 });
  items.push({ type: 'floor_window', col: 22, row: 1 });
  items.push({ type: 'potted_plant', col: 14, row: 4 });
  items.push({ type: 'potted_plant', col: 22, row: 4 });

  // === 우상단 아래: 아고라 ===
  items.push({ type: 'long_table', col: 17, row: 7 });
  items.push({ type: 'meeting_chair', col: 16, row: 7 });
  items.push({ type: 'meeting_chair', col: 18, row: 7 });
  items.push({ type: 'meeting_chair', col: 17, row: 6 });
  items.push({ type: 'meeting_chair', col: 17, row: 8 });
  items.push({ type: 'whiteboard_obj', col: 21, row: 7 });

  // === 우하단: 수행 성역 (워커 작업대) — 대리석 탁자 + 구름 의자 ===
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
    if (i % 2 === 1) {
      items.push({ type: 'dual_monitor', ...sanctuaryDesks[i] });
    }
  }

  // 성역 장식
  items.push({ type: 'server_rack', col: 13, row: 11 });
  items.push({ type: 'server_rack', col: 13, row: 14 });

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
