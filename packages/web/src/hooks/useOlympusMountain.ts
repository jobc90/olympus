// ============================================================================
// useOlympusMountain — Olympus Mountain animation state machine hook
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  OlympusMountainState,
  WorkerRuntime,
  NpcRuntime,
  GeminiRuntime,
  GeminiBehavior,
  WorkerBehavior,
  WorkerConfig,
  WorkerAvatar,
  CodexConfig,
  CharacterAnim,
  Direction,
  Zone,
  ZoneId,
  Bubble,
} from '../lib/types';
import type { Particle } from '../engine/canvas';
import { findPath, type WalkGrid } from '../engine/pathfinding';
import { gridToScreen } from '../engine/isometric';
import { createWalkGrid } from '../olympus-mountain/layout';
import { BEHAVIOR_MAP, GEMINI_BEHAVIOR_MAP, resolveZone, getAnimForTick, getBubbleText, getParticleType } from '../olympus-mountain/behaviors';
import { getZone, getRandomPointInZone } from '../olympus-mountain/zones';
import { createParticle, tickParticles } from '../sprites/effects';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseOlympusMountainParams {
  workers: WorkerConfig[];
  workerStates: Record<string, { behavior: string }>;
  codexConfig: CodexConfig;
  codexBehavior: string;
  geminiBehavior?: string;
}

export interface UseOlympusMountainReturn {
  olympusMountainState: OlympusMountainState;
  tick: () => void;
}

// ---------------------------------------------------------------------------
// Sanctuary assignments
// ---------------------------------------------------------------------------

const SANCTUARY_ZONES: ZoneId[] = ['sanctuary_0', 'sanctuary_1', 'sanctuary_2', 'sanctuary_3', 'sanctuary_4', 'sanctuary_5'];

interface MotionProfile {
  work: CharacterAnim[];
  think: CharacterAnim[];
  idle: CharacterAnim[];
  social: CharacterAnim[];
  rest: CharacterAnim[];
  celebrate: CharacterAnim[];
  move: CharacterAnim[];
}

const DEFAULT_MOTION: MotionProfile = {
  work: ['sit_typing', 'keyboard_mash'],
  think: ['sit_idle', 'nod'],
  idle: ['stand', 'stretch'],
  social: ['wave', 'raise_hand'],
  rest: ['drink_coffee', 'sit_idle'],
  celebrate: ['thumbs_up', 'celebrate'],
  move: ['walk_frame1', 'walk_frame2'],
};

