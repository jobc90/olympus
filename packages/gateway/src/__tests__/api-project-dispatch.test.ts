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
    if (chunk) {
      this.body += chunk;
    }
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

describe('createApiHandler project dispatch routing', () => {
  it('rejects worker task assignment when ProjectRuntimeAdapter is unavailable', async () => {
    const registry = new WorkerRegistry();
    const worker = registry.register({
      name: 'server-default',
      projectPath: '/workspace/server',
      pid: 101,
      runtimeKind: 'tmux',
    });

    const handler = createApiHandler({
      runManager: {} as never,
      sessionManager: {} as never,
      workerRegistry: registry,
    });

    const req = createRequest(`/api/workers/${worker.id}/task`, {
      prompt: 'Implement login API',
      provider: 'claude',
    });
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body)).toMatchObject({
      error: 'Project runtime adapter not available',
    });
  });

  it('routes worker task assignment through ProjectRuntimeAdapter when available', async () => {
    const registry = new WorkerRegistry();
    const worker = registry.register({
      name: 'server-default',
      projectPath: '/workspace/server',
      pid: 101,
      runtimeKind: 'tmux',
    });
    const dispatchTask = vi.fn(async () => ({
      disposition: 'assigned' as const,
      task: {
        id: 'authority-1',
        status: 'in_progress',
      },
      worker,
      workerTask: {
        taskId: 'worker-task-1',
      },
      ephemeralWorkspace: null,
    }));

    const handler = createApiHandler({
      runManager: {} as never,
      sessionManager: {} as never,
      workerRegistry: registry,
      projectRuntimeAdapter: { dispatchTask } as never,
    });

    const req = createRequest(`/api/workers/${worker.id}/task`, {
      prompt: 'Implement login API',
      provider: 'claude',
    });
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(dispatchTask).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'server',
        preferredWorkerId: worker.id,
        projectPath: worker.projectPath,
      }),
    );
    expect(JSON.parse(res.body)).toMatchObject({
      authorityTaskId: 'authority-1',
      taskId: 'worker-task-1',
      disposition: 'assigned',
    });
  });

  it('routes codex @mention delegation through CodexAdapter when available', async () => {
    const registry = new WorkerRegistry();
    registry.register({
      name: 'server-default',
      projectPath: '/workspace/server',
      pid: 101,
      runtimeKind: 'tmux',
    });
    const tryDelegateMention = vi.fn(async () => ({
      httpStatus: 200,
      body: {
        type: 'delegation',
        authorityTaskId: 'authority-codex-1',
        taskId: 'worker-task-codex-1',
        response: 'delegated',
      },
    }));

    const handler = createApiHandler({
      runManager: {} as never,
      sessionManager: {} as never,
      workerRegistry: registry,
      codexAdapter: { tryDelegateMention } as never,
    });

    const req = createRequest('/api/codex/chat', {
      message: '@server-default 로그인 API 수정해',
      source: 'dashboard',
      chatId: 1234,
    });
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(tryDelegateMention).toHaveBeenCalledWith({
      message: '@server-default 로그인 API 수정해',
      source: 'dashboard',
      chatId: 1234,
    });
    expect(JSON.parse(res.body)).toMatchObject({
      type: 'delegation',
      authorityTaskId: 'authority-codex-1',
      taskId: 'worker-task-codex-1',
    });
  });

  it('rejects codex @mention delegation when CodexAdapter is unavailable', async () => {
    const registry = new WorkerRegistry();
    registry.register({
      name: 'server-default',
      projectPath: '/workspace/server',
      pid: 101,
      runtimeKind: 'tmux',
    });

    const handler = createApiHandler({
      runManager: {} as never,
      sessionManager: {} as never,
      workerRegistry: registry,
    });

    const req = createRequest('/api/codex/chat', {
      message: '@server-default 로그인 API 수정해',
      source: 'dashboard',
      chatId: 1234,
    });
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body)).toMatchObject({
      error: 'Codex adapter mention delegation not available',
    });
  });
});
