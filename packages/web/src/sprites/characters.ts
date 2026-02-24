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

type WorkerLikeAvatar = WorkerAvatar | 'zeus';

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
  sheet: 0,
  accent: '#CFA93A',
  trim: '#FFE08A',
  sigil: ZEUS_SIGIL,
  crown: 'gold',
};

const HERA_PROFILE: SpriteProfile = {
  sheet: 4,
  accent: '#6A1B9A',
  trim: '#D7C3EF',
  sigil: HERA_SIGIL,
  crown: 'gold',
};

const WORKER_STYLE_MAP: Record<WorkerAvatar, WorkerStyle> = {
  athena:     { hair: '#8888AA', mantle: '#445878', trim: '#B8D8F8', crest: '#D0E8FF', prop: 'spear' },
  poseidon:   { hair: '#1A88CC', mantle: '#14507A', trim: '#60D0E8', crest: '#60D0E8', prop: 'trident' },
  ares:       { hair: '#D01818', mantle: '#881010', trim: '#FF3030', crest: '#FF3030', prop: 'blade' },
  apollo:     { hair: '#FFD040', mantle: '#E07010', trim: '#FFE860', crest: '#FFE860', prop: 'sunstaff' },
  artemis:    { hair: '#D0D0F0', mantle: '#2A5E30', trim: '#90C890', crest: '#DDEEDD', prop: 'bow' },
  hermes:     { hair: '#D0A818', mantle: '#28882E', trim: '#FFE840', crest: '#FFE840', prop: 'wing' },
  hephaestus: { hair: '#5A3020', mantle: '#7A5030', trim: '#C06820', crest: '#A04820', prop: 'hammer' },
  dionysus:   { hair: '#7030A0', mantle: '#400870', trim: '#C080FF', crest: '#B070F0', prop: 'vine' },
  demeter:    { hair: '#C09820', mantle: '#507020', trim: '#C8D850', crest: '#D0C040', prop: 'wheat' },
  aphrodite:  { hair: '#FF88CC', mantle: '#E03070', trim: '#FFB8DD', crest: '#FFCCEE', prop: 'rose' },
  hera:       { hair: '#2A1040', mantle: '#3855C0', trim: '#FFD700', crest: '#C8A020', prop: 'mirror' },
  hades:      { hair: '#101010', mantle: '#200A40', trim: '#7040A8', crest: '#502880', prop: 'obsidian_staff' },
  persephone: { hair: '#8838B8', mantle: '#5830A0', trim: '#FF90C8', crest: '#CC88FF', prop: 'laurel' },
  prometheus: { hair: '#2E1A0A', mantle: '#3E2808', trim: '#FF5010', crest: '#C03808', prop: 'torch' },
  helios:     { hair: '#FF9000', mantle: '#FFB820', trim: '#FFF080', crest: '#FFF060', prop: 'halo' },
  nike:       { hair: '#E8E8FF', mantle: '#D8E8FF', trim: '#FFD700', crest: '#E0E8FF', prop: 'wing' },
  pan:        { hair: '#5A2808', mantle: '#4A2E08', trim: '#88C030', crest: '#60A020', prop: 'flute' },
  hecate:     { hair: '#301858', mantle: '#180830', trim: '#9040FF', crest: '#7030CC', prop: 'lantern' },
  iris:       { hair: '#FF6088', mantle: '#C040A0', trim: '#FFB0D0', crest: '#88CCFF', prop: 'rainbow_ribbon' },
  heracles:   { hair: '#A06030', mantle: '#704020', trim: '#E0A060', crest: '#C08840', prop: 'club' },
  selene:     { hair: '#C0C8F0', mantle: '#3040A0', trim: '#D0D8FF', crest: '#E8E8FF', prop: 'crescent' },
};

