// ============================================================================
// Particle Effects — zzz, sparkle, code rain, smoke, error, coffee, lightning
// ============================================================================

import type { Particle, Bubble } from '../engine/canvas';

// ---------------------------------------------------------------------------
// Particle rendering
// ---------------------------------------------------------------------------

export function drawParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
  const progress = p.age / p.maxAge;
  const alpha = 1 - progress;

  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);

  switch (p.type) {
    case 'zzz':
      drawZzz(ctx, p.x, p.y, progress);
      break;
    case 'sparkle':
      drawSparkle(ctx, p.x, p.y, progress);
      break;
    case 'code':
      drawCodeRain(ctx, p.x, p.y, progress);
      break;
    case 'question':
      drawQuestion(ctx, p.x, p.y, progress);
      break;
    case 'check':
      drawCheck(ctx, p.x, p.y, progress);
      break;
    case 'coffee_steam':
      drawCoffeeSteam(ctx, p.x, p.y, progress);
      break;
    case 'smoke':
      drawSmoke(ctx, p.x, p.y, progress);
      break;
    case 'error':
      drawError(ctx, p.x, p.y, progress);
      break;
    case 'lightning':
      drawLightning(ctx, p.x, p.y, progress);
      break;
    case 'binary':
      drawBinary(ctx, p.x, p.y, progress);
      break;
    case 'lightbulb':
      drawLightbulb(ctx, p.x, p.y, progress);
      break;
    case 'fire':
      drawFire(ctx, p.x, p.y, progress);
      break;
    case 'confetti':
      drawConfetti(ctx, p.x, p.y, progress);
      break;
  }

  ctx.restore();
}

// --- Individual effects ---

function fillPixelEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
): void {
  const mx = Math.round(cx);
  const my = Math.round(cy);
  const ex = Math.max(1, Math.round(rx));
  const ey = Math.max(1, Math.round(ry));
  ctx.fillStyle = color;
  for (let yy = -ey; yy <= ey; yy++) {
    const ny = yy / ey;
    const span = Math.floor(ex * Math.sqrt(Math.max(0, 1 - ny * ny)));
    ctx.fillRect(mx - span, my + yy, span * 2 + 1, 1);
  }
}

function fillPixelRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
): void {
  const ix = Math.round(x);
  const iy = Math.round(y);
  const iw = Math.max(1, Math.round(w));
  const ih = Math.max(1, Math.round(h));
  const ir = Math.max(0, Math.min(Math.round(r), Math.floor(Math.min(iw, ih) / 2)));
  ctx.fillStyle = color;
  if (ir <= 0) {
    ctx.fillRect(ix, iy, iw, ih);
    return;
  }
  for (let yy = 0; yy < ih; yy++) {
    const top = yy < ir ? ir - yy - 1 : 0;
    const bottom = yy >= ih - ir ? yy - (ih - ir) : 0;
    const inset = Math.max(top, bottom);
    ctx.fillRect(ix + inset, iy + yy, Math.max(1, iw - inset * 2), 1);
  }
}

function drawPixelLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
): void {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const tx = Math.round(x1);
  const ty = Math.round(y1);
  const dx = Math.abs(tx - x);
  const sx = x < tx ? 1 : -1;
  const dy = -Math.abs(ty - y);
  const sy = y < ty ? 1 : -1;
  let err = dx + dy;
  ctx.fillStyle = color;
  while (true) {
    ctx.fillRect(x, y, 1, 1);
    if (x === tx && y === ty) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function drawZzz(ctx: CanvasRenderingContext2D, x: number, y: number, progress: number): void {
  const sizes = [6, 8, 10];
  for (let i = 0; i < 3; i++) {
    const zy = y - 10 - i * 10 - progress * 20;
    const zx = x + 5 + i * 4;
    const za = Math.max(0, 1 - progress - i * 0.2);
    ctx.globalAlpha = za;
    ctx.font = `bold ${sizes[i]}px monospace`;
    ctx.fillStyle = '#AB47BC';
    ctx.fillText('z', zx, zy);
  }
}

function drawSparkle(ctx: CanvasRenderingContext2D, x: number, y: number, progress: number): void {
  const size = 3 + (1 - progress) * 4;
  const sparkY = y - 10 - progress * 15;
  ctx.fillStyle = '#FFCA28';
  // Star shape (simple cross)
  ctx.fillRect(x - 1, sparkY - size / 2, 2, size);
  ctx.fillRect(x - size / 2, sparkY - 1, size, 2);
  // Diagonal
  ctx.save();
  ctx.translate(x, sparkY);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-1, -size / 3, 2, size / 1.5);
  ctx.fillRect(-size / 3, -1, size / 1.5, 2);
  ctx.restore();
}

function drawCodeRain(ctx: CanvasRenderingContext2D, x: number, y: number, progress: number): void {
  const chars = '01{}();=>const_let_fn';
  ctx.font = '7px monospace';
  ctx.fillStyle = '#4FC3F7';
  for (let i = 0; i < 5; i++) {
    const cx = x - 8 + i * 5 + Math.sin(progress * 6 + i) * 3;
    const cy = y - 20 + progress * 30 + i * 4;
    const ci = Math.floor((progress * 10 + i) % chars.length);
    ctx.globalAlpha = Math.max(0, 0.8 - i * 0.15 - progress * 0.5);
    ctx.fillText(chars[ci], cx, cy);
  }
}

function drawQuestion(ctx: CanvasRenderingContext2D, x: number, y: number, progress: number): void {
  const qy = y - 10 - progress * 15;
  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = '#FF9800';
  ctx.textAlign = 'center';
  ctx.fillText('?', x, qy);
}

function drawCheck(ctx: CanvasRenderingContext2D, x: number, y: number, progress: number): void {
  const cy = y - 10 - progress * 15;
  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = '#66BB6A';
  ctx.textAlign = 'center';
  ctx.fillText('\u2713', x, cy);
}

function drawCoffeeSteam(ctx: CanvasRenderingContext2D, x: number, y: number, progress: number): void {
  for (let i = 0; i < 3; i++) {
    const sx = x + Math.sin(progress * 4 + i * 2) * 4;
    const sy = y - 10 - progress * 20 - i * 5;
    const size = 2 + (1 - progress) * 2;
    ctx.globalAlpha = Math.max(0, 0.5 - progress * 0.4 - i * 0.1);
    fillPixelEllipse(ctx, sx, sy, size, size, '#FFFFFF');
  }
}

function drawSmoke(ctx: CanvasRenderingContext2D, x: number, y: number, progress: number): void {
  for (let i = 0; i < 4; i++) {
    const sx = x + Math.sin(progress * 3 + i * 1.5) * 6;
    const sy = y - 5 - progress * 25 - i * 4;
    const size = 3 + progress * 4 + i;
    ctx.globalAlpha = Math.max(0, 0.4 - progress * 0.3 - i * 0.08);
    fillPixelEllipse(ctx, sx, sy, size, size, '#78909C');
  }
}

function drawError(ctx: CanvasRenderingContext2D, x: number, y: number, progress: number): void {
  const ey = y - 10 - progress * 10;
  const size = 6 + (1 - progress) * 4;
  // Red circle
  fillPixelEllipse(ctx, x, ey, size, size, '#EF5350');
  // X mark
  drawPixelLine(ctx, x - 3, ey - 3, x + 3, ey + 3, '#FFFFFF');
  drawPixelLine(ctx, x + 3, ey - 3, x - 3, ey + 3, '#FFFFFF');
}

function drawLightning(ctx: CanvasRenderingContext2D, x: number, y: number, progress: number): void {
  const ly = y - 20 - progress * 5;
  drawPixelLine(ctx, x, ly - 8, x - 3, ly - 2, '#FFCA28');
  drawPixelLine(ctx, x - 3, ly - 2, x + 1, ly - 2, '#FFCA28');
  drawPixelLine(ctx, x + 1, ly - 2, x - 2, ly + 6, '#FFCA28');
  drawPixelLine(ctx, x - 1, ly - 8, x - 4, ly - 2, '#FFE082');
}

function drawBinary(ctx: CanvasRenderingContext2D, x: number, y: number, progress: number): void {
  ctx.font = '8px monospace';
  ctx.fillStyle = '#00E676';
  for (let i = 0; i < 4; i++) {
    const bx = x - 6 + i * 5 + Math.sin(progress * 4 + i * 1.5) * 2;
    const by = y - 10 - progress * 25 - i * 3;
    ctx.globalAlpha = Math.max(0, 0.9 - progress * 0.8 - i * 0.1);
    ctx.fillText(((i + Math.floor(progress * 10)) % 2).toString(), bx, by);
  }
}

function drawLightbulb(ctx: CanvasRenderingContext2D, x: number, y: number, progress: number): void {
  const ly = y - 15 - progress * 10;
  const size = 4 + (1 - progress) * 3;
  // Glow
  ctx.globalAlpha = Math.max(0, 0.3 - progress * 0.3);
  fillPixelEllipse(ctx, x, ly, size + 4, size + 4, '#FFCA28');
  // Bulb
  ctx.globalAlpha = Math.max(0, 1 - progress);
  fillPixelEllipse(ctx, x, ly, size, size, '#FFD600');
  // Filament
  fillPixelEllipse(ctx, x, ly, size * 0.4, size * 0.4, '#FFF9C4');
}

function drawFire(ctx: CanvasRenderingContext2D, x: number, y: number, progress: number): void {
  const colors = ['#FF1744', '#FF6D00', '#FFAB00', '#FF3D00'];
  for (let i = 0; i < 5; i++) {
    const fx = x - 4 + i * 2 + Math.sin(progress * 8 + i * 2) * 2;
    const fy = y - 2 - progress * 8 - Math.random() * 4 - i * 2;
    const size = 3 + (1 - progress) * 2 - i * 0.3;
    ctx.globalAlpha = Math.max(0, 0.8 - progress * 0.6 - i * 0.1);
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(Math.round(fx), Math.round(fy), Math.max(1, Math.round(size)), Math.max(1, Math.round(size)));
  }
}

function drawConfetti(ctx: CanvasRenderingContext2D, x: number, y: number, progress: number): void {
  const colors = ['#FF1744', '#2979FF', '#00E676', '#FFEA00', '#D500F9', '#FF6D00'];
  for (let i = 0; i < 6; i++) {
    const cx = x - 8 + i * 4 + Math.sin(progress * 5 + i * 1.2) * 6;
    const cy = y - 20 + progress * 30 + i * 3;
    const size = 2 + (1 - progress);
    ctx.globalAlpha = Math.max(0, 1 - progress * 0.8 - i * 0.05);
    ctx.fillStyle = colors[i % colors.length];
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(progress * 3 + i);
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Bubble rendering
// ---------------------------------------------------------------------------

export function drawBubble(ctx: CanvasRenderingContext2D, bubble: Bubble): void {
  const alpha = Math.min(1, bubble.ttl / 30);
  ctx.save();
  ctx.globalAlpha = alpha;

  const padding = 6;
  ctx.font = '9px monospace';
  const metrics = ctx.measureText(bubble.text);
  const bw = metrics.width + padding * 2;
  const bh = 16;
  const bx = bubble.x - bw / 2;
  const by = bubble.y - bh - 8;

  // Bubble background
  fillPixelRoundedRect(ctx, bx, by, bw, bh, 4, '#FFFFFFEE');
  ctx.strokeStyle = '#00000020';
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(bx), Math.round(by), Math.round(bw), Math.round(bh));

  // Tail
  ctx.fillStyle = '#FFFFFFEE';
  ctx.fillRect(Math.round(bubble.x - 2), Math.round(by + bh), 5, 1);
  ctx.fillRect(Math.round(bubble.x - 1), Math.round(by + bh + 1), 3, 1);
  ctx.fillRect(Math.round(bubble.x), Math.round(by + bh + 2), 1, 2);

  // Text
  ctx.fillStyle = '#333333';
  ctx.textAlign = 'center';
  ctx.fillText(bubble.text, bubble.x, by + 11);

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Particle factory helpers
// ---------------------------------------------------------------------------

export function createParticle(
  type: Particle['type'],
  x: number, y: number,
  maxAge?: number,
): Particle {
  return {
    type,
    x,
    y,
    age: 0,
    maxAge: maxAge ?? getDefaultMaxAge(type),
  };
}

function getDefaultMaxAge(type: Particle['type']): number {
  switch (type) {
    case 'zzz': return 90;
    case 'sparkle': return 40;
    case 'code': return 60;
    case 'question': return 50;
    case 'check': return 50;
    case 'coffee_steam': return 70;
    case 'smoke': return 80;
    case 'error': return 60;
    case 'lightning': return 30;
    case 'binary': return 60;
    case 'lightbulb': return 50;
    case 'fire': return 45;
    case 'confetti': return 70;
    default: return 60;
  }
}

export function tickParticles(particles: Particle[]): Particle[] {
  return particles
    .map(p => ({ ...p, age: p.age + 1 }))
    .filter(p => p.age < p.maxAge);
}
