/**
 * Worker Registry — Gateway에 등록된 Claude CLI 워커 관리
 *
 * `olympus start`로 시작된 워커 프로세스를 등록/해제하고
 * 작업 할당/완료를 추적한다.
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
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
    // 같은 워커의 기존 running 작업 정리
    for (const [, t] of this.tasks) {
      if (t.workerId === workerId && t.status === 'running') {
        t.status = 'failed';
        t.completedAt = Date.now();
      }
    }

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
    this.emit('task:assigned', task);
    this.saveTasksToFile();
    return task;
  }

  timeoutTask(taskId: string, result: CliRunResult): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      console.warn('[WorkerRegistry] Unknown task timeout:', taskId);
      return;
    }
    task.status = 'timeout';
    task.timeoutAt = Date.now();
    task.timeoutResult = result;
    // 핵심: markIdle() 호출하지 않음 → 워커는 busy 유지
    this.emit('task:timeout', task);
    this.saveTasksToFile();
  }

  completeTask(taskId: string, result: CliRunResult): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      console.warn('[WorkerRegistry] Unknown task completion:', taskId);
      return;
    }
    const wasTimeout = task.status === 'timeout';
    task.status = result.success ? 'completed' : 'failed';
    task.completedAt = Date.now();
    task.result = result;
    this.markIdle(task.workerId);
    this.emit(wasTimeout ? 'task:final_after_timeout' : 'task:completed', task);
    this.saveTasksToFile();
  }

  getTask(taskId: string): WorkerTaskRecord | null {
    return this.tasks.get(taskId) ?? null;
  }

  getActiveTasks(): WorkerTaskRecord[] {
    return Array.from(this.tasks.values()).filter(t => t.status === 'running' || t.status === 'timeout');
  }

  getAllTaskRecords(): WorkerTaskRecord[] {
    return Array.from(this.tasks.values())
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, 50);
  }

  private get tasksFilePath(): string {
    const dir = join(homedir(), '.olympus');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return join(dir, 'active-tasks.json');
  }

  private saveTasksToFile(): void {
    try {
      const active = Array.from(this.tasks.values()).filter(t => t.status === 'running' || t.status === 'timeout');
      writeFileSync(this.tasksFilePath, JSON.stringify(active, null, 2));
    } catch { /* ignore write errors */ }
  }

  loadTasksFromFile(): void {
    try {
      if (!existsSync(this.tasksFilePath)) return;
      const data = JSON.parse(readFileSync(this.tasksFilePath, 'utf-8'));
      const now = Date.now();
      const ONE_HOUR = 60 * 60 * 1000;
      for (const t of data) {
        if ((t.status === 'running' || t.status === 'timeout') && now - t.startedAt < ONE_HOUR) {
          this.tasks.set(t.taskId, t);
        }
      }
    } catch { /* ignore read errors */ }
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
