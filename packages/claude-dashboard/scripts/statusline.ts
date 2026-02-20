#!/usr/bin/env node

/**
 * Claude Dashboard Status Line
 * Displays model info, context usage, rate limits, and more
 */

import { readFile, stat, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

import type { StdinInput, Config, WidgetContext } from './types.js';
import { DEFAULT_CONFIG } from './types.js';
import { COLORS, colorize } from './utils/colors.js';
import { fetchUsageLimits } from './utils/api-client.js';
import { getTranslations } from './utils/i18n.js';
import { formatOutput, collectAllWidgetData } from './widgets/index.js';

const CONFIG_PATH = join(homedir(), '.claude', 'claude-dashboard.local.json');
const SIDECAR_DIR = join(homedir(), '.olympus');
const SIDECAR_PATH = join(SIDECAR_DIR, 'statusline.json');

/**
 * Cached config with mtime-based invalidation
 */
let configCache: {
  config: Config;
  mtime: number;
} | null = null;

/**
 * Read and parse stdin JSON
 */
async function readStdin(): Promise<StdinInput | null> {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.from(chunk));
    }
    const content = Buffer.concat(chunks).toString('utf-8');
    return JSON.parse(content) as StdinInput;
  } catch {
    return null;
  }
}

/**
 * Load user configuration with mtime-based cache
 */
async function loadConfig(): Promise<Config> {
  try {
    // Check mtime for cache invalidation
    const fileStat = await stat(CONFIG_PATH);
    const mtime = fileStat.mtimeMs;

    // Return cached if mtime matches
    if (configCache?.mtime === mtime) {
      return configCache.config;
    }

    const content = await readFile(CONFIG_PATH, 'utf-8');
    const userConfig = JSON.parse(content);

    const config: Config = {
      ...DEFAULT_CONFIG,
      ...userConfig,
    };

    // Cache result
    configCache = { config, mtime };
    return config;
  } catch {
    return DEFAULT_CONFIG;
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  // Load configuration
  const config = await loadConfig();

  // Get translations
  const translations = getTranslations(config);

  // Read stdin
  const stdin = await readStdin();
  if (!stdin) {
    console.log(colorize('⚠️', COLORS.yellow));
    return;
  }

  // Fetch rate limits (uses cache)
  const rateLimits = await fetchUsageLimits(config.cache.ttlSeconds);

  // Create widget context
  const ctx: WidgetContext = {
    stdin,
    config,
    translations,
    rateLimits,
  };

  // Format output using widget system
  const output = await formatOutput(ctx);

  console.log(output);

  // Write sidecar JSON for Olympus dashboard (fire-and-forget)
  collectAllWidgetData(ctx)
    .then(async (data) => {
      await mkdir(SIDECAR_DIR, { recursive: true });
      await writeFile(SIDECAR_PATH, JSON.stringify(data), { mode: 0o600 });
    })
    .catch(() => {});
}

// Run
main().catch(() => {
  console.log(colorize('⚠️', COLORS.yellow));
});
