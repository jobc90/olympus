// ============================================================================
// Furniture Sprite Drawing — RPG Maker / Stardew Valley Pixel Art Style
// Olympus temple concept maintained; visual aesthetic updated to clean top-down pixel art
// ============================================================================

import type { TileType } from '../engine/pathfinding';
import { getTileCenter, TILE_PX } from '../engine/topdown';

// Alias: returns tile center (32×32 tile, center at +16,+16 from top-left)
function gridToScreen(pos: { col: number; row: number }): { x: number; y: number } {
  return getTileCenter(pos);
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

// ---------------------------------------------------------------------------
// Color palette — RPG Maker / Pixel art style
// ---------------------------------------------------------------------------
const OL  = '#1A1A2E';   // universal dark outline

const WD  = '#7B5530';   // wood dark
const WM  = '#9B6E45';   // wood mid
const WL  = '#B8895A';   // wood light
const WT  = '#D0A870';   // wood top highlight

const MD  = '#5A6472';   // metal/plastic dark
const MM  = '#7A8A98';   // metal mid
const ML  = '#A0B0BC';   // metal light

const SC  = '#1E2D40';   // screen bezel / dark
const SB  = '#4BBAD4';   // screen blue
const SL  = '#7FD4EA';   // screen light

const PG  = '#2E6B1E';   // plant green dark
const PM  = '#4D9B2A';   // plant mid
const PH  = '#78CC48';   // plant highlight
const PT  = '#B86040';   // pot terracotta

const MBL = '#C8D8E0';   // marble light
const MBM = '#A8B8C0';   // marble mid
const MBD = '#7890A0';   // marble dark
const GLD = '#D4AF37';   // gold
const GLL = '#F0D060';   // gold light
const GLD2= '#A07A00';   // gold deep

// Book spine colors — vibrant RPG library feel
const BOOK_COLORS = ['#C03030','#3060C0','#30A050','#C0A020','#8030B0','#C06020','#20A0A0','#A03060'];

const FURNITURE_SCALE = 2;

// ---------------------------------------------------------------------------
// Pixel helpers
// ---------------------------------------------------------------------------

function px(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function fillPixelEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, rx: number, ry: number, color: string,
): void {
  const mx = Math.round(cx); const my = Math.round(cy);
  const ex = Math.max(1, Math.round(rx)); const ey = Math.max(1, Math.round(ry));
  ctx.fillStyle = color;
  for (let yy = -ey; yy <= ey; yy++) {
    const ny = yy / ey;
    const span = Math.floor(ex * Math.sqrt(Math.max(0, 1 - ny * ny)));
    ctx.fillRect(mx - span, my + yy, span * 2 + 1, 1);
  }
}

function strokePixelEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, rx: number, ry: number, color: string,
): void {
  const mx = Math.round(cx); const my = Math.round(cy);
  const ex = Math.max(1, Math.round(rx)); const ey = Math.max(1, Math.round(ry));
  ctx.fillStyle = color;
  for (let yy = -ey; yy <= ey; yy++) {
    const ny = yy / ey;
    const span = Math.floor(ex * Math.sqrt(Math.max(0, 1 - ny * ny)));
    ctx.fillRect(mx - span, my + yy, 1, 1);
    ctx.fillRect(mx + span, my + yy, 1, 1);
  }
}

