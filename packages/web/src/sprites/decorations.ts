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
  const nightStrength = Math.max(0, Math.min(1, (dayNightPhase - 0.45) / 0.55));
  const dayStrength = 1 - nightStrength;

  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, nightStrength > 0.45 ? '#1A1B3E' : '#B6DDFF');
  grad.addColorStop(0.58, nightStrength > 0.45 ? '#273E73' : '#EED29F');
  grad.addColorStop(1, nightStrength > 0.45 ? '#0C1430' : '#F6F1E8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Horizon glow for grand temple feel
  const horizonY = Math.floor(height * 0.34);
  ctx.fillStyle = `rgba(255, 218, 150, ${0.18 * dayStrength})`;
  ctx.fillRect(0, horizonY - 24, width, 28);

  // Distant temple silhouettes
  ctx.fillStyle = nightStrength > 0.45 ? 'rgba(14, 20, 45, 0.75)' : 'rgba(171, 146, 116, 0.35)';
  const silhouettes = [
    { x: 70, w: 130, h: 42 },
    { x: 260, w: 180, h: 52 },
    { x: 520, w: 150, h: 46 },
    { x: 760, w: 200, h: 54 },
  ];
  for (const s of silhouettes) {
    const baseY = horizonY + 8;
    ctx.fillRect(s.x, baseY - s.h, s.w, s.h);
    ctx.beginPath();
    ctx.moveTo(s.x - 10, baseY - s.h);
    ctx.lineTo(s.x + s.w / 2, baseY - s.h - 24);
    ctx.lineTo(s.x + s.w + 10, baseY - s.h);
    ctx.closePath();
    ctx.fill();
    for (let i = 1; i <= 4; i++) {
      const px = s.x + Math.floor((s.w / 5) * i);
      ctx.fillRect(px - 2, baseY - s.h, 4, s.h);
    }
  }

  // Floating clouds
  ctx.globalAlpha = 0.24 + dayStrength * 0.24;
  const clouds = [
    { x: (t * 0.12) % (width + 220) - 120, y: height * 0.14, w: 110, h: 26 },
    { x: (t * 0.09 + 290) % (width + 230) - 120, y: height * 0.22, w: 88, h: 20 },
    { x: (t * 0.14 + 130) % (width + 240) - 120, y: height * 0.1, w: 128, h: 30 },
    { x: (t * 0.11 + 520) % (width + 230) - 120, y: height * 0.29, w: 96, h: 22 },
  ];
  for (const c of clouds) {
    ctx.fillStyle = nightStrength > 0.45 ? '#C7D5FF' : '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(c.x - c.w * 0.28, c.y + 2, c.w * 0.35, c.h * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(c.x + c.w * 0.28, c.y + 2, c.w * 0.35, c.h * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Sun / moon and divine rays
  const celestialX = width / 2 + Math.cos(t * 0.001) * (width / 3);
  const celestialY = 20 + Math.abs(Math.sin(t * 0.001)) * 15;
  if (nightStrength < 0.55) {
    ctx.fillStyle = '#FFD54F';
    ctx.beginPath();
    ctx.arc(celestialX, celestialY, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 223, 122, ${0.45 * dayStrength})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6;
      const x1 = celestialX + Math.cos(angle) * 16;
      const y1 = celestialY + Math.sin(angle) * 16;
      const x2 = celestialX + Math.cos(angle) * 24;
      const y2 = celestialY + Math.sin(angle) * 24;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#E0E0E0';
    ctx.beginPath();
    ctx.arc(celestialX, celestialY, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    const stars = [
      [50, 20], [150, 35], [280, 15], [400, 40], [550, 25], [700, 30], [860, 40], [980, 26],
      [100, 55], [350, 50], [500, 45], [760, 52],
    ];
    for (const [sx, sy] of stars) {
      if (((sx + sy + t) % 64) < 50) {
        ctx.fillRect(sx, sy, 2, 2);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Walls — Marble Columns
// ---------------------------------------------------------------------------

function drawTemplePillar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  opts?: { width?: number; height?: number; grand?: boolean },
): void {
  const width = opts?.width ?? 10;
  const height = opts?.height ?? 38;
  const half = width / 2;
  const shaftTop = y - height;
  const shaftBottom = y - 2;

  // Stylobate base
  ctx.fillStyle = '#AFA08B';
  ctx.fillRect(x - half - 3, y - 2, width + 6, 4);
  ctx.fillStyle = '#D9CCBC';
  ctx.fillRect(x - half - 2, y - 4, width + 4, 2);
  ctx.fillStyle = '#D4AF37';
  ctx.fillRect(x - half - 3, y - 5, width + 6, 1);

  // Shaft core
  ctx.fillStyle = '#EEE4D6';
  ctx.fillRect(x - half, shaftTop, width, shaftBottom - shaftTop);
  // Side depth
  ctx.fillStyle = '#D1C2AD';
  ctx.fillRect(x - half, shaftTop, 2, shaftBottom - shaftTop);
  ctx.fillStyle = '#F8F1E7';
  ctx.fillRect(x + half - 2, shaftTop, 2, shaftBottom - shaftTop);

  // Fluting (pixel stripes)
  ctx.fillStyle = '#DACBB8';
  for (let fx = x - half + 2; fx <= x + half - 3; fx += 2) {
    ctx.fillRect(fx, shaftTop + 2, 1, shaftBottom - shaftTop - 4);
  }

  // Capital
  ctx.fillStyle = '#F6ECDD';
  ctx.fillRect(x - half - 3, shaftTop - 5, width + 6, 5);
  ctx.fillStyle = '#E8DACA';
  ctx.fillRect(x - half - 5, shaftTop - 8, width + 10, 3);
  ctx.fillStyle = '#D4AF37';
  ctx.fillRect(x - half - 6, shaftTop - 9, width + 12, 2);

  if (opts?.grand) {
    // Pediment ornament for the temple-grade wall columns
    ctx.fillStyle = '#F1E4D1';
    ctx.beginPath();
    ctx.moveTo(x - half - 2, shaftTop - 5);
    ctx.lineTo(x, shaftTop - 13);
    ctx.lineTo(x + half + 2, shaftTop - 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#D4AF37';
    ctx.fillRect(x - 1, shaftTop - 10, 2, 2);
  }
}

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
    drawTemplePillar(ctx, c.x, c.y, { width: 12, height: 40, grand: true });
  }

  // 상단 벽을 따라 도리아 기둥 (col 0~mapCols-1, row 0 라인)
  const pillarCount = 8;
  for (let i = 1; i <= pillarCount; i++) {
    const pillarCol = Math.floor((mapCols - 1) * i / (pillarCount + 1));
    const p = gridToScreen({ col: pillarCol, row: 0 });
    drawTemplePillar(ctx, p.x, p.y, { width: 10, height: 38, grand: true });
  }

  // 좌측 벽을 따라 도리아 기둥 (col 0, row 0~mapRows-1)
  for (let i = 1; i <= 6; i++) {
    const pillarRow = Math.floor((mapRows - 1) * i / 7);
    const p = gridToScreen({ col: 0, row: pillarRow });
    drawTemplePillar(ctx, p.x, p.y, { width: 10, height: 38, grand: false });
  }
}

export function drawDividerWall(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
): void {
  const { x, y } = gridToScreen({ col, row });
  const isVerticalDivider = col === 12;
  const isMainHorizontalDivider = row === 10;
  const isTempleHorizontalDivider = row === 4;
  const isDoorGap = (isVerticalDivider && (row === 7 || row === 8 || row === 14 || row === 15))
    || (isMainHorizontalDivider && (col === 17 || col === 18))
    || (isTempleHorizontalDivider && (col === 17 || col === 18));
  if (isDoorGap) return;

  // Low divider rail keeps zone separation readable without blocking map/avatars.
  ctx.fillStyle = '#DCCFBD';
  ctx.fillRect(x - 9, y - 10, 18, 4);
  ctx.fillStyle = '#BDAE98';
  ctx.fillRect(x - 9, y - 6, 18, 3);
  ctx.fillStyle = '#D4AF37';
  ctx.fillRect(x - 9, y - 11, 18, 1);

  const drawAccentColumn = (
    (isVerticalDivider && row % 3 === 1)
    || (isMainHorizontalDivider && col % 3 === 2)
    || (isTempleHorizontalDivider && col % 2 === 0)
  );
  if (drawAccentColumn) {
    drawTemplePillar(ctx, x, y, {
      width: isTempleHorizontalDivider ? 10 : 8,
      height: isTempleHorizontalDivider ? 30 : 22,
      grand: isTempleHorizontalDivider,
    });
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
  ctx.globalAlpha = alpha * 0.72;

  const text = `${emoji} ${label}`;
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  // Text only (no label box)
  const ty = y + TILE_H + 9;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillText(text, x + 1, ty + 1);
  ctx.fillStyle = '#F6E9D2';
  ctx.fillText(text, x, ty);
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
  mapMask?: { mapCols: number; mapRows: number },
): void {
  const nightStrength = Math.max(0, Math.min(1, (dayNightPhase - 0.45) / 0.55));
  if (nightStrength <= 0.01) return;

  const mapCols = mapMask?.mapCols ?? 24;
  const mapRows = mapMask?.mapRows ?? 20;
  const top = gridToScreen({ col: 0, row: 0 });
  const right = gridToScreen({ col: mapCols - 1, row: 0 });
  const bottom = gridToScreen({ col: mapCols - 1, row: mapRows - 1 });
  const left = gridToScreen({ col: 0, row: mapRows - 1 });
  const margin = 34;

  // Darken only sky/outside-map area (not temple interior / characters).
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.moveTo(top.x, top.y - TILE_H / 2 - margin);
  ctx.lineTo(right.x + TILE_W / 2 + margin, right.y);
  ctx.lineTo(bottom.x, bottom.y + TILE_H / 2 + margin);
  ctx.lineTo(left.x - TILE_W / 2 - margin, left.y);
  ctx.closePath();
  ctx.clip('evenodd');

  const skyDark = ctx.createLinearGradient(0, 0, 0, height * 0.7);
  skyDark.addColorStop(0, `rgba(14, 10, 36, ${0.72 * nightStrength})`);
  skyDark.addColorStop(0.6, `rgba(20, 14, 46, ${0.42 * nightStrength})`);
  skyDark.addColorStop(1, `rgba(16, 10, 40, ${0.12 * nightStrength})`);
  ctx.fillStyle = skyDark;
  ctx.fillRect(0, 0, width, height);

  if (glowSpots && glowSpots.length > 0) {
    for (const spot of glowSpots) {
      const g = ctx.createRadialGradient(spot.x, spot.y, 0, spot.x, spot.y, 48);
      g.addColorStop(0, `${spot.color}66`);
      g.addColorStop(1, `${spot.color}00`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, 48, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Floor Marble Veining — subtle temple floor detail
// ---------------------------------------------------------------------------

export function drawMarbleVeins(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
): void {
  const { x, y } = gridToScreen({ col, row });
  const hash = (col * 17 + row * 31) % 23;
  const isTemple = col >= 13 && row <= 5;
  const isAgora = col >= 13 && row > 5 && row <= 9;
  const isSanctuary = col >= 13 && row >= 10;
  const isGarden = col <= 7 && row <= 7;
  const isAmbrosia = col <= 7 && row >= 12;
  const isProcession = (col === 11 || col === 12 || col === 13) && row >= 2 && row <= 18;

  if (hash > (isProcession ? 19 : 16)) return;

  let veinMain = '#C8C1B5';
  let veinAlt = '#AFA69A';
  let sparkle = '#F2D675';
  let alpha = 0.13;

  if (isTemple) {
    veinMain = '#D7C29E';
    veinAlt = '#B79764';
    sparkle = '#FFD86A';
    alpha = 0.18;
  } else if (isAgora || isSanctuary) {
    veinMain = '#B6C4D6';
    veinAlt = '#8FA1B8';
    sparkle = '#DDE8F6';
    alpha = 0.16;
  } else if (isGarden) {
    veinMain = '#B7C6B0';
    veinAlt = '#8EA48A';
    sparkle = '#D7E7CC';
    alpha = 0.14;
  } else if (isAmbrosia) {
    veinMain = '#D2B892';
    veinAlt = '#B59467';
    sparkle = '#F1D2A7';
    alpha = 0.16;
  }

  ctx.save();
  ctx.globalAlpha = alpha;

  if (hash % 5 === 0) {
    ctx.fillStyle = veinMain;
    ctx.fillRect(x - 4, y - 1, 8, 1);
    ctx.fillRect(x - 2, y, 4, 1);
  } else if (hash % 5 === 1) {
    ctx.fillStyle = veinAlt;
    ctx.fillRect(x - 1, y - 2, 1, 3);
    ctx.fillRect(x, y - 1, 1, 3);
  } else if (hash % 5 === 2) {
    ctx.fillStyle = veinMain;
    ctx.fillRect(x - 3, y + 1, 6, 1);
    ctx.fillStyle = veinAlt;
    ctx.fillRect(x - 1, y, 2, 1);
  } else if (hash % 5 === 3) {
    ctx.fillStyle = veinAlt;
    ctx.fillRect(x - 2, y - 1, 5, 1);
    ctx.fillRect(x - 1, y, 3, 1);
  } else {
    ctx.fillStyle = sparkle;
    ctx.fillRect(x - 1, y - 1, 1, 1);
    ctx.fillRect(x + 1, y + 1, 1, 1);
    if (hash % 2 === 0) {
      ctx.fillRect(x + 2, y - 1, 1, 1);
    }
  }

  // Strong lane separators for central sacred procession
  if (isProcession && (col === 11 || col === 13)) {
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#E4BF70';
    ctx.fillRect(x - 1, y - 2, 2, 1);
    ctx.fillRect(x - 1, y + 1, 2, 1);
  }

  ctx.restore();
}
