/**
 * Local Context Store Types
 *
 * 워커별 추출 컨텍스트, 프로젝트 통합 스냅샷, 루트 프로젝트 엔트리 등
 * LocalContextStore 시스템의 공유 타입 정의.
 */

/** 워커별 추출 컨텍스트 */
export interface ExtractedContext {
  success: boolean;
  summary: string;
  filesChanged: string[];
  decisions: string[];
  errors: string[];
  dependencies: string[];
}

/** 워커 컨텍스트 레코드 (DB 행) */
export interface WorkerContextRecord {
  id: string;
  workerId: string;
  workerName: string;
  taskId?: string;
  prompt: string;
  success: boolean;
  summary: string;
  filesChanged: string[];
  decisions: string[];
  errors: string[];
  dependencies: string[];
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  durationMs?: number;
  numTurns?: number;
  rawText?: string;
  createdAt: string;
}

/** 프로젝트 통합 스냅샷 */
export interface ProjectContextSnapshot {
  id: string;
  projectPath: string;
  summary: string;
  activeFiles: string[];
  recentDecisions: string[];
  knownIssues: string[];
  techContext: Record<string, unknown>;
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  lastWorkerName: string;
  contextSizeBytes: number;
  version: number;
  updatedAt: string;
}

/** 루트 프로젝트 엔트리 */
export interface RootProjectEntry {
  id: string;
  projectPath: string;
  projectName: string;
  summary: string;
  activeFiles: string[];
  recentDecisions: string[];
  knownIssues: string[];
  totalTasks: number;
  successfulTasks: number;
  lastActivityAt: string;
  lastWorkerName: string;
  status: 'active' | 'inactive';
  version: number;
  updatedAt: string;
}

/** 설정 */
export interface LocalContextStoreConfig {
  maxWorkerContexts: number;
  maxRawTextLength: number;
  maxContextSizeBytes: number;
  maxActiveFiles: number;
  maxRecentDecisions: number;
}

export const DEFAULT_LOCAL_CONTEXT_CONFIG: LocalContextStoreConfig = {
  maxWorkerContexts: 50,
  maxRawTextLength: 8000,
  maxContextSizeBytes: 32768,
  maxActiveFiles: 100,
  maxRecentDecisions: 30,
};

/** 컨텍스트 주입용 */
export interface ContextInjection {
  projectSummary: string;
  recentActivity: string;
  activeFiles: string[];
  knownIssues: string[];
  recentDecisions: string[];
}
