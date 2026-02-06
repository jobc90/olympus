import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { IncomingMessage, ServerResponse } from 'node:http';

const CONFIG_DIR = join(homedir(), '.olympus');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export interface TelegramConfig {
  token: string;
  allowedUsers: number[];
}

export interface OlympusClientConfig {
  apiKey: string;
  gatewayUrl: string;
  gatewayHost: string;
  gatewayPort: number;
  telegram?: TelegramConfig;
}

/**
 * Ensure config directory exists
 */
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Generate a new API key
 */
export function generateApiKey(): string {
  return `oly_${randomBytes(24).toString('hex')}`;
}

/**
 * Get default config
 */
function getDefaultConfig(): OlympusClientConfig {
  return {
    apiKey: generateApiKey(),
    gatewayUrl: 'http://127.0.0.1:18790',
    gatewayHost: '127.0.0.1',
    gatewayPort: 18790,
  };
}

/**
 * Load client configuration
 */
export function loadConfig(): OlympusClientConfig {
  ensureConfigDir();

  if (!existsSync(CONFIG_FILE)) {
    const config = getDefaultConfig();
    saveConfig(config);
    return config;
  }

  try {
    const content = readFileSync(CONFIG_FILE, 'utf-8');
    const loaded = JSON.parse(content) as OlympusClientConfig;

    // Ensure all fields exist (migration for older configs)
    return {
      ...getDefaultConfig(),
      ...loaded,
    };
  } catch {
    // If config is corrupted, regenerate
    const config = getDefaultConfig();
    saveConfig(config);
    return config;
  }
}

/**
 * Save client configuration
 */
export function saveConfig(config: OlympusClientConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Update specific fields in config
 */
export function updateConfig(updates: Partial<OlympusClientConfig>): OlympusClientConfig {
  const config = loadConfig();
  const updated = { ...config, ...updates };
  saveConfig(updated);
  return updated;
}

/**
 * Check if Telegram is configured
 */
export function isTelegramConfigured(): boolean {
  const config = loadConfig();
  return !!(config.telegram?.token && config.telegram.allowedUsers.length > 0);
}

/**
 * Validate an API key
 */
export function validateApiKey(providedKey: string | undefined): boolean {
  if (!providedKey) return false;

  const config = loadConfig();
  return providedKey === config.apiKey;
}

/**
 * Extract API key from HTTP request
 */
export function extractApiKey(req: IncomingMessage): string | undefined {
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Backward compatibility for older dashboard clients.
  const legacyHeader = req.headers['x-api-key'];
  if (typeof legacyHeader === 'string') {
    return legacyHeader;
  }

  return undefined;
}

/**
 * HTTP middleware for API key authentication
 * Returns true if authenticated, false otherwise (and sends 401 response)
 */
export function authMiddleware(req: IncomingMessage, res: ServerResponse): boolean {
  const apiKey = extractApiKey(req);

  if (!validateApiKey(apiKey)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized', message: 'Invalid or missing API key' }));
    return false;
  }

  return true;
}

/**
 * Validate API key from WebSocket connect payload
 */
export function validateWsApiKey(apiKey: string | undefined): boolean {
  return validateApiKey(apiKey);
}

/**
 * Get config directory path
 */
export function getConfigDir(): string {
  return CONFIG_DIR;
}

/**
 * Get config file path
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}
