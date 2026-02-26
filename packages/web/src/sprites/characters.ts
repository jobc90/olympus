// ============================================================================
// Character Sprites — v2 diverse sprite system + divine portraits
// ============================================================================

import type { Direction, WorkerAvatar } from '../engine/canvas';
import { getPortrait, preloadPortraits } from './portrait-loader';
import { getSpriteSheet, preloadSpriteSheets } from './sprite-sheet-loader';

type WorkerLikeAvatar = WorkerAvatar | 'zeus' | 'hestia' | 'eros' | 'gaia' | 'nyx';

// ---------------------------------------------------------------------------
// Pixel Ellipse helpers — used by drawStatusAura
// ---------------------------------------------------------------------------

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

// ============================================================================
// Divine Portrait System — ref_v19
// Full-canvas face portrait for worker cards (98×98). Canvas2D shapes only.
// ============================================================================

interface DivinePortraitDef {
  bg1: string;       // radial gradient inner
  bg2: string;       // radial gradient outer
  glow: string;      // rim glow (8-digit hex)
  border: string;    // border/badge accent (6-digit hex)
  skin: string;      // skin tone (6-digit hex)
  hair: string;      // primary hair color (6-digit hex)
  hair2: string;     // highlight hair color (6-digit hex)
  style: 'spikes' | 'wavy' | 'curly' | 'flowing' | 'short' | 'bun' | 'pony' | 'hood' | 'sunrays' | 'wild' | 'helmet';
  crown?: 'gold' | 'laurel' | 'horns' | 'crescent' | 'plume' | 'flowers' | 'triple' | 'wing';
  beard?: 'full' | 'goatee' | 'stubble';
  horns?: boolean;
  iris: string;      // eye iris color (6-digit hex)
  outfit: string;    // collar/shoulder color (6-digit hex)
  emblem: string;    // emoji badge
  blush?: boolean;
}

const DP: Record<WorkerLikeAvatar, DivinePortraitDef> = {
  zeus:       { bg1:'#2C1A80', bg2:'#04020E', glow:'#FFD700BB', border:'#FFD700', skin:'#E8C89A', hair:'#F0E8D0', hair2:'#FFFFFF', style:'spikes',  crown:'gold',     beard:'full',    iris:'#5566FF', outfit:'#6040AA', emblem:'⚡' },
  hera:       { bg1:'#4A1070', bg2:'#08020E', glow:'#CE93D8BB', border:'#CE93D8', skin:'#F0CCA0', hair:'#6B2444', hair2:'#A03060', style:'flowing',  crown:'gold',                      iris:'#AA00CC', outfit:'#7B1FA2', emblem:'🦚', blush:true },
  poseidon:   { bg1:'#062070', bg2:'#010508', glow:'#22BBEEBB', border:'#22BBEE', skin:'#D8C4A8', hair:'#1A70A0', hair2:'#50C0E8', style:'wavy',     crown:'gold',     beard:'full',    iris:'#00AACC', outfit:'#1560B8', emblem:'🔱' },
  ares:       { bg1:'#6A0606', bg2:'#0E0000', glow:'#FF4444BB', border:'#FF4444', skin:'#C88870', hair:'#CC1818', hair2:'#FF3030', style:'spikes',   crown:'horns',    beard:'goatee',  iris:'#FF2020', outfit:'#8B0000', emblem:'⚔️' },
  apollo:     { bg1:'#905000', bg2:'#160A00', glow:'#FFD040BB', border:'#FFD740', skin:'#F5D8A0', hair:'#FFD040', hair2:'#FFEE88', style:'curly',    crown:'laurel',                    iris:'#FF8800', outfit:'#B06000', emblem:'☀️', blush:true },
  artemis:    { bg1:'#0A1840', bg2:'#000208', glow:'#90BBEEBB', border:'#90BBDD', skin:'#E8D8C4', hair:'#DCE8F8', hair2:'#C0D4E8', style:'bun',      crown:'crescent',                  iris:'#5090C8', outfit:'#1A3A60', emblem:'🌙' },
  athena:     { bg1:'#1A2848', bg2:'#020408', glow:'#6090C0BB', border:'#6090C0', skin:'#E0C8A0', hair:'#2A3868', hair2:'#4060A0', style:'helmet',   crown:'plume',                     iris:'#4070AA', outfit:'#2A4080', emblem:'🦉' },
  hermes:     { bg1:'#1A3858', bg2:'#020608', glow:'#80B8EEBB', border:'#80B0E0', skin:'#EED4A8', hair:'#2C3430', hair2:'#567060', style:'short',    crown:'wing',                      iris:'#3090CC', outfit:'#2060A0', emblem:'🪄' },
  hephaestus: { bg1:'#2A1008', bg2:'#040100', glow:'#FF5020BB', border:'#D04820', skin:'#B09070', hair:'#882010', hair2:'#CC4820', style:'wild',                       beard:'stubble', iris:'#C03818', outfit:'#3A1E0A', emblem:'🔨' },
  dionysus:   { bg1:'#26084A', bg2:'#040008', glow:'#9040D0BB', border:'#9040CC', skin:'#ECD0A8', hair:'#380E5C', hair2:'#6030A0', style:'curly',    crown:'laurel',                    iris:'#8020C0', outfit:'#580E80', emblem:'🍇', blush:true },
  demeter:    { bg1:'#3A2808', bg2:'#060400', glow:'#C89030BB', border:'#C89030', skin:'#F0D498', hair:'#D0A028', hair2:'#E8C058', style:'flowing',  crown:'laurel',                    iris:'#886018', outfit:'#785018', emblem:'🌾', blush:true },
  aphrodite:  { bg1:'#480E22', bg2:'#080004', glow:'#FF70A0BB', border:'#FF7090', skin:'#FAE8D4', hair:'#E8A8B8', hair2:'#FFD8E8', style:'flowing',                                    iris:'#FF3070', outfit:'#CC2858', emblem:'💕', blush:true },
  hades:      { bg1:'#080410', bg2:'#000000', glow:'#7030A8BB', border:'#6030A0', skin:'#A88888', hair:'#0A0A12', hair2:'#18101E', style:'hood',     crown:'horns',    beard:'goatee',  iris:'#A050E8', outfit:'#180828', emblem:'💀' },
  persephone: { bg1:'#081812', bg2:'#000100', glow:'#40C080BB', border:'#30B080', skin:'#D8C0B0', hair:'#1C0E28', hair2:'#4C1840', style:'flowing',  crown:'flowers',                   iris:'#20A880', outfit:'#0A3020', emblem:'🌺', blush:true },
  prometheus: { bg1:'#400C06', bg2:'#060100', glow:'#FF6020BB', border:'#E04818', skin:'#C89878', hair:'#C84020', hair2:'#FF6030', style:'wavy',                       beard:'goatee',  iris:'#E04010', outfit:'#5A1E08', emblem:'🔥' },
  helios:     { bg1:'#7A2800', bg2:'#140500', glow:'#FFD020BB', border:'#FFB020', skin:'#F8D888', hair:'#FF8800', hair2:'#FFDD30', style:'sunrays',                                    iris:'#FF7800', outfit:'#CC5010', emblem:'✨', blush:true },
  nike:       { bg1:'#102444', bg2:'#020308', glow:'#70D8F8BB', border:'#60C8E8', skin:'#EED4A8', hair:'#D0A030', hair2:'#EEC050', style:'pony',     crown:'laurel',                    iris:'#2090C8', outfit:'#1A5080', emblem:'🏆', blush:true },
  pan:        { bg1:'#101A06', bg2:'#020200', glow:'#78B020BB', border:'#70A820', skin:'#B88A58', hair:'#482208', hair2:'#784018', style:'wild',     horns:true,       beard:'goatee',  iris:'#5C6808', outfit:'#281408', emblem:'🎵' },
  hecate:     { bg1:'#050308', bg2:'#000000', glow:'#8050C8BB', border:'#7848B8', skin:'#C0A4C0', hair:'#D0C8E8', hair2:'#9068C0', style:'flowing',  crown:'triple',                    iris:'#C070FF', outfit:'#280E48', emblem:'🔮' },
  iris:       { bg1:'#180E3C', bg2:'#020106', glow:'#FF80CCBB', border:'#80C0FF', skin:'#EED8DC', hair:'#8070FF', hair2:'#FFC0FF', style:'flowing',                                    iris:'#FF80C0', outfit:'#4038B8', emblem:'🌈', blush:true },
  heracles:   { bg1:'#1C1606', bg2:'#020200', glow:'#C4A850BB', border:'#B89038', skin:'#D0A068', hair:'#482808', hair2:'#784018', style:'short',    crown:'laurel',   beard:'stubble', iris:'#7A3C1E', outfit:'#583618', emblem:'💪' },
  selene:     { bg1:'#030610', bg2:'#000001', glow:'#B0D0F8BB', border:'#A0C8F0', skin:'#E8E4F4', hair:'#C4D4F0', hair2:'#FFFFFF', style:'flowing',  crown:'crescent',                  iris:'#80A8D8', outfit:'#182040', emblem:'🌕', blush:true },
  hestia:     { bg1:'#4A1800', bg2:'#0A0200', glow:'#FF8C42BB', border:'#FF6B35', skin:'#F0D4B4', hair:'#C86030', hair2:'#E88848', style:'bun',                                       iris:'#C84020', outfit:'#FF6B35', emblem:'🔥', blush:true },
  eros:       { bg1:'#3A0828', bg2:'#080004', glow:'#FF69B4BB', border:'#FF1493', skin:'#F7E2CE', hair:'#FFB6C1', hair2:'#FFF0F5', style:'curly',                                      iris:'#FF1493', outfit:'#FF69B4', emblem:'💘', blush:true },
  gaia:       { bg1:'#1A2A10', bg2:'#020400', glow:'#6B8E23BB', border:'#4A7C59', skin:'#E8CEB0', hair:'#5A3828', hair2:'#7A5838', style:'flowing',  crown:'flowers',                   iris:'#4A7C59', outfit:'#3A5A30', emblem:'🌍' },
  nyx:        { bg1:'#0A0318', bg2:'#000000', glow:'#7B1FA2BB', border:'#9C27B0', skin:'#E0D8E8', hair:'#1A0533', hair2:'#2D0A4E', style:'flowing', crown:'crescent',                  iris:'#9C27B0', outfit:'#1A0533', emblem:'🌑' },
};