const ZEUS_WORKER_STYLE: WorkerStyle = {
  hair: '#F8F4E0',
  mantle: '#5A3590',
  trim: '#FFD700',
  crest: '#FFD700',
  prop: 'sunstaff',
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

const HD_PIXEL_CHARACTER_MODE = true;
const HD_RENDER_REV = 'ref_v2';
const HD_SPRITE_W = 16;
const HD_SPRITE_H = 32;
const HD_SPRITE_CACHE = new Map<string, HTMLCanvasElement>();
const HD_SILHOUETTE_CACHE = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

function getSilhouette(src: HTMLCanvasElement): HTMLCanvasElement {
  let sil = HD_SILHOUETTE_CACHE.get(src);
  if (!sil) {
    sil = document.createElement('canvas');
    sil.width = src.width;
    sil.height = src.height;
    const c2 = sil.getContext('2d')!;
    c2.drawImage(src, 0, 0);
    c2.globalCompositeOperation = 'source-in';
    c2.fillStyle = '#0F1621';
    c2.fillRect(0, 0, sil.width, sil.height);
    c2.globalCompositeOperation = 'source-over';
    HD_SILHOUETTE_CACHE.set(src, sil);
  }
  return sil;
}

type HdHairStyle = 'short' | 'long' | 'bun' | 'spike' | 'wavy' | 'hood' | 'braid' | 'curly' | 'pony';
type HdOutfitStyle = 'robe' | 'armor' | 'tunic' | 'dress' | 'gown' | 'cloak';
type HdFacialStyle = 'none' | 'beard' | 'goatee' | 'stubble';
type HdBrowStyle = 'soft' | 'calm' | 'arched' | 'stern' | 'fierce';
type HdMouthStyle = 'smile' | 'line' | 'smirk' | 'frown' | 'open';

interface HdAvatarSpec {
  gender: 'm' | 'f';
  height: number;
  headW: number;
  headH: number;
  shoulder: number;
  waist: number;
  hip: number;
  legW: number;
  skinA: string;
  skinB: string;
  eye: string;
  hairStyle: HdHairStyle;
  outfitStyle: HdOutfitStyle;
  facial: HdFacialStyle;
}

interface HdFaceSpec {
  brow: HdBrowStyle;
  mouth: HdMouthStyle;
  eyeGap: number;
  browLift: number;
}

const HD_BASE_MALE: HdAvatarSpec = {
  gender: 'm',
  height: 56,
  headW: 12,
  headH: 11,
  shoulder: 14,
  waist: 10,
  hip: 12,
  legW: 3,
  skinA: '#F0D8BF',
  skinB: '#D2AE8C',
  eye: '#2A1F18',
  hairStyle: 'short',
  outfitStyle: 'robe',
  facial: 'none',
};

const HD_BASE_FEMALE: HdAvatarSpec = {
  gender: 'f',
  height: 56,
  headW: 11,
  headH: 11,
  shoulder: 12,
  waist: 9,
  hip: 13,
  legW: 2,
  skinA: '#F5DEC8',
  skinB: '#D8B093',
  eye: '#3A2A22',
  hairStyle: 'long',
  outfitStyle: 'dress',
  facial: 'none',
};

const HD_AVATAR_SPECS: Record<WorkerLikeAvatar, HdAvatarSpec> = {
  athena: { ...HD_BASE_FEMALE, height: 58, headW: 10, headH: 10, shoulder: 14, waist: 9, hip: 12, hairStyle: 'bun', outfitStyle: 'armor', skinA: '#F2DEC9', skinB: '#D2AE90', eye: '#24364A' },
  poseidon: { ...HD_BASE_MALE, height: 60, headW: 12, headH: 11, shoulder: 17, waist: 11, hip: 13, legW: 3, hairStyle: 'wavy', outfitStyle: 'robe', facial: 'beard', skinA: '#ECD5BC', skinB: '#C8A487', eye: '#1E4A64' },
  ares: { ...HD_BASE_MALE, height: 59, headW: 11, headH: 10, shoulder: 18, waist: 12, hip: 13, legW: 4, hairStyle: 'spike', outfitStyle: 'armor', facial: 'stubble', skinA: '#E7CCB2', skinB: '#BE9473', eye: '#45211E' },
  apollo: { ...HD_BASE_MALE, height: 54, headW: 10, headH: 9, shoulder: 11, waist: 8, hip: 10, legW: 2, hairStyle: 'spike', outfitStyle: 'tunic', skinA: '#F3DCC2', skinB: '#D0AA85', eye: '#5C4021' },
  artemis: { ...HD_BASE_FEMALE, height: 57, headW: 10, headH: 10, shoulder: 12, waist: 8, hip: 11, hairStyle: 'pony', outfitStyle: 'tunic', skinA: '#F2DEC9', skinB: '#CCAA8C', eye: '#2C4A32' },
  hermes: { ...HD_BASE_MALE, height: 51, headW: 9, headH: 9, shoulder: 10, waist: 8, hip: 9, legW: 2, hairStyle: 'short', outfitStyle: 'tunic', skinA: '#EFD6BB', skinB: '#C6A07F', eye: '#3D2D21' },
  hephaestus: { ...HD_BASE_MALE, height: 60, headW: 13, headH: 11, shoulder: 17, waist: 13, hip: 14, legW: 4, hairStyle: 'short', outfitStyle: 'armor', facial: 'beard', skinA: '#E1C4A6', skinB: '#B98B66', eye: '#3A2A1F' },
  dionysus: { ...HD_BASE_MALE, height: 53, headW: 11, headH: 10, shoulder: 12, waist: 9, hip: 11, legW: 3, hairStyle: 'wavy', outfitStyle: 'robe', skinA: '#EED2B8', skinB: '#C6A07F', eye: '#4A2A56' },
  demeter: { ...HD_BASE_FEMALE, height: 59, headW: 11, headH: 10, shoulder: 13, waist: 9, hip: 14, hairStyle: 'braid', outfitStyle: 'dress', skinA: '#F0D7BE', skinB: '#C8A583', eye: '#5A4726' },
  aphrodite: { ...HD_BASE_FEMALE, height: 55, headW: 10, headH: 9, shoulder: 10, waist: 7, hip: 13, hairStyle: 'curly', outfitStyle: 'gown', skinA: '#F7E1CD', skinB: '#DDB69A', eye: '#5C2F4C' },
  hera: { ...HD_BASE_FEMALE, height: 61, headW: 12, headH: 11, shoulder: 13, waist: 8, hip: 15, hairStyle: 'long', outfitStyle: 'gown', skinA: '#F4DECB', skinB: '#D5AF96', eye: '#3B2A52' },
  hades: { ...HD_BASE_MALE, height: 59, headW: 11, headH: 10, shoulder: 14, waist: 9, hip: 12, hairStyle: 'short', outfitStyle: 'cloak', facial: 'goatee', skinA: '#E7D4C7', skinB: '#BCA091', eye: '#1F3040' },
  persephone: { ...HD_BASE_FEMALE, height: 53, headW: 10, headH: 9, shoulder: 10, waist: 7, hip: 12, hairStyle: 'long', outfitStyle: 'dress', skinA: '#F7E2CE', skinB: '#DDB89D', eye: '#5A3456' },
  prometheus: { ...HD_BASE_MALE, height: 56, headW: 10, headH: 10, shoulder: 13, waist: 9, hip: 11, legW: 3, hairStyle: 'short', outfitStyle: 'tunic', skinA: '#E8CEB1', skinB: '#BF956F', eye: '#5A3827' },
  helios: { ...HD_BASE_MALE, height: 58, headW: 11, headH: 10, shoulder: 14, waist: 10, hip: 12, legW: 3, hairStyle: 'spike', outfitStyle: 'robe', skinA: '#EFD4B8', skinB: '#C59D76', eye: '#6B4A24' },
  nike: { ...HD_BASE_FEMALE, height: 51, headW: 9, headH: 9, shoulder: 10, waist: 7, hip: 11, legW: 2, hairStyle: 'bun', outfitStyle: 'tunic', skinA: '#F3DBC3', skinB: '#CCA885', eye: '#4D3F2F' },
  pan: { ...HD_BASE_MALE, height: 52, headW: 10, headH: 9, shoulder: 14, waist: 10, hip: 12, legW: 3, hairStyle: 'curly', outfitStyle: 'tunic', facial: 'goatee', skinA: '#DDB590', skinB: '#B68660', eye: '#3C2E24' },
  hecate: { ...HD_BASE_FEMALE, height: 56, headW: 11, headH: 10, shoulder: 12, waist: 8, hip: 12, hairStyle: 'braid', outfitStyle: 'cloak', skinA: '#EBD9CE', skinB: '#BDA6A0', eye: '#4B3270' },
  iris: { ...HD_BASE_FEMALE, height: 50, headW: 9, headH: 9, shoulder: 9, waist: 7, hip: 11, legW: 2, hairStyle: 'pony', outfitStyle: 'dress', skinA: '#F5DEC8', skinB: '#D8B092', eye: '#3E2A38' },
  heracles: { ...HD_BASE_MALE, height: 61, headW: 12, headH: 10, shoulder: 19, waist: 13, hip: 15, legW: 4, hairStyle: 'spike', outfitStyle: 'armor', facial: 'stubble', skinA: '#E5C6A6', skinB: '#BD936D', eye: '#3E2A21' },
  selene: { ...HD_BASE_FEMALE, height: 58, headW: 11, headH: 10, shoulder: 11, waist: 7, hip: 13, hairStyle: 'long', outfitStyle: 'gown', skinA: '#F0E2D8', skinB: '#C7B7B8', eye: '#2C365C' },
  zeus: { ...HD_BASE_MALE, height: 61, headW: 13, headH: 11, shoulder: 18, waist: 12, hip: 14, legW: 4, hairStyle: 'spike', outfitStyle: 'robe', facial: 'beard', skinA: '#EDD5BC', skinB: '#C9A583', eye: '#3B2E1E' },
};

const HD_FACE_SPECS: Record<WorkerLikeAvatar, HdFaceSpec> = {
  athena: { brow: 'stern', mouth: 'line', eyeGap: 3, browLift: 0 },
  poseidon: { brow: 'stern', mouth: 'frown', eyeGap: 3, browLift: 0 },
  ares: { brow: 'fierce', mouth: 'frown', eyeGap: 3, browLift: -1 },
  apollo: { brow: 'arched', mouth: 'smile', eyeGap: 2, browLift: 1 },
  artemis: { brow: 'stern', mouth: 'smirk', eyeGap: 3, browLift: 0 },
  hermes: { brow: 'arched', mouth: 'smirk', eyeGap: 2, browLift: 1 },
  hephaestus: { brow: 'stern', mouth: 'line', eyeGap: 3, browLift: -1 },
  dionysus: { brow: 'soft', mouth: 'smile', eyeGap: 2, browLift: 1 },
  demeter: { brow: 'calm', mouth: 'smile', eyeGap: 2, browLift: 1 },
  aphrodite: { brow: 'arched', mouth: 'smile', eyeGap: 2, browLift: 1 },
  hera: { brow: 'arched', mouth: 'smirk', eyeGap: 3, browLift: 1 },
  hades: { brow: 'fierce', mouth: 'line', eyeGap: 3, browLift: -1 },
  persephone: { brow: 'soft', mouth: 'smile', eyeGap: 2, browLift: 1 },
  prometheus: { brow: 'stern', mouth: 'smirk', eyeGap: 3, browLift: 0 },
  helios: { brow: 'arched', mouth: 'smile', eyeGap: 3, browLift: 1 },
  nike: { brow: 'stern', mouth: 'smirk', eyeGap: 2, browLift: 0 },
  pan: { brow: 'fierce', mouth: 'smirk', eyeGap: 2, browLift: -1 },
  hecate: { brow: 'fierce', mouth: 'line', eyeGap: 3, browLift: -1 },
  iris: { brow: 'soft', mouth: 'smile', eyeGap: 2, browLift: 1 },
  heracles: { brow: 'fierce', mouth: 'frown', eyeGap: 3, browLift: -1 },
  selene: { brow: 'calm', mouth: 'line', eyeGap: 2, browLift: 1 },
  zeus: { brow: 'stern', mouth: 'line', eyeGap: 3, browLift: 0 },
};

function drawHdPixelAvatar(
  avatar: WorkerLikeAvatar,
  profile: SpriteProfile,
  style: WorkerStyle,
  tick: number,
  frame: number,
  moving: boolean,
  seated: boolean,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const blink = tick % 60 < 4 ? 1 : 0;
  const step = moving ? frame % 2 : 0;
  const pose = seated ? 'sit' : 'stand';
  const key = `${HD_RENDER_REV}:${avatar}:${pose}:${step}:${blink}`;
  const cached = HD_SPRITE_CACHE.get(key);
  if (cached) return cached;

  // 16×32 canvas — drawn at 2× (32×64 CSS px) for clean pixel-art upscale
  const canvas = document.createElement('canvas');
  canvas.width = HD_SPRITE_W;  // 16
  canvas.height = HD_SPRITE_H;
  const c = canvas.getContext('2d');
  if (!c) return null;
  c.imageSmoothingEnabled = false;
  const px = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  };

  const spec = HD_AVATAR_SPECS[avatar];
  // Reference-style proportions: big round head, simple body, short legs
  const hair = style.hair;
  const skin = spec.skinA;
  const skinSh = spec.skinB;
  const shirt = style.mantle;
  const trim = style.trim;
  const pants = '#1E2438';
  const shoes = '#0C0D18';
  const isF = spec.gender === 'f';

  // ── Shadow ──────────────────────────────────────────────────────────
  c.fillStyle = 'rgba(0,0,0,0.28)';
  c.fillRect(2, 29, 12, 2);

  // ── Feet & Legs (chibi: stubby legs, y=22..29) ────────────────────────
  if (!seated) {
    const lFY = step === 0 ? 27 : 28;
    const rFY = step === 1 ? 27 : 28;
    px(3, lFY, 3, 2, shoes);
    px(10, rFY, 3, 2, shoes);
    const lLY = step === 0 ? 22 : 23;
    const rLY = step === 1 ? 22 : 23;
    px(3, lLY, 3, 5, pants);
    px(10, rLY, 3, 5, pants);
  } else {
    px(3, 26, 3, 2, shoes);
    px(10, 26, 3, 2, shoes);
  }

  // ── Body / outfit (chibi torso y=16..21) ────────────────────────────
  const bodyY = 16;
  const bodyH = 6;
  switch (spec.outfitStyle) {
    case 'armor':
      px(3, bodyY, 10, bodyH, shirt);
      px(4, bodyY + 1, 8, 3, '#B8C4CC');       // chest plate
      px(4, bodyY + 1, 8, 1, '#D8E4EC');       // plate highlight top
      px(4, bodyY + 4, 8, 1, '#8A9EAE');       // plate shadow bottom
      px(4, bodyY + 2, 2, 2, '#9AAEBA');       // left rivet plate
      px(10, bodyY + 2, 2, 2, '#9AAEBA');      // right rivet plate
      px(5, bodyY, 6, 1, trim);                // collar
      break;
    case 'robe':
      px(2, bodyY, 12, bodyH + 2, shirt);      // wide flowing robe
      px(5, bodyY, 6, 1, trim);                // collar
      px(3, bodyY + 2, 10, 1, trim);           // sash belt
      px(6, bodyY + 2, 4, 1, '#AA8830');       // belt buckle gold
      break;
    case 'tunic':
      px(3, bodyY, 10, bodyH, shirt);
      px(5, bodyY, 6, 1, trim);                // collar
      px(3, bodyY + 3, 10, 1, '#3A2818');      // leather belt
      px(7, bodyY + 3, 2, 1, '#C8A040');       // buckle
      px(4, bodyY, 2, 1, trim);               // collar detail L
      px(10, bodyY, 2, 1, trim);              // collar detail R
      break;
    case 'gown':
      px(3, bodyY, 10, bodyH, shirt);
      px(2, bodyY + bodyH - 1, 12, 3, shirt);  // wide trailing hem
      px(3, bodyY, 1, bodyH, trim);            // left trim stripe
      px(12, bodyY, 1, bodyH, trim);           // right trim stripe
      px(5, bodyY, 6, 1, trim);               // collar
      break;
    case 'dress':
      px(3, bodyY, 10, bodyH - 1, shirt);
      px(2, bodyY + bodyH - 1, 12, 2, shirt);  // flared skirt
      px(5, bodyY, 6, 1, trim);
      px(4, bodyY + 1, 8, 1, trim);            // yoke stripe
      break;
    case 'cloak':
      px(2, bodyY, 12, bodyH + 3, shirt);       // wide flowing cloak
      px(1, bodyY + 1, 2, bodyH + 2, '#101828'); // deep left shadow
      px(13, bodyY + 1, 2, bodyH + 2, '#101828'); // deep right shadow
      px(5, bodyY, 6, 1, trim);                // inner collar
      px(5, bodyY + 1, 6, bodyH, skinSh);       // inner body (skin visible)
      break;
    default:
      px(3, bodyY, 10, bodyH, shirt);
      px(5, bodyY, 6, 1, trim);
  }
  px(3, bodyY + 1, 1, bodyH - 1, skinSh);     // left-edge shadow

  // ── Arms (styled by outfit) ──────────────────────────────────────────
  if (spec.outfitStyle === 'armor') {
    px(0, bodyY + 1, 3, 5, '#8898A8');         // metal pauldron L
    px(13, bodyY + 1, 3, 5, '#8898A8');        // metal pauldron R
    px(0, bodyY + 1, 3, 1, '#A0B4C4');         // pauldron top highlight
    px(13, bodyY + 1, 3, 1, '#A0B4C4');
  } else if (spec.outfitStyle === 'cloak' || spec.outfitStyle === 'robe') {
    px(0, bodyY + 1, 3, 6, shirt);             // wide sleeve L
    px(13, bodyY + 1, 3, 6, shirt);            // wide sleeve R
  } else {
    px(1, bodyY + 1, 2, 5, shirt);
    px(13, bodyY + 1, 2, 5, shirt);
    px(1, bodyY + 1, 1, 5, skinSh);
  }

  // ── Hands ─────────────────────────────────────────────────────────────
  px(1, bodyY + 6, 2, 2, skin);
  px(13, bodyY + 6, 2, 2, skin);

  // ── Neck (chibi: 1px, y=15) ───────────────────────────────────────────
  px(6, 15, 4, 1, skin);
  px(7, 15, 2, 1, skinSh);

  // ── Face skin — BIG chibi head (drawn first, hair goes on top) ────────
  // Head occupies y=0..14 (15px ~47%) vs body y=16..29 (14px)
  px(2, 5, 12, 10, skin);         // face interior y=5..14, 12px wide
  px(3, 15, 10, 1, skin);         // chin overlap with neck
  px(11, 6, 2, 8, skinSh);        // right-side face shadow
  px(6, 14, 2, 1, skinSh);        // chin shadow

  // ── Hair — each case draws its FULL shape on top of skin ─────────────
  switch (spec.hairStyle) {
    case 'long':
      // Cap + long flowing sides to below chin
      px(4, 0, 8, 1, hair);
      px(2, 1, 12, 5, hair);
      px(1, 2, 14, 3, hair);       // widest at y=2..4
      px(1, 5, 2, 10, hair);       // left long flow y=5..14
      px(13, 5, 2, 10, hair);      // right long flow y=5..14
      break;
    case 'wavy':
      // Dramatic flowing waves with side bumps
      px(4, 0, 8, 1, hair);
      px(2, 1, 12, 2, hair);       // top
      px(0, 2, 16, 3, hair);       // full-width wave y=2..4
      px(1, 5, 2, 3, hair);        // left wave bump y=5..7
      px(12, 5, 3, 3, hair);       // right wave bump y=5..7
      px(1, 8, 2, 5, hair);        // left flow y=8..12
      px(13, 8, 2, 5, hair);       // right flow y=8..12
      break;
    case 'spike':
      // Three DRAMATIC spikes at crown
      px(3, 2, 3, 1, hair);        // spike L base
      px(4, 1, 2, 1, hair);        // spike L mid
      px(4, 0, 1, 1, hair);        // spike L tip
      px(7, 1, 2, 1, hair);        // spike C mid
      px(7, 0, 2, 1, hair);        // spike C tip (2px wide, goes highest)
      px(10, 2, 3, 1, hair);       // spike R base
      px(10, 1, 2, 1, hair);       // spike R mid
      px(11, 0, 1, 1, hair);       // spike R tip
      px(2, 3, 12, 3, hair);       // solid base cap y=3..5
      px(1, 4, 14, 2, hair);       // widest at y=4..5
      break;
    case 'bun':
      // Large rounded top-knot bun
      px(4, 0, 8, 2, hair);        // bun top (8px wide)
      px(5, 0, 6, 1, hair);        // bun peak
      px(3, 2, 10, 2, hair);       // bun lower + cap merge
      px(2, 4, 12, 2, hair);       // cap
      px(1, 5, 14, 1, hair);       // widest at y=5
      break;
    case 'curly':
      // HUGE fluffy cloud — maximum volume
      px(2, 0, 12, 1, hair);       // very top
      px(0, 1, 16, 2, hair);       // full width y=1..2
      px(0, 3, 16, 2, hair);       // full width y=3..4
      px(0, 5, 16, 3, hair);       // full width y=5..7
      px(0, 8, 3, 5, hair);        // left big puff y=8..12
      px(13, 8, 3, 5, hair);       // right big puff y=8..12
      break;
    case 'pony':
      // Cap + thick ponytail on right + hair tie
      px(4, 0, 8, 1, hair);
      px(2, 1, 12, 5, hair);
      px(1, 2, 14, 3, hair);
      px(12, 6, 3, 1, trim);       // ponytail tie/band
      px(12, 5, 3, 14, hair);      // thick ponytail (3px wide, y=5..18)
      break;
    case 'braid':
      // Cap + long braided rope with alternating segments
      px(4, 0, 8, 1, hair);
      px(2, 1, 12, 5, hair);
      px(1, 2, 14, 3, hair);
      px(12, 6, 2, 17, hair);      // braid runs y=6..22
      px(12, 9,  2, 1, trim);      // braid segment 1
      px(12, 12, 2, 1, trim);      // braid segment 2
      px(12, 15, 2, 1, trim);      // braid segment 3
      px(12, 18, 2, 1, trim);      // braid segment 4
      break;
    case 'hood':
      // Full hood covering head — face visible through opening
      px(0, 0, 16, 15, shirt);     // entire hood in mantle color
      px(3, 5, 10, 9, skin);       // inner face opening y=5..13
      px(10, 6, 2, 7, skinSh);     // face shadow inside hood
      px(6, 13, 2, 1, skinSh);
      break;
    default: // 'short' — minimal rounded cap
      px(4, 0, 8, 1, hair);
      px(2, 1, 12, 5, hair);
      px(1, 2, 14, 3, hair);
      break;
  }

  // ── Crown / Head Accessory (drawn on top of hair) ─────────────────────
  switch (profile.crown) {
    case 'gold':
      px(4, 0, 8, 1, '#D4AF37');               // crown band
      px(5, 0, 1, 2, '#F0D060');               // left point
      px(7, 0, 2, 2, '#FFE070');               // center peak
      px(11, 0, 1, 2, '#F0D060');              // right point
      px(6, 1, 1, 1, '#FFF3A0');               // gem sparkle
      break;
    case 'silver':
      px(4, 0, 8, 1, '#B8C8D8');               // silver band
      px(5, 0, 2, 2, '#D8E8F0');               // left point
      px(9, 0, 2, 2, '#D8E8F0');               // right point
      px(7, 0, 2, 1, '#E8F4FF');               // center highlight
      break;
    case 'laurel':
      px(3, 0, 2, 2, '#4A7828');               // L leaf cluster
      px(5, 0, 6, 1, '#3A6020');               // wreath center
      px(11, 0, 2, 2, '#4A7828');              // R leaf cluster
      px(6, 0, 1, 1, '#78B848');               // highlight leaf L
      px(9, 0, 1, 1, '#78B848');               // highlight leaf R
      break;
    case 'horn':
      px(2, 0, 2, 4, '#8D6E63');               // L horn (curved up)
      px(3, 0, 1, 2, '#A08060');               // L horn tip
      px(12, 0, 2, 4, '#8D6E63');              // R horn
      px(12, 0, 1, 2, '#A08060');              // R horn tip
      px(2, 3, 3, 1, '#6D4E43');               // L horn base
      px(11, 3, 3, 1, '#6D4E43');              // R horn base
      break;
  }

  // ── Hair crest accent (style.crest color, drawn on hair cap) ──────────
  if (style.crest) {
    px(6, 3, 4, 1, style.crest);              // crest stripe in hair
  }

  // ── Eyes (chibi: BIG 3×2 eyes for cute look, y=9..10) ──────────────────
  const eyeY = 9;
  if (!blink) {
    px(4, eyeY, 3, 2, spec.eye);    // L eye (3px wide × 2px tall)
    px(9, eyeY, 3, 2, spec.eye);    // R eye (3px wide × 2px tall)
    px(4, eyeY, 1, 1, '#FFFFFF');   // L highlight (top-left)
    px(9, eyeY, 1, 1, '#FFFFFF');   // R highlight (top-left)
  } else {
    px(4, eyeY + 1, 3, 1, skinSh); // blink L
    px(9, eyeY + 1, 3, 1, skinSh); // blink R
  }

  // ── Prop (held item drawn in sprite) ─────────────────────────────────
  switch (style.prop) {
    case 'spear':
      px(14, 3, 1, 1, '#E8D878');   // spearhead tip
      px(13, 4, 2, 1, '#E8D878');   // head barb
      px(14, 5, 1, 18, '#8B6540');  // shaft
      break;
    case 'trident':
      px(13, 2, 1, 3, '#88DDFF');   // L tine
      px(14, 1, 1, 4, '#88DDFF');   // center tine (tallest)
      px(15, 2, 1, 3, '#88DDFF');   // R tine
      px(14, 5, 1, 17, '#4488CC');  // shaft
      break;
    case 'blade':
      px(14, 5, 1, 4, '#D8E0E8');   // blade
      px(15, 5, 1, 3, '#F0F4FF');   // shine
      px(13, 9, 3, 1, '#D0C0A0');   // crossguard
      px(14, 10, 1, 5, '#9B7A50');  // handle
      break;
    case 'sunstaff':
      px(13, 2, 3, 3, '#FFE878');   // sun orb
      px(14, 2, 1, 3, '#FFFAC0');   // orb center
      px(14, 5, 1, 18, '#C8A040');  // staff
      break;
    case 'hammer':
      px(12, 14, 4, 3, '#8D6E63');  // hammerhead
      px(13, 13, 2, 1, '#A88060');  // top cap
      px(14, 17, 1, 8, '#B0BEC5');  // handle
      break;
    case 'torch':
      px(13, 4, 3, 3, tick % 18 < 10 ? '#FFB74D' : '#FF8030'); // flame
      px(14, 7, 1, 1, '#FFEB3B');   // inner flame
      px(14, 7, 1, 16, '#8D6E63');  // handle
      break;
    case 'vine':
      px(0, 14, 2, 1, '#9CCC65');   // top leaf
      px(0, 16, 1, 10, '#558844');  // vine stem
      px(0, 18, 2, 1, '#78CC48');   // leaf mid
      px(0, 22, 2, 1, '#78CC48');   // leaf lower
      break;
    case 'wheat':
      px(14, 9, 2, 1, '#F2CF6C');   // grain top
      px(15, 11, 1, 1, '#F2CF6C');  // grain
      px(14, 13, 2, 1, '#F2CF6C');  // grain
      px(14, 15, 1, 10, '#C49A30'); // stalk
      break;
    case 'mirror':
      px(13, 14, 3, 4, '#EADCF5');  // mirror glass
      px(12, 14, 1, 4, '#C8B6E3');  // frame L
      px(15, 14, 1, 4, '#C8B6E3');  // frame R
      px(13, 18, 1, 5, '#B8A0D0');  // handle
      break;
    case 'obsidian_staff':
      px(13, 2, 3, 3, '#90A4AE');   // orb top
      px(14, 2, 1, 3, '#B8C8D0');   // orb shine
      px(14, 5, 1, 18, '#37474F');  // dark shaft
      break;
    case 'rose':
      px(13, 12, 3, 3, '#EC6C9E');  // rose bloom
      px(14, 12, 1, 3, '#F898C0');  // rose highlight
      px(14, 15, 1, 8, '#6FB377');  // green stem
      break;
    case 'halo':
      px(4, 1, 8, 1, '#FDE68A');    // halo top arc
      px(2, 2, 2, 1, '#FDE68A');    // L arc
      px(12, 2, 2, 1, '#FDE68A');   // R arc
      px(3, 3, 1, 1, '#FFF5C0');    // L inner
      px(12, 3, 1, 1, '#FFF5C0');   // R inner
      break;
    case 'laurel':
      px(3, 1, 2, 2, '#5A8030');    // L leaf branch
      px(5, 1, 6, 1, '#3A6020');    // crown center
      px(11, 1, 2, 2, '#5A8030');   // R leaf branch
      break;
    case 'flute':
      px(4, 19, 8, 1, '#C8A878');   // flute body
      px(5, 20, 1, 1, '#907040');   // finger hole
      px(7, 20, 1, 1, '#907040');
      px(9, 20, 1, 1, '#907040');
      break;
    case 'lantern':
      px(14, 16, 2, 1, '#8E7CC3');  // chain link
      px(13, 17, 3, 4, tick % 30 < 22 ? '#C4B5FD' : '#8060C0'); // lantern glow
      px(13, 17, 3, 1, '#D0C0FF');  // lantern top
      break;
    case 'rainbow_ribbon':
      px(1, 22, 14, 1, '#FF5252');  // red band
      px(2, 23, 12, 1, '#FFD740');  // yellow band
      px(3, 24, 10, 1, '#42A5F5'); // blue band
      break;
    case 'club':
      px(13, 12, 3, 4, '#A88963');  // club head (wide)
      px(12, 12, 4, 1, '#C0A078');  // top cap
      px(14, 16, 1, 9, '#8D6E63'); // handle
      break;
    case 'crescent':
      px(14, 7, 2, 5, '#E8EAF6');  // outer arc
      px(13, 8, 1, 3, '#9FA8DA');  // inner shadow
      break;
    case 'bow':
      px(0, 11, 1, 1, '#A5C38A');  // top nock
      px(0, 24, 1, 1, '#A5C38A');  // bottom nock
      px(0, 12, 1, 12, '#7A9A60'); // bow limb
      px(1, 11, 1, 13, '#D8D8B8'); // bowstring
      break;
    case 'wing':
      px(0, 16, 3, 5, '#E8EEF7');  // L wing
      px(13, 16, 3, 5, '#E8EEF7'); // R wing
      px(0, 14, 3, 3, '#D0D8F8');  // L upper feather
      px(13, 14, 3, 3, '#D0D8F8'); // R upper feather
      break;
    case 'obsidian_staff': break; // handled above
    default: break;
  }

  if (HD_SPRITE_CACHE.size > 512) HD_SPRITE_CACHE.clear();
  HD_SPRITE_CACHE.set(key, canvas);
  return canvas;
}


