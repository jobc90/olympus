import { describe, expect, it } from 'vitest';
import { WorkerRegistry } from '../worker-registry.js';
import { ProjectScheduler } from '../project-runtime/project-scheduler.js';

describe('ProjectScheduler', () => {
  it('returns null when no workers match the project', () => {
    const registry = new WorkerRegistry();
    registry.register({ projectPath: '/workspace/web', pid: 101 });

    const scheduler = new ProjectScheduler(registry);
    const selected = scheduler.selectWorker({
      projectId: 'server',
    });

    expect(selected).toBeNull();
  });

  it('prefers continuity over generic idle workers', () => {
    const registry = new WorkerRegistry();
    const preferred = registry.register({
      name: 'server-default',
      projectPath: '/workspace/server',
      pid: 101,
    });
    registry.register({
      name: 'server-helper',
      projectPath: '/workspace/server',
      pid: 102,
    });

    const scheduler = new ProjectScheduler(registry);
    const selected = scheduler.selectWorker({
      projectId: 'server',
      preferredWorkerId: preferred.id,
    });

    expect(selected?.worker.id).toBe(preferred.id);
    expect(selected?.score.continuity).toBe(1);
  });

  it('prefers role and skill matches before generic idle workers', () => {
    const registry = new WorkerRegistry();
    registry.register({
      name: 'server-generic',
      projectPath: '/workspace/server',
      pid: 101,
      roleTags: ['backend'],
    });
    const specialist = registry.register({
      name: 'server-specialist',
      projectPath: '/workspace/server',
      pid: 102,
      roleTags: ['backend', 'infra'],
      skills: ['postgres', 'migrations'],
    });

    const scheduler = new ProjectScheduler(registry);
    const selected = scheduler.selectWorker({
      projectId: 'server',
      requiredRoleTags: ['infra'],
      requiredSkills: ['migrations'],
    });

    expect(selected?.worker.id).toBe(specialist.id);
    expect(selected?.score.capability).toBeGreaterThan(0);
  });

  it('prefers idle workers when continuity and capability tie', () => {
    const registry = new WorkerRegistry();
    const busy = registry.register({
      name: 'server-busy',
      projectPath: '/workspace/server',
      pid: 101,
    });
    registry.markBusy(busy.id, 'task-1', 'existing task');
    const idle = registry.register({
      name: 'server-idle',
      projectPath: '/workspace/server',
      pid: 102,
    });

    const scheduler = new ProjectScheduler(registry);
    const selected = scheduler.selectWorker({
      projectId: 'server',
    });

    expect(selected?.worker.id).toBe(idle.id);
    expect(selected?.score.idle).toBe(1);
  });
});
