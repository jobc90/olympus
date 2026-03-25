import { describe, expect, it } from 'vitest';
import {
  TASK_ARTIFACT_FILE_NAMES,
  TASK_AUTHORITY_STATUSES,
  assertTaskStatusTransition,
  canTransitionTaskStatus,
  resolveTaskArtifactPaths,
} from '../index.js';

describe('Task Authority protocol', () => {
  it('defines the approved status machine in order', () => {
    expect(TASK_AUTHORITY_STATUSES).toEqual([
      'draft',
      'ready',
      'assigned',
      'in_progress',
      'blocked',
      'completed',
      'failed',
      'cancelled',
    ]);
  });

  it('allows approved forward transitions', () => {
    expect(canTransitionTaskStatus('draft', 'ready')).toBe(true);
    expect(canTransitionTaskStatus('ready', 'assigned')).toBe(true);
    expect(canTransitionTaskStatus('assigned', 'in_progress')).toBe(true);
    expect(canTransitionTaskStatus('in_progress', 'blocked')).toBe(true);
    expect(canTransitionTaskStatus('blocked', 'assigned')).toBe(true);
    expect(canTransitionTaskStatus('in_progress', 'completed')).toBe(true);
    expect(canTransitionTaskStatus('in_progress', 'failed')).toBe(true);
    expect(canTransitionTaskStatus('ready', 'cancelled')).toBe(true);
  });

  it('rejects invalid or terminal transitions', () => {
    expect(canTransitionTaskStatus('draft', 'completed')).toBe(false);
    expect(canTransitionTaskStatus('completed', 'in_progress')).toBe(false);
    expect(canTransitionTaskStatus('failed', 'ready')).toBe(false);
    expect(() => assertTaskStatusTransition('cancelled', 'assigned')).toThrow(
      'Invalid task status transition: cancelled -> assigned',
    );
  });

  it('resolves central and project-local artifact paths', () => {
    const paths = resolveTaskArtifactPaths({
      controlRoot: '/control-root',
      projectRoot: '/workspace/server',
      projectId: 'server',
      taskId: 'task-123',
    });

    expect(paths.central.baseDir).toBe('/control-root/projects/server/tasks/task-123');
    expect(paths.local.baseDir).toBe('/workspace/server/.olympus/tasks/task-123');
    expect(paths.central.instruction).toBe(
      '/control-root/projects/server/tasks/task-123/instruction.md',
    );
    expect(paths.local.startAckJson).toBe(
      '/workspace/server/.olympus/tasks/task-123/start-ack.json',
    );
    expect(paths.local.finalReportMarkdown).toBe(
      '/workspace/server/.olympus/tasks/task-123/final-report.ko.md',
    );
  });

  it('keeps artifact file names stable', () => {
    expect(TASK_ARTIFACT_FILE_NAMES).toEqual({
      instruction: 'instruction.md',
      startAckJson: 'start-ack.json',
      startAckMarkdown: 'start-ack.ko.md',
      finalReportJson: 'final-report.json',
      finalReportMarkdown: 'final-report.ko.md',
    });
  });
});
