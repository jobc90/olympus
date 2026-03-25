export interface WorkerControlPlaneClientOptions {
  gatewayUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export interface RegisteredWorker {
  id: string;
  name: string;
}

export interface RegisterWorkerInput {
  name: string;
  projectPath: string;
  pid: number;
  runtimeKind: 'tmux' | 'pty';
  hasLocalPty: boolean;
}

export function resolveAvailableWorkerNameFromSet(
  desiredName: string,
  existingNames: Set<string>,
): { workerName: string; conflicted: boolean } {
  if (!existingNames.has(desiredName)) {
    return {
      workerName: desiredName,
      conflicted: false,
    };
  }

  let suffix = 2;
  while (existingNames.has(`${desiredName}-${suffix}`)) {
    suffix++;
  }

  return {
    workerName: `${desiredName}-${suffix}`,
    conflicted: true,
  };
}

export class WorkerControlPlaneClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: WorkerControlPlaneClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async ensureGatewayHealthy(): Promise<void> {
    const healthRes = await this.fetchImpl(`${this.options.gatewayUrl}/healthz`);
    if (!healthRes.ok) {
      throw new Error(`HTTP ${healthRes.status}`);
    }
  }

  async resolveAvailableWorkerName(desiredName: string): Promise<{ workerName: string; conflicted: boolean }> {
    try {
      const listRes = await this.fetchImpl(`${this.options.gatewayUrl}/api/workers`, {
        headers: { Authorization: `Bearer ${this.options.apiKey}` },
        signal: AbortSignal.timeout(3_000),
      });
      if (!listRes.ok) {
        return {
          workerName: desiredName,
          conflicted: false,
        };
      }

      const data = await listRes.json() as { workers?: Array<{ name: string }> };
      const existingNames = new Set((data.workers ?? []).map((worker) => worker.name));
      return resolveAvailableWorkerNameFromSet(desiredName, existingNames);
    } catch {
      return {
        workerName: desiredName,
        conflicted: false,
      };
    }
  }

  async registerWorker(input: RegisterWorkerInput): Promise<RegisteredWorker> {
    const regRes = await this.fetchImpl(`${this.options.gatewayUrl}/api/workers/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify(input),
    });
    if (!regRes.ok) {
      throw new Error(`HTTP ${regRes.status}`);
    }

    const data = await regRes.json() as { worker: RegisteredWorker };
    return data.worker;
  }

  async deregisterWorker(workerId: string): Promise<void> {
    await this.fetchImpl(`${this.options.gatewayUrl}/api/workers/${workerId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.options.apiKey}` },
    });
  }
}
