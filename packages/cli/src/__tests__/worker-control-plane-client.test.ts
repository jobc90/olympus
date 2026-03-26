import { describe, expect, it, vi } from 'vitest';
import {
  resolveAvailableWorkerNameFromSet,
  WorkerControlPlaneClient,
} from '../worker-control-plane-client.js';

describe('resolveAvailableWorkerNameFromSet', () => {
  it('keeps the desired name when it is unused', () => {
    expect(resolveAvailableWorkerNameFromSet('server', new Set(['admin']))).toEqual({
      workerName: 'server',
      conflicted: false,
    });
  });

  it('increments the suffix until an available worker name is found', () => {
    expect(resolveAvailableWorkerNameFromSet('server', new Set(['server', 'server-1', 'server-2']))).toEqual({
      workerName: 'server-3',
      conflicted: true,
    });
  });

  it('uses -1 for the first duplicate worker name', () => {
    expect(resolveAvailableWorkerNameFromSet('server', new Set(['server']))).toEqual({
      workerName: 'server-1',
      conflicted: true,
    });
  });
});

describe('WorkerControlPlaneClient', () => {
  it('checks gateway health and registers/deregisters workers', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/healthz')) {
        return new Response(null, { status: 200 });
      }
      if (url.endsWith('/api/workers/register')) {
        return new Response(JSON.stringify({
          worker: {
            id: 'worker-1',
            name: 'server',
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/api/workers/worker-1')) {
        expect(init?.method).toBe('DELETE');
        return new Response(null, { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const client = new WorkerControlPlaneClient({
      gatewayUrl: 'http://localhost:4000',
      apiKey: 'test-key',
      fetchImpl,
    });

    await client.ensureGatewayHealthy();
    const worker = await client.registerWorker({
      name: 'server',
      projectPath: '/workspace/server',
      pid: 1234,
      runtimeKind: 'tmux',
      hasLocalPty: false,
    });
    await client.deregisterWorker(worker.id);

    expect(worker).toEqual({
      id: 'worker-1',
      name: 'server',
    });
  });

  it('resolves name collisions from the worker list', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      workers: [
        { name: 'server' },
        { name: 'server-1' },
      ],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    const client = new WorkerControlPlaneClient({
      gatewayUrl: 'http://localhost:4000',
      apiKey: 'test-key',
      fetchImpl,
    });

    await expect(client.resolveAvailableWorkerName('server')).resolves.toEqual({
      workerName: 'server-2',
      conflicted: true,
    });
  });

  it('falls back to the desired name when worker listing fails', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new Error('network down');
    });

    const client = new WorkerControlPlaneClient({
      gatewayUrl: 'http://localhost:4000',
      apiKey: 'test-key',
      fetchImpl,
    });

    await expect(client.resolveAvailableWorkerName('server')).resolves.toEqual({
      workerName: 'server',
      conflicted: false,
    });
  });
});
