import { describe, expect, it } from 'vitest';
import { interpretManualInput } from '../manual-input.js';

describe('interpretManualInput', () => {
  it('classifies active worker input as a task intervention', () => {
    const result = interpretManualInput({
      workerId: 'worker-1',
      workerName: 'server-worker',
      projectId: 'server',
      projectPath: '/workspace/server',
      prompt: '이 경고 무시하고 계속 진행해',
      source: 'dashboard',
      timestamp: 1_717_000_000_000,
      workerStatus: 'busy',
      currentTaskId: 'worker-task-1',
      currentAuthorityTaskId: 'authority-task-1',
      currentTaskPrompt: '로그인 API 수정',
      matchedSessionId: 'sess-server',
    });

    expect(result.classification).toBe('task_intervention');
    expect(result.matchedSessionId).toBe('sess-server');
    expect(result.currentAuthorityTaskId).toBe('authority-task-1');
    expect(result.reason).toContain('active task');
  });

  it('classifies idle worker input as a new task candidate', () => {
    const result = interpretManualInput({
      workerId: 'worker-2',
      workerName: 'admin-worker',
      projectId: 'admin-front',
      projectPath: '/workspace/admin-front',
      prompt: '대시보드 필터 버그 수정해',
      source: 'dashboard',
      timestamp: 1_717_000_000_000,
      workerStatus: 'idle',
    });

    expect(result.classification).toBe('new_task_candidate');
    expect(result.currentTaskId).toBeUndefined();
    expect(result.reason).toContain('no active task');
  });
});
