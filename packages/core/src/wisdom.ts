import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { WisdomEntry } from './types.js';
import { ensureConfigDir } from './config.js';
import { homedir } from 'os';

const WISDOM_PATH = join(homedir(), '.olympus', 'wisdom.json');

export async function loadWisdom(): Promise<WisdomEntry[]> {
  try {
    const raw = await readFile(WISDOM_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function addWisdom(entry: Omit<WisdomEntry, 'id' | 'timestamp'>): Promise<WisdomEntry> {
  await ensureConfigDir();
  const entries = await loadWisdom();
  const newEntry: WisdomEntry = {
    ...entry,
    id: `wisdom-${Date.now()}`,
    timestamp: new Date().toISOString(),
  };
  entries.push(newEntry);
  await writeFile(WISDOM_PATH, JSON.stringify(entries, null, 2), 'utf-8');
  return newEntry;
}