function _dpShade(hex: string, amt: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xFF) + amt));
  const b = Math.min(255, Math.max(0, (n & 0xFF) + amt));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function _dpHair(ctx: CanvasRenderingContext2D, size: number, d: DivinePortraitDef, cx: number): void {
  const fTop = size * 0.285;
  const hairTop = size * 0.04;
  const hairG = ctx.createLinearGradient(cx, hairTop, cx, fTop + size * 0.06);
  hairG.addColorStop(0, d.hair2);
  hairG.addColorStop(0.5, d.hair);
  hairG.addColorStop(1, _dpShade(d.hair, -20));
  ctx.fillStyle = hairG;

  switch (d.style) {
    case 'spikes': {
      const sBase = fTop + size * 0.01;
      const hw = size * 0.07;
      const spikeXY: Array<[number, number]> = [
        [cx - size * 0.20, hairTop + size * 0.02],
        [cx - size * 0.10, hairTop + size * 0.07],
        [cx,               hairTop],
        [cx + size * 0.10, hairTop + size * 0.07],
        [cx + size * 0.20, hairTop + size * 0.02],
      ];
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.22, sBase);
      for (const [px, py] of spikeXY) {
        ctx.lineTo(px - hw / 2, sBase - size * 0.01);
        ctx.lineTo(px, py);
        ctx.lineTo(px + hw / 2, sBase - size * 0.01);
      }
      ctx.lineTo(cx + size * 0.22, sBase);
      ctx.arc(cx, sBase + size * 0.01, size * 0.22, 0, Math.PI, true);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'wavy': {
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.24, fTop + size * 0.04);
      ctx.bezierCurveTo(cx - size * 0.28, fTop - size * 0.05, cx - size * 0.26, hairTop + size * 0.08, cx - size * 0.18, hairTop + size * 0.04);
      ctx.bezierCurveTo(cx - size * 0.10, hairTop, cx + size * 0.10, hairTop, cx + size * 0.18, hairTop + size * 0.04);
      ctx.bezierCurveTo(cx + size * 0.26, hairTop + size * 0.08, cx + size * 0.28, fTop - size * 0.05, cx + size * 0.24, fTop + size * 0.04);
      ctx.arc(cx, fTop + size * 0.06, size * 0.24, 0, Math.PI, true);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = d.hair2 + '60';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.10, fTop - size * 0.02);
      ctx.bezierCurveTo(cx - size * 0.12, hairTop + size * 0.05, cx - size * 0.04, hairTop + size * 0.02, cx, hairTop + size * 0.04);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + size * 0.06, fTop - size * 0.02);
      ctx.bezierCurveTo(cx + size * 0.10, hairTop + size * 0.05, cx + size * 0.16, hairTop + size * 0.04, cx + size * 0.20, hairTop + size * 0.08);
      ctx.stroke();
      break;
    }
    case 'curly': {
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.23, fTop + size * 0.04);
      ctx.bezierCurveTo(cx - size * 0.30, fTop, cx - size * 0.32, hairTop + size * 0.10, cx - size * 0.20, hairTop + size * 0.04);
      const bumps = 4;
      for (let i = 0; i < bumps; i++) {
        const bx2 = cx - size * 0.16 + i * (size * 0.32 / (bumps - 1));
        const by2 = hairTop + size * 0.03 + (i % 2 === 0 ? 0 : size * 0.04);
        const br2 = size * 0.056;
        ctx.bezierCurveTo(bx2 - br2, by2 + br2, bx2 - br2, by2 - br2, bx2, by2 - br2);
        ctx.bezierCurveTo(bx2 + br2, by2 - br2, bx2 + br2, by2 + br2, bx2 + br2 * 0.8, by2 + size * 0.02);
      }
      ctx.bezierCurveTo(cx + size * 0.32, hairTop + size * 0.10, cx + size * 0.30, fTop, cx + size * 0.23, fTop + size * 0.04);
      ctx.arc(cx, fTop + size * 0.06, size * 0.23, 0, Math.PI, true);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'flowing': {
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.24, fTop + size * 0.04);
      ctx.bezierCurveTo(cx - size * 0.28, fTop - size * 0.05, cx - size * 0.24, hairTop + size * 0.06, cx - size * 0.16, hairTop + size * 0.02);
      ctx.bezierCurveTo(cx - size * 0.08, hairTop, cx + size * 0.08, hairTop, cx + size * 0.16, hairTop + size * 0.02);
      ctx.bezierCurveTo(cx + size * 0.24, hairTop + size * 0.06, cx + size * 0.28, fTop - size * 0.05, cx + size * 0.24, fTop + size * 0.04);
      ctx.arc(cx, fTop + size * 0.06, size * 0.24, 0, Math.PI, true);
      ctx.closePath();
      ctx.fill();
      const lockSides: Array<1 | -1> = [-1, 1];
      for (const s of lockSides) {
        ctx.beginPath();
        ctx.moveTo(cx + s * size * 0.22, fTop + size * 0.08);
        ctx.bezierCurveTo(cx + s * size * 0.30, fTop + size * 0.20, cx + s * size * 0.33, fTop + size * 0.38, cx + s * size * 0.28, fTop + size * 0.52);
        ctx.bezierCurveTo(cx + s * size * 0.30, fTop + size * 0.52, cx + s * size * 0.34, fTop + size * 0.38, cx + s * size * 0.30, fTop + size * 0.18);
        ctx.closePath();
        ctx.fillStyle = _dpShade(d.hair, -12);
        ctx.fill();
      }
      ctx.fillStyle = hairG;
      break;
    }
    case 'short': {
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.23, fTop + size * 0.04);
      ctx.bezierCurveTo(cx - size * 0.24, fTop - size * 0.02, cx - size * 0.22, hairTop + size * 0.07, cx - size * 0.12, hairTop + size * 0.04);
      ctx.bezierCurveTo(cx - size * 0.06, hairTop + size * 0.02, cx + size * 0.06, hairTop + size * 0.02, cx + size * 0.12, hairTop + size * 0.04);
      ctx.bezierCurveTo(cx + size * 0.22, hairTop + size * 0.07, cx + size * 0.24, fTop - size * 0.02, cx + size * 0.23, fTop + size * 0.04);
      ctx.arc(cx, fTop + size * 0.055, size * 0.23, 0, Math.PI, true);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'bun': {
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.22, fTop + size * 0.04);
      ctx.bezierCurveTo(cx - size * 0.24, fTop - size * 0.01, cx - size * 0.20, hairTop + size * 0.12, cx - size * 0.10, hairTop + size * 0.07);
      ctx.bezierCurveTo(cx - size * 0.05, hairTop + size * 0.04, cx + size * 0.05, hairTop + size * 0.04, cx + size * 0.10, hairTop + size * 0.07);
      ctx.bezierCurveTo(cx + size * 0.20, hairTop + size * 0.12, cx + size * 0.24, fTop - size * 0.01, cx + size * 0.22, fTop + size * 0.04);
      ctx.arc(cx, fTop + size * 0.055, size * 0.22, 0, Math.PI, true);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, hairTop + size * 0.10, size * 0.09, 0, Math.PI * 2);
      ctx.fillStyle = d.hair;
      ctx.fill();
      ctx.strokeStyle = _dpShade(d.hair, -20);
      ctx.lineWidth = 0.7;
      ctx.stroke();
      break;
    }
    case 'pony': {
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.22, fTop + size * 0.04);
      ctx.bezierCurveTo(cx - size * 0.24, fTop - size * 0.02, cx - size * 0.20, hairTop + size * 0.07, cx - size * 0.08, hairTop + size * 0.03);
      ctx.bezierCurveTo(cx, hairTop + size * 0.02, cx + size * 0.10, hairTop + size * 0.03, cx + size * 0.18, hairTop + size * 0.06);
      ctx.bezierCurveTo(cx + size * 0.26, hairTop + size * 0.10, cx + size * 0.24, fTop - size * 0.02, cx + size * 0.22, fTop + size * 0.04);
      ctx.arc(cx, fTop + size * 0.055, size * 0.22, 0, Math.PI, true);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + size * 0.14, hairTop + size * 0.05);
      ctx.bezierCurveTo(cx + size * 0.28, hairTop + size * 0.10, cx + size * 0.36, fTop + size * 0.10, cx + size * 0.32, fTop + size * 0.36);
      ctx.bezierCurveTo(cx + size * 0.30, fTop + size * 0.45, cx + size * 0.22, fTop + size * 0.38, cx + size * 0.20, fTop + size * 0.20);
      ctx.bezierCurveTo(cx + size * 0.26, fTop + size * 0.14, cx + size * 0.28, hairTop + size * 0.18, cx + size * 0.20, hairTop + size * 0.10);
      ctx.closePath();
      ctx.fillStyle = _dpShade(d.hair, -8);
      ctx.fill();
      ctx.fillStyle = hairG;
      break;
    }
    case 'hood': {
      const fcy2 = size * 0.505, frx2 = size * 0.215 + size * 0.025, fry2 = size * 0.228 + size * 0.025;
      const hoodG = ctx.createLinearGradient(0, 0, 0, size * 0.85);
      hoodG.addColorStop(0, d.hair);
      hoodG.addColorStop(0.7, d.hair);
      hoodG.addColorStop(1, _dpShade(d.hair, -15));
      ctx.fillStyle = hoodG;
      ctx.beginPath();
      ctx.rect(0, 0, size, size);
      ctx.ellipse(cx, fcy2, frx2, fry2, 0, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
      break;
    }
    case 'sunrays': {
      const rayO = fTop + size * 0.01;
      const innerR = size * 0.24, outerR = size * 0.47;
      const rayCount = 12;
      for (let i = 0; i < rayCount; i++) {
        const a = (i / rayCount) * Math.PI * 2 - Math.PI / 2;
        const dA = Math.PI / rayCount * 0.45;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a - dA) * innerR, rayO + Math.sin(a - dA) * innerR * 0.65);
        ctx.lineTo(cx + Math.cos(a) * outerR, rayO + Math.sin(a) * outerR * 0.65);
        ctx.lineTo(cx + Math.cos(a + dA) * innerR, rayO + Math.sin(a + dA) * innerR * 0.65);
        ctx.closePath();
        ctx.fillStyle = i % 2 === 0 ? d.hair : d.hair2;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(cx, rayO, innerR * 1.05, 0, Math.PI * 2);
      ctx.fillStyle = hairG;
      ctx.fill();
      break;
    }
    case 'wild': {
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.22, fTop + size * 0.04);
      ctx.bezierCurveTo(cx - size * 0.32, fTop - size * 0.01, cx - size * 0.34, hairTop + size * 0.07, cx - size * 0.22, hairTop + size * 0.03);
      ctx.bezierCurveTo(cx - size * 0.14, hairTop, cx - size * 0.06, hairTop - size * 0.03, cx, hairTop + size * 0.01);
      ctx.bezierCurveTo(cx + size * 0.06, hairTop - size * 0.03, cx + size * 0.14, hairTop, cx + size * 0.22, hairTop + size * 0.03);
      ctx.bezierCurveTo(cx + size * 0.34, hairTop + size * 0.07, cx + size * 0.32, fTop - size * 0.01, cx + size * 0.22, fTop + size * 0.04);
      ctx.arc(cx, fTop + size * 0.055, size * 0.22, 0, Math.PI, true);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = d.hair2 + '70';
      ctx.lineWidth = 1.3;
      const streaks: Array<[number, number, number, number]> = [
        [cx - size * 0.14, fTop,           cx - size * 0.22, hairTop + size * 0.04],
        [cx - size * 0.03, fTop - size * 0.03, cx - size * 0.07, hairTop + size * 0.01],
        [cx + size * 0.10, fTop - size * 0.01, cx + size * 0.18, hairTop + size * 0.03],
      ];
      for (const [x1, y1, x2, y2] of streaks) {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      if (d.horns) {
        ctx.fillStyle = _dpShade(d.hair, -25);
        const hornSides: Array<1 | -1> = [-1, 1];
        for (const s of hornSides) {
          ctx.beginPath();
          ctx.moveTo(cx + s * size * 0.10, hairTop + size * 0.06);
          ctx.bezierCurveTo(cx + s * size * 0.18, hairTop - size * 0.12, cx + s * size * 0.10, hairTop - size * 0.18, cx + s * size * 0.05, hairTop - size * 0.05);
          ctx.bezierCurveTo(cx + s * size * 0.03, hairTop + size * 0.02, cx + s * size * 0.07, hairTop + size * 0.06, cx + s * size * 0.10, hairTop + size * 0.06);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = hairG;
      }
      break;
    }
    case 'helmet': {
      const hBase = fTop + size * 0.02;
      const helmG = ctx.createLinearGradient(cx - size * 0.24, hairTop, cx + size * 0.24, hBase);
      helmG.addColorStop(0, '#A0B8D8');
      helmG.addColorStop(0.35, '#D0E0F8');
      helmG.addColorStop(1, '#5870A0');
      ctx.fillStyle = helmG;
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.24, hBase);
      ctx.bezierCurveTo(cx - size * 0.28, hBase - size * 0.04, cx - size * 0.26, hairTop + size * 0.06, cx - size * 0.16, hairTop + size * 0.02);
      ctx.lineTo(cx - size * 0.12, hairTop);
      ctx.lineTo(cx + size * 0.12, hairTop);
      ctx.lineTo(cx + size * 0.16, hairTop + size * 0.02);
      ctx.bezierCurveTo(cx + size * 0.26, hairTop + size * 0.06, cx + size * 0.28, hBase - size * 0.04, cx + size * 0.24, hBase);
      ctx.arc(cx, hBase + size * 0.01, size * 0.24, 0, Math.PI, true);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#607090';
      ctx.fillRect(cx - size * 0.27, hBase - size * 0.01, size * 0.54, size * 0.025);
      break;
    }
  }
}