// ---------------------------------------------------------------------------
// Divine Symbol — floating glyph above character head (drawn on main canvas)
// ---------------------------------------------------------------------------

function drawDivineSymbol(
  ctx: CanvasRenderingContext2D,
  cx: number,
  headTopY: number,
  glyph: DivineSigil['glyph'],
  primary: string,
  ring: string,
  glow: string,
  tick: number,
): void {
  const S = 1;  // 1 canvas px per symbol pixel
  const bob = Math.sin(tick * 0.07) * 1.5;
  const sy = Math.round(headTopY - 7 + bob);
  const sx = Math.round(cx) - 3;

  const p = (ox: number, oy: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(sx + ox * S, sy + oy * S, w * S, h * S);
  };

  // Pulsing glow background
  const alpha = 0.22 + Math.sin(tick * 0.05) * 0.1;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = glow;
  ctx.fillRect(sx - 1, sy - 1, 8 * S, 8 * S);
  ctx.globalAlpha = 1;

  // Ring border (1px frame)
  ctx.fillStyle = ring;
  ctx.fillRect(sx - 1, sy - 1, 8 * S, 1);          // top
  ctx.fillRect(sx - 1, sy + 6 * S, 8 * S, 1);       // bottom
  ctx.fillRect(sx - 1, sy - 1, 1, 8 * S);            // left
  ctx.fillRect(sx + 7 * S, sy - 1, 1, 8 * S);        // right

  // Glyph icon (6×6 grid)
  switch (glyph) {
    case 'bolt':    // ⚡ Zeus zigzag
      p(2, 0, 3, 2, primary);  p(1, 2, 3, 1, primary);  p(2, 3, 3, 2, primary);  p(3, 5, 2, 1, primary);
      break;
    case 'trident': // 🔱 Poseidon
      p(1, 0, 1, 5, primary);  p(3, 0, 1, 6, primary);  p(5, 0, 1, 5, primary);
      p(1, 5, 5, 1, primary);  p(3, 2, 1, 4, primary);
      break;
    case 'shield':  // 🛡 Athena
      p(1, 0, 4, 1, primary);  p(0, 1, 6, 3, primary);  p(1, 4, 4, 1, primary);  p(2, 5, 2, 1, primary);
      p(2, 2, 2, 1, ring);     // inner detail
      break;
    case 'sword':   // ⚔ Ares
      p(3, 0, 1, 4, primary);  p(1, 2, 5, 1, primary);  p(3, 4, 1, 2, ring);
      break;
    case 'sun':     // ☀ Apollo
      p(2, 0, 2, 1, primary);  p(0, 2, 1, 2, primary);  p(5, 2, 1, 2, primary);  p(2, 5, 2, 1, primary);
      p(1, 2, 4, 2, primary);  p(2, 1, 2, 4, primary);  // cross body
      p(0, 0, 1, 1, primary);  p(5, 0, 1, 1, primary);   // diagonal rays
      p(0, 5, 1, 1, primary);  p(5, 5, 1, 1, primary);
      break;
    case 'moon':    // 🌙 Artemis crescent
      p(1, 0, 4, 1, primary);  p(0, 1, 2, 4, primary);  p(5, 1, 1, 2, primary);
      p(1, 5, 4, 1, primary);  p(2, 1, 3, 4, ring);      // inner hollow
      break;
    case 'wing':    // 🕊 Hermes
      p(0, 1, 3, 2, primary);  p(3, 0, 3, 3, primary);  p(1, 3, 5, 2, primary);  p(2, 5, 3, 1, primary);
      break;
    case 'hammer':  // 🔨 Hephaestus
      p(0, 0, 6, 3, primary);  p(2, 3, 2, 3, primary);
      p(1, 1, 4, 1, ring);     // top highlight
      break;
    case 'grape':   // 🍇 Dionysus
      p(1, 0, 2, 2, primary);  p(4, 0, 2, 2, primary);  p(0, 2, 2, 2, primary);
      p(2, 2, 2, 2, primary);  p(4, 2, 2, 2, primary);  p(1, 4, 2, 2, primary);  p(3, 4, 2, 2, primary);
      break;
    case 'wheat':   // 🌾 Demeter
      p(3, 0, 1, 1, primary);  p(2, 1, 1, 1, primary);  p(4, 1, 1, 1, primary);
      p(1, 2, 1, 1, primary);  p(3, 2, 1, 2, primary);  p(5, 2, 1, 1, primary);
      p(2, 4, 1, 1, primary);  p(4, 4, 1, 1, primary);  p(3, 3, 1, 3, primary);
      break;
    case 'heart':   // ❤ Aphrodite
      p(0, 1, 2, 2, primary);  p(4, 1, 2, 2, primary);  p(0, 3, 6, 2, primary);  p(1, 5, 4, 1, primary);  p(2, 5, 2, 1, primary);
      break;
    case 'peacock': // 🦚 Hera fan
      p(3, 0, 1, 6, primary);  p(0, 1, 1, 4, primary);  p(1, 0, 1, 5, primary);
      p(5, 0, 1, 5, primary);  p(6, 1, 1, 4, primary);
      p(2, 3, 3, 2, ring);     // fan body center
      break;
    case 'skull':   // 💀 Hades
      p(1, 0, 4, 3, primary);  p(0, 3, 6, 2, primary);  p(1, 5, 4, 1, primary);
      p(1, 1, 2, 1, ring);     // eye socket L
      p(3, 1, 2, 1, ring);     // eye socket R
      p(2, 4, 1, 1, ring);     // tooth gap
      p(4, 4, 1, 1, ring);
      break;
    case 'flower':  // 🌸 Persephone
      p(2, 0, 2, 2, primary);  p(0, 2, 2, 2, primary);  p(4, 2, 2, 2, primary);  p(2, 4, 2, 2, primary);
      p(2, 2, 2, 2, ring);     // center
      break;
    case 'flame':   // 🔥 Prometheus
      p(2, 0, 2, 2, primary);  p(1, 1, 4, 2, primary);  p(0, 3, 6, 2, primary);  p(1, 5, 4, 1, primary);
      p(2, 2, 2, 2, '#FFE060'); // inner flame
      break;
    case 'halo':    // 😇 Helios ring
      p(1, 0, 4, 1, primary);  p(0, 1, 1, 4, primary);  p(5, 1, 1, 4, primary);  p(1, 5, 4, 1, primary);
      break;
    case 'trophy':  // 🏆 Nike
      p(0, 0, 6, 3, primary);  p(1, 3, 4, 1, primary);  p(2, 4, 2, 1, primary);  p(1, 5, 4, 1, primary);
      p(1, 1, 4, 1, ring);     // cup inner
      break;
    case 'horn':    // Pan horn
      p(0, 0, 2, 1, primary);  p(0, 1, 3, 2, primary);  p(0, 3, 5, 2, primary);  p(2, 5, 4, 1, primary);
      break;
    case 'star':    // ⭐ Hecate
      p(2, 0, 2, 2, primary);  p(0, 2, 6, 2, primary);  p(2, 4, 2, 2, primary);
      p(0, 0, 2, 2, primary);  p(4, 0, 2, 2, primary);  p(0, 4, 2, 2, primary);  p(4, 4, 2, 2, primary);
      break;
    case 'rainbow': // 🌈 Iris arc
      p(0, 0, 6, 1, '#FF5050');  p(0, 1, 6, 1, '#FFD040');
      p(0, 2, 6, 1, '#40D040');  p(0, 3, 6, 1, '#4080FF');
      p(1, 4, 4, 1, '#8040C0');
      break;
    case 'lion':    // 🦁 Heracles paw
      p(0, 0, 6, 4, primary);   p(0, 4, 2, 2, primary);  p(2, 4, 2, 2, primary);  p(4, 4, 2, 2, primary);
      p(1, 1, 4, 2, ring);      // mane inner
      break;
    case 'crescent': // 🌙 Selene
      p(1, 0, 4, 1, primary);  p(0, 1, 2, 4, primary);  p(5, 1, 1, 2, primary);
      p(1, 5, 4, 1, primary);  p(1, 1, 3, 4, ring);      // inner hollow (crescent shape)
      break;
    case 'bolt': break; // handled above
    default: p(1, 1, 4, 4, primary); break; // fallback: colored square
  }

  ctx.restore();
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

function strokePixelEllipse(
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
    ctx.fillRect(mx - span, my + yy, 1, 1);
    ctx.fillRect(mx + span, my + yy, 1, 1);
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
  fillPixelEllipse(ctx, x, sy, 6, 6, sigil.glow);
  ctx.restore();

  ctx.save();
  fillPixelEllipse(ctx, x, sy, 5, 5, '#F7F2E8');
  strokePixelEllipse(ctx, x, sy, 5, 5, sigil.ring);
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
  avatar?: WorkerLikeAvatar,
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
  const drawY = Math.round(footY - dh + 2);

  ctx.save();
  ctx.fillStyle = 'rgba(8, 14, 24, 0.34)';
  ctx.fillRect(x - 9, y - 2, 18, 3);
  ctx.restore();

  if (HD_PIXEL_CHARACTER_MODE && avatar) {
    const moving = anim === 'walk_frame1' || anim === 'walk_frame2' || anim === 'run';
    const seated = anim === 'sit_typing' || anim === 'sit_idle';
    const style = avatar === 'zeus' ? ZEUS_WORKER_STYLE : WORKER_STYLE_MAP[avatar];
    const hd = drawHdPixelAvatar(avatar, profile, style, tick, frame, moving, seated);
    if (hd) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      if (flip) {
        ctx.translate(x * 2, 0);
        ctx.scale(-1, 1);
      }
      // Black pixel-art outline — silhouette drawn at 4 diagonal offsets
      const sil = getSilhouette(hd);
      ctx.drawImage(sil, drawX - 1, drawY - 1, dw, dh);
      ctx.drawImage(sil, drawX + 1, drawY - 1, dw, dh);
      ctx.drawImage(sil, drawX - 1, drawY + 1, dw, dh);
      ctx.drawImage(sil, drawX + 1, drawY + 1, dw, dh);
      ctx.drawImage(hd, drawX, drawY, dw, dh);
      ctx.restore();

      // Draw divine sigil above head (unflipped coord space restored)
      drawDivineSymbol(ctx, x, drawY, profile.sigil.glyph, profile.sigil.primary, profile.sigil.ring, profile.sigil.glow, tick);

      return;
    }
  }

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
    drawWorkerTraitDetails(ctx, x, drawY, avatar, tick, drawScale);
  }

}

