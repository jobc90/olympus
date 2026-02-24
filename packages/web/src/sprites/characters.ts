// ============================================================================
// Generic Character Sprite System
// ============================================================================

import type { CharacterAnim, Direction, WorkerAvatar, CodexAvatar, GeminiAvatar } from '../engine/canvas';

interface CharPalette {
  skin: string;
  skinShadow: string;
  hair: string;
  hairLight: string;
  top: string;
  topLight: string;
  accent: string;
  accentFrame: string;
  pants: string;
  shoes: string;
  eyes: string;
}

const SKIN_TONES: Array<{ skin: string; shadow: string }> = [
  { skin: '#FFDAB9', shadow: '#E8C4A0' },  // light
  { skin: '#F5CBA7', shadow: '#D4A574' },  // warm light
  { skin: '#DEB887', shadow: '#C49A6C' },  // medium
  { skin: '#C68642', shadow: '#A0663A' },  // tan
  { skin: '#8D5524', shadow: '#6B3F1C' },  // brown
  { skin: '#4A2C17', shadow: '#3A2010' },  // dark
];

const BASE_SKIN = '#FFDAB9';
const BASE_SKIN_SHADOW = '#E8C4A0';

type GodFeature = 'warrior_helmet' | 'trident_crown' | 'war_helmet' | 'laurel' | 'silver_tiara' | 'winged_helm' | 'soot' | 'vine_crown' | 'wheat_crown' | 'rose_tiara' | 'royal_crown' | 'dark_helm' | 'flower_crown' | 'torch' | 'solar_crown' | 'wings' | 'horns' | 'mystic_aura' | 'rainbow' | 'lion_mane' | 'golden_crown' | 'peacock_crown' | 'crescent_diadem' | 'none';

type SigilGlyph =
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

