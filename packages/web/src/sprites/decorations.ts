// ============================================================================
// Decoration Sprites — Walls, backgrounds, zone labels, night overlay
// ============================================================================

import { gridToScreen, TILE_W, TILE_H } from '../engine/isometric';

// ---------------------------------------------------------------------------
// Background / Sky
// ---------------------------------------------------------------------------

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dayNightPhase: number,
  tick?: number,
): void {
  const t = tick ?? 0;

  // Fixed bright sky background
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#B0E0FF');
  grad.addColorStop(1, '#E0F0FF');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Floating clouds (always visible)
  ctx.globalAlpha = 0.4;
  const clouds = [
    { x: (t * 0.1) % (width + 200) - 100, y: height * 0.15, w: 80, h: 20 },
    { x: (t * 0.08 + 300) % (width + 200) - 100, y: height * 0.25, w: 60, h: 15 },
    { x: (t * 0.12 + 150) % (width + 200) - 100, y: height * 0.1, w: 100, h: 25 },
    { x: (t * 0.09 + 500) % (width + 200) - 100, y: height * 0.3, w: 70, h: 18 },
  ];
  for (const c of clouds) {
    ctx.fillStyle = '#FFFFFF';
    // Main body
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Left puff
    ctx.beginPath();
    ctx.ellipse(c.x - c.w * 0.25, c.y + 2, c.w * 0.35, c.h * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Right puff
    ctx.beginPath();
    ctx.ellipse(c.x + c.w * 0.25, c.y + 2, c.w * 0.35, c.h * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Sun/Moon (animated orbit)
  const celestialX = width / 2 + Math.cos(t * 0.001) * (width / 3);
  const celestialY = 20 + Math.abs(Math.sin(t * 0.001)) * 15;
  const isSun = (t % 3600) < 1800;
  if (isSun) {
    // Golden sun
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(celestialX, celestialY, 10, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Silver moon
    ctx.fillStyle = '#E0E0E0';
    ctx.beginPath();
    ctx.arc(celestialX, celestialY, 8, 0, Math.PI * 2);
    ctx.fill();
    // Stars during moon phase
    const alpha = 0.6;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    const stars = [
      [50, 20], [150, 35], [280, 15], [400, 40], [550, 25],
      [700, 30], [100, 55], [350, 50], [500, 45],
    ];
    for (const [sx, sy] of stars) {
      if (((sx + sy + t) % 60) < 50) {
        ctx.fillRect(sx, sy, 2, 2);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Walls — Marble Columns
// ---------------------------------------------------------------------------

export function drawWalls(
  ctx: CanvasRenderingContext2D,
  mapCols: number,
  mapRows: number,
): void {
  // Draw outer wall base along the top & left edges of the map
  ctx.strokeStyle = '#CFD8DC';
  ctx.lineWidth = 3;

  // Top-left wall edge
  const topLeft = gridToScreen({ col: 0, row: 0 });
  const topRight = gridToScreen({ col: mapCols - 1, row: 0 });
  const bottomLeft = gridToScreen({ col: 0, row: mapRows - 1 });

  // Marble wall stroke
  ctx.beginPath();
  ctx.moveTo(bottomLeft.x - TILE_W / 2, bottomLeft.y);
  ctx.lineTo(topLeft.x, topLeft.y - TILE_H / 2);
  ctx.lineTo(topRight.x + TILE_W / 2, topRight.y);
  ctx.stroke();

  // Gold trim at the top of the wall
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bottomLeft.x - TILE_W / 2, bottomLeft.y);
  ctx.lineTo(topLeft.x, topLeft.y - TILE_H / 2);
  ctx.lineTo(topRight.x + TILE_W / 2, topRight.y);
  ctx.stroke();

  // 도리아식 기둥 (모서리)
  const corners = [
    gridToScreen({ col: 0, row: 0 }),
    gridToScreen({ col: mapCols - 1, row: 0 }),
    gridToScreen({ col: 0, row: mapRows - 1 }),
  ];
  for (const c of corners) {
    // 기둥 몸체
    ctx.fillStyle = '#E0E0E0';
    ctx.fillRect(c.x - 3, c.y - 20, 6, 20);
    // 기둥 캡 (금색)
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(c.x - 4, c.y - 22, 8, 3);
    // 기둥 베이스
    ctx.fillStyle = '#BDBDBD';
    ctx.fillRect(c.x - 4, c.y - 1, 8, 3);
  }

  // 상단 벽을 따라 도리아 기둥 (col 0~mapCols-1, row 0 라인)
  const pillarCount = 6;
  for (let i = 1; i <= pillarCount; i++) {
    const pillarCol = Math.floor((mapCols - 1) * i / (pillarCount + 1));
    const p = gridToScreen({ col: pillarCol, row: 0 });
    // 기둥 몸체 (더 크게)
    ctx.fillStyle = '#E8E0D5';
    ctx.fillRect(p.x - 4, p.y - 28, 8, 28);
    // 세로 홈 (플루팅)
    ctx.strokeStyle = '#D5CCC0';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(p.x - 1, p.y - 26);
    ctx.lineTo(p.x - 1, p.y - 2);
    ctx.moveTo(p.x + 1, p.y - 26);
    ctx.lineTo(p.x + 1, p.y - 2);
    ctx.stroke();
    // 캐피탈 (금색 상단 장식)
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(p.x - 6, p.y - 31, 12, 4);
    // 삼각 페디먼트 힌트
    ctx.beginPath();
    ctx.moveTo(p.x - 6, p.y - 31);
    ctx.lineTo(p.x, p.y - 36);
    ctx.lineTo(p.x + 6, p.y - 31);
    ctx.closePath();
    ctx.fillStyle = '#FFF3E0';
    ctx.fill();
    // 기둥 기초
    ctx.fillStyle = '#BDBDBD';
    ctx.fillRect(p.x - 5, p.y - 1, 10, 3);
  }

  // 좌측 벽을 따라 도리아 기둥 (col 0, row 0~mapRows-1)
  for (let i = 1; i <= 4; i++) {
    const pillarRow = Math.floor((mapRows - 1) * i / 5);
    const p = gridToScreen({ col: 0, row: pillarRow });
    ctx.fillStyle = '#E8E0D5';
    ctx.fillRect(p.x - 4, p.y - 28, 8, 28);
    ctx.strokeStyle = '#D5CCC0';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(p.x - 1, p.y - 26);
    ctx.lineTo(p.x - 1, p.y - 2);
    ctx.moveTo(p.x + 1, p.y - 26);
    ctx.lineTo(p.x + 1, p.y - 2);
    ctx.stroke();
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(p.x - 6, p.y - 31, 12, 4);
    ctx.fillStyle = '#BDBDBD';
    ctx.fillRect(p.x - 5, p.y - 1, 10, 3);
  }
}

export function drawDividerWall(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
): void {
  const { x, y } = gridToScreen({ col, row });
  // Thick temple pillar instead of thin wall
  const pillarW = 8;
  const pillarH = 36;

  // Check if this is col 12 (vertical divider)
  const isVertical = col === 12;

  if (isVertical && row >= 1 && row <= 9) {
    // Zeus Temple + Agora left side — thick decorative pillar
    // Pillar body (marble)
    ctx.fillStyle = '#E8E0D5';
    ctx.fillRect(x - pillarW / 2, y - pillarH, pillarW, pillarH);

    // Fluting (vertical grooves)
    ctx.strokeStyle = '#D5CCC0';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x - 2, y - pillarH + 2);
    ctx.lineTo(x - 2, y - 2);
    ctx.moveTo(x, y - pillarH + 2);
    ctx.lineTo(x, y - 2);
    ctx.moveTo(x + 2, y - pillarH + 2);
    ctx.lineTo(x + 2, y - 2);
    ctx.stroke();

    // Capital (top decoration)
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(x - pillarW / 2 - 2, y - pillarH - 4, pillarW + 4, 4);

    // Pediment (triangular top)
    ctx.beginPath();
    ctx.moveTo(x - pillarW / 2 - 2, y - pillarH - 4);
    ctx.lineTo(x, y - pillarH - 10);
    ctx.lineTo(x + pillarW / 2 + 2, y - pillarH - 4);
    ctx.closePath();
    ctx.fillStyle = '#FFF3E0';
    ctx.fill();

    // Base
    ctx.fillStyle = '#BDBDBD';
    ctx.fillRect(x - pillarW / 2 - 1, y - 1, pillarW + 2, 3);

    // Gold highlights
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - pillarW / 2 - 2, y - pillarH - 4, pillarW + 4, 4);
  } else {
    // Standard wall (row 10 horizontal divider, etc.)
    const wallH = 24;
    // Top surface — marble white
    ctx.fillStyle = '#F5F5F5';
    ctx.beginPath();
    ctx.moveTo(x, y - TILE_H / 2 - wallH);
    ctx.lineTo(x + TILE_W / 2, y - wallH);
    ctx.lineTo(x, y + TILE_H / 2 - wallH);
    ctx.lineTo(x - TILE_W / 2, y - wallH);
    ctx.closePath();
    ctx.fill();

    // Gold accent at the very top
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.moveTo(x, y - TILE_H / 2 - wallH);
    ctx.lineTo(x + TILE_W / 2, y - wallH);
    ctx.lineTo(x, y + TILE_H / 2 - wallH);
    ctx.lineTo(x - TILE_W / 2, y - wallH);
    ctx.closePath();
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fill();
    ctx.restore();

    // Left face — light marble
    ctx.fillStyle = '#E0E0E0';
    ctx.beginPath();
    ctx.moveTo(x - TILE_W / 2, y - wallH);
    ctx.lineTo(x, y + TILE_H / 2 - wallH);
    ctx.lineTo(x, y + TILE_H / 2);
    ctx.lineTo(x - TILE_W / 2, y);
    ctx.closePath();
    ctx.fill();

    // Right face — shadow marble
    ctx.fillStyle = '#CFD8DC';
    ctx.beginPath();
    ctx.moveTo(x + TILE_W / 2, y - wallH);
    ctx.lineTo(x, y + TILE_H / 2 - wallH);
    ctx.lineTo(x, y + TILE_H / 2);
    ctx.lineTo(x + TILE_W / 2, y);
    ctx.closePath();
    ctx.fill();

    // 대리석 결 디테일
    ctx.strokeStyle = '#BDBDBD';
    ctx.lineWidth = 0.3;
    ctx.globalAlpha = 0.15;
    ctx.beginPath();
    ctx.moveTo(x + TILE_W / 4, y - wallH + 5);
    ctx.lineTo(x + TILE_W / 4 - 2, y - 5);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------------------
// Zone Labels
// ---------------------------------------------------------------------------

export function drawZoneLabel(
  ctx: CanvasRenderingContext2D,
  label: string,
  emoji: string,
  col: number,
  row: number,
  alpha: number,
): void {
  const { x, y } = gridToScreen({ col, row });
  ctx.save();
  ctx.globalAlpha = alpha;

  const text = `${emoji} ${label}`;
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';

  // 배경 박스
  const metrics = ctx.measureText(text);
  const boxW = metrics.width + 8;
  const boxH = 13;
  const boxX = x - boxW / 2;
  const boxY = y + TILE_H;

  // 반투명 대리석 배경
  ctx.fillStyle = 'rgba(245, 240, 232, 0.7)';
  ctx.fillRect(boxX, boxY, boxW, boxH);
  // 금색 테두리
  ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  // 텍스트
  ctx.fillStyle = '#5D4037';
  ctx.fillText(text, x, boxY + 10);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Night Overlay — Divine Purple Night
// ---------------------------------------------------------------------------

export function drawNightOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dayNightPhase: number,
  glowSpots?: Array<{ x: number; y: number; color: string }>,
): void {
  // No night overlay for fixed background (background is always bright)
  // Moon phase adds a slight blue tint only
  const isMoon = dayNightPhase > 0.5;
  if (isMoon) {
    ctx.fillStyle = 'rgba(173, 216, 230, 0.05)';
    ctx.fillRect(0, 0, width, height);
  }
}

// ---------------------------------------------------------------------------
// Floor Marble Veining — subtle temple floor detail
// ---------------------------------------------------------------------------

export function drawMarbleVeins(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
): void {
  // Deterministic marble veins based on tile position (only some tiles get them)
  const hash = (col * 7 + row * 13) % 17;
  if (hash > 6) return; // ~40% of tiles get marble veining

  const { x, y } = gridToScreen({ col, row });
  ctx.save();

  if (hash === 0) {
    // Light gray marble vein
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#CFD8DC';
    ctx.fillRect(x - 3, y, 5, 1);
  } else if (hash === 1) {
    // Subtle gold sparkle fleck
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(x + 1, y + 1, 1, 1);
    ctx.fillRect(x - 2, y - 1, 1, 1);
  } else if (hash === 2) {
    // Shadow vein in marble
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#B0BEC5';
    ctx.fillRect(x - 1, y, 3, 1);
  } else if (hash === 3) {
    // 대각선 마블 결
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#D7CCC8';
    ctx.fillRect(x - 4, y - 1, 7, 1);
    ctx.fillRect(x - 3, y, 5, 1);
  } else if (hash === 4) {
    // 금색 미세 입자
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(x + 2, y - 2, 1, 1);
  } else if (hash === 5) {
    // 짧은 마블 결
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#BCAAA4';
    ctx.fillRect(x - 2, y + 1, 4, 1);
  } else {
    // 크로스 마블 무늬
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#CFD8DC';
    ctx.fillRect(x, y - 1, 1, 3);
    ctx.fillRect(x - 1, y, 3, 1);
  }

  ctx.restore();
}