function drawWorkerTraitDetails(
  ctx: CanvasRenderingContext2D,
  x: number,
  drawY: number,
  avatar: WorkerLikeAvatar,
  tick: number,
  drawScale: number,
): void {
  const style = avatar === 'zeus' ? ZEUS_WORKER_STYLE : WORKER_STYLE_MAP[avatar];
  const p = (ox: number, oy: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(
      Math.round(x + ox * drawScale),
      Math.round(drawY + oy * drawScale),
      Math.max(1, Math.round(w * drawScale)),
      Math.max(1, Math.round(h * drawScale)),
    );
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
      // Force Hera silhouette to keep the same regal purple skirt in map/cards.
      p(-5, 10, 10, 2, '#7E57C2');
      p(-5, 20, 10, 4, '#7E57C2');
      p(-4, 22, 8, 3, '#C3A5E6');
      p(-2, 24, 4, 2, '#F1D37A');
      p(5, 12, 2, 2, '#44B6B6');
      break;
    case 'zeus':
      // Keep Zeus robe strongly golden regardless of context scale.
      p(-5, 7, 10, 2, '#E3BE63');
      p(-5, 19, 10, 4, '#CFA93A');
      p(-4, 21, 8, 3, '#E3BE63');
      p(-1, 20, 2, 5, '#FFF2A8');
      p(-1, 6, 2, 1, '#FFF2A8');
      p(6, 16, 2, 6, '#E0B755');
      p(7, 14, 1, 1, '#FFF8D2');
      p(8, 13, 1, 1, '#FFF8D2');
      break;
    default:
      break;
  }

  // Fine per-god pixel detailing so avatars are clearly distinguishable.
  switch (avatar) {
    case 'athena':
      p(-3, 6, 6, 1, '#6D7F95');      // helmet brim
      p(-1, 5, 2, 1, '#D4AF37');      // crest
      p(-2, 11, 4, 2, '#E8D2BC');     // skin tone
      p(-2, 12, 1, 1, '#2E3E52');     // left eye
      p(1, 12, 1, 1, '#2E3E52');      // right eye
      break;
    case 'poseidon':
      p(-3, 8, 6, 1, '#3E7EA5');      // wet hairline
      p(-3, 12, 6, 2, '#D7BBA0');     // face
      p(-2, 14, 4, 2, '#6BAFD6');     // beard
      p(7, 16, 2, 1, '#B3E5FC');      // trident sparkle
      break;
    case 'ares':
      p(-4, 7, 8, 1, '#702020');      // war helm band
      p(-2, 11, 4, 2, '#D8B393');     // skin tone
      p(1, 11, 1, 2, '#C54242');      // scar
      p(-2, 12, 1, 1, '#2E1C1C');
      p(1, 12, 1, 1, '#2E1C1C');
      break;
    case 'apollo':
      p(-4, 7, 8, 1, '#E5BD58');      // blond band
      p(-3, 6, 6, 1, '#FFE08A');      // light highlight
      p(-2, 11, 4, 2, '#E9C6A6');     // skin tone
      p(-1, 12, 2, 1, '#7A5530');     // smiling eyes
      break;
    case 'artemis':
      p(-4, 7, 8, 2, '#6A8756');      // hood
      p(-2, 11, 4, 2, '#E6C9AB');     // skin tone
      p(-2, 12, 1, 1, '#345038');
      p(1, 12, 1, 1, '#345038');
      break;
    case 'hermes':
      p(-4, 7, 8, 1, '#8C7555');      // cap line
      p(-6, 7, 2, 1, '#E8EEF7');      // left wing
      p(4, 7, 2, 1, '#E8EEF7');       // right wing
      p(-2, 11, 4, 2, '#DDBA99');     // skin tone
      p(-1, 12, 2, 1, '#3A2D22');
      break;
    case 'hephaestus':
      p(-4, 7, 8, 1, '#5A4636');      // dark hair band
      p(-2, 11, 4, 2, '#CDA37E');     // warm skin tone
      p(-2, 14, 4, 1, '#5E4A3A');     // soot beard/mouth
      p(0, 13, 1, 1, '#3A2D23');      // nose shadow
      break;
    case 'dionysus':
      p(-4, 6, 8, 1, '#6FAE5D');      // vine wreath
      p(-3, 7, 1, 1, '#7B1FA2');      // grape
      p(2, 7, 1, 1, '#7B1FA2');       // grape
      p(-2, 11, 4, 2, '#E2BF9D');     // skin tone
      p(-2, 13, 4, 1, '#EC6C9E');     // rosy smile
      break;
    case 'demeter':
      p(-4, 6, 8, 1, '#EACB62');      // wheat crown
      p(-2, 11, 4, 2, '#DDBA97');     // skin tone
      p(-2, 12, 1, 1, '#5B4A2A');
      p(1, 12, 1, 1, '#5B4A2A');
      break;
    case 'aphrodite':
      p(-4, 7, 8, 1, '#A16A74');      // soft hair band
      p(-2, 11, 4, 2, '#F0D1B8');     // light skin tone
      p(-3, 13, 1, 1, '#F39DBE');     // blush left
      p(2, 13, 1, 1, '#F39DBE');      // blush right
      p(-1, 12, 2, 1, '#8A3558');     // eye/lip accent
      break;
    case 'hades':
      p(-4, 7, 8, 2, '#2E3543');      // dark hood
      p(-2, 11, 4, 2, '#D6C3B4');     // pale skin
      p(-2, 12, 1, 1, '#1D2633');
      p(1, 12, 1, 1, '#1D2633');
      p(-1, 13, 2, 1, '#5F6D7A');     // cold mouth line
      break;
    case 'persephone':
      p(-4, 6, 8, 1, '#EC6C9E');      // flower crown line
      p(-3, 7, 1, 1, '#81C784');
      p(2, 7, 1, 1, '#81C784');
      p(-2, 11, 4, 2, '#EAC8AE');
      p(-1, 13, 2, 1, '#B15374');
      break;
    case 'prometheus':
      p(-4, 7, 8, 1, '#734B36');      // rugged hairline
      p(-2, 11, 4, 2, '#D2AD8A');
      p(2, 10, 1, 2, '#FF8F00');      // ember reflection
      p(-1, 13, 2, 1, '#7A3A1D');
      break;
    case 'helios':
      p(-4, 6, 8, 1, '#F2C94C');      // solar circlet
      p(-3, 5, 1, 1, '#FFE08A');
      p(2, 5, 1, 1, '#FFE08A');
      p(-2, 11, 4, 2, '#E5C09A');
      p(-1, 12, 2, 1, '#7A5530');
      break;
    case 'nike':
      p(-4, 7, 8, 1, '#E9E3C6');      // laurel/feather band
      p(-2, 11, 4, 2, '#E0BE9B');
      p(-2, 12, 1, 1, '#4F3F30');
      p(1, 12, 1, 1, '#4F3F30');
      break;
    case 'pan':
      p(-3, 5, 2, 1, '#8D6E63');      // left horn
      p(1, 5, 2, 1, '#8D6E63');       // right horn
      p(-2, 11, 4, 2, '#CFA17C');
      p(-1, 13, 2, 1, '#6A4F3B');
      break;
    case 'hecate':
      p(-4, 7, 8, 2, '#4B3A73');      // mystic hood
      p(-2, 11, 4, 2, '#D8C3BD');
      p(-3, 9, 1, 1, '#C4B5FD');      // side sigil left
      p(2, 9, 1, 1, '#C4B5FD');       // side sigil right
      p(-1, 12, 2, 1, '#6F56A4');
      break;
    case 'iris':
      p(-4, 7, 8, 1, '#CE5C8A');      // hair band
      p(3, 8, 1, 4, '#42A5F5');       // rainbow streak
      p(-2, 11, 4, 2, '#EBC9AF');
      p(-3, 13, 1, 1, '#F44336');     // blush/chroma left
      p(2, 13, 1, 1, '#42A5F5');      // blush/chroma right
      break;
    case 'heracles':
      p(-4, 7, 8, 1, '#6C5843');      // strong hairline
      p(-2, 11, 4, 2, '#D5AF8D');
      p(-2, 10, 1, 1, '#3B2A20');     // thick brow left
      p(1, 10, 1, 1, '#3B2A20');      // thick brow right
      p(-1, 13, 2, 1, '#5A3F2E');     // strong jaw/mouth
      break;
    case 'selene':
      p(-4, 7, 8, 1, '#9EA7D7');      // moonlit hairline
      p(2, 6, 2, 1, '#E8EAF6');       // crescent glint
      p(-2, 11, 4, 2, '#E7D4C8');
      p(-2, 12, 1, 1, '#3949AB');
      p(1, 12, 1, 1, '#3949AB');
      break;
    case 'hera':
      p(-4, 6, 8, 1, '#F1D37A');      // tiara line
      p(-2, 11, 4, 2, '#EACBB7');     // skin tone
      p(-2, 12, 1, 1, '#452C60');
      p(1, 12, 1, 1, '#452C60');
      p(-1, 13, 2, 1, '#9A5E90');     // regal lip
      break;
    case 'zeus':
      p(-4, 6, 8, 1, '#F4D67C');      // crown band
      p(-2, 11, 4, 2, '#E7C7A8');     // skin tone
      p(-3, 13, 6, 2, '#EDE4DA');     // beard
      p(-1, 15, 2, 1, '#D7CEC2');     // beard tail
      p(2, 10, 1, 2, '#FFE08A');      // lightning glow reflection
      break;
    default:
      break;
  }
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
  drawCharacterFromSheet(ctx, x, y, anim, 's', tick, ZEUS_PROFILE, 'zeus');
}

