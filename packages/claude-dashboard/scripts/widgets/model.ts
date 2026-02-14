/**
 * Model widget - displays current Claude model name
 */

import type { Widget } from './base.js';
import type { WidgetContext, ModelData } from '../types.js';
import { COLORS, RESET } from '../utils/colors.js';
import { shortenModelName } from '../utils/formatters.js';
import { isZaiProvider } from '../utils/provider.js';

export const modelWidget: Widget<ModelData> = {
  id: 'model',
  name: 'Model',

  async getData(ctx: WidgetContext): Promise<ModelData | null> {
    const { model } = ctx.stdin;

    return {
      id: model?.id || '',
      displayName: model?.display_name || '-',
    };
  },

  render(data: ModelData): string {
    const shortName = shortenModelName(data.displayName);
    // z.ai/ZHIPU uses orange circle, Anthropic uses robot emoji
    const icon = isZaiProvider() ? '🟠' : '🤖';
    return `${COLORS.pastelCyan}${icon} ${shortName}${RESET}`;
  },
};