interface DivineSigil {
  glyph: SigilGlyph;
  ring: string;
  glow: string;
  primary: string;
  secondary: string;
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

function workerPalette(avatar: WorkerAvatar, color: string, skinToneIndex?: number): CharPalette {
  const tone = SKIN_TONES[(skinToneIndex ?? 0) % SKIN_TONES.length];
  switch (avatar) {
    // Athena — Goddess of Wisdom & War (vivid steel blue + crimson crest)
    case 'athena':
      return { skin: tone.skin, skinShadow: tone.shadow, hair: '#2C1810', hairLight: '#4A3728', top: '#5C7A99', topLight: '#7B9DBB', accent: '#C62828', accentFrame: '#8E0000', pants: '#3E5871', shoes: '#37474F', eyes: '#263238' };
    // Poseidon — God of the Sea (deep ocean + seafoam)
    case 'poseidon':
      return { skin: tone.skin, skinShadow: tone.shadow, hair: '#1A3B4D', hairLight: '#2B5B73', top: '#0277BD', topLight: '#039BE5', accent: '#80DEEA', accentFrame: '#4DD0E1', pants: '#01579B', shoes: '#006064', eyes: '#00838F' };
    // Ares — God of War (deep crimson + dark bronze)
    case 'ares':
      return { skin: tone.skin, skinShadow: tone.shadow, hair: '#1A1A1A', hairLight: '#333333', top: '#C62828', topLight: '#E53935', accent: '#FF5252', accentFrame: '#FF1744', pants: '#880E4F', shoes: '#212121', eyes: '#B71C1C' };
    // Apollo — God of Sun & Music (warm gold + ivory)
    case 'apollo':
      return { skin: tone.skin, skinShadow: tone.shadow, hair: '#E65100', hairLight: '#FF6D00', top: '#FFFDE7', topLight: '#FFFFFF', accent: '#FFD600', accentFrame: '#FFAB00', pants: '#FFF8E1', shoes: '#F57F17', eyes: '#E65100' };
    // Artemis — Goddess of the Hunt (deep forest + moonlight silver)
    case 'artemis':
      return { skin: tone.skin, skinShadow: tone.shadow, hair: '#3E2723', hairLight: '#5D4037', top: '#1B5E20', topLight: '#2E7D32', accent: '#E0E0E0', accentFrame: '#BDBDBD', pants: '#33691E', shoes: '#2E7D32', eyes: '#1B5E20' };
    // Hermes — Messenger God (vivid sky blue + winged gold)
    case 'hermes':
      return { skin: tone.skin, skinShadow: tone.shadow, hair: '#6D4C41', hairLight: '#8D6E63', top: '#1E88E5', topLight: '#42A5F5', accent: '#FFD700', accentFrame: '#FFC107', pants: '#ECEFF1', shoes: '#1565C0', eyes: '#0D47A1' };
    // Hephaestus — God of the Forge (volcanic brown + forge fire)
    case 'hephaestus':
      return { skin: tone.skin, skinShadow: tone.shadow, hair: '#3E2723', hairLight: '#4E342E', top: '#5D4037', topLight: '#795548', accent: '#FF6D00', accentFrame: '#E65100', pants: '#3E2723', shoes: '#4E342E', eyes: '#BF360C' };
    // Dionysus — God of Wine (rich grape + amethyst)
    case 'dionysus':
      return { skin: tone.skin, skinShadow: tone.shadow, hair: '#4A148C', hairLight: '#6A1B9A', top: '#8E24AA', topLight: '#AB47BC', accent: '#CE93D8', accentFrame: '#BA68C8', pants: '#6A1B9A', shoes: '#4A148C', eyes: '#AA00FF' };
    // Demeter — Goddess of Harvest (warm earth + harvest gold)
    case 'demeter':
      return { skin: tone.skin, skinShadow: tone.shadow, hair: '#6D4C41', hairLight: '#8D6E63', top: '#558B2F', topLight: '#7CB342', accent: '#FFD600', accentFrame: '#FFAB00', pants: '#4E342E', shoes: '#3E2723', eyes: '#33691E' };
    // Aphrodite — Goddess of Love (vivid rose + pearl)
    case 'aphrodite':
      return { skin: tone.skin, skinShadow: tone.shadow, hair: '#FFAB91', hairLight: '#FFCCBC', top: '#EC407A', topLight: '#F48FB1', accent: '#FF1744', accentFrame: '#F50057', pants: '#FCE4EC', shoes: '#AD1457', eyes: '#C2185B' };
    // Hera — Queen of Gods (royal purple + regal gold)
    case 'hera':
      return { skin: tone.skin, skinShadow: tone.shadow, hair: '#2C1810', hairLight: '#3E2723', top: '#6A1B9A', topLight: '#8E24AA', accent: '#FFD700', accentFrame: '#FFC107', pants: '#4A148C', shoes: '#FFD700', eyes: '#1B5E20' };
    // Hades — God of the Underworld (obsidian + ghostly blue)
    case 'hades':
      return { skin: tone.skin, skinShadow: tone.shadow, hair: '#0D0D0D', hairLight: '#1A1A1A', top: '#1A1A2E', topLight: '#263238', accent: '#546E7A', accentFrame: '#455A64', pants: '#0D0D0D', shoes: '#1A1A1A', eyes: '#64B5F6' };
    // Persephone — Goddess of Spring (spring green + blossom pink)
    case 'persephone':
      return { skin: tone.skin, skinShadow: tone.shadow, hair: '#4E342E', hairLight: '#6D4C41', top: '#43A047', topLight: '#66BB6A', accent: '#F06292', accentFrame: '#EC407A', pants: '#2E7D32', shoes: '#1B5E20', eyes: '#2E7D32' };
    // Prometheus — Titan of Fire (fiery bronze + ember)
    case 'prometheus':
      return { skin: tone.skin, skinShadow: tone.shadow, hair: '#BF360C', hairLight: '#E65100', top: '#6D4C41', topLight: '#8D6E63', accent: '#FF6D00', accentFrame: '#FF9100', pants: '#3E2723', shoes: '#4E342E', eyes: '#DD2C00' };
    // Helios — Titan of the Sun (blazing gold + ivory)
    case 'helios':
      return { skin: tone.skin, skinShadow: tone.shadow, hair: '#FF8F00', hairLight: '#FFA000', top: '#FFF8E1', topLight: '#FFFFFF', accent: '#FFD600', accentFrame: '#FFAB00', pants: '#F57F17', shoes: '#FF8F00', eyes: '#E65100' };
    // Nike — Goddess of Victory (radiant white + victory gold)
    case 'nike':
      return { skin: tone.skin, skinShadow: tone.shadow, hair: '#FFD54F', hairLight: '#FFE082', top: '#FAFAFA', topLight: '#FFFFFF', accent: '#FFD700', accentFrame: '#FFC107', pants: '#F5F5F5', shoes: '#FFD700', eyes: '#F57F17' };
    // Pan — God of the Wild (rustic brown + forest green)
    case 'pan':
      return { skin: tone.skin, skinShadow: tone.shadow, hair: '#4E342E', hairLight: '#6D4C41', top: '#5D4037', topLight: '#795548', accent: '#43A047', accentFrame: '#2E7D32', pants: '#4E342E', shoes: '#33691E', eyes: '#2E7D32' };
    // Hecate — Goddess of Magic (deep midnight + violet flame)
    case 'hecate':
      return { skin: tone.skin, skinShadow: tone.shadow, hair: '#1A1A2E', hairLight: '#16213E', top: '#4A148C', topLight: '#6A1B9A', accent: '#D500F9', accentFrame: '#AA00FF', pants: '#1A237E', shoes: '#0D0D0D', eyes: '#D500F9' };
    // Iris — Goddess of Rainbow (vivid prismatic spectrum)
    case 'iris':
      return { skin: tone.skin, skinShadow: tone.shadow, hair: '#FF1744', hairLight: '#FF5252', top: '#D500F9', topLight: '#E040FB', accent: '#00E5FF', accentFrame: '#18FFFF', pants: '#2979FF', shoes: '#AA00FF', eyes: '#D500F9' };
    // Heracles — Greatest Hero (lion pelt + heroic gold)
    case 'heracles':
      return { skin: tone.skin, skinShadow: tone.shadow, hair: '#3E2723', hairLight: '#5D4037', top: '#C49A6C', topLight: '#DEB887', accent: '#FFD700', accentFrame: '#FFC107', pants: '#795548', shoes: '#4E342E', eyes: '#5D4037' };
    // Selene — Goddess of the Moon (silver + lunar blue)
    case 'selene':
      return { skin: tone.skin, skinShadow: tone.shadow, hair: '#B0BEC5', hairLight: '#CFD8DC', top: '#283593', topLight: '#3949AB', accent: '#E0E0E0', accentFrame: '#BDBDBD', pants: '#1A237E', shoes: '#303F9F', eyes: '#7986CB' };
  }
}

function codexPalette(_avatar: CodexAvatar): CharPalette {
  // Zeus — King of the Gods (Divine Golden Aura)
  return {
    skin: '#FFE0B2', skinShadow: '#FFCC80',
    hair: '#FFD54F', hairLight: '#FFE082',
    top: '#FFC107', topLight: '#FFD54F',
    accent: '#FFD700', accentFrame: '#FF8F00',
    pants: '#F57F17', shoes: '#FFB300', eyes: '#FF6F00',
  };
}

function px(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  color: string,
  scale: number, ox: number, oy: number,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
}

function lighten(hex: string, pct: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + pct);
  const g = Math.min(255, ((n >> 8) & 0xff) + pct);
  const b = Math.min(255, (n & 0xff) + pct);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
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

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  anim: CharacterAnim,
  direction: Direction,
  tick: number,
  palette: CharPalette,
  sigil: DivineSigil,
  feature: GodFeature,
): void {
  const scale = 2;
  const ox = Math.round(x - 18);
  const baseY = Math.round(y - 46);
  const frame = Math.floor(tick / 9) % 2;
  const blink = tick % 110 > 100;
  const sit = anim === 'sit_typing' || anim === 'sit_idle' || anim === 'keyboard_mash';
  const run = anim === 'run' || anim === 'walk_frame1' || anim === 'walk_frame2';
  const bob = sit ? 0 : Math.floor(Math.sin(tick * 0.14) * 1);
  const jump = anim === 'celebrate' && frame === 0 ? -2 : 0;
  const bodyY = baseY + bob + jump;

  const tint = (hex: string, delta: number): string => {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, Math.min(255, ((n >> 16) & 0xff) + delta));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + delta));
    const b = Math.max(0, Math.min(255, (n & 0xff) + delta));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  };

  const p = (gx: number, gy: number, c: string) => px(ctx, gx, gy, c, scale, ox, bodyY);

  const drawAccessory = (): void => {
    const a = palette.accent;
    const af = palette.accentFrame;
    switch (feature) {
      case 'golden_crown':
      case 'royal_crown':
      case 'solar_crown':
      case 'peacock_crown':
        p(6, 0, '#FFD54F'); p(7, -1, '#FFF59D'); p(8, 0, '#FFD54F');
        p(5, 1, '#FFC107'); p(9, 1, '#FFC107');
        p(7, 1, feature === 'peacock_crown' && tick % 28 < 14 ? '#00BCD4' : '#E040FB');
        break;
      case 'warrior_helmet':
      case 'war_helmet':
        for (let i = 5; i <= 9; i++) p(i, 1, '#8A9AA9');
        p(7, -1, '#C62828');
        break;
      case 'trident_crown':
        p(6, 0, a); p(7, -1, a); p(8, 0, a); p(7, 1, af);
        break;
      case 'laurel':
      case 'vine_crown':
      case 'wheat_crown':
      case 'flower_crown':
      case 'rose_tiara':
        p(5, 1, a); p(6, 0, a); p(7, 0, af); p(8, 0, a); p(9, 1, a);
        break;
      case 'silver_tiara':
      case 'crescent_diadem':
        p(6, 0, '#CFD8DC'); p(7, -1, '#FFFFFF'); p(8, 0, '#CFD8DC');
        break;
      case 'winged_helm':
        p(4, 1, '#ECEFF1'); p(10, 1, '#ECEFF1'); p(3, 1, '#FFFFFF'); p(11, 1, '#FFFFFF');
        break;
      case 'dark_helm':
        for (let i = 5; i <= 9; i++) p(i, 1, '#232833');
        p(6, 1, '#7EC8FF'); p(8, 1, '#7EC8FF');
        break;
      case 'torch':
        p(12, 10, '#8D6E63'); p(12, 9, '#FF9800'); p(12, 8, tick % 16 < 8 ? '#FFD54F' : '#FF6D00');
        break;
      case 'wings':
        p(3, 11, '#FFFFFF'); p(3, 12, '#ECEFF1'); p(11, 11, '#FFFFFF'); p(11, 12, '#ECEFF1');
        break;
      case 'horns':
        p(5, 0, '#8D6E63'); p(9, 0, '#8D6E63');
        break;
      case 'mystic_aura':
        if (tick % 24 < 8) { p(3, 3, '#B388FF'); p(11, 4, '#CE93D8'); }
        else if (tick % 24 < 16) { p(11, 3, '#B388FF'); p(3, 4, '#CE93D8'); }
        else { p(2, 4, '#B388FF'); p(12, 4, '#CE93D8'); }
        break;
      case 'rainbow':
        p(5, 0, '#FF5252'); p(6, 0, '#FFEB3B'); p(7, 0, '#4CAF50'); p(8, 0, '#2196F3'); p(9, 0, '#9C27B0');
        break;
      case 'lion_mane':
        p(4, 1, '#C49A6C'); p(5, 0, '#DEB887'); p(9, 0, '#DEB887'); p(10, 1, '#C49A6C');
        break;
      case 'soot':
        p(6, 8, '#5D4037'); p(8, 9, '#4E342E');
        break;
      case 'none':
      default:
        break;
    }
  };

  const drawChestSigil = (): void => {
    const a = sigil.primary;
    const b = sigil.secondary;
    switch (sigil.glyph) {
      case 'trident':
        p(7, 14, a); p(7, 15, a); p(6, 14, b); p(8, 14, b);
        break;
      case 'bolt':
      case 'flame':
        p(7, 14, a); p(6, 15, b); p(7, 15, a);
        break;
      case 'moon':
      case 'crescent':
        p(7, 14, a); p(6, 15, a); p(7, 15, b);
        break;
      default:
        p(7, 14, a); p(8, 14, b);
        break;
    }
  };

  // Ground shadow
  ctx.save();
  ctx.fillStyle = 'rgba(8, 14, 24, 0.34)';
  ctx.fillRect(x - 10, y - 2, 20, 3);
  ctx.restore();

  drawDivineSigil(ctx, x, bodyY - 6, tick, sigil);

  ctx.save();
  if (direction === 'w') {
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    ctx.translate(-x, 0);
  }

  const legBase = sit ? 18 : 17;
  const stride = run ? (frame === 0 ? -1 : 1) : 0;
  // Legs / boots (voxel-style)
  p(6 + Math.min(0, stride), legBase, palette.pants);
  p(6 + Math.min(0, stride), legBase + 1, palette.shoes);
  p(8 + Math.max(0, stride), legBase, tint(palette.pants, 8));
  p(8 + Math.max(0, stride), legBase + 1, palette.shoes);
  if (sit) {
    p(6, legBase + 1, palette.shoes);
    p(8, legBase + 1, palette.shoes);
  }

  // Back cloak
  for (let r = 0; r < 8; r++) {
    for (let c = 5; c <= 10; c++) {
      p(c, 10 + r, tint(palette.top, -26));
    }
  }

  // Torso front with pseudo-3D side shading
  for (let r = 0; r < 7; r++) {
    for (let c = 6; c <= 9; c++) {
      let fill = palette.top;
      if (r === 0) fill = palette.topLight;
      if (c <= 6) fill = tint(fill, -16);
      if (c >= 9) fill = tint(fill, 12);
      p(c, 11 + r, fill);
    }
  }
  p(6, 12, palette.accentFrame);
  p(9, 12, palette.accentFrame);
  p(7, 15, palette.accent);
  p(8, 15, palette.accentFrame);

  // Arms
  const armY = sit ? 13 : 12;
  p(5, armY, tint(palette.top, -10));
  p(5, armY + 1, palette.skin);
  p(10, armY, tint(palette.top, 8));
  p(10, armY + 1, palette.skin);
  if (anim === 'raise_hand' || anim === 'wave' || anim === 'celebrate' || anim === 'stretch') {
    p(10, armY - 1, palette.top);
    p(10, armY - 2, palette.top);
    p(frame === 0 ? 11 : 9, armY - 3, palette.skin);
  }
  if (anim === 'point' || anim === 'hand_task') {
    p(11, armY, palette.top);
    p(12, armY, palette.skin);
    if (anim === 'hand_task') {
      p(13, armY, '#FFFFFF');
      p(13, armY + 1, '#FFFFFF');
    }
  }
  if (anim === 'drink_coffee') {
    p(11, armY - 1, '#8B6914');
    p(11, armY - 2, '#8B6914');
    p(11 + frame, armY - 3, '#FFFFFF');
  }

  // Neck
  p(7, 10, palette.skinShadow);
  p(8, 10, palette.skin);

  // Hair band
  for (let c = 5; c <= 9; c++) {
    p(c, 3, c >= 8 ? palette.hairLight : palette.hair);
  }
  p(6, 2, palette.hairLight);
  p(7, 2, palette.hair);
  p(8, 2, palette.hairLight);

  // Head cube (top / left / right faces)
  for (let c = 6; c <= 8; c++) {
    p(c, 4, tint(palette.skin, 10));
  }
  for (let r = 0; r < 4; r++) {
    p(5, 5 + r, palette.skinShadow);
    p(6, 5 + r, palette.skin);
    p(7, 5 + r, palette.skin);
    p(8, 5 + r, tint(palette.skin, 14));
  }

  if (!blink) {
    p(6, 6, palette.eyes);
    p(7, 6, palette.eyes);
  } else {
    p(6, 6, palette.skinShadow);
    p(7, 6, palette.skinShadow);
  }
  p(7, 8, palette.skinShadow);

  drawAccessory();
  drawChestSigil();

  ctx.restore();
}

