// ============================================================================
// useOlympusMountain — Olympus Mountain animation state machine hook
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  OlympusMountainState,
  WorkerRuntime,
  NpcRuntime,
  WorkerBehavior,
  WorkerConfig,
  CodexConfig,
  CharacterAnim,
  ZoneId,
  Bubble,
} from '../lib/types';
import type { Particle } from '../engine/canvas';
import { findPath, type WalkGrid } from '../engine/pathfinding';
import { gridToScreen } from '../engine/isometric';
import { createWalkGrid } from '../olympus-mountain/layout';
import { BEHAVIOR_MAP, resolveZone, getAnimForTick, getBubbleText, getParticleType } from '../olympus-mountain/behaviors';
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
}

export interface UseOlympusMountainReturn {
  olympusMountainState: OlympusMountainState;
  tick: () => void;
}

// ---------------------------------------------------------------------------
// Sanctuary assignments
// ---------------------------------------------------------------------------

const SANCTUARY_ZONES: ZoneId[] = ['sanctuary_0', 'sanctuary_1', 'sanctuary_2', 'sanctuary_3', 'sanctuary_4', 'sanctuary_5'];

function createInitialWorkerRuntime(id: string, index: number, workerCount: number): WorkerRuntime {
  const sanctuaryZone = SANCTUARY_ZONES[index % SANCTUARY_ZONES.length];
  // Initial position at gods_plaza (no fixed placement!)
  const plaza = getZone('gods_plaza', workerCount);
  const pos = plaza ? getRandomPointInZone(plaza) : { col: 3 + index * 2, row: 5 + (index % 3) * 3 };
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

export function useOlympusMountain({ workers, workerStates, codexBehavior }: UseOlympusMountainParams): UseOlympusMountainReturn {
  const [olympusMountainState, setOlympusMountainState] = useState<OlympusMountainState>(() => {
    const gardenZone = getZone('olympus_garden', workers.length);
    const ambrosiaZone = getZone('ambrosia_hall', workers.length);
    const gardenCenter = gardenZone ? { ...gardenZone.center } : { col: 4, row: 4 };
    const ambrosiaCenter = ambrosiaZone ? { ...ambrosiaZone.center } : { col: 4, row: 15 };

    return {
      workers: workers.map((w, i) => createInitialWorkerRuntime(w.id, i, workers.length)),
      codex: { anim: 'sit_typing' as CharacterAnim },
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
      const newRuntimes = workers.map((w, i) => {
        const existing = prev.workers.find(r => r.id === w.id);
        if (existing) return existing;
        // New worker starts at propylaea, transitions to plaza
        const entranceZone = getZone('propylaea', workers.length);
        const startPos = entranceZone ? { ...entranceZone.center } : { col: 2, row: 18 };
        const runtime = createInitialWorkerRuntime(w.id, i, workers.length);
        runtime.pos = startPos;
        runtime.screenPos = gridToScreen(startPos);
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

      // Initialize behaviorTicks with random offsets (once) so workers don't sync
      if (!behaviorTicksInitRef.current) {
        behaviorTicksInitRef.current = true;
        for (let i = 0; i < prev.workers.length; i++) {
          const wid = prev.workers[i].id;
          if (behaviorTicksRef.current[wid] === undefined) {
            behaviorTicksRef.current[wid] = Math.floor(Math.random() * 50);
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

        // Check if worker needs to move to a new zone
        const zone = getZone(targetZone, workers.length);
        if (zone) {
          const inZone =
            updated.pos.col >= zone.minCol && updated.pos.col <= zone.maxCol &&
            updated.pos.row >= zone.minRow && updated.pos.row <= zone.maxRow;

          if (!inZone && updated.path.length === 0) {
            const target = getRandomPointInZone(zone);
            const path = findPath(walkGridRef.current, updated.pos, target);
            if (path.length > 0) {
              updated.path = path;
              updated.transitioning = true;
            }
          }

          // Track zone for interaction detection
          const zoneKey = targetZone;
          if (inZone && !zoneKey.startsWith('sanctuary_')) {
            if (!workerZones[zoneKey]) workerZones[zoneKey] = [];
            workerZones[zoneKey].push(runtime.id);
          }
        }

        // Idle worker free roaming: periodic wander within gods_plaza
        if (behavior === 'idle' || behavior === 'thinking' || behavior === 'completed') {
          const targetZoneId = resolveZone(behavior, runtime.deskZone);
          if (targetZoneId === 'gods_plaza' && updated.path.length === 0) {
            const wanderInterval = 300 + (idx * 17) % 60; // 300~360 tick interval (~10-12s at 30fps)
            const behTicks = behaviorTicksRef.current[runtime.id] ?? 0;
            if (behTicks > 0 && behTicks % wanderInterval === 0) {
              const plazaZone = getZone('gods_plaza', workers.length);
              if (plazaZone) {
                // Pick a target with minimum distance to ensure visible movement
                let newTarget = getRandomPointInZone(plazaZone);
                const minDist = 3;
                for (let attempt = 0; attempt < 5; attempt++) {
                  const dist = Math.abs(newTarget.col - updated.pos.col) + Math.abs(newTarget.row - updated.pos.row);
                  if (dist >= minDist) break;
                  newTarget = getRandomPointInZone(plazaZone);
                }
                const path = findPath(walkGridRef.current, updated.pos, newTarget);
                if (path.length > 0) {
                  updated.path = path;
                  updated.transitioning = true;
                }
              }
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

            // Walking animation alternation
            updated.anim = newTick % 8 < 4 ? 'walk_frame1' : 'walk_frame2';
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

            // Use tick-based animation variation from behaviors
            updated.anim = getAnimForTick(mapping, newTick + idx * 73);
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
            const bubbleText = getBubbleText(mapping, Math.floor(newTick / 300) + idx);
            if (bubbleText) {
              const sp = gridToScreen(updated.pos);
              newBubbles.push({
                text: bubbleText,
                ttl: 120,
                x: sp.x,
                y: sp.y - 40,
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

      return {
        workers: newWorkers,
        codex: { anim: codexAnim },
        npcs: newNpcs,
        bubbles: newBubbles,
        particles: newParticles,
        tick: newTick,
        autoMode: prev.autoMode,
        autoTimer: prev.autoTimer,
        dayNightPhase,
      };
    });
  }, [workerStates, workers.length, codexBehavior]);

  return { olympusMountainState, tick: tickFn };
}
