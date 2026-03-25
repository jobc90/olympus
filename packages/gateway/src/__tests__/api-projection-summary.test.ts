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

function createRequest(method: 'GET' | 'POST', url: string, body?: unknown): Readable & {
  method: string;
  url: string;
  headers: Record<string, string>;
} {
  const chunks = body === undefined ? [] : [JSON.stringify(body)];
  const stream = Readable.from(chunks) as Readable & {
    method: string;
    url: string;
    headers: Record<string, string>;
  };
  stream.method = method;
  stream.url = url;
  stream.headers = {
    authorization: `Bearer ${loadConfig().apiKey}`,
    'content-type': 'application/json',
  };
  return stream;
}

describe('createApiHandler projection and summaries', () => {
  it('returns a terminal projection view for the selected worker', async () => {
    const registry = new WorkerRegistry();
    const worker = registry.register({
      name: 'server-default',
      projectPath: '/workspace/server',
      pid: 101,
      runtimeKind: 'tmux',
    });
    registry.markBusy(worker.id, 'worker-task-1', 'Fix login API', 'authority-1');

    const handler = createApiHandler({
      runManager: {} as never,
      sessionManager: {} as never,
      workerRegistry: registry,
      taskAuthorityStore: {
        getTask: vi.fn(() => ({
          id: 'authority-1',
          displayLabel: 'server-1',
          title: 'Fix login API',
          kind: 'project' as const,
          status: 'in_progress' as const,
          projectId: 'server',
          parentTaskId: null,
          assignedWorkerId: worker.id,
          priority: 10,
          metadata: null,
          createdAt: 1,
          updatedAt: 2,
        })),
        listTasks: vi.fn(() => []),
      },
      workerRuntimeClient: {
        getState: vi.fn(async () => ({
          type: 'state',
          input_locked: true,
          active_task_id: 'authority-1',
        })),
        captureSnapshot: vi.fn(async () => ({
          type: 'terminal_snapshot',
          snapshot: 'line 1\nline 2',
          lines: 120,
        })),
        lockInput: vi.fn(),
        unlockInput: vi.fn(),
        resetSession: vi.fn(),
        sendInput: vi.fn(),
      } as never,
    });

    const req = createRequest('GET', `/api/workers/${worker.id}/projection?lines=120`);
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({
      projection: {
        workerId: worker.id,
        workerName: worker.name,
        runtimeKind: 'tmux',
        snapshotText: 'line 1\nline 2',
        inputLocked: true,
        activeTask: {
          taskId: 'authority-1',
          title: 'Fix login API',
          source: 'authority',
        },
      },
    });
  });

  it('returns project-centric summaries from authority tasks and worker task records', async () => {
    const registry = new WorkerRegistry();
    const handler = createApiHandler({
      runManager: {} as never,
      sessionManager: {} as never,
      workerRegistry: {
        ...registry,
        getAllTaskRecords: () => [
          {
            taskId: 'worker-task-1',
            workerId: 'worker-1',
            workerName: 'server-default',
            authorityTaskId: 'authority-2',
            prompt: 'Ship login',
            status: 'running',
            startedAt: 2,
          },
        ],
      } as never,
      taskAuthorityStore: {
        getTask: vi.fn(),
        listTasks: vi.fn(() => [
            {
              id: 'authority-1',
              displayLabel: 'server-risk',
              title: 'Fix deploy',
              kind: 'project' as const,
              status: 'blocked' as const,
              projectId: 'server',
              parentTaskId: null,
              assignedWorkerId: 'worker-1',
            priority: 50,
            metadata: null,
            createdAt: 1,
            updatedAt: 1,
          },
            {
              id: 'authority-2',
              displayLabel: 'server-run',
              title: 'Ship login',
              kind: 'project' as const,
              status: 'in_progress' as const,
              projectId: 'server',
              parentTaskId: null,
            assignedWorkerId: 'worker-1',
            priority: 10,
            metadata: null,
            createdAt: 2,
            updatedAt: 2,
          },
        ]),
      },
    });

    const req = createRequest('GET', '/api/projects/summaries');
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({
      summaries: [
        {
          projectId: 'server',
          counts: {
            blocked: 1,
            failed: 0,
            risky: 2,
            completed: 0,
            total: 3,
          },
          summary: 'Blocked: Fix deploy | Risky: Ship login',
        },
      ],
    });
  });
});
