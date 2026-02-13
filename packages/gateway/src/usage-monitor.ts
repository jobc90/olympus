import { readFile, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { EventEmitter } from 'events';
import type { StatuslineUsageData } from '@olympus-dev/protocol';

const SIDECAR_PATH = join(homedir(), '.olympus', 'statusline.json');
const POLL_INTERVAL_MS = 10_000;

/**
 * Monitors the statusline sidecar JSON file and emits updates.
 * The CLI plugin writes widget data to ~/.olympus/statusline.json,
 * and this monitor polls it for the dashboard.
 */
export class UsageMonitor extends EventEmitter {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastMtime = 0;
  private cachedData: StatuslineUsageData | null = null;

  start(): void {
    this.poll();
    this.timer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getData(): StatuslineUsageData | null {
    return this.cachedData;
  }

  private async poll(): Promise<void> {
    try {
      const s = await stat(SIDECAR_PATH);
      if (s.mtimeMs === this.lastMtime) return;
      this.lastMtime = s.mtimeMs;

      const raw = await readFile(SIDECAR_PATH, 'utf-8');
      this.cachedData = JSON.parse(raw) as StatuslineUsageData;
      this.emit('update', this.cachedData);
    } catch {
      // File doesn't exist or parse error — silently ignore
    }
  }
}
