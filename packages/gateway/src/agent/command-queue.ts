import type { UserCommand } from './types.js';

export interface QueuedCommand {
  command: UserCommand;
  taskId: string;
  enqueuedAt: number;
}

/**
 * Command Queue — bounded FIFO queue for buffering commands when agent is busy.
 *
 * Prevents command loss when the agent is processing another task.
 * Rejects new commands when queue is full (QUEUE_FULL error).
 */
export class CommandQueue {
  private queue: QueuedCommand[] = [];
  private maxSize: number;

  constructor(maxSize = 50) {
    this.maxSize = maxSize;
  }

  /**
   * Add a command to the queue.
   * Throws if queue is full.
   */
  enqueue(command: UserCommand, taskId: string): QueuedCommand {
    if (this.queue.length >= this.maxSize) {
      const err = new Error(`명령 큐가 가득 찼습니다 (최대 ${this.maxSize}개)`) as Error & { code: string };
      err.code = 'QUEUE_FULL';
      throw err;
    }

    const item: QueuedCommand = {
      command,
      taskId,
      enqueuedAt: Date.now(),
    };
    this.queue.push(item);
    return item;
  }

  /**
   * Remove and return the next command from the queue (FIFO).
   */
  dequeue(): QueuedCommand | null {
    return this.queue.shift() ?? null;
  }

  /**
   * Peek at the next command without removing it.
   */
  peek(): QueuedCommand | null {
    return this.queue[0] ?? null;
  }

  /**
   * Current queue size.
   */
  get size(): number {
    return this.queue.length;
  }

  /**
   * Whether the queue is at capacity.
   */
  get isFull(): boolean {
    return this.queue.length >= this.maxSize;
  }

  /**
   * Whether the queue is empty.
   */
  get isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Clear all queued commands.
   */
  clear(): void {
    this.queue.length = 0;
  }

  /**
   * Get all queued commands (read-only snapshot).
   */
  getAll(): ReadonlyArray<QueuedCommand> {
    return [...this.queue];
  }
}
