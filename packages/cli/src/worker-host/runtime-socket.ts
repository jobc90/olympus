import { createServer, createConnection, type Server, type Socket } from 'node:net';
import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  createRuntimeControlError,
  type RuntimeControlRequest,
  type RuntimeControlResponse,
} from '@olympus-dev/protocol';

export interface CreateRuntimeSocketPathInput {
  socketsRoot: string;
  projectId: string;
  workerId: string;
}

export interface RuntimeSocketServerOptions {
  socketPath: string;
  handler: (
    request: RuntimeControlRequest,
  ) => RuntimeControlResponse | Promise<RuntimeControlResponse>;
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

export function createRuntimeSocketPath(input: CreateRuntimeSocketPathInput): string {
  return join(
    input.socketsRoot,
    `${sanitizePathSegment(input.projectId)}-${sanitizePathSegment(input.workerId)}.sock`,
  );
}

export class RuntimeSocketServer {
  private server: Server | null = null;

  constructor(private readonly options: RuntimeSocketServerOptions) {}

  async start(): Promise<void> {
    await mkdir(dirname(this.options.socketPath), { recursive: true });
    await rm(this.options.socketPath, { force: true });

    this.server = createServer((socket) => {
      this.handleConnection(socket);
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.options.socketPath, () => {
        this.server!.off('error', reject);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) {
      await rm(this.options.socketPath, { force: true });
      return;
    }

    const server = this.server;
    this.server = null;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    await rm(this.options.socketPath, { force: true });
  }

  async exists(): Promise<boolean> {
    try {
      await stat(this.options.socketPath);
      return true;
    } catch {
      return false;
    }
  }

  private handleConnection(socket: Socket): void {
    let buffer = '';

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');

      while (buffer.includes('\n')) {
        const newlineIndex = buffer.indexOf('\n');
        const rawLine = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!rawLine) continue;
        void this.handleLine(socket, rawLine);
      }
    });
  }

  private async handleLine(socket: Socket, rawLine: string): Promise<void> {
    let request: RuntimeControlRequest;

    try {
      request = JSON.parse(rawLine) as RuntimeControlRequest;
    } catch {
      socket.write(`${JSON.stringify(createRuntimeControlError({
        request_id: 'unknown',
        worker_id: 'unknown',
        code: 'INVALID_REQUEST',
        message: 'Invalid JSON payload',
      }))}\n`);
      return;
    }

    try {
      const response = await this.options.handler(request);
      socket.write(`${JSON.stringify(response)}\n`);
    } catch (error) {
      socket.write(`${JSON.stringify(createRuntimeControlError({
        request_id: request.request_id,
        worker_id: request.worker_id,
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown runtime socket error',
      }))}\n`);
    }
  }
}

export class RuntimeSocketClient {
  constructor(private readonly socketPath: string) {}

  async send(request: RuntimeControlRequest): Promise<RuntimeControlResponse> {
    return new Promise<RuntimeControlResponse>((resolve, reject) => {
      const socket = createConnection(this.socketPath);
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
}
