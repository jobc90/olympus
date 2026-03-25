import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createMessage } from '@olympus-dev/protocol';
import {
  resolveWorkerWebSocketUrl,
  WorkerGatewaySession,
  type WebSocketLike,
} from '../worker-gateway-session.js';
import type {
  TaskPayload,
  WorkerInputPayload,
  WorkerResizePayload,
  WorkerTaskSnapshot,
} from '../worker-task-orchestrator.js';

class MockSocket extends EventEmitter implements WebSocketLike {
  readyState = 1;

  readonly sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.emit('close');
  }
}

describe('WorkerGatewaySession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('connects to gateway WS, dispatches worker events, and performs heartbeat/recovery', async () => {
    const socket = new MockSocket();
    const onAssignedTask = vi.fn<(task: TaskPayload) => void>();
    const onInput = vi.fn<(payload: WorkerInputPayload) => void>();
    const onResize = vi.fn<(payload: WorkerResizePayload) => void>();
    const onRecoverPendingTasks = vi.fn<(tasks: WorkerTaskSnapshot[]) => Promise<void>>(async () => {});
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/workers/tasks')) {
        return new Response(JSON.stringify({
          tasks: [
            {
              taskId: 'task-1',
              workerId: 'worker-1',
              workerName: 'server-default',
              prompt: 'Recover me',
              status: 'running',
            },
          ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(null, { status: 200 });
    });

    const session = new WorkerGatewaySession({
      gatewayUrl: 'http://localhost:4000',
      apiKey: 'test-key',
      workerId: 'worker-1',
      onAssignedTask,
      onInput,
      onResize,
      onRecoverPendingTasks,
      fetchImpl,
      webSocketFactory: () => socket,
      heartbeatMs: 100,
      pingMs: 50,
      recoveryPollMs: 200,
      reconnectDelayMs: 10,
    });

    await session.start();
    socket.emit('open');
    await Promise.resolve();

    socket.emit('message', Buffer.from(JSON.stringify(createMessage('worker:task:assigned', {
      taskId: 'task-2',
      workerId: 'worker-1',
      workerName: 'server-default',
      prompt: 'Implement auth flow',
    }))));
    socket.emit('message', Buffer.from(JSON.stringify(createMessage('worker:input', {
      workerId: 'worker-1',
      input: 'status',
    }))));
    socket.emit('message', Buffer.from(JSON.stringify(createMessage('worker:resize', {
      workerId: 'worker-1',
      cols: 120,
      rows: 40,
    }))));

    await vi.advanceTimersByTimeAsync(210);
    await session.stop();

    expect(socket.sent.map((entry) => JSON.parse(entry))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'connect',
          payload: {
            clientType: 'worker',
            apiKey: 'test-key',
          },
        }),
        expect.objectContaining({
          type: 'ping',
          payload: {},
        }),
      ]),
    );
    expect(onAssignedTask).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-2',
      prompt: 'Implement auth flow',
    }));
    expect(onInput).toHaveBeenCalledWith({ workerId: 'worker-1', input: 'status' });
    expect(onResize).toHaveBeenCalledWith({ workerId: 'worker-1', cols: 120, rows: 40 });
    expect(onRecoverPendingTasks).toHaveBeenCalledWith([
      expect.objectContaining({
        taskId: 'task-1',
        workerId: 'worker-1',
      }),
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:4000/api/workers/worker-1/heartbeat',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('queues worker stream chunks and flushes them on the configured timer', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
    const session = new WorkerGatewaySession({
      gatewayUrl: 'http://localhost:4000',
      apiKey: 'test-key',
      workerId: 'worker-1',
      onAssignedTask: () => {},
      onInput: () => {},
      onResize: () => {},
      onRecoverPendingTasks: async () => {},
      fetchImpl,
      webSocketFactory: () => new MockSocket(),
      streamFlushMs: 25,
    });

    session.queueWorkerStream('hello');
    await vi.advanceTimersByTimeAsync(30);
    await session.stop();

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:4000/api/workers/worker-1/stream',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"content":"hello"'),
      }),
    );
  });

  it('reports task results through the worker result endpoint', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
    const session = new WorkerGatewaySession({
      gatewayUrl: 'http://localhost:4000',
      apiKey: 'test-key',
      workerId: 'worker-1',
      onAssignedTask: () => {},
      onInput: () => {},
      onResize: () => {},
      onRecoverPendingTasks: async () => {},
      fetchImpl,
      webSocketFactory: () => new MockSocket(),
    });

    await session.reportResult('task-1', {
      success: true,
      text: 'implemented',
      durationMs: 12,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:4000/api/workers/tasks/task-1',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          success: true,
          text: 'implemented',
          durationMs: 12,
        }),
      }),
    );
  });
});

describe('resolveWorkerWebSocketUrl', () => {
  it('maps the gateway http URL to the worker websocket endpoint', () => {
    expect(resolveWorkerWebSocketUrl('http://localhost:4000')).toBe('ws://localhost:4000/ws');
  });
});
