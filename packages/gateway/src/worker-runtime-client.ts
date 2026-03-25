import { createConnection } from 'node:net';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  createRuntimeControlRequest,
  type RegisteredWorker,
  type RuntimeAcceptedResult,
  type RuntimeControlRequest,
  type RuntimeControlResponse,
  type RuntimeStateResult,
  type RuntimeTerminalSnapshotResult,
  supportsWorkerRuntimeControl,
} from '@olympus-dev/protocol';

export interface WorkerRuntimeClientOptions {
  socketsRoot?: string;
  requestIdFactory?: () => string;
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

export function resolveGatewayRuntimeSocketsRoot(
  envValue: string | undefined,
  homeDirectory = homedir(),
): string {
  if (envValue && envValue.trim()) return envValue;
  return join(homeDirectory, '.olympus', 'runtime-sockets');
}

function resolveWorkerSocketPath(socketsRoot: string, worker: RegisteredWorker): string {
  return join(
    socketsRoot,
    `${sanitizePathSegment(basename(worker.projectPath))}-${sanitizePathSegment(worker.name)}.sock`,
  );
}

export class WorkerRuntimeClient {
  private readonly socketsRoot: string;

  private readonly requestIdFactory: () => string;

  constructor(options: WorkerRuntimeClientOptions = {}) {
    this.socketsRoot = resolveGatewayRuntimeSocketsRoot(options.socketsRoot);
    this.requestIdFactory = options.requestIdFactory ?? (() => randomUUID());
  }

  async captureSnapshot(
    worker: RegisteredWorker,
    lines = 200,
  ): Promise<RuntimeTerminalSnapshotResult> {
    const response = await this.send(worker, 'capture_terminal_snapshot', { lines });
    return this.expectResult(response, 'terminal_snapshot') as RuntimeTerminalSnapshotResult;
  }

  async getState(worker: RegisteredWorker): Promise<RuntimeStateResult> {
    const response = await this.send(worker, 'get_state', {});
    return this.expectResult(response, 'state') as RuntimeStateResult;
  }

  async lockInput(worker: RegisteredWorker, reason: string): Promise<RuntimeStateResult> {
    const response = await this.send(worker, 'lock_input', { reason });
    return this.expectResult(response, 'state') as RuntimeStateResult;
  }

  async unlockInput(worker: RegisteredWorker, reason?: string): Promise<RuntimeStateResult> {
    const response = await this.send(worker, 'unlock_input', { reason });
    return this.expectResult(response, 'state') as RuntimeStateResult;
  }

  async resetSession(worker: RegisteredWorker, reason?: string): Promise<RuntimeAcceptedResult> {
    const response = await this.send(worker, 'reset_session', { reason });
    return this.expectResult(response, 'accepted') as RuntimeAcceptedResult;
  }

  async sendInput(
    worker: RegisteredWorker,
    text: string,
    submit = false,
    source: 'dashboard' | 'terminal' | 'remote' = 'dashboard',
  ): Promise<RuntimeAcceptedResult> {
    const response = await this.send(worker, 'send_input', { text, submit, source });
    return this.expectResult(response, 'accepted') as RuntimeAcceptedResult;
  }

  async softPreempt(
    worker: RegisteredWorker,
    taskId: string,
    replacementTaskId?: string,
    reason = 'soft preempt requested',
  ): Promise<RuntimeAcceptedResult> {
    const response = await this.send(worker, 'soft_preempt', {
      task_id: taskId,
      replacement_task_id: replacementTaskId,
      reason,
    });
    return this.expectResult(response, 'accepted') as RuntimeAcceptedResult;
  }

  private async send(
    worker: RegisteredWorker,
    command: RuntimeControlRequest['command'],
    payload: RuntimeControlRequest['payload'],
  ): Promise<RuntimeControlResponse> {
    if (!supportsWorkerRuntimeControl(worker)) {
      throw new Error(`Worker ${worker.name} does not support runtime control`);
    }

    const request = createRuntimeControlRequest({
      request_id: this.requestIdFactory(),
      worker_id: worker.name,
      command,
      payload,
    });

    return new Promise<RuntimeControlResponse>((resolve, reject) => {
      const socket = createConnection(resolveWorkerSocketPath(this.socketsRoot, worker));
      let buffer = '';

      socket.once('connect', () => {
        socket.write(`${JSON.stringify(request)}\n`);
      });

      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex < 0) return;

        const rawLine = buffer.slice(0, newlineIndex).trim();
        socket.end();

        try {
          resolve(JSON.parse(rawLine) as RuntimeControlResponse);
        } catch (error) {
          reject(error);
        }
      });

      socket.once('error', reject);
    });
  }

  private expectResult(
    response: RuntimeControlResponse,
    expectedType: string,
  ) {
    if (!response.ok) {
      throw new Error(response.error.message);
    }
    if (response.result.type !== expectedType) {
      throw new Error(`Unexpected runtime control result: ${response.result.type}`);
    }
    return response.result;
  }
}