const AVATAR_MOTION: Record<WorkerAvatar, MotionProfile> = {
  athena:     { work: ['hand_task', 'sit_typing'], think: ['point', 'nod'], idle: ['stand', 'stretch'], social: ['raise_hand', 'point'], rest: ['sit_idle', 'drink_coffee'], celebrate: ['thumbs_up', 'celebrate'], move: ['walk_frame1', 'walk_frame2'] },
  poseidon:   { work: ['sit_typing', 'keyboard_mash'], think: ['sit_idle', 'nod'], idle: ['stand', 'wave'], social: ['wave', 'raise_hand'], rest: ['drink_coffee', 'sit_idle'], celebrate: ['celebrate', 'thumbs_up'], move: ['walk_frame1', 'walk_frame2'] },
  ares:       { work: ['keyboard_mash', 'hand_task'], think: ['stand', 'nod'], idle: ['stand', 'stretch'], social: ['raise_hand', 'wave'], rest: ['sit_idle', 'drink_coffee'], celebrate: ['celebrate', 'thumbs_up'], move: ['run', 'walk_frame1', 'walk_frame2'] },
  apollo:     { work: ['sit_typing', 'point'], think: ['nod', 'sit_idle'], idle: ['stand', 'wave'], social: ['wave', 'raise_hand'], rest: ['drink_coffee', 'sit_idle'], celebrate: ['celebrate', 'thumbs_up'], move: ['walk_frame1', 'walk_frame2'] },
  artemis:    { work: ['hand_task', 'sit_typing'], think: ['point', 'sit_idle'], idle: ['stand', 'nod'], social: ['raise_hand', 'wave'], rest: ['sit_idle', 'drink_coffee'], celebrate: ['thumbs_up', 'celebrate'], move: ['run', 'walk_frame1', 'walk_frame2'] },
  hermes:     { work: ['keyboard_mash', 'sit_typing'], think: ['nod', 'stand'], idle: ['wave', 'stand'], social: ['wave', 'raise_hand'], rest: ['drink_coffee', 'sit_idle'], celebrate: ['celebrate', 'thumbs_up'], move: ['run', 'walk_frame1', 'walk_frame2'] },
  hephaestus: { work: ['hand_task', 'keyboard_mash'], think: ['sit_idle', 'nod'], idle: ['stand', 'stretch'], social: ['raise_hand', 'point'], rest: ['drink_coffee', 'sit_idle'], celebrate: ['thumbs_up', 'celebrate'], move: ['walk_frame1', 'walk_frame2'] },
  dionysus:   { work: ['sit_typing', 'keyboard_mash'], think: ['sit_idle', 'nod'], idle: ['wave', 'stand'], social: ['wave', 'raise_hand'], rest: ['drink_coffee', 'sit_idle'], celebrate: ['celebrate', 'thumbs_up'], move: ['walk_frame1', 'walk_frame2'] },
  demeter:    { work: ['hand_task', 'sit_typing'], think: ['nod', 'sit_idle'], idle: ['stand', 'stretch'], social: ['wave', 'raise_hand'], rest: ['drink_coffee', 'sit_idle'], celebrate: ['thumbs_up', 'celebrate'], move: ['walk_frame1', 'walk_frame2'] },
  aphrodite:  { work: ['sit_typing', 'hand_task'], think: ['sit_idle', 'nod'], idle: ['wave', 'stand'], social: ['wave', 'raise_hand'], rest: ['drink_coffee', 'sit_idle'], celebrate: ['celebrate', 'thumbs_up'], move: ['walk_frame1', 'walk_frame2'] },
  hera:       { work: ['point', 'sit_typing'], think: ['nod', 'sit_idle'], idle: ['stand', 'wave'], social: ['raise_hand', 'point'], rest: ['drink_coffee', 'sit_idle'], celebrate: ['thumbs_up', 'celebrate'], move: ['walk_frame1', 'walk_frame2'] },
  hades:      { work: ['keyboard_mash', 'hand_task'], think: ['stand', 'sit_idle'], idle: ['stand', 'nod'], social: ['point', 'raise_hand'], rest: ['sit_idle', 'drink_coffee'], celebrate: ['thumbs_up', 'celebrate'], move: ['walk_frame1', 'walk_frame2'] },
  persephone: { work: ['sit_typing', 'hand_task'], think: ['nod', 'sit_idle'], idle: ['wave', 'stand'], social: ['wave', 'raise_hand'], rest: ['drink_coffee', 'sit_idle'], celebrate: ['celebrate', 'thumbs_up'], move: ['walk_frame1', 'walk_frame2'] },
  prometheus: { work: ['keyboard_mash', 'sit_typing'], think: ['stand', 'nod'], idle: ['stretch', 'stand'], social: ['raise_hand', 'point'], rest: ['sit_idle', 'drink_coffee'], celebrate: ['celebrate', 'thumbs_up'], move: ['run', 'walk_frame1', 'walk_frame2'] },
  helios:     { work: ['point', 'sit_typing'], think: ['nod', 'sit_idle'], idle: ['wave', 'stand'], social: ['raise_hand', 'wave'], rest: ['drink_coffee', 'sit_idle'], celebrate: ['celebrate', 'thumbs_up'], move: ['run', 'walk_frame1', 'walk_frame2'] },
  nike:       { work: ['hand_task', 'sit_typing'], think: ['nod', 'stand'], idle: ['stand', 'wave'], social: ['raise_hand', 'wave'], rest: ['sit_idle', 'drink_coffee'], celebrate: ['celebrate', 'thumbs_up'], move: ['run', 'walk_frame1', 'walk_frame2'] },
  pan:        { work: ['keyboard_mash', 'hand_task'], think: ['sit_idle', 'nod'], idle: ['stand', 'stretch'], social: ['wave', 'raise_hand'], rest: ['drink_coffee', 'sit_idle'], celebrate: ['thumbs_up', 'celebrate'], move: ['walk_frame1', 'walk_frame2'] },
  hecate:     { work: ['sit_typing', 'point'], think: ['sit_idle', 'nod'], idle: ['stand', 'stretch'], social: ['point', 'raise_hand'], rest: ['drink_coffee', 'sit_idle'], celebrate: ['celebrate', 'thumbs_up'], move: ['walk_frame1', 'walk_frame2'] },
  iris:       { work: ['point', 'sit_typing'], think: ['nod', 'stand'], idle: ['wave', 'stand'], social: ['wave', 'raise_hand'], rest: ['sit_idle', 'drink_coffee'], celebrate: ['celebrate', 'thumbs_up'], move: ['run', 'walk_frame1', 'walk_frame2'] },
  heracles:   { work: ['hand_task', 'keyboard_mash'], think: ['stand', 'nod'], idle: ['stretch', 'stand'], social: ['raise_hand', 'point'], rest: ['drink_coffee', 'sit_idle'], celebrate: ['celebrate', 'thumbs_up'], move: ['run', 'walk_frame1', 'walk_frame2'] },
  selene:     { work: ['sit_typing', 'point'], think: ['sit_idle', 'nod'], idle: ['stand', 'wave'], social: ['wave', 'raise_hand'], rest: ['drink_coffee', 'sit_idle'], celebrate: ['thumbs_up', 'celebrate'], move: ['walk_frame1', 'walk_frame2'] },
};

