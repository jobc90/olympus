import type { WebSocket } from 'ws';
import {
  createMessage,
  type WsMessage,
  type RpcRequestPayload,
  type RpcErrorCode,
} from '@olympus-dev/protocol';
import type { RpcHandler, RpcContext, MethodEntry } from './types.js';

/**
 * RPC Router — dispatches WS RPC requests to registered method handlers.
 *
 * Protocol:
 *   → Client: { type: 'rpc', payload: { method, params } }
 *   ← Gateway: { type: 'rpc:ack', payload: { requestId } }
 *   ← Gateway: { type: 'rpc:result', payload: { requestId, result } }
 *   ← Gateway: { type: 'rpc:error', payload: { requestId, code, message } }
 */
export class RpcRouter {
  private methods = new Map<string, MethodEntry>();

  /**
   * Register a method handler.
   * @param method - dot-separated method name (e.g., 'agent.command')
   * @param handler - async function that processes the request
   * @param requiresAuth - whether the client must be authenticated (default: true)
   */
  register(method: string, handler: RpcHandler, requiresAuth = true): void {
    this.methods.set(method, { handler, requiresAuth });
  }

  /**
   * Check if a method is registered
   */
  has(method: string): boolean {
    return this.methods.has(method);
  }

  /**
   * List all registered method names
   */
  listMethods(): string[] {
    return [...this.methods.keys()];
  }

  /**
   * Handle an incoming RPC message.
   * Sends ack immediately, then result or error.
   */
  async handleRpc(
    msg: WsMessage<RpcRequestPayload>,
    context: RpcContext,
    send: (ws: WebSocket, message: unknown) => void,
  ): Promise<void> {
    const { method, params } = msg.payload;
    const requestId = msg.id;

    // Check method exists
    const entry = this.methods.get(method);
    if (!entry) {
      send(context.ws, createMessage('rpc:error', {
        requestId,
        code: 'METHOD_NOT_FOUND' as RpcErrorCode,
        message: `Method '${method}' not found`,
      }));
      return;
    }

    // Check authentication
    if (entry.requiresAuth && !context.authenticated) {
      send(context.ws, createMessage('rpc:error', {
        requestId,
        code: 'UNAUTHORIZED' as RpcErrorCode,
        message: 'Authentication required',
      }));
      return;
    }

    // Send ack
    send(context.ws, createMessage('rpc:ack', {
      requestId,
      message: `Processing ${method}...`,
    }));

    // Execute handler
    try {
      const result = await entry.handler(params ?? {}, context);
      send(context.ws, createMessage('rpc:result', {
        requestId,
        result,
      }));
    } catch (err) {
      const error = err as Error & { code?: RpcErrorCode };
      send(context.ws, createMessage('rpc:error', {
        requestId,
        code: error.code ?? ('INTERNAL_ERROR' as RpcErrorCode),
        message: error.message || 'Internal error',
      }));
    }
  }
}
