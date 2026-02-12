// ============================================================================
// State Mapper — Maps worker states to dashboard behaviors
// Also provides demo mode data generation
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
// Demo mode data generation
// ---------------------------------------------------------------------------

const DEMO_BEHAVIORS: WorkerBehavior[] = [
  'working', 'thinking', 'idle', 'completed', 'reviewing',
  'deploying', 'collaborating', 'chatting', 'resting',
];

const DEMO_TASKS: string[] = [
  'Implement user authentication',
  'Fix database connection pooling',
  'Write API documentation',
  'Review pull request #42',
  'Optimize search algorithm',
  'Debug memory leak in worker',
  'Deploy v2.1.0 to staging',
  'Refactor payment module',
  'Set up CI/CD pipeline',
  'Analyze user feedback data',
  'Build dashboard UI',
  'Migrate to TypeScript strict mode',
  'Add rate limiting middleware',
  'Design REST API endpoints',
];

let demoEventId = 0;

function randomBehavior(): WorkerBehavior {
  return DEMO_BEHAVIORS[Math.floor(Math.random() * DEMO_BEHAVIORS.length)];
}

/** Generate demo dashboard state for a single worker */
export function generateDemoWorkerState(workerId: string, behavior?: WorkerBehavior): WorkerDashboardState {
  const finalBehavior = behavior ?? randomBehavior();
  const now = Date.now();

  const tokenUsage: TokenUsage[] = [];
  const baseOffset = workerId === 'codex-1' ? 5000 : workerId === 'worker-atlas' ? 2000 : workerId === 'worker-nova' ? 3000 : 1500;
  for (let i = 23; i >= 0; i--) {
    const input = i * 500 + baseOffset;
    const output = i * 300 + baseOffset / 2;
    tokenUsage.push({
      timestamp: now - i * 3600000,
      input,
      output,
      total: input + output,
    });
  }

  const totalTokens = tokenUsage.reduce((sum, t) => sum + t.total, 0);
  const totalTasks = workerId === 'codex-1' ? 15 : workerId === 'worker-atlas' ? 12 : workerId === 'worker-nova' ? 8 : 6;

  const currentTask: WorkerTask | null = isActiveBehavior(finalBehavior)
    ? {
        id: `task-${workerId}-current`,
        title: DEMO_TASKS[0],
        status: 'active',
        startedAt: now - 120000,
      }
    : null;

  const taskHistory: WorkerTask[] = [
    {
      id: `task-${workerId}-hist-1`,
      title: 'Implement user authentication',
      status: 'completed',
      startedAt: now - 3600000,
      completedAt: now - 1800000,
      tokenUsage: 5200,
    },
    {
      id: `task-${workerId}-hist-2`,
      title: 'Fix database connection pooling',
      status: 'completed',
      startedAt: now - 7200000,
      completedAt: now - 5400000,
      tokenUsage: 3100,
    },
    {
      id: `task-${workerId}-hist-3`,
      title: 'Write API documentation',
      status: 'failed',
      startedAt: now - 10800000,
      completedAt: now - 9000000,
      tokenUsage: 1800,
    },
  ];

  return {
    behavior: finalBehavior,
    olympusMountainState: behaviorToOlympusMountainState(finalBehavior),
    currentTask,
    taskHistory,
    tokenUsage,
    totalTokens,
    totalTasks,
    lastActivity: now - 15000,
    sessionLog: generateDemoLogs(workerId),
    uptime: 14400,
  };
}

function generateDemoLogs(workerId: string): string[] {
  const now = new Date();
  return Array.from({ length: 20 }, (_, i) => {
    const time = new Date(now.getTime() - i * 30000);
    const ts = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const messages = [
      `[${ts}] Processing user request...`,
      `[${ts}] Tool call: web_search("latest AI news")`,
      `[${ts}] Generating response (1,234 tokens)`,
      `[${ts}] Task completed successfully`,
      `[${ts}] Idle - waiting for new messages`,
      `[${ts}] Connected to gateway`,
      `[${ts}] Session heartbeat OK`,
      `[${ts}] Executing: npm run build`,
      `[${ts}] Reading file: src/app/page.tsx`,
      `[${ts}] Writing 2,456 bytes to output`,
    ];
    return messages[i % messages.length];
  }).reverse();
}

