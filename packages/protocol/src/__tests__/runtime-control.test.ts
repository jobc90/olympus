import { describe, expect, it } from 'vitest';
import {
  RUNTIME_CONTROL_COMMANDS,
  createRuntimeControlError,
  createRuntimeControlRequest,
  createRuntimeControlSuccess,
} from '../runtime-control.js';

describe('runtime control protocol', () => {
  it('keeps the allowed runtime control commands stable', () => {
    expect(RUNTIME_CONTROL_COMMANDS).toEqual([
      'assign_instruction',
      'send_input',
      'soft_preempt',
      'get_state',
      'lock_input',
      'unlock_input',
      'reset_session',
      'capture_terminal_snapshot',
    ]);
  });

  it('builds assign-instruction requests with stable metadata', () => {
    const request = createRuntimeControlRequest({
      request_id: 'req-1',
      worker_id: 'worker-1',
      command: 'assign_instruction',
      payload: {
        task_id: 'task-1',
        project_id: 'server',
        title: 'Implement auth flow',
        instruction_version: 'v1',
        instruction_path: '/tmp/task/instruction.md',
        project_mirror_path: '/workspace/server/.olympus/tasks/task-1/instruction.md',
        launcher_prompt: 'Read and execute the instruction file.',
        verification: ['pnpm test'],
        worker_mode: 'resident',
      },
    });

    expect(request).toMatchObject({
      request_id: 'req-1',
      worker_id: 'worker-1',
      command: 'assign_instruction',
      payload: {
        task_id: 'task-1',
        project_id: 'server',
        worker_mode: 'resident',
      },
    });
    expect(request.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('builds send-input requests with submit metadata', () => {
    const request = createRuntimeControlRequest({
      request_id: 'req-input',
      worker_id: 'worker-1',
      command: 'send_input',
      payload: {
        text: 'status',
        submit: true,
        source: 'dashboard',
      },
    });

    expect(request).toMatchObject({
      request_id: 'req-input',
      worker_id: 'worker-1',
      command: 'send_input',
      payload: {
        text: 'status',
        submit: true,
        source: 'dashboard',
      },
    });
  });

  it('builds success and error responses with stable envelopes', () => {
    const success = createRuntimeControlSuccess({
      request_id: 'req-1',
      worker_id: 'worker-1',
      result: {
        type: 'terminal_snapshot',
        snapshot: 'done',
        lines: 120,
      },
    });
    const error = createRuntimeControlError({
      request_id: 'req-1',
      worker_id: 'worker-1',
      code: 'INVALID_REQUEST',
      message: 'Unsupported command',
    });

    expect(success).toMatchObject({
      request_id: 'req-1',
      worker_id: 'worker-1',
      ok: true,
      result: {
        type: 'terminal_snapshot',
        lines: 120,
      },
    });
    expect(error).toMatchObject({
      request_id: 'req-1',
      worker_id: 'worker-1',
      ok: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'Unsupported command',
      },
    });
  });
});
