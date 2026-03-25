import { describe, expect, it } from 'vitest';
import { TaskPlanner } from '../task-planner.js';
import type { ManagedSession } from '../types.js';

function createSessions(): ManagedSession[] {
  return [
    {
      id: 'sess-1',
      name: 'olympus-console',
      projectPath: '/dev/console',
      status: 'ready',
      lastActivity: Date.now(),
      commandQueue: [],
      createdAt: Date.now(),
    },
    {
      id: 'sess-2',
      name: 'olympus-user-next',
      projectPath: '/dev/user-next',
      status: 'ready',
      lastActivity: Date.now(),
      commandQueue: [],
      createdAt: Date.now(),
    },
  ];
}

describe('TaskPlanner', () => {
  const planner = new TaskPlanner();

  it('extracts an explicit single project target', () => {
    const result = planner.plan('@console 빌드해줘', createSessions());

    expect(result?.kind).toBe('single_project');
    expect(result?.targetSessionIds).toEqual(['sess-1']);
    expect(result?.processedInput).toBe('빌드해줘');
    expect(result?.manualPath).toBe(false);
  });

  it('decomposes multi-project requests', () => {
    const result = planner.plan('@console @user-next 상태 확인', createSessions());

    expect(result?.kind).toBe('multi_project');
    expect(result?.targetSessionIds).toEqual(['sess-1', 'sess-2']);
    expect(result?.processedInput).toBe('상태 확인');
    expect(result?.manualPath).toBe(false);
  });

  it('treats unresolved worker mentions as manual path fallback', () => {
    const result = planner.plan('@worker-7 빌드해줘', createSessions());

    expect(result?.kind).toBe('worker_fallback');
    expect(result?.targetSessionIds).toEqual([]);
    expect(result?.manualPath).toBe(true);
  });
});
