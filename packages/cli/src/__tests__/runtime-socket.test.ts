import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  RuntimeSocketClient,
  RuntimeSocketServer,
  createRuntimeSocketPath,
} from '../worker-host/runtime-socket.js';
import {
  createRuntimeControlRequest,
  createRuntimeControlSuccess,
} from '@olympus-dev/protocol';

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map(async (path) => {
    await rm(path, { recursive: true, force: true });
  }));
});

describe('RuntimeSocketServer', () => {
  it('handles JSONL runtime-control requests over a Unix socket', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'olympus-runtime-socket-'));
    cleanupPaths.push(rootDir);
    const socketPath = createRuntimeSocketPath({
      socketsRoot: rootDir,
      projectId: 'server',
      workerId: 'worker-1',
    });

    const server = new RuntimeSocketServer({
      socketPath,
      handler: async (request) => createRuntimeControlSuccess({
        request_id: request.request_id,
        worker_id: request.worker_id,
        result: {
          type: 'terminal_snapshot',
          snapshot: `snapshot:${request.command}`,
          lines: 80,
        },
      }),
    });

    await server.start();

    const client = new RuntimeSocketClient(socketPath);
    const response = await client.send(createRuntimeControlRequest({
      request_id: 'req-1',
      worker_id: 'worker-1',
      command: 'capture_terminal_snapshot',
      payload: {
        lines: 80,
      },
    }));

    await server.stop();

    expect(response).toMatchObject({
      request_id: 'req-1',
      worker_id: 'worker-1',
      ok: true,
      result: {
        type: 'terminal_snapshot',
        snapshot: 'snapshot:capture_terminal_snapshot',
        lines: 80,
      },
    });
  });

  it('removes stale socket files before starting and after stopping', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'olympus-runtime-socket-'));
    cleanupPaths.push(rootDir);
    const socketPath = createRuntimeSocketPath({
      socketsRoot: rootDir,
      projectId: 'server',
      workerId: 'worker-2',
    });

    const server = new RuntimeSocketServer({
      socketPath,
      handler: async (request) => createRuntimeControlSuccess({
        request_id: request.request_id,
        worker_id: request.worker_id,
        result: {
          type: 'accepted',
          accepted: true,
        },
      }),
    });

    await server.start();
    expect(await server.exists()).toBe(true);

    await server.stop();
    expect(await server.exists()).toBe(false);
  });
});
