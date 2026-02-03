import type { IncomingMessage, ServerResponse } from 'node:http';
import { authMiddleware, loadConfig, validateApiKey } from './auth.js';
import { handleCorsPrefllight, setCorsHeaders } from './cors.js';
import type { RunManager, RunOptions } from './run-manager.js';
import { runParallel, GeminiExecutor, TaskStore } from '@olympus-dev/core';
import type { CreateTaskInput, UpdateTaskInput } from '@olympus-dev/protocol';

export interface ApiHandlerOptions {
  runManager: RunManager;
  onRunCreated?: () => void;  // Callback to broadcast runs:list
}

/**
 * Parse JSON body from request
 */
async function parseBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {} as T);
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Parse URL path and extract route info
 */
function parseRoute(url: string): { path: string; id?: string; query?: Record<string, string> } {
  const urlObj = new URL(url, 'http://localhost');
  const parts = urlObj.pathname.split('/').filter(Boolean);
  const query: Record<string, string> = {};
  urlObj.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  // /api/runs/:id
  if (parts[0] === 'api' && parts[1] === 'runs' && parts[2]) {
    return { path: '/api/runs/:id', id: parts[2], query };
  }

  // /api/tasks/:id
  if (parts[0] === 'api' && parts[1] === 'tasks' && parts[2]) {
    // /api/tasks/:id/children
    if (parts[3] === 'children') {
      return { path: '/api/tasks/:id/children', id: parts[2], query };
    }
    // /api/tasks/:id/context
    if (parts[3] === 'context') {
      return { path: '/api/tasks/:id/context', id: parts[2], query };
    }
    // /api/tasks/:id/history
    if (parts[3] === 'history') {
      return { path: '/api/tasks/:id/history', id: parts[2], query };
    }
    return { path: '/api/tasks/:id', id: parts[2], query };
  }

  return { path: urlObj.pathname, query };
}

/**
 * Create HTTP API request handler
 */
