// ============================================================================
// State Mapper — Maps worker states to dashboard behaviors
// ============================================================================

import type {
  WorkerBehavior,
  WorkerDashboardState,
  WorkerTask,
  TokenUsage,
  ActivityEvent,
  SystemStats,
  WorkerConfig,
  WorkerState,
} from './types';
import type { RegisteredWorker, WorkerTaskRecord } from '@olympus-dev/protocol';

// ---------------------------------------------------------------------------
// Behavior metadata
// ---------------------------------------------------------------------------

export interface BehaviorInfo {
  label: string;
  emoji: string;
  category: 'active' | 'idle' | 'alert' | 'system';
  color: string;
  neonColor: string;
}

export const BEHAVIOR_INFO: Record<WorkerBehavior, BehaviorInfo> = {
  // Worker behaviors (12)
  working:       { label: 'Working',       emoji: '\u{1F4BB}', category: 'active', color: '#4CAF50', neonColor: '#4FC3F7' },
  idle:          { label: 'Idle',          emoji: '\u2615',     category: 'idle',   color: '#795548', neonColor: '#FFCA28' },
  thinking:      { label: 'Thinking',      emoji: '\u{1F914}', category: 'active', color: '#FF9800', neonColor: '#FFCA28' },
  completed:     { label: 'Completed',     emoji: '\u2705',     category: 'active', color: '#8BC34A', neonColor: '#76FF03' },
  error:         { label: 'Error',         emoji: '\u{1F6A8}', category: 'alert',  color: '#F44336', neonColor: '#FF1744' },
  offline:       { label: 'Offline',       emoji: '\u{1F4A4}', category: 'system', color: '#607D8B', neonColor: '#90A4AE' },
  chatting:      { label: 'Chatting',      emoji: '\u{1F4AC}', category: 'active', color: '#9C27B0', neonColor: '#AB47BC' },
  reviewing:     { label: 'Reviewing',     emoji: '\u{1F50D}', category: 'active', color: '#2196F3', neonColor: '#42A5F5' },
  deploying:     { label: 'Deploying',     emoji: '\u{1F680}', category: 'active', color: '#00BCD4', neonColor: '#00E5FF' },
  resting:       { label: 'Resting',       emoji: '\u2615',     category: 'idle',   color: '#795548', neonColor: '#A1887F' },
  collaborating: { label: 'Collaborating', emoji: '\u{1F91D}', category: 'active', color: '#3F51B5', neonColor: '#536DFE' },
  starting:      { label: 'Starting',      emoji: '\u{1F31F}', category: 'system', color: '#FF9800', neonColor: '#FFAB00' },
  // Codex behaviors (4)
  supervising:   { label: 'Supervising',   emoji: '\u{1F440}', category: 'idle',   color: '#607D8B', neonColor: '#90A4AE' },
  directing:     { label: 'Directing',     emoji: '\u{1F4CB}', category: 'active', color: '#3F51B5', neonColor: '#536DFE' },
  analyzing:     { label: 'Analyzing',     emoji: '\u{1F4CA}', category: 'active', color: '#2196F3', neonColor: '#42A5F5' },
  meeting:       { label: 'Meeting',       emoji: '\u{1F91D}', category: 'active', color: '#9C27B0', neonColor: '#AB47BC' },
};

/** Check if a behavior is an active working state */
export function isActiveBehavior(behavior: WorkerBehavior): boolean {
  return BEHAVIOR_INFO[behavior].category === 'active';
}

/** Map behavior -> simplified Olympus Mountain state */
export function behaviorToOlympusMountainState(behavior: WorkerBehavior): WorkerState {
  switch (behavior) {
    case 'working':
    case 'analyzing':
      return 'working';
    case 'thinking':
      return 'thinking';
    case 'deploying':
      return 'deploying';
    case 'meeting':
    case 'chatting':
    case 'collaborating':
      return 'meeting';
    case 'reviewing':
      return 'reviewing';
    case 'resting':
    case 'idle':
    case 'supervising':
      return 'idle';
    case 'offline':
      return 'resting';
    case 'error':
      return 'waiting';
    case 'starting':
      return 'arriving';
    case 'completed':
    case 'directing':
      return 'idle';
    default:
      return 'idle';
  }
}

// ---------------------------------------------------------------------------
// RegisteredWorker + WorkerTaskRecord -> WorkerBehavior mapping
// ---------------------------------------------------------------------------

/**
 * Derive WorkerBehavior from RegisteredWorker.status + WorkerTaskRecord.status.
 *
 * Mapping:
 * - worker offline (no heartbeat) -> offline
 * - worker busy + task running   -> working
 * - worker busy + task completed -> completed
 * - worker busy + task failed    -> error
 * - worker busy + no task record -> thinking (streaming/processing)
 * - worker idle + no task        -> idle
 */
export function workerStatusToBehavior(
  worker: RegisteredWorker | undefined,
  activeTask: WorkerTaskRecord | undefined,
): WorkerBehavior {
  if (!worker) return 'offline';

  // Determine if worker is effectively offline (stale heartbeat > 60s)
  const heartbeatAge = Date.now() - worker.lastHeartbeat;
  if (heartbeatAge > 60_000) return 'offline';

  if (worker.status === 'busy') {
    if (!activeTask) return 'thinking';
    switch (activeTask.status) {
      case 'running':
        return 'working';
      case 'completed':
        return 'completed';
      case 'failed':
        return 'error';
      default:
        return 'working';
    }
  }

  // idle status
  return 'idle';
}


// ---------------------------------------------------------------------------
// Format utilities
// ---------------------------------------------------------------------------

/** Format token count for display */
export function formatTokens(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toString();
}

/** Format uptime seconds to human-readable */
export function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Format relative time */
export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 1000) return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}