export function drawWorker(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  anim: CharacterAnim,
  direction: Direction,
  tick: number,
  avatar: WorkerAvatar,
  color: string,
  _emoji: string,
  skinToneIndex?: number,
): void {
  const pal = workerPalette(avatar, color, skinToneIndex);
  const featureMap: Record<WorkerAvatar, GodFeature> = {
    athena: 'warrior_helmet',
    poseidon: 'trident_crown',
    ares: 'war_helmet',
    apollo: 'laurel',
    artemis: 'silver_tiara',
    hermes: 'winged_helm',
    hephaestus: 'soot',
    dionysus: 'vine_crown',
    demeter: 'wheat_crown',
    aphrodite: 'rose_tiara',
    hera: 'royal_crown',
    hades: 'dark_helm',
    persephone: 'flower_crown',
    prometheus: 'torch',
    helios: 'solar_crown',
    nike: 'wings',
    pan: 'horns',
    hecate: 'mystic_aura',
    iris: 'rainbow',
    heracles: 'lion_mane',
    selene: 'crescent_diadem',
  };
  drawCharacter(ctx, x, y, anim, direction, tick, pal, WORKER_SIGIL_MAP[avatar], featureMap[avatar]);
}

export function drawCodex(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  anim: CharacterAnim,
  tick: number,
  _avatar: CodexAvatar,
  _emoji: string,
): void {
  const pal = codexPalette(_avatar);
  drawCharacter(ctx, x, y, anim, 's', tick, pal, ZEUS_SIGIL, 'golden_crown');
}