function pickByTick(list: CharacterAnim[], tick: number, seed: number, speed = 120): CharacterAnim {
  if (list.length === 0) return 'stand';
  const idx = Math.floor((tick + seed * 17) / speed) % list.length;
  return list[idx];
}

function getAvatarBehaviorAnim(
  avatar: WorkerAvatar | undefined,
  behavior: WorkerBehavior,
  baseAnim: CharacterAnim,
  tick: number,
  seed: number,
): CharacterAnim {
  const profile = avatar ? (AVATAR_MOTION[avatar] ?? DEFAULT_MOTION) : DEFAULT_MOTION;

  if (behavior === 'working' || behavior === 'reviewing' || behavior === 'analyzing' || behavior === 'deploying' || behavior === 'error') {
    return pickByTick(profile.work, tick, seed, 90);
  }
  if (behavior === 'thinking') {
    return pickByTick(profile.think, tick, seed, 100);
  }
  if (behavior === 'chatting' || behavior === 'collaborating' || behavior === 'meeting' || behavior === 'directing') {
    return pickByTick(profile.social, tick, seed, 110);
  }
  if (behavior === 'resting' || behavior === 'offline') {
    return pickByTick(profile.rest, tick, seed, 130);
  }
  if (behavior === 'completed') {
    return pickByTick(profile.celebrate, tick, seed, 100);
  }
  if (behavior === 'idle' || behavior === 'starting') {
    return pickByTick(profile.idle, tick, seed, 140);
  }

  return baseAnim;
}