function drawPixelLine(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, x1: number, y1: number, color: string,
): void {
  let x = Math.round(x0); let y = Math.round(y0);
  const tx = Math.round(x1); const ty = Math.round(y1);
  const dx = Math.abs(tx - x); const sx = x < tx ? 1 : -1;
  const dy = -Math.abs(ty - y); const sy = y < ty ? 1 : -1;
  let err = dx + dy;
  ctx.fillStyle = color;
  while (true) {
    ctx.fillRect(x, y, 1, 1);
    if (x === tx && y === ty) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

/** Draw a flat top-down desk surface with outline */
function drawDeskSurface(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, top: string, front: string): void {
  // top surface
  px(ctx, x - w/2, y - h/2, w, h, top);
  // front face (lower strip)
  px(ctx, x - w/2, y + h/2 - 3, w, 3, front);
  // outline
  px(ctx, x - w/2 - 1, y - h/2 - 1, w + 2, 1, OL);  // top
  px(ctx, x - w/2 - 1, y + h/2,     w + 2, 1, OL);  // bottom
  px(ctx, x - w/2 - 1, y - h/2 - 1, 1, h + 2, OL);  // left
  px(ctx, x + w/2,     y - h/2 - 1, 1, h + 2, OL);  // right
}

/** Draw an LCD monitor at (mx, my) = center of screen */
function drawLCD(ctx: CanvasRenderingContext2D, mx: number, my: number, w: number, h: number, tick: number): void {
  // Bezel
  px(ctx, mx - w/2 - 2, my - h/2 - 2, w + 4, h + 4, OL);
  px(ctx, mx - w/2 - 1, my - h/2 - 1, w + 2, h + 2, SC);
  // Screen
  const scrCol = tick % 60 < 55 ? SB : SL;
  px(ctx, mx - w/2, my - h/2, w, h, scrCol);
  // Code lines
  if (tick % 60 < 55) {
    px(ctx, mx - w/2 + 1, my - h/2 + 1, Math.round(w * 0.65), 1, SL);
    px(ctx, mx - w/2 + 1, my - h/2 + 3, Math.round(w * 0.45), 1, SL);
    px(ctx, mx - w/2 + 1, my - h/2 + 5, Math.round(w * 0.55), 1, SL);
  }
}

// ---------------------------------------------------------------------------
// Individual furniture draw functions — RPG Maker / Pixel Art style
// ---------------------------------------------------------------------------

// desk → Wooden Desk with Computer
function drawDesk(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  drawDeskSurface(ctx, x, y, 24, 12, WT, WD);
  // Monitor stand
  px(ctx, x - 1, y - 16, 2, 7, MD);
  // Monitor
  drawLCD(ctx, x, y - 22, 12, 8, tick);
  // Keyboard
  px(ctx, x - 5, y - 3, 10, 1, OL);
  px(ctx, x - 5, y,     10, 1, OL);
  px(ctx, x - 5, y - 3, 1, 4, OL);
  px(ctx, x + 4, y - 3, 1, 4, OL);
  px(ctx, x - 4, y - 2, 8, 2, MM);
  // Mouse
  px(ctx, x + 7, y - 2, 3, 3, ML);
  px(ctx, x + 7, y - 2, 3, 1, OL);
}

// chair → Simple Wooden Chair
function drawChair(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Legs
  px(ctx, x - 6, y, 2, 4, WD);
  px(ctx, x + 4, y, 2, 4, WD);
  // Seat
  px(ctx, x - 7, y - 7, 14, 7, WM);
  px(ctx, x - 7, y - 7, 14, 1, OL);  // seat top edge
  px(ctx, x - 7, y - 1, 14, 1, OL);  // seat bottom edge (overlaps front)
  px(ctx, x - 8, y - 7, 1, 7, OL);   // left
  px(ctx, x + 7, y - 7, 1, 7, OL);   // right
  // Cushion on seat
  px(ctx, x - 5, y - 6, 10, 4, '#D0996A');
  // Back rest
  px(ctx, x - 7, y - 18, 14, 12, WM);
  px(ctx, x - 8, y - 18, 1, 12, OL);
  px(ctx, x + 7, y - 18, 1, 12, OL);
  px(ctx, x - 7, y - 19, 14, 1, OL);
  px(ctx, x - 5, y - 17, 10, 8, '#D0996A');  // back cushion
}

// big_desk → Zeus's Grand Desk
function drawBigDesk(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  drawDeskSurface(ctx, x, y, 30, 14, '#E8D89A', '#8B6520');
  // Gold trim on front
  px(ctx, x - 15, y + 3, 30, 2, GLD);
  // Monitors (dual)
  px(ctx, x - 8, y - 16, 2, 8, MD);  // stand L
  px(ctx, x + 6, y - 16, 2, 8, MD);  // stand R
  drawLCD(ctx, x - 10, y - 22, 9, 7, tick);
  drawLCD(ctx, x + 10, y - 22, 9, 7, tick);
  // Lightning bolt gold accent (Zeus theme)
  if (tick % 80 < 60) {
    px(ctx, x - 2, y - 5, 1, 4, GLL);
    px(ctx, x - 1, y - 7, 2, 3, GLL);
    px(ctx, x,     y - 9, 2, 3, GLL);
  }
}

// monitor → Standalone LCD Monitor
function drawMonitor(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  px(ctx, x - 1, y - 8, 2, 8, MD);  // stand
  px(ctx, x - 4, y,     8, 2, MD);  // base
  drawLCD(ctx, x, y - 18, 14, 10, tick);
}

// floor_window → Skylight Window
function drawFloorWindow(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Frame
  px(ctx, x - 16, y - 36, 32, 32, OL);
  px(ctx, x - 15, y - 35, 30, 30, MBL);
  // Sky interior
  const skyA = tick % 200 < 100 ? '#B8E4FF' : '#D0EEFF';
  px(ctx, x - 13, y - 33, 26, 26, skyA);
  // Window cross frame
  px(ctx, x - 13, y - 20, 26, 2, MBL);  // horizontal
  px(ctx, x - 1, y - 33, 2, 26, MBL);   // vertical
  // Cloud puffs
  fillPixelEllipse(ctx, x + (tick % 80) / 5 - 8, y - 26, 5, 3, '#FFFFFF');
  fillPixelEllipse(ctx, x - (tick % 60) / 4 + 5, y - 18, 4, 2, '#FFFFFFB0');
}

// coffee_machine → Modern Coffee Maker
function drawCoffeeMachine(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Body outline + silver casing
  px(ctx, x - 7, y - 22, 14, 20, OL);
  px(ctx, x - 6, y - 21, 12, 18, MM);
  px(ctx, x - 6, y - 21, 12, 6, ML);   // bright top
  // Water tank (blue panel on side)
  px(ctx, x + 3, y - 20, 3, 12, '#4488CC');
  // Control buttons
  px(ctx, x - 4, y - 14, 3, 2, '#AA2020');   // power button red
  px(ctx, x - 4, y - 11, 3, 2, '#2060AA');   // mode button blue
  // Coffee outlet nozzle
  px(ctx, x - 2, y - 4, 4, 3, WD);
  // Steam animation
  if (tick % 40 < 30) {
    ctx.fillStyle = '#FFFFFF70';
    ctx.fillRect(x - 1, y - 26 - (tick % 12), 2, 3);
    ctx.fillRect(x + 2, y - 28 - ((tick + 6) % 10), 1, 2);
  }
}

// snack_shelf → Break Room Shelf
function drawSnackShelf(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Shelf frame
  px(ctx, x - 11, y - 32, 22, 28, OL);
  px(ctx, x - 10, y - 31, 20, 26, WM);
  // Shelf boards
  px(ctx, x - 9, y - 22, 18, 2, WD);
  px(ctx, x - 9, y - 12, 18, 2, WD);
  // Items on shelves — colorful snack boxes
  px(ctx, x - 8, y - 30, 5, 6, '#E03030');  // red box
  px(ctx, x - 2, y - 30, 4, 6, '#2060E0');  // blue box
  px(ctx, x + 3, y - 30, 5, 6, '#D0A020');  // yellow box
  px(ctx, x - 7, y - 20, 6, 6, '#30A040');  // green box
  px(ctx, x + 1, y - 20, 5, 6, '#CC4488');  // pink box
  px(ctx, x - 8, y - 10, 4, 6, '#8040CC');  // purple box
  px(ctx, x - 3, y - 10, 5, 6, '#E07020');  // orange box
  px(ctx, x + 3, y - 10, 5, 6, '#20A8AA');  // teal box
}

// water_cooler → Blue Water Dispenser
function drawWaterCooler(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Body outline
  px(ctx, x - 7, y - 26, 14, 24, OL);
  // White cabinet
  px(ctx, x - 6, y - 25, 12, 22, '#E8EAEC');
  // Blue water jug on top
  px(ctx, x - 5, y - 28, 10, 6, OL);
  px(ctx, x - 4, y - 27, 8, 5, '#4488CC');
  px(ctx, x - 3, y - 26, 6, 3, '#88CCEE');  // water highlight
  // Dispenser spigots
  px(ctx, x - 5, y - 14, 3, 3, '#C04040');  // hot (red)
  px(ctx, x + 2, y - 14, 3, 3, '#4040C0');  // cold (blue)
  // Cup holder ledge
  px(ctx, x - 5, y - 10, 10, 2, MD);
  // Water drip animation
  if (tick % 50 < 35) {
    ctx.fillStyle = '#88CCEEBB';
    ctx.fillRect(x - 4, y - 11 + (tick % 8), 1, 2);
  }
}

// small_table → Small Side Table
function drawSmallTable(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Legs
  px(ctx, x - 7, y, 2, 4, WD);
  px(ctx, x + 5, y, 2, 4, WD);
  // Table top surface
  drawDeskSurface(ctx, x, y - 4, 18, 8, WT, WM);
  // Small item on top (coffee cup)
  px(ctx, x - 2, y - 9, 4, 4, '#E0E0E0');  // cup
  px(ctx, x - 1, y - 10, 2, 1, OL);         // rim
}

// round_table → Round Meeting Table
function drawRoundTable(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Central leg
  px(ctx, x - 2, y - 4, 4, 4, WD);
  px(ctx, x - 4, y - 1, 8, 2, WD);  // foot brace
  // Round tabletop
  fillPixelEllipse(ctx, x, y - 10, 13, 8, OL);
  fillPixelEllipse(ctx, x, y - 10, 12, 7, WT);
  fillPixelEllipse(ctx, x - 3, y - 12, 6, 3, '#E4C890');  // highlight
}

// long_table → Conference Table
function drawLongTable(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Legs
  px(ctx, x - 11, y, 2, 4, WD);
  px(ctx, x + 9, y, 2, 4, WD);
  drawDeskSurface(ctx, x, y - 2, 28, 10, WT, WM);
}

// whiteboard_obj → Clean Whiteboard
function drawWhiteboard(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Frame
  px(ctx, x - 17, y - 36, 34, 28, OL);
  px(ctx, x - 16, y - 35, 32, 26, '#E0E0E0');  // aluminum frame
  // White board surface
  px(ctx, x - 14, y - 33, 28, 22, '#F8F8F6');
  // Marker lines (colored)
  drawPixelLine(ctx, x - 11, y - 28, x + 8, y - 28, '#E03030');
  drawPixelLine(ctx, x - 11, y - 24, x + 4, y - 24, '#3050C0');
  drawPixelLine(ctx, x - 11, y - 20, x + 6, y - 20, '#208040');
  // Animated marker dot
  if (tick % 60 < 40) {
    px(ctx, x + 8, y - 24, 2, 2, '#E03030');
  }
  // Tray at bottom
  px(ctx, x - 14, y - 11, 28, 4, '#B0B0B0');
  // Marker on tray
  px(ctx, x - 6, y - 10, 4, 2, '#E03030');
  px(ctx, x - 1, y - 10, 4, 2, '#3050C0');
}

// bookshelf → Bookshelf with Colorful Books
function drawBookshelf(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Shelf frame (dark wood)
  px(ctx, x - 13, y - 36, 26, 32, OL);
  px(ctx, x - 12, y - 35, 24, 30, WD);
  // Back panel
  px(ctx, x - 11, y - 34, 22, 28, '#6A4A28');
  // Shelf boards (horizontal)
  px(ctx, x - 12, y - 24, 24, 2, WM);
  px(ctx, x - 12, y - 14, 24, 2, WM);
  px(ctx, x - 12, y - 36, 24, 2, WM);  // top shelf

  // Books — 3 rows, each with colored spines
  const drawBookRow = (startY: number, count: number, offset: number) => {
    let bx = x - 11;
    for (let i = 0; i < count; i++) {
      const col = BOOK_COLORS[(i + offset) % BOOK_COLORS.length];
      const w = 3 + (i % 2);
      const h = 8 + (i % 3);
      px(ctx, bx, startY - h, w, h, col);
      px(ctx, bx, startY - h, w, 1, '#FFFFFF40');  // top highlight
      px(ctx, bx + w - 1, startY - h, 1, h, '#00000030');  // right shadow
      bx += w + 1;
      if (bx > x + 10) break;
    }
  };
  drawBookRow(y - 24, 6, 0);  // top shelf books
  drawBookRow(y - 14, 5, 3);  // mid shelf books
  drawBookRow(y - 4,  6, 5);  // bottom shelf books
}

// reading_chair → Cozy Reading Armchair
function drawReadingChair(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Frame
  px(ctx, x - 11, y - 22, 22, 20, OL);
  px(ctx, x - 10, y - 21, 20, 18, WM);
  // Seat cushion
  px(ctx, x - 8, y - 7, 16, 5, '#C08858');
  // Back cushion
  px(ctx, x - 8, y - 18, 16, 12, '#C08858');
  // Armrests
  px(ctx, x - 11, y - 14, 3, 8, '#9B6E45');
  px(ctx, x + 8, y - 14, 3, 8, '#9B6E45');
  // Armrest caps
  px(ctx, x - 12, y - 15, 5, 2, WT);
  px(ctx, x + 7, y - 15, 5, 2, WT);
  // Cushion buttons
  px(ctx, x - 2, y - 14, 2, 2, '#8B5535');
  px(ctx, x + 2, y - 14, 2, 2, '#8B5535');
}

// sofa → Stylish Office Sofa
function drawSofa(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Frame outline
  px(ctx, x - 17, y - 20, 34, 18, OL);
  // Sofa base (warm pink/cream)
  px(ctx, x - 16, y - 19, 32, 16, '#E08898');
  // Cushion divide line
  px(ctx, x, y - 19, 1, 16, '#C06878');
  // Cushion highlights
  px(ctx, x - 14, y - 18, 12, 6, '#ECA0A8');
  px(ctx, x + 2, y - 18, 12, 6, '#ECA0A8');
  // Back rest
  px(ctx, x - 16, y - 20, 32, 1, '#C06878');
  px(ctx, x - 16, y - 19, 32, 4, '#ECA0A8');
  // Armrests
  px(ctx, x - 19, y - 16, 4, 12, OL);
  px(ctx, x - 18, y - 15, 3, 10, '#E08898');
  px(ctx, x + 15, y - 16, 4, 12, OL);
  px(ctx, x + 16, y - 15, 3, 10, '#E08898');
  // Legs
  px(ctx, x - 13, y - 2, 3, 3, WD);
  px(ctx, x + 10, y - 2, 3, 3, WD);
}

// coffee_table → Low Glass Coffee Table
function drawCoffeeTable(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Legs
  px(ctx, x - 9, y, 2, 4, MD);
  px(ctx, x + 7, y, 2, 4, MD);
  // Table frame + glass top
  px(ctx, x - 10, y - 6, 20, 7, OL);
  px(ctx, x - 9,  y - 5, 18, 5, '#B8D8E8');  // glass
  px(ctx, x - 8,  y - 5, 8, 2, '#D8EEFA');   // glass highlight
}

// server_rack → Black Server Rack
function drawServerRack(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Main body
  px(ctx, x - 11, y - 38, 22, 36, OL);
  px(ctx, x - 10, y - 37, 20, 34, '#1A1A28');
  // Rack top cap
  px(ctx, x - 11, y - 38, 22, 3, MD);
  // Server units (1U rows)
  for (let i = 0; i < 5; i++) {
    const uy = y - 34 + i * 6;
    px(ctx, x - 9, uy, 18, 5, '#252535');       // unit body
    px(ctx, x - 8, uy + 1, 3, 3, '#303040');    // drive bay
    // Status LEDs
    const onA = ((tick + i * 11) % 24) < 18;
    const onB = ((tick + i *  7) % 30) < 22;
    px(ctx, x + 4, uy + 1, 2, 2, onA ? '#30FF70' : '#104020');  // green HDD
    px(ctx, x + 7, uy + 1, 2, 2, onB ? '#3080FF' : '#101840');  // blue net
    // Activity blink
    if (onA && tick % 8 < 4) {
      px(ctx, x + 4, uy + 1, 2, 2, '#80FFAA');
    }
  }
  // Vents at bottom
  for (let vx = x - 8; vx < x + 9; vx += 3) {
    px(ctx, vx, y - 4, 2, 2, '#303040');
  }
}

// potted_plant → Leafy Office Plant
function drawPottedPlant(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Pot outline + body
  px(ctx, x - 6, y - 10, 12, 10, OL);
  px(ctx, x - 5, y - 9, 10, 8, PT);
  px(ctx, x - 4, y - 9, 8, 3, '#C87850');  // pot highlight
  // Soil
  px(ctx, x - 4, y - 2, 8, 3, '#4A3020');
  // Stem
  px(ctx, x - 1, y - 18, 2, 9, '#3A5520');
  // Leaves — swaying with tick
  const sway = Math.sin(tick * 0.04) * 1.5;
  fillPixelEllipse(ctx, x + sway, y - 22, 6, 4, PG);
  fillPixelEllipse(ctx, x - 4 + sway * 0.5, y - 26, 5, 3, PM);
  fillPixelEllipse(ctx, x + 3 - sway * 0.5, y - 24, 4, 3, PM);
  fillPixelEllipse(ctx, x + sway * 0.3, y - 28, 3, 2, PH);
}

// carpet → Decorative Rug
function drawCarpet(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  const half = TILE_PX / 2 - 2;
  // Base rug
  ctx.fillStyle = '#7060A860';
  ctx.fillRect(x - half, y - half, half * 2, half * 2);
  // Border
  ctx.strokeStyle = '#5048789C';
  ctx.lineWidth = 2;
  ctx.strokeRect(x - half + 2, y - half + 2, half * 2 - 4, half * 2 - 4);
  // Inner diamond pattern
  ctx.strokeStyle = '#8878C060';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - half + 5, y - half + 5, half * 2 - 10, half * 2 - 10);
  // Center dot
  fillPixelEllipse(ctx, x, y, 3, 3, '#A898E050');
}

// wall_clock → Round Wall Clock
function drawWallClock(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Clock face
  fillPixelEllipse(ctx, x, y - 18, 9, 9, OL);
  fillPixelEllipse(ctx, x, y - 18, 8, 8, '#F0EEE8');
  // Hour markers
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const mx = x + Math.cos(a) * 7; const my = y - 18 + Math.sin(a) * 7;
    ctx.fillStyle = OL;
    ctx.fillRect(Math.round(mx), Math.round(my), 1, 1);
  }
  // Hands
  const hAngle = (tick * 0.002) % (Math.PI * 2);
  const mAngle = (tick * 0.01) % (Math.PI * 2);
  drawPixelLine(ctx, x, y - 18, x + Math.cos(hAngle - Math.PI/2) * 4, y - 18 + Math.sin(hAngle - Math.PI/2) * 4, OL);
  drawPixelLine(ctx, x, y - 18, x + Math.cos(mAngle - Math.PI/2) * 6, y - 18 + Math.sin(mAngle - Math.PI/2) * 6, '#C03030');
  // Center dot
  ctx.fillStyle = OL;
  ctx.fillRect(x, y - 18, 1, 1);
}

