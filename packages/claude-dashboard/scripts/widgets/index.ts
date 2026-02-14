/**
 * Widget registry and orchestrator
 */

import type { Widget, WidgetRenderResult } from './base.js';
import type {
  WidgetId,
  WidgetContext,
  Config,
} from '../types.js';
import { FIXED_LINES, SIDECAR_WIDGETS } from '../types.js';
import { COLORS, RESET } from '../utils/colors.js';
import { debugLog } from '../utils/debug.js';

// Widget imports
import { modelWidget } from './model.js';
import { contextWidget } from './context.js';
import { costWidget } from './cost.js';
import { rateLimit5hWidget, rateLimit7dWidget, rateLimit7dSonnetWidget } from './rate-limit.js';
import { projectInfoWidget } from './project-info.js';
import { configCountsWidget } from './config-counts.js';
import { sessionDurationWidget } from './session-duration.js';
import { toolActivityWidget } from './tool-activity.js';
import { agentStatusWidget } from './agent-status.js';
import { todoProgressWidget } from './todo-progress.js';
import { burnRateWidget } from './burn-rate.js';
import { depletionTimeWidget } from './depletion-time.js';
import { cacheHitWidget } from './cache-hit.js';
import { codexUsageWidget } from './codex-usage.js';
import { geminiUsageWidget } from './gemini-usage.js';
import { zaiUsageWidget } from './zai-usage.js';

/**
 * Widget registry - maps widget IDs to widget implementations
 */
const widgetRegistry = new Map<WidgetId, Widget>([
  ['model', modelWidget],
  ['context', contextWidget],
  ['cost', costWidget],
  ['rateLimit5h', rateLimit5hWidget],
  ['rateLimit7d', rateLimit7dWidget],
  ['rateLimit7dSonnet', rateLimit7dSonnetWidget],
  ['projectInfo', projectInfoWidget],
  ['configCounts', configCountsWidget],
  ['sessionDuration', sessionDurationWidget],
  ['toolActivity', toolActivityWidget],
  ['agentStatus', agentStatusWidget],
  ['todoProgress', todoProgressWidget],
  ['burnRate', burnRateWidget],
  ['depletionTime', depletionTimeWidget],
  ['cacheHit', cacheHitWidget],
  ['codexUsage', codexUsageWidget],
  ['geminiUsage', geminiUsageWidget],
  ['zaiUsage', zaiUsageWidget],
] as [WidgetId, Widget][]);

/**
 * Get widget by ID
 */
export function getWidget(id: WidgetId): Widget | undefined {
  return widgetRegistry.get(id);
}

/**
 * Get all registered widgets
 */
export function getAllWidgets(): Widget[] {
  return Array.from(widgetRegistry.values());
}

/**
 * Get fixed 3-line layout
 */
export function getLines(_config: Config): WidgetId[][] {
  return FIXED_LINES;
}

/**
 * Render a single widget
 */
async function renderWidget(
  widgetId: WidgetId,
  ctx: WidgetContext
): Promise<WidgetRenderResult | null> {
  const widget = getWidget(widgetId);
  if (!widget) {
    return null;
  }

  try {
    const data = await widget.getData(ctx);
    if (!data) {
      return null;
    }

    const output = widget.render(data, ctx);
    return { id: widgetId, output };
  } catch (error) {
    // Graceful degradation - skip failed widgets, but log for debugging
    debugLog('widget', `Widget '${widgetId}' failed`, error);
    return null;
  }
}

/**
 * Render a line of widgets
 */
async function renderLine(
  widgetIds: WidgetId[],
  ctx: WidgetContext
): Promise<string> {
  const results = await Promise.all(
    widgetIds.map((id) => renderWidget(id, ctx))
  );

  const separator = ` ${COLORS.dim}│${RESET} `;
  const outputs = results
    .filter((r): r is WidgetRenderResult => r !== null && r.output.length > 0)
    .map((r) => r.output);

  return outputs.join(separator);
}

/**
 * Render all lines based on configuration
 */
export async function renderAllLines(ctx: WidgetContext): Promise<string[]> {
  const lines = getLines(ctx.config);
  const renderedLines: string[] = [];

  for (const lineWidgets of lines) {
    const rendered = await renderLine(lineWidgets, ctx);
    if (rendered.length > 0) {
      renderedLines.push(rendered);
    }
  }

  return renderedLines;
}

/**
 * Format final output with multiple lines
 */
export async function formatOutput(ctx: WidgetContext): Promise<string> {
  const lines = await renderAllLines(ctx);
  return lines.join('\n');
}

/**
 * Collect raw data from all sidecar widgets for JSON export
 * Used by dashboard to display full 3-line usage info
 */
export async function collectAllWidgetData(
  ctx: WidgetContext
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = { timestamp: Date.now() };

  await Promise.all(
    SIDECAR_WIDGETS.map(async (id) => {
      const widget = getWidget(id);
      if (!widget) return;
      try {
        const data = await widget.getData(ctx);
        result[id] = data;
      } catch {
        result[id] = null;
      }
    })
  );

  return result;
}
