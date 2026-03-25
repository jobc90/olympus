import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../auth.js';
import { createApiHandler } from '../api.js';
import { WorkerRegistry } from '../worker-registry.js';

class MockResponse {
  statusCode = 200;
  headers = new Map<string, string>();
  body = '';

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }

  writeHead(status: number, headers?: Record<string, string>): this {
    this.statusCode = status;
    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        this.setHeader(key, value);
      }
    }
    return this;
  }

  end(chunk?: string): this {
    if (chunk) this.body += chunk;
    return this;
  }
}

function createRequest(url: string, body: unknown): Readable & {
  method: string;
  url: string;
  headers: Record<string, string>;
} {
  const stream = Readable.from([JSON.stringify(body)]) as Readable & {
    method: string;
    url: string;
    headers: Record<string, string>;
  };
  stream.method = 'POST';
  stream.url = url;
  stream.headers = {
    authorization: `Bearer ${loadConfig().apiKey}`,
    'content-type': 'application/json',
  };
  return stream;
}

describe('worker task result authority routing', () => {
  it('finalizes the authority task through ProjectRuntimeAdapter on normal completion', async () => {
    const registry = new WorkerRegistry();
    const worker = registry.register({
      name: 'server-default',
      projectPath: '/workspace/server',
      pid: 101,
      runtimeKind: 'tmux',
    });
    const workerTask = registry.createTask(worker.id, 'Implement login API', undefined, 'authority-1');
    const finalizeWorkerTask = vi.fn(() => ({
      workerTask,
      authorityTaskId: 'authority-1',
      transitionedTo: 'completed',
      task: { id: 'authority-1', status: 'completed' },
    }));
    const dispatchNextQueuedTask = vi.fn(async () => null);

    const handler = createApiHandler({
      runManager: {} as never,
      sessionManager: {} as never,
      workerRegistry: registry,
      projectRuntimeAdapter: { finalizeWorkerTask, dispatchNextQueuedTask } as never,
    });

    const req = createRequest(`/api/workers/tasks/${workerTask.taskId}`, {
      success: true,
      text: 'done',
      durationMs: 123,
    });
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(finalizeWorkerTask).toHaveBeenCalledWith({
      workerTaskId: workerTask.taskId,
      success: true,
    });
    expect(JSON.parse(res.body)).toMatchObject({
      ok: true,
    });
  });

  it('dispatches the next queued project task after worker completion', async () => {
    const registry = new WorkerRegistry();
    const worker = registry.register({
      name: 'server-default',
      projectPath: '/workspace/server',
      pid: 101,
      runtimeKind: 'tmux',
    });
    const workerTask = registry.createTask(worker.id, 'Implement login API', undefined, 'authority-1');
    const finalizeWorkerTask = vi.fn(() => ({
      workerTask,
      authorityTaskId: 'authority-1',
      transitionedTo: 'completed',
      task: { id: 'authority-1', status: 'completed', projectId: 'server' },
    }));
    const dispatchNextQueuedTask = vi.fn(async () => null);

    const handler = createApiHandler({
      runManager: {} as never,
      sessionManager: {} as never,
      workerRegistry: registry,
      projectRuntimeAdapter: {
        finalizeWorkerTask,
        dispatchNextQueuedTask,
      } as never,
    });

    const req = createRequest(`/api/workers/tasks/${workerTask.taskId}`, {
      success: true,
      text: 'done',
      durationMs: 123,
    });
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(dispatchNextQueuedTask).toHaveBeenCalledWith({
      projectId: 'server',
      workerId: worker.id,
    });
  });
});
