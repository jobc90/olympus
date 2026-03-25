export const RUNTIME_CONTROL_COMMANDS = [
  'assign_instruction',
  'send_input',
  'soft_preempt',
  'get_state',
  'lock_input',
  'unlock_input',
  'reset_session',
  'capture_terminal_snapshot',
] as const;

export type RuntimeControlCommand = (typeof RUNTIME_CONTROL_COMMANDS)[number];

export interface AssignInstructionCommandPayload {
  task_id: string;
  project_id: string;
  title: string;
  instruction_version: string;
  instruction_path: string;
  project_mirror_path: string;
  launcher_prompt: string;
  verification: string[];
  worker_mode?: 'resident' | 'ephemeral';
}

export interface SoftPreemptCommandPayload {
  task_id: string;
  replacement_task_id?: string;
  reason: string;
}

export interface GetRuntimeStateCommandPayload {}

export interface SendInputCommandPayload {
  text: string;
  submit?: boolean;
  source?: 'dashboard' | 'terminal' | 'remote';
}

export interface LockInputCommandPayload {
  reason: string;
}

export interface UnlockInputCommandPayload {
  reason?: string;
}

export interface ResetSessionCommandPayload {
  reason?: string;
}

export interface CaptureTerminalSnapshotCommandPayload {
  lines?: number;
}

export interface RuntimeControlRequestMap {
  assign_instruction: AssignInstructionCommandPayload;
  send_input: SendInputCommandPayload;
  soft_preempt: SoftPreemptCommandPayload;
  get_state: GetRuntimeStateCommandPayload;
  lock_input: LockInputCommandPayload;
  unlock_input: UnlockInputCommandPayload;
  reset_session: ResetSessionCommandPayload;
  capture_terminal_snapshot: CaptureTerminalSnapshotCommandPayload;
}

export type RuntimeControlRequest<
  TCommand extends RuntimeControlCommand = RuntimeControlCommand,
> = {
  request_id: string;
  worker_id: string;
  timestamp: string;
  command: TCommand;
  payload: RuntimeControlRequestMap[TCommand];
};

export interface RuntimeAcceptedResult {
  type: 'accepted';
  accepted: true;
  detail?: string;
}

export interface RuntimeTerminalSnapshotResult {
  type: 'terminal_snapshot';
  snapshot: string;
  lines: number;
}

export interface RuntimeStateResult {
  type: 'state';
  input_locked: boolean;
  active_task_id?: string;
}

export type RuntimeControlSuccessResult =
  | RuntimeAcceptedResult
  | RuntimeTerminalSnapshotResult
  | RuntimeStateResult;

export interface RuntimeControlSuccessResponse {
  request_id: string;
  worker_id: string;
  timestamp: string;
  ok: true;
  result: RuntimeControlSuccessResult;
}

export interface RuntimeControlError {
  code: 'INVALID_REQUEST' | 'UNSUPPORTED_COMMAND' | 'INTERNAL_ERROR';
  message: string;
}

export interface RuntimeControlErrorResponse {
  request_id: string;
  worker_id: string;
  timestamp: string;
  ok: false;
  error: RuntimeControlError;
}

export type RuntimeControlResponse =
  | RuntimeControlSuccessResponse
  | RuntimeControlErrorResponse;

export function createRuntimeControlRequest<TCommand extends RuntimeControlCommand>(
  input: Omit<RuntimeControlRequest<TCommand>, 'timestamp'> & { timestamp?: string },
): RuntimeControlRequest<TCommand> {
  return {
    ...input,
    timestamp: input.timestamp ?? new Date().toISOString(),
  };
}

export function createRuntimeControlSuccess(
  input: Omit<RuntimeControlSuccessResponse, 'timestamp' | 'ok'> & { timestamp?: string },
): RuntimeControlSuccessResponse {
  return {
    ...input,
    ok: true,
    timestamp: input.timestamp ?? new Date().toISOString(),
  };
}

export function createRuntimeControlError(
  input: {
    request_id: string;
    worker_id: string;
    code: RuntimeControlError['code'];
    message: string;
    timestamp?: string;
  },
): RuntimeControlErrorResponse {
  return {
    request_id: input.request_id,
    worker_id: input.worker_id,
    ok: false,
    timestamp: input.timestamp ?? new Date().toISOString(),
    error: {
      code: input.code,
      message: input.message,
    },
  };
}
