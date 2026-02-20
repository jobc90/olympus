import { randomUUID } from 'node:crypto';

type DerivedEvent = { type: 'worker:status' | 'activity:event'; payload: unknown };

type WorkerTaskAssignedPayload = {
  taskId?: string;
  workerId?: string;
  workerName?: string;
  prompt?: string;
};

type WorkerTaskCompletedPayload = {
  taskId?: string;
  workerId?: string;
  workerName?: string;
  summary?: string;
  success?: boolean;
  status?: string;
};

type WorkerTaskTimeoutPayload = {
  taskId?: string;
  workerId?: string;
  workerName?: string;
  summary?: string;
};

type WorkerTaskFailedPayload = {
  workerId?: string;
  workerName?: string;
  taskIds?: string[];
};

function shortText(text: string | undefined, max = 80): string {
  if (!text) return '';
  const line = text.replace(/\s+/g, ' ').trim();
  if (!line) return '';
  return line.length > max ? `${line.slice(0, max)}...` : line;
}

export function deriveWorkerEvents(eventType: string, payload: unknown, now = Date.now()): DerivedEvent[] {
  if (eventType === 'worker:task:assigned') {
    const p = payload as WorkerTaskAssignedPayload;
    if (!p.workerId) return [];
    return [
      {
        type: 'worker:status',
        payload: {
          workerId: p.workerId,
          behavior: 'working',
          lastActivityAt: now,
          activeTaskId: p.taskId ?? null,
          activeTaskPrompt: p.prompt ?? null,
          sourceEvent: eventType,
        },
      },
      {
        type: 'activity:event',
        payload: {
          id: randomUUID(),
          type: 'assignment',
          severity: 'info',
          workerId: p.workerId,
          workerName: p.workerName ?? p.workerId,
          taskId: p.taskId ?? null,
          message: p.prompt ? `작업 시작: ${shortText(p.prompt)}` : '작업 시작',
          timestamp: now,
          sourceEvent: eventType,
        },
      },
    ];
  }

  if (eventType === 'worker:task:completed' || eventType === 'worker:task:final_after_timeout') {
    const p = payload as WorkerTaskCompletedPayload;
    if (!p.workerId) return [];
    const success = p.success ?? p.status === 'completed';
    return [
      {
        type: 'worker:status',
        payload: {
          workerId: p.workerId,
          behavior: success ? 'completed' : 'error',
          lastActivityAt: now,
          activeTaskId: null,
          activeTaskPrompt: null,
          sourceEvent: eventType,
        },
      },
      {
        type: 'activity:event',
        payload: {
          id: randomUUID(),
          type: success ? 'completion' : 'failure',
          severity: success ? 'info' : 'error',
          workerId: p.workerId,
          workerName: p.workerName ?? p.workerId,
          taskId: p.taskId ?? null,
          message: shortText(p.summary, 120) || (success ? '작업 완료' : '작업 실패'),
          timestamp: now,
          sourceEvent: eventType,
        },
      },
    ];
  }

  if (eventType === 'worker:task:timeout') {
    const p = payload as WorkerTaskTimeoutPayload;
    if (!p.workerId) return [];
    return [
      {
        type: 'worker:status',
        payload: {
          workerId: p.workerId,
          behavior: 'thinking',
          lastActivityAt: now,
          activeTaskId: p.taskId ?? null,
          activeTaskPrompt: null,
          sourceEvent: eventType,
        },
      },
      {
        type: 'activity:event',
        payload: {
          id: randomUUID(),
          type: 'timeout',
          severity: 'warn',
          workerId: p.workerId,
          workerName: p.workerName ?? p.workerId,
          taskId: p.taskId ?? null,
          message: shortText(p.summary, 120) || '타임아웃 감지 (모니터링 중)',
          timestamp: now,
          sourceEvent: eventType,
        },
      },
    ];
  }

  if (eventType === 'worker:task:failed') {
    const p = payload as WorkerTaskFailedPayload;
    if (!p.workerId) return [];
    const count = p.taskIds?.length ?? 0;
    return [
      {
        type: 'worker:status',
        payload: {
          workerId: p.workerId,
          behavior: 'error',
          lastActivityAt: now,
          activeTaskId: null,
          activeTaskPrompt: null,
          sourceEvent: eventType,
        },
      },
      {
        type: 'activity:event',
        payload: {
          id: randomUUID(),
          type: 'failure',
          severity: 'error',
          workerId: p.workerId,
          workerName: p.workerName ?? p.workerId,
          taskId: null,
          message: count > 0 ? `워커 비정상 종료: ${count}개 작업 실패` : '워커 비정상 종료',
          timestamp: now,
          sourceEvent: eventType,
        },
      },
    ];
  }

  if (eventType === 'worker:task:summary') {
    const p = payload as { taskId?: string; workerId?: string; workerName?: string; summary?: string };
    if (!p.workerId) return [];
    return [
      {
        type: 'activity:event',
        payload: {
          id: randomUUID(),
          type: 'summary',
          severity: 'info',
          workerId: p.workerId,
          workerName: p.workerName ?? p.workerId,
          taskId: p.taskId ?? null,
          message: shortText(p.summary, 120) || '작업 요약 업데이트',
          timestamp: now,
          sourceEvent: eventType,
        },
      },
    ];
  }

  return [];
}
