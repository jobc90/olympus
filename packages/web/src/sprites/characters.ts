// ============================================================================
// Character Sprites — pixel-agents inspired sheet renderer + divine sigils
// ============================================================================

import type { CharacterAnim, Direction, WorkerAvatar, CodexAvatar, GeminiAvatar } from '../engine/canvas';

interface DivineSigil {
  glyph:
    | 'shield'
    | 'trident'
    | 'sword'
    | 'sun'
    | 'moon'
    | 'wing'
    | 'hammer'
    | 'grape'
    | 'wheat'
    | 'heart'
    | 'crown'
    | 'skull'
    | 'flower'
    | 'flame'
    | 'halo'
    | 'trophy'
    | 'horn'
    | 'star'
    | 'rainbow'
    | 'lion'
    | 'crescent'
    | 'bolt'
    | 'peacock';
  ring: string;
  glow: string;
  primary: string;
  secondary: string;
}

interface SpriteProfile {
  sheet: number;
  hue: number;
  saturation: number;
  brightness: number;
  sigil: DivineSigil;
  crown?: 'gold' | 'silver' | 'laurel' | 'horn';
}

const WORKER_SIGIL_MAP: Record<WorkerAvatar, DivineSigil> = {
  athena: { glyph: 'shield', ring: '#5C7A99', glow: '#C62828', primary: '#8FA7BF', secondary: '#C62828' },
  poseidon: { glyph: 'trident', ring: '#0277BD', glow: '#80DEEA', primary: '#008FCB', secondary: '#B3E5FC' },
  ares: { glyph: 'sword', ring: '#C62828', glow: '#FF5252', primary: '#C0C4CC', secondary: '#C62828' },
  apollo: { glyph: 'sun', ring: '#FFC107', glow: '#FFD54F', primary: '#FFD54F', secondary: '#FFB300' },
  artemis: { glyph: 'moon', ring: '#8FA1B2', glow: '#E0E0E0', primary: '#ECEFF1', secondary: '#B0BEC5' },
  hermes: { glyph: 'wing', ring: '#1E88E5', glow: '#FFD700', primary: '#FFFFFF', secondary: '#CFD8DC' },
  hephaestus: { glyph: 'hammer', ring: '#6D4C41', glow: '#FF6D00', primary: '#8D6E63', secondary: '#CFD8DC' },
  dionysus: { glyph: 'grape', ring: '#8E24AA', glow: '#CE93D8', primary: '#8E24AA', secondary: '#66BB6A' },
  demeter: { glyph: 'wheat', ring: '#558B2F', glow: '#FFD600', primary: '#FFD54F', secondary: '#FFB300' },
  aphrodite: { glyph: 'heart', ring: '#EC407A', glow: '#FF1744', primary: '#E91E63', secondary: '#F48FB1' },
  hera: { glyph: 'peacock', ring: '#7B1FA2', glow: '#FFD700', primary: '#7B1FA2', secondary: '#00ACC1' },
  hades: { glyph: 'skull', ring: '#263238', glow: '#64B5F6', primary: '#CFD8DC', secondary: '#37474F' },
  persephone: { glyph: 'flower', ring: '#43A047', glow: '#F06292', primary: '#F48FB1', secondary: '#81C784' },
  prometheus: { glyph: 'flame', ring: '#6D4C41', glow: '#FF6D00', primary: '#FF6D00', secondary: '#FFD54F' },
  helios: { glyph: 'halo', ring: '#FF8F00', glow: '#FFD600', primary: '#FFD600', secondary: '#FFF176' },
  nike: { glyph: 'trophy', ring: '#F5F5F5', glow: '#FFD700', primary: '#FFD700', secondary: '#FFF59D' },
  pan: { glyph: 'horn', ring: '#5D4037', glow: '#43A047', primary: '#8D6E63', secondary: '#A1887F' },
  hecate: { glyph: 'star', ring: '#4A148C', glow: '#D500F9', primary: '#CE93D8', secondary: '#E1BEE7' },
  iris: { glyph: 'rainbow', ring: '#2979FF', glow: '#D500F9', primary: '#FF5252', secondary: '#4FC3F7' },
  heracles: { glyph: 'lion', ring: '#C49A6C', glow: '#FFD700', primary: '#C49A6C', secondary: '#6D4C41' },
  selene: { glyph: 'crescent', ring: '#3949AB', glow: '#E0E0E0', primary: '#E8EAF6', secondary: '#9FA8DA' },
};

