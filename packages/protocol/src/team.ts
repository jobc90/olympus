/**
 * Team Engineering Protocol v4 — Git Worktree Isolation Types
 *
 * Gateway-orchestrated parallel work items with independent git worktrees,
 * DAG-based execution, and sequential merge.
 */

import type { CliRunResult } from './cli-runner.js';

// ──────────────────────────────────────────────
// Phase & Status
// ──────────────────────────────────────────────

export type TeamPhase =
  | 'planning' | 'setup' | 'executing' | 'merging'
  | 'verifying' | 'cleanup' | 'completed' | 'failed' | 'cancelled';

export type TeamWiStatus =
  | 'pending' | 'ready' | 'running' | 'completed' | 'failed';

// ──────────────────────────────────────────────
// Plan structures
// ──────────────────────────────────────────────

export interface TeamRequirement {
  id: string;          // "R1"
  description: string;
  priority: 'must' | 'should' | 'nice';
}

export interface TeamWorkItem {
  id: string;           // "wi-1"
  title: string;
  description: string;
  ownedFiles: string[];     // can modify
  readOnlyFiles: string[];  // can read only
  blockedBy: string[];      // WI IDs
  prompt: string;           // full prompt for Claude CLI
  status: TeamWiStatus;
  retryCount: number;
  branch?: string;          // "team/<session>/wi-1"
  worktreePath?: string;    // ".team/wt/wi-1"
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  error?: string;
  cliResult?: CliRunResult;
}

export interface TeamPlan {
  requirements: TeamRequirement[];
  workItems: TeamWorkItem[];
  sharedFiles: string[];
}

// ──────────────────────────────────────────────
// Session
// ──────────────────────────────────────────────

export interface TeamSession {
  id: string;
  prompt: string;
  projectPath: string;
  chatId?: number;
  phase: TeamPhase;
  plan?: TeamPlan;
  workItems: TeamWorkItem[];
  baseBranch: string;
  mergeProgress?: { merged: number; total: number; conflicts: number };
  startedAt: number;
  completedAt?: number;
  totalCost?: number;
  error?: string;
  summary?: string;
}

// ──────────────────────────────────────────────
// WebSocket Event payloads
// ──────────────────────────────────────────────

export interface TeamStartedEvent {
  teamId: string;
  prompt: string;
  projectPath: string;
}

export interface TeamPhaseEvent {
  teamId: string;
  phase: TeamPhase;
  message: string;
}

export interface TeamPlanReadyEvent {
  teamId: string;
  requirementCount: number;
  workItemCount: number;
  workItems: Array<{ id: string; title: string; blockedBy: string[] }>;
}

export interface TeamWiStartedEvent {
  teamId: string;
  wiId: string;
  title: string;
}

export interface TeamWiCompletedEvent {
  teamId: string;
  wiId: string;
  title: string;
  success: boolean;
  durationMs: number;
}

export interface TeamWiFailedEvent {
  teamId: string;
  wiId: string;
  title: string;
  error: string;
  retryCount: number;
}

export interface TeamMergeProgressEvent {
  teamId: string;
  merged: number;
  total: number;
  conflicts: number;
}

export interface TeamCompletedEvent {
  teamId: string;
  summary: string;
  durationMs: number;
  totalCost: number;
  workItemCount: number;
}

export interface TeamFailedEvent {
  teamId: string;
  error: string;
  phase: TeamPhase;
}
