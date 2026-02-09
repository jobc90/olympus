import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChannelManager } from '../channels/manager.js';
import { DashboardChannel } from '../channels/dashboard.js';
import type { ChannelPlugin, ChannelMessage } from '../channels/types.js';

class MockChannel implements ChannelPlugin {
  readonly name = 'mock';
  readonly sentMessages: Array<{ target: string; message: ChannelMessage }> = [];
  destroyed = false;

  async initialize(): Promise<void> {}

  async sendMessage(target: string, message: ChannelMessage): Promise<void> {
    this.sentMessages.push({ target, message });
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
  }
}

describe('ChannelManager', () => {
  let manager: ChannelManager;

  beforeEach(() => {
    manager = new ChannelManager();
  });

  it('should register and list channels', async () => {
    const channel = new MockChannel();
    await manager.register(channel);

    expect(manager.listChannels()).toEqual(['mock']);
    expect(manager.get('mock')).toBe(channel);
  });

  it('should unregister and destroy channel', async () => {
    const channel = new MockChannel();
    await manager.register(channel);

    await manager.unregister('mock');

    expect(manager.listChannels()).toEqual([]);
    expect(channel.destroyed).toBe(true);
  });

  it('should broadcast to all channels', async () => {
    const ch1 = new MockChannel();
    const ch2 = new MockChannel();
    Object.defineProperty(ch2, 'name', { value: 'mock2' });

    await manager.register(ch1);
    await manager.register(ch2);

    await manager.broadcast({
      type: 'text',
      content: 'hello',
    });

    expect(ch1.sentMessages.length).toBe(1);
    expect(ch2.sentMessages.length).toBe(1);
    expect(ch1.sentMessages[0].message.content).toBe('hello');
  });

  it('should broadcast to specific channel', async () => {
    const ch1 = new MockChannel();
    const ch2 = new MockChannel();
    Object.defineProperty(ch2, 'name', { value: 'mock2' });

    await manager.register(ch1);
    await manager.register(ch2);

    await manager.broadcast({ type: 'text', content: 'targeted' }, 'mock');

    expect(ch1.sentMessages.length).toBe(1);
    expect(ch2.sentMessages.length).toBe(0);
  });

  it('should sendTo specific channel and target', async () => {
    const ch = new MockChannel();
    await manager.register(ch);

    await manager.sendTo('mock', 'user123', { type: 'result', content: 'done' });

    expect(ch.sentMessages.length).toBe(1);
    expect(ch.sentMessages[0].target).toBe('user123');
    expect(ch.sentMessages[0].message.type).toBe('result');
  });

  it('should handle incoming messages', async () => {
    const handler = vi.fn();
    manager.onCommand(handler);

    await manager.handleIncoming({
      channelType: 'test',
      senderId: 'user1',
      content: 'do something',
    });

    expect(handler).toHaveBeenCalledWith({
      channelType: 'test',
      senderId: 'user1',
      content: 'do something',
    });
  });

  it('should not fail on broadcast when channel throws', async () => {
    const failChannel: ChannelPlugin = {
      name: 'failing',
      async initialize() {},
      async sendMessage() { throw new Error('channel error'); },
      async destroy() {},
    };

    const goodChannel = new MockChannel();

    await manager.register(failChannel);
    await manager.register(goodChannel);

    // Should not throw
    await manager.broadcast({ type: 'text', content: 'test' });

    // Good channel should still receive
    expect(goodChannel.sentMessages.length).toBe(1);
  });

  it('should destroyAll channels', async () => {
    const ch1 = new MockChannel();
    const ch2 = new MockChannel();
    Object.defineProperty(ch2, 'name', { value: 'mock2' });

    await manager.register(ch1);
    await manager.register(ch2);

    await manager.destroyAll();

    expect(ch1.destroyed).toBe(true);
    expect(ch2.destroyed).toBe(true);
    expect(manager.listChannels()).toEqual([]);
  });
});

describe('DashboardChannel', () => {
  it('should send progress events via broadcast', async () => {
    const channel = new DashboardChannel();
    const broadcastSpy = vi.fn();
    channel.setBroadcast(broadcastSpy);

    await channel.sendMessage('broadcast', {
      type: 'progress',
      content: '작업 진행 중',
      metadata: { taskId: 't1' },
    });

    expect(broadcastSpy).toHaveBeenCalledWith('agent:progress', {
      taskId: 't1',
      message: '작업 진행 중',
    });
  });

  it('should send result events via broadcast', async () => {
    const channel = new DashboardChannel();
    const broadcastSpy = vi.fn();
    channel.setBroadcast(broadcastSpy);

    await channel.sendMessage('broadcast', {
      type: 'result',
      content: '완료',
    });

    expect(broadcastSpy).toHaveBeenCalledWith('agent:result', {
      report: '완료',
    });
  });

  it('should send error events via broadcast', async () => {
    const channel = new DashboardChannel();
    const broadcastSpy = vi.fn();
    channel.setBroadcast(broadcastSpy);

    await channel.sendMessage('broadcast', {
      type: 'error',
      content: '에러 발생',
    });

    expect(broadcastSpy).toHaveBeenCalledWith('agent:error', {
      error: '에러 발생',
    });
  });

  it('should send question events via broadcast', async () => {
    const channel = new DashboardChannel();
    const broadcastSpy = vi.fn();
    channel.setBroadcast(broadcastSpy);

    await channel.sendMessage('broadcast', {
      type: 'question',
      content: '승인하시겠습니까?',
    });

    expect(broadcastSpy).toHaveBeenCalledWith('agent:question', {
      question: '승인하시겠습니까?',
    });
  });

  it('should send default message type via broadcast', async () => {
    const channel = new DashboardChannel();
    const broadcastSpy = vi.fn();
    channel.setBroadcast(broadcastSpy);

    await channel.sendMessage('broadcast', {
      type: 'text',
      content: 'hello',
    });

    expect(broadcastSpy).toHaveBeenCalledWith('agent:message', {
      content: 'hello',
    });
  });

  it('should not fail when no broadcast function set', async () => {
    const channel = new DashboardChannel();
    // No setBroadcast called
    await expect(channel.sendMessage('broadcast', { type: 'text', content: 'test' })).resolves.not.toThrow();
  });

  it('should cleanup on destroy', async () => {
    const channel = new DashboardChannel();
    channel.setBroadcast(vi.fn());

    await channel.destroy();

    // After destroy, sendMessage should be a no-op (no error)
    await expect(channel.sendMessage('broadcast', { type: 'text', content: 'test' })).resolves.not.toThrow();
  });
});
