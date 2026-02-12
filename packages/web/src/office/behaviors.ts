// ============================================================================
// Behavior -> Zone + Animation Mapping (Olympus 16 behaviors)
// ============================================================================

import type { WorkerBehavior, CharacterAnim, ZoneId, Particle } from '../lib/types';

export interface BehaviorMapping {
  /** Target zone (or '_own_desk' for the worker's assigned desk) */
  zone: ZoneId | '_own_desk';
  /** Animation to play once at the zone */
  anim: CharacterAnim;
  /** Alternate animations to cycle through (tick-based) */
  altAnims?: CharacterAnim[];
  /** Optional speech bubble texts (randomly chosen) */
  bubble: string | null;
  /** Alternate bubble texts */
  altBubbles?: string[];
  /** Particle effect to spawn */
  particle: Particle['type'] | null;
  /** Alternate particles (randomly chosen) */
  altParticles?: Particle['type'][];
  /** Priority: higher means worker moves faster */
  priority: number;
}

export const BEHAVIOR_MAP: Record<WorkerBehavior, BehaviorMapping> = {
  // Worker behaviors (12)
  working:       { zone: '_own_desk',    anim: 'sit_typing',   altAnims: ['keyboard_mash'],  bubble: null,          altBubbles: ['Coding...', 'In the zone'],  particle: 'code',      priority: 5 },
  idle:          { zone: '_own_desk',    anim: 'sit_idle',     altAnims: ['stretch', 'nod', 'wave'],  bubble: null,  altBubbles: ['...', 'Waiting'],  particle: null,        priority: 1 },
  thinking:      { zone: '_own_desk',    anim: 'sit_idle',     altAnims: ['nod'],             bubble: 'Thinking...', altBubbles: ['Hmm...', 'Let me see...'],   particle: 'question',  priority: 4 },
  completed:     { zone: '_own_desk',    anim: 'celebrate',    altAnims: ['thumbs_up'],       bubble: 'Done!',       altBubbles: ['Ship it!', 'Nailed it!'],    particle: 'confetti',  altParticles: ['lightbulb', 'sparkle'], priority: 3 },
  error:         { zone: '_own_desk',    anim: 'stand',        bubble: 'Error!',      altBubbles: ['Bug!', 'Hmm...'],   particle: 'fire',    altParticles: ['error'],  priority: 6 },
  offline:       { zone: 'entrance',     anim: 'sleep',        bubble: null,          particle: 'zzz',       priority: 0 },
  chatting:      { zone: 'meeting_room', anim: 'wave',         altAnims: ['raise_hand'],      bubble: null,          altBubbles: ['Hey!', 'Sup?'],              particle: null,        priority: 3 },
  reviewing:     { zone: 'whiteboard',   anim: 'hand_task',    altAnims: ['point', 'nod'],    bubble: 'Reviewing',   altBubbles: ['LGTM?', 'Checking...'],      particle: 'check',     priority: 4 },
  deploying:     { zone: 'server_room',  anim: 'run',          bubble: 'Deploying',   altBubbles: ['Shipping!', 'CI/CD!'],  particle: 'binary',  altParticles: ['lightning'], priority: 5 },
  resting:       { zone: 'break_room',   anim: 'drink_coffee', bubble: null,          altBubbles: ['Ahh...', 'Nice'],    particle: 'coffee_steam', priority: 1 },
  collaborating: { zone: 'meeting_room', anim: 'sit_typing',   altAnims: ['nod', 'point'],    bubble: null,          altBubbles: ['Together!', 'Good idea!'],   particle: 'sparkle',   priority: 4 },
  starting:      { zone: 'entrance',     anim: 'walk_frame1',  bubble: 'Starting...', particle: null,        priority: 2 },
  // Codex behaviors (4)
  supervising:   { zone: 'boss_office',  anim: 'stand',        altAnims: ['nod'],             bubble: null,          particle: null,        priority: 3 },
  directing:     { zone: 'boss_office',  anim: 'point',        altAnims: ['hand_task'],       bubble: 'Assigning',   altBubbles: ['Do this', 'Priority!'],  particle: 'sparkle',   priority: 4 },
  analyzing:     { zone: 'boss_office',  anim: 'sit_typing',   altAnims: ['keyboard_mash'],   bubble: 'Analyzing',   altBubbles: ['Hmm...', 'Interesting'],  particle: 'code',      priority: 5 },
  meeting:       { zone: 'meeting_room', anim: 'raise_hand',   altAnims: ['wave', 'nod'],     bubble: 'Meeting',     particle: null,        priority: 4 },
};

/** Get the actual zone ID for a behavior, resolving '_own_desk' */
export function resolveZone(behavior: WorkerBehavior, deskZone: ZoneId): ZoneId {
  const mapping = BEHAVIOR_MAP[behavior];
  return mapping.zone === '_own_desk' ? deskZone : mapping.zone;
}

/** Get the animation for a behavior, with tick-based variation */
export function getAnimForTick(mapping: BehaviorMapping, tick: number): CharacterAnim {
  if (!mapping.altAnims || mapping.altAnims.length === 0) return mapping.anim;
  // Cycle every 200 ticks: primary (200 ticks), then each alt (200 ticks)
  const allAnims = [mapping.anim, ...mapping.altAnims];
  const cycleLen = allAnims.length * 200;
  const idx = Math.floor((tick % cycleLen) / 200);
  return allAnims[idx];
}

/** Get a random bubble text for a behavior */
export function getBubbleText(mapping: BehaviorMapping, tick: number): string | null {
  if (!mapping.bubble) {
    if (!mapping.altBubbles || mapping.altBubbles.length === 0) return null;
    return mapping.altBubbles[tick % mapping.altBubbles.length];
  }
  if (!mapping.altBubbles || mapping.altBubbles.length === 0) return mapping.bubble;
  const all = [mapping.bubble, ...mapping.altBubbles];
  return all[tick % all.length];
}

/** Get a particle type for a behavior, with variation */
export function getParticleType(mapping: BehaviorMapping, tick: number): Particle['type'] | null {
  if (!mapping.particle) return null;
  if (!mapping.altParticles || mapping.altParticles.length === 0) return mapping.particle;
  const all = [mapping.particle, ...mapping.altParticles];
  return all[Math.floor(tick / 60) % all.length];
}
