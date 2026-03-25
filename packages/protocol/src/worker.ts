/**
 * Worker Registry Types for Olympus
 *
 * Gateway에 등록된 Claude CLI 워커의 타입 정의.
 * 워커는 `olympus start`로 시작된 PTY 기반 CLI 프로세스를 나타낸다.
 */

import type { CliRunResult } from './cli-runner.js';

// ──────────────────────────────────────────────
// Registered Worker
// ──────────────────────────────────────────────

export const WORKER_RUNTIME_KINDS = ['tmux', 'pty'] as const;

export type WorkerRuntimeKind = (typeof WORKER_RUNTIME_KINDS)[number];

export function supportsWorkerRuntimeControl(worker: { runtimeKind?: WorkerRuntimeKind }): boolean {
  return worker.runtimeKind === 'tmux' || worker.runtimeKind === 'pty';
}

export interface RegisteredWorker {
  id: string;
  name: string;
  projectPath: string;
  runtimeKind?: WorkerRuntimeKind;
  roleTags?: string[];
  skills?: string[];
  isEphemeral?: boolean;
  pid: number;
  status: 'idle' | 'busy' | 'offline';
  registeredAt: number;
  lastHeartbeat: number;
  currentTaskId?: string;
  currentAuthorityTaskId?: string;
  currentTaskPrompt?: string;
  /** 로컬 PTY stdin이 연결된 워커 — 대시보드 resize를 무시해야 함 */
  hasLocalPty?: boolean;
}

// ──────────────────────────────────────────────
// Worker Registration (클라이언트 → Gateway)
// ──────────────────────────────────────────────

export interface WorkerRegistration {
  name?: string;
  projectPath: string;
  runtimeKind?: WorkerRuntimeKind;
  roleTags?: string[];
  skills?: string[];
  isEphemeral?: boolean;
  pid: number;
  /** true = `olympus start`로 시작된 로컬 PTY 워커 */
  hasLocalPty?: boolean;
}

// ──────────────────────────────────────────────
// Worker Task Record
// ──────────────────────────────────────────────

export interface WorkerTaskRecord {
  taskId: string;
  workerId: string;
  workerName: string;
  authorityTaskId?: string;
  prompt: string;
  status: 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled';
  startedAt: number;
  completedAt?: number;
  result?: CliRunResult;
  chatId?: number;       // 텔레그램 응답 대상 chat ID
  timeoutResult?: CliRunResult;  // 30분 타임아웃 시 부분 결과
  timeoutAt?: number;            // 타임아웃 발생 시점
}