// poster → Framed Art Print
function drawPoster(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Frame
  px(ctx, x - 9, y - 30, 18, 22, OL);
  px(ctx, x - 8, y - 29, 16, 20, GLD);   // gold frame
  // Mat
  px(ctx, x - 7, y - 28, 14, 18, '#F5F5F0');
  // Art content — abstract geometric
  px(ctx, x - 5, y - 26, 10, 8, '#B0C8E0');  // sky blue bg
  px(ctx, x - 3, y - 22, 6, 6, '#E8A050');   // orange mountain
  px(ctx, x - 5, y - 20, 10, 4, '#4878C0');  // blue accent
  px(ctx, x - 5, y - 18, 10, 2, '#204898');  // darker blue
}

// meeting_chair → Office Meeting Chair
function drawMeetingChair(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Legs
  px(ctx, x - 5, y, 2, 4, MD);
  px(ctx, x + 3, y, 2, 4, MD);
  // Seat
  px(ctx, x - 6, y - 7, 12, 7, OL);
  px(ctx, x - 5, y - 6, 10, 5, '#6080C0');  // blue fabric seat
  px(ctx, x - 4, y - 6, 8, 2, '#80A0D8');   // seat highlight
  // Back rest
  px(ctx, x - 6, y - 16, 12, 10, OL);
  px(ctx, x - 5, y - 15, 10, 8, '#6080C0');
  px(ctx, x - 4, y - 14, 8, 4, '#80A0D8');  // back highlight
}

