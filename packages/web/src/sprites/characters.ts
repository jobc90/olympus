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
  accent: string;
  trim: string;
  sigil: DivineSigil;
  crown?: 'gold' | 'silver' | 'laurel' | 'horn';
}

interface WorkerStyle {
  hair: string;
  mantle: string;
  trim: string;
  crest?: string;
  prop:
    | 'spear'
    | 'trident'
    | 'blade'
    | 'sunstaff'
    | 'bow'
    | 'wing'
    | 'hammer'
    | 'vine'
    | 'wheat'
    | 'mirror'
    | 'obsidian_staff'
    | 'rose'
    | 'torch'
    | 'halo'
    | 'laurel'
    | 'flute'
    | 'lantern'
    | 'rainbow_ribbon'
    | 'club'
    | 'crescent';
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
  athena: { sheet: 0, accent: '#6F89A8', trim: '#D6E4F5', sigil: WORKER_SIGIL_MAP.athena, crown: 'silver' },
  poseidon: { sheet: 1, accent: '#1E88E5', trim: '#9ED8FF', sigil: WORKER_SIGIL_MAP.poseidon, crown: 'laurel' },
  ares: { sheet: 2, accent: '#B71C1C', trim: '#F28B82', sigil: WORKER_SIGIL_MAP.ares, crown: 'horn' },
  apollo: { sheet: 3, accent: '#E8A317', trim: '#FFE08A', sigil: WORKER_SIGIL_MAP.apollo, crown: 'gold' },
  artemis: { sheet: 4, accent: '#8FA1B2', trim: '#E7EEF7', sigil: WORKER_SIGIL_MAP.artemis, crown: 'silver' },
  hermes: { sheet: 5, accent: '#1D4ED8', trim: '#BFDBFE', sigil: WORKER_SIGIL_MAP.hermes, crown: 'gold' },
  hephaestus: { sheet: 0, accent: '#8D4A23', trim: '#D9A066', sigil: WORKER_SIGIL_MAP.hephaestus },
  dionysus: { sheet: 1, accent: '#7B1FA2', trim: '#D4A7E6', sigil: WORKER_SIGIL_MAP.dionysus, crown: 'laurel' },
  demeter: { sheet: 2, accent: '#6B8E23', trim: '#DCEB9B', sigil: WORKER_SIGIL_MAP.demeter, crown: 'laurel' },
  aphrodite: { sheet: 3, accent: '#C2185B', trim: '#F8BBD0', sigil: WORKER_SIGIL_MAP.aphrodite, crown: 'gold' },
  hera: { sheet: 4, accent: '#6A1B9A', trim: '#D7C3EF', sigil: WORKER_SIGIL_MAP.hera, crown: 'gold' },
  hades: { sheet: 5, accent: '#263238', trim: '#90A4AE', sigil: WORKER_SIGIL_MAP.hades, crown: 'horn' },
  persephone: { sheet: 0, accent: '#2E7D32', trim: '#B9E4BC', sigil: WORKER_SIGIL_MAP.persephone, crown: 'laurel' },
  prometheus: { sheet: 1, accent: '#C2410C', trim: '#FDBA74', sigil: WORKER_SIGIL_MAP.prometheus, crown: 'silver' },
  helios: { sheet: 2, accent: '#F59E0B', trim: '#FDE68A', sigil: WORKER_SIGIL_MAP.helios, crown: 'gold' },
  nike: { sheet: 3, accent: '#8A6D3B', trim: '#F5E5B6', sigil: WORKER_SIGIL_MAP.nike, crown: 'silver' },
  pan: { sheet: 4, accent: '#4E342E', trim: '#C8A27A', sigil: WORKER_SIGIL_MAP.pan, crown: 'horn' },
  hecate: { sheet: 5, accent: '#5B21B6', trim: '#C4B5FD', sigil: WORKER_SIGIL_MAP.hecate, crown: 'silver' },
  iris: { sheet: 0, accent: '#E11D48', trim: '#FDB4C7', sigil: WORKER_SIGIL_MAP.iris, crown: 'gold' },
  heracles: { sheet: 1, accent: '#8D6E63', trim: '#E6CCAE', sigil: WORKER_SIGIL_MAP.heracles, crown: 'horn' },
  selene: { sheet: 2, accent: '#3949AB', trim: '#C5CAE9', sigil: WORKER_SIGIL_MAP.selene, crown: 'silver' },
};

