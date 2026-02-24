// ============================================================================
// Furniture Sprite Drawing — Pixel art isometric furniture (Greek/Olympus Theme)
// ============================================================================

import type { TileType } from '../engine/pathfinding';
import { getTileCenter, TILE_PX } from '../engine/topdown';

// Alias: returns tile center (32×32 tile, center at +16,+16 from top-left)
function gridToScreen(pos: { col: number; row: number }): { x: number; y: number } {
  return getTileCenter(pos);
}

// Replaces drawIsometricBlock — draws a flat top-down surface
function drawFlatSurface(ctx: CanvasRenderingContext2D, x: number, y: number, topColor: string): void {
  ctx.fillStyle = topColor;
  ctx.fillRect(x - 12, y - 4, 24, 8);
}

type FurnitureType = TileType extends string ? (
  | 'desk'
  | 'chair'
  | 'monitor'
  | 'keyboard'
  | 'big_desk'
  | 'floor_window'
  | 'coffee_machine'
  | 'snack_shelf'
  | 'water_cooler'
  | 'small_table'
  | 'round_table'
  | 'long_table'
  | 'whiteboard_obj'
  | 'bookshelf'
  | 'reading_chair'
  | 'sofa'
  | 'coffee_table'
  | 'server_rack'
  | 'potted_plant'
  | 'carpet'
  | 'wall_clock'
  | 'poster'
  | 'meeting_chair'
  | 'door_mat'
  | 'standing_desk'
  | 'dual_monitor'
  | 'arcade_machine'
  | 'vending_machine'
  | 'trophy_shelf'
  | 'aquarium'
  | 'marble_round_table'
  | 'cloud_seat'
  | 'doric_column'
  | 'temple_column'
  | 'marble_column'
  | 'sacred_brazier'
  | 'god_statue'
  | 'altar'
) : never;

const PALETTE = {
  marbleLight: '#F5F1E8',
  marbleMid: '#DCCFC0',
  marbleDark: '#B7A893',
  marbleShadow: '#8C7D68',
  gold: '#D4AF37',
  goldBright: '#F2D675',
  goldDeep: '#A67C00',
} as const;

