/**
 * Context widget - displays progress bar, percentage, and token count
 */

import type { Widget } from './base.js';
import type { WidgetContext, ContextData } from '../types.js';
import { COLORS, RESET, getColorForPercent, colorize } from '../utils/colors.js';
import { formatTokens, calculatePercent } from '../utils/formatters.js';
import { renderProgressBar } from '../utils/progress-bar.js';

export const contextWidget: Widget<ContextData> = {
  id: 'context',
  name: 'Context',

  async getData(ctx: WidgetContext): Promise<ContextData | null> {
    const { context_window } = ctx.stdin;
    const usage = context_window?.current_usage;
    const contextSize = context_window?.context_window_size || 200000;

    if (!usage) {
      // Return default values when no usage data
      return {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        contextSize,
        percentage: 0,
      };
    }

    const inputTokens =
      usage.input_tokens +
      usage.cache_creation_input_tokens +
      usage.cache_read_input_tokens;
    const outputTokens = usage.output_tokens;
    const totalTokens = inputTokens + outputTokens;
    const percentage = calculatePercent(inputTokens, contextSize);

    return {
      inputTokens,
      outputTokens,
      totalTokens,
      contextSize,
      percentage,
    };
  },

  render(data: ContextData): string {
    // Progress bar + percentage only (token count shown in dashboard)
    const bar = renderProgressBar(data.percentage);
    const percentColor = getColorForPercent(data.percentage);
    return `${bar} ${colorize(`${data.percentage}%`, percentColor)}`;
  },
};