const ZEUS_PROFILE: SpriteProfile = {
  sheet: 5,
  accent: '#CFA93A',
  trim: '#FFE08A',
  sigil: ZEUS_SIGIL,
  crown: 'gold',
};

const HERA_PROFILE: SpriteProfile = {
  sheet: 3,
  accent: '#7E57C2',
  trim: '#D1C4E9',
  sigil: HERA_SIGIL,
  crown: 'gold',
};

const WORKER_STYLE_MAP: Record<WorkerAvatar, WorkerStyle> = {
  athena: { hair: '#6E7F95', mantle: '#5D728B', trim: '#D6E4F5', crest: '#D4AF37', prop: 'spear' },
  poseidon: { hair: '#2C78C4', mantle: '#2273B0', trim: '#9ED8FF', crest: '#B3E5FC', prop: 'trident' },
  ares: { hair: '#5A2A2A', mantle: '#8E2020', trim: '#F28B82', crest: '#C62828', prop: 'blade' },
  apollo: { hair: '#D8A540', mantle: '#C18A2A', trim: '#FFE08A', crest: '#FFF3B0', prop: 'sunstaff' },
  artemis: { hair: '#7D8A72', mantle: '#6B8A59', trim: '#DCE8C8', crest: '#BFD6B3', prop: 'bow' },
  hermes: { hair: '#8C7555', mantle: '#355DA8', trim: '#BFDBFE', crest: '#F7EED7', prop: 'wing' },
  hephaestus: { hair: '#5A4636', mantle: '#885A3C', trim: '#D9A066', crest: '#CFD8DC', prop: 'hammer' },
  dionysus: { hair: '#5B3A67', mantle: '#7B1FA2', trim: '#D4A7E6', crest: '#9CCC65', prop: 'vine' },
  demeter: { hair: '#A68C53', mantle: '#7A9640', trim: '#E8D79B', crest: '#EACB62', prop: 'wheat' },
  aphrodite: { hair: '#8A5A63', mantle: '#C2185B', trim: '#F8BBD0', crest: '#F48FB1', prop: 'mirror' },
  hera: { hair: '#5C3C70', mantle: '#7E57C2', trim: '#D4C3E7', crest: '#F1D37A', prop: 'mirror' },
  hades: { hair: '#2C2F3C', mantle: '#313843', trim: '#90A4AE', crest: '#607D8B', prop: 'obsidian_staff' },
  persephone: { hair: '#7A5565', mantle: '#2E7D32', trim: '#B9E4BC', crest: '#EC6C9E', prop: 'rose' },
  prometheus: { hair: '#5E4638', mantle: '#B45B26', trim: '#FDBA74', crest: '#FFD54F', prop: 'torch' },
  helios: { hair: '#B4862C', mantle: '#D28F1E', trim: '#FDE68A', crest: '#FFF2A8', prop: 'halo' },
  nike: { hair: '#8F7652', mantle: '#9A7B45', trim: '#F5E5B6', crest: '#FFFFFF', prop: 'laurel' },
  pan: { hair: '#4C3C30', mantle: '#5D4535', trim: '#C8A27A', crest: '#9A7450', prop: 'flute' },
  hecate: { hair: '#463A5B', mantle: '#5B21B6', trim: '#C4B5FD', crest: '#E1BEE7', prop: 'lantern' },
  iris: { hair: '#7A5A70', mantle: '#C23F6A', trim: '#FDB4C7', crest: '#7BC7FF', prop: 'rainbow_ribbon' },
  heracles: { hair: '#6C5843', mantle: '#7B5B47', trim: '#E6CCAE', crest: '#C49A6C', prop: 'club' },
  selene: { hair: '#6D7299', mantle: '#4A57A8', trim: '#C5CAE9', crest: '#E8EAF6', prop: 'crescent' },
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
const WORKER_DRAW_SCALE_MAP = 2;
const WORKER_DRAW_SCALE_PANEL = 1.2;
const DIVINE_DRAW_SCALE_MAP = 2;
const DIVINE_DRAW_SCALE_PANEL = 1.6;
const PANEL_AVATAR_Y_THRESHOLD = 96;

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
  if (anim === 'point' || anim === 'nod' || anim === 'raise_hand') {
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

function resolveDrawScale(footY: number, mapScale: number, panelScale: number): number {
  return footY <= PANEL_AVATAR_Y_THRESHOLD ? panelScale : mapScale;
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
  avatar?: WorkerAvatar,
): void {
  const frame = resolveFrame(anim, tick);
  const { row, flip } = resolveDirection(direction);
  const sheet = getCharacterSheet(profile.sheet);

  const bob = anim === 'sit_typing' || anim === 'sit_idle' ? 0 : Math.sin(tick * 0.1) * 0.9;
  const lift = anim === 'celebrate' ? (tick % 18 < 8 ? -2.5 : 0) : 0;
  const footY = y + bob + lift;
  const drawScale = resolveDrawScale(footY, WORKER_DRAW_SCALE_MAP, WORKER_DRAW_SCALE_PANEL);

  const dw = Math.round(FRAME_W * drawScale);
  const dh = Math.round(FRAME_H * drawScale);
  const drawX = Math.round(x - dw / 2);
  const drawY = Math.round(footY - dh + 3);

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

  // Divine accent sash/cape to differentiate 20 workers without sprite distortion.
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = profile.accent;
  ctx.fillRect(Math.round(x - 5), Math.round(drawY + 24), 10, 3);
  ctx.fillRect(Math.round(x - 3), Math.round(drawY + 27), 6, 2);
  ctx.fillStyle = profile.trim;
  ctx.fillRect(Math.round(x - 4), Math.round(drawY + 24), 8, 1);
  ctx.fillRect(Math.round(x - 1), Math.round(drawY + 28), 2, 1);
  ctx.restore();

  if (avatar) {
    drawWorkerTraitDetails(ctx, x, drawY, avatar, tick);
  }

  ctx.save();
  drawCrownAccessory(ctx, x, drawY + 10, profile.crown, tick);
  ctx.restore();
}

function drawWorkerTraitDetails(
  ctx: CanvasRenderingContext2D,
  x: number,
  drawY: number,
  avatar: WorkerAvatar,
  tick: number,
): void {
  const style = WORKER_STYLE_MAP[avatar];
  const p = (ox: number, oy: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x + ox), Math.round(drawY + oy), w, h);
  };

  // Hair/mantle silhouette layer to force visual identity split across 20 workers.
  p(-4, 8, 8, 2, style.hair);
  p(-5, 22, 10, 3, style.mantle);
  p(-4, 25, 8, 2, style.trim);
  if (style.crest) {
    p(-1, 9, 2, 1, style.crest);
  }

  switch (style.prop) {
    case 'spear':
      p(7, 15, 1, 11, '#D4AF37');
      p(6, 15, 3, 1, '#E8D8A6');
      break;
    case 'trident':
      p(7, 14, 1, 12, '#8BD4F2');
      p(6, 14, 3, 1, '#B3E5FC');
      p(6, 16, 3, 1, '#B3E5FC');
      break;
    case 'blade':
      p(7, 16, 1, 9, '#C0C4CC');
      p(6, 16, 2, 1, '#F28B82');
      break;
    case 'sunstaff':
      p(7, 14, 1, 11, '#FFCA55');
      p(6, 13, 3, 2, '#FFE08A');
      break;
    case 'bow':
      p(7, 14, 1, 10, '#A5C38A');
      p(6, 14, 1, 1, '#C7DDB4');
      p(6, 22, 1, 1, '#C7DDB4');
      break;
    case 'wing':
      p(-7, 22, 2, 2, '#E8EEF7');
      p(5, 22, 2, 2, '#E8EEF7');
      break;
    case 'hammer':
      p(7, 19, 1, 7, '#B0BEC5');
      p(6, 19, 3, 2, '#8D6E63');
      break;
    case 'vine':
      p(-7, 20, 1, 8, '#6BAF5E');
      p(-8, 21, 2, 1, '#9CCC65');
      break;
    case 'wheat':
      p(7, 15, 1, 10, '#D7B04B');
      p(6, 16, 2, 1, '#F2CF6C');
      p(6, 18, 2, 1, '#F2CF6C');
      break;
    case 'mirror':
      p(7, 17, 2, 2, '#EADCF5');
      p(7, 19, 1, 5, '#C8B6E3');
      break;
    case 'obsidian_staff':
      p(7, 14, 1, 12, '#37474F');
      p(6, 14, 3, 1, '#90A4AE');
      break;
    case 'rose':
      p(7, 17, 1, 8, '#6FB377');
      p(6, 17, 2, 2, '#EC6C9E');
      break;
    case 'torch':
      p(7, 16, 1, 9, '#8D6E63');
      p(6, 14, 2, 3, tick % 18 < 10 ? '#FFB74D' : '#FFD54F');
      break;
    case 'halo':
      p(-4, 6, 8, 1, '#FDE68A');
      p(-2, 5, 4, 1, '#FFF2A8');
      break;
    case 'laurel':
      p(-4, 7, 8, 1, '#D6D0B3');
      p(-3, 6, 2, 1, '#E9E3C6');
      p(1, 6, 2, 1, '#E9E3C6');
      break;
    case 'flute':
      p(6, 20, 3, 1, '#A78867');
      p(6, 22, 3, 1, '#A78867');
      break;
    case 'lantern':
      p(7, 17, 1, 8, '#8E7CC3');
      p(6, 17, 3, 3, '#C4B5FD');
      break;
    case 'rainbow_ribbon':
      p(-6, 21, 12, 1, '#FF5252');
      p(-5, 22, 10, 1, '#FFEB3B');
      p(-4, 23, 8, 1, '#42A5F5');
      break;
    case 'club':
      p(7, 16, 1, 9, '#8D6E63');
      p(6, 15, 3, 2, '#A88963');
      break;
    case 'crescent':
      p(5, 8, 2, 1, '#E8EAF6');
      p(6, 9, 1, 1, '#C5CAE9');
      break;
    default:
      break;
  }

  switch (avatar) {
    case 'athena':
      p(-3, 8, 6, 1, '#5A6E86');
      p(-1, 6, 2, 2, '#D4AF37');
      break;
    case 'poseidon':
      p(8, 18, 1, 8, '#49A4D4');
      p(7, 18, 3, 1, '#8BD4F2');
      p(7, 20, 3, 1, '#8BD4F2');
      break;
    case 'ares':
      p(-6, 17, 3, 3, '#B71C1C');
      p(4, 17, 3, 3, '#7F1010');
      break;
    case 'apollo':
      p(-4, 6, 8, 1, '#F2C94C');
      p(-1, 5, 2, 1, '#FFE08A');
      break;
    case 'artemis':
      p(6, 15, 2, 6, '#7A8F57');
      p(5, 14, 4, 1, '#A6BC78');
      break;
    case 'hermes':
      p(-6, 24, 3, 1, '#E8EEF7');
      p(3, 24, 3, 1, '#E8EEF7');
      break;
    case 'hephaestus':
      p(6, 22, 3, 2, '#8D6E63');
      p(7, 20, 1, 2, '#B0BEC5');
      break;
    case 'dionysus':
      p(-4, 9, 8, 1, '#7B1FA2');
      p(-3, 10, 2, 1, '#6BAF5E');
      p(1, 10, 2, 1, '#6BAF5E');
      break;
    case 'demeter':
      p(6, 11, 1, 6, '#C49A3A');
      p(5, 12, 2, 1, '#E0B85C');
      p(5, 14, 2, 1, '#E0B85C');
      break;
    case 'aphrodite':
      p(-5, 18, 3, 3, '#E91E63');
      p(-4, 19, 1, 1, '#F8BBD0');
      break;
    case 'hades':
      p(-6, 12, 2, 10, '#263238');
      p(4, 12, 2, 10, '#263238');
      break;
    case 'persephone':
      p(-4, 26, 2, 2, '#EC6C9E');
      p(2, 26, 2, 2, '#EC6C9E');
      break;
    case 'prometheus':
      p(7, 15, 2, 3, '#FF8F00');
      if (tick % 18 < 10) p(8, 13, 1, 2, '#FFD54F');
      break;
    case 'helios':
      p(-5, 10, 10, 1, '#F2C94C');
      p(-1, 9, 2, 1, '#FFE08A');
      break;
    case 'nike':
      p(-6, 16, 2, 4, '#E9E3C6');
      p(4, 16, 2, 4, '#E9E3C6');
      break;
    case 'pan':
      p(-3, 6, 2, 1, '#8D6E63');
      p(1, 6, 2, 1, '#8D6E63');
      break;
    case 'hecate':
      p(-4, 11, 8, 1, '#5B21B6');
      p(-1, 9, 2, 2, '#C4B5FD');
      break;
    case 'iris':
      p(-5, 20, 10, 1, '#F44336');
      p(-4, 21, 8, 1, '#FFEB3B');
      p(-3, 22, 6, 1, '#42A5F5');
      break;
    case 'heracles':
      p(-6, 12, 3, 4, '#8D6E63');
      p(3, 12, 3, 4, '#8D6E63');
      break;
    case 'selene':
      p(-4, 7, 8, 1, '#C5CAE9');
      p(2, 6, 2, 1, '#E8EAF6');
      break;
    case 'hera':
      p(-5, 10, 10, 1, '#7E57C2');
      p(5, 12, 2, 2, '#44B6B6');
      break;
    default:
      break;
  }
}

