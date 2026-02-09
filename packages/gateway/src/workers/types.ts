import { EventEmitter } from 'node:events';

export type {
  WorkerTask,
  WorkerResult,
  WorkerConfig,
} from '@olympus-dev/protocol';

export { DEFAULT_WORKER_CONFIG } from '@olympus-dev/protocol';

export type WorkerStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timeout';

/**
 * Common interface for all worker implementations.
 *
 * Workers emit: 'output' (string), 'error' (string), 'done' (WorkerResult)
 */
export interface Worker extends EventEmitter {
  getStatus(): string;
  getOutput(): string;
  getOutputPreview(maxLength?: number): string;
  start(): Promise<import('@olympus-dev/protocol').WorkerResult>;
  terminate(): void;
}
