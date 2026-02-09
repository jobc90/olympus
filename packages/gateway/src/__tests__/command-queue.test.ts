import { describe, it, expect } from 'vitest';
import { CommandQueue } from '../agent/command-queue.js';

describe('CommandQueue', () => {
  it('should start empty', () => {
    const queue = new CommandQueue();
    expect(queue.size).toBe(0);
    expect(queue.isEmpty).toBe(true);
    expect(queue.isFull).toBe(false);
  });

  it('should enqueue and dequeue in FIFO order', () => {
    const queue = new CommandQueue();
    queue.enqueue({ command: 'first', senderId: 'a', channelType: 'test' }, 'id1');
    queue.enqueue({ command: 'second', senderId: 'b', channelType: 'test' }, 'id2');
    queue.enqueue({ command: 'third', senderId: 'c', channelType: 'test' }, 'id3');

    expect(queue.size).toBe(3);

    const first = queue.dequeue();
    expect(first?.command.command).toBe('first');
    expect(first?.taskId).toBe('id1');

    const second = queue.dequeue();
    expect(second?.command.command).toBe('second');

    const third = queue.dequeue();
    expect(third?.command.command).toBe('third');

    expect(queue.dequeue()).toBeNull();
  });

  it('should reject when full', () => {
    const queue = new CommandQueue(3);
    queue.enqueue({ command: 'a', senderId: 'x', channelType: 'test' }, 'id1');
    queue.enqueue({ command: 'b', senderId: 'x', channelType: 'test' }, 'id2');
    queue.enqueue({ command: 'c', senderId: 'x', channelType: 'test' }, 'id3');

    expect(queue.isFull).toBe(true);

    try {
      queue.enqueue({ command: 'd', senderId: 'x', channelType: 'test' }, 'id4');
      expect.fail('Should have thrown');
    } catch (err) {
      expect((err as Error & { code: string }).code).toBe('QUEUE_FULL');
    }
  });

  it('should peek without removing', () => {
    const queue = new CommandQueue();
    queue.enqueue({ command: 'peek me', senderId: 'x', channelType: 'test' }, 'id1');

    expect(queue.peek()?.command.command).toBe('peek me');
    expect(queue.size).toBe(1);
  });

  it('should clear all items', () => {
    const queue = new CommandQueue();
    queue.enqueue({ command: 'a', senderId: 'x', channelType: 'test' }, 'id1');
    queue.enqueue({ command: 'b', senderId: 'x', channelType: 'test' }, 'id2');

    queue.clear();
    expect(queue.size).toBe(0);
    expect(queue.isEmpty).toBe(true);
  });

  it('should return all items as read-only snapshot', () => {
    const queue = new CommandQueue();
    queue.enqueue({ command: 'a', senderId: 'x', channelType: 'test' }, 'id1');
    queue.enqueue({ command: 'b', senderId: 'x', channelType: 'test' }, 'id2');

    const items = queue.getAll();
    expect(items.length).toBe(2);
    expect(items[0].taskId).toBe('id1');
    expect(items[1].taskId).toBe('id2');
  });

  it('should record enqueuedAt timestamp', () => {
    const queue = new CommandQueue();
    const before = Date.now();
    const item = queue.enqueue({ command: 'a', senderId: 'x', channelType: 'test' }, 'id1');
    const after = Date.now();

    expect(item.enqueuedAt).toBeGreaterThanOrEqual(before);
    expect(item.enqueuedAt).toBeLessThanOrEqual(after);
  });

  it('should handle default max size of 50', () => {
    const queue = new CommandQueue();
    for (let i = 0; i < 50; i++) {
      queue.enqueue({ command: `cmd-${i}`, senderId: 'x', channelType: 'test' }, `id-${i}`);
    }
    expect(queue.isFull).toBe(true);
  });
});
