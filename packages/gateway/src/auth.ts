import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AgentConfig, WorkerConfig, MemoryConfig, SecurityConfig } from '@olympus-dev/protocol';
import { DEFAULT_AGENT_CONFIG, DEFAULT_WORKER_CONFIG, DEFAULT_MEMORY_CONFIG, DEFAULT_SECURITY_CONFIG } from '@olympus-dev/protocol';

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
  // V2 config sections
  configVersion?: number;
  agent?: Partial<AgentConfig>;
  worker?: Partial<WorkerConfig>;
  memory?: Partial<MemoryConfig>;
  security?: Partial<SecurityConfig>;
}

/**
 * Resolved V2 config with all defaults applied
 */
export interface ResolvedV2Config {
  agent: AgentConfig;
  worker: WorkerConfig;
  memory: MemoryConfig;
  security: SecurityConfig;
}

/**
 * Resolve V2 config sections from partial user config + defaults
 */
export function resolveV2Config(config: OlympusClientConfig): ResolvedV2Config {
  return {
    agent: { ...DEFAULT_AGENT_CONFIG, ...config.agent },
    worker: { ...DEFAULT_WORKER_CONFIG, ...config.worker },
    memory: { ...DEFAULT_MEMORY_CONFIG, ...config.memory },
    security: { ...DEFAULT_SECURITY_CONFIG, ...config.security },
  };
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
    gatewayUrl: 'http://127.0.0.1:8200',
    gatewayHost: '127.0.0.1',
    gatewayPort: 8200,
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
    const merged = {
      ...getDefaultConfig(),
      ...loaded,
    };

    // Auto-migrate to v2 if needed
    if (!merged.configVersion || merged.configVersion < 2) {
      merged.configVersion = 2;
      saveConfig(merged);
    }

    return merged;
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
