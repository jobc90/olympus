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
  prometheus: { hair: '#C84020', mantle: '#3E2808', trim: '#FF5010', crest: '#FF8030', prop: 'torch' },
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
const HD_RENDER_REV = 'ref_v17';
const HD_SPRITE_W = 32;
const HD_SPRITE_H = 64;
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
type HdFaceShape = 'round' | 'oval' | 'square' | 'heart' | 'long';

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
  faceShape: HdFaceShape;
}

interface HdFaceSpec {
  brow: HdBrowStyle;
  mouth: HdMouthStyle;
  eye: 'wide' | 'almond' | 'round' | 'narrow' | 'sleepy';
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
  faceShape: 'round',
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
  faceShape: 'oval',
};

const HD_AVATAR_SPECS: Record<WorkerLikeAvatar, HdAvatarSpec> = {
  athena:     { ...HD_BASE_FEMALE, height: 58, headW: 10, headH: 10, shoulder: 14, waist: 9,  hip: 12, hairStyle: 'bun',   outfitStyle: 'armor', skinA: '#F2DEC9', skinB: '#D2AE90', eye: '#24364A', faceShape: 'oval' },
  poseidon:   { ...HD_BASE_MALE,   height: 60, headW: 12, headH: 11, shoulder: 17, waist: 11, hip: 13, legW: 3, hairStyle: 'wavy',  outfitStyle: 'robe',  facial: 'beard',   skinA: '#ECD5BC', skinB: '#C8A487', eye: '#1E4A64', faceShape: 'square' },
  ares:       { ...HD_BASE_MALE,   height: 59, headW: 11, headH: 10, shoulder: 18, waist: 12, hip: 13, legW: 4, hairStyle: 'spike', outfitStyle: 'armor', facial: 'stubble', skinA: '#E7CCB2', skinB: '#BE9473', eye: '#45211E', faceShape: 'square' },
  apollo:     { ...HD_BASE_MALE,   height: 54, headW: 10, headH: 9,  shoulder: 11, waist: 8,  hip: 10, legW: 2, hairStyle: 'curly', outfitStyle: 'tunic', skinA: '#F3DCC2', skinB: '#D0AA85', eye: '#5C4021', faceShape: 'oval' },
  artemis:    { ...HD_BASE_FEMALE, height: 57, headW: 10, headH: 10, shoulder: 12, waist: 8,  hip: 11, hairStyle: 'pony',  outfitStyle: 'tunic', skinA: '#F2DEC9', skinB: '#CCAA8C', eye: '#2C4A32', faceShape: 'heart' },
  hermes:     { ...HD_BASE_MALE,   height: 51, headW: 9,  headH: 9,  shoulder: 10, waist: 8,  hip: 9,  legW: 2, hairStyle: 'short', outfitStyle: 'tunic', skinA: '#EFD6BB', skinB: '#C6A07F', eye: '#3D2D21', faceShape: 'long' },
  hephaestus: { ...HD_BASE_MALE,   height: 60, headW: 13, headH: 11, shoulder: 17, waist: 13, hip: 14, legW: 4, hairStyle: 'short', outfitStyle: 'armor', facial: 'beard',   skinA: '#E1C4A6', skinB: '#B98B66', eye: '#3A2A1F', faceShape: 'square' },
  dionysus:   { ...HD_BASE_MALE,   height: 53, headW: 11, headH: 10, shoulder: 12, waist: 9,  hip: 11, legW: 3, hairStyle: 'wavy',  outfitStyle: 'robe',  skinA: '#EED2B8', skinB: '#C6A07F', eye: '#4A2A56', faceShape: 'round' },
  demeter:    { ...HD_BASE_FEMALE, height: 59, headW: 11, headH: 10, shoulder: 13, waist: 9,  hip: 14, hairStyle: 'braid', outfitStyle: 'dress', skinA: '#F0D7BE', skinB: '#C8A583', eye: '#5A4726', faceShape: 'round' },
  aphrodite:  { ...HD_BASE_FEMALE, height: 55, headW: 10, headH: 9,  shoulder: 10, waist: 7,  hip: 13, hairStyle: 'curly', outfitStyle: 'gown',  skinA: '#F7E1CD', skinB: '#DDB69A', eye: '#5C2F4C', faceShape: 'heart' },
  hera:       { ...HD_BASE_FEMALE, height: 61, headW: 12, headH: 11, shoulder: 13, waist: 8,  hip: 15, hairStyle: 'long',  outfitStyle: 'gown',  skinA: '#F4DECB', skinB: '#D5AF96', eye: '#3B2A52', faceShape: 'oval' },
  hades:      { ...HD_BASE_MALE,   height: 59, headW: 11, headH: 10, shoulder: 14, waist: 9,  hip: 12, hairStyle: 'hood',  outfitStyle: 'cloak', facial: 'goatee',  skinA: '#E7D4C7', skinB: '#BCA091', eye: '#1F3040', faceShape: 'long' },
  persephone: { ...HD_BASE_FEMALE, height: 53, headW: 10, headH: 9,  shoulder: 10, waist: 7,  hip: 12, hairStyle: 'long',  outfitStyle: 'dress', skinA: '#F7E2CE', skinB: '#DDB89D', eye: '#5A3456', faceShape: 'heart' },
  prometheus: { ...HD_BASE_MALE,   height: 56, headW: 10, headH: 10, shoulder: 13, waist: 9,  hip: 11, legW: 3, hairStyle: 'wavy',  outfitStyle: 'tunic', skinA: '#E8CEB1', skinB: '#BF956F', eye: '#5A3827', faceShape: 'square' },
  helios:     { ...HD_BASE_MALE,   height: 58, headW: 11, headH: 10, shoulder: 14, waist: 10, hip: 12, legW: 3, hairStyle: 'spike', outfitStyle: 'robe',  skinA: '#EFD4B8', skinB: '#C59D76', eye: '#6B4A24', faceShape: 'round' },
  nike:       { ...HD_BASE_FEMALE, height: 51, headW: 9,  headH: 9,  shoulder: 10, waist: 7,  hip: 11, legW: 2, hairStyle: 'bun',   outfitStyle: 'tunic', skinA: '#F3DBC3', skinB: '#CCA885', eye: '#4D3F2F', faceShape: 'oval' },
  pan:        { ...HD_BASE_MALE,   height: 52, headW: 10, headH: 9,  shoulder: 14, waist: 10, hip: 12, legW: 3, hairStyle: 'curly', outfitStyle: 'tunic', facial: 'goatee',  skinA: '#DDB590', skinB: '#B68660', eye: '#3C2E24', faceShape: 'round' },
  hecate:     { ...HD_BASE_FEMALE, height: 56, headW: 11, headH: 10, shoulder: 12, waist: 8,  hip: 12, hairStyle: 'braid', outfitStyle: 'cloak', skinA: '#EBD9CE', skinB: '#BDA6A0', eye: '#4B3270', faceShape: 'long' },
  iris:       { ...HD_BASE_FEMALE, height: 50, headW: 9,  headH: 9,  shoulder: 9,  waist: 7,  hip: 11, legW: 2, hairStyle: 'pony',  outfitStyle: 'dress', skinA: '#F5DEC8', skinB: '#D8B092', eye: '#3E2A38', faceShape: 'heart' },
  heracles:   { ...HD_BASE_MALE,   height: 61, headW: 12, headH: 10, shoulder: 19, waist: 13, hip: 15, legW: 4, hairStyle: 'short',  outfitStyle: 'armor', facial: 'stubble', skinA: '#E5C6A6', skinB: '#BD936D', eye: '#3E2A21', faceShape: 'square' },
  selene:     { ...HD_BASE_FEMALE, height: 58, headW: 11, headH: 10, shoulder: 11, waist: 7,  hip: 13, hairStyle: 'long',  outfitStyle: 'gown',  skinA: '#F0E2D8', skinB: '#C7B7B8', eye: '#2C365C', faceShape: 'oval' },
  zeus:       { ...HD_BASE_MALE,   height: 61, headW: 13, headH: 11, shoulder: 18, waist: 12, hip: 14, legW: 4, hairStyle: 'spike', outfitStyle: 'robe',  facial: 'beard',   skinA: '#EDD5BC', skinB: '#C9A583', eye: '#3B2E1E', faceShape: 'square' },
};

