import { describe, expect, it, vi } from 'vitest';
import { reconcileWorkerDiedOutcome, reconcileWorkerDiedPayload } from '../server.js';

describe('reconcileWorkerDiedPayload', () => {
  it('maps failed worker tasks back to authority task ids', () => {
    const finalizeWorkerTask = vi
      .fn()
      .mockReturnValueOnce({
        authorityTaskId: 'authority-1',
      })
      .mockReturnValueOnce({
        authorityTaskId: null,
      })
      .mockReturnValueOnce({
        authorityTaskId: 'authority-3',
      });

    const payload = reconcileWorkerDiedPayload(
      { finalizeWorkerTask } as never,
      { workerId: 'worker-1', taskIds: ['task-1', 'task-2', 'task-3'] },
    );

    expect(finalizeWorkerTask).toHaveBeenNthCalledWith(1, {
      workerTaskId: 'task-1',
      success: false,
    });
    expect(finalizeWorkerTask).toHaveBeenNthCalledWith(2, {
      workerTaskId: 'task-2',
      success: false,
    });
    expect(finalizeWorkerTask).toHaveBeenNthCalledWith(3, {
      workerTaskId: 'task-3',
      success: false,
    });
    expect(payload).toEqual({
      workerId: 'worker-1',
      taskIds: ['task-1', 'task-2', 'task-3'],
      authorityTaskIds: ['authority-1', 'authority-3'],
    });
  });

  it('returns the original payload when no authority task is linked', () => {
    const payload = reconcileWorkerDiedPayload(
      {
        finalizeWorkerTask: vi.fn(() => ({
          authorityTaskId: null,
        })),
      } as never,
      { workerId: 'worker-1', taskIds: ['task-1'] },
    );

    expect(payload).toEqual({
      workerId: 'worker-1',
      taskIds: ['task-1'],
    });
  });

  it('collects unique project ids for queued recovery after worker death', () => {
    const outcome = reconcileWorkerDiedOutcome(
      {
        finalizeWorkerTask: vi
          .fn()
          .mockReturnValueOnce({
            authorityTaskId: 'authority-1',
            task: { projectId: 'server' },
          })
          .mockReturnValueOnce({
            authorityTaskId: 'authority-2',
            task: { projectId: 'server' },
          })
          .mockReturnValueOnce({
            authorityTaskId: 'authority-3',
            task: { projectId: 'admin' },
          }),
      } as never,
      { workerId: 'worker-1', taskIds: ['task-1', 'task-2', 'task-3'] },
    );

    expect(outcome.payload).toEqual({
      workerId: 'worker-1',
      taskIds: ['task-1', 'task-2', 'task-3'],
      authorityTaskIds: ['authority-1', 'authority-2', 'authority-3'],
    });
    expect(outcome.projectIds).toEqual(['server', 'admin']);
  });
});
