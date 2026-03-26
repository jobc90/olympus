import { describe, expect, it, vi } from 'vitest';
import { prepareWorkerBootstrapContext } from '../worker-bootstrap-context.js';

describe('prepareWorkerBootstrapContext', () => {
  it('resolves gateway config, worker naming, and worker registration', async () => {
    const ensureGatewayHealthy = vi.fn(async () => {});
    const resolveAvailableWorkerName = vi.fn(async () => ({
      conflicted: true,
      workerName: 'server-1',
    }));
    const registerWorker = vi.fn(async () => ({
      id: 'worker-1',
      name: 'server-1',
    }));
    const deregisterWorker = vi.fn(async () => {});
    const logBrief = vi.fn();

    const result = await prepareWorkerBootstrapContext({
      opts: {
        project: '/workspace/server',
      },
      forceTrust: true,
      envRuntimeSocketsRoot: '',
      loadGatewayConfig: async () => ({
        gatewayUrl: 'http://localhost:4000',
        apiKey: 'secret',
      }),
      createControlPlaneClient: () => ({
        ensureGatewayHealthy,
        resolveAvailableWorkerName,
        registerWorker,
        deregisterWorker,
      }) as never,
      logBrief,
    });

    expect(result.runtimeKind).toBe('tmux');
    expect(result.workerName).toBe('server-1');
    expect(result.workerId).toBe('worker-1');
    expect(result.gatewayUrl).toBe('http://localhost:4000');
    expect(result.apiKey).toBe('secret');
    expect(ensureGatewayHealthy).toHaveBeenCalledTimes(1);
    expect(resolveAvailableWorkerName).toHaveBeenCalledWith('server');
    expect(registerWorker).toHaveBeenCalledWith({
      name: 'server-1',
      projectPath: '/workspace/server',
      pid: process.pid,
      runtimeKind: 'tmux',
      hasLocalPty: false,
    });
    expect(logBrief).toHaveBeenCalledWith(expect.stringContaining('이름 충돌'));
    expect(logBrief).toHaveBeenCalledWith(expect.stringContaining('Gateway에 등록 완료'));
  });

  it('exits when gateway health check fails', async () => {
    const ensureGatewayHealthy = vi.fn(async () => {
      throw new Error('down');
    });
    const logBrief = vi.fn();
    const exit = vi.fn(((code: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    await expect(prepareWorkerBootstrapContext({
      opts: {
        project: '/workspace/server',
        runtime: 'pty',
      },
      forceTrust: false,
      envRuntimeSocketsRoot: '/tmp/sockets',
      loadGatewayConfig: async () => ({
        gatewayUrl: 'http://localhost:4000',
        apiKey: 'secret',
      }),
      createControlPlaneClient: () => ({
        ensureGatewayHealthy,
        resolveAvailableWorkerName: vi.fn(),
        registerWorker: vi.fn(),
        deregisterWorker: vi.fn(async () => {}),
      }) as never,
      logBrief,
      exit: exit as unknown as (code: number) => never,
    })).rejects.toThrow('process.exit(1)');

    expect(exit).toHaveBeenCalledWith(1);
    expect(logBrief).toHaveBeenCalledWith(expect.stringContaining('Gateway 연결 실패'));
  });
});
