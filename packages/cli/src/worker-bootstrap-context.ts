import chalk from 'chalk';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { basename, resolve } from 'node:path';
import type { OlympusClientConfig } from '@olympus-dev/gateway';
import {
  WorkerControlPlaneClient,
  type RegisteredWorker,
  type RegisterWorkerInput,
} from './worker-control-plane-client.js';
import type { WorkerRuntimeKind } from './worker-runtime.js';

export interface WorkerBootstrapContext {
  projectPath: string;
  runtimeKind: WorkerRuntimeKind;
  runtimeSocketsRoot: string;
  gatewayUrl: string;
  apiKey: string;
  controlPlaneClient: WorkerControlPlaneClientLike;
  workerId: string;
  workerName: string;
}

export interface WorkerControlPlaneClientLike {
  ensureGatewayHealthy(): Promise<void>;
  resolveAvailableWorkerName(desiredName: string): Promise<{ workerName: string; conflicted: boolean }>;
  registerWorker(input: RegisterWorkerInput): Promise<RegisteredWorker>;
  deregisterWorker(workerId: string): Promise<void>;
}

export interface PrepareWorkerBootstrapContextInput {
  opts: Record<string, unknown>;
  forceTrust: boolean;
  envRuntimeSocketsRoot?: string | undefined;
  loadGatewayConfig?: () => Promise<Pick<OlympusClientConfig, 'apiKey'> & Partial<Pick<OlympusClientConfig, 'gatewayUrl' | 'gatewayHost' | 'gatewayPort'>>>;
  createControlPlaneClient?: (options: { gatewayUrl: string; apiKey: string }) => WorkerControlPlaneClientLike;
  logBrief: (message: string) => void;
  exit?: (code: number) => never;
}

export function resolveWorkerRuntimeKind(runtime: unknown): WorkerRuntimeKind {
  if (runtime === undefined || runtime === null || runtime === '') return 'tmux';
  if (runtime === 'tmux' || runtime === 'pty') return runtime;
  throw new Error(`Unsupported worker runtime: ${String(runtime)}`);
}

export function resolveRuntimeSocketsRoot(
  envValue: string | undefined,
  homeDirectory = homedir(),
): string {
  if (envValue && envValue.trim()) return envValue;
  return join(homeDirectory, '.olympus', 'runtime-sockets');
}

function defaultExit(code: number): never {
  process.exit(code);
}

export async function prepareWorkerBootstrapContext(
  input: PrepareWorkerBootstrapContextInput,
): Promise<WorkerBootstrapContext> {
  const projectPath = resolve(input.opts.project as string);
  const runtimeKind = resolveWorkerRuntimeKind(input.opts.runtime);
  const runtimeSocketsRoot = resolveRuntimeSocketsRoot(input.envRuntimeSocketsRoot);
  let workerName = (input.opts.name as string) || basename(projectPath);

  const loadGatewayConfig = input.loadGatewayConfig ?? (async () => {
    const { loadConfig } = await import('@olympus-dev/gateway');
    return loadConfig();
  });
  const config = await loadGatewayConfig();
  const gatewayUrl = config.gatewayUrl || `http://${config.gatewayHost}:${config.gatewayPort}`;
  const apiKey = config.apiKey;

  const createControlPlaneClient = input.createControlPlaneClient
    ?? ((options: { gatewayUrl: string; apiKey: string }) => new WorkerControlPlaneClient(options));
  const controlPlaneClient = createControlPlaneClient({ gatewayUrl, apiKey });
  const exit = input.exit ?? defaultExit;

  const trustLabel = input.forceTrust ? chalk.yellow('trust') : chalk.gray('interactive');
  input.logBrief(chalk.gray(`⚡ Olympus Worker (${runtimeKind} mode, ${trustLabel})`));

  try {
    await controlPlaneClient.ensureGatewayHealthy();
  } catch {
    input.logBrief(chalk.red(`  Gateway 연결 실패: ${gatewayUrl}`));
    input.logBrief(chalk.gray('  olympus server start로 Gateway를 먼저 시작하세요.'));
    return exit(1);
  }

  if (!input.opts.name) {
    const resolved = await controlPlaneClient.resolveAvailableWorkerName(workerName);
    if (resolved.conflicted) {
      const base = workerName;
      workerName = resolved.workerName;
      input.logBrief(chalk.yellow(`  ⚠ '${base}' 이름 충돌 → '${workerName}'으로 자동 변경`));
      input.logBrief(chalk.gray('    직접 지정: olympus start --name <이름>'));
      input.logBrief('');
    }
  }

  let worker: RegisteredWorker;
  try {
    worker = await controlPlaneClient.registerWorker({
      name: workerName,
      projectPath,
      pid: process.pid,
      runtimeKind,
      hasLocalPty: runtimeKind === 'pty',
    });
  } catch (err) {
    input.logBrief(chalk.red(`  워커 등록 실패: ${(err as Error).message}`));
    return exit(1);
  }

  workerName = worker.name;
  input.logBrief(chalk.gray(`  Worker: ${workerName} (${runtimeKind})`));
  input.logBrief(chalk.green('  ✅ Gateway에 등록 완료 — Telegram/Dashboard에서 작업을 받을 수 있습니다'));
  if (input.forceTrust) {
    input.logBrief(chalk.gray(`  💡 Telegram: @${workerName} git status`));
  }
  input.logBrief('');

  return {
    projectPath,
    runtimeKind,
    runtimeSocketsRoot,
    gatewayUrl,
    apiKey,
    controlPlaneClient,
    workerId: worker.id,
    workerName,
  };
}