function geminiPalette(_avatar: GeminiAvatar): CharPalette {
  // Hera — Queen of the Gods
  return {
    skin: '#F5E6D3', skinShadow: '#D4C4B0',
    hair: '#3E2723', hairLight: '#5D4037',
    top: '#7B1FA2', topLight: '#AB47BC',
    accent: '#FFD700', accentFrame: '#FFC107',
    pants: '#4A148C', shoes: '#5D4037', eyes: '#1B5E20',
  };
}

export function drawGemini(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  anim: CharacterAnim,
  tick: number,
  _avatar: GeminiAvatar,
  _emoji: string,
): void {
  const pal = geminiPalette(_avatar);
  drawCharacter(ctx, x, y, anim, 's', tick, pal, HERA_SIGIL, 'peacock_crown');
}

export function drawNameTag(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  name: string,
  _color: string,
): void {
  ctx.save();
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  // Text only (no rectangle) to avoid map occlusion
  ctx.fillStyle = '#000000';
  for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    ctx.fillText(name, x + dx, y + 4 + dy);
  }
  // Bright text with slight gold tint
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(name, x, y + 4);
  ctx.restore();
}

export function drawStatusAura(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
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
      return; // No aura for idle/offline/etc
  }

  ctx.save();

  // Pulse effect: oscillate alpha between 0.15 and 0.4
  const pulse = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(tick * 0.08));
  ctx.globalAlpha = behavior === 'error' ? (tick % 20 < 10 ? 0.5 : 0.1) : pulse;

  // Draw elliptical glow under character's feet
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y - 2, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.restore();
}