function px(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function applyTemplePatina(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  tick: number,
): void {
  const { x, y } = gridToScreen({ col, row });
  // Keep patina subtle: tiny specular glints only (avoid rectangle overlays).
  ctx.save();
  ctx.globalAlpha = 0.18;
  px(ctx, x - 5, y - 18, 10, 1, PALETTE.goldBright);
  px(ctx, x - 3, y - 14, 6, 1, '#F9E6A0');
  if (tick % 120 < 64) {
    px(ctx, x - 1, y - 21, 2, 1, '#FFF3C4');
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Individual furniture draw functions — Greek/Olympus Theme
// ---------------------------------------------------------------------------

// desk → Marble Table
function drawDesk(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Marble table top
  drawFlatSurface(ctx, x, y, PALETTE.marbleLight);
  // Oracle Mirror (monitor)
  const monY = y - 26;
  px(ctx, x - 8, monY - 12, 16, 12, PALETTE.gold);
  px(ctx, x - 6, monY - 10, 12, 8, '#DDE8F2');
  // Mystic flicker
  if (tick % 60 < 55) {
    px(ctx, x - 4, monY - 8, 8, 4, PALETTE.goldDeep);
  }
  // Gold stand
  px(ctx, x - 2, monY, 4, 3, PALETTE.gold);
  // Stone tablet (keyboard)
  px(ctx, x - 6, y - 10, 12, 4, PALETTE.marbleDark);
  px(ctx, x - 5, y - 9, 10, 2, PALETTE.marbleShadow);
}

// chair → Small Throne
function drawChair(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Marble seat
  px(ctx, x - 8, y - 6, 16, 4, '#F5F5F5');
  // Marble back
  px(ctx, x - 8, y - 16, 3, 12, '#E0E0E0');
  px(ctx, x + 5, y - 16, 3, 12, '#E0E0E0');
  px(ctx, x - 8, y - 16, 16, 3, '#E0E0E0');
  // Gold trim on back top
  px(ctx, x - 8, y - 17, 16, 1, '#FFD700');
  // Stone legs
  px(ctx, x - 6, y - 2, 2, 4, '#CFD8DC');
  px(ctx, x + 4, y - 2, 2, 4, '#CFD8DC');
  // Stone base
  px(ctx, x - 7, y + 2, 3, 2, '#B0BEC5');
  px(ctx, x + 4, y + 2, 3, 2, '#B0BEC5');
}

// big_desk → Zeus's Grand Throne
function drawBigDesk(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Golden marble surface
  drawFlatSurface(ctx, x, y, '#FFF8E1');
  // Tall gold back panel
  px(ctx, x - 16, y - 34, 32, 16, '#FFD700');
  px(ctx, x - 14, y - 32, 28, 12, '#FFC107');
  // Lightning accent on back
  px(ctx, x - 2, y - 30, 4, 8, '#FFEB3B');
  px(ctx, x - 1, y - 32, 2, 2, '#FFEB3B');
  px(ctx, x, y - 22, 2, 2, '#FFEB3B');
  // Lightning bolt flicker
  if (tick % 80 < 60) {
    px(ctx, x - 1, y - 28, 2, 4, '#FFF9C4');
  }
  // Gold armrests
  px(ctx, x - 16, y - 18, 3, 6, '#DAA520');
  px(ctx, x + 13, y - 18, 3, 6, '#DAA520');
}

// monitor → Oracle Mirror
function drawMonitor(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Gold frame
  px(ctx, x - 10, y - 22, 20, 14, PALETTE.gold);
  // Marble-vision screen
  px(ctx, x - 8, y - 20, 16, 10, tick % 90 < 85 ? '#DDE8F2' : '#EEF4F8');
  // Gold rune lines
  if (tick % 90 < 85) {
    for (let i = 0; i < 4; i++) {
      const w = 4 + Math.floor(Math.random() * 8);
      px(ctx, x - 6, y - 18 + i * 2, w, 1, PALETTE.goldDeep);
    }
  }
  // Gold stand
  px(ctx, x - 2, y - 8, 4, 4, PALETTE.gold);
}

// floor_window → Temple Opening
function drawFloorWindow(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Marble archway frame
  px(ctx, x - 18, y - 40, 36, 36, '#ECEFF1');
  // Sky inside
  const skyColor = tick % 200 < 100 ? '#E1F5FE' : '#B3E5FC';
  px(ctx, x - 16, y - 38, 32, 32, skyColor);
  // Arch top (rounded marble)
  px(ctx, x - 14, y - 38, 28, 4, '#F5F5F5');
  // Cloud ellipse
  ctx.fillStyle = '#FFFFFFC0';
  ctx.beginPath();
  ctx.ellipse(x + (tick % 80) / 4 - 10, y - 28, 8, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // Second cloud
  ctx.fillStyle = '#FFFFFF90';
  ctx.beginPath();
  ctx.ellipse(x - (tick % 60) / 3 + 6, y - 20, 6, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Marble columns on sides
  px(ctx, x - 18, y - 36, 3, 32, '#CFD8DC');
  px(ctx, x + 15, y - 36, 3, 32, '#CFD8DC');
}

// coffee_machine → Ambrosia Fountain
function drawCoffeeMachine(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Gold base pillar
  px(ctx, x - 4, y - 8, 8, 8, '#DAA520');
  // Gold bowl
  px(ctx, x - 8, y - 14, 16, 6, '#FFD700');
  px(ctx, x - 6, y - 12, 12, 2, '#FFC107');
  // Upper tier
  px(ctx, x - 4, y - 22, 8, 8, '#FFD700');
  px(ctx, x - 3, y - 20, 6, 4, '#B3E5FC');
  // Divine water drops
  if (tick % 20 < 14) {
    px(ctx, x - 5, y - 14 - (tick % 6), 2, 2, '#B3E5FC');
    px(ctx, x + 3, y - 12 - (tick % 8), 2, 2, '#B3E5FC');
  }
  // Golden sparkles instead of steam
  if (tick % 30 < 20) {
    ctx.fillStyle = '#FFD70080';
    ctx.fillRect(x - 1, y - 26 - (tick % 10), 2, 2);
    ctx.fillRect(x + 2, y - 28 - (tick % 8), 1, 1);
  }
}

// snack_shelf → Offering Shelf
function drawSnackShelf(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Stone shelf frame
  px(ctx, x - 10, y - 30, 20, 26, '#9E9E9E');
  // Stone shelves
  px(ctx, x - 8, y - 20, 16, 2, '#757575');
  px(ctx, x - 8, y - 12, 16, 2, '#757575');
  // Offering items — fruits
  px(ctx, x - 6, y - 28, 4, 4, '#FF7043'); // Orange fruit
  px(ctx, x, y - 26, 4, 4, '#7CB342');     // Green fruit
  px(ctx, x + 4, y - 28, 3, 4, '#FFD54F'); // Gold offering
  px(ctx, x - 6, y - 18, 5, 4, '#FF7043'); // Orange
  px(ctx, x + 2, y - 18, 4, 4, '#FFD54F'); // Gold item
}

// water_cooler → Sacred Spring
function drawWaterCooler(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Stone body
  px(ctx, x - 6, y - 20, 12, 16, '#757575');
  // Stone bowl on top
  px(ctx, x - 5, y - 24, 10, 4, '#9E9E9E');
  px(ctx, x - 4, y - 22, 8, 2, '#9E9E9E');
  // Clear blue water
  const level = 4 + Math.sin(tick * 0.05) * 1;
  px(ctx, x - 3, y - 20 - level, 6, level, '#4FC3F7');
  // Water surface shimmer
  if (tick % 40 < 30) {
    px(ctx, x - 2, y - 20 - level, 4, 1, '#81D4FA');
  }
  // Stone spout
  px(ctx, x + 4, y - 10, 3, 3, '#9E9E9E');
}

// small_table → Stone Pedestal
function drawSmallTable(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  drawFlatSurface(ctx, x, y, '#ECEFF1');
}

// round_table → Amphora
function drawRoundTable(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Amphora body (terracotta)
  ctx.fillStyle = '#FFCC80';
  ctx.beginPath();
  ctx.ellipse(x, y - 10, 7, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Gold rim
  ctx.strokeStyle = '#DAA520';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Narrow neck
  px(ctx, x - 3, y - 18, 6, 5, '#FFCC80');
  // Lip/rim
  px(ctx, x - 4, y - 19, 8, 2, '#DAA520');
  // Dark terracotta stripe pattern
  px(ctx, x - 5, y - 9, 10, 1, '#8D6E63');
  // Base
  px(ctx, x - 3, y - 5, 6, 2, '#FFCC80');
}

// long_table → Stone Bench/Table
function drawLongTable(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  drawFlatSurface(ctx, x, y, '#ECEFF1');
  // Stone supports visible
  px(ctx, x - 8, y - 4, 3, 4, '#CFD8DC');
  px(ctx, x + 5, y - 4, 3, 4, '#CFD8DC');
}

// whiteboard_obj → Stone Tablet
function drawWhiteboard(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Stone frame
  px(ctx, x - 18, y - 36, 36, 28, '#757575');
  // Stone surface
  px(ctx, x - 16, y - 34, 32, 24, '#9E9E9E');
  // Carved text lines (lighter stone)
  ctx.strokeStyle = '#B0BEC5';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 12, y - 28);
  ctx.lineTo(x + 12, y - 28);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 12, y - 24);
  ctx.lineTo(x + 8, y - 24);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 12, y - 20);
  ctx.lineTo(x + 10, y - 20);
  ctx.stroke();
  // Golden dot (animated)
  if (tick % 60 < 40) {
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(x + 10, y - 28, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Stone base/tray
  px(ctx, x - 14, y - 8, 28, 3, '#616161');
}

// bookshelf → Scroll Shelf
function drawBookshelf(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Dark wood frame
  px(ctx, x - 12, y - 34, 24, 30, '#8D6E63');
  // Shelves
  px(ctx, x - 10, y - 22, 20, 2, '#6D4C41');
  px(ctx, x - 10, y - 12, 20, 2, '#6D4C41');
  // Scrolls instead of books
  const scrollColors = ['#FFCC80', '#D7CCC8', '#FFF8E1', '#FFCC80', '#D7CCC8', '#FFF8E1', '#FFCC80', '#D7CCC8'];
  for (let shelf = 0; shelf < 3; shelf++) {
    const shelfY = y - 32 + shelf * 10;
    let bx = x - 9;
    for (let i = 0; i < 4 + shelf; i++) {
      const w = 2 + Math.floor(i * 0.5);
      const h = 6 + (i % 2);
      px(ctx, bx, shelfY + (8 - h), w, h, scrollColors[(shelf * 4 + i) % scrollColors.length]);
      // Scroll end cap (small circle look)
      px(ctx, bx, shelfY + (8 - h), w, 1, '#DAA520');
      bx += w + 1;
      if (bx > x + 8) break;
    }
  }
}

// reading_chair → Reading Kline (Greek reclining couch)
function drawReadingChair(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Marble cushion
  px(ctx, x - 10, y - 10, 20, 8, '#EFE7DA');
  px(ctx, x - 8, y - 8, 16, 4, '#F8F2E9');
  // Marble frame
  px(ctx, x - 10, y - 22, 20, 14, PALETTE.marbleMid);
  px(ctx, x - 8, y - 20, 16, 10, PALETTE.marbleLight);
  // Gold headrest stripe
  px(ctx, x - 10, y - 20, 4, 8, PALETTE.gold);
  // Side supports
  px(ctx, x - 12, y - 14, 3, 8, PALETTE.marbleDark);
  px(ctx, x + 9, y - 14, 3, 8, PALETTE.marbleDark);
}

// sofa → Greek Kline
function drawSofa(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Marble frame seat
  px(ctx, x - 16, y - 8, 32, 8, PALETTE.marbleLight);
  // Ivory cushion
  px(ctx, x - 14, y - 6, 28, 4, '#EFE7DA');
  // Marble back
  px(ctx, x - 16, y - 20, 32, 14, PALETTE.marbleLight);
  // Ivory back cushion
  px(ctx, x - 14, y - 18, 28, 10, '#F8F2E9');
  // Marble armrests
  px(ctx, x - 18, y - 16, 4, 12, PALETTE.marbleMid);
  px(ctx, x + 14, y - 16, 4, 12, PALETTE.marbleMid);
  // Gold accent throw
  px(ctx, x - 1, y - 6, 2, 4, PALETTE.gold);
}

// coffee_table → Low Stone Table
function drawCoffeeTable(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  drawFlatSurface(ctx, x, y, '#ECEFF1');
  // Stone legs visible
  px(ctx, x - 6, y - 2, 2, 4, '#CFD8DC');
  px(ctx, x + 4, y - 2, 2, 4, '#CFD8DC');
}

// server_rack → Oracle Pillar
function drawServerRack(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Marble base
  px(ctx, x - 10, y - 4, 20, 4, PALETTE.marbleDark);
  // Marble column
  px(ctx, x - 8, y - 36, 16, 32, PALETTE.marbleLight);
  px(ctx, x - 6, y - 34, 12, 28, '#ECE3D6');
  // Column capital (top)
  px(ctx, x - 10, y - 38, 20, 4, PALETTE.gold);
  // Glowing runes instead of LEDs
  for (let i = 0; i < 4; i++) {
    const uy = y - 32 + i * 7;
    const runeOn = ((tick + i * 7) % 20) < 14;
    px(ctx, x - 4, uy + 1, 3, 2, runeOn ? PALETTE.goldBright : '#6E5A2C');
    px(ctx, x + 1, uy + 1, 3, 2, ((tick + i * 3) % 30) < 25 ? '#D8C07D' : '#7D6A36');
    // Rune glow shimmer
    if (runeOn && tick % 10 < 6) {
      ctx.fillStyle = '#F2D67555';
      ctx.fillRect(x - 5, uy, 10, 4);
    }
  }
}

// potted_plant → Olive Tree
function drawPottedPlant(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Stone base (pot)
  px(ctx, x - 5, y - 8, 10, 8, '#9E9E9E');
  px(ctx, x - 6, y - 8, 12, 2, '#757575');
  // Soil/earth
  px(ctx, x - 4, y - 10, 8, 3, '#5D4037');
  // Brown trunk
  px(ctx, x - 1, y - 16, 2, 7, '#5D4037');
  // Olive leaves (swaying)
  const sway = Math.sin(tick * 0.04) * 1.5;
  ctx.fillStyle = '#558B2F';
  ctx.beginPath();
  ctx.ellipse(x + sway, y - 18, 6, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7CB342';
  ctx.beginPath();
  ctx.ellipse(x - 3 + sway * 0.5, y - 22, 5, 3, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#689F38';
  ctx.beginPath();
  ctx.ellipse(x + 3 - sway * 0.5, y - 20, 4, 3, 0.3, 0, Math.PI * 2);
  ctx.fill();
}

// carpet → Greek Mosaic (top-down rectangular)
function drawCarpet(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  const half = TILE_PX / 2 - 2;
  // Cream base rectangle
  ctx.fillStyle = '#FFF8E180';
  ctx.fillRect(x - half, y - half, half * 2, half * 2);
  // Gold border
  ctx.strokeStyle = '#DAA52080';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x - half, y - half, half * 2, half * 2);
  // Inner geometric pattern — gold inset
  const inner = TILE_PX / 4;
  ctx.fillStyle = '#DAA52050';
  ctx.fillRect(x - inner, y - inner, inner * 2, inner * 2);
  // Blue accent center
  ctx.fillStyle = '#4FC3F740';
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fill();
}

// wall_clock → Sundial
function drawWallClock(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Gold sundial disc
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.arc(x, y - 20, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#DAA520';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Hour markings
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const mx = x + Math.cos(angle) * 6;
    const my = y - 20 + Math.sin(angle) * 6;
    ctx.fillStyle = '#DAA520';
    ctx.fillRect(Math.round(mx), Math.round(my), 1, 1);
  }
  // Shadow pointer (gnomon)
  const shadowAngle = (tick * 0.003) % (Math.PI * 2);
  ctx.strokeStyle = '#5D4037';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y - 20);
  ctx.lineTo(x + Math.cos(shadowAngle) * 5, y - 20 + Math.sin(shadowAngle) * 5);
  ctx.stroke();
  // Center gold dot
  ctx.fillStyle = '#DAA520';
  ctx.beginPath();
  ctx.arc(x, y - 20, 1, 0, Math.PI * 2);
  ctx.fill();
}

// poster → Greek Mural
function drawPoster(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Frame
  px(ctx, x - 8, y - 30, 16, 20, '#DAA520');
  // Cream background
  px(ctx, x - 6, y - 28, 12, 16, '#FFF8E1');
  // Greek meander/key pattern (simplified gold lines)
  ctx.strokeStyle = '#DAA520';
  ctx.lineWidth = 1;
  // Top meander
  ctx.beginPath();
  ctx.moveTo(x - 4, y - 24);
  ctx.lineTo(x - 4, y - 22);
  ctx.lineTo(x - 2, y - 22);
  ctx.lineTo(x - 2, y - 24);
  ctx.lineTo(x, y - 24);
  ctx.lineTo(x, y - 22);
  ctx.lineTo(x + 2, y - 22);
  ctx.lineTo(x + 2, y - 24);
  ctx.lineTo(x + 4, y - 24);
  ctx.stroke();
  // Bottom meander
  ctx.beginPath();
  ctx.moveTo(x - 4, y - 18);
  ctx.lineTo(x - 4, y - 16);
  ctx.lineTo(x - 2, y - 16);
  ctx.lineTo(x - 2, y - 18);
  ctx.lineTo(x, y - 18);
  ctx.lineTo(x, y - 16);
  ctx.lineTo(x + 2, y - 16);
  ctx.lineTo(x + 2, y - 18);
  ctx.lineTo(x + 4, y - 18);
  ctx.stroke();
}

// meeting_chair → Marble Bench
function drawMeetingChair(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Marble seat
  px(ctx, x - 6, y - 6, 12, 4, '#ECEFF1');
  // Marble back
  px(ctx, x - 6, y - 14, 12, 10, '#E0E0E0');
  // Gold trim
  px(ctx, x - 6, y - 14, 12, 1, '#FFD700');
  // Stone legs
  px(ctx, x - 4, y - 2, 2, 4, '#CFD8DC');
  px(ctx, x + 2, y - 2, 2, 4, '#CFD8DC');
}

// door_mat → Temple Steps (top-down circular)
function drawDoorMat(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  const r = TILE_PX / 3;
  // Light gray marble step
  ctx.fillStyle = '#CFD8DC';
  ctx.beginPath();
  ctx.ellipse(x, y, r, r, 0, 0, Math.PI * 2);
  ctx.fill();
  // Step edge
  ctx.strokeStyle = '#B0BEC5';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Inner step
  ctx.fillStyle = '#E0E0E0';
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.7, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
}

// standing_desk → Marble Column Desk
function drawStandingDesk(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Marble column desk surface (higher)
  drawFlatSurface(ctx, x, y, PALETTE.marbleLight);
  // Gold rim on top
  px(ctx, x - 10, y - 18, 20, 1, PALETTE.gold);
  // Marble pillar legs
  px(ctx, x - 8, y - 4, 3, 6, PALETTE.marbleMid);
  px(ctx, x + 5, y - 4, 3, 6, PALETTE.marbleMid);
  // Oracle Mirror on stand
  const monY = y - 30;
  px(ctx, x - 8, monY - 12, 16, 12, PALETTE.gold);
  px(ctx, x - 6, monY - 10, 12, 8, '#DDE8F2');
  if (tick % 60 < 55) {
    px(ctx, x - 4, monY - 8, 8, 4, PALETTE.goldDeep);
  }
  // Gold stand
  px(ctx, x - 2, monY, 4, 5, PALETTE.gold);
  // Stone tablet (keyboard)
  px(ctx, x - 6, y - 14, 12, 4, PALETTE.marbleDark);
  px(ctx, x - 5, y - 13, 10, 2, PALETTE.marbleShadow);
}

// dual_monitor → Double Oracle Mirror
function drawDualMonitor(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Left Oracle Mirror
  px(ctx, x - 16, y - 24, 14, 10, PALETTE.gold);
  px(ctx, x - 14, y - 22, 10, 6, tick % 80 < 75 ? '#E5EDF5' : '#F3F7FB');
  // Right Oracle Mirror
  px(ctx, x + 2, y - 24, 14, 10, PALETTE.gold);
  px(ctx, x + 4, y - 22, 10, 6, tick % 80 < 70 ? '#DBE6F0' : '#EEF3F8');
  // Gold rune lines on left
  if (tick % 80 < 75) {
    for (let i = 0; i < 3; i++) {
      const w = 3 + ((tick + i * 7) % 5);
      px(ctx, x - 13, y - 21 + i * 2, w, 1, PALETTE.goldDeep);
    }
  }
  // Gold stands
  px(ctx, x - 10, y - 14, 3, 4, PALETTE.gold);
  px(ctx, x + 7, y - 14, 3, 4, PALETTE.gold);
}

// arcade_machine → Lyre (Musical Instrument)
function drawArcadeMachine(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Wood base
  px(ctx, x - 8, y - 8, 16, 8, '#8D6E63');
  // Gold frame — lyre arms curving up
  px(ctx, x - 10, y - 36, 3, 28, '#DAA520');
  px(ctx, x + 7, y - 36, 3, 28, '#DAA520');
  // Top crossbar
  px(ctx, x - 10, y - 38, 20, 3, '#DAA520');
  // Gold strings (vertical lines)
  const stringShades = ['#FFD700', '#FFC107', '#FFD700', '#FFEB3B', '#FFD700'];
  for (let i = 0; i < 5; i++) {
    // Strings glow — alternate gold shades per tick
    const shade = stringShades[(i + Math.floor(tick / 8)) % stringShades.length];
    px(ctx, x - 6 + i * 3, y - 35, 1, 26, shade);
  }
  // Decorative base curve
  px(ctx, x - 6, y - 10, 12, 2, '#6D4C41');
}

// vending_machine → Offering Altar
function drawVendingMachine(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Dark stone base
  px(ctx, x - 10, y - 12, 20, 12, '#757575');
  // Stone top platform
  px(ctx, x - 12, y - 16, 24, 4, '#9E9E9E');
  // Gold offerings on altar
  px(ctx, x - 6, y - 18, 3, 2, '#FFD700');
  px(ctx, x + 3, y - 18, 3, 2, '#FFD700');
  // Sacred flame on top (animated)
  const flameH = 6 + Math.sin(tick * 0.1) * 2;
  // Outer flame
  ctx.fillStyle = '#FFAB00';
  ctx.beginPath();
  ctx.ellipse(x, y - 20 - flameH / 2, 4, flameH / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Inner flame
  ctx.fillStyle = '#FF6D00';
  ctx.beginPath();
  ctx.ellipse(x, y - 20 - flameH / 2 + 1, 2, flameH / 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // Flame tip
  if (tick % 10 < 7) {
    px(ctx, x - 1, y - 22 - flameH, 2, 2, '#FFEB3B');
  }
  // Stone pillars on sides
  px(ctx, x - 10, y - 30, 3, 18, '#616161');
  px(ctx, x + 7, y - 30, 3, 18, '#616161');
}

// trophy_shelf → Laurel Display
function drawTrophyShelf(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Wood shelf frame
  px(ctx, x - 10, y - 24, 20, 20, '#8D6E63');
  // Shelf
  px(ctx, x - 8, y - 14, 16, 2, '#6D4C41');
  // Gold laurel wreath
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x - 4, y - 20, 3, 0, Math.PI * 2);
  ctx.stroke();
  px(ctx, x - 5, y - 24, 2, 1, '#FFD700');
  // Silver laurel
  ctx.strokeStyle = '#B0BEC5';
  ctx.beginPath();
  ctx.arc(x + 1, y - 20, 3, 0, Math.PI * 2);
  ctx.stroke();
  px(ctx, x, y - 24, 2, 1, '#B0BEC5');
  // Bronze laurel
  ctx.strokeStyle = '#CD8032';
  ctx.beginPath();
  ctx.arc(x + 6, y - 20, 3, 0, Math.PI * 2);
  ctx.stroke();
  px(ctx, x + 5, y - 24, 2, 1, '#CD8032');
  // Lower shelf items
  px(ctx, x - 5, y - 12, 3, 3, '#FFD700');
  px(ctx, x + 3, y - 12, 3, 3, '#B0BEC5');
}

// aquarium → Sacred Pool
function drawAquarium(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Stone rim
  px(ctx, x - 12, y - 22, 24, 18, '#CFD8DC');
  // Water interior
  px(ctx, x - 10, y - 20, 20, 14, '#BBDEFB');
  // Water surface shimmer
  px(ctx, x - 10, y - 20, 20, 2, '#E3F2FD');
  // Gentle ripple animation
  const ripple = Math.sin(tick * 0.04) * 2;
  ctx.strokeStyle = '#90CAF940';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(x - 8, y - 18 + ripple * 0.3);
  ctx.quadraticCurveTo(x, y - 17 + ripple, x + 8, y - 18 + ripple * 0.3);
  ctx.stroke();
  // Lotus flowers on surface
  ctx.fillStyle = '#F8BBD0';
  ctx.beginPath();
  ctx.ellipse(x - 4 + ripple * 0.5, y - 19, 2.5, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#F48FB1';
  ctx.beginPath();
  ctx.ellipse(x + 4 - ripple * 0.3, y - 18, 2, 1, 0, 0, Math.PI * 2);
  ctx.fill();
  // Stone bottom
  px(ctx, x - 10, y - 8, 20, 2, '#B0BEC5');
}

// marble_round_table → Marble Round Table
function drawMarbleRoundTable(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Marble round table top (ellipse)
  ctx.fillStyle = '#F5F5F5';
  ctx.beginPath();
  ctx.ellipse(x, y - 14, 12, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Gold border
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Shadow edge
  ctx.fillStyle = '#E0E0E0';
  ctx.beginPath();
  ctx.ellipse(x, y - 13, 11, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Central marble pillar leg
  px(ctx, x - 2, y - 10, 4, 10, '#ECEFF1');
  px(ctx, x - 3, y - 10, 6, 1, '#CFD8DC'); // top cap
  px(ctx, x - 3, y, 6, 2, '#B0BEC5'); // base
}

// cloud_seat → Cloud Seat
function drawCloudSeat(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Cloud floating animation
  const floatOffset = Math.sin(tick * 0.03) * 1;
  const cloudY = y - 8 + floatOffset;
  // Draw cloud shape (multiple overlapping circles)
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = '#FFFFFF';
  // Main body
  ctx.beginPath();
  ctx.ellipse(x, cloudY, 8, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Left puff
  ctx.beginPath();
  ctx.ellipse(x - 5, cloudY - 1, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // Right puff
  ctx.beginPath();
  ctx.ellipse(x + 5, cloudY - 1, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // Top puff
  ctx.beginPath();
  ctx.ellipse(x, cloudY - 3, 5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // Shadow underneath
  ctx.fillStyle = '#E0E0E040';
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 6, 2, 0, 0, Math.PI * 2);
  ctx.fill();
}

interface ColumnSpec {
  baseWidth: number;
  baseDepth: number;
  shaftWidth: number;
  shaftHeight: number;
  fluteStep: number;
  goldBands: number;
  capWidth: number;
  capHeight: number;
}

function drawColumnCore(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tick: number,
  spec: ColumnSpec,
): { topY: number } {
  const shaftTop = y - (spec.baseDepth + spec.shaftHeight);

  // Base
  px(ctx, x - Math.floor(spec.baseWidth / 2), y - spec.baseDepth, spec.baseWidth, spec.baseDepth, PALETTE.marbleShadow);
  px(ctx, x - Math.floor((spec.baseWidth - 4) / 2), y - spec.baseDepth - 3, spec.baseWidth - 4, 3, PALETTE.marbleDark);
  px(ctx, x - Math.floor((spec.baseWidth - 6) / 2), y - spec.baseDepth - 5, spec.baseWidth - 6, 2, PALETTE.goldDeep);

  // Shaft + side depth
  px(ctx, x - Math.floor(spec.shaftWidth / 2), shaftTop, spec.shaftWidth, spec.shaftHeight, PALETTE.marbleLight);
  px(ctx, x - Math.floor(spec.shaftWidth / 2), shaftTop, 2, spec.shaftHeight, PALETTE.marbleMid);
  px(ctx, x + Math.floor(spec.shaftWidth / 2) - 2, shaftTop, 2, spec.shaftHeight, '#FFF9F0');

  // Fluting
  for (let fx = x - Math.floor(spec.shaftWidth / 2) + 2; fx < x + Math.floor(spec.shaftWidth / 2) - 2; fx += spec.fluteStep) {
    px(ctx, fx, shaftTop + 2, 1, spec.shaftHeight - 3, '#D0C1AD');
  }

  // Capital
  px(ctx, x - Math.floor(spec.capWidth / 2), shaftTop - spec.capHeight, spec.capWidth, spec.capHeight, '#F6EDDF');
  px(ctx, x - Math.floor((spec.capWidth + 4) / 2), shaftTop - spec.capHeight - 3, spec.capWidth + 4, 3, '#E7D8C5');

  // Gold bands
  for (let i = 0; i < spec.goldBands; i++) {
    const bandY = shaftTop - spec.capHeight - 4 - i * 2;
    px(ctx, x - Math.floor((spec.capWidth + 6) / 2), bandY, spec.capWidth + 6, 1, i % 2 === 0 ? PALETTE.gold : PALETTE.goldDeep);
  }

  // Moving glint
  if (tick % 110 < 72) {
    const gx = x + (tick % 14) - 7;
    px(ctx, gx, shaftTop + 6, 1, Math.max(8, spec.shaftHeight - 18), '#FFF8DC');
  }

  return { topY: shaftTop };
}

// doric_column → Doric Column
function drawDoricColumn(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  drawColumnCore(ctx, x, y, tick, {
    baseWidth: 16,
    baseDepth: 5,
    shaftWidth: 8,
    shaftHeight: 20,
    fluteStep: 3,
    goldBands: 0,
    capWidth: 12,
    capHeight: 3,
  });
}

// temple_column → Grand Temple Column
function drawTempleColumn(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  const { topY } = drawColumnCore(ctx, x, y, tick, {
    baseWidth: 34,
    baseDepth: 10,
    shaftWidth: 18,
    shaftHeight: 58,
    fluteStep: 2,
    goldBands: 6,
    capWidth: 32,
    capHeight: 7,
  });

  // Dramatic temple ornamentation
  ctx.fillStyle = '#F4E8D6';
  ctx.beginPath();
  ctx.moveTo(x - 12, topY - 9);
  ctx.lineTo(x, topY - 20);
  ctx.lineTo(x + 12, topY - 9);
  ctx.closePath();
  ctx.fill();
  px(ctx, x - 2, topY - 15, 4, 2, PALETTE.goldBright);
  px(ctx, x - 14, topY - 2, 28, 2, PALETTE.gold);
  px(ctx, x - 8, topY - 6, 3, 2, PALETTE.gold);
  px(ctx, x + 5, topY - 6, 3, 2, PALETTE.gold);

  if (tick % 90 < 50) {
    px(ctx, x - 10, topY - 13, 2, 1, '#FFF3BF');
    px(ctx, x + 8, topY - 11, 2, 1, '#FFF3BF');
  }
}

// marble_column → Polished Marble Column
function drawMarbleColumn(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  const { topY } = drawColumnCore(ctx, x, y, tick, {
    baseWidth: 20,
    baseDepth: 6,
    shaftWidth: 10,
    shaftHeight: 34,
    fluteStep: 3,
    goldBands: 1,
    capWidth: 16,
    capHeight: 3,
  });

  // Polished marble stripe + restrained gilding
  px(ctx, x - 1, topY + 2, 1, 34, '#FFFDF8');
  px(ctx, x + 2, topY + 5, 1, 10, '#F1E2CA');
  px(ctx, x + 2, topY + 20, 1, 10, '#F1E2CA');
  if (tick % 120 < 84) {
    px(ctx, x + 1, topY + 10 + (tick % 12), 1, 4, PALETTE.goldBright);
  }
}

// sacred_brazier → Sacred Fire Brazier
function drawSacredBrazier(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Stone stand
  px(ctx, x - 4, y - 12, 8, 10, '#9E9E9E');
  // Bronze bowl
  px(ctx, x - 9, y - 16, 18, 4, '#CD8032');
  px(ctx, x - 7, y - 14, 14, 2, '#DAA520');
  // Flame
  const flameH = 6 + Math.sin(tick * 0.11) * 2;
  ctx.fillStyle = '#FFAB00';
  ctx.beginPath();
  ctx.ellipse(x, y - 18 - flameH / 2, 4, flameH / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FF6D00';
  ctx.beginPath();
  ctx.ellipse(x, y - 18 - flameH / 2 + 1, 2, flameH / 3, 0, 0, Math.PI * 2);
  ctx.fill();
  if (tick % 12 < 8) {
    px(ctx, x - 1, y - 20 - flameH, 2, 2, '#FFEB3B');
  }
}

// god_statue → Olympian Statue
function drawGodStatue(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Pedestal (double tier)
  px(ctx, x - 10, y - 8, 20, 8, '#BEB3A3');
  px(ctx, x - 8, y - 11, 16, 3, '#DED5C7');
  px(ctx, x - 9, y - 12, 18, 1, PALETTE.goldDeep);
  // Torso + drape
  px(ctx, x - 4, y - 31, 8, 20, '#EEE7DB');
  px(ctx, x - 3, y - 22, 1, 10, '#D7CBBB');
  px(ctx, x + 2, y - 22, 1, 10, '#D7CBBB');
  // Head + shoulders
  px(ctx, x - 3, y - 36, 6, 5, '#F5F1EA');
  px(ctx, x - 7, y - 27, 3, 2, '#DFD4C5');
  px(ctx, x + 4, y - 27, 3, 2, '#DFD4C5');
  // Gold laurel
  px(ctx, x - 2, y - 37, 4, 1, PALETTE.gold);
  px(ctx, x - 1, y - 38, 2, 1, PALETTE.goldBright);
  if (tick % 120 < 60) {
    px(ctx, x - 11, y - 38, 2, 2, '#FFE7A3');
    px(ctx, x + 9, y - 36, 2, 2, '#FFE7A3');
  }
}

// altar → Sacred Altar
function drawAltar(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  drawFlatSurface(ctx, x, y, '#F4EEE2');
  // Gold trim and crest
  px(ctx, x - 10, y - 14, 20, 1, PALETTE.gold);
  px(ctx, x - 6, y - 18, 12, 3, '#E9DBC8');
  px(ctx, x - 4, y - 17, 8, 1, PALETTE.goldDeep);
  px(ctx, x - 1, y - 19, 2, 1, PALETTE.goldBright);
  // Central flame bowl
  px(ctx, x - 3, y - 21, 6, 2, '#C57E38');
  if (tick % 24 < 18) {
    px(ctx, x - 1, y - 24, 2, 3, '#FFAB00');
    px(ctx, x, y - 26, 1, 2, '#FFEB3B');
  }
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

export function drawFurniture(
  ctx: CanvasRenderingContext2D,
  type: FurnitureType | string,
  col: number,
  row: number,
  tick: number,
): void {
  let rendered = true;
  switch (type) {
    case 'desk': drawDesk(ctx, col, row, tick); break;
    case 'chair': drawChair(ctx, col, row); break;
    case 'monitor': drawMonitor(ctx, col, row, tick); break;
    case 'keyboard': rendered = false; break; // drawn as part of desk
    case 'big_desk': drawBigDesk(ctx, col, row, tick); break;
    case 'floor_window': drawFloorWindow(ctx, col, row, tick); break;
    case 'coffee_machine': drawCoffeeMachine(ctx, col, row, tick); break;
    case 'snack_shelf': drawSnackShelf(ctx, col, row); break;
    case 'water_cooler': drawWaterCooler(ctx, col, row, tick); break;
    case 'small_table': drawSmallTable(ctx, col, row); break;
    case 'round_table': drawRoundTable(ctx, col, row); break;
    case 'long_table': drawLongTable(ctx, col, row); break;
    case 'whiteboard_obj': drawWhiteboard(ctx, col, row, tick); break;
    case 'bookshelf': drawBookshelf(ctx, col, row); break;
    case 'reading_chair': drawReadingChair(ctx, col, row); break;
    case 'sofa': drawSofa(ctx, col, row); break;
    case 'coffee_table': drawCoffeeTable(ctx, col, row); break;
    case 'server_rack': drawServerRack(ctx, col, row, tick); break;
    case 'potted_plant': drawPottedPlant(ctx, col, row, tick); break;
    case 'carpet': drawCarpet(ctx, col, row); break;
    case 'wall_clock': drawWallClock(ctx, col, row, tick); break;
    case 'poster': drawPoster(ctx, col, row); break;
    case 'meeting_chair': drawMeetingChair(ctx, col, row); break;
    case 'door_mat': drawDoorMat(ctx, col, row); break;
    case 'standing_desk': drawStandingDesk(ctx, col, row, tick); break;
    case 'dual_monitor': drawDualMonitor(ctx, col, row, tick); break;
    case 'arcade_machine': drawArcadeMachine(ctx, col, row, tick); break;
    case 'vending_machine': drawVendingMachine(ctx, col, row, tick); break;
    case 'trophy_shelf': drawTrophyShelf(ctx, col, row); break;
    case 'aquarium': drawAquarium(ctx, col, row, tick); break;
    case 'marble_round_table': drawMarbleRoundTable(ctx, col, row); break;
    case 'cloud_seat': drawCloudSeat(ctx, col, row, tick); break;
    case 'doric_column': drawDoricColumn(ctx, col, row, tick); break;
    case 'temple_column': drawTempleColumn(ctx, col, row, tick); break;
    case 'marble_column': drawMarbleColumn(ctx, col, row, tick); break;
    case 'sacred_brazier': drawSacredBrazier(ctx, col, row, tick); break;
    case 'god_statue': drawGodStatue(ctx, col, row, tick); break;
    case 'altar': drawAltar(ctx, col, row, tick); break;
    default:
      rendered = false;
      break;
  }

  if (rendered) {
    applyTemplePatina(ctx, col, row, tick);
  }
}

// ---------------------------------------------------------------------------
// Oracle Vision Screen — drawn on top of desk monitors
// ---------------------------------------------------------------------------

export function drawMonitorScreen(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tick: number,
  state?: string,
): void {
  // Screen area: small rectangle on the desk monitor
  const sx = x - 6;
  const sy = y - 36;
  const sw = 12;
  const sh = 8;

  switch (state) {
    case 'working': {
      // Gold rune lines scrolling
      ctx.fillStyle = '#2F2A20';
      ctx.fillRect(sx, sy, sw, sh);
      ctx.fillStyle = PALETTE.goldBright;
      for (let i = 0; i < 4; i++) {
        const w = 3 + ((tick + i * 5) % 6);
        ctx.fillRect(sx + 1, sy + 1 + i * 2, w, 1);
      }
      break;
    }
    case 'error': {
      // Red flame screen with white X
      ctx.fillStyle = '#B71C1C';
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx + 3, sy + 2);
      ctx.lineTo(sx + sw - 3, sy + sh - 2);
      ctx.moveTo(sx + sw - 3, sy + 2);
      ctx.lineTo(sx + 3, sy + sh - 2);
      ctx.stroke();
      break;
    }
    case 'idle': {
      // Golden bouncing dot
      const bx = sx + 2 + Math.abs(Math.sin(tick * 0.05)) * (sw - 6);
      const by = sy + 2 + Math.abs(Math.cos(tick * 0.04)) * (sh - 4);
      ctx.fillStyle = '#3C3323';
      ctx.fillRect(sx, sy, sw, sh);
      ctx.fillStyle = PALETTE.gold;
      ctx.fillRect(Math.round(bx), Math.round(by), 2, 2);
      break;
    }
    case 'thinking': {
      // Amber glowing dots
      ctx.fillStyle = '#2E2A1F';
      ctx.fillRect(sx, sy, sw, sh);
      const dotCount = 3;
      for (let i = 0; i < dotCount; i++) {
        const alpha = ((tick * 0.08 + i * 0.8) % 2) < 1 ? 1 : 0.3;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = PALETTE.goldBright;
        ctx.fillRect(sx + 2 + i * 3, sy + 3, 2, 2);
      }
      ctx.globalAlpha = 1;
      break;
    }
    default:
      // No overlay for unknown states
      break;
  }
}

// ---------------------------------------------------------------------------
// Pegasus — tiny flying horse that moves on the floor
// ---------------------------------------------------------------------------

export function drawRoomba(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tick: number,
): void {
  // White body (3-4px)
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.ellipse(x, y, 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Wings (flutter with tick)
  const wingUp = tick % 12 < 6;
  const wingY = wingUp ? -2 : -1;
  // Left wing
  px(ctx, x - 4, y + wingY, 2, 1, '#E0E0E0');
  // Right wing
  px(ctx, x + 2, y + wingY, 2, 1, '#E0E0E0');
  // Tail
  px(ctx, x - 4, y + 1, 1, 1, '#B0BEC5');
  // Head
  px(ctx, x + 3, y - 1, 1, 1, '#FAFAFA');
  // Golden sparkle trail
  if (tick % 8 < 4) {
    ctx.fillStyle = '#FFD70060';
    ctx.fillRect(x - 5, y + 1, 1, 1);
    ctx.fillRect(x - 3, y + 2, 1, 1);
    ctx.fillRect(x + 4, y, 1, 1);
  }
}
