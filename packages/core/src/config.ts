import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { OlympusConfig, Credentials } from './types.js';

const DEFAULT_CONFIG_DIR = join(homedir(), '.olympus');

export const DEFAULT_CONFIG: OlympusConfig = {
  configDir: DEFAULT_CONFIG_DIR,
  defaultAgents: ['gemini', 'gpt'],
  gemini: {
    defaultModel: 'gemini-3-flash-preview',
    proModel: 'gemini-3-pro-preview',
    fallbackModel: 'gemini-2.5-flash',
    fallbackProModel: 'gemini-2.5-pro',
  },
  gpt: {
    defaultModel: 'gpt-4o',
    apiBaseUrl: 'https://api.openai.com/v1',
  },
  webPort: 4200,
};

export async function ensureConfigDir(configDir: string = DEFAULT_CONFIG_DIR): Promise<void> {
  await mkdir(configDir, { recursive: true });
}

export async function loadConfig(configDir: string = DEFAULT_CONFIG_DIR): Promise<OlympusConfig> {
  try {
    const configPath = join(configDir, 'config.json');
    const raw = await readFile(configPath, 'utf-8');
    const userConfig = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...userConfig, configDir };
  } catch {
    return { ...DEFAULT_CONFIG, configDir };
  }
}

export async function saveConfig(config: Partial<OlympusConfig>, configDir: string = DEFAULT_CONFIG_DIR): Promise<void> {
  await ensureConfigDir(configDir);
  const configPath = join(configDir, 'config.json');
  const existing = await loadConfig(configDir);
  const merged = { ...existing, ...config };
  await writeFile(configPath, JSON.stringify(merged, null, 2), 'utf-8');
}

export async function loadCredentials(configDir: string = DEFAULT_CONFIG_DIR): Promise<Credentials> {
  try {
    const credPath = join(configDir, 'credentials.json');
    const raw = await readFile(credPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function saveCredentials(creds: Credentials, configDir: string = DEFAULT_CONFIG_DIR): Promise<void> {
  await ensureConfigDir(configDir);
  const credPath = join(configDir, 'credentials.json');
  await writeFile(credPath, JSON.stringify(creds, null, 2), { mode: 0o600 });
}
