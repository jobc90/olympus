import { basename } from 'node:path';
import type { RegisteredWorker } from '@olympus-dev/protocol';
import type { WorkerRegistry } from '../worker-registry.js';

export interface SelectProjectWorkerInput {
  projectId: string;
  preferredWorkerId?: string | null;
  requiredRoleTags?: string[];
  requiredSkills?: string[];
}

export interface ProjectWorkerMatch {
  worker: RegisteredWorker;
  score: {
    continuity: number;
    capability: number;
    idle: number;
  };
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function countMatches(haystack: readonly string[] | undefined, needles: readonly string[] | undefined): number {
  if (!haystack?.length || !needles?.length) return 0;
  const haystackSet = new Set(haystack.map(normalize));
  return needles.reduce((count, needle) => count + (haystackSet.has(normalize(needle)) ? 1 : 0), 0);
}

function matchesProject(worker: RegisteredWorker, projectId: string): boolean {
  const target = normalize(projectId);
  return (
    normalize(worker.name) === target ||
    normalize(basename(worker.projectPath)) === target ||
    normalize(worker.projectPath).includes(target)
  );
}

export class ProjectScheduler {
  constructor(private readonly workerRegistry: Pick<WorkerRegistry, 'getAll' | 'listByProject'>) {}

  getProjectWorkerPool(projectId: string): RegisteredWorker[] {
    return this.workerRegistry.listByProject(projectId).filter(worker => matchesProject(worker, projectId));
  }

  selectWorker(input: SelectProjectWorkerInput): ProjectWorkerMatch | null {
    const pool = this.getProjectWorkerPool(input.projectId).filter(worker => worker.status !== 'offline');
    if (pool.length === 0) {
      return null;
    }

    const scored = pool.map((worker): ProjectWorkerMatch => ({
      worker,
      score: {
        continuity: input.preferredWorkerId === worker.id ? 1 : 0,
        capability:
          countMatches(worker.roleTags, input.requiredRoleTags) +
          countMatches(worker.skills, input.requiredSkills),
        idle: worker.status === 'idle' ? 1 : 0,
      },
    }));

    scored.sort((left, right) => {
      if (right.score.continuity !== left.score.continuity) {
        return right.score.continuity - left.score.continuity;
      }
      if (right.score.capability !== left.score.capability) {
        return right.score.capability - left.score.capability;
      }
      if (right.score.idle !== left.score.idle) {
        return right.score.idle - left.score.idle;
      }
      if (left.worker.isEphemeral !== right.worker.isEphemeral) {
        return Number(left.worker.isEphemeral) - Number(right.worker.isEphemeral);
      }
      return left.worker.registeredAt - right.worker.registeredAt;
    });

    return scored[0] ?? null;
  }
}