const ZEUS_SIGIL: DivineSigil = { glyph: 'bolt', ring: '#FFC107', glow: '#FFD700', primary: '#FFD700', secondary: '#FFF59D' };
const HERA_SIGIL: DivineSigil = { glyph: 'peacock', ring: '#7B1FA2', glow: '#FFD700', primary: '#7B1FA2', secondary: '#00ACC1' };

const WORKER_PROFILE_MAP: Record<WorkerAvatar, SpriteProfile> = {
  athena: { sheet: 0, hue: 205, saturation: 105, brightness: 102, sigil: WORKER_SIGIL_MAP.athena, crown: 'silver' },
  poseidon: { sheet: 1, hue: 190, saturation: 125, brightness: 102, sigil: WORKER_SIGIL_MAP.poseidon, crown: 'laurel' },
  ares: { sheet: 2, hue: 350, saturation: 120, brightness: 95, sigil: WORKER_SIGIL_MAP.ares, crown: 'horn' },
  apollo: { sheet: 3, hue: 45, saturation: 130, brightness: 110, sigil: WORKER_SIGIL_MAP.apollo, crown: 'gold' },
  artemis: { sheet: 4, hue: 95, saturation: 105, brightness: 100, sigil: WORKER_SIGIL_MAP.artemis, crown: 'silver' },
  hermes: { sheet: 5, hue: 220, saturation: 110, brightness: 102, sigil: WORKER_SIGIL_MAP.hermes, crown: 'gold' },
  hephaestus: { sheet: 0, hue: 18, saturation: 110, brightness: 90, sigil: WORKER_SIGIL_MAP.hephaestus },
  dionysus: { sheet: 1, hue: 280, saturation: 120, brightness: 98, sigil: WORKER_SIGIL_MAP.dionysus, crown: 'laurel' },
  demeter: { sheet: 2, hue: 78, saturation: 108, brightness: 100, sigil: WORKER_SIGIL_MAP.demeter, crown: 'laurel' },
  aphrodite: { sheet: 3, hue: 330, saturation: 118, brightness: 106, sigil: WORKER_SIGIL_MAP.aphrodite, crown: 'gold' },
  hera: { sheet: 4, hue: 275, saturation: 120, brightness: 98, sigil: WORKER_SIGIL_MAP.hera, crown: 'gold' },
  hades: { sheet: 5, hue: 235, saturation: 72, brightness: 78, sigil: WORKER_SIGIL_MAP.hades, crown: 'horn' },
  persephone: { sheet: 0, hue: 140, saturation: 108, brightness: 104, sigil: WORKER_SIGIL_MAP.persephone, crown: 'laurel' },
  prometheus: { sheet: 1, hue: 20, saturation: 125, brightness: 96, sigil: WORKER_SIGIL_MAP.prometheus, crown: 'silver' },
  helios: { sheet: 2, hue: 52, saturation: 132, brightness: 112, sigil: WORKER_SIGIL_MAP.helios, crown: 'gold' },
  nike: { sheet: 3, hue: 58, saturation: 95, brightness: 114, sigil: WORKER_SIGIL_MAP.nike, crown: 'silver' },
  pan: { sheet: 4, hue: 36, saturation: 102, brightness: 88, sigil: WORKER_SIGIL_MAP.pan, crown: 'horn' },
  hecate: { sheet: 5, hue: 292, saturation: 126, brightness: 94, sigil: WORKER_SIGIL_MAP.hecate, crown: 'silver' },
  iris: { sheet: 0, hue: 320, saturation: 125, brightness: 104, sigil: WORKER_SIGIL_MAP.iris, crown: 'gold' },
  heracles: { sheet: 1, hue: 28, saturation: 108, brightness: 95, sigil: WORKER_SIGIL_MAP.heracles, crown: 'horn' },
  selene: { sheet: 2, hue: 238, saturation: 100, brightness: 105, sigil: WORKER_SIGIL_MAP.selene, crown: 'silver' },
};

