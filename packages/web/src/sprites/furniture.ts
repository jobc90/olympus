// ============================================================================
// Furniture Sprite Drawing — Pixel art isometric furniture (Greek/Olympus Theme)
// ============================================================================

import type { TileType } from '../engine/pathfinding';
import { gridToScreen, TILE_W, TILE_H, drawIsometricBlock } from '../engine/isometric';

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
) : never;

function px(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

// ---------------------------------------------------------------------------
// Individual furniture draw functions — Greek/Olympus Theme
// ---------------------------------------------------------------------------

// desk → Marble Table
function drawDesk(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Marble table top
  drawIsometricBlock(ctx, { col, row }, 14, '#F5F5F5', '#CFD8DC', '#B0BEC5');
  // Oracle Mirror (monitor)
  const monY = y - 26;
  px(ctx, x - 8, monY - 12, 16, 12, '#DAA520');
  px(ctx, x - 6, monY - 10, 12, 8, '#B388FF');
  // Mystic flicker
  if (tick % 60 < 55) {
    px(ctx, x - 4, monY - 8, 8, 4, '#7C4DFF');
  }
  // Gold stand
  px(ctx, x - 2, monY, 4, 3, '#FFD700');
  // Stone tablet (keyboard)
  px(ctx, x - 6, y - 10, 12, 4, '#9E9E9E');
  px(ctx, x - 5, y - 9, 10, 2, '#757575');
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
  drawIsometricBlock(ctx, { col, row }, 14, '#FFF8E1', '#FFD700', '#DAA520');
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
  px(ctx, x - 10, y - 22, 20, 14, '#DAA520');
  // Mystic purple screen
  px(ctx, x - 8, y - 20, 16, 10, tick % 90 < 85 ? '#B388FF' : '#D1C4E9');
  // Purple rune lines
  if (tick % 90 < 85) {
    for (let i = 0; i < 4; i++) {
      const w = 4 + Math.floor(Math.random() * 8);
      px(ctx, x - 6, y - 18 + i * 2, w, 1, '#7C4DFF');
    }
  }
  // Gold stand
  px(ctx, x - 2, y - 8, 4, 4, '#FFD700');
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
  drawIsometricBlock(ctx, { col, row }, 10, '#ECEFF1', '#CFD8DC', '#B0BEC5');
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
  drawIsometricBlock(ctx, { col, row }, 12, '#ECEFF1', '#CFD8DC', '#B0BEC5');
  const { x, y } = gridToScreen({ col, row });
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
  // Purple cushion
  px(ctx, x - 10, y - 10, 20, 8, '#CE93D8');
  px(ctx, x - 8, y - 8, 16, 4, '#E1BEE7');
  // Wood frame
  px(ctx, x - 10, y - 22, 20, 14, '#8D6E63');
  px(ctx, x - 8, y - 20, 16, 10, '#A1887F');
  // Purple headrest
  px(ctx, x - 10, y - 20, 4, 8, '#CE93D8');
  // Wood armrests/legs
  px(ctx, x - 12, y - 14, 3, 8, '#8D6E63');
  px(ctx, x + 9, y - 14, 3, 8, '#8D6E63');
}

// sofa → Greek Kline
function drawSofa(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Marble frame seat
  px(ctx, x - 16, y - 8, 32, 8, '#F5F5F5');
  // Purple cushion on top
  px(ctx, x - 14, y - 6, 28, 4, '#CE93D8');
  // Marble back
  px(ctx, x - 16, y - 20, 32, 14, '#F5F5F5');
  // Purple back cushion
  px(ctx, x - 14, y - 18, 28, 10, '#E1BEE7');
  // Marble armrests
  px(ctx, x - 18, y - 16, 4, 12, '#ECEFF1');
  px(ctx, x + 14, y - 16, 4, 12, '#ECEFF1');
  // Gold accent throw
  px(ctx, x - 1, y - 6, 2, 4, '#FFD700');
}

// coffee_table → Low Stone Table
function drawCoffeeTable(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  drawIsometricBlock(ctx, { col, row }, 6, '#ECEFF1', '#CFD8DC', '#B0BEC5');
  // Stone legs visible
  px(ctx, x - 6, y - 2, 2, 4, '#CFD8DC');
  px(ctx, x + 4, y - 2, 2, 4, '#CFD8DC');
}

// server_rack → Oracle Pillar
function drawServerRack(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Purple marble base
  px(ctx, x - 10, y - 4, 20, 4, '#7C4DFF');
  // Light purple marble column
  px(ctx, x - 8, y - 36, 16, 32, '#EDE7F6');
  px(ctx, x - 6, y - 34, 12, 28, '#E8EAF6');
  // Column capital (top)
  px(ctx, x - 10, y - 38, 20, 4, '#D1C4E9');
  // Glowing runes instead of LEDs
  for (let i = 0; i < 4; i++) {
    const uy = y - 32 + i * 7;
    const runeOn = ((tick + i * 7) % 20) < 14;
    px(ctx, x - 4, uy + 1, 3, 2, runeOn ? '#B388FF' : '#4A148C');
    px(ctx, x + 1, uy + 1, 3, 2, ((tick + i * 3) % 30) < 25 ? '#7C4DFF' : '#311B92');
    // Rune glow shimmer
    if (runeOn && tick % 10 < 6) {
      ctx.fillStyle = '#B388FF40';
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

// carpet → Greek Mosaic
function drawCarpet(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Cream base diamond
  ctx.fillStyle = '#FFF8E180';
  ctx.beginPath();
  ctx.moveTo(x, y - TILE_H / 2);
  ctx.lineTo(x + TILE_W / 2, y);
  ctx.lineTo(x, y + TILE_H / 2);
  ctx.lineTo(x - TILE_W / 2, y);
  ctx.closePath();
  ctx.fill();
  // Gold border
  ctx.strokeStyle = '#DAA52080';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Inner geometric pattern — gold diamond
  ctx.fillStyle = '#DAA52050';
  ctx.beginPath();
  ctx.moveTo(x, y - TILE_H / 4);
  ctx.lineTo(x + TILE_W / 4, y);
  ctx.lineTo(x, y + TILE_H / 4);
  ctx.lineTo(x - TILE_W / 4, y);
  ctx.closePath();
  ctx.fill();
  // Blue accent center
  ctx.fillStyle = '#4FC3F740';
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fill();
  // Gray border lines
  ctx.strokeStyle = '#B0BEC540';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(x, y - TILE_H / 3);
  ctx.lineTo(x + TILE_W / 3, y);
  ctx.lineTo(x, y + TILE_H / 3);
  ctx.lineTo(x - TILE_W / 3, y);
  ctx.closePath();
  ctx.stroke();
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

// door_mat → Temple Steps
function drawDoorMat(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Light gray marble step
  ctx.fillStyle = '#CFD8DC';
  ctx.beginPath();
  ctx.ellipse(x, y, TILE_W / 3, TILE_H / 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Step edge
  ctx.strokeStyle = '#B0BEC5';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Inner step
  ctx.fillStyle = '#E0E0E0';
  ctx.beginPath();
  ctx.ellipse(x, y, TILE_W / 4, TILE_H / 5, 0, 0, Math.PI * 2);
  ctx.fill();
}

// standing_desk → Marble Column Desk
function drawStandingDesk(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Marble column desk surface (higher)
  drawIsometricBlock(ctx, { col, row }, 17, '#F5F5F5', '#ECEFF1', '#CFD8DC');
  // Gold rim on top
  px(ctx, x - 10, y - 18, 20, 1, '#FFD700');
  // Marble pillar legs
  px(ctx, x - 8, y - 4, 3, 6, '#ECEFF1');
  px(ctx, x + 5, y - 4, 3, 6, '#ECEFF1');
  // Oracle Mirror on stand
  const monY = y - 30;
  px(ctx, x - 8, monY - 12, 16, 12, '#DAA520');
  px(ctx, x - 6, monY - 10, 12, 8, '#B388FF');
  if (tick % 60 < 55) {
    px(ctx, x - 4, monY - 8, 8, 4, '#7C4DFF');
  }
  // Gold stand
  px(ctx, x - 2, monY, 4, 5, '#FFD700');
  // Stone tablet (keyboard)
  px(ctx, x - 6, y - 14, 12, 4, '#9E9E9E');
  px(ctx, x - 5, y - 13, 10, 2, '#757575');
}

// dual_monitor → Double Oracle Mirror
function drawDualMonitor(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Left Oracle Mirror — gold frame, purple screen
  px(ctx, x - 16, y - 24, 14, 10, '#DAA520');
  px(ctx, x - 14, y - 22, 10, 6, tick % 80 < 75 ? '#B388FF' : '#D1C4E9');
  // Right Oracle Mirror — gold frame, teal divine screen
  px(ctx, x + 2, y - 24, 14, 10, '#DAA520');
  px(ctx, x + 4, y - 22, 10, 6, tick % 80 < 70 ? '#80CBC4' : '#B2DFDB');
  // Purple rune lines on left
  if (tick % 80 < 75) {
    for (let i = 0; i < 3; i++) {
      const w = 3 + ((tick + i * 7) % 5);
      px(ctx, x - 13, y - 21 + i * 2, w, 1, '#7C4DFF');
    }
  }
  // Gold stands
  px(ctx, x - 10, y - 14, 3, 4, '#FFD700');
  px(ctx, x + 7, y - 14, 3, 4, '#FFD700');
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
  switch (type) {
    case 'desk': return drawDesk(ctx, col, row, tick);
    case 'chair': return drawChair(ctx, col, row);
    case 'monitor': return drawMonitor(ctx, col, row, tick);
    case 'keyboard': return; // drawn as part of desk
    case 'big_desk': return drawBigDesk(ctx, col, row, tick);
    case 'floor_window': return drawFloorWindow(ctx, col, row, tick);
    case 'coffee_machine': return drawCoffeeMachine(ctx, col, row, tick);
    case 'snack_shelf': return drawSnackShelf(ctx, col, row);
    case 'water_cooler': return drawWaterCooler(ctx, col, row, tick);
    case 'small_table': return drawSmallTable(ctx, col, row);
    case 'round_table': return drawRoundTable(ctx, col, row);
    case 'long_table': return drawLongTable(ctx, col, row);
    case 'whiteboard_obj': return drawWhiteboard(ctx, col, row, tick);
    case 'bookshelf': return drawBookshelf(ctx, col, row);
    case 'reading_chair': return drawReadingChair(ctx, col, row);
    case 'sofa': return drawSofa(ctx, col, row);
    case 'coffee_table': return drawCoffeeTable(ctx, col, row);
    case 'server_rack': return drawServerRack(ctx, col, row, tick);
    case 'potted_plant': return drawPottedPlant(ctx, col, row, tick);
    case 'carpet': return drawCarpet(ctx, col, row);
    case 'wall_clock': return drawWallClock(ctx, col, row, tick);
    case 'poster': return drawPoster(ctx, col, row);
    case 'meeting_chair': return drawMeetingChair(ctx, col, row);
    case 'door_mat': return drawDoorMat(ctx, col, row);
    case 'standing_desk': return drawStandingDesk(ctx, col, row, tick);
    case 'dual_monitor': return drawDualMonitor(ctx, col, row, tick);
    case 'arcade_machine': return drawArcadeMachine(ctx, col, row, tick);
    case 'vending_machine': return drawVendingMachine(ctx, col, row, tick);
    case 'trophy_shelf': return drawTrophyShelf(ctx, col, row);
    case 'aquarium': return drawAquarium(ctx, col, row, tick);
    case 'marble_round_table': return drawMarbleRoundTable(ctx, col, row);
    case 'cloud_seat': return drawCloudSeat(ctx, col, row, tick);
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
      // Purple rune lines scrolling
      ctx.fillStyle = '#4A148C';
      ctx.fillRect(sx, sy, sw, sh);
      ctx.fillStyle = '#B388FF';
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
      ctx.fillStyle = '#311B92';
      ctx.fillRect(sx, sy, sw, sh);
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(Math.round(bx), Math.round(by), 2, 2);
      break;
    }
    case 'thinking': {
      // Purple glowing dots
      ctx.fillStyle = '#4A148C';
      ctx.fillRect(sx, sy, sw, sh);
      const dotCount = 3;
      for (let i = 0; i < dotCount; i++) {
        const alpha = ((tick * 0.08 + i * 0.8) % 2) < 1 ? 1 : 0.3;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#B388FF';
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
