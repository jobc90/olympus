/**
 * Worker Registry — Gateway에 등록된 Claude CLI 워커 관리
 *
 * `olympus start`로 시작된 워커 프로세스를 등록/해제하고
 * 작업 할당/완료를 추적한다.
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import type {
  RegisteredWorker,
  WorkerRegistration,
  WorkerTaskRecord,
  CliRunResult,
} from '@olympus-dev/protocol';

const HEARTBEAT_CHECK_INTERVAL = 15_000; // 15초
const HEARTBEAT_TIMEOUT = 60_000; // 60초

export class WorkerRegistry extends EventEmitter {
  private workers = new Map<string, RegisteredWorker>();
  private tasks = new Map<string, WorkerTaskRecord>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    this.heartbeatTimer = setInterval(() => this.checkHeartbeats(), HEARTBEAT_CHECK_INTERVAL);
  }

  register(info: WorkerRegistration): RegisteredWorker {
    const id = randomUUID();
    const now = Date.now();
    const worker: RegisteredWorker = {
      id,
      name: this.deduplicateName(info.name || basename(info.projectPath)),
      projectPath: info.projectPath,
      pid: info.pid,
      status: 'idle',
      registeredAt: now,
      lastHeartbeat: now,
    };
    this.workers.set(id, worker);
    this.emit('worker:registered', worker);
    return worker;
  }

  unregister(id: string): boolean {
    const worker = this.workers.get(id);
    if (!worker) return false;
    this.workers.delete(id);
    this.emit('worker:unregistered', worker);
    return true;
  }

  heartbeat(id: string): boolean {
    const worker = this.workers.get(id);
    if (!worker) return false;
    worker.lastHeartbeat = Date.now();
    return true;
  }

  getAll(): RegisteredWorker[] {
    return Array.from(this.workers.values());
  }

  getIdle(): RegisteredWorker[] {
    return this.getAll().filter(w => w.status === 'idle');
  }

  findByProject(query: string): RegisteredWorker | null {
    const lower = query.toLowerCase();
    for (const worker of this.workers.values()) {
      if (worker.name.toLowerCase() === lower) return worker;
    }
    for (const worker of this.workers.values()) {
      if (worker.projectPath.toLowerCase().includes(lower)) return worker;
    }
    return null;
  }

  markBusy(id: string, taskId: string, prompt: string): void {
    const worker = this.workers.get(id);
    if (!worker) return;
    worker.status = 'busy';
    worker.currentTaskId = taskId;
    worker.currentTaskPrompt = prompt;
  }

  markIdle(id: string): void {
    const worker = this.workers.get(id);
    if (!worker) return;
    worker.status = 'idle';
    worker.currentTaskId = undefined;
    worker.currentTaskPrompt = undefined;
  }

  createTask(workerId: string, prompt: string, chatId?: number): WorkerTaskRecord {
    const worker = this.workers.get(workerId);
    const taskId = randomUUID();
    const task: WorkerTaskRecord = {
      taskId,
      workerId,
      workerName: worker?.name ?? 'unknown',
      prompt,
      status: 'running',
      startedAt: Date.now(),
      chatId,            // 텔레그램 chat ID 저장
    };
    this.tasks.set(taskId, task);
    this.markBusy(workerId, taskId, prompt);
    return task;
  }

  completeTask(taskId: string, result: CliRunResult): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.status = result.success ? 'completed' : 'failed';
    task.completedAt = Date.now();
    task.result = result;
    this.markIdle(task.workerId);
    this.emit('task:completed', task);
  }

  getTask(taskId: string): WorkerTaskRecord | null {
    return this.tasks.get(taskId) ?? null;
  }

  getActiveTasks(): WorkerTaskRecord[] {
    return Array.from(this.tasks.values()).filter(t => t.status === 'running');
  }

  dispose(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private deduplicateName(baseName: string): string {
    const names = new Set(
      Array.from(this.workers.values()).map(w => w.name.toLowerCase()),
    );
    if (!names.has(baseName.toLowerCase())) return baseName;
    let n = 2;
    while (names.has(`${baseName.toLowerCase()}-${n}`)) n++;
    return `${baseName}-${n}`;
  }

  private checkHeartbeats(): void {
    const now = Date.now();
    for (const [id, worker] of this.workers) {
      if (now - worker.lastHeartbeat >= HEARTBEAT_TIMEOUT) {
        this.workers.delete(id);
        this.emit('worker:unregistered', worker);
      }
    }
  }
}
