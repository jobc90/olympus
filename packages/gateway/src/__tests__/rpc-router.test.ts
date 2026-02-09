import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RpcRouter } from '../rpc/handler.js';
import { createMessage } from '@olympus-dev/protocol';
import type { RpcRequestPayload } from '@olympus-dev/protocol';
import type { RpcContext } from '../rpc/types.js';

describe('RpcRouter', () => {
  let router: RpcRouter;
  let sendMock: ReturnType<typeof vi.fn>;
  let context: RpcContext;

  beforeEach(() => {
    router = new RpcRouter();
    sendMock = vi.fn();
    context = {
      clientId: 'test-client',
      ws: {} as unknown as import('ws').WebSocket,
      authenticated: true,
    };
  });

  it('should register and list methods', () => {
    router.register('health', () => ({ status: 'ok' }), false);
    router.register('status', () => ({ state: 'IDLE' }));

    expect(router.has('health')).toBe(true);
    expect(router.has('status')).toBe(true);
    expect(router.has('unknown')).toBe(false);
    expect(router.listMethods()).toEqual(['health', 'status']);
  });

  it('should handle rpc request with ack then result', async () => {
    router.register('health', () => ({ status: 'ok', uptime: 1000 }), false);

    const msg = createMessage('rpc', { method: 'health' }) as import('@olympus-dev/protocol').WsMessage<RpcRequestPayload>;

    await router.handleRpc(msg, context, sendMock);

    // Should have sent ack + result (2 calls)
    expect(sendMock).toHaveBeenCalledTimes(2);

    // First call = ack
    const ackMsg = sendMock.mock.calls[0][1];
    expect(ackMsg.type).toBe('rpc:ack');
    expect(ackMsg.payload.requestId).toBe(msg.id);

    // Second call = result
    const resultMsg = sendMock.mock.calls[1][1];
    expect(resultMsg.type).toBe('rpc:result');
    expect(resultMsg.payload.requestId).toBe(msg.id);
    expect(resultMsg.payload.result).toEqual({ status: 'ok', uptime: 1000 });
  });

  it('should return METHOD_NOT_FOUND for unknown methods', async () => {
    const msg = createMessage('rpc', { method: 'unknown.method' }) as import('@olympus-dev/protocol').WsMessage<RpcRequestPayload>;

    await router.handleRpc(msg, context, sendMock);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const errorMsg = sendMock.mock.calls[0][1];
    expect(errorMsg.type).toBe('rpc:error');
    expect(errorMsg.payload.code).toBe('METHOD_NOT_FOUND');
  });

  it('should return UNAUTHORIZED for auth-required methods when not authenticated', async () => {
    router.register('status', () => ({ state: 'IDLE' }), true);

    const unauthContext: RpcContext = { ...context, authenticated: false };
    const msg = createMessage('rpc', { method: 'status' }) as import('@olympus-dev/protocol').WsMessage<RpcRequestPayload>;

    await router.handleRpc(msg, unauthContext, sendMock);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const errorMsg = sendMock.mock.calls[0][1];
    expect(errorMsg.type).toBe('rpc:error');
    expect(errorMsg.payload.code).toBe('UNAUTHORIZED');
  });

  it('should allow no-auth methods without authentication', async () => {
    router.register('health', () => ({ status: 'ok' }), false);

    const unauthContext: RpcContext = { ...context, authenticated: false };
    const msg = createMessage('rpc', { method: 'health' }) as import('@olympus-dev/protocol').WsMessage<RpcRequestPayload>;

    await router.handleRpc(msg, unauthContext, sendMock);

    expect(sendMock).toHaveBeenCalledTimes(2); // ack + result
    const resultMsg = sendMock.mock.calls[1][1];
    expect(resultMsg.type).toBe('rpc:result');
  });

  it('should handle async handler errors gracefully', async () => {
    router.register('failing', async () => {
      throw new Error('Something went wrong');
    });

    const msg = createMessage('rpc', { method: 'failing' }) as import('@olympus-dev/protocol').WsMessage<RpcRequestPayload>;

    await router.handleRpc(msg, context, sendMock);

    expect(sendMock).toHaveBeenCalledTimes(2); // ack + error
    const errorMsg = sendMock.mock.calls[1][1];
    expect(errorMsg.type).toBe('rpc:error');
    expect(errorMsg.payload.code).toBe('INTERNAL_ERROR');
    expect(errorMsg.payload.message).toBe('Something went wrong');
  });

  it('should pass custom error codes through', async () => {
    router.register('busy', async () => {
      const err = new Error('Agent busy') as Error & { code: string };
      err.code = 'AGENT_BUSY';
      throw err;
    });

    const msg = createMessage('rpc', { method: 'busy' }) as import('@olympus-dev/protocol').WsMessage<RpcRequestPayload>;

    await router.handleRpc(msg, context, sendMock);

    const errorMsg = sendMock.mock.calls[1][1];
    expect(errorMsg.payload.code).toBe('AGENT_BUSY');
  });

  it('should pass params and context to handler', async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true });
    router.register('test.method', handler);

    const msg = createMessage('rpc', { method: 'test.method', params: { key: 'value' } }) as import('@olympus-dev/protocol').WsMessage<RpcRequestPayload>;

    await router.handleRpc(msg, context, sendMock);

    expect(handler).toHaveBeenCalledWith({ key: 'value' }, context);
  });
});