function drawZeusAvatar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  anim: CharacterAnim,
  tick: number,
): void {
  const moving = anim === 'walk_frame1' || anim === 'walk_frame2' || anim === 'run';
  const bob = moving ? Math.sin(tick * 0.12) * 1.2 : Math.sin(tick * 0.08) * 0.5;
  const footY = y + bob;
  const scale = resolveDrawScale(footY, DIVINE_DRAW_SCALE_MAP, DIVINE_DRAW_SCALE_PANEL);
  const ox = Math.round(x - 5 * scale);
  const oy = Math.round(footY - 17 * scale);
  const step = Math.floor(tick / 8) % 2;

  const p = (gx: number, gy: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(
      Math.round(ox + gx * scale),
      Math.round(oy + gy * scale),
      Math.max(1, Math.round(w * scale)),
      Math.max(1, Math.round(h * scale)),
    );
  };

  ctx.save();
  ctx.fillStyle = 'rgba(8, 14, 24, 0.35)';
  ctx.fillRect(x - 10, y - 2, 20, 3);
  ctx.restore();

  drawDivineSigil(ctx, x, Math.round(oy - 4 * scale), tick, ZEUS_SIGIL);

  // Crown + hair
  p(2, 0, 6, 1, '#E2B64E');
  p(1, 1, 8, 1, '#F4D67C');
  p(1, 2, 2, 1, '#67543D');
  p(7, 2, 2, 1, '#67543D');
  // Face + beard (face restored to readable Zeus proportion)
  p(2, 2, 6, 3, '#E9C79F');
  p(1, 5, 8, 2, '#F2E9DE');
  p(2, 6, 6, 1, '#D9D0C4');
  p(3, 3, 1, 1, '#20252F');
  p(6, 3, 1, 1, '#20252F');

  // Shoulder armor + robe
  p(0, 7, 10, 2, '#D9CCB8');
  p(0, 8, 2, 2, '#CFA93A');
  p(8, 8, 2, 2, '#CFA93A');
  p(2, 9, 6, 5, '#F5EFE6');
  p(4, 9, 2, 5, '#D3B35A');
  p(2, 12, 6, 1, '#CFA93A');

  // Legs + sandals
  if (moving && step === 0) {
    p(2, 14, 2, 2, '#C8CBD3');
    p(6, 14, 2, 3, '#C8CBD3');
  } else if (moving) {
    p(2, 14, 2, 3, '#C8CBD3');
    p(6, 14, 2, 2, '#C8CBD3');
  } else {
    p(2, 14, 2, 3, '#C8CBD3');
    p(6, 14, 2, 3, '#C8CBD3');
  }
  p(2, 17, 2, 1, '#9A8252');
  p(6, 17, 2, 1, '#9A8252');

  // Lightning staff (right hand)
  p(9, 9, 1, 8, '#8E6B3E');
  p(10, 8, 1, 1, '#FFD95E');
  p(9, 7, 1, 1, '#FFD95E');
  p(10, 6, 1, 1, '#FFF2A8');

  drawCrownAccessory(ctx, x, Math.round(oy + 11 * scale), 'gold', tick);
}

