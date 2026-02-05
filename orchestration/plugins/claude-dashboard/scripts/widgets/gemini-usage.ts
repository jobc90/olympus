/**
 * Gemini usage widget - displays Google Gemini CLI usage limits
 * Shows model and usage percentage in a single line
 */

import type { Widget } from './base.js';
import type { WidgetContext, GeminiUsageData, Translations } from '../types.js';
import { COLORS, getColorForPercent, colorize } from '../utils/colors.js';
import { isGeminiInstalled, fetchGeminiUsage } from '../utils/gemini-client.js';
import { formatTimeRemaining } from '../utils/formatters.js';
import { debugLog } from '../utils/debug.js';

/**
 * Format usage with optional reset time
 */
function formatUsage(
  percent: number,
  resetAt: string | null,
  t: Translations
): string {
  const color = getColorForPercent(percent);
  let result = colorize(`${Math.round(percent)}%`, color);

  if (resetAt) {
    const resetTime = formatTimeRemaining(new Date(resetAt), t);
    if (resetTime) {
      result += ` (${resetTime})`;
    }
  }

  return result;
}

export const geminiUsageWidget: Widget<GeminiUsageData> = {
  id: 'geminiUsage',
  name: 'Gemini Usage',

  async getData(ctx: WidgetContext): Promise<GeminiUsageData | null> {
    const installed = await isGeminiInstalled();
    debugLog('gemini', 'isGeminiInstalled:', installed);
    if (!installed) {
      return null;
    }

    const limits = await fetchGeminiUsage(ctx.config.cache.ttlSeconds);
    debugLog('gemini', 'fetchGeminiUsage result:', limits);
    if (!limits) {
      // Return error state instead of null to show ⚠️ indicator
      return {
        model: 'gemini',
        usedPercent: null,
        resetAt: null,
        isError: true,
      };
    }

    return {
      model: limits.model,
      usedPercent: limits.usedPercent,
      resetAt: limits.resetAt,
    };
  },

  render(data: GeminiUsageData, ctx: WidgetContext): string {
    const { translations: t } = ctx;
    const parts: string[] = [];

    // Gemini icon (diamond) + model name
    parts.push(`${colorize('💎', COLORS.cyan)} ${data.model}`);

    // Show error indicator or usage percentage
    if (data.isError) {
      parts.push(colorize('⚠️', COLORS.yellow));
    } else if (data.usedPercent !== null) {
      parts.push(formatUsage(data.usedPercent, data.resetAt, t));
    }

    return parts.join(` ${colorize('│', COLORS.dim)} `);
  },
};