export function createApiHandler(options: ApiHandlerOptions) {
  const { runManager, onRunCreated } = options;

  return async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Handle CORS
    if (handleCorsPrefllight(req, res)) {
      return;
    }
    setCorsHeaders(req, res);

    const { path, id, query } = parseRoute(req.url || '/');
    const method = req.method || 'GET';

    try {
      // Health check (no auth required)
      if (path === '/healthz' && method === 'GET') {
        sendJson(res, 200, {
          status: 'ok',
          uptime: process.uptime(),
          timestamp: Date.now(),
        });
        return;
      }

      // Auth verification endpoint
      if (path === '/api/auth' && method === 'POST') {
        const body = await parseBody<{ apiKey: string }>(req);
        const valid = validateApiKey(body.apiKey);
        sendJson(res, 200, { valid });
        return;
      }

      // All other endpoints require authentication
      if (!authMiddleware(req, res)) {
        return;
      }

      // POST /api/chat - Simple chat (lightweight, no run tracking)
      if (path === '/api/chat' && method === 'POST') {
        const body = await parseBody<{ message: string }>(req);

        if (!body.message) {
          sendJson(res, 400, { error: 'Bad Request', message: 'message is required' });
          return;
        }

        try {
          const gemini = new GeminiExecutor();
          const result = await gemini.execute(body.message, { timeout: 30000 });

          if (result.success) {
            sendJson(res, 200, { reply: result.output });
          } else {
            sendJson(res, 200, { reply: '죄송합니다. 응답을 생성할 수 없습니다.' });
          }
        } catch {
          sendJson(res, 200, { reply: '죄송합니다. 응답을 생성할 수 없습니다.' });
        }
        return;
      }

      // POST /api/runs - Create new run
      if (path === '/api/runs' && method === 'POST') {
        const body = await parseBody<RunOptions>(req);

        if (!body.prompt) {
          sendJson(res, 400, { error: 'Bad Request', message: 'prompt is required' });
          return;
        }

        try {
          const run = runManager.createRun(body);

          // Start execution asynchronously
          executeRun(run.id, runManager, body);

          sendJson(res, 201, { runId: run.id });

          // Broadcast runs:list to all connected clients
          onRunCreated?.();
        } catch (e) {
          if ((e as Error).message.includes('Maximum concurrent runs')) {
            sendJson(res, 429, { error: 'Too Many Requests', message: (e as Error).message });
          } else {
            throw e;
          }
        }
        return;
      }

      // GET /api/runs - List all runs
      if (path === '/api/runs' && method === 'GET') {
        const runs = runManager.getAllRunStatuses();
        sendJson(res, 200, { runs });
        return;
      }

      // GET /api/runs/:id - Get run status
      if (path === '/api/runs/:id' && method === 'GET' && id) {
        const status = runManager.getRunStatus(id);
        if (!status) {
          sendJson(res, 404, { error: 'Not Found', message: `Run ${id} not found` });
          return;
        }
        sendJson(res, 200, status);
        return;
      }

      // DELETE /api/runs/:id - Cancel run
      if (path === '/api/runs/:id' && method === 'DELETE' && id) {
        const cancelled = runManager.cancelRun(id);
        if (!cancelled) {
          sendJson(res, 404, { error: 'Not Found', message: `Run ${id} not found or not running` });
          return;
        }
        sendJson(res, 200, { cancelled: true, runId: id });
        return;
      }

      // ============ Task API ============

      // GET /api/tasks - List root tasks or tree
      if (path === '/api/tasks' && method === 'GET') {
        const taskStore = TaskStore.getInstance();
        const format = query?.format;

        if (format === 'tree') {
          const tree = taskStore.getTree();
          sendJson(res, 200, { tasks: tree });
        } else {
          const roots = taskStore.getRoots();
          sendJson(res, 200, { tasks: roots });
        }
        return;
      }

      // POST /api/tasks - Create task
      if (path === '/api/tasks' && method === 'POST') {
        const body = await parseBody<CreateTaskInput>(req);

        if (!body.name) {
          sendJson(res, 400, { error: 'Bad Request', message: 'name is required' });
          return;
        }

        const taskStore = TaskStore.getInstance();
        const changedBy = req.headers['x-changed-by'] as string || 'user';
        const task = taskStore.create(body, changedBy);
        sendJson(res, 201, { task });
        return;
      }

      // GET /api/tasks/:id - Get task
      if (path === '/api/tasks/:id' && method === 'GET' && id) {
        const taskStore = TaskStore.getInstance();
        const task = taskStore.get(id);

        if (!task) {
          sendJson(res, 404, { error: 'Not Found', message: `Task ${id} not found` });
          return;
        }
        sendJson(res, 200, { task });
        return;
      }

      // PATCH /api/tasks/:id - Update task
      if (path === '/api/tasks/:id' && method === 'PATCH' && id) {
        const body = await parseBody<UpdateTaskInput>(req);
        const taskStore = TaskStore.getInstance();
        const changedBy = req.headers['x-changed-by'] as string || 'user';

        try {
          const task = taskStore.update(id, body, changedBy);
          sendJson(res, 200, { task });
        } catch (e) {
          if ((e as Error).message.includes('not found')) {
            sendJson(res, 404, { error: 'Not Found', message: (e as Error).message });
          } else {
            throw e;
          }
        }
        return;
      }

      // DELETE /api/tasks/:id - Delete task (soft)
      if (path === '/api/tasks/:id' && method === 'DELETE' && id) {
        const taskStore = TaskStore.getInstance();
        taskStore.delete(id);
        sendJson(res, 200, { deleted: true, taskId: id });
        return;
      }

      // GET /api/tasks/:id/children - Get children
      if (path === '/api/tasks/:id/children' && method === 'GET' && id) {
        const taskStore = TaskStore.getInstance();
        const children = taskStore.getChildren(id);
        sendJson(res, 200, { tasks: children });
        return;
      }

      // GET /api/tasks/:id/context - Get task with resolved context
      if (path === '/api/tasks/:id/context' && method === 'GET' && id) {
        const taskStore = TaskStore.getInstance();
        const maxLevels = query?.maxLevels ? parseInt(query.maxLevels, 10) : 3;
        const task = taskStore.getWithContext(id, maxLevels);

        if (!task) {
          sendJson(res, 404, { error: 'Not Found', message: `Task ${id} not found` });
          return;
        }
        sendJson(res, 200, { task });
        return;
      }

      // GET /api/tasks/:id/history - Get context history
      if (path === '/api/tasks/:id/history' && method === 'GET' && id) {
        const taskStore = TaskStore.getInstance();
        const history = taskStore.getContextHistory(id);
        sendJson(res, 200, { history });
        return;
      }

      // GET /api/tasks/search - Search tasks
      if (path === '/api/tasks/search' && method === 'GET') {
        const q = query?.q || '';
        const taskStore = TaskStore.getInstance();
        const tasks = taskStore.search(q);
        sendJson(res, 200, { tasks });
        return;
      }

      // GET /api/tasks/stats - Get statistics
      if (path === '/api/tasks/stats' && method === 'GET') {
        const taskStore = TaskStore.getInstance();
        const stats = taskStore.getStats();
        sendJson(res, 200, { stats });
        return;
      }

      // Not found
      sendJson(res, 404, { error: 'Not Found', message: `${method} ${path} not found` });
    } catch (e) {
      console.error('API error:', e);
      sendJson(res, 500, { error: 'Internal Server Error', message: (e as Error).message });
    }
  };
}

/**
 * Execute a run asynchronously
 */
async function executeRun(runId: string, runManager: RunManager, options: RunOptions): Promise<void> {
  const run = runManager.getRun(runId);
  if (!run) return;

  const { bus, abortController } = run;

  try {
    // Run the orchestrator
    const result = await runParallel({
      prompt: options.prompt,
      context: options.context,
      agents: options.agents,
      usePro: options.usePro,
      timeout: options.timeout,
      bus,
      signal: abortController.signal,
    });

    // Check if aborted
    if (abortController.signal.aborted) {
      runManager.completeRun(runId, false);
      return;
    }

    // Determine success
    const success = (result.gemini?.success ?? true) && (result.gpt?.success ?? true);
    runManager.completeRun(runId, success);
  } catch (e) {
    bus.emitLog('error', `Run failed: ${(e as Error).message}`, 'run-manager');
    runManager.completeRun(runId, false);
  }
}