// door_mat → Welcome Mat
function drawDoorMat(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  const hw = 12; const hh = 7;
  // Mat outline
  px(ctx, x - hw - 1, y - hh - 1, hw*2 + 2, hh*2 + 2, OL);
  // Mat body
  px(ctx, x - hw, y - hh, hw*2, hh*2, '#5A4A38');
  // Stripe pattern
  px(ctx, x - hw + 2, y - hh + 2, hw*2 - 4, 2, '#7A6A58');
  px(ctx, x - hw + 2, y - hh + 6, hw*2 - 4, 2, '#7A6A58');
  px(ctx, x - hw + 2, y - hh + 10, hw*2 - 4, 2, '#7A6A58');
  // Edge fringe dots
  for (let fx = x - hw; fx < x + hw; fx += 3) {
    px(ctx, fx, y + hh, 1, 2, '#3A2A20');
    px(ctx, fx, y - hh - 2, 1, 2, '#3A2A20');
  }
}

// standing_desk → Height-Adjustable Standing Desk
function drawStandingDesk(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Metal legs
  px(ctx, x - 10, y - 18, 3, 18, MM);
  px(ctx, x + 7,  y - 18, 3, 18, MM);
  // Desk surface (elevated)
  drawDeskSurface(ctx, x, y - 18, 24, 10, WT, WM);
  // Monitor
  px(ctx, x - 1, y - 28, 2, 8, MD);
  drawLCD(ctx, x, y - 34, 12, 8, tick);
  // Keyboard on standing desk
  px(ctx, x - 5, y - 23, 10, 1, OL);
  px(ctx, x - 5, y - 20, 10, 1, OL);
  px(ctx, x - 5, y - 23, 1, 4, OL);
  px(ctx, x + 4, y - 23, 1, 4, OL);
  px(ctx, x - 4, y - 22, 8, 2, MM);
}

