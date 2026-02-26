import type { WorkerAvatar } from './types';

// 20 worker avatars (Zeus/Hera excluded from worker pool)
// Must align with DIVERSE_AVATAR_ORDER_V2[2-21] in sprites/characters.ts
export const WORKER_AVATAR_POOL: WorkerAvatar[] = [
  'athena',
  'poseidon',
  'ares',
  'apollo',
  'artemis',
  'hermes',
  'hephaestus',
  'dionysus',
  'demeter',
  'aphrodite',
  'hades',
  'persephone',
  'hestia',    // replaces: prometheus (no v2 sprite)
  'helios',
  'eros',      // replaces: nike (no v2 sprite)
  'pan',
  'gaia',      // replaces: hecate (no v2 sprite)
  'nyx',       // replaces: iris (no v2 sprite)
  'heracles',
  'selene',
];

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithSeed<T>(items: T[], seed: number): T[] {
  const rng = seededRandom(seed);
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Deterministic random assignment:
 * - Up to 20 workers: no duplicates
 * - Over 20 workers: reuse allowed (pool cycles)
 */
export function assignWorkerAvatars(workerIds: string[]): Map<string, WorkerAvatar> {
  const uniqueIds = [...new Set(workerIds)];
  const sortedIds = uniqueIds.sort((a, b) => {
    const ha = hashString(a);
    const hb = hashString(b);
    if (ha !== hb) return ha - hb;
    return a.localeCompare(b);
  });
  const seed = hashString(sortedIds.join('|') || 'olympus-workers');
  const shuffledPool = shuffleWithSeed(WORKER_AVATAR_POOL, seed);
  const assigned = new Map<string, WorkerAvatar>();

  for (let i = 0; i < sortedIds.length; i++) {
    assigned.set(sortedIds[i], shuffledPool[i % shuffledPool.length]);
  }

  return assigned;
}
