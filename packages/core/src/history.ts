import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { HistoryEntry, MergedResult } from './types.js';
import { ensureConfigDir } from './config.js';
import { homedir } from 'os';

const HISTORY_PATH = join(homedir(), '.olympus', 'history.json');
const MAX_HISTORY = 100;

export async function loadHistory(): Promise<HistoryEntry[]> {
  try {
    const raw = await readFile(HISTORY_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function addHistory(prompt: string, result: MergedResult): Promise<HistoryEntry> {
  await ensureConfigDir();
  const entries = await loadHistory();
  const entry: HistoryEntry = {
    id: `run-${Date.now()}`,
    prompt,
    result,
    timestamp: new Date().toISOString(),
  };
  entries.push(entry);
  // Keep only last MAX_HISTORY entries
  const trimmed = entries.slice(-MAX_HISTORY);
  await writeFile(HISTORY_PATH, JSON.stringify(trimmed, null, 2), 'utf-8');
  return entry;
}
