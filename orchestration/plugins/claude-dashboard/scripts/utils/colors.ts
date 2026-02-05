/**
 * ANSI color codes for terminal output
 */
export const COLORS = {
  // Reset
  reset: '\x1b[0m',

  // Styles
  dim: '\x1b[2m',
  bold: '\x1b[1m',

  // Foreground colors (standard ANSI 16)
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Bright variants
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightCyan: '\x1b[96m',

  // Pastel colors (256-color mode)
  pastelYellow: '\x1b[38;5;222m',  // Cream/soft yellow - for folders, cost
  pastelCyan: '\x1b[38;5;117m',    // Soft cyan - for model
  pastelPink: '\x1b[38;5;218m',    // Soft pink - for git branch
  pastelGreen: '\x1b[38;5;151m',   // Mint green - for positive/safe status
  pastelOrange: '\x1b[38;5;216m',  // Soft orange - for warning status
  pastelRed: '\x1b[38;5;210m',     // Soft coral - for danger status
  pastelGray: '\x1b[38;5;249m',    // Light gray - for secondary info
} as const;

export const RESET = COLORS.reset;

/**
 * Get color based on percentage (for progress bar and rate limits)
 * 0-50%: pastelGreen (safe)
 * 51-80%: pastelYellow (warning)
 * 81-100%: pastelRed (danger)
 */
export function getColorForPercent(percent: number): string {
  if (percent <= 50) return COLORS.pastelGreen;
  if (percent <= 80) return COLORS.pastelYellow;
  return COLORS.pastelRed;
}

/**
 * Wrap text with color and auto-reset
 */
export function colorize(text: string, color: string): string {
  return `${color}${text}${RESET}`;
}