export function drawGemini(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  anim: CharacterAnim,
  tick: number,
  _avatar: GeminiAvatar,
  _emoji: string,
  direction: Direction = 's',
): void {
  drawCharacterFromSheet(ctx, x, y, anim, direction, tick, HERA_PROFILE, 'hera');
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
  fillPixelEllipse(ctx, x, y - 2, 10, 4, color);
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
  const bob = Math.sin(tick * 0.08) * 0.8;
  const bodyY = y - 11 + bob;
  ctx.save();
  if (direction === 'w') {
    ctx.translate(x * 2, 0);
    ctx.scale(-1, 1);
  }

  fillPixelEllipse(ctx, x, y + 1.5, 9, 3, 'rgba(10, 18, 30, 0.25)');
  fillPixelEllipse(ctx, x, bodyY, 7, 4, '#FFFFFF');
  fillPixelEllipse(ctx, x + 5.6, bodyY - 1.7, 3, 3, '#F7FAFF');

  ctx.fillStyle = '#FFDF7B';
  ctx.fillRect(Math.round(x + 7), Math.round(bodyY - 8.5), 1, 5);
  ctx.fillRect(Math.round(x + 8), Math.round(bodyY - 7.3), 1, 3);
  fillPixelEllipse(ctx, x - 6, bodyY - 1, 2, 1, '#8CD7FF');
  fillPixelEllipse(ctx, x - 7, bodyY + 1.2, 2, 1, '#8CD7FF');

  ctx.fillStyle = '#E1E8F5';
  const legFrame = Math.floor(tick / 10) % 2 === 0 ? 0 : 1.2;
  ctx.fillRect(x - 3.2, bodyY + 2.2, 1.6, 5 + legFrame);
  ctx.fillRect(x + 1.5, bodyY + 2.2, 1.6, 5 - legFrame * 0.7);
  ctx.restore();
}

export function drawCupid(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  direction: Direction,
  tick: number,
): void {
  const bob = Math.sin(tick * 0.1) * 1.1;
  const py = y - 12 + bob;
  ctx.save();
  if (direction === 'w') {
    ctx.translate(x * 2, 0);
    ctx.scale(-1, 1);
  }

  fillPixelEllipse(ctx, x, y + 1.5, 7, 2, 'rgba(9, 14, 24, 0.22)');
  fillPixelEllipse(ctx, x - 5.5, py - 1.5, 3, 2, '#FFFFFF');
  fillPixelEllipse(ctx, x + 5.5, py - 1.5, 3, 2, '#FFFFFF');

  ctx.fillStyle = '#F48FB1';
  fillPixelEllipse(ctx, x, py + 3.2, 4, 4, '#F48FB1');
  ctx.fillStyle = '#FFD7A8';
  fillPixelEllipse(ctx, x, py - 3.8, 3, 3, '#FFD7A8');
  ctx.fillStyle = '#FFD740';
  ctx.fillRect(x - 3, py - 7.2, 6, 1.4);
  ctx.restore();
}