// ---------------------------------------------------------------------------
// NPC Sprites
// ---------------------------------------------------------------------------

export function drawUnicorn(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
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

  function npx(px: number, py: number, color: string): void {
    ctx.fillStyle = color;
    ctx.fillRect(ox + px * scale, oy + py * scale, scale, scale);
  }

  // Body (white)
  for (let i = 2; i <= 6; i++) npx(i, 5, '#FFFFFF');
  for (let i = 2; i <= 6; i++) npx(i, 6, '#FAFAFA');

  // Head
  npx(7, 4, '#FFFFFF');
  npx(7, 5, '#FFFFFF');

  // Horn (golden)
  npx(8, 2, '#FFD700');
  npx(8, 3, '#FFC107');

  // Mane (rainbow)
  npx(3, 3, '#FF5252');
  npx(4, 3, '#FFD740');
  npx(5, 3, '#69F0AE');
  npx(6, 3, '#40C4FF');

  // Tail (rainbow curve)
  npx(1, 6, '#40C4FF');
  npx(1, 7, '#69F0AE');

  // Legs (animated)
  const legFrame = Math.floor(tick / 8) % 2;
  if (legFrame === 0) {
    npx(3, 7, '#E0E0E0');
    npx(6, 7, '#E0E0E0');
  } else {
    npx(4, 7, '#E0E0E0');
    npx(5, 7, '#E0E0E0');
  }

  // Eye
  npx(7, 4, '#333333');

  ctx.restore();

  // Sparkle particles
  if (tick % 30 < 20) {
    ctx.fillStyle = '#FFD70080';
    ctx.fillRect(x - 10 + (tick % 10), y - 20 - (tick % 8), 2, 2);
    ctx.fillRect(x + 5 - (tick % 7), y - 18 - (tick % 6), 2, 2);
  }
}

