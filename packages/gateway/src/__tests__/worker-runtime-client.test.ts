import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import type { RuntimeControlRequest } from '@olympus-dev/protocol';
import { createRuntimeControlSuccess } from '@olympus-dev/protocol';
import { WorkerRuntimeClient, resolveGatewayRuntimeSocketsRoot } from '../worker-runtime-client.js';

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map(async (path) => {
    await rm(path, { recursive: true, force: true });
  }));
});

describe('WorkerRuntimeClient', () => {
  it('sends capture requests to the expected worker runtime socket path', async () => {
    const socketsRoot = await mkdtemp(join(tmpdir(), 'olympus-gateway-runtime-'));
    cleanupPaths.push(socketsRoot);
    const socketPath = join(socketsRoot, 'server-worker-1.sock');
    let received: RuntimeControlRequest | null = null;

    const server = createServer((socket) => {
      socket.on('data', (chunk) => {
        received = JSON.parse(chunk.toString('utf8').trim()) as RuntimeControlRequest;
        socket.write(`${JSON.stringify(createRuntimeControlSuccess({
          request_id: received.request_id,
          worker_id: received.worker_id,
          result: {
            type: 'terminal_snapshot',
            snapshot: 'captured',
            lines: 120,
          },
        }))}\n`);
      });
    });

    await new Promise<void>((resolve) => server.listen(socketPath, resolve));

    const client = new WorkerRuntimeClient({
      socketsRoot,
      requestIdFactory: () => 'req-1',
    });

    const result = await client.captureSnapshot({
      id: 'worker-id',
      name: 'worker-1',
      projectPath: '/workspace/server',
      pid: 1,
      status: 'idle',
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
      runtimeKind: 'pty',
    }, 120);

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

    expect(received).toMatchObject({
      request_id: 'req-1',
      worker_id: 'worker-1',
      command: 'capture_terminal_snapshot',
      payload: {
        lines: 120,
      },
    });
    expect(result).toMatchObject({
      type: 'terminal_snapshot',
      snapshot: 'captured',
      lines: 120,
    });
  });

  it('uses the default gateway runtime socket root under the home directory', () => {
    expect(resolveGatewayRuntimeSocketsRoot(undefined, '/Users/jobc')).toBe(
      '/Users/jobc/.olympus/runtime-sockets',
    );
  });

  it('requests runtime state from the worker runtime socket', async () => {
    const socketsRoot = await mkdtemp(join(tmpdir(), 'olympus-gateway-runtime-'));
    cleanupPaths.push(socketsRoot);
    const socketPath = join(socketsRoot, 'server-worker-1.sock');
    let received: RuntimeControlRequest | null = null;

    const server = createServer((socket) => {
      socket.on('data', (chunk) => {
        received = JSON.parse(chunk.toString('utf8').trim()) as RuntimeControlRequest;
        socket.write(`${JSON.stringify(createRuntimeControlSuccess({
          request_id: received.request_id,
          worker_id: received.worker_id,
          result: {
            type: 'state',
            input_locked: true,
            active_task_id: 'authority-1',
          },
        }))}\n`);
      });
    });

    await new Promise<void>((resolve) => server.listen(socketPath, resolve));

    const client = new WorkerRuntimeClient({
      socketsRoot,
      requestIdFactory: () => 'req-state',
    });

    const result = await client.getState({
      id: 'worker-id',
      name: 'worker-1',
      projectPath: '/workspace/server',
      pid: 1,
      status: 'busy',
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
      runtimeKind: 'tmux',
    });

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

    expect(received).toMatchObject({
      request_id: 'req-state',
      worker_id: 'worker-1',
      command: 'get_state',
      payload: {},
    });
    expect(result).toMatchObject({
      type: 'state',
      input_locked: true,
      active_task_id: 'authority-1',
    });
  });

  it('sends input requests to the worker runtime socket', async () => {
    const socketsRoot = await mkdtemp(join(tmpdir(), 'olympus-gateway-runtime-'));
    cleanupPaths.push(socketsRoot);
    const socketPath = join(socketsRoot, 'server-worker-1.sock');
    let received: RuntimeControlRequest | null = null;

    const server = createServer((socket) => {
      socket.on('data', (chunk) => {
        received = JSON.parse(chunk.toString('utf8').trim()) as RuntimeControlRequest;
        socket.write(`${JSON.stringify(createRuntimeControlSuccess({
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

    const client = new WorkerRuntimeClient({
      socketsRoot,
      requestIdFactory: () => 'req-input',
    });

    const result = await client.sendInput({
      id: 'worker-id',
      name: 'worker-1',
      projectPath: '/workspace/server',
      pid: 1,
      status: 'idle',
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
      runtimeKind: 'pty',
    }, 'status', true, 'dashboard');

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

    expect(received).toMatchObject({
      request_id: 'req-input',
      worker_id: 'worker-1',
      command: 'send_input',
      payload: {
        text: 'status',
        submit: true,
        source: 'dashboard',
      },
    });
    expect(result).toMatchObject({
      type: 'accepted',
      accepted: true,
    });
  });

  it('sends soft preempt requests to the worker runtime socket', async () => {
    const socketsRoot = await mkdtemp(join(tmpdir(), 'olympus-gateway-runtime-'));
    cleanupPaths.push(socketsRoot);
    const socketPath = join(socketsRoot, 'server-worker-1.sock');
    let received: RuntimeControlRequest | null = null;

    const server = createServer((socket) => {
      socket.on('data', (chunk) => {
        received = JSON.parse(chunk.toString('utf8').trim()) as RuntimeControlRequest;
        socket.write(`${JSON.stringify(createRuntimeControlSuccess({
          request_id: received.request_id,
          worker_id: received.worker_id,
          result: {
            type: 'accepted',
            accepted: true,
            detail: 'preempted',
          },
        }))}\n`);
      });
    });

    await new Promise<void>((resolve) => server.listen(socketPath, resolve));

    const client = new WorkerRuntimeClient({
      socketsRoot,
      requestIdFactory: () => 'req-preempt',
    });

    const result = await client.softPreempt({
      id: 'worker-id',
      name: 'worker-1',
      projectPath: '/workspace/server',
      pid: 1,
      status: 'busy',
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
      runtimeKind: 'tmux',
    }, 'authority-1', 'authority-2', 'urgent fix');

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

    expect(received).toMatchObject({
      request_id: 'req-preempt',
      worker_id: 'worker-1',
      command: 'soft_preempt',
      payload: {
        task_id: 'authority-1',
        replacement_task_id: 'authority-2',
        reason: 'urgent fix',
      },
    });
    expect(result).toMatchObject({
      type: 'accepted',
      accepted: true,
    });
  });
});