/** Generate a demo activity event */
export function generateDemoEvent(workers: WorkerConfig[]): ActivityEvent {
  if (workers.length === 0) {
    return {
      id: `event-${++demoEventId}`,
      workerId: 'system',
      workerName: 'System',
      workerEmoji: '\u{1F5A5}\uFE0F',
      type: 'system',
      message: 'System health check OK',
      timestamp: Date.now(),
    };
  }

  const worker = workers[Math.floor(Math.random() * workers.length)];
  const types: ActivityEvent['type'][] = ['state_change', 'task_start', 'task_complete', 'tool_call', 'message'];
  const type = types[Math.floor(Math.random() * types.length)];

  const messages: Record<ActivityEvent['type'], string[]> = {
    state_change: ['Started working', 'Now thinking...', 'Taking a break', 'Deploying to production', 'Back to idle', 'Entering meeting room'],
    task_start: ['New task: ' + DEMO_TASKS[Math.floor(Math.random() * DEMO_TASKS.length)]],
    task_complete: ['Completed: ' + DEMO_TASKS[Math.floor(Math.random() * DEMO_TASKS.length)]],
    task_fail: ['Failed: Connection timeout', 'Failed: Rate limit exceeded'],
    tool_call: ['web_search("react hooks")', 'read_file("config.ts")', 'exec("npm run build")', 'browser.navigate("docs.api.com")'],
    message: ['Processing user request...', 'Generating response...', 'Sending reply...'],
    error: ['Error: Connection lost', 'Error: Token limit exceeded'],
    system: ['System health check OK', 'Gateway reconnected'],
  };

  const msgList = messages[type] ?? ['Unknown event'];

  return {
    id: `event-${++demoEventId}`,
    workerId: worker.id,
    workerName: worker.name,
    workerEmoji: worker.emoji,
    type,
    message: msgList[Math.floor(Math.random() * msgList.length)],
    timestamp: Date.now(),
  };
}

/** Generate demo system stats */
export function generateDemoStats(workers: WorkerConfig[]): SystemStats {
  return {
    totalWorkers: workers.length,
    activeWorkers: 2,
    totalTokens: 285000,
    totalTasks: 47,
    completedTasks: 42,
    failedTasks: 3,
    uptime: 14400,
    connected: false,
  };
}

/**
 * Generate demo data: Codex (1) + Workers (3: Atlas/Nova/Spark).
 * Returns an array of WorkerConfig + a map of WorkerDashboardState.
 */
export function generateDemoData(): {
  workers: WorkerConfig[];
  states: Record<string, WorkerDashboardState>;
} {
  const workers: WorkerConfig[] = [
    { id: 'codex-1', name: 'Zeus', emoji: '\u26A1', color: '#FFD700', avatar: 'hera' },
    { id: 'worker-atlas', name: 'Athena', emoji: '\u{1F989}', color: '#4FC3F7', avatar: 'athena' },
    { id: 'worker-nova', name: 'Ares', emoji: '\u2694\uFE0F', color: '#FF7043', avatar: 'ares' },
    { id: 'worker-spark', name: 'Apollo', emoji: '\u2600\uFE0F', color: '#66BB6A', avatar: 'apollo' },
  ];

  const states: Record<string, WorkerDashboardState> = {
    'codex-1': generateDemoWorkerState('codex-1', 'supervising'),
    'worker-atlas': generateDemoWorkerState('worker-atlas', 'working'),
    'worker-nova': generateDemoWorkerState('worker-nova', 'thinking'),
    'worker-spark': generateDemoWorkerState('worker-spark', 'idle'),
  };

  return { workers, states };
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
