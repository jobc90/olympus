import { Readable } from 'node:stream';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeControlRequest } from '@olympus-dev/protocol';
import { createRuntimeControlSuccess } from '@olympus-dev/protocol';
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

const cleanupPaths: string[] = [];

afterEach(async () => {
  delete process.env.OLYMPUS_RUNTIME_SOCKETS_ROOT;
  await Promise.all(cleanupPaths.splice(0).map(async (path) => {
    await rm(path, { recursive: true, force: true });
  }));
});

describe('worker input runtime routing', () => {
  it('forwards printable tmux input through the runtime socket', async () => {
    const socketsRoot = await mkdtemp(join(tmpdir(), 'olympus-api-worker-input-'));
    cleanupPaths.push(socketsRoot);
    process.env.OLYMPUS_RUNTIME_SOCKETS_ROOT = socketsRoot;

    const registry = new WorkerRegistry();
    const worker = registry.register({
      name: 'worker-1',
      projectPath: '/workspace/server',
      pid: 101,
      runtimeKind: 'tmux',
    });

    let received: RuntimeControlRequest | null = null;
    const socketPath = join(socketsRoot, 'server-worker-1.sock');
    const server = createServer((socket) => {
      socket.on('data', (chunk) => {
        received = JSON.parse(chunk.toString('utf8').trim()) as RuntimeControlRequest;
        socket.end(`${JSON.stringify(createRuntimeControlSuccess({
          request_id: received.request_id,
          worker_id: received.worker_id,
          result: {
            type: 'accepted',
            accepted: true,
            detail: 'input_forwarded',
          },
        }))}\n`);
      });
    });

    await new Promise<void>((resolve) => server.listen(socketPath, resolve));

    const workerEvents: Array<{ eventType: string; payload: unknown }> = [];
    const handler = createApiHandler({
      runManager: {} as never,
      sessionManager: {} as never,
      workerRegistry: registry,
      onWorkerEvent: (eventType, payload) => {
        workerEvents.push({ eventType, payload });
      },
    });

    const req = createRequest(`/api/workers/${worker.id}/input`, {
      input: 'status\r',
    });
    const res = new MockResponse();

    await handler(req as never, res as never);

    server.close();

    expect(received).toMatchObject({
      worker_id: 'worker-1',
      command: 'send_input',
      payload: {
        text: 'status',
        submit: true,
        source: 'dashboard',
      },
    });
    expect(JSON.parse(res.body)).toMatchObject({
      ok: true,
      deliveredVia: 'runtime-socket',
      trackedAs: 'manual-input-event',
    });
    expect(workerEvents).toHaveLength(1);
    expect(workerEvents[0]).toMatchObject({
      eventType: 'worker:input:submitted',
      payload: {
        workerId: worker.id,
        workerName: worker.name,
        prompt: 'status',
        source: 'dashboard',
      },
    });
  });

  it('asks Codex to interpret submitted manual input when available', async () => {
    const socketsRoot = await mkdtemp(join('/tmp', 'oapi-pty-'));
    cleanupPaths.push(socketsRoot);
    process.env.OLYMPUS_RUNTIME_SOCKETS_ROOT = socketsRoot;

    const registry = new WorkerRegistry();
    const worker = registry.register({
      name: 'worker-1',
      projectPath: '/workspace/server',
      pid: 101,
      runtimeKind: 'pty',
    });

    const codexAdapter = {
      interpretManualInput: vi.fn(async () => ({
        workerId: worker.id,
        workerName: worker.name,
        projectId: 'server',
        projectPath: worker.projectPath,
        prompt: 'status',
        source: 'dashboard',
        timestamp: 1_717_000_000_000,
        classification: 'new_task_candidate',
        reason: 'no active task context',
      })),
    };

    let received: RuntimeControlRequest | null = null;
    const socketPath = join(socketsRoot, 'server-worker-1.sock');
    const server = createServer((socket) => {
      socket.on('data', (chunk) => {
        received = JSON.parse(chunk.toString('utf8').trim()) as RuntimeControlRequest;
        socket.end(`${JSON.stringify(createRuntimeControlSuccess({
          request_id: received.request_id,
          worker_id: received.worker_id,
          result: {
            type: 'accepted',
            accepted: true,
            detail: 'input_forwarded',
          },
        }))}\n`);
      });
    });

    await new Promise<void>((resolve) => server.listen(socketPath, resolve));

    const handler = createApiHandler({
      runManager: {} as never,
      sessionManager: {} as never,
      workerRegistry: registry,
      codexAdapter: codexAdapter as never,
    });

    const req = createRequest(`/api/workers/${worker.id}/input`, {
      input: 'status\r',
    });
    const res = new MockResponse();

    await handler(req as never, res as never);
    server.close();

    expect(received).toMatchObject({
      worker_id: 'worker-1',
      command: 'send_input',
      payload: {
        text: 'status',
        submit: true,
        source: 'dashboard',
      },
    });
    expect(codexAdapter.interpretManualInput).toHaveBeenCalledWith({
      workerId: worker.id,
      workerName: worker.name,
      prompt: 'status',
      projectId: 'server',
      projectPath: worker.projectPath,
      source: 'dashboard',
      timestamp: expect.any(Number),
    });
    expect(JSON.parse(res.body)).toMatchObject({
      ok: true,
      deliveredVia: 'runtime-socket',
    });
  });
});
