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
  const phase = dayNightPhase;
  const t = tick ?? 0;

  // Gradient sky
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  if (phase < 0.3) {
    // Day — celestial light blue
    grad.addColorStop(0, '#B3E5FC');
    grad.addColorStop(1, '#E1F5FE');
  } else if (phase < 0.6) {
    // Sunset — divine purple-gold
    grad.addColorStop(0, '#CE93D8');
    grad.addColorStop(0.5, '#FFD54F');
    grad.addColorStop(1, '#FFF8E1');
  } else {
    // Night — deep divine blue / mystical purple
    grad.addColorStop(0, '#1A237E');
    grad.addColorStop(1, '#311B92');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Golden constellation stars at night
  if (phase > 0.5) {
    const alpha = Math.min(1, (phase - 0.5) * 2);
    ctx.fillStyle = `rgba(255,215,0,${alpha * 0.6})`;
    const stars = [
      [50, 20], [150, 35], [280, 15], [400, 40], [550, 25],
      [700, 30], [100, 55], [350, 50], [500, 45], [650, 55],
      [200, 60], [450, 20], [600, 50],
    ];
    for (const [sx, sy] of stars) {
      // Slight glow for constellation feel
      ctx.globalAlpha = alpha * 0.15;
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha * 0.6;
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  // Floating clouds
  const cloudAlpha = phase < 0.6 ? 0.7 : 0.3;
  ctx.globalAlpha = cloudAlpha;
  const clouds = [
    { x: (t * 0.3) % (width + 200) - 100, y: height * 0.15, w: 80, h: 20 },
    { x: (t * 0.2 + 300) % (width + 200) - 100, y: height * 0.25, w: 60, h: 15 },
    { x: (t * 0.15 + 150) % (width + 200) - 100, y: height * 0.1, w: 100, h: 25 },
    { x: (t * 0.25 + 500) % (width + 200) - 100, y: height * 0.3, w: 70, h: 18 },
    { x: (t * 0.18 + 700) % (width + 200) - 100, y: height * 0.2, w: 90, h: 22 },
  ];
  for (const c of clouds) {
    ctx.fillStyle = phase >= 0.6 ? '#B0BEC5' : (phase >= 0.3 ? '#FFE0B2' : '#FFFFFF');
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(c.x - c.w * 0.25, c.y + 2, c.w * 0.35, c.h * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(c.x + c.w * 0.25, c.y + 2, c.w * 0.35, c.h * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Divine light rays (intermittent)
  if (phase < 0.5 && t % 400 < 60) {
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#FFD700';
    for (let i = 0; i < 5; i++) {
      const rx = ((t * 2 + i * 157) % width);
      ctx.fillRect(rx, 0, 3, height * 0.6);
    }
    ctx.globalAlpha = 1;
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
  ctx.lineWidth = 2;

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
}

export function drawDividerWall(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
): void {
  const { x, y } = gridToScreen({ col, row });
  const wallH = 18;

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
  ctx.globalAlpha = 0.4;
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
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF80';
  ctx.fillText(`${emoji} ${label}`, x, y + TILE_H + 4);
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
  if (dayNightPhase <= 0.3) return;
  const alpha = Math.min(0.35, (dayNightPhase - 0.3) * 0.5);
  ctx.fillStyle = `rgba(26, 35, 126, ${alpha})`;
  ctx.fillRect(0, 0, width, height);

  // Monitor/LED glow spots at night — bright spots that cut through darkness
  if (dayNightPhase > 0.5 && glowSpots) {
    const glowAlpha = Math.min(0.6, (dayNightPhase - 0.5) * 1.2);
    for (const spot of glowSpots) {
      const gradient = ctx.createRadialGradient(spot.x, spot.y, 0, spot.x, spot.y, 20);
      gradient.addColorStop(0, spot.color + Math.round(glowAlpha * 60).toString(16).padStart(2, '0'));
      gradient.addColorStop(1, spot.color + '00');
      ctx.fillStyle = gradient;
      ctx.fillRect(spot.x - 20, spot.y - 20, 40, 40);
    }
  }
}

// ---------------------------------------------------------------------------
// Floor Marble Veining — subtle floor detail
// ---------------------------------------------------------------------------

export function drawFloorScuffs(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
): void {
  // Deterministic marble veins based on tile position (only some tiles get them)
  const hash = (col * 7 + row * 13) % 17;
  if (hash > 2) return; // ~15% of tiles get marble veining

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
  } else {
    // Shadow vein in marble
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#B0BEC5';
    ctx.fillRect(x - 1, y, 3, 1);
  }

  ctx.restore();
}