// dual_monitor → Dual Monitor Setup
function drawDualMonitor(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Stands
  px(ctx, x - 9, y - 12, 2, 8, MD);
  px(ctx, x + 7, y - 12, 2, 8, MD);
  // Left monitor
  drawLCD(ctx, x - 11, y - 20, 11, 9, tick);
  // Right monitor
  drawLCD(ctx, x + 11, y - 20, 11, 9, (tick + 15) % 60);
  // Center base plate
  px(ctx, x - 3, y - 4, 6, 2, MD);
}

// arcade_machine → Retro Arcade Cabinet
function drawArcadeMachine(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Cabinet body
  px(ctx, x - 9, y - 36, 18, 34, OL);
  px(ctx, x - 8, y - 35, 16, 32, '#1A1A30');
  // Cabinet top
  px(ctx, x - 7, y - 35, 14, 4, '#2A2A40');
  // Screen
  const scrC = tick % 30 < 20 ? '#40C070' : '#60E090';
  px(ctx, x - 6, y - 30, 12, 10, OL);
  px(ctx, x - 5, y - 29, 10, 8, SC);
  px(ctx, x - 4, y - 28, 8, 6, scrC);  // green gaming screen
  // Joystick + buttons
  px(ctx, x - 5, y - 17, 3, 3, '#808090');   // joystick base
  px(ctx, x - 4, y - 19, 2, 3, MM);           // joystick stick
  px(ctx, x, y - 18, 3, 3, '#E03030');        // red button
  px(ctx, x + 4, y - 18, 3, 3, '#3030E0');   // blue button
  // Coin slot
  px(ctx, x - 2, y - 8, 4, 2, '#505060');
  // Base
  px(ctx, x - 9, y - 2, 18, 2, '#252535');
}

