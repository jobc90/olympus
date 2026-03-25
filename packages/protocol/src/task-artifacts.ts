import path from 'path';

export const TASK_ARTIFACT_FILE_NAMES = {
  instruction: 'instruction.md',
  startAckJson: 'start-ack.json',
  startAckMarkdown: 'start-ack.ko.md',
  finalReportJson: 'final-report.json',
  finalReportMarkdown: 'final-report.ko.md',
} as const;

export type TaskArtifactKind = keyof typeof TASK_ARTIFACT_FILE_NAMES;

export interface InstructionArtifactMetadata {
  taskId: string;
  projectId: string;
  version: string;
  generatedAt: string;
}

export interface StartAckArtifact {
  task_id: string;
  project_id: string;
  worker_id: string;
  instruction_version: string;
  accepted: boolean;
  understood_goal: string;
  execution_plan_summary: string[];
  verification_scope: string[];
  blocking_preconditions: string[];
  timestamp: string;
}

export interface VerificationResult {
  command: string;
  status: 'passed' | 'failed' | 'skipped';
  details?: string;
}

export interface AutonomousDecision {
  issue: string;
  decision: string;
}

export interface FinalReportArtifact {
  task_id: string;
  project_id: string;
  worker_id: string;
  status: 'completed' | 'failed' | 'cancelled' | 'blocked';
  summary: string;
  files_changed: string[];
  commands_executed: string[];
  verification_results: VerificationResult[];
  blocked_points: string[];
  autonomous_decisions: AutonomousDecision[];
  risks_remaining: string[];
  artifacts: string[];
  timestamp: string;
}

export interface TaskArtifactFileSet {
  baseDir: string;
  instruction: string;
  startAckJson: string;
  startAckMarkdown: string;
  finalReportJson: string;
  finalReportMarkdown: string;
}

export interface TaskArtifactPaths {
  central: TaskArtifactFileSet;
  local: TaskArtifactFileSet;
}

export interface ResolveTaskArtifactPathsParams {
  controlRoot: string;
  projectRoot: string;
  projectId: string;
  taskId: string;
}

function buildFileSet(baseDir: string): TaskArtifactFileSet {
  return {
    baseDir,
    instruction: path.join(baseDir, TASK_ARTIFACT_FILE_NAMES.instruction),
    startAckJson: path.join(baseDir, TASK_ARTIFACT_FILE_NAMES.startAckJson),
    startAckMarkdown: path.join(baseDir, TASK_ARTIFACT_FILE_NAMES.startAckMarkdown),
    finalReportJson: path.join(baseDir, TASK_ARTIFACT_FILE_NAMES.finalReportJson),
    finalReportMarkdown: path.join(baseDir, TASK_ARTIFACT_FILE_NAMES.finalReportMarkdown),
  };
}

export function resolveTaskArtifactPaths(
  params: ResolveTaskArtifactPathsParams,
): TaskArtifactPaths {
  const centralBaseDir = path.join(
    params.controlRoot,
    'projects',
    params.projectId,
    'tasks',
    params.taskId,
  );
  const localBaseDir = path.join(
    params.projectRoot,
    '.olympus',
    'tasks',
    params.taskId,
  );

  return {
    central: buildFileSet(centralBaseDir),
    local: buildFileSet(localBaseDir),
  };
}
