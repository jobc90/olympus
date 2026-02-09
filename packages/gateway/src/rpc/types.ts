import type { WebSocket } from 'ws';

/**
 * RPC method handler function signature.
 * Receives typed params and returns a result (or throws for errors).
 */
export type RpcHandler<TParams = unknown, TResult = unknown> = (
  params: TParams,
  context: RpcContext,
) => Promise<TResult> | TResult;

/**
 * Context passed to every RPC handler
 */
export interface RpcContext {
  clientId: string;
  ws: WebSocket;
  authenticated: boolean;
}

/**
 * Registered method entry
 */
export interface MethodEntry {
  handler: RpcHandler;
  requiresAuth: boolean;
}
