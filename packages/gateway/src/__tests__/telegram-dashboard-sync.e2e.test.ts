import { describe, expect, it } from 'vitest';
import { WorkerRegistry } from '../worker-registry.js';
import { deriveWorkerEvents } from '../worker-events.js';
import type { CliRunResult, WorkerTaskRecord } from '@olympus-dev/protocol';

type EventRecord = { type: string; payload: Record<string, unknown> };

function parseWorkerCommand(input: string): { workerName: string; prompt: string } | null {
  const match = input.match(/^@(\S+)\s+([\s\S]+)/);
  if (!match) return null;
  return { workerName: match[1], prompt: match[2].trim() };
}

function emitLifecycleEvent(events: EventRecord[], type: string, payload: Record<string, unknown>, now: number): void {
  events.push({ type, payload });
  const derived = deriveWorkerEvents(type, payload, now);
  for (const item of derived) {
    events.push({ type: item.type, payload: item.payload as Record<string, unknown> });
  }
}

function makeCliResult(success: boolean, text: string): CliRunResult {
  return {
    success,
    text,
    sessionId: 'sess-console-1',
    model: 'gpt-5.3-codex',
    usage: {
      inputTokens: 320,
      outputTokens: 190,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    },
    cost: 0.0123,
    durationMs: 1_200,
    numTurns: 1,
  };
}

describe('Telegram → Worker → Dashboard sync E2E', () => {
  it('produces dashboard-compatible status lifecycle from @mention command', () => {
    const registry = new WorkerRegistry();
    const worker = registry.register({ name: 'console', projectPath: '/Users/jobc/dev/console', pid: 777 });
    const emitted: EventRecord[] = [];

    const parsed = parseWorkerCommand('@console 상황파악하고 보고해');
    expect(parsed).not.toBeNull();
    expect(parsed!.workerName).toBe('console');

    const task: WorkerTaskRecord = registry.createTask(worker.id, parsed!.prompt, 8502174612);
    emitLifecycleEvent(emitted, 'worker:task:assigned', {
      taskId: task.taskId,
      workerId: worker.id,
      workerName: worker.name,
      prompt: parsed!.prompt,
      chatId: task.chatId,
    }, 1_000);

    registry.completeTask(task.taskId, makeCliResult(true, '현재 상황 요약을 보고합니다.'));
    emitLifecycleEvent(emitted, 'worker:task:completed', {
      taskId: task.taskId,
      workerId: worker.id,
      workerName: worker.name,
      summary: '현재 상황 요약을 보고합니다.',
      success: true,
      chatId: task.chatId,
    }, 2_500);

    const statuses = emitted
      .filter(e => e.type === 'worker:status')
      .map(e => e.payload.behavior);
    expect(statuses).toEqual(['working', 'completed']);

    const activityTypes = emitted
      .filter(e => e.type === 'activity:event')
      .map(e => e.payload.type);
    expect(activityTypes).toContain('assignment');
    expect(activityTypes).toContain('completion');

    const latestWorker = registry.getAll().find(w => w.id === worker.id);
    expect(latestWorker?.status).toBe('idle');
  });

  it('keeps lifecycle coherent for timeout then final completion', () => {
    const registry = new WorkerRegistry();
    const worker = registry.register({ name: 'console', projectPath: '/Users/jobc/dev/console', pid: 888 });
    const emitted: EventRecord[] = [];

    const task = registry.createTask(worker.id, '긴 작업 실행', 8502174612);
    emitLifecycleEvent(emitted, 'worker:task:assigned', {
      taskId: task.taskId,
      workerId: worker.id,
      workerName: worker.name,
      prompt: task.prompt,
    }, 10_000);

    registry.timeoutTask(task.taskId, makeCliResult(true, '중간 결과'));
    emitLifecycleEvent(emitted, 'worker:task:timeout', {
      taskId: task.taskId,
      workerId: worker.id,
      workerName: worker.name,
      summary: '30분 타임아웃 - 모니터링 중',
    }, 40_000);

    registry.completeTask(task.taskId, makeCliResult(true, '최종 결과 완료'));
    emitLifecycleEvent(emitted, 'worker:task:final_after_timeout', {
      taskId: task.taskId,
      workerId: worker.id,
      workerName: worker.name,
      summary: '최종 결과 완료',
      success: true,
    }, 45_000);

    const statuses = emitted
      .filter(e => e.type === 'worker:status')
      .map(e => e.payload.behavior);
    expect(statuses).toEqual(['working', 'thinking', 'completed']);
  });
});
