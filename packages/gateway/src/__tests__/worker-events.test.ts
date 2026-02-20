import { describe, expect, it } from 'vitest';
import { deriveWorkerEvents } from '../worker-events.js';

describe('deriveWorkerEvents', () => {
  it('derives worker status + activity for assignment', () => {
    const events = deriveWorkerEvents('worker:task:assigned', {
      taskId: 'task-1',
      workerId: 'worker-a',
      workerName: 'console',
      prompt: '상황파악하고 보고해',
    }, 1_000);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: 'worker:status',
      payload: {
        workerId: 'worker-a',
        behavior: 'working',
        activeTaskId: 'task-1',
        activeTaskPrompt: '상황파악하고 보고해',
        lastActivityAt: 1_000,
      },
    });
    expect(events[1]).toMatchObject({
      type: 'activity:event',
      payload: {
        type: 'assignment',
        severity: 'info',
        workerId: 'worker-a',
        workerName: 'console',
        taskId: 'task-1',
      },
    });
  });

  it('derives error state on failed completion', () => {
    const events = deriveWorkerEvents('worker:task:completed', {
      taskId: 'task-2',
      workerId: 'worker-b',
      workerName: 'olympus',
      success: false,
      summary: '테스트 실패',
    }, 2_000);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: 'worker:status',
      payload: {
        workerId: 'worker-b',
        behavior: 'error',
        activeTaskId: null,
      },
    });
    expect(events[1]).toMatchObject({
      type: 'activity:event',
      payload: {
        type: 'failure',
        severity: 'error',
        workerId: 'worker-b',
        workerName: 'olympus',
        taskId: 'task-2',
      },
    });
  });

  it('derives failure event when worker dies', () => {
    const events = deriveWorkerEvents('worker:task:failed', {
      workerId: 'worker-c',
      taskIds: ['a', 'b', 'c'],
    }, 3_000);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: 'worker:status',
      payload: {
        workerId: 'worker-c',
        behavior: 'error',
        activeTaskId: null,
      },
    });
    expect(events[1]).toMatchObject({
      type: 'activity:event',
      payload: {
        type: 'failure',
        severity: 'error',
        workerId: 'worker-c',
        message: '워커 비정상 종료: 3개 작업 실패',
      },
    });
  });

  it('returns empty for unrelated events', () => {
    expect(deriveWorkerEvents('usage:update', {}, 4_000)).toEqual([]);
  });
});