const ZEUS_PROFILE: SpriteProfile = {
  sheet: 5,
  hue: 45,
  saturation: 130,
  brightness: 112,
  sigil: ZEUS_SIGIL,
  crown: 'gold',
};

const HERA_PROFILE: SpriteProfile = {
  sheet: 3,
  hue: 280,
  saturation: 122,
  brightness: 102,
  sigil: HERA_SIGIL,
  crown: 'gold',
};

const SHEET_URLS = [
  '/pixel-agents/char_0.png',
  '/pixel-agents/char_1.png',
  '/pixel-agents/char_2.png',
  '/pixel-agents/char_3.png',
  '/pixel-agents/char_4.png',
  '/pixel-agents/char_5.png',
] as const;

const FRAME_W = 16;
const FRAME_H = 32;
const DRAW_SCALE = 1.85;

const SHEET_CACHE: Array<HTMLImageElement | null> = [null, null, null, null, null, null];
const SHEET_LOADING = new Set<number>();

function getCharacterSheet(index: number): HTMLImageElement | null {
  if (index < 0 || index >= SHEET_URLS.length) return null;
  const cached = SHEET_CACHE[index];
  if (cached && cached.complete) return cached;
  if (typeof Image === 'undefined') return null;
  if (!SHEET_LOADING.has(index)) {
    SHEET_LOADING.add(index);
    const img = new Image();
    img.src = SHEET_URLS[index];
    img.onload = () => {
      SHEET_CACHE[index] = img;
      SHEET_LOADING.delete(index);
    };
    img.onerror = () => {
      SHEET_LOADING.delete(index);
    };
    SHEET_CACHE[index] = img;
  }
  return SHEET_CACHE[index];
}

function resolveFrame(anim: CharacterAnim, tick: number): number {
  if (anim === 'walk_frame1' || anim === 'walk_frame2' || anim === 'run') {
    return Math.floor(tick / 6) % 3; // walk_1..3
  }
  if (anim === 'sit_typing' || anim === 'keyboard_mash' || anim === 'hand_task') {
    return 3 + (Math.floor(tick / 10) % 2); // type_1..2
  }
  if (anim === 'thinking' || anim === 'point' || anim === 'nod') {
    return 5 + (Math.floor(tick / 12) % 2); // read_1..2
  }
  return 1;
}

function resolveDirection(direction: Direction): { row: number; flip: boolean } {
  if (direction === 's') return { row: 0, flip: false };
  if (direction === 'n') return { row: 1, flip: false };
  if (direction === 'e') return { row: 2, flip: false };
  return { row: 2, flip: true };
}

function drawFallbackFigure(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tick: number,
  profile: SpriteProfile,
): void {
  ctx.save();
  const bob = Math.sin(tick * 0.09) * 0.8;
  const py = Math.round(y - 26 + bob);
  ctx.fillStyle = 'rgba(9,14,22,0.35)';
  ctx.fillRect(x - 8, y - 2, 16, 3);
  ctx.fillStyle = '#F0DFCA';
  ctx.fillRect(x - 4, py, 8, 8);
  ctx.fillStyle = '#334155';
  ctx.fillRect(x - 5, py + 8, 10, 10);
  ctx.fillStyle = '#111827';
  ctx.fillRect(x - 4, py + 18, 3, 4);
  ctx.fillRect(x + 1, py + 18, 3, 4);
  drawCrownAccessory(ctx, x, py, profile.crown, tick);
  ctx.restore();
}

