import type { HealthResult, StatusResult } from '@olympus-dev/protocol';
import { PROTOCOL_VERSION } from '@olympus-dev/protocol';
import type { RpcRouter } from './handler.js';

/**
 * Register built-in system RPC methods.
 * Agent/Worker/Session methods are registered by their respective modules.
 */
export function registerSystemMethods(
  router: RpcRouter,
  deps: {
    getUptime: () => number;
    getAgentState: () => string;
    getActiveWorkerCount: () => number;
    getConnectedClientCount: () => number;
    getActiveSessionCount: () => number;
  },
): void {
  // health — always allowed (no auth required)
  router.register(
    'health',
    (): HealthResult => ({
      status: 'ok',
      uptime: deps.getUptime(),
      version: PROTOCOL_VERSION,
    }),
    false, // no auth required
  );

  // status — requires auth
  router.register(
    'status',
    (): StatusResult => ({
      agentState: deps.getAgentState(),
      activeWorkers: deps.getActiveWorkerCount(),
      connectedClients: deps.getConnectedClientCount(),
      activeSessions: deps.getActiveSessionCount(),
    }),
  );
}
