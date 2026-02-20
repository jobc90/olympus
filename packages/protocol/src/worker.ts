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

export interface RegisteredWorker {
  id: string;
  name: string;
  projectPath: string;
  pid: number;
  status: 'idle' | 'busy' | 'offline';
  registeredAt: number;
  lastHeartbeat: number;
  currentTaskId?: string;
  currentTaskPrompt?: string;
}

// ──────────────────────────────────────────────
// Worker Registration (클라이언트 → Gateway)
// ──────────────────────────────────────────────

export interface WorkerRegistration {
  name?: string;
  projectPath: string;
  pid: number;
}

// ──────────────────────────────────────────────
// Worker Task Record
// ──────────────────────────────────────────────

export interface WorkerTaskRecord {
  taskId: string;
  workerId: string;
  workerName: string;
  prompt: string;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  startedAt: number;
  completedAt?: number;
  result?: CliRunResult;
  chatId?: number;       // 텔레그램 응답 대상 chat ID
  timeoutResult?: CliRunResult;  // 30분 타임아웃 시 부분 결과
  timeoutAt?: number;            // 타임아웃 발생 시점
}