// Draws a human-shaped face path: wide at cheekbones, tapers to chin point
function _dpTraceFace(ctx: CanvasRenderingContext2D, cx: number, fcy: number, fw: number, fh: number): void {
  const top    = fcy - fh;
  const bot    = fcy + fh;
  const yCheek = fcy - fh * 0.05;  // cheekbone level (widest, near center)
  const yJaw   = fcy + fh * 0.55;  // jaw corner
  ctx.beginPath();
  ctx.moveTo(cx, top);
  // Right: forehead → cheekbone → jaw → chin
  ctx.bezierCurveTo(cx + fw * 0.72, top,          cx + fw, fcy - fh * 0.42, cx + fw, yCheek);
  ctx.bezierCurveTo(cx + fw,        fcy + fh * 0.26, cx + fw * 0.62, yJaw,  cx,      bot);
  // Left: chin → jaw → cheekbone → forehead (mirror)
  ctx.bezierCurveTo(cx - fw * 0.62, yJaw,          cx - fw, fcy + fh * 0.26, cx - fw, yCheek);
  ctx.bezierCurveTo(cx - fw,        fcy - fh * 0.42, cx - fw * 0.72, top,   cx,      top);
  ctx.closePath();
}

function _dpBeard(ctx: CanvasRenderingContext2D, size: number, d: DivinePortraitDef, cx: number, fBot: number): void {
  switch (d.beard) {
    case 'full': {
      const bG = ctx.createLinearGradient(cx, fBot, cx, fBot + size * 0.20);
      bG.addColorStop(0, d.hair);
      bG.addColorStop(1, _dpShade(d.hair, -12));
      ctx.fillStyle = bG;
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.18, fBot - size * 0.03);
      ctx.bezierCurveTo(cx - size * 0.22, fBot + size * 0.06, cx - size * 0.19, fBot + size * 0.19, cx - size * 0.06, fBot + size * 0.13);
      ctx.lineTo(cx, fBot + size * 0.15);
      ctx.lineTo(cx + size * 0.06, fBot + size * 0.13);
      ctx.bezierCurveTo(cx + size * 0.19, fBot + size * 0.19, cx + size * 0.22, fBot + size * 0.06, cx + size * 0.18, fBot - size * 0.03);
      ctx.arc(cx, fBot - size * 0.02, size * 0.18, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = d.hair2 + '50';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.04, fBot + size * 0.01);
      ctx.bezierCurveTo(cx - size * 0.02, fBot + size * 0.09, cx, fBot + size * 0.13, cx, fBot + size * 0.15);
      ctx.stroke();
      break;
    }
    case 'goatee': {
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.10, fBot - size * 0.02);
      ctx.bezierCurveTo(cx - size * 0.12, fBot + size * 0.04, cx - size * 0.08, fBot + size * 0.10, cx, fBot + size * 0.115);
      ctx.bezierCurveTo(cx + size * 0.08, fBot + size * 0.10, cx + size * 0.12, fBot + size * 0.04, cx + size * 0.10, fBot - size * 0.02);
      ctx.arc(cx, fBot - size * 0.015, size * 0.10, 0, Math.PI);
      ctx.closePath();
      ctx.fillStyle = d.hair + 'D0';
      ctx.fill();
      break;
    }
    case 'stubble': {
      ctx.fillStyle = _dpShade(d.skin, -22) + '88';
      for (let i = -3; i <= 3; i++) {
        for (let j = 0; j <= 2; j++) {
          ctx.beginPath();
          ctx.arc(cx + i * size * 0.04, fBot - size * 0.07 + j * size * 0.03, 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
  }
}

function _dpEyes(ctx: CanvasRenderingContext2D, size: number, d: DivinePortraitDef, cx: number, fcy: number, frx: number, fry: number): void {
  const eyeY   = fcy - fry * 0.10;
  const eyeGap = frx * 0.46;
  const eyeW   = frx * 0.30;
  const eyeH   = fry * 0.185;
  const browY  = eyeY - eyeH * 2.5;
  const eyeSides: Array<1 | -1> = [-1, 1];

  // Eyebrows — arched, hair-colored
  const browCol = _dpShade(d.hair, -15);
  for (const s of eyeSides) {
    const bx = cx + s * eyeGap;
    ctx.beginPath();
    // inner (toward nose) → peak → outer
    ctx.moveTo(bx - s * eyeW * 0.85, browY + eyeH * 0.55);
    ctx.bezierCurveTo(
      bx - s * eyeW * 0.15, browY - eyeH * 0.45,
      bx + s * eyeW * 0.28, browY - eyeH * 0.15,
      bx + s * eyeW * 0.85, browY + eyeH * 0.45,
    );
    ctx.strokeStyle = browCol;
    ctx.lineWidth = eyeH * 1.45;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // Eyes
  for (const s of eyeSides) {
    const ex = cx + s * eyeGap;
    // White
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, eyeW, eyeH, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    // Iris
    const iR = eyeH * 0.82;
    const iG = ctx.createRadialGradient(ex - iR * 0.28, eyeY - iR * 0.28, 0, ex, eyeY, iR);
    iG.addColorStop(0, _dpShade(d.iris, 25));
    iG.addColorStop(0.7, d.iris);
    iG.addColorStop(1, _dpShade(d.iris, -30));
    ctx.beginPath();
    ctx.arc(ex, eyeY, iR, 0, Math.PI * 2);
    ctx.fillStyle = iG;
    ctx.fill();
    // Pupil
    ctx.beginPath();
    ctx.arc(ex, eyeY, iR * 0.44, 0, Math.PI * 2);
    ctx.fillStyle = '#060606';
    ctx.fill();
    // Highlight
    ctx.beginPath();
    ctx.arc(ex - iR * 0.28, eyeY - iR * 0.28, iR * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFFCC';
    ctx.fill();
    // Upper lash line
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, eyeW, eyeH, 0, Math.PI, 0);
    ctx.strokeStyle = '#201810CC';
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }

  // Nose — bridge curves + nostrils
  const noseTopY  = fcy + fry * 0.08;
  const noseTipY  = fcy + fry * 0.33;
  const noseW     = frx * 0.13;
  const nostrilW  = frx * 0.082;
  ctx.strokeStyle = _dpShade(d.skin, -22) + '9C';
  ctx.lineWidth = 0.8;
  ctx.lineCap = 'round';
  // Left bridge
  ctx.beginPath();
  ctx.moveTo(cx - frx * 0.03, noseTopY);
  ctx.bezierCurveTo(cx - noseW * 0.7, noseTopY + (noseTipY - noseTopY) * 0.5,
                    cx - noseW, noseTipY - frx * 0.02, cx - noseW, noseTipY);
  ctx.stroke();
  // Right bridge
  ctx.beginPath();
  ctx.moveTo(cx + frx * 0.03, noseTopY);
  ctx.bezierCurveTo(cx + noseW * 0.7, noseTopY + (noseTipY - noseTopY) * 0.5,
                    cx + noseW, noseTipY - frx * 0.02, cx + noseW, noseTipY);
  ctx.stroke();
  // Nostrils
  const nostrilFill = _dpShade(d.skin, -28) + '80';
  const nostrilY = noseTipY + frx * 0.014;
  ctx.beginPath();
  ctx.ellipse(cx - nostrilW * 0.88, nostrilY, nostrilW * 0.62, frx * 0.037, -0.28, 0, Math.PI * 2);
  ctx.fillStyle = nostrilFill; ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + nostrilW * 0.88, nostrilY, nostrilW * 0.62, frx * 0.037, 0.28, 0, Math.PI * 2);
  ctx.fillStyle = nostrilFill; ctx.fill();

  // Lips — upper M-shape + lower rounded
  const mouthY = fcy + fry * 0.57;
  const mouthW = frx * 0.36;
  const lipH   = fry * 0.085;
  const lipCol = _dpShade(d.skin, -20) + 'C0';
  ctx.beginPath();
  ctx.moveTo(cx - mouthW, mouthY);
  // Upper lip (M cupid's bow)
  ctx.bezierCurveTo(cx - mouthW * 0.55, mouthY - lipH, cx - mouthW * 0.08, mouthY - lipH, cx, mouthY - lipH * 0.4);
  ctx.bezierCurveTo(cx + mouthW * 0.08, mouthY - lipH, cx + mouthW * 0.55, mouthY - lipH, cx + mouthW, mouthY);
  // Lower lip (full rounded)
  ctx.bezierCurveTo(cx + mouthW * 0.50, mouthY + lipH * 1.5, cx - mouthW * 0.50, mouthY + lipH * 1.5, cx - mouthW, mouthY);
  ctx.closePath();
  ctx.fillStyle = lipCol; ctx.fill();
  ctx.strokeStyle = _dpShade(d.skin, -35) + '70';
  ctx.lineWidth = 0.5; ctx.stroke();
}

function _dpCrown(ctx: CanvasRenderingContext2D, size: number, d: DivinePortraitDef, cx: number, fcy: number, fry: number): void {
  const cy = fcy - fry - size * 0.005;
  switch (d.crown) {
    case 'gold': {
      const cw = size * 0.38, ch = size * 0.11, cb = cy - ch * 0.3;
      const gG = ctx.createLinearGradient(cx, cb - ch, cx, cb);
      gG.addColorStop(0, '#FFEE88'); gG.addColorStop(0.45, '#FFD700'); gG.addColorStop(1, '#B8860B');
      ctx.fillStyle = gG;
      ctx.beginPath();
      ctx.rect(cx - cw / 2, cb, cw, ch * 0.45);
      const crownPts: Array<[number, number]> = [[cx - cw / 3, ch * 0.72], [cx, ch], [cx + cw / 3, ch * 0.72]];
      for (const [px, ph] of crownPts) {
        ctx.moveTo(px - size * 0.055, cb);
        ctx.lineTo(px, cb - ph);
        ctx.lineTo(px + size * 0.055, cb);
      }
      ctx.fill();
      ctx.strokeStyle = '#8B6914'; ctx.lineWidth = 0.6; ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cb - ch * 0.9, size * 0.020, 0, Math.PI * 2);
      ctx.fillStyle = d.border; ctx.fill();
      break;
    }
    case 'laurel': {
      const lR = size * 0.24, lCy = fcy - fry * 0.90;
      for (let i = 0; i < 10; i++) {
        const a = Math.PI + (i / 10) * Math.PI;
        ctx.save();
        ctx.translate(cx + Math.cos(a) * lR, lCy + Math.sin(a) * lR * 0.38);
        ctx.rotate(a + Math.PI / 2);
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 0.026, size * 0.013, 0, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 === 0 ? '#3A8020' : '#2A6010';
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'horns': {
      ctx.save();
      ctx.strokeStyle = _dpShade(d.hair, -8);
      ctx.lineWidth = size * 0.055;
      ctx.lineCap = 'round';
      const hSides: Array<1 | -1> = [-1, 1];
      for (const s of hSides) {
        ctx.beginPath();
        ctx.moveTo(cx + s * size * 0.11, cy);
        ctx.bezierCurveTo(cx + s * size * 0.22, cy - size * 0.13, cx + s * size * 0.28, cy - size * 0.04, cx + s * size * 0.24, cy + size * 0.07);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'crescent': {
      const mcy = cy - size * 0.04;
      ctx.beginPath();
      ctx.arc(cx, mcy, size * 0.10, 0, Math.PI * 2);
      ctx.fillStyle = '#E4EAF8'; ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + size * 0.055, mcy - size * 0.008, size * 0.078, 0, Math.PI * 2);
      ctx.fillStyle = d.bg1; ctx.fill();
      break;
    }
    case 'plume': {
      const pb = cy - size * 0.05;
      const pG = ctx.createLinearGradient(cx, pb - size * 0.30, cx, pb);
      pG.addColorStop(0, '#DD2222'); pG.addColorStop(0.55, '#FF3838'); pG.addColorStop(1, '#AA1616');
      ctx.fillStyle = pG;
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.04, pb);
      ctx.bezierCurveTo(cx - size * 0.10, pb - size * 0.14, cx - size * 0.06, pb - size * 0.24, cx, pb - size * 0.30);
      ctx.bezierCurveTo(cx + size * 0.06, pb - size * 0.24, cx + size * 0.10, pb - size * 0.14, cx + size * 0.04, pb);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'flowers': {
      const fCols = ['#FF6080', '#FF9040', '#CC40CC', '#FF6060', '#80CC40'];
      const fxs = [cx - size * 0.20, cx - size * 0.10, cx, cx + size * 0.10, cx + size * 0.20];
      fxs.forEach((fx, i) => {
        const fy = cy - size * 0.01;
        for (let p = 0; p < 5; p++) {
          const pa = (p / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.ellipse(fx + Math.cos(pa) * size * 0.024, fy + Math.sin(pa) * size * 0.024, size * 0.020, size * 0.012, pa, 0, Math.PI * 2);
          ctx.fillStyle = fCols[i % fCols.length]; ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(fx, fy, size * 0.014, 0, Math.PI * 2);
        ctx.fillStyle = '#FFEE40'; ctx.fill();
      });
      break;
    }
    case 'triple': {
      const mcy2 = cy - size * 0.02;
      const moons = [{ x: cx - size * 0.16, r: size * 0.07 }, { x: cx, r: size * 0.09 }, { x: cx + size * 0.16, r: size * 0.07 }];
      moons.forEach(({ x, r }, i) => {
        ctx.beginPath(); ctx.arc(x, mcy2, r, 0, Math.PI * 2);
        ctx.fillStyle = '#C0B0E8'; ctx.fill();
        if (i !== 1) {
          ctx.beginPath();
          ctx.arc(x + (i === 0 ? size * 0.04 : -size * 0.04), mcy2, r * 0.80, 0, Math.PI * 2);
          ctx.fillStyle = d.bg1; ctx.fill();
        }
      });
      break;
    }
    case 'wing': {
      const wSides: Array<1 | -1> = [-1, 1];
      for (const s of wSides) {
        ctx.beginPath();
        ctx.moveTo(cx + s * size * 0.09, cy);
        ctx.bezierCurveTo(cx + s * size * 0.20, cy - size * 0.04, cx + s * size * 0.28, cy - size * 0.11, cx + s * size * 0.24, cy + size * 0.04);
        ctx.bezierCurveTo(cx + s * size * 0.20, cy + size * 0.08, cx + s * size * 0.13, cy + size * 0.02, cx + s * size * 0.09, cy);
        ctx.closePath();
        ctx.fillStyle = '#E8E8F8C0'; ctx.fill();
        ctx.strokeStyle = '#C0C8D880'; ctx.lineWidth = 0.6; ctx.stroke();
      }
      break;
    }
  }
}

export function drawDivinePortrait(
  ctx: CanvasRenderingContext2D,
  size: number,
  avatar: WorkerLikeAvatar,
  _tick: number,
): void {
  const d = DP[avatar] ?? DP.hermes;
  const cx = size / 2;

  // Background
  const bgG = ctx.createRadialGradient(cx, size * 0.38, size * 0.04, cx, size * 0.58, size * 0.63);
  bgG.addColorStop(0, d.bg1); bgG.addColorStop(1, d.bg2);
  ctx.fillStyle = bgG; ctx.fillRect(0, 0, size, size);

  // Shoulders / outfit
  const nb = size * 0.84, sw = size * 0.68;
  const oG = ctx.createLinearGradient(cx, nb, cx, size);
  oG.addColorStop(0, d.outfit); oG.addColorStop(1, _dpShade(d.outfit, -22));
  ctx.fillStyle = oG;
  ctx.beginPath();
  ctx.moveTo(cx - sw / 2, size + 2);
  ctx.lineTo(cx - 7, nb);
  ctx.bezierCurveTo(cx - 4, nb - 5, cx + 4, nb - 5, cx + 7, nb);
  ctx.lineTo(cx + sw / 2, size + 2);
  ctx.closePath(); ctx.fill();

  // Neck
  const nW = size * 0.12, fBot = size * 0.73;
  const nkG = ctx.createLinearGradient(cx - nW, 0, cx + nW, 0);
  nkG.addColorStop(0, _dpShade(d.skin, -18));
  nkG.addColorStop(0.4, d.skin);
  nkG.addColorStop(1, _dpShade(d.skin, -24));
  ctx.fillStyle = nkG;
  ctx.beginPath();
  ctx.moveTo(cx - nW * 0.50, fBot - 2);
  ctx.lineTo(cx - nW * 0.72, nb);
  ctx.lineTo(cx + nW * 0.72, nb);
  ctx.lineTo(cx + nW * 0.50, fBot - 2);
  ctx.closePath(); ctx.fill();

  // Hair (rendered behind face)
  _dpHair(ctx, size, d, cx);

  // Beard (rendered behind lower face)
  if (d.beard) _dpBeard(ctx, size, d, cx, fBot);

  // Face — human shape: wide cheekbones, tapered chin
  const fcy = size * 0.505, frx = size * 0.215, fry = size * 0.228;
  ctx.save();
  ctx.shadowColor = '#00000055'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 3;
  _dpTraceFace(ctx, cx, fcy, frx, fry);
  ctx.fillStyle = d.skin; ctx.fill();
  ctx.restore();
  const fG = ctx.createRadialGradient(cx - frx * 0.22, fcy - fry * 0.32, 0, cx + frx * 0.08, fcy + fry * 0.08, frx * 1.12);
  fG.addColorStop(0, _dpShade(d.skin, 20));
  fG.addColorStop(0.55, d.skin);
  fG.addColorStop(1, _dpShade(d.skin, -26));
  _dpTraceFace(ctx, cx, fcy, frx, fry);
  ctx.fillStyle = fG; ctx.fill();
  ctx.strokeStyle = _dpShade(d.skin, -32); ctx.lineWidth = 0.7; ctx.stroke();

  // Eyes, nose, mouth
  _dpEyes(ctx, size, d, cx, fcy, frx, fry);

  // Blush
  if (d.blush) {
    const blushSides: Array<1 | -1> = [-1, 1];
    for (const s of blushSides) {
      ctx.beginPath();
      ctx.ellipse(cx + s * frx * 0.56, fcy + fry * 0.22, frx * 0.21, fry * 0.11, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#FF808038'; ctx.fill();
    }
  }

  // Crown
  if (d.crown) _dpCrown(ctx, size, d, cx, fcy, fry);

  // Glow rim
  const rimG = ctx.createRadialGradient(cx, cx, size * 0.27, cx, cx, size * 0.52);
  rimG.addColorStop(0, 'transparent');
  rimG.addColorStop(0.82, 'transparent');
  rimG.addColorStop(1, d.glow);
  ctx.fillStyle = rimG; ctx.fillRect(0, 0, size, size);

  // Emblem badge (bottom-right)
  const bx = size - 16, by = size - 16;
  ctx.beginPath(); ctx.arc(bx, by, 11, 0, Math.PI * 2);
  ctx.fillStyle = '#000000A8'; ctx.fill();
  ctx.strokeStyle = d.border + 'AA'; ctx.lineWidth = 1; ctx.stroke();
  ctx.font = '13px serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(d.emblem, bx, by + 1);

  // Border
  ctx.strokeStyle = d.border + '80'; ctx.lineWidth = 1.5;
  ctx.strokeRect(0.75, 0.75, size - 1.5, size - 1.5);
}

// ============================================================================
// Diverse Character Sprite System (v2) — TS-array based
// ============================================================================

// 올림푸스 22신 v2 — avatar → charIdx 매핑 (extract-char-sprites.mjs CHAR_FILES 순서와 동일)
// charIdx = indexOf(avatar), 없으면 0 (zeus) fallback
export const DIVERSE_AVATAR_ORDER_V2: WorkerLikeAvatar[] = [
  'zeus',        // idx  0 → Zeus.png        제우스
  'hera',        // idx  1 → Hera.png         헤라
  'poseidon',    // idx  2 → Poseidon.png     포세이돈
  'demeter',     // idx  3 → Demeter.png      데메테르
  'athena',      // idx  4 → Athena.png       아테나
  'apollo',      // idx  5 → Apollo.png       아폴론
  'artemis',     // idx  6 → Artemis.png      아르테미스
  'ares',        // idx  7 → Ares.png         아레스
  'aphrodite',   // idx  8 → Aphrodite.png    아프로디테
  'hephaestus',  // idx  9 → Hephaestus.png  헤파이스토스
  'hermes',      // idx 10 → Hermes.png       헤르메스
  'dionysus',    // idx 11 → Dionysus.png     디오니소스
  'hades',       // idx 12 → Hades.png        하데스
  'persephone',  // idx 13 → Persephone.png   페르세포네
  'hestia',      // idx 14 → Hestia.png       헤스티아
  'eros',        // idx 15 → Eros.png         에로스
  'gaia',        // idx 16 → Gaia.png         가이아
  'nyx',         // idx 17 → Nyx.png          닉스
  'helios',      // idx 18 → Helios.png       헬리오스
  'selene',      // idx 19 → Selene.png       셀레네
  'pan',         // idx 20 → Pan.png          판
  'heracles',    // idx 21 → Heracles.png     헤라클레스
];

// ============================================================================
// Sprite-sheet based map character rendering
// Source: /pixel-olympus-nobg/{Name}-Photoroom.png (1120×960, 7 cols × 3 rows)
// Frame: 160×320 per cell
// Col layout: 0=walkA  1=stand  2=walkB  (walk cycle: [0,1,2,1])
// Row layout: 0=south(front)  1=north(back)  2=east(side, flip for west)
// ============================================================================

const SHEET_FRAME_W = 160;
const SHEET_FRAME_H = 320;

// Map scale: 160×320 → 48×96 (3 tiles tall, 1.5 tiles wide)
const MAP_SHEET_SCALE = 0.3;
const MAP_SHEET_DW = Math.round(SHEET_FRAME_W * MAP_SHEET_SCALE); // 48
const MAP_SHEET_DH = Math.round(SHEET_FRAME_H * MAP_SHEET_SCALE); // 96

const SHEET_WALK_CYCLE = [0, 1, 2, 1] as const; // col indices

// Offscreen canvas cache for sprite-sheet frames (key: "avatar-col-dir[-flip]")
const _sheetFrameCache = new Map<string, HTMLCanvasElement>();

function getCachedSheetFrame(
  img: HTMLImageElement,
  avatar: string,
  col: number,
  dir: number,
  flip: boolean,
): HTMLCanvasElement {
  const key = `${avatar}-${col}-${dir}-${flip ? 1 : 0}`;
  const cached = _sheetFrameCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width  = MAP_SHEET_DW;
  canvas.height = MAP_SHEET_DH;
  const offCtx = canvas.getContext('2d')!;
  offCtx.imageSmoothingEnabled = false;

  const srcX = col * SHEET_FRAME_W;
  const srcY = dir * SHEET_FRAME_H;

  if (flip) {
    offCtx.translate(MAP_SHEET_DW, 0);
    offCtx.scale(-1, 1);
  }
  offCtx.drawImage(
    img,
    srcX, srcY, SHEET_FRAME_W, SHEET_FRAME_H,
    0, 0, MAP_SHEET_DW, MAP_SHEET_DH,
  );

  _sheetFrameCache.set(key, canvas);
  return canvas;
}

export function drawMapWorkerCharacter(
  ctx: CanvasRenderingContext2D,
  footX: number,
  footY: number,
  avatar: WorkerLikeAvatar,
  tick: number,
  moving = true,
  direction: Direction = 's',
): void {
  const sheet = getSpriteSheet(avatar);

  // If sprite sheet not yet loaded, trigger async load and skip frame.
  if (!sheet) {
    void preloadSpriteSheets([avatar]);
    return;
  }

  const walkStep = moving ? Math.floor(tick / 8) % 4 : 1;
  const col = SHEET_WALK_CYCLE[walkStep];

  let dir = 0;
  let flip = false;
  if (direction === 'n')      { dir = 1; }
  else if (direction === 'e') { dir = 2; }
  else if (direction === 'w') { dir = 2; flip = true; }
  // 's' (south/down): dir = 0

  const drawX = Math.round(footX - MAP_SHEET_DW / 2);
  const drawY = Math.round(footY - MAP_SHEET_DH);

  const frame = getCachedSheetFrame(sheet, avatar, col, dir, flip);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(frame, drawX, drawY);
  ctx.restore();
}

// Portrait for card UIs — scale-fit to size×size, centered.
export function drawDiversePortrait(
  ctx: CanvasRenderingContext2D,
  size: number,
  avatar: WorkerLikeAvatar,
  _tick: number,
  _workerMode = false,
): void {
  const img = getPortrait(avatar);
  ctx.imageSmoothingEnabled = false;
  if (img) {
    const scale = Math.min(size / img.width, size / img.height);
    const dw = Math.round(img.width * scale);
    const dh = Math.round(img.height * scale);
    const dx = Math.round((size - dw) / 2);
    const dy = Math.round((size - dh) / 2);
    ctx.drawImage(img, dx, dy, dw, dh);
  } else {
    void preloadPortraits([avatar]);
  }
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