function drawHeraAvatar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  anim: CharacterAnim,
  tick: number,
): void {
  const moving = anim === 'walk_frame1' || anim === 'walk_frame2' || anim === 'run';
  const bob = moving ? Math.sin(tick * 0.11) * 1.1 : Math.sin(tick * 0.08) * 0.45;
  const footY = y + bob;
  const scale = resolveDrawScale(footY, DIVINE_DRAW_SCALE_MAP, DIVINE_DRAW_SCALE_PANEL);
  const ox = Math.round(x - 5 * scale);
  const oy = Math.round(footY - 17 * scale);
  const step = Math.floor(tick / 8) % 2;

  const p = (gx: number, gy: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(
      Math.round(ox + gx * scale),
      Math.round(oy + gy * scale),
      Math.max(1, Math.round(w * scale)),
      Math.max(1, Math.round(h * scale)),
    );
  };

  ctx.save();
  ctx.fillStyle = 'rgba(8, 14, 24, 0.35)';
  ctx.fillRect(x - 10, y - 2, 20, 3);
  ctx.restore();

  drawDivineSigil(ctx, x, Math.round(oy - 4 * scale), tick, HERA_SIGIL);

  // Tiara + hair
  p(2, 0, 6, 1, '#F1D37A');
  p(1, 1, 8, 1, '#E4C46C');
  p(1, 2, 2, 4, '#5C3C70');
  p(7, 2, 2, 4, '#5C3C70');

  // Face (restored scale + feminine silhouette)
  p(2, 2, 6, 3, '#F0C9B0');
  p(3, 3, 1, 1, '#1D2430');
  p(6, 3, 1, 1, '#1D2430');
  p(3, 4, 3, 1, '#D494A1');

  // Gown upper
  p(2, 7, 6, 3, '#EDE3F3');
  p(1, 8, 8, 1, '#7E57C2');
  p(3, 9, 4, 1, '#D4C3E7');

  // Long royal dress (feminine silhouette)
  p(2, 10, 6, 4, '#C3A5E6');
  p(1, 12, 8, 3, '#9D74D3');
  p(2, 13, 6, 1, '#F1D37A');
  p(2, 15, 6, 2, '#C3A5E6');

  // Feet
  if (moving && step === 0) {
    p(2, 17, 2, 1, '#6F5697');
    p(6, 17, 2, 1, '#6F5697');
  } else {
    p(3, 17, 2, 1, '#6F5697');
    p(5, 17, 2, 1, '#6F5697');
  }

  // Peacock feather fan motif on side
  p(9, 9, 1, 7, '#5C9E6A');
  p(10, 8, 1, 1, '#44B6B6');
  p(10, 9, 1, 1, '#1E88E5');
  p(10, 10, 1, 1, '#7E57C2');
  p(10, 11, 1, 1, '#F1D37A');

  drawCrownAccessory(ctx, x, Math.round(oy + 11 * scale), 'gold', tick);
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
  if (avatar === 'hera') {
    drawHeraAvatar(ctx, x, y, anim, tick);
    return;
  }
  drawCharacterFromSheet(ctx, x, y, anim, direction, tick, WORKER_PROFILE_MAP[avatar], avatar);
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
  drawZeusAvatar(ctx, x, y, anim, tick);
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
  drawHeraAvatar(ctx, x, y, anim, tick);
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
