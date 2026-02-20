import type { CompletedTask, LearningPattern } from '@olympus-dev/protocol';

// ── Input / Output Sources ──

export type InputSource = 'telegram' | 'dashboard' | 'cli';

export interface UserInput {
  text: string;
  source: InputSource;
  chatId?: number;
  clientId?: string;
  timestamp: number;
}

// ── Routing ──

export type RoutingType = 'SESSION_FORWARD' | 'SELF_ANSWER' | 'MULTI_SESSION' | 'CONTEXT_QUERY';

export interface RoutingDecision {
  type: RoutingType;
  targetSessions: string[];
  processedInput: string;
  contextToInject?: ProjectContext;
  confidence: number;
  reason: string;
}

// ── Session ──

export type SessionStatus = 'starting' | 'ready' | 'busy' | 'idle' | 'error' | 'closed';

export interface ManagedSession {
  id: string;
  name: string;
  projectPath: string;
  status: SessionStatus;
  lastActivity: number;
  currentTask?: string;
  commandQueue: string[];
  createdAt: number;
}

// ── Response ──

export type ResponseType = 'text' | 'code' | 'error' | 'progress' | 'question' | 'build' | 'test';

export interface ProcessedResponse {
  type: ResponseType;
  content: string;
  metadata: {
    projectName: string;
    sessionId: string;
    duration: number;
    tokensUsed?: number;
    filesChanged?: string[];
  };
  agentInsight?: string;
  rawOutput: string;
}

export interface DashboardResponse extends ProcessedResponse {
  timestamp: number;
}

// ── Project Context ──

export interface ProjectMetadata {
  name: string;
  path: string;
  aliases: string[];
  techStack: string[];
  claudeMdPath?: string;
  agentsMdPath?: string;
}

export interface ProjectContext {
  path: string;
  name: string;
  lastUpdated: number;
  recentTasks: CompletedTask[];
  learningPatterns: LearningPattern[];
  techStack: string[];
  activeIssues: string[];
  projectInstructions?: string;
  taskCount: number;
  patternCount: number;
}

export interface GlobalSearchResult {
  projectName: string;
  projectPath: string;
  matchType: 'task' | 'pattern' | 'context' | 'instruction';
  content: string;
  score: number;
  timestamp: number;
}

// ── Agent Brain ──

export type IntentType =
  | 'FORWARD_TO_CLAUDE'
  | 'ANSWER_FROM_CONTEXT'
  | 'SESSION_MANAGEMENT'
  | 'PROJECT_QUERY'
  | 'MULTI_PROJECT';

export interface Intent {
  type: IntentType;
  sessionId?: string;
  enrichedInput?: string;
  answer?: string;
  action?: 'create' | 'list' | 'switch' | 'close';
  sessions?: string[];
  confidence: number;
}

// ── Orchestrator ──

export interface CodexOrchestratorConfig {
  maxSessions?: number;
  globalDbPath?: string;
  projects?: ProjectMetadata[];
}

export interface CodexProcessResult {
  decision: RoutingDecision;
  response?: ProcessedResponse;
}

// ── Session Manager Config ──

export interface SessionManagerConfig {
  maxSessions?: number;
}

// ── Active Task Tracking ──

export interface ActiveCliTask {
  taskId: string;
  sessionId: string;
  projectPath: string;
  prompt: string;
  source: InputSource;
  startedAt: number;
  status: 'running' | 'completed' | 'failed';
}

// ── Session Constants ──

export const SESSION_CONSTANTS = {
  SESSION_MAX_COMMAND_QUEUE: 10,
} as const;