const HD_FACE_SPECS: Record<WorkerLikeAvatar, HdFaceSpec> = {
  athena:     { brow: 'stern',  mouth: 'line',  eye: 'almond', eyeGap: 3, browLift: 0  },
  poseidon:   { brow: 'stern',  mouth: 'frown', eye: 'narrow', eyeGap: 3, browLift: 0  },
  ares:       { brow: 'fierce', mouth: 'frown', eye: 'narrow', eyeGap: 3, browLift: -1 },
  apollo:     { brow: 'arched', mouth: 'smile', eye: 'wide',   eyeGap: 2, browLift: 1  },
  artemis:    { brow: 'stern',  mouth: 'smirk', eye: 'almond', eyeGap: 3, browLift: 0  },
  hermes:     { brow: 'arched', mouth: 'smirk', eye: 'round',  eyeGap: 2, browLift: 1  },
  hephaestus: { brow: 'stern',  mouth: 'line',  eye: 'narrow', eyeGap: 3, browLift: -1 },
  dionysus:   { brow: 'soft',   mouth: 'smile', eye: 'round',  eyeGap: 2, browLift: 1  },
  demeter:    { brow: 'calm',   mouth: 'smile', eye: 'round',  eyeGap: 2, browLift: 1  },
  aphrodite:  { brow: 'arched', mouth: 'smile', eye: 'wide',   eyeGap: 2, browLift: 1  },
  hera:       { brow: 'arched', mouth: 'smirk', eye: 'almond', eyeGap: 3, browLift: 1  },
  hades:      { brow: 'fierce', mouth: 'line',  eye: 'sleepy', eyeGap: 3, browLift: -1 },
  persephone: { brow: 'soft',   mouth: 'smile', eye: 'wide',   eyeGap: 2, browLift: 1  },
  prometheus: { brow: 'stern',  mouth: 'smirk', eye: 'round',  eyeGap: 3, browLift: 0  },
  helios:     { brow: 'arched', mouth: 'smile', eye: 'wide',   eyeGap: 3, browLift: 1  },
  nike:       { brow: 'stern',  mouth: 'smirk', eye: 'wide',   eyeGap: 2, browLift: 0  },
  pan:        { brow: 'fierce', mouth: 'smirk', eye: 'round',  eyeGap: 2, browLift: -1 },
  hecate:     { brow: 'fierce', mouth: 'line',  eye: 'sleepy', eyeGap: 3, browLift: -1 },
  iris:       { brow: 'soft',   mouth: 'smile', eye: 'wide',   eyeGap: 2, browLift: 1  },
  heracles:   { brow: 'fierce', mouth: 'frown', eye: 'narrow', eyeGap: 3, browLift: -1 },
  selene:     { brow: 'calm',   mouth: 'line',  eye: 'almond', eyeGap: 2, browLift: 1  },
  zeus:       { brow: 'stern',  mouth: 'line',  eye: 'narrow', eyeGap: 3, browLift: 0  },
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
  const blink = tick > 0 && tick % 60 < 4 ? 1 : 0;  // tick=0 = always open (card preview)
  const step = moving ? frame % 2 : 0;
  const pose = seated ? 'sit' : 'stand';
  const key = `${HD_RENDER_REV}:${avatar}:${pose}:${step}:${blink}`;
  const cached = HD_SPRITE_CACHE.get(key);
  if (cached) return cached;

  // 32×64 canvas — drawn at 2× (64×128 CSS px) for crisp pixel-art upscale
  // New layout: hair y=0..13 | face y=8..33 | neck y=33..36 | body y=36..50 | legs y=50..58 | feet y=58..64
  const canvas = document.createElement('canvas');
  canvas.width = HD_SPRITE_W;  // 32
  canvas.height = HD_SPRITE_H;
  const c = canvas.getContext('2d');
  if (!c) return null;
  c.imageSmoothingEnabled = false;
  const px = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  };

  const spec = HD_AVATAR_SPECS[avatar];
  const faceSpec = HD_FACE_SPECS[avatar];
  // Reference-style proportions: big round head, simple body, short legs
  const hair = style.hair;
  const skin = spec.skinA;
  const skinSh = spec.skinB;
  // Outline color — dark near-black for visible border on all elements
  const OL = '#060810';
  // Draw with 1-pixel outline: expand by 1px in OL, then fill with color
  const pxO = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = OL;
    c.fillRect(x - 1, y - 1, w + 2, h + 2);
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  };
  const shirt = style.mantle;
  const trim = style.trim;
  const pants = '#1E2438';
  const shoes = '#0C0D18';
  const isF = spec.gender === 'f';
  // Hair shading helpers — darken/lighten hair color for strand depth
  const adjColor = (hex: string, delta: number): string => {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, Math.max(0, (n >> 16) + delta));
    const g = Math.min(255, Math.max(0, ((n >> 8) & 0xFF) + delta));
    const b = Math.min(255, Math.max(0, (n & 0xFF) + delta));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  };
  const hairSh = adjColor(hair, -80);   // shadow strand (dark)
  const hairHi = adjColor(hair, +100);  // highlight strand (bright)

  // ── Feet & Legs (new 64px canvas: y=50..63) ──────────────────────────
  if (!seated) {
    const lFY = step === 0 ? 59 : 60;
    const rFY = step === 1 ? 59 : 60;
    // Wider, more detailed shoes
    px(3,  lFY, 11, 4, shoes);
    px(18, rFY, 11, 4, shoes);
    // Shoe highlight
    px(4,  lFY, 5, 1, '#1C2236');
    px(19, rFY, 5, 1, '#1C2236');
    // Toe cap
    px(3, lFY + 2, 4, 2, '#16192C');
    px(18, rFY + 2, 4, 2, '#16192C');

    const lLY = step === 0 ? 51 : 52;
    const rLY = step === 1 ? 51 : 52;
    // Leg width: female slightly narrower
    const legW = isF ? 6 : 8;
    const legX2 = isF ? 19 : 18;
    px(5,    lLY, legW, 8, pants);
    px(legX2, rLY, legW, 8, pants);
    // Leg highlight (left edge inner)
    px(6,    lLY + 1, 2, 6, adjColor(pants, 28));
    px(legX2 + 1, rLY + 1, 2, 6, adjColor(pants, 28));
    // Knee shadow line
    px(5,    lLY + 4, legW, 2, '#141828');
    px(legX2, rLY + 4, legW, 2, '#141828');
  } else {
    px(5,  59, 8, 4, shoes);
    px(19, 59, 8, 4, shoes);
  }

  // ── Body / outfit (new 64px: torso y=37..50) ─────────────────────────
  const bodyY = 37;
  const bodyH = 13;
  switch (spec.outfitStyle) {
    case 'armor': {
      // Wide breastplate with prominent pauldrons sticking OUT
      pxO(5, bodyY, 22, bodyH + 1, shirt);
      px(7, bodyY + 2, 18, 9, '#B4C2D0');        // chest plate base
      px(7, bodyY + 2, 18, 3, '#D2E4EE');         // plate top highlight
      px(7, bodyY + 11, 18, 2, '#7A8E9E');        // plate bottom shadow
      // Pauldrons — strongly protruding shoulders
      pxO(0, bodyY, 7, 10, '#8898A8');
      pxO(25, bodyY, 7, 10, '#8898A8');
      px(0, bodyY, 7, 3, '#A4B8C8');              // pauldron top hi
      px(25, bodyY, 7, 3, '#A4B8C8');
      px(0, bodyY + 8, 7, 2, '#5A6A7A');          // pauldron bottom sh
      px(25, bodyY + 8, 7, 2, '#5A6A7A');
      // Rivet plates
      pxO(7, bodyY + 4, 5, 5, '#9AAEBA');
      pxO(20, bodyY + 4, 5, 5, '#9AAEBA');
      // Collar
      pxO(9, bodyY, 14, 2, trim);
      // Belt
      px(7, bodyY + 11, 18, 2, '#2E1808');
      px(13, bodyY + 11, 6, 2, '#C8A040');        // buckle gold
      break;
    }
    case 'robe': {
      // Wide flowing robe — fills more horizontal space
      pxO(2, bodyY, 28, bodyH + 5, shirt);
      pxO(9, bodyY, 14, 2, trim);                // collar
      px(13, bodyY, 6, 9, skin);                 // V-neck skin
      pxO(5, bodyY + 7, 22, 2, trim);            // sash belt
      px(12, bodyY + 7, 8, 2, '#B09030');        // belt buckle
      // Hem flare
      pxO(1, bodyY + bodyH, 30, 4, adjColor(shirt, -15));
      // Side folds (depth)
      px(3, bodyY + 3, 2, bodyH, adjColor(shirt, -35));
      px(27, bodyY + 3, 2, bodyH, adjColor(shirt, -35));
      break;
    }
    case 'tunic': {
      pxO(5, bodyY, 22, bodyH, shirt);
      // Collar V-tabs
      pxO(7, bodyY, 5, 3, trim);
      pxO(20, bodyY, 5, 3, trim);
      // Leather belt
      pxO(5, bodyY + 9, 22, 3, '#2E1808');
      px(13, bodyY + 9, 6, 3, '#C8A040');        // buckle
      // Shirt texture
      px(7, bodyY + 3, 2, 5, adjColor(shirt, -28));
      px(23, bodyY + 3, 2, 5, adjColor(shirt, -28));
      break;
    }
    case 'gown': {
      // Royal gown — upper bodice narrow, wide A-line skirt
      pxO(6, bodyY, 20, 7, shirt);               // bodice
      pxO(3, bodyY + 7, 26, 7, shirt);           // upper skirt flare
      pxO(0, bodyY + 14, 32, 5, shirt);          // wide hem
      // Bodice trim stripes
      pxO(5, bodyY, 2, 7, trim);
      pxO(25, bodyY, 2, 7, trim);
      pxO(9, bodyY, 14, 2, trim);                // neckline
      // Skirt fold lines
      px(4, bodyY + 9, 1, 9, adjColor(shirt, -40));
      px(8, bodyY + 9, 1, 11, adjColor(shirt, -25));
      px(14, bodyY + 9, 1, 11, adjColor(shirt, -15));
      px(18, bodyY + 9, 1, 11, adjColor(shirt, -15));
      px(24, bodyY + 9, 1, 11, adjColor(shirt, -25));
      px(28, bodyY + 9, 1, 9, adjColor(shirt, -40));
      break;
    }
    case 'dress': {
      // Cute dress with clearly flared skirt
      pxO(6, bodyY, 20, 6, shirt);               // bodice
      pxO(2, bodyY + 6, 28, 8, shirt);           // skirt flare
      pxO(0, bodyY + 14, 32, 4, shirt);          // hem
      // Yoke stripe
      pxO(8, bodyY + 2, 16, 2, trim);
      // Collar
      pxO(10, bodyY, 12, 2, trim);
      // Skirt pleats
      px(4, bodyY + 7, 1, 10, adjColor(shirt, -35));
      px(9, bodyY + 7, 1, 11, adjColor(shirt, -20));
      px(16, bodyY + 7, 1, 11, adjColor(shirt, -15));
      px(23, bodyY + 7, 1, 11, adjColor(shirt, -20));
      px(28, bodyY + 7, 1, 10, adjColor(shirt, -35));
      break;
    }
    case 'cloak': {
      // Dark sweeping cloak
      pxO(2, bodyY, 28, bodyH + 7, shirt);
      px(0, bodyY + 2, 5, bodyH + 5, '#101828'); // deep L shadow
      px(27, bodyY + 2, 5, bodyH + 5, '#101828'); // deep R shadow
      // Inner body visible
      px(9, bodyY + 2, 14, bodyH, skinSh);
      pxO(9, bodyY, 14, 2, trim);                // inner collar
      // Cloak clasp
      px(14, bodyY + 3, 4, 4, trim);
      px(15, bodyY + 3, 2, 2, adjColor(trim, 60)); // clasp highlight
      break;
    }
    default:
      pxO(5, bodyY, 22, bodyH, shirt);
      pxO(10, bodyY, 12, 2, trim);
  }
  px(5, bodyY + 2, 2, bodyH - 2, skinSh);        // left-edge body shadow
  px(4, bodyY + bodyH + 1, 24, 2, '#12101E');    // hip line separator

  // ── Arms (styled by outfit) ──────────────────────────────────────────
  const armY = bodyY + 2;
  const armH = 11;
  if (spec.outfitStyle === 'armor') {
    // Forearms below pauldrons — skin exposed
    pxO(0, armY + 7, 6, 8, skin);
    pxO(26, armY + 7, 6, 8, skin);
    px(0, armY + 7, 2, 8, skinSh);
  } else if (spec.outfitStyle === 'cloak' || spec.outfitStyle === 'robe') {
    pxO(0, armY, 6, armH + 3, shirt);           // wide sleeve L
    pxO(26, armY, 6, armH + 3, shirt);          // wide sleeve R
    px(0, armY, 2, armH + 3, adjColor(shirt, -32)); // sleeve shadow
  } else {
    pxO(1, armY + 1, 5, armH, shirt);
    pxO(26, armY + 1, 5, armH, shirt);
    px(1, armY + 1, 2, armH, adjColor(shirt, -28)); // arm shadow
  }

  // ── Hands ─────────────────────────────────────────────────────────────
  pxO(0, armY + 6, 5, 5, skin);
  pxO(27, armY + 6, 5, 5, skin);
  px(0, armY + 6, 2, 5, skinSh);               // hand shadow L

  // ── Neck (new 64px: y=33..36) ─────────────────────────────────────────
  px(12, 33, 8, 3, skin);
  px(14, 33, 4, 3, skinSh);

  // ── Face skin — chibi-style: narrower heads, bigger forehead proportion ──
  const faceShape = spec.faceShape ?? 'round';
  switch (faceShape) {
    case 'round':  // 통통하고 둥근 얼굴 (22px wide, cute chibi)
      px(5, 9, 22, 23, skin);
      px(5, 11, 3, 16, skinSh);    // L cheek shadow (narrower)
      px(24, 11, 3, 16, skinSh);   // R cheek shadow
      px(11, 29, 10, 2, skinSh);   // chin roundness (narrower)
      px(7, 32, 18, 2, '#2E1808');
      break;
    case 'oval':   // 우아한 타원 — 여신미 (already narrow, soften chin)
      px(6, 7, 20, 25, skin);
      px(6, 9, 3, 18, skinSh);     // narrow L shadow
      px(23, 9, 3, 18, skinSh);    // narrow R shadow
      px(11, 29, 10, 2, skinSh);
      px(8, 32, 16, 2, '#2E1808');
      break;
    case 'square': // 강인한 각진 얼굴 — 영웅형 (24px, was 28px!)
      px(4, 9, 24, 23, skin);
      px(4, 11, 2, 18, skinSh);    // flat L edge
      px(26, 11, 2, 18, skinSh);   // flat R edge
      px(6, 29, 20, 3, skinSh);    // chin shadow (narrower)
      // Square jaw corners
      px(4, 23, 3, 9, skinSh);
      px(25, 23, 3, 9, skinSh);
      px(5, 32, 22, 2, '#2E1808');
      break;
    case 'heart':  // 위 넓고 V자 턱 — 소녀미 (24px top, was 28px!)
      px(4, 9, 24, 14, skin);      // 넓은 상단
      px(5, 23, 22, 5, skin);      // 중단 좁아짐
      px(10, 28, 12, 4, skin);     // V턱
      px(4, 11, 3, 12, skinSh);
      px(25, 11, 3, 12, skinSh);
      px(12, 30, 8, 2, skinSh);    // narrow chin
      px(10, 32, 12, 2, '#2E1808');
      break;
    case 'long':   // 길고 좁은 얼굴 — 고귀한 느낌 (already narrow, fine)
      px(7, 5, 18, 28, skin);
      px(7, 7, 3, 22, skinSh);
      px(22, 7, 3, 22, skinSh);
      px(12, 31, 8, 2, skinSh);
      px(9, 32, 14, 2, '#2E1808');
      break;
  }

  // ── Hair — each style has distinct silhouette readable at a glance ───
  switch (spec.hairStyle) {
    case 'long': {
      // Very long flowing hair — clearly female silhouette
      px(7, 0, 18, 3, hair);
      px(4, 2, 24, 9, hair);
      px(2, 4, 28, 7, hair);
      // Long side flows past face all the way to waist y=10..44
      px(0, 10, 5, 35, hair);      // L flow deep past shoulder
      px(27, 10, 5, 35, hair);     // R flow
      // Wide shoulder cascade
      px(0, 28, 8, 16, hair);      // L shoulder cascade (wide)
      px(24, 28, 8, 16, hair);     // R shoulder cascade
      // Cap shading
      px(10, 1, 12, 3, hairHi);    // top highlight
      px(5,  4, 3, 5, hairSh);     // L shadow
      px(24, 4, 3, 5, hairSh);     // R shadow
      px(14, 4, 4, 5, hairSh);     // center part
      // Flow strands
      px(1,  12, 2, 30, hairHi);   // L inner strand
      px(0,  12, 1, 30, hairSh);   // L outer strand
      px(29, 12, 2, 30, hairHi);   // R inner strand
      px(31, 12, 1, 30, hairSh);   // R outer strand
      // Cascade waves
      px(2, 30, 2, 10, hairSh);
      px(4, 32, 2, 10, hairHi);
      px(26, 30, 2, 10, hairSh);
      px(28, 32, 2, 10, hairHi);
      break;
    }
    case 'wavy': {
      // Wide wavy hair — lots of volume
      px(7, 0, 18, 2, hair);
      px(4, 2, 24, 5, hair);
      px(0, 5, 32, 7, hair);       // full-width wave crest
      // Side waves with S-curve
      px(0, 12, 5, 8, hair);       // L wave bump 1
      px(27, 12, 5, 8, hair);      // R wave bump 1
      px(0, 20, 5, 8, hair);       // L wave bump 2
      px(27, 20, 5, 8, hair);      // R wave bump 2
      px(0, 28, 8, 14, hair);      // L shoulder wave wide
      px(24, 28, 8, 14, hair);     // R shoulder wave wide
      // Cap shading
      px(10, 1, 12, 3, hairHi);
      px(5,  5, 3, 4, hairSh);
      px(24, 5, 3, 4, hairSh);
      px(14, 5, 4, 4, hairSh);
      // Wave S-curve shading
      px(1, 13, 3, 4, hairHi); px(1, 17, 3, 4, hairSh);
      px(1, 21, 3, 4, hairHi); px(1, 25, 3, 4, hairSh);
      px(28, 13, 3, 4, hairHi); px(28, 17, 3, 4, hairSh);
      px(28, 21, 3, 4, hairHi); px(28, 25, 3, 4, hairSh);
      break;
    }
    case 'spike': {
      // 3 TALL dramatic spikes — unmistakable silhouette
      // Spike L: rises high above head
      px(4,  7, 6, 2, hair);
      px(5,  4, 5, 3, hair);
      px(6,  2, 4, 2, hair);
      px(7,  0, 3, 2, hair);       // spike L tip (very top)
      // Spike C: tallest center spike
      px(12, 5, 8, 3, hair);
      px(13, 2, 6, 3, hair);
      px(14, 0, 4, 2, hair);       // spike C tip
      // Spike R
      px(22, 7, 6, 2, hair);
      px(23, 4, 5, 3, hair);
      px(23, 2, 4, 2, hair);
      px(22, 0, 3, 2, hair);       // spike R tip
      // Base cap
      px(3, 9, 26, 5, hair);
      px(2, 11, 28, 3, hair);
      // Spike shading (3D depth)
      px(7, 0, 2, 5, hairHi); px(9, 0, 2, 5, hairSh);
      px(14, 0, 2, 5, hairHi); px(16, 0, 2, 5, hairSh);
      px(22, 0, 2, 5, hairHi); px(24, 0, 2, 5, hairSh);
      px(10, 10, 3, 3, hairHi);
      px(22, 10, 3, 3, hairSh);
      break;
    }
    case 'bun': {
      // Big prominent top-knot bun — clearly elevated above head
      px(8,  0, 16, 5, hair);      // bun top sphere
      px(10, 0, 12, 3, hair);      // bun crest
      px(6,  5, 20, 5, hair);      // bun base merge
      px(4,  8, 24, 5, hair);      // cap
      px(2, 11, 28, 3, hair);      // widest point
      // Bun 3D shading — top-left highlight, bottom-right shadow
      px(12, 0, 6, 2, hairHi);     // bun top highlight
      px(10, 2, 5, 3, hairHi);     // upper-left area
      px(20, 4, 5, 5, hairSh);     // lower-right shadow
      px(9,  6, 3, 3, hairSh);
      px(15, 9, 5, 2, hairHi);     // cap highlight
      px(24, 9, 4, 3, hairSh);     // cap shadow
      // Tight side wrap (no flowing hair = clearly tied up)
      px(2, 12, 3, 4, hairSh);
      px(27, 12, 3, 4, hairSh);
      break;
    }
    case 'curly': {
      // Massive fluffy cloud — maximum volume
      px(4,  0, 24, 3, hair);
      px(0,  2, 32, 5, hair);
      px(0,  6, 32, 6, hair);
      px(0, 12, 32, 7, hair);
      px(0, 19,  6, 14, hair);     // L puff deep
      px(26, 19, 6, 14, hair);     // R puff deep
      // Shoulder puffs
      px(0, 30, 9, 12, hair);      // L shoulder puff wide
      px(23, 30, 9, 12, hair);     // R shoulder puff wide
      // Curly volume shading (bumpy texture)
      px(12, 1, 8, 2, hairHi);
      px(2,  4, 2, 4, hairSh); px(28, 4, 2, 4, hairSh);
      px(7,  7, 4, 2, hairHi); px(21, 7, 4, 2, hairSh);
      px(4, 12, 2, 4, hairHi); px(26, 12, 2, 4, hairSh);
      px(2, 20, 2, 6, hairSh); px(4, 22, 2, 4, hairHi);
      px(26, 20, 2, 6, hairSh); px(28, 22, 2, 4, hairHi);
      // Circular curls pattern
      px(8, 8, 2, 2, hairHi); px(14, 6, 2, 2, hairHi); px(20, 8, 2, 2, hairHi);
      px(9, 11, 2, 2, hairSh); px(15, 9, 2, 2, hairSh); px(21, 11, 2, 2, hairSh);
      break;
    }
    case 'pony': {
      // Cap + thick side ponytail — active/sporty look
      px(7, 0, 18, 3, hair);
      px(4, 2, 24, 9, hair);
      px(2, 5, 28, 6, hair);
      // Hair tie
      px(24, 12, 3, 3, trim);
      // Thick ponytail flopping to the right (past shoulder)
      px(24, 15, 8, 30, hair);
      // Cap shading
      px(10, 2, 12, 2, hairHi);
      px(5,  5, 2, 5, hairSh);
      px(14, 5, 3, 4, hairSh);
      // Ponytail strands (depth texture)
      px(25, 17, 2, 26, hairHi);
      px(29, 17, 2, 26, hairSh);
      px(31, 21, 1, 18, hairHi);   // outer edge glint
      // End curl
      px(24, 43, 8, 2, hairSh);
      break;
    }
    case 'braid': {
      // Cap + thick side braid with visible segments
      px(7, 0, 18, 3, hair);
      px(4, 2, 24, 9, hair);
      px(2, 5, 28, 6, hair);
      // Thick braid column
      px(24, 12, 6, 38, hair);
      // Braid segment knots (alternating)
      [16, 22, 28, 34, 40, 46].forEach(sy => px(24, sy, 6, 2, trim));
      // Cap shading
      px(10, 2, 12, 2, hairHi);
      px(5, 5, 2, 5, hairSh);
      px(14, 5, 3, 4, hairSh);
      // Braid depth strands
      px(25, 14, 2, 32, hairHi);
      px(28, 14, 2, 32, hairSh);
      // Braid tip
      px(25, 48, 4, 3, hairSh);
      break;
    }
    case 'hood': {
      // Full hood covering most of head — mystical look
      px(0, 0, 32, 36, shirt);
      px(4, 9, 24, 24, skin);      // face opening wider
      px(26, 11, 4, 20, skinSh);   // R inner hood shadow
      px(10, 30, 12, 2, skinSh);   // chin shadow
      // Hood fabric folds
      px(2,  5, 2, 22, hairSh);
      px(28, 5, 2, 22, hairSh);
      px(8,  2, 4, 5, hairHi);     // lit upper area
      // Hood drape (hangs down back)
      px(0, 30, 6, 8, adjColor(shirt, -20));
      px(26, 30, 6, 8, adjColor(shirt, -20));
      break;
    }
    default: { // 'short' — compact rounded cap
      px(7, 0, 18, 3, hair);
      px(4, 2, 24, 10, hair);
      px(2, 5, 28, 7, hair);
      // Cap shading
      px(10, 1, 12, 3, hairHi);    // top highlight
      px(5,  5, 3, 7, hairSh);     // L shadow
      px(22, 5, 3, 7, hairSh);     // R shadow
      px(14, 6, 4, 4, hairSh);     // center shadow
      // Ear studs (short hair shows ears)
      px(2, 15, 2, 3, skinSh);
      px(28, 15, 2, 3, skinSh);
      break;
    }
  }

  // ── Hair cap underline — separates hair from forehead ────────────────
  if (spec.hairStyle !== 'hood' && spec.hairStyle !== 'curly') {
    px(3, 13, 26, 2, '#1A1208');   // hair/forehead boundary
  }

  // ── Crown / Head Accessory (drawn on top of hair) ─────────────────────
  switch (profile.crown) {
    case 'gold': {
      // 3-point golden crown — taller and more regal
      px(6, -3, 20, 9, OL);
      px(7, -2, 18, 2, '#D4AF37');              // band
      px(9, -3, 3, 6, '#F0D060');               // L point
      px(14, -4, 4, 7, '#FFE070');              // C peak (tallest)
      px(20, -3, 3, 6, '#F0D060');              // R point
      px(14, -3, 4, 2, '#FFF5C0');              // gem sparkle
      px(16, -4, 2, 2, '#FFFAE8');              // top flash
      break;
    }
    case 'silver': {
      px(6, -3, 20, 8, OL);
      px(7, -2, 18, 2, '#B8C8D8');
      px(8, -3, 5, 6, '#D8E8F0');               // L point
      px(19, -3, 5, 6, '#D8E8F0');              // R point
      px(13, -3, 6, 3, '#E8F4FF');              // C highlight
      px(15, -4, 2, 2, '#FFFFFF');              // apex
      break;
    }
    case 'laurel': {
      px(4, -2, 24, 7, OL);
      px(5, -1, 6, 5, '#4A7828');               // L leaf cluster
      px(10, -1, 12, 3, '#3A6020');             // wreath center
      px(21, -1, 6, 5, '#4A7828');              // R leaf cluster
      px(6, -1, 2, 2, '#78B848');               // hi leaf L
      px(11, -1, 2, 2, '#5A9A38');
      px(19, -1, 2, 2, '#5A9A38');
      px(24, -1, 2, 2, '#78B848');              // hi leaf R
      break;
    }
    case 'horn': {
      // Two curved horns — clearly animal/divine
      px(2, -4, 7, 13, OL);
      px(23, -4, 7, 13, OL);
      px(3, -3, 5, 11, '#8D6E63');              // L horn body
      px(4, -3, 3, 6, '#A08060');               // L horn tip
      px(24, -3, 5, 11, '#8D6E63');             // R horn body
      px(24, -3, 3, 6, '#A08060');              // R horn tip
      px(3, 8, 7, 2, '#5D4E43');                // L base shadow
      px(22, 8, 7, 2, '#5D4E43');               // R base shadow
      break;
    }
  }

  // ── Hair crest accent (style.crest color, drawn on hair cap) ──────────
  if (style.crest) {
    px(12, 6, 8, 2, style.crest);              // crest stripe in hair
  }

  // ── Eyebrows (dark brown — clearly visible against skin) ─────────────
  const browY = 13;
  const browClr = '#2E1208';
  if (isF) {
    // ── Female eyebrows: thin, arched, elegant ──────────────────────────
    if (faceSpec.brow === 'arched' || faceSpec.brow === 'soft') {
      // Thin arched brow — 1px, curves upward
      px(8,  browY,     8, 1, browClr);          // L brow base
      px(9,  browY - 1, 5, 1, browClr);          // L brow arch peak
      px(19, browY,     8, 1, browClr);          // R brow base
      px(20, browY - 1, 5, 1, browClr);          // R brow arch peak
    } else {
      px(8,  browY, 8, 1, browClr);              // L brow flat
      px(19, browY, 8, 1, browClr);              // R brow flat
    }
  } else {
    // ── Male eyebrows: thick, strong, angled ────────────────────────────
    if (faceSpec.brow === 'fierce') {
      // Angry V-shape thick brows
      px(7,  browY,     9, 2, browClr);          // L brow thick
      px(18, browY,     9, 2, browClr);          // R brow thick
      px(7,  browY - 1, 3, 1, browClr);          // L outer raised tip
      px(24, browY - 1, 3, 1, browClr);          // R outer raised tip (OUTWARD = angry)
      px(13, browY,     3, 1, skinSh);            // inner gap L (stern angle)
    } else if (faceSpec.brow === 'stern') {
      px(7,  browY,     9, 2, browClr);
      px(18, browY,     9, 2, browClr);
      px(7,  browY - 1, 2, 1, browClr);          // outer lift L
      px(25, browY - 1, 2, 1, browClr);          // outer lift R
    } else {
      // calm / arched male
      px(8,  browY, 8, 2, browClr);
      px(19, browY, 8, 2, browClr);
    }
  }

  // ── Eyes — solid black dots, no sclera, 5 distinct shapes ───────────
  const eyeY = 16;
  const lEX = 7;
  const rEX = 18;
  const eyeStyle = faceSpec.eye;

  if (!blink) {
    switch (eyeStyle) {
      case 'wide': {
        // Big solid oval + sparkle — large cute chibi eyes
        for (const eX of [lEX, rEX]) {
          px(eX,     eyeY - 1, 7, 1, '#18100A');             // top lash
          px(eX,     eyeY,     7, 6, '#060814');              // big oval 7×6
          px(eX,     eyeY,     1, 1, skin); px(eX+6, eyeY,     1, 1, skin); // TL/TR round
          px(eX,     eyeY+5,   1, 1, skin); px(eX+6, eyeY+5,   1, 1, skin); // BL/BR round
          px(eX+1,   eyeY+1,   2, 2, '#FFFFFF');              // sparkle 2×2
          px(eX+5,   eyeY+4,   1, 1, '#9090D8');              // secondary sparkle
        }
        break;
      }
      case 'almond': {
        // Elongated cat-eye mark — flat, wide, pointed at both ends
        for (const [eX, rt] of [[lEX-1, false], [rEX, true]] as [number, boolean][]) {
          px(eX,     eyeY-1,   10, 2, '#18100A');             // lid + base (10px)
          px(rt ? eX+10 : eX-2, eyeY, 2, 1, '#18100A');      // cat-eye outer flick
          px(eX+2,   eyeY,     6, 1, '#060814');              // top row (narrow)
          px(eX+1,   eyeY+1,   8, 2, '#060814');              // middle rows (full)
          px(eX+2,   eyeY+3,   6, 1, '#060814');              // bottom row (narrow)
          px(eX+2,   eyeY+1,   1, 1, '#FFFFFF');              // sparkle
        }
        break;
      }
      case 'round': {
        // Round circle dot — 5×5 circle shape, friendly
        for (const eX of [lEX, rEX]) {
          px(eX+1,   eyeY,     4, 1, '#060814');              // top row
          px(eX,     eyeY+1,   6, 3, '#060814');              // middle rows (wider)
          px(eX+1,   eyeY+4,   4, 1, '#060814');              // bottom row
          px(eX+1,   eyeY+1,   1, 1, '#FFFFFF');              // sparkle
        }
        break;
      }
      case 'narrow': {
        // Heavy lid + single-pixel slit — fierce squint
        for (const eX of [lEX, rEX]) {
          px(eX,     eyeY,     9, 2, '#18100A');              // 2px heavy lid
          px(eX,     eyeY+2,   9, 1, '#060814');              // 1px thin slit
          px(eX,     eyeY+3,   9, 1, skinSh);                 // lower lid line
        }
        break;
      }
      default: { // 'sleepy'
        // Half-visible dot under drooping thick lid
        for (const [eX, rt] of [[6, false], [17, true]] as [number, boolean][]) {
          const drX = rt ? eX+9 : eX;
          px(eX,     eyeY-1,   11, 3, '#18100A');             // 3px thick drooping lid
          px(drX,    eyeY+2,   2,  2, '#18100A');             // outer corner droop
          px(eX+1,   eyeY+2,   8,  3, '#060814');             // half-visible dot
          px(eX+2,   eyeY+2,   1,  1, '#5858A0');             // dim sparkle
          px(eX+1,   eyeY+4,   8,  1, skinSh);                // lower lash
        }
        break;
      }
    }
  } else {
    // Blink — closed eye crease
    px(lEX,   eyeY+2, 9, 2, skinSh);
    px(lEX+1, eyeY+1, 7, 1, '#18100A');
    px(rEX,   eyeY+2, 9, 2, skinSh);
    px(rEX+1, eyeY+1, 7, 1, '#18100A');
  }

  // ── Blush marks — small, subtle, cheekbone level ────────────────────
  const blushY = 25;   // fixed cheekbone position
  if (isF) {
    // Female: soft small oval blush on cheekbones
    px(5,  blushY, 5, 2, '#F0A8A0');
    px(22, blushY, 5, 2, '#F0A8A0');
  }
  // Males: no blush — more defined look

  // ── Nose bridge (male only — very subtle shadow) ──────────────────────
  if (!isF && (faceSpec.brow === 'stern' || faceSpec.brow === 'fierce')) {
    px(14, 23, 4, 3, skinSh);   // nose shadow ridge (fixed position)
  }

  // ── Beard / Facial Hair (male characters) ────────────────────────────
  if (!isF) {
    if (spec.facial === 'beard') {
      // Full beard on chin/jaw area y=30..33
      px(7,  30, 18, 4, adjColor(hair, -25));
      px(8,  31, 16, 2, adjColor(hair, 15));   // beard highlight
      px(7,  30, 1,  4, adjColor(hair, -60));  // L edge dark
      px(24, 30, 1,  4, adjColor(hair, -60));  // R edge dark
    } else if (spec.facial === 'goatee') {
      // Goatee on chin only
      px(12, 30, 8, 4, adjColor(hair, -15));
      px(13, 31, 5, 2, adjColor(hair, 20));    // goatee highlight
    } else if (spec.facial === 'stubble') {
      // Scattered stubble pixels
      px(8,  30, 2, 1, adjColor(hair, -25));
      px(12, 31, 2, 1, adjColor(hair, -25));
      px(16, 30, 2, 1, adjColor(hair, -25));
      px(20, 31, 2, 1, adjColor(hair, -25));
    }
  }

  // ── Mouth (new y=28..31) ─────────────────────────────────────────────
  const mouthY = 28;
  // Lip colors: muted, natural — not monkey-grin bright
  const lipHi = isF ? '#C06068' : '#904030';
  const lipLo = isF ? '#8C3048' : '#6C2820';
  if (faceSpec.mouth === 'smile') {
    // Small cute smile — 8px wide max, no big teeth
    px(12, mouthY,     1, 2, lipLo);            // L corner dot
    px(19, mouthY,     1, 2, lipLo);            // R corner dot
    px(13, mouthY - 1, 6, 1, lipHi);            // thin upper lip
    px(13, mouthY,     6, 1, lipLo);            // thin lower lip
    if (isF) {
      px(13, mouthY - 1, 6, 1, adjColor(lipHi, 25)); // lip gloss on upper
    }
  } else if (faceSpec.mouth === 'open') {
    px(12, mouthY, 1, 2, lipLo);
    px(19, mouthY, 1, 2, lipLo);
    px(13, mouthY, 6, 2, '#501010');            // small open mouth interior
    px(13, mouthY, 6, 1, lipHi);
  } else if (faceSpec.mouth === 'frown') {
    px(12, mouthY + 1, 1, 2, lipLo);            // L corner down
    px(19, mouthY + 1, 1, 2, lipLo);            // R corner down
    px(13, mouthY,     6, 1, adjColor(lipHi, -10));
    px(13, mouthY + 1, 6, 1, lipLo);            // downward curve
  } else if (faceSpec.mouth === 'smirk') {
    px(12, mouthY,     1, 2, lipLo);            // L corner flat
    px(19, mouthY - 1, 1, 2, lipLo);            // R corner raised
    px(13, mouthY,     7, 1, lipHi);
    px(17, mouthY - 1, 3, 1, adjColor(lipHi, 20)); // raised side hi
  } else {
    // line — most subtle: just a thin horizontal crease
    px(12, mouthY, 8, 1, lipHi);
    px(12, mouthY + 1, 8, 1, lipLo);
  }

  // ── Prop (held item — coords adjusted for new 64px canvas) ──────────
  switch (style.prop) {
    case 'spear':
      px(25, 5, 5, 56, OL);
      px(28, 6, 2, 2, '#E8D878');    // spearhead tip
      px(26, 8, 4, 3, '#E8D878');    // head barb
      px(27, 8, 1, 3, '#FFFAC0');    // barb shine
      px(28, 11, 2, 48, '#8B6540');  // shaft
      px(29, 11, 1, 48, '#C8A070');  // shaft highlight
      break;
    case 'trident':
      px(25, 1, 7, 60, OL);
      px(26, 4, 2, 8, '#88DDFF');
      px(28, 2, 2, 10, '#88DDFF');   // center tine (tallest)
      px(30, 4, 2, 8, '#88DDFF');
      px(28, 12, 2, 48, '#4488CC');  // shaft
      px(29, 12, 1, 48, '#88CCEE');  // shine
      break;
    case 'blade':
      px(25, 9, 7, 12, OL);
      px(27, 21, 4, 14, OL);
      px(28, 10, 2, 10, '#D8E0E8');
      px(30, 10, 2, 8, '#F0F4FF');   // blade shine
      px(26, 20, 6, 2, '#D0C0A0');   // crossguard
      px(28, 22, 2, 12, '#9B7A50');  // handle
      px(28, 28, 2, 2, '#C8A870');   // handle wrap
      break;
    case 'sunstaff':
      px(25, 3, 7, 10, OL);
      px(27, 12, 4, 48, OL);
      px(26, 4, 6, 8, '#FFE878');    // sun orb
      px(28, 5, 2, 6, '#FFFAC0');    // orb center shine
      px(29, 14, 2, 46, '#C8A040');  // staff
      px(30, 14, 1, 46, '#E8C060');  // staff hi
      break;
    case 'hammer':
      px(23, 23, 9, 10, OL);
      px(27, 33, 4, 22, OL);
      px(24, 24, 8, 8, '#8D6E63');
      px(26, 23, 4, 2, '#A88060');   // top cap
      px(28, 34, 2, 20, '#B0BEC5');  // handle
      px(29, 36, 1, 14, '#D0DCE5');  // handle shine
      break;
    case 'torch':
      px(25, 8, 7, 10, OL);
      px(27, 16, 4, 44, OL);
      px(26, 9, 6, 8, tick % 18 < 10 ? '#FFB74D' : '#FF8030');
      px(28, 9, 2, 4, tick % 18 < 10 ? '#FFEB3B' : '#FFD740');
      px(29, 18, 2, 42, '#8D6E63');
      break;
    case 'vine':
      px(-1, 37, 6, 24, OL);
      px(0, 38, 4, 2, '#9CCC65');
      px(0, 40, 2, 20, '#558844');
      px(0, 44, 4, 2, '#78CC48');
      px(0, 52, 4, 2, '#78CC48');
      break;
    case 'wheat':
      px(27, 16, 5, 6, OL);
      px(27, 34, 4, 22, OL);
      px(28, 17, 4, 3, '#F2CF6C');
      px(30, 21, 2, 2, '#F2CF6C');
      px(28, 23, 4, 4, '#F2CF6C');
      px(29, 36, 2, 20, '#C49A30');
      break;
    case 'mirror':
      px(23, 39, 9, 12, OL);
      px(25, 51, 4, 12, OL);
      px(26, 40, 6, 10, '#EADCF5');
      px(24, 40, 2, 10, '#C8B6E3');
      px(30, 40, 2, 10, '#C8B6E3');
      px(27, 52, 2, 10, '#B8A0D0');
      break;
    case 'obsidian_staff':
      px(25, 3, 7, 10, OL);
      px(27, 12, 4, 48, OL);
      px(26, 4, 6, 8, '#90A4AE');
      px(28, 4, 2, 8, '#B8C8D0');
      px(28, 13, 2, 46, '#37474F');
      px(29, 15, 1, 42, '#607080');  // staff highlight
      break;
    case 'rose':
      px(25, 36, 7, 10, OL);
      px(27, 46, 4, 16, OL);
      px(26, 37, 6, 8, '#EC6C9E');
      px(27, 37, 3, 4, '#F898C0');   // rose highlight
      px(28, 47, 2, 14, '#6FB377');
      break;
    case 'halo':
      px(3, 1, 26, 9, OL);
      px(8, 2, 16, 2, '#FDE68A');
      px(4, 4, 4, 2, '#FDE68A');
      px(24, 4, 4, 2, '#FDE68A');
      px(6, 6, 2, 3, '#FFF5C0');
      px(24, 6, 2, 3, '#FFF5C0');
      break;
    case 'laurel':
      px(5, 1, 22, 7, OL);
      px(6, 2, 4, 5, '#5A8030');
      px(10, 2, 12, 3, '#3A6020');
      px(22, 2, 4, 5, '#5A8030');
      px(11, 2, 2, 2, '#78B848');
      px(19, 2, 2, 2, '#78B848');
      break;
    case 'flute':
      px(7, 52, 18, 8, OL);
      px(8, 53, 16, 3, '#C8A878');
      px(10, 55, 2, 2, '#907040');
      px(14, 55, 2, 2, '#907040');
      px(18, 55, 2, 2, '#907040');
      break;
    case 'lantern':
      px(27, 46, 5, 5, OL);
      px(25, 49, 8, 12, OL);
      px(28, 47, 4, 3, '#8E7CC3');
      px(26, 50, 6, 10, tick % 30 < 22 ? '#C4B5FD' : '#8060C0');
      px(27, 50, 4, 2, '#D0C0FF');   // lantern top bright
      break;
    case 'rainbow_ribbon':
      px(1, 52, 30, 10, OL);
      px(2, 53, 28, 3, '#FF5252');
      px(4, 56, 24, 3, '#FFD740');
      px(6, 59, 20, 2, '#42A5F5');
      break;
    case 'club':
      px(23, 25, 9, 12, OL);
      px(27, 37, 4, 22, OL);
      px(24, 26, 8, 10, '#A88963');
      px(24, 25, 8, 3, '#C0A078');   // top cap
      px(28, 38, 2, 20, '#8D6E63');
      px(29, 40, 1, 14, '#B09070');  // handle shine
      break;
    case 'crescent':
      px(27, 18, 5, 16, OL);
      px(28, 19, 3, 14, '#E8EAF6');
      px(26, 21, 2, 8, '#9FA8DA');
      px(29, 19, 2, 6, '#FFFFFF');   // crescent highlight
      break;
    case 'bow':
      px(-1, 22, 5, 36, OL);
      px(0, 23, 2, 2, '#A5C38A');
      px(0, 56, 2, 2, '#A5C38A');
      px(0, 25, 2, 30, '#7A9A60');
      px(2, 23, 2, 34, '#D8D8B8');
      break;
    case 'wing':
      px(-1, 36, 8, 20, OL);
      px(25, 36, 8, 20, OL);
      px(0, 40, 6, 14, '#E8EEF7');
      px(26, 40, 6, 14, '#E8EEF7');
      px(0, 36, 6, 8, '#D0D8F8');
      px(26, 36, 6, 8, '#D0D8F8');
      // Wing feather detail
      px(1, 42, 2, 8, '#C0C8F0');
      px(27, 42, 2, 8, '#C0C8F0');
      break;
    default: break;
  }

  // 2× integer upscale — cached canvas is 64×128
  const upscaled = document.createElement('canvas');
  upscaled.width  = HD_SPRITE_W * 2;   // 64
  upscaled.height = HD_SPRITE_H * 2;   // 128
  const uc = upscaled.getContext('2d')!;
  uc.imageSmoothingEnabled = false;
  uc.drawImage(canvas, 0, 0, upscaled.width, upscaled.height);

  if (HD_SPRITE_CACHE.size > 512) HD_SPRITE_CACHE.clear();
  HD_SPRITE_CACHE.set(key, upscaled);
  return upscaled;
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
  if (tick === 0) return;  // card preview mode — no room above head, skip symbol

  // Emoji map — system emoji renders at macOS quality on canvas
  const EMOJI_MAP: Record<string, string> = {
    bolt:          '⚡',
    trident:       '🔱',
    shield:        '🛡️',
    sword:         '⚔️',
    sun:           '☀️',
    moon:          '🌙',
    wing:          '🕊️',
    hammer:        '🔨',
    grape:         '🍇',
    wheat:         '🌾',
    heart:         '❤️',
    peacock:       '🦚',
    skull:         '💀',
    flower:        '🌸',
    flame:         '🔥',
    halo:          '✨',
    trophy:        '🏆',
    horn:          '📯',
    star:          '⭐',
    rainbow:       '🌈',
    lion:          '🦁',
    crescent:      '🌛',
    obsidian_staff:'🪄',
  };

  const emoji = EMOJI_MAP[glyph] ?? '✨';
  const size = 24;
  const bob = Math.sin(tick * 0.07) * 2;
  const ey = Math.round(headTopY - size - 8 + bob);

  ctx.save();
  ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // Pulsing glow halo (drawn as colored circle behind emoji)
  const glowPulse = 0.25 + Math.sin(tick * 0.05) * 0.08;
  ctx.globalAlpha = glowPulse;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, ey + size / 2, size * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Draw emoji at full quality
  ctx.shadowColor = glow;
  ctx.shadowBlur = 8;
  ctx.fillText(emoji, cx, ey);

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
      // hd is already 2× upscaled (64×128) — draw at 70% for sharp display
      const hdDw = Math.round(hd.width  * 0.7);   // 64×0.7 = 45
      const hdDh = Math.round(hd.height * 0.7);   // 128×0.7 = 90
      const hdDrawX = Math.round(x - hdDw / 2);
      const hdDrawY = Math.round(footY - hdDh - 2);

      ctx.save();
      ctx.imageSmoothingEnabled = false;
      if (flip) {
        ctx.translate(x * 2, 0);
        ctx.scale(-1, 1);
      }
      // Black pixel-art outline
      const sil = getSilhouette(hd);
      ctx.drawImage(sil, hdDrawX - 1, hdDrawY - 1, hdDw, hdDh);
      ctx.drawImage(sil, hdDrawX + 1, hdDrawY - 1, hdDw, hdDh);
      ctx.drawImage(sil, hdDrawX - 1, hdDrawY + 1, hdDw, hdDh);
      ctx.drawImage(sil, hdDrawX + 1, hdDrawY + 1, hdDw, hdDh);
      ctx.drawImage(hd, hdDrawX, hdDrawY, hdDw, hdDh);
      ctx.restore();

      // Draw divine sigil above head (unflipped coord space restored)
      drawDivineSymbol(ctx, x, hdDrawY, profile.sigil.glyph, profile.sigil.primary, profile.sigil.ring, profile.sigil.glow, tick);

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
