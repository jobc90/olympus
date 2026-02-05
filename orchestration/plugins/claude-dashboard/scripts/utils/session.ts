/**
 * Session utilities - shared session time management
 */

import { readFile, mkdir, open } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { WidgetContext } from '../types.js';
import { debugLog } from './debug.js';

const SESSION_DIR = join(homedir(), '.cache', 'claude-dashboard', 'sessions');

// In-memory cache to avoid repeated file I/O during a single process lifecycle
const sessionCache = new Map<string, number>();

// Pending requests to prevent race conditions when multiple processes start simultaneously
const pendingRequests = new Map<string, Promise<number>>();

/**
 * Sanitize session ID to prevent path traversal attacks.
 * Only allows alphanumeric characters, hyphens, and underscores.
 */
function sanitizeSessionId(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9-_]/g, '');
}

/**
 * Get or create session start time
 */
export async function getSessionStartTime(sessionId: string): Promise<number> {
  const safeSessionId = sanitizeSessionId(sessionId);

  // Check memory cache first
  if (sessionCache.has(safeSessionId)) {
    return sessionCache.get(safeSessionId)!;
  }

  // Check if there's already a pending request for this session
  const pending = pendingRequests.get(safeSessionId);
  if (pending) {
    return pending;
  }

  // Create and store the promise to deduplicate concurrent requests
  const promise = getOrCreateSessionStartTimeImpl(safeSessionId);
  pendingRequests.set(safeSessionId, promise);

  try {
    return await promise;
  } finally {
    pendingRequests.delete(safeSessionId);
  }
}

/**
 * Internal implementation for getting or creating session start time
 */
async function getOrCreateSessionStartTimeImpl(safeSessionId: string): Promise<number> {
  const sessionFile = join(SESSION_DIR, `${safeSessionId}.json`);

  try {
    const content = await readFile(sessionFile, 'utf-8');
    const data = JSON.parse(content);

    if (typeof data.startTime !== 'number') {
      debugLog('session', `Invalid session file format for ${safeSessionId}`);
      throw new Error('Invalid session file format');
    }

    // Cache result before returning
    sessionCache.set(safeSessionId, data.startTime);
    return data.startTime;
  } catch (error: unknown) {
    // Check if file simply doesn't exist (expected case)
    const isNotFound =
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT';

    if (!isNotFound) {
      // Unexpected error - log for debugging
      debugLog('session', `Failed to read session ${safeSessionId}`, error);
    }

    // Create new session with atomic file creation
    const startTime = Date.now();

    try {
      await mkdir(SESSION_DIR, { recursive: true });

      // Use O_EXCL flag for atomic creation - fails if file already exists
      // This prevents race conditions where multiple processes create different start times
      const fileHandle = await open(sessionFile, 'wx');
      try {
        await fileHandle.writeFile(JSON.stringify({ startTime }), 'utf-8');
      } finally {
        await fileHandle.close();
      }

      // Cache result before returning
      sessionCache.set(safeSessionId, startTime);
      return startTime;
    } catch (writeError: unknown) {
      // If file was created by another process (EEXIST), read it instead
      const isExists =
        writeError instanceof Error &&
        'code' in writeError &&
        (writeError as NodeJS.ErrnoException).code === 'EEXIST';

      if (isExists) {
        try {
          const content = await readFile(sessionFile, 'utf-8');
          const data = JSON.parse(content);
          if (typeof data.startTime === 'number') {
            sessionCache.set(safeSessionId, data.startTime);
            return data.startTime;
          }
        } catch {
          debugLog('session', `Failed to read existing session ${safeSessionId} after EEXIST`);
        }
      } else {
        debugLog('session', `Failed to persist session ${safeSessionId}`, writeError);
      }

      // Fallback: Continue with in-memory start time - widget will still work for current process
      sessionCache.set(safeSessionId, startTime);
      return startTime;
    }
  }
}

/**
 * Get session elapsed time in milliseconds
 */
export async function getSessionElapsedMs(sessionId: string): Promise<number> {
  const startTime = await getSessionStartTime(sessionId);
  return Date.now() - startTime;
}

/**
 * Get session elapsed minutes from context
 * Returns null if session is less than minMinutes old
 */
export async function getSessionElapsedMinutes(
  ctx: WidgetContext,
  minMinutes = 1
): Promise<number | null> {
  const sessionId = ctx.stdin.session_id || 'default';
  const elapsedMs = await getSessionElapsedMs(sessionId);
  const elapsedMinutes = elapsedMs / (1000 * 60);

  if (elapsedMinutes < minMinutes) return null;
  return elapsedMinutes;
}
