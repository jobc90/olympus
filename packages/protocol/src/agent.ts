/**
 * Agent & Worker Types for Olympus v2.0
 *
 * Codex Agent: 상태머신 기반 자율 AI 에이전트
 * Worker: Claude CLI child_process 기반 작업 실행자
 */

// ──────────────────────────────────────────────
// Agent State Machine
// ──────────────────────────────────────────────

export type AgentState =
  | 'IDLE'
  | 'ANALYZING'
  | 'PLANNING'
  | 'EXECUTING'
  | 'REVIEWING'
  | 'REPORTING'
  | 'INTERRUPT';

export const AGENT_STATE_TRANSITIONS: Record<AgentState, AgentState[]> = {
  IDLE: ['ANALYZING', 'INTERRUPT'],
  ANALYZING: ['PLANNING', 'REPORTING', 'IDLE', 'INTERRUPT'],  // → REPORTING on simple question shortcut
  PLANNING: ['EXECUTING', 'IDLE', 'INTERRUPT'],        // → IDLE on rejection
  EXECUTING: ['REVIEWING', 'INTERRUPT'],
  REVIEWING: ['REPORTING', 'EXECUTING', 'INTERRUPT'],  // → EXECUTING on retry
  REPORTING: ['IDLE'],
  INTERRUPT: ['IDLE'],
};

// ──────────────────────────────────────────────
// Agent Task
// ──────────────────────────────────────────────

export interface AgentTask {
  id: string;
  command: string;
  state: AgentState;
  analysis: Analysis | null;
  plan: ExecutionPlan | null;
  workers: WorkerTask[];
  results: WorkerResult[];
  report: ReviewReport | null;
  startedAt: number;
  completedAt?: number;
  error?: string;
}

// ──────────────────────────────────────────────
// Analysis (Analyzer output)
// ──────────────────────────────────────────────

export interface Analysis {
  intent: 'coding' | 'documentation' | 'testing' | 'debugging' | 'analysis' | 'question';
  complexity: 'simple' | 'moderate' | 'complex';
  targetProject: string;
  targetFiles: string[];
  requirements: string[];
  useOrchestration: boolean;
  suggestedApproach: string;
  risks: string[];
  estimatedDuration: string;
  needsConfirmation: boolean;
}

// ──────────────────────────────────────────────
// Execution Plan (Planner output)
// ──────────────────────────────────────────────

export interface ExecutionPlan {
  strategy: 'single' | 'parallel' | 'sequential' | 'pipeline';
  workers: WorkerTask[];
  checkpoints: string[];
  rollbackStrategy: string;
  totalEstimate: string;
}

export interface WorkerTask {
  id: string;
  type: 'claude-cli' | 'claude-api' | 'tmux' | 'docker';
  prompt: string;
  projectPath: string;
  dependencies: string[];
  timeout: number;
  orchestration: boolean;
  successCriteria: string[];
}

// ──────────────────────────────────────────────
// Worker Result
// ──────────────────────────────────────────────

export interface WorkerResult {
  workerId: string;
  status: 'completed' | 'failed' | 'timeout';
  exitCode: number | null;
  output: string;
  duration: number;
  error?: string;
}

// ──────────────────────────────────────────────
// Review Report (Reviewer output)
// ──────────────────────────────────────────────

export interface ReviewReport {
  taskId: string;
  status: 'success' | 'partial' | 'failed';
  summary: string;
  details: string;
  changedFiles: string[];
  testResults: string;
  buildStatus: 'pass' | 'fail' | 'unknown';
  warnings: string[];
  nextSteps: string[];
  shouldRetry: boolean;
  retryReason?: string;
}

// ──────────────────────────────────────────────
// Agent Progress Event (WS broadcast)
// ──────────────────────────────────────────────

export interface AgentProgressPayload {
  taskId: string;
  state: AgentState;
  message: string;
  progress?: number;       // 0-100
  workerCount?: number;
  completedWorkers?: number;
}

export interface AgentResultPayload {
  taskId: string;
  report: ReviewReport;
}

export interface ApprovalRequest {
  taskId: string;
  command: string;
  analysis: Analysis;
  plan: ExecutionPlan;
  timestamp: number;
}

export interface AgentApprovalPayload {
  taskId: string;
  request: ApprovalRequest;
}

// ──────────────────────────────────────────────
// Worker Events (WS broadcast)
// ──────────────────────────────────────────────

export interface WorkerStartedPayload {
  taskId: string;
  workerId: string;
  projectPath: string;
  workerType: WorkerTask['type'];
}

export interface WorkerOutputPayload {
  taskId: string;
  workerId: string;
  content: string;
}

export interface WorkerDonePayload {
  taskId: string;
  workerId: string;
  result: WorkerResult;
}

// ──────────────────────────────────────────────
// Memory Types
// ──────────────────────────────────────────────

export interface CompletedTask {
  id: string;
  command: string;
  analysis: string;      // JSON stringified
  plan: string;          // JSON stringified
  result: string;        // summary
  success: boolean;
  duration: number;
  timestamp: number;
  projectPath: string;
  workerCount: number;
}

export interface LearningPattern {
  id: string;
  trigger: string;
  action: string;
  confidence: number;   // 0-1
  usageCount: number;
  lastUsed: number;
}

// ──────────────────────────────────────────────
// Config v2 Agent Section
// ──────────────────────────────────────────────

export interface AgentConfig {
  enabled: boolean;
  provider: 'openai' | 'anthropic' | 'mock';
  model: string;
  apiKey: string;
  maxConcurrentWorkers: number;
  defaultTimeout: number;
  autoApprove: boolean;
  orchestrationMode: 'auto' | 'always' | 'never';
}

export interface WorkerConfig {
  type: 'child_process' | 'tmux' | 'docker';
  claudePath?: string;
  logDir: string;
  maxOutputBuffer: number;
}

export interface MemoryConfig {
  enabled: boolean;
  dbPath: string;
  maxHistory: number;
}

export interface SecurityConfig {
  approvalRequired: string[];
  blockedCommands: string[];
  maxWorkerDuration: number;
}

export interface ProjectConfig {
  workspacePath: string;
  registered: Array<{
    name: string;
    path: string;
    aliases: string[];
  }>;
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  enabled: false,
  provider: 'mock',
  model: 'gpt-4o',
  apiKey: '',
  maxConcurrentWorkers: 3,
  defaultTimeout: 300_000,
  autoApprove: false,
  orchestrationMode: 'auto',
};

export const DEFAULT_WORKER_CONFIG: WorkerConfig = {
  type: 'child_process',
  logDir: '~/.olympus/worker-logs',
  maxOutputBuffer: 10_000_000,
};

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  enabled: true,
  dbPath: '~/.olympus/memory.db',
  maxHistory: 1000,
};

export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  approvalRequired: [],
  blockedCommands: [],
  maxWorkerDuration: 600_000,
};
