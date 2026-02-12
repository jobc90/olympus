// ============================================================================
// Configuration Management — Olympus Dashboard
// ============================================================================

import type {
  DashboardConfig,
  WorkerConfig,
  CodexConfig,
  GeminiConfig,
  GatewayConfig,
  ThemeName,
  WorkerAvatar,
  CodexAvatar,
  GeminiAvatar,
} from './types';

export type { DashboardConfig, WorkerConfig, CodexConfig, GeminiConfig, GatewayConfig, ThemeName, WorkerAvatar, CodexAvatar, GeminiAvatar };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_WORKERS = 6;

export const WORKER_COLOR_PALETTE = [
  '#4FC3F7', // blue
  '#FF7043', // orange
  '#66BB6A', // green
  '#AB47BC', // purple
  '#FFCA28', // yellow
  '#EF5350', // red
];

export const AVATAR_OPTIONS: WorkerAvatar[] = ['athena', 'poseidon', 'ares', 'apollo', 'artemis', 'hermes', 'hephaestus', 'dionysus', 'demeter', 'aphrodite', 'hera', 'hades', 'persephone', 'prometheus', 'helios', 'nike', 'pan', 'hecate', 'iris', 'heracles', 'selene'];
export const CODEX_AVATAR_OPTIONS: CodexAvatar[] = ['zeus'];
export const GEMINI_AVATAR_OPTIONS: GeminiAvatar[] = ['hera'];

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_GATEWAY: GatewayConfig = {
  url: 'http://localhost:18789',
  token: '',
};

export const DEFAULT_CODEX: CodexConfig = {
  name: 'Zeus',
  emoji: '\u26A1',
  avatar: 'zeus',
};

export const DEFAULT_GEMINI: GeminiConfig = {
  name: 'Hera',
  emoji: '\u{1F451}',
  avatar: 'hera',
};

export const DEFAULT_WORKERS: WorkerConfig[] = [
  { id: 'atlas', name: 'Poseidon', emoji: '\u{1F531}', color: '#4FC3F7', avatar: 'poseidon' },
  { id: 'nova', name: 'Ares', emoji: '\u2694\uFE0F', color: '#FF7043', avatar: 'ares' },
  { id: 'spark', name: 'Apollo', emoji: '\u2600\uFE0F', color: '#66BB6A', avatar: 'apollo' },
];

export const DEFAULT_CONFIG: DashboardConfig = {
  workers: DEFAULT_WORKERS,
  codex: DEFAULT_CODEX,
  gemini: DEFAULT_GEMINI,
  gateway: DEFAULT_GATEWAY,
  theme: 'midnight',
  connected: false,
  demoMode: true,
};

// ---------------------------------------------------------------------------
// localStorage Persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'olympus-dashboard-config';

/** Load config from localStorage, falling back to defaults */
export function loadConfig(): DashboardConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_CONFIG };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return applyUrlParams({ ...DEFAULT_CONFIG });
    const parsed = JSON.parse(raw) as Partial<DashboardConfig>;
    const config: DashboardConfig = {
      workers: Array.isArray(parsed.workers) ? parsed.workers.slice(0, MAX_WORKERS) : DEFAULT_CONFIG.workers,
      codex: parsed.codex ?? DEFAULT_CONFIG.codex,
      gemini: (parsed as Record<string, unknown>).gemini as DashboardConfig['gemini'] ?? DEFAULT_GEMINI,
      gateway: parsed.gateway ?? DEFAULT_CONFIG.gateway,
      theme: parsed.theme ?? DEFAULT_CONFIG.theme,
      connected: false,
      demoMode: parsed.demoMode ?? true,
    };
    return applyUrlParams(config);
  } catch {
    return applyUrlParams({ ...DEFAULT_CONFIG });
  }
}

/** Save config to localStorage */
export function saveConfig(config: DashboardConfig): void {
  if (typeof window === 'undefined') return;
  const serializable = {
    workers: config.workers,
    codex: config.codex,
    gemini: config.gemini,
    gateway: config.gateway,
    theme: config.theme,
    demoMode: config.demoMode,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
}

/** Clear stored config */
export function clearConfig(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

/** Export config as JSON string */
export function exportConfig(config: DashboardConfig): string {
  return JSON.stringify({
    workers: config.workers,
    codex: config.codex,
    gemini: config.gemini,
    gateway: config.gateway,
    theme: config.theme,
  }, null, 2);
}

/** Import config from JSON string */
export function importConfig(json: string): DashboardConfig | null {
  try {
    const parsed = JSON.parse(json);
    if (!parsed.workers || !parsed.codex) return null;
    return {
      workers: parsed.workers,
      codex: parsed.codex,
      gemini: parsed.gemini ?? DEFAULT_GEMINI,
      gateway: parsed.gateway ?? DEFAULT_GATEWAY,
      theme: parsed.theme ?? 'midnight',
      connected: false,
      demoMode: true,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// URL parameter overrides
// ---------------------------------------------------------------------------

function applyUrlParams(config: DashboardConfig): DashboardConfig {
  if (typeof window === 'undefined') return config;
  try {
    const params = new URLSearchParams(window.location.search);
    const gateway = params.get('gateway');
    const token = params.get('token');
    if (gateway) {
      config.gateway.url = gateway;
      config.demoMode = false;
    }
    if (token) {
      config.gateway.token = token;
    }
  } catch {
    // ignore
  }
  return config;
}

// ---------------------------------------------------------------------------
// Mutation helpers (return new config objects for React state)
// ---------------------------------------------------------------------------

export function updateGateway(config: DashboardConfig, gw: Partial<GatewayConfig>): DashboardConfig {
  return { ...config, gateway: { ...config.gateway, ...gw } };
}

export function updateCodex(config: DashboardConfig, codex: Partial<CodexConfig>): DashboardConfig {
  return { ...config, codex: { ...config.codex, ...codex } };
}

export function updateTheme(config: DashboardConfig, theme: ThemeName): DashboardConfig {
  return { ...config, theme };
}

export function addWorker(config: DashboardConfig, worker: WorkerConfig): DashboardConfig {
  if (config.workers.length >= MAX_WORKERS) return config;
  return { ...config, workers: [...config.workers, worker] };
}

export function removeWorker(config: DashboardConfig, id: string): DashboardConfig {
  return { ...config, workers: config.workers.filter(w => w.id !== id) };
}

export function updateWorker(config: DashboardConfig, id: string, patch: Partial<WorkerConfig>): DashboardConfig {
  return {
    ...config,
    workers: config.workers.map(w => (w.id === id ? { ...w, ...patch } : w)),
  };
}