function toKey(col: number, row: number): string {
  return `${col},${row}`;
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function isWalkable(grid: WalkGrid, col: number, row: number): boolean {
  if (row < 0 || row >= grid.length || col < 0 || col >= (grid[0]?.length ?? 0)) return false;
  const tile = grid[row]?.[col];
  return tile === 'floor' || tile === 'door';
}

function collectZonePoints(zone: Zone, grid: WalkGrid): Array<{ col: number; row: number }> {
  const points: Array<{ col: number; row: number }> = [];
  for (let row = zone.minRow; row <= zone.maxRow; row++) {
    for (let col = zone.minCol; col <= zone.maxCol; col++) {
      if (isWalkable(grid, col, row)) {
        points.push({ col, row });
      }
    }
  }
  return points;
}

function pickZoneTarget(
  zone: Zone,
  grid: WalkGrid,
  from: { col: number; row: number },
  reserved: Set<string>,
  occupied: Set<string>,
  minDistance = 2,
  chooserSeed = 0,
): { col: number; row: number } | null {
  const candidates = collectZonePoints(zone, grid);
  if (candidates.length === 0) return null;

  const free = candidates.filter((p) => {
    const key = toKey(p.col, p.row);
    return !reserved.has(key) && !occupied.has(key);
  });
  const pool = free.length > 0 ? free : [];
  if (pool.length === 0) {
    const taken = new Set<string>([...reserved, ...occupied]);
    const rescue = findNearestFree(from, grid, taken, 12);
    if (rescue) {
      reserved.add(toKey(rescue.col, rescue.row));
      return rescue;
    }
    return null;
  }

  const ranked = [...pool].sort((a, b) => {
    const da = Math.abs(a.col - from.col) + Math.abs(a.row - from.row);
    const db = Math.abs(b.col - from.col) + Math.abs(b.row - from.row);
    return db - da;
  });
  const preferred = ranked.filter((p) => Math.abs(p.col - from.col) + Math.abs(p.row - from.row) >= minDistance);
  const choicePool = preferred.length > 0 ? preferred : ranked;
  const topN = Math.min(choicePool.length, 6);
  const pickIdx = topN > 0 ? (Math.abs(chooserSeed) % topN) : 0;
  const target = choicePool[pickIdx] ?? choicePool[0];
  if (!target) return null;
  reserved.add(toKey(target.col, target.row));
  return target;
}

function findNearestFree(
  origin: { col: number; row: number },
  grid: WalkGrid,
  taken: Set<string>,
  maxRadius = 4,
): { col: number; row: number } | null {
  for (let radius = 1; radius <= maxRadius; radius++) {
    for (let dc = -radius; dc <= radius; dc++) {
      for (let dr = -radius; dr <= radius; dr++) {
        if (Math.abs(dc) + Math.abs(dr) !== radius) continue;
        const col = origin.col + dc;
        const row = origin.row + dr;
        if (!isWalkable(grid, col, row)) continue;
        const key = toKey(col, row);
        if (taken.has(key)) continue;
        return { col, row };
      }
    }
  }
  return null;
}

function ensureSafeSpawn(
  preferred: { col: number; row: number },
  grid: WalkGrid,
  taken: Set<string>,
): { col: number; row: number } {
  const preferredKey = toKey(preferred.col, preferred.row);
  if (isWalkable(grid, preferred.col, preferred.row) && !taken.has(preferredKey)) {
    taken.add(preferredKey);
    return preferred;
  }
  const fallback = findNearestFree(preferred, grid, taken, 12);
  if (fallback) {
    taken.add(toKey(fallback.col, fallback.row));
    return fallback;
  }
  // Last resort (should be rare): keep preferred even if cramped.
  taken.add(preferredKey);
  return preferred;
}

function deoverlapWorkers(workers: WorkerRuntime[], grid: WalkGrid): void {
  const taken = new Set<string>();
  for (const worker of workers) {
    const key = toKey(worker.pos.col, worker.pos.row);
    if (!taken.has(key)) {
      taken.add(key);
      continue;
    }
    const fallback = findNearestFree(worker.pos, grid, taken);
    if (fallback) {
      worker.pos = fallback;
      worker.screenPos = gridToScreen(fallback);
      taken.add(toKey(fallback.col, fallback.row));
    } else {
      taken.add(key);
    }
  }
}

function createInitialWorkerRuntime(id: string, index: number, pos: { col: number; row: number }): WorkerRuntime {
  const sanctuaryZone = SANCTUARY_ZONES[index % SANCTUARY_ZONES.length];
  return {
    id,
    currentState: 'idle',
    pos,
    screenPos: gridToScreen(pos),
    direction: 's',
    anim: 'stand',
    path: [],
    transitioning: false,
    deskZone: sanctuaryZone,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useOlympusMountain({ workers, workerStates, codexBehavior, geminiBehavior = 'offline' }: UseOlympusMountainParams): UseOlympusMountainReturn {
  const [olympusMountainState, setOlympusMountainState] = useState<OlympusMountainState>(() => {
    const initialGrid = createWalkGrid(workers.length);
    const gardenZone = getZone('olympus_garden', workers.length);
    const ambrosiaZone = getZone('ambrosia_hall', workers.length);
    const plazaZone = getZone('gods_plaza', workers.length);
    const gardenCenter = gardenZone ? { ...gardenZone.center } : { col: 4, row: 4 };
    const ambrosiaCenter = ambrosiaZone ? { ...ambrosiaZone.center } : { col: 4, row: 15 };

    // Gemini starts at athenas_library
    const athenaLibZone = getZone('athenas_library', workers.length);
    const geminiStartPos = athenaLibZone ? { ...athenaLibZone.center } : { col: 9, row: 14 };
    const occupiedInitial = new Set<string>();
    const reservedInitial = new Set<string>();
    const initialWorkerRuntimes = workers.map((w, i) => {
      const fallback = { col: 3 + (i % 4) * 2, row: 6 + Math.floor(i / 4) * 2 };
      const candidate = plazaZone
        ? (pickZoneTarget(plazaZone, initialGrid, plazaZone.center, reservedInitial, occupiedInitial, 2, hashId(w.id)) ?? fallback)
        : fallback;
      const safePos = ensureSafeSpawn(candidate, initialGrid, occupiedInitial);
      return createInitialWorkerRuntime(w.id, i, safePos);
    });

    return {
      workers: initialWorkerRuntimes,
      codex: { anim: 'sit_typing' as CharacterAnim },
      gemini: {
        behavior: 'offline' as GeminiBehavior,
        currentTask: null,
        anim: 'sleep' as CharacterAnim,
        pos: geminiStartPos,
        screenPos: gridToScreen(geminiStartPos),
        direction: 's' as Direction,
        path: [],
      },
      npcs: [
        {
          id: 'unicorn',
          type: 'unicorn' as const,
          pos: gardenCenter,
          screenPos: gridToScreen(gardenCenter),
          direction: 's' as const,
          path: [],
          homeZone: 'olympus_garden' as ZoneId,
        },
        {
          id: 'cupid',
          type: 'cupid' as const,
          pos: ambrosiaCenter,
          screenPos: gridToScreen(ambrosiaCenter),
          direction: 's' as const,
          path: [],
          homeZone: 'ambrosia_hall' as ZoneId,
        },
      ],
      bubbles: [],
      particles: [],
      tick: 0,
      autoMode: true,
      autoTimer: 0,
      dayNightPhase: 0,
    };
  });

  const walkGridRef = useRef<WalkGrid>(createWalkGrid(workers.length));
  const particleTimerRef = useRef<Record<string, number>>({});
  // Track how long each worker has been in the same behavior (for idle variation)
  // Initialize with random offsets so workers don't all move in sync
  const behaviorTicksRef = useRef<Record<string, number>>({});
  const behaviorTicksInitRef = useRef(false);
  // Track previous behavior per worker (for transition smoothing)
  const prevBehaviorRef = useRef<Record<string, string>>({});
  // Track workers in transition (playing brief 'stand' before switching)
  const transitionAnimRef = useRef<Record<string, number>>({});

  // Rebuild walk grid when worker count changes
  useEffect(() => {
    walkGridRef.current = createWalkGrid(workers.length);
  }, [workers.length]);

  // Sync worker runtimes when workers config changes
  useEffect(() => {
    setOlympusMountainState(prev => {
      const occupied = new Set(prev.workers.map((r) => toKey(r.pos.col, r.pos.row)));
      const reserved = new Set<string>();
      const grid = walkGridRef.current;
      const entranceZone = getZone('propylaea', workers.length);

      const newRuntimes = workers.map((w, i) => {
        const existing = prev.workers.find(r => r.id === w.id);
        if (existing) return existing;
        // New worker starts at propylaea, transitions to plaza
        const fallback = { col: 2 + (i % 3), row: 17 + ((i + 1) % 2) };
        const candidate = entranceZone
          ? (pickZoneTarget(entranceZone, grid, entranceZone.center, reserved, occupied, 1, hashId(w.id)) ?? fallback)
          : fallback;
        const safeStart = ensureSafeSpawn(candidate, grid, occupied);
        const runtime = createInitialWorkerRuntime(w.id, i, safeStart);
        runtime.pos = safeStart;
        runtime.screenPos = gridToScreen(safeStart);
        runtime.currentState = 'arriving';
        return runtime;
      });
      return { ...prev, workers: newRuntimes };
    });
  }, [workers]);

  const tickFn = useCallback(() => {
    setOlympusMountainState(prev => {
      const newTick = prev.tick + 1;
      const newWorkers: WorkerRuntime[] = [];
      const newBubbles: Bubble[] = prev.bubbles
        .map(b => ({ ...b, ttl: b.ttl - 1 }))
        .filter(b => b.ttl > 0);
      let newParticles: Particle[] = tickParticles(prev.particles);
      const workerConfigById = new Map(workers.map((w) => [w.id, w] as const));
      const occupiedPositions = new Set(prev.workers.map((w) => toKey(w.pos.col, w.pos.row)));
      const reservedTargets = new Set<string>();

      // Initialize behaviorTicks with wide random offsets (once) so workers don't sync
      if (!behaviorTicksInitRef.current) {
        behaviorTicksInitRef.current = true;
        for (let i = 0; i < prev.workers.length; i++) {
          const wid = prev.workers[i].id;
          if (behaviorTicksRef.current[wid] === undefined) {
            behaviorTicksRef.current[wid] = hashId(wid) % 500;
          }
        }
      }

      // Collect worker zone positions for interaction detection
      const workerZones: Record<string, string[]> = {};

      for (let idx = 0; idx < prev.workers.length; idx++) {
        const runtime = prev.workers[idx];
        const dashState = workerStates[runtime.id];
        const behavior = (dashState?.behavior ?? 'idle') as WorkerBehavior;
        const mapping = BEHAVIOR_MAP[behavior];
        if (!mapping) {
          newWorkers.push(runtime);
          continue;
        }

        // Track behavior duration for idle variation
        const prevBeh = prevBehaviorRef.current[runtime.id];
        if (prevBeh === behavior) {
          behaviorTicksRef.current[runtime.id] = (behaviorTicksRef.current[runtime.id] ?? 0) + 1;
        } else {
          behaviorTicksRef.current[runtime.id] = 0;
          // Trigger transition animation (brief stand) when behavior changes
          if (prevBeh !== undefined && runtime.path.length === 0) {
            transitionAnimRef.current[runtime.id] = newTick;
          }
          prevBehaviorRef.current[runtime.id] = behavior;
        }

        const targetZone = resolveZone(behavior, runtime.deskZone);
        const updated: WorkerRuntime = { ...runtime };
        const workerCfg = workerConfigById.get(runtime.id);
        const workerSeed = hashId(runtime.id);

        // Rescue invalid/blocked current tile (legacy bad spawn or map changes).
        if (!isWalkable(walkGridRef.current, updated.pos.col, updated.pos.row)) {
          const rescued = findNearestFree(updated.pos, walkGridRef.current, occupiedPositions, 12);
          if (rescued) {
            updated.pos = rescued;
            updated.screenPos = gridToScreen(rescued);
            updated.path = [];
          }
        }

        // Check if worker needs to move to a new zone
        const zone = getZone(targetZone, workers.length);
        if (zone) {
          const inZone =
            updated.pos.col >= zone.minCol && updated.pos.col <= zone.maxCol &&
            updated.pos.row >= zone.minRow && updated.pos.row <= zone.maxRow;

          if (!inZone && updated.path.length === 0) {
            const target = pickZoneTarget(
              zone,
              walkGridRef.current,
              updated.pos,
              reservedTargets,
              occupiedPositions,
              2,
              workerSeed + newTick + idx * 17,
            );
            const path = target ? findPath(walkGridRef.current, updated.pos, target) : [];
            if (path.length > 0 && target) {
              updated.path = path;
              updated.transitioning = true;
              occupiedPositions.add(toKey(target.col, target.row));
            } else if (target) {
              const rescueNearTarget = findNearestFree(target, walkGridRef.current, occupiedPositions, 8);
              if (rescueNearTarget) {
                updated.pos = rescueNearTarget;
                updated.screenPos = gridToScreen(rescueNearTarget);
                updated.path = [];
                occupiedPositions.add(toKey(rescueNearTarget.col, rescueNearTarget.row));
              }
            }
          }

          // Track zone for interaction detection
          const zoneKey = targetZone;
          if (inZone && !zoneKey.startsWith('sanctuary_')) {
            if (!workerZones[zoneKey]) workerZones[zoneKey] = [];
            workerZones[zoneKey].push(runtime.id);
          }
        }

        // Free motion logic: leisurely wandering with wide per-worker variance.
        if (zone && updated.path.length === 0) {
          const behTicks = behaviorTicksRef.current[runtime.id] ?? 0;
          const inSanctuary = targetZone.startsWith('sanctuary_');

          let wanderInterval = 0;
          let minDist = 2;

          if (inSanctuary) {
            if (behavior === 'working' || behavior === 'reviewing' || behavior === 'analyzing' || behavior === 'deploying' || behavior === 'error') {
              // Working workers rarely reposition — long intervals with wide seed spread
              wanderInterval = 500 + (workerSeed % 300);
              minDist = 2;
            }
          } else if (
            behavior === 'idle' ||
            behavior === 'thinking' ||
            behavior === 'completed' ||
            behavior === 'chatting' ||
            behavior === 'collaborating' ||
            behavior === 'resting'
          ) {
            // Social/idle: slower, relaxed roaming
            wanderInterval = 350 + (workerSeed % 250);
            minDist = 3;
          }

          if (wanderInterval > 0 && behTicks > 0 && behTicks % wanderInterval === 0) {
            const target = pickZoneTarget(
              zone,
              walkGridRef.current,
              updated.pos,
              reservedTargets,
              occupiedPositions,
              minDist,
              workerSeed + behTicks + idx * 31,
            );
            const path = target ? findPath(walkGridRef.current, updated.pos, target) : [];
            if (path.length > 0 && target) {
              updated.path = path;
              updated.transitioning = true;
              occupiedPositions.add(toKey(target.col, target.row));
            }
          }
        }

        // Move along path
        if (updated.path.length > 0) {
          const moveStride = 4 + (workerSeed % 5); // 4..8 tick cadence — slower, more relaxed pace
          if (newTick % moveStride === 0) {
            const next = updated.path[0];

            // Update direction
            if (next.col > updated.pos.col) updated.direction = 'e';
            else if (next.col < updated.pos.col) updated.direction = 'w';
            else if (next.row > updated.pos.row) updated.direction = 's';
            else if (next.row < updated.pos.row) updated.direction = 'n';

            updated.pos = { ...next };
            updated.screenPos = gridToScreen(updated.pos);
            updated.path = updated.path.slice(1);

            // Avatar-specific movement animation profile
            const moveProfile = workerCfg ? (AVATAR_MOTION[workerCfg.avatar] ?? DEFAULT_MOTION) : DEFAULT_MOTION;
            const moveAnim = pickByTick(moveProfile.move, newTick, workerSeed, 8);
            updated.anim = (moveAnim === 'run' || moveAnim === 'walk_frame1' || moveAnim === 'walk_frame2')
              ? moveAnim
              : (newTick % 8 < 4 ? 'walk_frame1' : 'walk_frame2');
          }
        } else {
          // At destination — play behavior animation
          updated.transitioning = false;

          // Transition smoothing: play 'stand' briefly when switching behaviors
          const transitionStart = transitionAnimRef.current[runtime.id];
          if (transitionStart && newTick - transitionStart < 15) {
            updated.anim = 'stand';
          } else {
            // Clear transition
            if (transitionStart) delete transitionAnimRef.current[runtime.id];

            // Base behavior animation + avatar-specific motion personality
            const baseAnim = getAnimForTick(mapping, newTick + idx * 73);
            updated.anim = getAvatarBehaviorAnim(workerCfg?.avatar, behavior, baseAnim, newTick, workerSeed);
          }

          // Spawn particles periodically (with variation)
          const particleType = getParticleType(mapping, newTick);
          if (particleType) {
            const timerId = `${runtime.id}-particle`;
            const lastSpawn = particleTimerRef.current[timerId] ?? 0;
            if (newTick - lastSpawn > 60) {
              particleTimerRef.current[timerId] = newTick;
              const sp = gridToScreen(updated.pos);
              newParticles = [...newParticles, createParticle(particleType, sp.x, sp.y - 30)];
            }
          }

          // Show bubble occasionally (staggered per worker, with varied text)
          if (newTick % 300 === (idx * 50) % 300) {
            const bubbleText = getBubbleText(mapping, Math.floor((newTick + workerSeed) / 300) + idx);
            if (bubbleText) {
              const sp = gridToScreen(updated.pos);
              newBubbles.push({
                text: bubbleText,
                ttl: 120,
                x: sp.x,
                y: sp.y - 40,
                workerId: runtime.id,
              });
            }
          }
        }

        // Map behavior to simplified state
        updated.currentState =
          behavior === 'working' || behavior === 'analyzing' ? 'working' :
          behavior === 'thinking' ? 'thinking' :
          behavior === 'reviewing' ? 'reviewing' :
          behavior === 'meeting' || behavior === 'collaborating' || behavior === 'chatting' ? 'meeting' :
          behavior === 'deploying' ? 'deploying' :
          behavior === 'resting' || behavior === 'offline' ? 'resting' :
          behavior === 'starting' ? 'arriving' :
          behavior === 'error' ? 'waiting' :
          'idle';

        newWorkers.push(updated);
      }

      // Resolve accidental overlaps after movement/zone transitions.
      deoverlapWorkers(newWorkers, walkGridRef.current);

      // Update bubble positions to follow their attached workers
      for (const bubble of newBubbles) {
        if (bubble.workerId) {
          const owner = newWorkers.find(w => w.id === bubble.workerId);
          if (owner) {
            bubble.x = owner.screenPos.x;
            bubble.y = owner.screenPos.y - 40;
          }
        }
      }

      // Worker interaction: face each other when in the same non-sanctuary zone
      for (const [_zoneKey, workerIds] of Object.entries(workerZones)) {
        if (workerIds.length >= 2) {
          for (let i = 0; i < workerIds.length; i++) {
            const w1 = newWorkers.find(w => w.id === workerIds[i]);
            const w2 = newWorkers.find(w => w.id === workerIds[(i + 1) % workerIds.length]);
            if (w1 && w2 && w1.path.length === 0 && w2.path.length === 0) {
              // w1 faces toward w2
              if (w2.pos.col > w1.pos.col) w1.direction = 'e';
              else if (w2.pos.col < w1.pos.col) w1.direction = 'w';
              else if (w2.pos.row > w1.pos.row) w1.direction = 's';
              else if (w2.pos.row < w1.pos.row) w1.direction = 'n';
            }
          }
        }
      }

      // NPC wander logic
      const newNpcs: NpcRuntime[] = [];
      for (const npc of prev.npcs) {
        const updated: NpcRuntime = { ...npc };
        const homeZone = getZone(npc.homeZone, workers.length);

        // Check if NPC needs to wander
        if (homeZone && updated.path.length === 0) {
          const wanderInterval = 300 + (npc.id === 'unicorn' ? 30 : 60); // 330 or 360 ticks (~11-12s at 30fps)
          if (newTick > 0 && newTick % wanderInterval === 0) {
            const newTarget = getRandomPointInZone(homeZone);
            const path = findPath(walkGridRef.current, updated.pos, newTarget);
            if (path.length > 0) {
              updated.path = path;
            }
          }
        }

        // Move along path
        if (updated.path.length > 0) {
          if (newTick % 2 === 0) {
            const next = updated.path[0];
            // Update direction
            if (next.col > updated.pos.col) updated.direction = 'e';
            else if (next.col < updated.pos.col) updated.direction = 'w';
            else if (next.row > updated.pos.row) updated.direction = 's';
            else if (next.row < updated.pos.row) updated.direction = 'n';

            updated.pos = { ...next };
            updated.screenPos = gridToScreen(updated.pos);
            updated.path = updated.path.slice(1);
          }
        }

        newNpcs.push(updated);
      }

      // Day-night cycle (very slow sine)
      const dayNightPhase = (Math.sin(newTick * 0.0005) + 1) / 2;

      // Codex animation based on codexBehavior
      const codexMapping = BEHAVIOR_MAP[codexBehavior as WorkerBehavior];
      const codexAnim: CharacterAnim = codexMapping
        ? getAnimForTick(codexMapping, newTick)
        : (newTick % 600 < 400 ? 'sit_typing' :
          newTick % 600 < 500 ? 'sit_idle' : 'drink_coffee');

      // Gemini zone-based movement
      const geminiMapping = GEMINI_BEHAVIOR_MAP[geminiBehavior as GeminiBehavior];
      const geminiTargetZone = geminiMapping?.zone as ZoneId | undefined;
      let updatedGemini = { ...prev.gemini, behavior: geminiBehavior as GeminiBehavior };

      if (geminiTargetZone) {
        const gZone = getZone(geminiTargetZone, workers.length);
        if (gZone) {
          const inZone =
            updatedGemini.pos.col >= gZone.minCol && updatedGemini.pos.col <= gZone.maxCol &&
            updatedGemini.pos.row >= gZone.minRow && updatedGemini.pos.row <= gZone.maxRow;

          if (!inZone && updatedGemini.path.length === 0) {
            const target = getRandomPointInZone(gZone);
            const path = findPath(walkGridRef.current, updatedGemini.pos, target);
            if (path.length > 0) {
              updatedGemini.path = [...path];
            }
          }
        }
      }

      // Move Gemini along path
      if (updatedGemini.path.length > 0) {
        if (newTick % 2 === 0) {
          const next = updatedGemini.path[0];
          if (next.col > updatedGemini.pos.col) updatedGemini.direction = 'e';
          else if (next.col < updatedGemini.pos.col) updatedGemini.direction = 'w';
          else if (next.row > updatedGemini.pos.row) updatedGemini.direction = 's';
          else if (next.row < updatedGemini.pos.row) updatedGemini.direction = 'n';

          updatedGemini.pos = { ...next };
          updatedGemini.screenPos = gridToScreen(updatedGemini.pos);
          updatedGemini.path = updatedGemini.path.slice(1);
          updatedGemini.anim = newTick % 8 < 4 ? 'walk_frame1' : 'walk_frame2';
        }
      } else {
        // At destination — play behavior animation
        updatedGemini.anim = geminiMapping ? getAnimForTick(geminiMapping, newTick) : 'sleep';
      }

      // Gemini idle wandering within ambrosia_hall
      if ((geminiBehavior === 'idle' || geminiBehavior === 'scanning') && updatedGemini.path.length === 0) {
        const wanderInterval = 400;
        if (newTick > 0 && newTick % wanderInterval === 0) {
          const homeZone = getZone(geminiTargetZone ?? 'ambrosia_hall', workers.length);
          if (homeZone) {
            const target = getRandomPointInZone(homeZone);
            const path = findPath(walkGridRef.current, updatedGemini.pos, target);
            if (path.length > 0) {
              updatedGemini.path = [...path];
            }
          }
        }
      }

      return {
        workers: newWorkers,
        codex: { anim: codexAnim },
        gemini: { ...updatedGemini, currentTask: prev.gemini.currentTask },
        npcs: newNpcs,
        bubbles: newBubbles,
        particles: newParticles,
        tick: newTick,
        autoMode: prev.autoMode,
        autoTimer: prev.autoTimer,
        dayNightPhase,
      };
    });
  }, [workerStates, workers, codexBehavior, geminiBehavior]);

  return { olympusMountainState, tick: tickFn };
}
