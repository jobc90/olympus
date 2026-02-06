import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { loadConfig, saveConfig } from '@olympus-dev/core';

export interface ModelPrefs {
  geminiFlash?: string;
  geminiPro?: string;
  geminiFallbackFlash?: string;
  geminiFallbackPro?: string;
  codex?: string;
}

const MCP_CREDENTIALS_PATH = join(homedir(), '.claude', 'mcps', 'ai-agents', 'credentials.json');

export function readMcpCredentials(): Record<string, unknown> {
  try {
    if (!existsSync(MCP_CREDENTIALS_PATH)) return {};
    return JSON.parse(readFileSync(MCP_CREDENTIALS_PATH, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function writeMcpCredentials(data: Record<string, unknown>): void {
  const dir = join(homedir(), '.claude', 'mcps', 'ai-agents');
  mkdirSync(dir, { recursive: true });
  writeFileSync(MCP_CREDENTIALS_PATH, JSON.stringify(data, null, 2));
}

export function extractMcpModels(raw: Record<string, unknown>): ModelPrefs {
  const models = (raw.models ?? {}) as Record<string, unknown>;
  return {
    geminiFlash: typeof models.geminiFlash === 'string' ? models.geminiFlash : undefined,
    geminiPro: typeof models.geminiPro === 'string' ? models.geminiPro : undefined,
    geminiFallbackFlash: typeof models.geminiFallbackFlash === 'string' ? models.geminiFallbackFlash : undefined,
    geminiFallbackPro: typeof models.geminiFallbackPro === 'string' ? models.geminiFallbackPro : undefined,
    codex: typeof models.codex === 'string' ? models.codex : undefined,
  };
}

export function mergePrefs(primary: ModelPrefs, secondary: ModelPrefs): ModelPrefs {
  return {
    geminiFlash: primary.geminiFlash ?? secondary.geminiFlash,
    geminiPro: primary.geminiPro ?? secondary.geminiPro,
    geminiFallbackFlash: primary.geminiFallbackFlash ?? secondary.geminiFallbackFlash,
    geminiFallbackPro: primary.geminiFallbackPro ?? secondary.geminiFallbackPro,
    codex: primary.codex ?? secondary.codex,
  };
}

export async function getCoreModelPrefs(): Promise<ModelPrefs> {
  const core = await loadConfig();
  return {
    geminiFlash: core.gemini.defaultModel,
    geminiPro: core.gemini.proModel,
    geminiFallbackFlash: core.gemini.fallbackModel,
    geminiFallbackPro: core.gemini.fallbackProModel,
    codex: core.codex.defaultModel,
  };
}

export async function syncModelPrefs(target: ModelPrefs): Promise<void> {
  const core = await loadConfig();
  const nextGemini = {
    ...core.gemini,
    ...(target.geminiFlash ? { defaultModel: target.geminiFlash } : {}),
    ...(target.geminiPro ? { proModel: target.geminiPro } : {}),
    ...(target.geminiFallbackFlash ? { fallbackModel: target.geminiFallbackFlash } : {}),
    ...(target.geminiFallbackPro ? { fallbackProModel: target.geminiFallbackPro } : {}),
  };
  const nextCodex = {
    ...core.codex,
    ...(target.codex ? { defaultModel: target.codex } : {}),
  };

  await saveConfig({
    gemini: nextGemini,
    codex: nextCodex,
    gpt: {
      ...(core.gpt ?? core.codex),
      defaultModel: nextCodex.defaultModel,
      apiBaseUrl: nextCodex.apiBaseUrl,
    },
  });

  const creds = readMcpCredentials();
  const prevModels = extractMcpModels(creds);
  const merged = mergePrefs(target, prevModels);
  writeMcpCredentials({
    ...creds,
    models: {
      ...((creds.models as Record<string, unknown>) ?? {}),
      ...(merged.geminiFlash ? { geminiFlash: merged.geminiFlash } : {}),
      ...(merged.geminiPro ? { geminiPro: merged.geminiPro } : {}),
      ...(merged.geminiFallbackFlash ? { geminiFallbackFlash: merged.geminiFallbackFlash } : {}),
      ...(merged.geminiFallbackPro ? { geminiFallbackPro: merged.geminiFallbackPro } : {}),
      ...(merged.codex ? { codex: merged.codex } : {}),
    },
  });
}