function drawCrownAccessory(
  ctx: CanvasRenderingContext2D,
  x: number,
  topY: number,
  crown: SpriteProfile['crown'],
  tick: number,
): void {
  if (!crown) return;
  const y = topY - 5;
  if (crown === 'gold') {
    ctx.fillStyle = '#F7C948';
    ctx.fillRect(x - 4, y, 8, 2);
    ctx.fillStyle = '#FFE08A';
    ctx.fillRect(x - 2, y - 1, 1, 1);
    ctx.fillRect(x, y - 2, 1, 1);
    ctx.fillRect(x + 2, y - 1, 1, 1);
    if (tick % 24 < 10) {
      ctx.fillStyle = '#FFF7D6';
      ctx.fillRect(x, y - 3, 1, 1);
    }
    return;
  }
  if (crown === 'silver') {
    ctx.fillStyle = '#D6DEE8';
    ctx.fillRect(x - 4, y, 8, 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x, y - 1, 1, 1);
    return;
  }
  if (crown === 'laurel') {
    ctx.fillStyle = '#6FA65C';
    ctx.fillRect(x - 4, y, 8, 1);
    ctx.fillRect(x - 3, y - 1, 2, 1);
    ctx.fillRect(x + 1, y - 1, 2, 1);
    return;
  }
  if (crown === 'horn') {
    ctx.fillStyle = '#9A7450';
    ctx.fillRect(x - 4, y - 1, 2, 1);
    ctx.fillRect(x + 2, y - 1, 2, 1);
  }
}