// vending_machine → Modern Vending Machine
function drawVendingMachine(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Body outline + casing
  px(ctx, x - 11, y - 38, 22, 36, OL);
  px(ctx, x - 10, y - 37, 20, 34, '#1848A8');  // blue body
  px(ctx, x - 10, y - 37, 20, 6, '#143888');   // top darker
  // Glass display panel
  px(ctx, x - 8, y - 30, 16, 20, OL);
  px(ctx, x - 7, y - 29, 14, 18, '#6898D8');   // glass panel
  // Items visible behind glass (colored slots)
  const items = ['#E03030','#E0A020','#30C050','#3060E0','#C030A0'];
  for (let row2 = 0; row2 < 3; row2++) {
    for (let col2 = 0; col2 < 4; col2++) {
      px(ctx, x - 6 + col2 * 4, y - 27 + row2 * 6, 3, 4,
        items[(row2 * 4 + col2) % items.length]);
    }
  }
  // Payment panel
  px(ctx, x - 8, y - 9, 7, 6, '#102070');
  px(ctx, x - 6, y - 8, 5, 2, '#4468B0');   // buttons
  px(ctx, x - 6, y - 5, 5, 1, '#304888');
  // Coin slot
  px(ctx, x - 1, y - 9, 4, 3, '#102070');
  px(ctx, x, y - 8, 2, 1, '#000000');
  // Dispense tray
  px(ctx, x - 8, y - 2, 16, 4, '#1030A0');
  // Glow animation
  if (tick % 60 < 45) {
    ctx.fillStyle = '#6898D850';
    ctx.fillRect(x - 7, y - 28, 14, 16);
  }
}

// trophy_shelf → Awards & Trophy Shelf
function drawTrophyShelf(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Frame
  px(ctx, x - 11, y - 28, 22, 24, OL);
  px(ctx, x - 10, y - 27, 20, 22, WD);
  px(ctx, x - 9, y - 26, 18, 20, '#6A4A28');
  // Shelf board
  px(ctx, x - 9, y - 15, 18, 2, WM);
  // Gold trophy top
  fillPixelEllipse(ctx, x - 5, y - 24, 3, 2, GLD);
  px(ctx, x - 6, y - 23, 2, 1, GLL);
  px(ctx, x - 6, y - 22, 6, 4, GLD);
  px(ctx, x - 5, y - 18, 4, 3, WD);  // trophy base
  // Silver trophy
  fillPixelEllipse(ctx, x + 2, y - 24, 3, 2, '#C0C0C0');
  px(ctx, x + 1, y - 23, 2, 1, '#E0E0E0');
  px(ctx, x + 1, y - 22, 5, 4, '#C0C0C0');
  px(ctx, x + 2, y - 18, 3, 3, WD);
  // Small medals/ribbons on lower shelf
  px(ctx, x - 7, y - 12, 4, 4, GLD);
  px(ctx, x - 2, y - 12, 4, 4, '#C0C0C0');
  px(ctx, x + 4, y - 12, 4, 4, '#CD8032');
}

// aquarium → Office Fish Tank
function drawAquarium(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Tank frame (metal)
  px(ctx, x - 13, y - 24, 26, 20, OL);
  px(ctx, x - 12, y - 23, 24, 18, MM);
  // Water interior
  px(ctx, x - 11, y - 22, 22, 16, '#1A4A7A');
  // Water surface shimmer
  px(ctx, x - 11, y - 22, 22, 3, '#2A6AA8');
  if (tick % 30 < 20) {
    px(ctx, x - 8, y - 22, 6, 1, '#4A88C8');
    px(ctx, x + 2, y - 22, 5, 1, '#4A88C8');
  }
  // Fish animation
  const fx = x + Math.round(Math.sin(tick * 0.03) * 8);
  px(ctx, fx - 2, y - 16, 5, 3, '#FF8030');  // fish body
  px(ctx, fx + 3, y - 16, 2, 3, '#FF6010');  // tail
  px(ctx, fx - 2, y - 15, 1, 1, '#FFFFFF');  // fish eye
  // Second fish
  const fx2 = x + Math.round(Math.cos(tick * 0.04) * 7);
  px(ctx, fx2 - 2, y - 10, 4, 2, '#30C0FF');
  px(ctx, fx2 + 2, y - 10, 2, 2, '#20A0E0');
  // Gravel bottom
  for (let gx = x - 10; gx < x + 10; gx += 3) {
    px(ctx, gx, y - 7, 2, 2, '#7A8A6A');
  }
  // Bubbles
  if (tick % 20 < 14) {
    ctx.fillStyle = '#88CCEE70';
    ctx.fillRect(x - 5, y - 8 - (tick % 10), 2, 2);
    ctx.fillRect(x + 4, y - 6 - (tick % 12), 1, 1);
  }
}

// marble_round_table → Marble Meeting Table
function drawMarbleRoundTable(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Central pedestal
  px(ctx, x - 3, y - 4, 6, 4, MBD);
  px(ctx, x - 5, y - 1, 10, 2, MBD);
  // Round marble top (outlined)
  fillPixelEllipse(ctx, x, y - 12, 14, 8, OL);
  fillPixelEllipse(ctx, x, y - 12, 13, 7, MBL);
  // Marble surface sheen
  fillPixelEllipse(ctx, x - 4, y - 14, 5, 3, '#E8F2F5');
}

