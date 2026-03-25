import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../auth.js';
import { createApiHandler } from '../api.js';

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

describe('project authority task cancel routing', () => {
  it('routes task cancellation through ProjectRuntimeAdapter', async () => {
    const cancelTask = vi.fn(async () => ({
      task: {
        id: 'authority-1',
        status: 'cancelled',
      },
      worker: {
        id: 'worker-1',
        name: 'server-default',
      },
      workerTask: {
        taskId: 'worker-task-1',
        status: 'cancelled',
      },
      runtimeResetRequested: true,
    }));

    const handler = createApiHandler({
      runManager: {} as never,
      sessionManager: {} as never,
      projectRuntimeAdapter: { cancelTask } as never,
    });

    const req = createRequest('/api/projects/server/tasks/authority-1/cancel', {
      reason: 'dashboard cancel',
    });
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(cancelTask).toHaveBeenCalledWith({
      taskId: 'authority-1',
      projectId: 'server',
      reason: 'dashboard cancel',
    });
    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body)).toMatchObject({
      authorityTaskId: 'authority-1',
      status: 'cancelled',
      workerName: 'server-default',
      taskId: 'worker-task-1',
      workerTaskStatus: 'cancelled',
      runtimeResetRequested: true,
    });
  });
});
