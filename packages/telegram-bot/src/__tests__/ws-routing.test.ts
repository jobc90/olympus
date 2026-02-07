import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Test the WebSocket message routing logic from handleWebSocketMessage.
 * Since OlympusBot has heavy Telegraf dependencies, we replicate the routing
 * logic here to verify the sessions:list handling and sessionId guard.
 */

// Replicated routing logic (matches handleWebSocketMessage in index.ts)
type RouteResult =
  | { route: 'sessions:list' }
  | { route: 'session-event'; sessionId: string; type: string }
  | { route: 'dropped'; reason: 'no-sessionId' | 'no-chatId' };

function routeMessage(
  msg: { type: string; payload: unknown },
  subscribedRuns: Map<string, number>,
): RouteResult {
  // Handle broadcast events (no sessionId) before the sessionId guard
  if (msg.type === 'sessions:list') {
    return { route: 'sessions:list' };
  }

  const payload = msg.payload as { sessionId?: string; runId?: string };
  const sessionId = payload.sessionId ?? payload.runId;

  if (!sessionId) return { route: 'dropped', reason: 'no-sessionId' };

  const chatId = subscribedRuns.get(sessionId);
  if (!chatId) return { route: 'dropped', reason: 'no-chatId' };

  return { route: 'session-event', sessionId, type: msg.type };
}

describe('WebSocket message routing', () => {
  const subscribedRuns = new Map<string, number>([
    ['session-abc', 123456],
    ['session-def', 789012],
  ]);

  it('should route sessions:list before sessionId guard', () => {
    const result = routeMessage(
      { type: 'sessions:list', payload: { sessions: [], availableSessions: [] } },
      subscribedRuns,
    );
    expect(result).toEqual({ route: 'sessions:list' });
  });

  it('should route sessions:list even with no payload', () => {
    const result = routeMessage(
      { type: 'sessions:list', payload: {} },
      subscribedRuns,
    );
    expect(result).toEqual({ route: 'sessions:list' });
  });

  it('should drop messages without sessionId (not sessions:list)', () => {
    const result = routeMessage(
      { type: 'unknown:event', payload: {} },
      subscribedRuns,
    );
    expect(result).toEqual({ route: 'dropped', reason: 'no-sessionId' });
  });

  it('should drop messages with unknown sessionId', () => {
    const result = routeMessage(
      { type: 'session:output', payload: { sessionId: 'unknown-id' } },
      subscribedRuns,
    );
    expect(result).toEqual({ route: 'dropped', reason: 'no-chatId' });
  });

  it('should route session:output to subscribed session', () => {
    const result = routeMessage(
      { type: 'session:output', payload: { sessionId: 'session-abc' } },
      subscribedRuns,
    );
    expect(result).toEqual({ route: 'session-event', sessionId: 'session-abc', type: 'session:output' });
  });

  it('should route session:closed to subscribed session', () => {
    const result = routeMessage(
      { type: 'session:closed', payload: { sessionId: 'session-def' } },
      subscribedRuns,
    );
    expect(result).toEqual({ route: 'session-event', sessionId: 'session-def', type: 'session:closed' });
  });

  it('should use runId as fallback for sessionId', () => {
    const result = routeMessage(
      { type: 'run:complete', payload: { runId: 'session-abc' } },
      subscribedRuns,
    );
    expect(result).toEqual({ route: 'session-event', sessionId: 'session-abc', type: 'run:complete' });
  });
});

describe('throttledSyncAllChats logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should coalesce rapid sessions:list events into one sync', () => {
    const syncCalls: number[] = [];
    let throttleTimer: NodeJS.Timeout | null = null;
    const chatIds = new Set([111, 222]);

    function throttledSync() {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        for (const chatId of chatIds) {
          syncCalls.push(chatId);
        }
      }, 1000);
    }

    // Rapid fire 5 events
    throttledSync();
    throttledSync();
    throttledSync();
    throttledSync();
    throttledSync();

    // Before timer fires: no sync calls
    expect(syncCalls).toEqual([]);

    // After 1 second: exactly one batch
    vi.advanceTimersByTime(1000);
    expect(syncCalls).toEqual([111, 222]);
  });

  it('should allow new sync after throttle period', () => {
    const syncCalls: number[] = [];
    let throttleTimer: NodeJS.Timeout | null = null;
    const chatIds = new Set([111]);

    function throttledSync() {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        for (const chatId of chatIds) {
          syncCalls.push(chatId);
        }
      }, 1000);
    }

    // First batch
    throttledSync();
    vi.advanceTimersByTime(1000);
    expect(syncCalls).toEqual([111]);

    // Second batch (after throttle reset)
    throttledSync();
    vi.advanceTimersByTime(1000);
    expect(syncCalls).toEqual([111, 111]);
  });
});