// cloud_seat → Floating Cloud Pillow
function drawCloudSeat(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  const floatY = y - 8 + Math.sin(tick * 0.03) * 1.5;
  ctx.save();
  // Shadow
  fillPixelEllipse(ctx, x, y + 2, 7, 3, 'rgba(12, 20, 35, 0.2)');
  // Cloud body
  ctx.globalAlpha = 0.9;
  fillPixelEllipse(ctx, x, floatY, 9, 5, '#E8EEFF');
  fillPixelEllipse(ctx, x - 5, floatY - 1, 5, 4, '#F0F2FF');
  fillPixelEllipse(ctx, x + 5, floatY - 1, 5, 4, '#F0F2FF');
  fillPixelEllipse(ctx, x, floatY - 4, 6, 4, '#FFFFFF');
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Greek Thematic Items — kept as Olympus concept, cleaner pixel art style
// ---------------------------------------------------------------------------

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

  // Base with outline
  px(ctx, x - Math.floor(spec.baseWidth/2) - 1, y - spec.baseDepth - 1, spec.baseWidth + 2, spec.baseDepth + 2, OL);
  px(ctx, x - Math.floor(spec.baseWidth/2), y - spec.baseDepth, spec.baseWidth, spec.baseDepth, MBD);
  px(ctx, x - Math.floor((spec.baseWidth-4)/2), y - spec.baseDepth - 3, spec.baseWidth - 4, 3, MBM);

  // Gold base ring
  px(ctx, x - Math.floor((spec.baseWidth-6)/2), y - spec.baseDepth - 5, spec.baseWidth - 6, 2, GLD);

  // Shaft (outlined)
  px(ctx, x - Math.floor(spec.shaftWidth/2) - 1, shaftTop - 1, spec.shaftWidth + 2, spec.shaftHeight + 2, OL);
  px(ctx, x - Math.floor(spec.shaftWidth/2), shaftTop, spec.shaftWidth, spec.shaftHeight, MBL);
  px(ctx, x - Math.floor(spec.shaftWidth/2), shaftTop, 2, spec.shaftHeight, MBM);  // left shadow
  px(ctx, x + Math.floor(spec.shaftWidth/2) - 2, shaftTop, 2, spec.shaftHeight, '#F5F9FC');  // right highlight

  // Fluting grooves
  for (let fx = x - Math.floor(spec.shaftWidth/2) + 2; fx < x + Math.floor(spec.shaftWidth/2) - 2; fx += spec.fluteStep) {
    px(ctx, fx, shaftTop + 2, 1, spec.shaftHeight - 4, MBM);
  }

  // Capital (top)
  px(ctx, x - Math.floor(spec.capWidth/2) - 1, shaftTop - spec.capHeight - 1, spec.capWidth + 2, spec.capHeight + 2, OL);
  px(ctx, x - Math.floor(spec.capWidth/2), shaftTop - spec.capHeight, spec.capWidth, spec.capHeight, '#EEE8DC');
  px(ctx, x - Math.floor((spec.capWidth+4)/2), shaftTop - spec.capHeight - 3, spec.capWidth + 4, 3, MBM);

  // Gold bands
  for (let i = 0; i < spec.goldBands; i++) {
    const bandY = shaftTop - spec.capHeight - 4 - i * 2;
    px(ctx, x - Math.floor((spec.capWidth+6)/2), bandY, spec.capWidth + 6, 1, i % 2 === 0 ? GLD : GLD2);
  }

  // Moving glint on shaft
  if (tick % 110 < 72) {
    const gx = x + (tick % 14) - 7;
    px(ctx, gx, shaftTop + 6, 1, Math.max(8, spec.shaftHeight - 18), '#FFFCF0');
  }

  return { topY: shaftTop };
}

// doric_column → Doric Column
function drawDoricColumn(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  drawColumnCore(ctx, x, y, tick, {
    baseWidth: 16, baseDepth: 5, shaftWidth: 8, shaftHeight: 20,
    fluteStep: 3, goldBands: 0, capWidth: 12, capHeight: 3,
  });
}

// temple_column → Grand Temple Column
function drawTempleColumn(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  const { topY } = drawColumnCore(ctx, x, y, tick, {
    baseWidth: 34, baseDepth: 10, shaftWidth: 18, shaftHeight: 58,
    fluteStep: 2, goldBands: 6, capWidth: 32, capHeight: 7,
  });

  // Dramatic pediment ornament
  for (let yy = 0; yy <= 11; yy++) {
    const half = 12 - yy;
    px(ctx, x - half, topY - 9 - yy, half * 2 + 1, 1, '#F4E8D6');
  }
  px(ctx, x - 2, topY - 15, 4, 2, GLL);
  px(ctx, x - 14, topY - 2, 28, 2, GLD);
  if (tick % 90 < 50) {
    px(ctx, x - 10, topY - 13, 2, 1, '#FFF3BF');
    px(ctx, x + 8,  topY - 11, 2, 1, '#FFF3BF');
  }
}

// marble_column → Polished Marble Column
function drawMarbleColumn(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  const { topY } = drawColumnCore(ctx, x, y, tick, {
    baseWidth: 20, baseDepth: 6, shaftWidth: 10, shaftHeight: 34,
    fluteStep: 3, goldBands: 1, capWidth: 16, capHeight: 3,
  });
  // Polish stripe
  px(ctx, x - 1, topY + 2, 1, 34, '#FFFDF8');
  px(ctx, x + 2, topY + 5, 1, 10, '#F1E2CA');
  if (tick % 120 < 84) {
    px(ctx, x + 1, topY + 10 + (tick % 12), 1, 4, GLL);
  }
}

// sacred_brazier → Sacred Fire Brazier
function drawSacredBrazier(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Stone stand
  px(ctx, x - 5, y - 14, 10, 12, OL);
  px(ctx, x - 4, y - 13, 8, 10, MBM);
  // Bronze bowl
  px(ctx, x - 9, y - 17, 18, 1, OL);
  px(ctx, x - 9, y - 16, 18, 4, '#CD8032');
  px(ctx, x - 7, y - 14, 14, 2, '#E0A050');  // bowl highlight
  // Flame (animated)
  const flameH = 6 + Math.sin(tick * 0.11) * 2;
  fillPixelEllipse(ctx, x, y - 18 - flameH * 0.5, 4, Math.round(flameH * 0.5), '#FFAB00');
  fillPixelEllipse(ctx, x, y - 18 - flameH * 0.5 + 1, 2, Math.round(flameH * 0.3), '#FF6D00');
  if (tick % 12 < 8) {
    px(ctx, x - 1, y - 20 - Math.round(flameH), 2, 2, '#FFEB3B');
  }
}

