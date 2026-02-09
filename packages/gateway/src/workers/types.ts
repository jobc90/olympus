export type {
  WorkerTask,
  WorkerResult,
  WorkerConfig,
} from '@olympus-dev/protocol';

export { DEFAULT_WORKER_CONFIG } from '@olympus-dev/protocol';

export type WorkerStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
