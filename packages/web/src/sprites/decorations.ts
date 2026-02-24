// ============================================================================
// Decoration Sprites — Backgrounds, zone labels, night overlay (top-down)
// ============================================================================

import { getTileCenter, TILE_PX } from '../engine/topdown';

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
// Zone Labels — top-down tile-center positioning
// ---------------------------------------------------------------------------

export function drawZoneLabel(
  ctx: CanvasRenderingContext2D,
  label: string,
  emoji: string,
  col: number,
  row: number,
  alpha: number,
): void {
  const { x, y } = getTileCenter({ col, row });
  ctx.save();
  ctx.globalAlpha = alpha * 0.72;

  const text = `${emoji} ${label}`;
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  // Draw text centered on the tile, slightly below center
  const ty = y + TILE_PX / 4 + 9;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillText(text, x + 1, ty + 1);
  ctx.fillStyle = '#F6E9D2';
  ctx.fillText(text, x, ty);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Night Overlay — top-down flat darkening
// ---------------------------------------------------------------------------

export function drawNightOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dayNightPhase: number,
  glowSpots?: Array<{ x: number; y: number; color: string }>,
  _mapMask?: { mapCols: number; mapRows: number },
): void {
  const nightStrength = Math.max(0, Math.min(1, (dayNightPhase - 0.45) / 0.55));
  if (nightStrength <= 0.01) return;

  // Darken the whole canvas with a semi-transparent overlay
  ctx.save();
  ctx.globalAlpha = 0.52 * nightStrength;
  ctx.fillStyle = '#08091A';
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1;

  // Radial glow spots for braziers / light sources
  if (glowSpots && glowSpots.length > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const spot of glowSpots) {
      const g = ctx.createRadialGradient(spot.x, spot.y, 0, spot.x, spot.y, 52);
      g.addColorStop(0, `${spot.color}44`);
      g.addColorStop(1, `${spot.color}00`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, 52, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.restore();
}