// god_statue → Olympian Deity Statue
function drawGodStatue(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Pedestal (outlined)
  px(ctx, x - 11, y - 9, 22, 9, OL);
  px(ctx, x - 10, y - 8, 20, 8, MBD);
  px(ctx, x - 9,  y - 11, 18, 3, MBM);
  px(ctx, x - 10, y - 12, 20, 1, GLD2);
  // Statue body
  px(ctx, x - 5, y - 32, 10, 22, OL);
  px(ctx, x - 4, y - 31, 8, 20, MBL);
  px(ctx, x - 3, y - 22, 1, 10, MBM);  // robe fold
  px(ctx, x + 2, y - 22, 1, 10, MBM);
  // Head
  px(ctx, x - 4, y - 37, 8, 6, OL);
  px(ctx, x - 3, y - 36, 6, 5, MBL);
  // Shoulders
  px(ctx, x - 8, y - 28, 4, 2, MBM);
  px(ctx, x + 4, y - 28, 4, 2, MBM);
  // Gold laurel crown
  px(ctx, x - 2, y - 38, 4, 1, GLD);
  px(ctx, x - 1, y - 39, 2, 1, GLL);
  // Halo glow
  if (tick % 120 < 60) {
    ctx.fillStyle = '#FFE7A330';
    for (let r = 0; r < 3; r++) {
      ctx.fillRect(x - 12 + r, y - 39 + r, 2, 2);
      ctx.fillRect(x + 10 - r, y - 37 + r, 2, 2);
    }
  }
}

// altar → Sacred Altar
function drawAltar(ctx: CanvasRenderingContext2D, col: number, row: number, tick: number): void {
  const { x, y } = gridToScreen({ col, row });
  // Altar block (outlined)
  px(ctx, x - 13, y - 15, 26, 13, OL);
  px(ctx, x - 12, y - 14, 24, 12, MBL);
  px(ctx, x - 11, y - 12, 22, 8, '#F2ECE0');
  // Top platform + gold trim
  px(ctx, x - 12, y - 15, 24, 2, MBM);
  px(ctx, x - 10, y - 16, 20, 1, GLD);
  // Central flame bowl
  px(ctx, x - 4, y - 19, 8, 4, '#C47838');
  px(ctx, x - 3, y - 18, 6, 2, '#E0A060');
  // Flame
  if (tick % 24 < 18) {
    px(ctx, x - 1, y - 22, 2, 3, '#FFAB00');
    px(ctx, x,     y - 24, 1, 2, '#FFEB3B');
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
  const { x, y } = gridToScreen({ col, row });
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(FURNITURE_SCALE, FURNITURE_SCALE);
  ctx.translate(-x, -y);

  switch (type) {
    case 'desk': drawDesk(ctx, col, row, tick); break;
    case 'chair': drawChair(ctx, col, row); break;
    case 'monitor': drawMonitor(ctx, col, row, tick); break;
    case 'keyboard': break; // drawn as part of desk
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
    default: break;
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Monitor Screen Overlay — drawn on top of desk monitors
// ---------------------------------------------------------------------------

export function drawMonitorScreen(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tick: number,
  state?: string,
): void {
  // Screen area on the desk monitor (positioned relative to desk center)
  const sx = x - 6;
  const sy = y - 36;
  const sw = 12;
  const sh = 8;

  switch (state) {
    case 'working': {
      ctx.fillStyle = '#0A1520';
      ctx.fillRect(sx, sy, sw, sh);
      // Animated code lines (gold/amber)
      for (let i = 0; i < 3; i++) {
        const w = 3 + ((tick + i * 5) % 6);
        ctx.fillStyle = '#88CCFF';
        ctx.fillRect(sx + 1, sy + 2 + i * 2, w, 1);
      }
      break;
    }
    case 'error': {
      ctx.fillStyle = '#1A0808';
      ctx.fillRect(sx, sy, sw, sh);
      ctx.fillStyle = '#FF4040';
      ctx.fillRect(sx + 3, sy + 2, 1, 4);
      ctx.fillRect(sx + sw - 4, sy + 2, 1, 4);
      ctx.fillRect(sx + 3, sy + 2, sw - 6, 1);
      ctx.fillRect(sx + 3, sy + sh - 2, sw - 6, 1);
      break;
    }
    case 'idle': {
      const bx = sx + 2 + Math.abs(Math.sin(tick * 0.05)) * (sw - 6);
      const by = sy + 2 + Math.abs(Math.cos(tick * 0.04)) * (sh - 4);
      ctx.fillStyle = '#08101C';
      ctx.fillRect(sx, sy, sw, sh);
      fillPixelEllipse(ctx, Math.round(bx), Math.round(by), 2, 2, SB);
      break;
    }
    case 'thinking': {
      ctx.fillStyle = '#0A1020';
      ctx.fillRect(sx, sy, sw, sh);
      const dotCount = 3;
      for (let i = 0; i < dotCount; i++) {
        const alpha = ((tick * 0.08 + i * 0.8) % 2) < 1 ? 1 : 0.3;
        ctx.globalAlpha = alpha;
        fillPixelEllipse(ctx, sx + 3 + i * 3, sy + 4, 1, 1, SL);
      }
      ctx.globalAlpha = 1;
      break;
    }
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Pegasus — tiny floating mascot (formerly Roomba)
// ---------------------------------------------------------------------------

export function drawRoomba(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tick: number,
): void {
  const floatY = y + Math.sin(tick * 0.09) * 0.8;
  ctx.save();
  fillPixelEllipse(ctx, x, y + 2, 4, 2, 'rgba(12, 20, 35, 0.2)');
  // White body
  fillPixelEllipse(ctx, x, floatY, 4, 3, '#FFFFFF');
  // Wings
  fillPixelEllipse(ctx, x - 4, floatY - 1, 2, 1, '#E8EEF7');
  fillPixelEllipse(ctx, x + 4, floatY - 1, 2, 1, '#E8EEF7');
  ctx.restore();
}
