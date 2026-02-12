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

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  anim: CharacterAnim,
  direction: Direction,
  tick: number,
  palette: CharPalette,
  emoji: string,
  feature: GodFeature,
): void {
  const scale = 3;
  const ox = x - 18;
  const oy = y - 54;

  ctx.save();

  if (direction === 'w') {
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    ctx.translate(-x, 0);
  }

  const frame = Math.floor(tick / 8) % 2;

  // ── Emoji symbol with sparkle effect ──
  const emojiY = oy - 4;
  const bob = Math.sin(tick * 0.08) * 1.5; // gentle float
  ctx.save();
  if (direction === 'w') {
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    ctx.translate(-x, 0);
  }
  // Glow halo behind emoji
  const glowAlpha = 0.25 + Math.sin(tick * 0.12) * 0.15;
  ctx.shadowColor = '#FFD700';
  ctx.shadowBlur = 8 + Math.sin(tick * 0.1) * 4;
  ctx.font = '22px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(emoji, x, emojiY + bob);
  ctx.shadowBlur = 0;
  // Sparkle particles (4 points rotating around emoji)
  const sparkleR = 14;
  const sparkleCount = 4;
  for (let i = 0; i < sparkleCount; i++) {
    const angle = (tick * 0.05) + (i * Math.PI * 2 / sparkleCount);
    const sx = x + Math.cos(angle) * sparkleR;
    const sy = (emojiY + bob - 6) + Math.sin(angle) * sparkleR * 0.6;
    const sparkAlpha = 0.4 + Math.sin(tick * 0.15 + i * 1.5) * 0.4;
    ctx.globalAlpha = Math.max(0, sparkAlpha);
    ctx.fillStyle = i % 2 === 0 ? '#FFFFFF' : '#FFF9C4';
    ctx.fillRect(sx - 1, sy - 1, 2, 2);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Hair
  for (let i = 3; i <= 8; i++) px(ctx, i, 2, palette.hair, scale, ox, oy);
  for (let i = 2; i <= 9; i++) px(ctx, i, 3, palette.hair, scale, ox, oy);

  // God-specific features (headgear/accessories)
  switch (feature) {
    case 'golden_crown': { // Zeus — Divine Golden Crown with aura
      // Expanded crown base (wider)
      px(ctx, 3, 2, palette.accent, scale, ox, oy);
      px(ctx, 4, 1, palette.accent, scale, ox, oy);
      px(ctx, 5, 1, palette.accentFrame, scale, ox, oy);
      px(ctx, 6, 1, palette.accentFrame, scale, ox, oy);
      px(ctx, 7, 1, palette.accent, scale, ox, oy);
      px(ctx, 8, 2, palette.accent, scale, ox, oy);
      // Crown spires (3 prongs)
      px(ctx, 4, 0, '#FFF176', scale, ox, oy);
      px(ctx, 6, 0, '#FFF176', scale, ox, oy);
      // Center jewel (pulsing glow)
      const zeusGlow = Math.floor(tick / 20) % 3;
      px(ctx, 5, 0, zeusGlow === 0 ? '#FFFFFF' : zeusGlow === 1 ? '#FFF9C4' : '#FFD700', scale, ox, oy);
      // Side glow flickers (divine aura)
      if (Math.floor(tick / 15) % 4 !== 0) {
        px(ctx, 2, 3, 'rgba(255,215,0,0.3)', scale, ox, oy);
        px(ctx, 9, 3, 'rgba(255,215,0,0.3)', scale, ox, oy);
      }
      break;
    }
    case 'warrior_helmet': // Athena
      for (let i = 3; i <= 8; i++) px(ctx, i, 2, '#78909C', scale, ox, oy);
      for (let i = 4; i <= 7; i++) px(ctx, i, 1, '#90A4AE', scale, ox, oy);
      px(ctx, 5, 0, '#D32F2F', scale, ox, oy); // red crest
      px(ctx, 6, 0, '#D32F2F', scale, ox, oy);
      break;
    case 'trident_crown': // Poseidon
      px(ctx, 4, 0, palette.accent, scale, ox, oy);
      px(ctx, 6, 0, palette.accent, scale, ox, oy);
      px(ctx, 8, 0, palette.accent, scale, ox, oy);
      px(ctx, 5, 1, palette.top, scale, ox, oy);
      px(ctx, 6, 1, palette.top, scale, ox, oy);
      px(ctx, 7, 1, palette.top, scale, ox, oy);
      break;
    case 'war_helmet': // Ares
      for (let i = 2; i <= 9; i++) px(ctx, i, 2, '#B71C1C', scale, ox, oy);
      for (let i = 3; i <= 8; i++) px(ctx, i, 1, '#D32F2F', scale, ox, oy);
      px(ctx, 5, 0, '#F44336', scale, ox, oy);
      px(ctx, 6, 0, '#F44336', scale, ox, oy);
      // Visor
      for (let i = 3; i <= 8; i++) px(ctx, i, 3, '#B71C1C', scale, ox, oy);
      break;
    case 'laurel': // Apollo
      px(ctx, 2, 3, palette.accent, scale, ox, oy);
      px(ctx, 3, 2, palette.accent, scale, ox, oy);
      px(ctx, 8, 2, palette.accent, scale, ox, oy);
      px(ctx, 9, 3, palette.accent, scale, ox, oy);
      px(ctx, 2, 4, palette.accentFrame, scale, ox, oy);
      px(ctx, 9, 4, palette.accentFrame, scale, ox, oy);
      break;
    case 'silver_tiara': // Artemis
      px(ctx, 5, 1, '#CFD8DC', scale, ox, oy);
      px(ctx, 6, 1, '#CFD8DC', scale, ox, oy);
      px(ctx, 4, 2, '#B0BEC5', scale, ox, oy);
      px(ctx, 7, 2, '#B0BEC5', scale, ox, oy);
      // Crescent moon
      px(ctx, 5, 0, '#ECEFF1', scale, ox, oy);
      break;
    case 'winged_helm': // Hermes
      for (let i = 4; i <= 7; i++) px(ctx, i, 2, '#ECEFF1', scale, ox, oy);
      // Wings on sides
      px(ctx, 1, 2, '#FFFFFF', scale, ox, oy);
      px(ctx, 2, 1, '#FFFFFF', scale, ox, oy);
      px(ctx, 10, 2, '#FFFFFF', scale, ox, oy);
      px(ctx, 9, 1, '#FFFFFF', scale, ox, oy);
      break;
    case 'soot': // Hephaestus
      px(ctx, 4, 5, '#5D4037', scale, ox, oy);
      px(ctx, 7, 6, '#4E342E', scale, ox, oy);
      px(ctx, 3, 8, '#5D4037', scale, ox, oy);
      break;
    case 'vine_crown': // Dionysus
      px(ctx, 4, 1, '#4CAF50', scale, ox, oy);
      px(ctx, 5, 1, '#7B1FA2', scale, ox, oy); // grape
      px(ctx, 6, 1, '#7B1FA2', scale, ox, oy); // grape
      px(ctx, 7, 1, '#4CAF50', scale, ox, oy);
      px(ctx, 3, 2, '#388E3C', scale, ox, oy);
      px(ctx, 8, 2, '#388E3C', scale, ox, oy);
      break;
    case 'wheat_crown': // Demeter
      px(ctx, 4, 0, '#FFD54F', scale, ox, oy);
      px(ctx, 5, 0, '#FFCA28', scale, ox, oy);
      px(ctx, 6, 0, '#FFD54F', scale, ox, oy);
      px(ctx, 7, 0, '#FFCA28', scale, ox, oy);
      px(ctx, 4, 1, '#FFC107', scale, ox, oy);
      px(ctx, 7, 1, '#FFC107', scale, ox, oy);
      break;
    case 'rose_tiara': // Aphrodite
      px(ctx, 4, 1, '#E91E63', scale, ox, oy);
      px(ctx, 5, 1, '#F48FB1', scale, ox, oy);
      px(ctx, 6, 1, '#E91E63', scale, ox, oy);
      px(ctx, 7, 1, '#F48FB1', scale, ox, oy);
      break;
    case 'royal_crown': // Hera
      px(ctx, 4, 0, '#FFD700', scale, ox, oy);
      px(ctx, 5, 0, '#FFC107', scale, ox, oy);
      px(ctx, 6, 0, '#FFD700', scale, ox, oy);
      px(ctx, 7, 0, '#FFC107', scale, ox, oy);
      for (let i = 3; i <= 8; i++) px(ctx, i, 1, '#FFD700', scale, ox, oy);
      px(ctx, 5, 0, '#E91E63', scale, ox, oy); // jewel
      break;
    case 'dark_helm': // Hades
      for (let i = 2; i <= 9; i++) px(ctx, i, 2, '#212121', scale, ox, oy);
      for (let i = 3; i <= 8; i++) px(ctx, i, 1, '#303030', scale, ox, oy);
      for (let i = 3; i <= 8; i++) px(ctx, i, 3, '#1A1A1A', scale, ox, oy);
      // Eye slits glow
      px(ctx, 5, 3, '#64B5F6', scale, ox, oy);
      px(ctx, 7, 3, '#64B5F6', scale, ox, oy);
      break;
    case 'flower_crown': // Persephone
      px(ctx, 3, 2, '#F48FB1', scale, ox, oy);
      px(ctx, 5, 1, '#FFD54F', scale, ox, oy);
      px(ctx, 7, 1, '#FFFFFF', scale, ox, oy);
      px(ctx, 8, 2, '#F48FB1', scale, ox, oy);
      px(ctx, 4, 1, '#81C784', scale, ox, oy);
      px(ctx, 6, 1, '#81C784', scale, ox, oy);
      break;
    case 'torch': // Prometheus
      // Torch flame drawn near right hand (handled in body rendering too)
      px(ctx, 10, 6, '#FF6D00', scale, ox, oy);
      px(ctx, 10, 5, '#FFAB00', scale, ox, oy);
      px(ctx, 11, 5, '#FF6D00', scale, ox, oy);
      if (Math.floor(tick / 8) % 2 === 0) {
        px(ctx, 10, 4, '#FFD740', scale, ox, oy);
      } else {
        px(ctx, 11, 4, '#FFD740', scale, ox, oy);
      }
      break;
    case 'solar_crown': // Helios
      // Radiating rays
      px(ctx, 5, 0, '#FFD700', scale, ox, oy);
      px(ctx, 6, 0, '#FFD700', scale, ox, oy);
      px(ctx, 3, 1, '#FFC107', scale, ox, oy);
      px(ctx, 8, 1, '#FFC107', scale, ox, oy);
      px(ctx, 2, 2, '#FFCA28', scale, ox, oy);
      px(ctx, 9, 2, '#FFCA28', scale, ox, oy);
      px(ctx, 4, 0, '#FFA000', scale, ox, oy);
      px(ctx, 7, 0, '#FFA000', scale, ox, oy);
      break;
    case 'wings': // Nike
      // Small wings on body sides (drawn with character body)
      px(ctx, 0, 8, '#FFFFFF', scale, ox, oy);
      px(ctx, 0, 7, '#F5F5F5', scale, ox, oy);
      px(ctx, 11, 8, '#FFFFFF', scale, ox, oy);
      px(ctx, 11, 7, '#F5F5F5', scale, ox, oy);
      if (Math.floor(tick / 12) % 2 === 0) {
        px(ctx, 0, 6, '#E0E0E0', scale, ox, oy);
        px(ctx, 11, 6, '#E0E0E0', scale, ox, oy);
      }
      break;
    case 'horns': // Pan
      px(ctx, 3, 1, '#795548', scale, ox, oy);
      px(ctx, 3, 0, '#8D6E63', scale, ox, oy);
      px(ctx, 8, 1, '#795548', scale, ox, oy);
      px(ctx, 8, 0, '#8D6E63', scale, ox, oy);
      break;
    case 'mystic_aura': // Hecate
      if (Math.floor(tick / 10) % 3 === 0) {
        px(ctx, 2, 2, '#B388FF', scale, ox, oy);
        px(ctx, 9, 4, '#9575CD', scale, ox, oy);
      } else if (Math.floor(tick / 10) % 3 === 1) {
        px(ctx, 9, 2, '#B388FF', scale, ox, oy);
        px(ctx, 2, 4, '#9575CD', scale, ox, oy);
      } else {
        px(ctx, 1, 3, '#B388FF', scale, ox, oy);
        px(ctx, 10, 3, '#9575CD', scale, ox, oy);
      }
      break;
    case 'rainbow': // Iris
      // Rainbow gradient on top row
      px(ctx, 3, 1, '#FF5252', scale, ox, oy);
      px(ctx, 4, 1, '#FF9800', scale, ox, oy);
      px(ctx, 5, 1, '#FFEB3B', scale, ox, oy);
      px(ctx, 6, 1, '#4CAF50', scale, ox, oy);
      px(ctx, 7, 1, '#2196F3', scale, ox, oy);
      px(ctx, 8, 1, '#9C27B0', scale, ox, oy);
      break;
    case 'lion_mane': // Heracles
      // Extended mane around head
      px(ctx, 2, 2, '#C49A6C', scale, ox, oy);
      px(ctx, 2, 3, '#DEB887', scale, ox, oy);
      px(ctx, 2, 4, '#C49A6C', scale, ox, oy);
      px(ctx, 9, 2, '#C49A6C', scale, ox, oy);
      px(ctx, 9, 3, '#DEB887', scale, ox, oy);
      px(ctx, 9, 4, '#C49A6C', scale, ox, oy);
      for (let i = 3; i <= 8; i++) px(ctx, i, 1, '#DEB887', scale, ox, oy);
      break;
    case 'crescent_diadem': // Selene — silver crescent moon
      // Silver crescent arc
      px(ctx, 4, 1, '#E0E0E0', scale, ox, oy);
      px(ctx, 5, 0, '#F5F5F5', scale, ox, oy);
      px(ctx, 6, 0, '#FFFFFF', scale, ox, oy);
      px(ctx, 7, 1, '#E0E0E0', scale, ox, oy);
      // Moon glow (subtle shimmer)
      if (Math.floor(tick / 20) % 2 === 0) {
        px(ctx, 5, 1, '#E8EAF6', scale, ox, oy);
        px(ctx, 6, 1, '#C5CAE9', scale, ox, oy);
      } else {
        px(ctx, 5, 1, '#C5CAE9', scale, ox, oy);
        px(ctx, 6, 1, '#E8EAF6', scale, ox, oy);
      }
      break;
    case 'peacock_crown': // Hera (Gemini) — royal diadem with peacock feathers
      // Gold diadem base
      px(ctx, 3, 2, '#FFD700', scale, ox, oy);
      px(ctx, 4, 1, '#FFD700', scale, ox, oy);
      px(ctx, 5, 1, '#FFD700', scale, ox, oy);
      px(ctx, 6, 1, '#FFD700', scale, ox, oy);
      px(ctx, 7, 1, '#FFD700', scale, ox, oy);
      px(ctx, 8, 2, '#FFD700', scale, ox, oy);
      // Peacock feather eyes (teal + purple shimmer)
      px(ctx, 4, 0, '#00897B', scale, ox, oy);
      px(ctx, 6, 0, '#7B1FA2', scale, ox, oy);
      // Center jewel (alternating shimmer)
      if (Math.floor(tick / 30) % 2 === 0) {
        px(ctx, 5, 0, '#E040FB', scale, ox, oy);
      } else {
        px(ctx, 5, 0, '#00BCD4', scale, ox, oy);
      }
      break;
    case 'none':
    default:
      break;
  }

  // Head/face
  for (let i = 3; i <= 8; i++) px(ctx, i, 4, palette.skin, scale, ox, oy);
  for (let i = 3; i <= 8; i++) px(ctx, i, 5, palette.skin, scale, ox, oy);
  for (let i = 3; i <= 8; i++) px(ctx, i, 6, palette.skin, scale, ox, oy);
  for (let i = 4; i <= 7; i++) px(ctx, i, 7, palette.skin, scale, ox, oy);

  // Idle micro-movements: eye look direction
  const eyeShift = (Math.floor(tick / 90) % 3) - 1; // -1, 0, 1
  const eyeLeftX = 5 + (anim === 'stand' || anim === 'sit_idle' ? eyeShift : 0);
  const eyeRightX = 7 + (anim === 'stand' || anim === 'sit_idle' ? eyeShift : 0);

  // Eyes
  if (tick % 120 < 115) {
    px(ctx, eyeLeftX, 5, palette.eyes, scale, ox, oy);
    px(ctx, eyeRightX, 5, palette.eyes, scale, ox, oy);
  } else {
    px(ctx, 5, 5, palette.skinShadow, scale, ox, oy);
    px(ctx, 7, 5, palette.skinShadow, scale, ox, oy);
  }

  // Mouth
  px(ctx, 5, 7, palette.skinShadow, scale, ox, oy);
  px(ctx, 6, 7, palette.skinShadow, scale, ox, oy);

  // Idle breathing: torso shifts 1px on standing/sitting
  const breathOffset = (anim === 'stand' || anim === 'sit_idle') && (Math.floor(tick / 60) % 2 === 0) ? 1 : 0;

  drawBody(ctx, anim, frame, palette, scale, ox, oy + breathOffset);

  ctx.restore();
}

function drawBody(
  ctx: CanvasRenderingContext2D,
  anim: CharacterAnim,
  frame: number,
  p: CharPalette,
  scale: number, ox: number, oy: number,
): void {
  if (anim === 'sit_typing' || anim === 'sit_idle') {
    for (let row = 8; row <= 11; row++) {
      for (let i = 3; i <= 8; i++) {
        px(ctx, i, row, row === 8 ? p.topLight : p.top, scale, ox, oy);
      }
    }
    px(ctx, 5, 10, p.topLight, scale, ox, oy);
    px(ctx, 6, 10, p.topLight, scale, ox, oy);

    if (anim === 'sit_typing') {
      const armOff = frame;
      px(ctx, 2, 9 + armOff, p.top, scale, ox, oy);
      px(ctx, 1, 10, p.skin, scale, ox, oy);
      px(ctx, 9, 9 + armOff, p.top, scale, ox, oy);
      px(ctx, 10, 10, p.skin, scale, ox, oy);
    } else {
      px(ctx, 2, 9, p.top, scale, ox, oy);
      px(ctx, 2, 10, p.skin, scale, ox, oy);
      px(ctx, 9, 9, p.top, scale, ox, oy);
      px(ctx, 9, 10, p.skin, scale, ox, oy);
    }
    for (let i = 3; i <= 8; i++) px(ctx, i, 12, p.pants, scale, ox, oy);
    px(ctx, 3, 13, p.shoes, scale, ox, oy);
    px(ctx, 4, 13, p.shoes, scale, ox, oy);
    px(ctx, 7, 13, p.shoes, scale, ox, oy);
    px(ctx, 8, 13, p.shoes, scale, ox, oy);

  } else if (anim === 'sleep') {
    for (let row = 8; row <= 10; row++) {
      for (let i = 2; i <= 9; i++) {
        px(ctx, i, row, p.top, scale, ox, oy);
      }
    }

  } else if (anim === 'walk_frame1' || anim === 'walk_frame2') {
    for (let row = 8; row <= 12; row++) {
      for (let i = 3; i <= 8; i++) {
        px(ctx, i, row, row === 8 ? p.topLight : p.top, scale, ox, oy);
      }
    }
    if (anim === 'walk_frame1') {
      px(ctx, 2, 9, p.top, scale, ox, oy);
      px(ctx, 2, 10, p.skin, scale, ox, oy);
      px(ctx, 9, 10, p.top, scale, ox, oy);
      px(ctx, 9, 11, p.skin, scale, ox, oy);
      px(ctx, 4, 13, p.pants, scale, ox, oy);
      px(ctx, 4, 14, p.shoes, scale, ox, oy);
      px(ctx, 7, 13, p.pants, scale, ox, oy);
      px(ctx, 8, 14, p.shoes, scale, ox, oy);
    } else {
      px(ctx, 2, 10, p.top, scale, ox, oy);
      px(ctx, 2, 11, p.skin, scale, ox, oy);
      px(ctx, 9, 9, p.top, scale, ox, oy);
      px(ctx, 9, 10, p.skin, scale, ox, oy);
      px(ctx, 3, 13, p.pants, scale, ox, oy);
      px(ctx, 3, 14, p.shoes, scale, ox, oy);
      px(ctx, 7, 13, p.pants, scale, ox, oy);
      px(ctx, 7, 14, p.shoes, scale, ox, oy);
    }

  } else if (anim === 'drink_coffee') {
    for (let row = 8; row <= 12; row++) {
      for (let i = 3; i <= 8; i++) {
        px(ctx, i, row, row === 8 ? p.topLight : p.top, scale, ox, oy);
      }
    }
    px(ctx, 2, 9, p.top, scale, ox, oy);
    px(ctx, 2, 10, p.skin, scale, ox, oy);
    px(ctx, 9, 8, p.top, scale, ox, oy);
    px(ctx, 9, 7, p.skin, scale, ox, oy);
    px(ctx, 10, 7, '#8B6914', scale, ox, oy);
    px(ctx, 10, 6, '#8B6914', scale, ox, oy);
    if (frame === 0) {
      px(ctx, 10, 5, '#FFFFFF80', scale, ox, oy);
      px(ctx, 11, 4, '#FFFFFF60', scale, ox, oy);
    } else {
      px(ctx, 11, 5, '#FFFFFF80', scale, ox, oy);
      px(ctx, 10, 4, '#FFFFFF60', scale, ox, oy);
    }
    drawStandingLegs(ctx, p, scale, ox, oy);

  } else if (anim === 'raise_hand') {
    for (let row = 8; row <= 12; row++) {
      for (let i = 3; i <= 8; i++) {
        px(ctx, i, row, row === 8 ? p.topLight : p.top, scale, ox, oy);
      }
    }
    px(ctx, 2, 9, p.top, scale, ox, oy);
    px(ctx, 2, 10, p.skin, scale, ox, oy);
    px(ctx, 9, 8, p.top, scale, ox, oy);
    px(ctx, 9, 7, p.top, scale, ox, oy);
    px(ctx, 9, 6, p.skin, scale, ox, oy);
    drawStandingLegs(ctx, p, scale, ox, oy);

  } else if (anim === 'headphones') {
    px(ctx, 2, 3, '#FF5722', scale, ox, oy);
    px(ctx, 3, 2, '#FF5722', scale, ox, oy);
    px(ctx, 8, 2, '#FF5722', scale, ox, oy);
    px(ctx, 9, 3, '#FF5722', scale, ox, oy);
    px(ctx, 2, 4, '#FF5722', scale, ox, oy);
    px(ctx, 2, 5, '#FF5722', scale, ox, oy);
    px(ctx, 9, 4, '#FF5722', scale, ox, oy);
    px(ctx, 9, 5, '#FF5722', scale, ox, oy);
    for (let row = 8; row <= 12; row++) {
      for (let i = 3; i <= 8; i++) {
        px(ctx, i, row, row === 8 ? p.topLight : p.top, scale, ox, oy);
      }
    }
    px(ctx, 2, 9, p.top, scale, ox, oy);
    px(ctx, 2, 10, p.skin, scale, ox, oy);
    px(ctx, 9, 9, p.top, scale, ox, oy);
    px(ctx, 9, 10, p.skin, scale, ox, oy);
    drawStandingLegs(ctx, p, scale, ox, oy);

  } else if (anim === 'thumbs_up') {
    for (let row = 8; row <= 12; row++) {
      for (let i = 3; i <= 8; i++) {
        if (i >= 5 && i <= 6 && row >= 9) {
          px(ctx, i, row, p.accent, scale, ox, oy);
        } else {
          px(ctx, i, row, row === 8 ? p.topLight : p.top, scale, ox, oy);
        }
      }
    }
    px(ctx, 2, 9, p.top, scale, ox, oy);
    px(ctx, 2, 10, p.skin, scale, ox, oy);
    px(ctx, 9, 8, p.top, scale, ox, oy);
    px(ctx, 9, 7, p.skin, scale, ox, oy);
    px(ctx, 9, 6, '#FFD700', scale, ox, oy);
    drawStandingLegs(ctx, p, scale, ox, oy);

  } else if (anim === 'hand_task') {
    for (let row = 8; row <= 12; row++) {
      for (let i = 3; i <= 8; i++) {
        if (i >= 5 && i <= 6 && row >= 9) {
          px(ctx, i, row, p.accent, scale, ox, oy);
        } else {
          px(ctx, i, row, row === 8 ? p.topLight : p.top, scale, ox, oy);
        }
      }
    }
    px(ctx, 2, 9, p.top, scale, ox, oy);
    px(ctx, 2, 10, p.skin, scale, ox, oy);
    px(ctx, 9, 9, p.top, scale, ox, oy);
    px(ctx, 10, 9, p.skin, scale, ox, oy);
    px(ctx, 11, 8, '#FFFFFF', scale, ox, oy);
    px(ctx, 11, 9, '#FFFFFF', scale, ox, oy);
    px(ctx, 12, 8, '#FFFFFF', scale, ox, oy);
    px(ctx, 12, 9, '#FFFFFF', scale, ox, oy);
    drawStandingLegs(ctx, p, scale, ox, oy);

  } else if (anim === 'run') {
    for (let row = 8; row <= 12; row++) {
      for (let i = 3; i <= 8; i++) {
        px(ctx, i, row, row === 8 ? p.topLight : p.top, scale, ox, oy);
      }
    }
    // Running arms
    px(ctx, 1, 9, p.top, scale, ox, oy);
    px(ctx, 1, 10, p.skin, scale, ox, oy);
    px(ctx, 10, 8, p.top, scale, ox, oy);
    px(ctx, 10, 9, p.skin, scale, ox, oy);
    // Running legs (wider stance)
    px(ctx, 3, 13, p.pants, scale, ox, oy);
    px(ctx, 2, 14, p.shoes, scale, ox, oy);
    px(ctx, 8, 13, p.pants, scale, ox, oy);
    px(ctx, 9, 14, p.shoes, scale, ox, oy);

  } else if (anim === 'keyboard_mash') {
    // Like sit_typing but head bobs 1px, arms move faster (frame % 4)
    const fastFrame = Math.floor(frame * 2) % 2;
    const headBob = fastFrame;
    for (let row = 8; row <= 11; row++) {
      for (let i = 3; i <= 8; i++) {
        px(ctx, i, row + headBob, row === 8 ? p.topLight : p.top, scale, ox, oy);
      }
    }
    px(ctx, 5, 10 + headBob, p.topLight, scale, ox, oy);
    px(ctx, 6, 10 + headBob, p.topLight, scale, ox, oy);
    const mArmOff = fastFrame;
    px(ctx, 2, 9 + mArmOff, p.top, scale, ox, oy);
    px(ctx, 1, 10, p.skin, scale, ox, oy);
    px(ctx, 9, 9 + (1 - mArmOff), p.top, scale, ox, oy);
    px(ctx, 10, 10, p.skin, scale, ox, oy);
    for (let i = 3; i <= 8; i++) px(ctx, i, 12, p.pants, scale, ox, oy);
    px(ctx, 3, 13, p.shoes, scale, ox, oy);
    px(ctx, 4, 13, p.shoes, scale, ox, oy);
    px(ctx, 7, 13, p.shoes, scale, ox, oy);
    px(ctx, 8, 13, p.shoes, scale, ox, oy);

  } else if (anim === 'stretch') {
    // Arms straight up above head
    for (let row = 8; row <= 12; row++) {
      for (let i = 3; i <= 8; i++) {
        px(ctx, i, row, row === 8 ? p.topLight : p.top, scale, ox, oy);
      }
    }
    // Left arm up
    px(ctx, 2, 8, p.top, scale, ox, oy);
    px(ctx, 2, 7, p.top, scale, ox, oy);
    px(ctx, 2, 6, p.skin, scale, ox, oy);
    // Right arm up
    px(ctx, 9, 8, p.top, scale, ox, oy);
    px(ctx, 9, 7, p.top, scale, ox, oy);
    px(ctx, 9, 6, p.skin, scale, ox, oy);
    drawStandingLegs(ctx, p, scale, ox, oy);

  } else if (anim === 'celebrate') {
    // Both arms up + 1px jump
    const jumpOff = frame === 0 ? -1 : 0;
    for (let row = 8; row <= 12; row++) {
      for (let i = 3; i <= 8; i++) {
        px(ctx, i, row + jumpOff, row === 8 ? p.topLight : p.top, scale, ox, oy);
      }
    }
    // Left arm up (celebration)
    px(ctx, 2, 7 + jumpOff, p.top, scale, ox, oy);
    px(ctx, 1, 6 + jumpOff, p.skin, scale, ox, oy);
    // Right arm up (celebration)
    px(ctx, 9, 7 + jumpOff, p.top, scale, ox, oy);
    px(ctx, 10, 6 + jumpOff, p.skin, scale, ox, oy);
    // Sparkle accents on frame 0
    if (frame === 0) {
      px(ctx, 0, 5, '#FFD700', scale, ox, oy);
      px(ctx, 11, 5, '#FFD700', scale, ox, oy);
    }
    for (let i = 4; i <= 7; i++) px(ctx, i, 13 + jumpOff, p.pants, scale, ox, oy);
    px(ctx, 4, 14 + jumpOff, p.shoes, scale, ox, oy);
    px(ctx, 5, 14 + jumpOff, p.shoes, scale, ox, oy);
    px(ctx, 6, 14 + jumpOff, p.shoes, scale, ox, oy);
    px(ctx, 7, 14 + jumpOff, p.shoes, scale, ox, oy);

  } else if (anim === 'point') {
    // One arm extended horizontally to the right
    for (let row = 8; row <= 12; row++) {
      for (let i = 3; i <= 8; i++) {
        px(ctx, i, row, row === 8 ? p.topLight : p.top, scale, ox, oy);
      }
    }
    // Left arm at side
    px(ctx, 2, 9, p.top, scale, ox, oy);
    px(ctx, 2, 10, p.skin, scale, ox, oy);
    // Right arm extended pointing
    px(ctx, 9, 9, p.top, scale, ox, oy);
    px(ctx, 10, 9, p.top, scale, ox, oy);
    px(ctx, 11, 9, p.skin, scale, ox, oy);
    drawStandingLegs(ctx, p, scale, ox, oy);

  } else if (anim === 'nod') {
    // Like stand but head shifts 1px down on alternate frames
    const nodOff = frame;
    for (let row = 8; row <= 12; row++) {
      for (let i = 3; i <= 8; i++) {
        px(ctx, i, row, row === 8 ? p.topLight : p.top, scale, ox, oy);
      }
    }
    // Nod effect is handled by head in drawCharacter; body is standing pose
    px(ctx, 5, 10, p.topLight, scale, ox, oy);
    px(ctx, 6, 10, p.topLight, scale, ox, oy);
    px(ctx, 2, 9, p.top, scale, ox, oy);
    px(ctx, 2, 10, p.skin, scale, ox, oy);
    px(ctx, 9, 9, p.top, scale, ox, oy);
    px(ctx, 9, 10, p.skin, scale, ox, oy);
    // Slight body lean for nod emphasis
    if (nodOff === 1) {
      px(ctx, 5, 8, p.skinShadow, scale, ox, oy);
    }
    drawStandingLegs(ctx, p, scale, ox, oy);

  } else if (anim === 'wave') {
    // One arm up, hand alternates position (wave motion)
    for (let row = 8; row <= 12; row++) {
      for (let i = 3; i <= 8; i++) {
        px(ctx, i, row, row === 8 ? p.topLight : p.top, scale, ox, oy);
      }
    }
    // Left arm at side
    px(ctx, 2, 9, p.top, scale, ox, oy);
    px(ctx, 2, 10, p.skin, scale, ox, oy);
    // Right arm raised, hand waves
    px(ctx, 9, 8, p.top, scale, ox, oy);
    px(ctx, 9, 7, p.top, scale, ox, oy);
    if (frame === 0) {
      px(ctx, 10, 6, p.skin, scale, ox, oy);
    } else {
      px(ctx, 8, 6, p.skin, scale, ox, oy);
    }
    drawStandingLegs(ctx, p, scale, ox, oy);

  } else {
    // Default standing pose
    for (let row = 8; row <= 12; row++) {
      for (let i = 3; i <= 8; i++) {
        px(ctx, i, row, row === 8 ? p.topLight : p.top, scale, ox, oy);
      }
    }
    px(ctx, 5, 10, p.topLight, scale, ox, oy);
    px(ctx, 6, 10, p.topLight, scale, ox, oy);
    px(ctx, 2, 9, p.top, scale, ox, oy);
    px(ctx, 2, 10, p.skin, scale, ox, oy);
    px(ctx, 9, 9, p.top, scale, ox, oy);
    px(ctx, 9, 10, p.skin, scale, ox, oy);
    drawStandingLegs(ctx, p, scale, ox, oy);
  }
}

function drawStandingLegs(
  ctx: CanvasRenderingContext2D,
  p: CharPalette,
  scale: number, ox: number, oy: number,
): void {
  for (let i = 4; i <= 7; i++) px(ctx, i, 13, p.pants, scale, ox, oy);
  px(ctx, 4, 14, p.shoes, scale, ox, oy);
  px(ctx, 5, 14, p.shoes, scale, ox, oy);
  px(ctx, 6, 14, p.shoes, scale, ox, oy);
  px(ctx, 7, 14, p.shoes, scale, ox, oy);
}

export function drawWorker(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  anim: CharacterAnim,
  direction: Direction,
  tick: number,
  avatar: WorkerAvatar,
  color: string,
  emoji: string,
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
  drawCharacter(ctx, x, y, anim, direction, tick, pal, emoji, featureMap[avatar]);
}

export function drawCodex(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  anim: CharacterAnim,
  tick: number,
  _avatar: CodexAvatar,
  emoji: string,
): void {
  const pal = codexPalette(_avatar);
  drawCharacter(ctx, x, y, anim, 's', tick, pal, emoji, 'golden_crown');
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
  emoji: string,
): void {
  const pal = geminiPalette(_avatar);
  drawCharacter(ctx, x, y, anim, 's', tick, pal, emoji, 'peacock_crown');
}

export function drawNameTag(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  name: string,
  _color: string,
): void {
  ctx.save();
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  // 이름 태그 배경
  const textWidth = ctx.measureText(name).width;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(x - textWidth / 2 - 3, y - 4, textWidth + 6, 16);
  // Dark outline for readability on any background
  ctx.fillStyle = '#000000';
  for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) {
    ctx.fillText(name, x + dx, y + 4 + dy);
  }
  // Bright white text — always readable
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
  const scale = 3;
  const ox = x - 18;
  const oy = y - 30;

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