function drawDivineSigil(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tick: number,
  sigil: DivineSigil,
): void {
  const bob = Math.sin(tick * 0.08) * 1;
  const sy = y + bob;
  const pulse = 0.22 + 0.16 * (0.5 + 0.5 * Math.sin(tick * 0.12));

  ctx.save();
  ctx.shadowColor = sigil.glow;
  ctx.shadowBlur = 4;
  ctx.globalAlpha = pulse;
  ctx.fillStyle = sigil.glow;
  ctx.beginPath();
  ctx.arc(x, sy, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = '#F7F2E8';
  ctx.beginPath();
  ctx.arc(x, sy, 4.75, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = sigil.ring;
  ctx.lineWidth = 1.25;
  ctx.stroke();
  ctx.restore();

  drawSigilGlyph(ctx, x, sy, sigil, tick);
}

function drawSigilGlyph(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  sigil: DivineSigil,
  tick: number,
): void {
  const ox = Math.round(cx - 3);
  const oy = Math.round(cy - 3);
  const p = (gx: number, gy: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(ox + gx, oy + gy, 1, 1);
  };
  const a = sigil.primary;
  const b = sigil.secondary;

  switch (sigil.glyph) {
    case 'shield':
      p(3, 0, a); p(2, 1, a); p(3, 1, a); p(4, 1, a);
      p(1, 2, b); p(5, 2, b); p(1, 3, b); p(5, 3, b);
      p(2, 4, a); p(4, 4, a); p(3, 5, b); p(3, 6, a);
      break;
    case 'trident':
      p(2, 0, b); p(3, 0, a); p(4, 0, b);
      p(2, 1, a); p(3, 1, a); p(4, 1, a);
      p(3, 2, a); p(3, 3, a); p(3, 4, a); p(3, 5, a); p(3, 6, a);
      p(1, 3, b); p(2, 3, b); p(4, 3, b); p(5, 3, b);
      break;
    case 'sword':
      p(3, 0, b); p(3, 1, a); p(3, 2, a); p(3, 3, a); p(3, 4, a);
      p(2, 4, b); p(4, 4, b); p(1, 5, b); p(2, 5, b); p(4, 5, b); p(5, 5, b);
      p(3, 6, b);
      break;
    case 'sun':
      p(3, 0, b); p(1, 1, b); p(3, 1, a); p(5, 1, b);
      p(0, 3, b); p(1, 3, a); p(2, 3, a); p(3, 3, a); p(4, 3, a); p(5, 3, a); p(6, 3, b);
      p(1, 5, b); p(3, 5, a); p(5, 5, b); p(3, 6, b);
      break;
    case 'moon':
      p(4, 0, a); p(3, 1, a); p(4, 1, a); p(2, 2, a); p(3, 2, a);
      p(2, 3, a); p(3, 3, b); p(2, 4, a); p(3, 4, a); p(3, 5, a); p(4, 5, a);
      break;
    case 'wing':
      p(1, 3, a); p(2, 2, a); p(2, 3, b); p(3, 1, a); p(3, 2, b); p(3, 3, b);
      p(4, 2, a); p(4, 3, b); p(5, 3, a);
      break;
    case 'hammer':
      p(1, 1, b); p(2, 1, b); p(3, 1, b); p(4, 1, b); p(5, 1, b);
      p(2, 2, a); p(3, 2, a); p(4, 2, a); p(3, 3, a); p(3, 4, a); p(3, 5, b); p(3, 6, b);
      break;
    case 'grape':
      p(3, 0, b); p(2, 1, a); p(3, 1, a); p(4, 1, a);
      p(2, 2, a); p(3, 2, a); p(4, 2, a);
      p(3, 3, a); p(2, 4, a); p(4, 4, a);
      break;
    case 'wheat':
      p(3, 0, b); p(3, 1, a); p(2, 1, b); p(4, 1, b);
      p(3, 2, a); p(2, 2, b); p(4, 2, b);
      p(3, 3, a); p(2, 3, b); p(4, 3, b);
      p(3, 4, a); p(3, 5, a); p(3, 6, b);
      break;
    case 'heart':
      p(2, 1, a); p(4, 1, a); p(1, 2, a); p(2, 2, b); p(3, 2, a); p(4, 2, b); p(5, 2, a);
      p(2, 3, a); p(3, 3, a); p(4, 3, a); p(3, 4, b); p(3, 5, a);
      break;
    case 'crown':
      p(1, 2, a); p(2, 1, b); p(3, 2, a); p(4, 1, b); p(5, 2, a);
      p(1, 3, b); p(2, 3, b); p(3, 3, b); p(4, 3, b); p(5, 3, b);
      break;
    case 'skull':
      p(2, 1, a); p(3, 1, a); p(4, 1, a);
      p(1, 2, a); p(2, 2, b); p(3, 2, a); p(4, 2, b); p(5, 2, a);
      p(1, 3, a); p(2, 3, a); p(3, 3, a); p(4, 3, a); p(5, 3, a);
      p(2, 4, b); p(4, 4, b); p(3, 5, b);
      break;
    case 'flower':
      p(3, 1, b); p(2, 2, a); p(4, 2, a); p(1, 3, a); p(3, 3, b); p(5, 3, a); p(2, 4, a); p(4, 4, a);
      p(3, 5, b);
      break;
    case 'flame':
      p(3, 0, b); p(2, 1, a); p(3, 1, b); p(3, 2, a); p(4, 2, b); p(2, 3, a); p(3, 3, a);
      p(2, 4, b); p(3, 4, a); p(3, 5, b);
      break;
    case 'halo':
      p(2, 1, b); p(3, 1, a); p(4, 1, b);
      p(1, 2, a); p(5, 2, a); p(1, 3, a); p(5, 3, a);
      p(2, 4, b); p(3, 4, a); p(4, 4, b);
      break;
    case 'trophy':
      p(1, 1, b); p(2, 1, b); p(3, 1, a); p(4, 1, b); p(5, 1, b);
      p(2, 2, a); p(3, 2, a); p(4, 2, a); p(3, 3, a);
      p(2, 4, b); p(3, 4, b); p(4, 4, b); p(1, 5, b); p(5, 5, b);
      break;
    case 'horn':
      p(1, 1, b); p(2, 1, b); p(2, 2, a); p(3, 2, a); p(4, 3, a); p(5, 4, b); p(6, 5, b);
      break;
    case 'star':
      p(3, 0, b); p(2, 2, a); p(3, 2, b); p(4, 2, a); p(1, 3, a); p(3, 3, b); p(5, 3, a); p(3, 5, b);
      break;
    case 'rainbow':
      p(1, 1, '#F44336'); p(2, 1, '#FF9800'); p(3, 1, '#FFEB3B'); p(4, 1, '#4CAF50'); p(5, 1, '#2196F3');
      p(1, 2, '#EF5350'); p(2, 2, '#FFA726'); p(3, 2, '#FFF176'); p(4, 2, '#66BB6A'); p(5, 2, '#42A5F5');
      p(2, 3, b); p(3, 3, a); p(4, 3, b);
      break;
    case 'lion':
      p(2, 1, b); p(3, 1, a); p(4, 1, b);
      p(1, 2, b); p(2, 2, a); p(3, 2, a); p(4, 2, a); p(5, 2, b);
      p(2, 3, a); p(3, 3, b); p(4, 3, a); p(3, 4, b);
      break;
    case 'crescent':
      p(4, 1, a); p(3, 2, a); p(4, 2, a); p(2, 3, a); p(3, 3, b); p(2, 4, a); p(3, 4, a); p(4, 5, a);
      break;
    case 'bolt':
      p(3, 0, b); p(2, 1, a); p(3, 1, b); p(2, 2, a); p(3, 2, a); p(4, 2, b);
      p(3, 3, a); p(2, 4, a); p(3, 4, b); p(2, 5, a); p(1, 6, b);
      if (tick % 16 < 8) p(4, 1, '#FFFDE7');
      break;
    case 'peacock':
      p(3, 1, a);
      p(1, 2, b); p(3, 2, a); p(5, 2, b);
      p(2, 3, b); p(3, 3, '#FFD700'); p(4, 3, b);
      p(3, 4, a); p(3, 5, b);
      break;
    default:
      break;
  }
}

function drawCharacterFromSheet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  anim: CharacterAnim,
  direction: Direction,
  tick: number,
  profile: SpriteProfile,
): void {
  const frame = resolveFrame(anim, tick);
  const { row, flip } = resolveDirection(direction);
  const sheet = getCharacterSheet(profile.sheet);

  const bob = anim === 'sit_typing' || anim === 'sit_idle' ? 0 : Math.sin(tick * 0.1) * 0.9;
  const lift = anim === 'celebrate' ? (tick % 18 < 8 ? -2.5 : 0) : 0;
  const footY = y + bob + lift;

  const dw = Math.round(FRAME_W * DRAW_SCALE);
  const dh = Math.round(FRAME_H * DRAW_SCALE);
  const drawX = Math.round(x - dw / 2);
  const drawY = Math.round(footY - dh + 4);

  ctx.save();
  ctx.fillStyle = 'rgba(8, 14, 24, 0.34)';
  ctx.fillRect(x - 9, y - 2, 18, 3);
  ctx.restore();

  drawDivineSigil(ctx, x, drawY - 6, tick, profile.sigil);

  if (!sheet || !sheet.complete) {
    drawFallbackFigure(ctx, x, y, tick, profile);
    return;
  }

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.filter = `hue-rotate(${profile.hue}deg) saturate(${profile.saturation}%) brightness(${profile.brightness}%)`;

  if (flip) {
    ctx.translate(x * 2, 0);
    ctx.scale(-1, 1);
  }

  ctx.drawImage(
    sheet,
    frame * FRAME_W,
    row * FRAME_H,
    FRAME_W,
    FRAME_H,
    drawX,
    drawY,
    dw,
    dh,
  );

  ctx.restore();

  ctx.save();
  drawCrownAccessory(ctx, x, drawY + 10, profile.crown, tick);
  ctx.restore();
}

export function drawWorker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  anim: CharacterAnim,
  direction: Direction,
  tick: number,
  avatar: WorkerAvatar,
  _color: string,
  _emoji: string,
  _skinToneIndex?: number,
): void {
  drawCharacterFromSheet(ctx, x, y, anim, direction, tick, WORKER_PROFILE_MAP[avatar]);
}