export function drawCupid(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  direction: Direction,
  tick: number,
): void {
  const scale = 2; // Smaller than workers
  const ox = x - 12;
  const oy = y - 24;

  ctx.save();
  if (direction === 'w') {
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    ctx.translate(-x, 0);
  }

  function npx(px: number, py: number, color: string): void {
    ctx.fillStyle = color;
    ctx.fillRect(ox + px * scale, oy + py * scale, scale, scale);
  }

  // Body (pink)
  for (let i = 3; i <= 6; i++) npx(i, 6, '#F8BBD0');
  for (let i = 3; i <= 6; i++) npx(i, 7, '#F48FB1');

  // Head (peach skin)
  for (let i = 3; i <= 6; i++) npx(i, 4, '#FFE0B2');
  for (let i = 3; i <= 6; i++) npx(i, 5, '#FFCC80');

  // Eyes
  npx(4, 5, '#333333');
  npx(6, 5, '#333333');

  // Hair (golden curls)
  npx(3, 3, '#FFD740');
  npx(4, 3, '#FFD740');
  npx(5, 3, '#FFD740');
  npx(6, 3, '#FFD740');

  // Wings (animated flutter)
  const wingFlutter = Math.floor(tick / 12) % 2 === 0;
  const wingY = wingFlutter ? 5 : 6;
  // Left wing
  npx(1, wingY, '#FFFFFF');
  npx(2, wingY + 1, '#F5F5F5');
  // Right wing
  npx(7, wingY, '#FFFFFF');
  npx(8, wingY + 1, '#F5F5F5');

  // Bow (golden)
  npx(8, 6, '#FFD700');
  npx(9, 6, '#FFC107');

  ctx.restore();

  // Heart particles
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
