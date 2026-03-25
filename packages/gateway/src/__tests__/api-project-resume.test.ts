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

describe('project blocked task resume routing', () => {
  it('routes blocked task resumption through ProjectRuntimeAdapter', async () => {
    const resumeBlockedTask = vi.fn(async () => ({
      disposition: 'assigned' as const,
      task: {
        id: 'authority-1',
        status: 'in_progress',
      },
      worker: {
        id: 'worker-1',
        name: 'server-helper',
      },
      workerTask: {
        taskId: 'worker-task-1',
      },
      ephemeralWorkspace: null,
    }));

    const handler = createApiHandler({
      runManager: {} as never,
      sessionManager: {} as never,
      projectRuntimeAdapter: { resumeBlockedTask } as never,
    });

    const req = createRequest('/api/projects/server/tasks/authority-1/resume', {
      preferredWorkerId: 'worker-1',
      projectPath: '/workspace/server',
      source: 'dashboard',
    });
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(resumeBlockedTask).toHaveBeenCalledWith({
      taskId: 'authority-1',
      projectId: 'server',
      preferredWorkerId: 'worker-1',
      projectPath: '/workspace/server',
      source: 'dashboard',
      provider: undefined,
      dangerouslySkipPermissions: undefined,
      requiredRoleTags: undefined,
      requiredSkills: undefined,
      chatId: undefined,
    });
    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body)).toMatchObject({
      taskId: 'worker-task-1',
      authorityTaskId: 'authority-1',
      disposition: 'assigned',
      workerName: 'server-helper',
      status: 'in_progress',
    });
  });
});