export function drawCodex(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  anim: CharacterAnim,
  tick: number,
  _avatar: CodexAvatar,
  _emoji: string,
): void {
  drawCharacterFromSheet(ctx, x, y, anim, 's', tick, ZEUS_PROFILE);
}

export function drawGemini(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  anim: CharacterAnim,
  tick: number,
  _avatar: GeminiAvatar,
  _emoji: string,
): void {
  drawCharacterFromSheet(ctx, x, y, anim, 's', tick, HERA_PROFILE);
}

export function drawNameTag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  name: string,
  _color: string,
): void {
  ctx.save();
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#000000';
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    ctx.fillText(name, x + dx, y + 4 + dy);
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(name, x, y + 4);
  ctx.restore();
}

export function drawStatusAura(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  behavior: string,
  tick: number,
): void {
  let color: string;
  switch (behavior) {
    case 'working':
    case 'collaborating':
      color = '#4FC3F7';
      break;
    case 'error':
      color = '#F44336';
      break;
    case 'thinking':
    case 'analyzing':
      color = '#FFD54F';
      break;
    case 'deploying':
      color = '#66BB6A';
      break;
    default:
      return;
  }

  ctx.save();
  const pulse = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(tick * 0.08));
  ctx.globalAlpha = behavior === 'error' ? (tick % 20 < 10 ? 0.5 : 0.1) : pulse;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y - 2, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// NPC Sprites
