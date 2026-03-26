import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RouteResult =
  | { route: 'rpc'; requestId?: string }
  | { route: 'worker-task'; type: string }
  | { route: 'broadcast'; type: string }
  | { route: 'ignored'; type: string };

function routeMessage(msg: { type: string; payload: unknown }): RouteResult {
  if (msg.type === 'rpc:result' || msg.type === 'rpc:error' || msg.type === 'rpc:ack') {
    return {
      route: 'rpc',
      requestId: (msg.payload as { requestId?: string }).requestId,
    };
  }

  if (
    msg.type === 'worker:task:assigned' ||
    msg.type === 'worker:task:completed' ||
    msg.type === 'worker:task:failed' ||
    msg.type === 'worker:task:timeout' ||
    msg.type === 'worker:task:final_after_timeout' ||
    msg.type === 'worker:task:summary'
  ) {
    return { route: 'worker-task', type: msg.type };
  }

  if (
    msg.type === 'dashboard:chat:mirror' ||
    msg.type === 'codex:greeting' ||
    msg.type === 'gemini:alert' ||
    msg.type === 'gemini:review'
  ) {
    return { route: 'broadcast', type: msg.type };
  }

  return { route: 'ignored', type: msg.type };
}

describe('WebSocket message routing', () => {
  it('routes rpc messages before any event handling', () => {
    expect(routeMessage({
      type: 'rpc:result',
      payload: { requestId: 'req-1', result: [] },
    })).toEqual({ route: 'rpc', requestId: 'req-1' });
  });

  it('routes current worker task events as control-plane task updates', () => {
    expect(routeMessage({
      type: 'worker:task:summary',
      payload: { taskId: 'task-1', workerName: 'olympus', summary: 'ok' },
    })).toEqual({ route: 'worker-task', type: 'worker:task:summary' });
  });

  it('routes dashboard and advisor broadcasts without relying on session ids', () => {
    expect(routeMessage({
      type: 'dashboard:chat:mirror',
      payload: { answer: '요약' },
    })).toEqual({ route: 'broadcast', type: 'dashboard:chat:mirror' });

    expect(routeMessage({
      type: 'codex:greeting',
      payload: { text: '브리핑', timestamp: Date.now() },
    })).toEqual({ route: 'broadcast', type: 'codex:greeting' });
  });

  it('ignores legacy session events after the refactor', () => {
    expect(routeMessage({
      type: 'session:screen',
      payload: { sessionId: 'legacy-1', content: 'stale' },
    })).toEqual({ route: 'ignored', type: 'session:screen' });

    expect(routeMessage({
      type: 'run:complete',
      payload: { runId: 'legacy-1' },
    })).toEqual({ route: 'ignored', type: 'run:complete' });
  });
});

describe('throttledSyncAllChats logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces rapid reconnect-triggered sync requests into one batch', () => {
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

    throttledSync();
    throttledSync();
    throttledSync();

    expect(syncCalls).toEqual([]);
    vi.advanceTimersByTime(1000);
    expect(syncCalls).toEqual([111, 222]);
  });
});
