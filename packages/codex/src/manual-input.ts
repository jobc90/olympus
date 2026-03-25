import type { ManualInputInterpretation } from './types.js';

type ManualInputContext = Omit<ManualInputInterpretation, 'classification' | 'reason'>;

export function interpretManualInput(input: ManualInputContext): ManualInputInterpretation {
  const hasActiveTask = input.workerStatus === 'busy'
    || Boolean(input.currentAuthorityTaskId)
    || Boolean(input.currentTaskId);

  if (hasActiveTask) {
    return {
      ...input,
      classification: 'task_intervention',
      reason: input.currentAuthorityTaskId
        ? 'manual input targets an active task with authority context'
        : 'manual input targets an active task',
    };
  }

  return {
    ...input,
    classification: 'new_task_candidate',
    reason: 'manual input arrived with no active task context',
  };
}