// ---------------------------------------------------------------------------

export function drawUnicorn(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  direction: Direction,
  tick: number,
): void {
  const scale = 2;
  const ox = x - 12;
  const oy = y - 22;

  ctx.save();
  if (direction === 'w') {
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    ctx.translate(-x, 0);
  }

  const npx = (px: number, py: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(ox + px * scale, oy + py * scale, scale, scale);
  };

  for (let i = 2; i <= 6; i++) npx(i, 5, '#FFFFFF');
  for (let i = 2; i <= 6; i++) npx(i, 6, '#FAFAFA');
  npx(7, 4, '#FFFFFF');
  npx(7, 5, '#FFFFFF');
  npx(8, 2, '#FFD700');
  npx(8, 3, '#FFC107');
  npx(3, 3, '#FF5252');
  npx(4, 3, '#FFD740');
  npx(5, 3, '#69F0AE');
  npx(6, 3, '#40C4FF');
  npx(1, 6, '#40C4FF');
  npx(1, 7, '#69F0AE');

  const legFrame = Math.floor(tick / 8) % 2;
  if (legFrame === 0) {
    npx(3, 7, '#E0E0E0');
    npx(6, 7, '#E0E0E0');
  } else {
    npx(4, 7, '#E0E0E0');
    npx(5, 7, '#E0E0E0');
  }

  npx(7, 4, '#333333');
  ctx.restore();

  if (tick % 30 < 20) {
    ctx.fillStyle = '#FFD70080';
    ctx.fillRect(x - 10 + (tick % 10), y - 20 - (tick % 8), 2, 2);
    ctx.fillRect(x + 5 - (tick % 7), y - 18 - (tick % 6), 2, 2);
  }
}

export function drawCupid(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  direction: Direction,
  tick: number,
): void {
  const scale = 2;
  const ox = x - 12;
  const oy = y - 24;

  ctx.save();
  if (direction === 'w') {
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    ctx.translate(-x, 0);
  }

  const npx = (px: number, py: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(ox + px * scale, oy + py * scale, scale, scale);
  };

  for (let i = 3; i <= 6; i++) npx(i, 6, '#F8BBD0');
  for (let i = 3; i <= 6; i++) npx(i, 7, '#F48FB1');
  for (let i = 3; i <= 6; i++) npx(i, 4, '#FFE0B2');
  for (let i = 3; i <= 6; i++) npx(i, 5, '#FFCC80');
  npx(4, 5, '#333333');
  npx(6, 5, '#333333');
  npx(3, 3, '#FFD740');
  npx(4, 3, '#FFD740');
  npx(5, 3, '#FFD740');
  npx(6, 3, '#FFD740');

  const wingFlutter = Math.floor(tick / 12) % 2 === 0;
  const wingY = wingFlutter ? 5 : 6;
  npx(1, wingY, '#FFFFFF');
  npx(2, wingY + 1, '#F5F5F5');
  npx(7, wingY, '#FFFFFF');
  npx(8, wingY + 1, '#F5F5F5');

  npx(8, 6, '#FFD700');
  npx(9, 6, '#FFC107');

  ctx.restore();

  if (tick % 40 < 30) {
    ctx.fillStyle = '#E91E6380';
    ctx.beginPath();
    const hx = x + 8 + Math.sin(tick * 0.1) * 3;
    const hy = y - 15 - (tick % 20);
    ctx.arc(hx - 1, hy, 2, 0, Math.PI * 2);
    ctx.arc(hx + 1, hy, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}
