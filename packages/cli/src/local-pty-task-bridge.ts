import type { TaskResult } from './worker-runtime.js';
import type { ReportTaskResultInput } from './worker-task-orchestrator.js';

const TEXT_LIMIT = 50_000;

export interface LocalPtyTaskBridge {
  onLocalInput(line: string): Promise<void>;
}

export interface CreateLocalPtyTaskBridgeInput {
  workerId: string;
  gatewayUrl: string;
  apiKey: string;
  forceTrust: boolean;
  handledTaskIds: Set<string>;
  isRuntimeProcessing: () => boolean;
  shouldAcceptInput: () => boolean;
  monitorForCompletion: (prompt: string) => Promise<TaskResult>;
  reportResult: (taskId: string, result: ReportTaskResultInput) => Promise<void>;
  fetchImpl?: typeof fetch;
}

export function createLocalPtyTaskBridge(
  input: CreateLocalPtyTaskBridgeInput,
): LocalPtyTaskBridge {
  const fetchImpl = input.fetchImpl ?? fetch;
  let taskPending = false;

  return {
    async onLocalInput(line: string): Promise<void> {
      if (!input.shouldAcceptInput() || taskPending) return;
      if (input.isRuntimeProcessing()) return;

      taskPending = true;
      let taskId = '';
      try {
        const taskRes = await fetchImpl(`${input.gatewayUrl}/api/workers/${input.workerId}/task`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${input.apiKey}`,
          },
          body: JSON.stringify({
            prompt: line,
            source: 'local-pty',
            dangerouslySkipPermissions: input.forceTrust,
          }),
        });
        if (!taskRes.ok) return;

        const data = await taskRes.json() as { taskId: string };
        taskId = data.taskId;
        input.handledTaskIds.add(taskId);
      } catch {
        return;
      } finally {
        taskPending = false;
      }

      try {
        const result = await input.monitorForCompletion(line);
        await input.reportResult(taskId, {
          success: result.success,
          text: result.text.slice(0, TEXT_LIMIT),
          durationMs: result.durationMs,
        });
      } catch (error) {
        await input.reportResult(taskId, {
          success: false,
          error: (error as Error).message,
          durationMs: 0,
        });
      }
    },
  };
}
