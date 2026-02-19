/**
 * Gemini Advisor — Codex 컨텍스트 보조 AI 타입 정의
 */

/** 프로젝트별 Gemini 분석 결과 */
export interface GeminiProjectAnalysis {
  projectPath: string;
  projectName: string;
  structureSummary: string;
  techStack: string[];
  keyPatterns: string[];
  activeContext: string;
  recommendations: string[];
  /** Synthesized work history from ALL worker task records (up to 50) */
  workHistory: string;
  analyzedAt: number;
}

/** 루트 통합 분석 */
export interface GeminiRootAnalysis {
  projects: GeminiProjectAnalysis[];
  crossProjectNotes: string[];
  overallSummary: string;
  analyzedAt: number;
}

/** Gemini Advisor 상태 */
export interface GeminiAdvisorStatus {
  running: boolean;
  ptyAlive: boolean;
  projectCount: number;
  lastAnalyzedAt: number | null;
  cacheSize: number;
  behavior: GeminiBehavior;
  currentTask: string | null;
}

/** Post-task review result from Gemini */
export interface GeminiReview {
  quality: 'good' | 'warning' | 'critical';
  summary: string;
  concerns: string[];
  reviewedAt: number;
}

/** Pre-task review recommendation from Gemini */
export interface GeminiPreReview {
  recommendation: string;
  suggestedApproach: string;
  risks: string[];
  reviewedAt: number;
}

/** Proactive alert from Gemini analysis */
export interface GeminiAlert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  projectPath: string;
  timestamp: number;
}

/** Gemini 행동 (대시보드용) */
export type GeminiBehavior =
  | 'idle'
  | 'scanning'
  | 'analyzing'
  | 'advising'
  | 'refreshing'
  | 'offline'
  | 'reviewing'
  | 'alerting';

/** Gemini Advisor 설정 */
export interface GeminiAdvisorConfig {
  enabled: boolean;
  model: string;
  refreshIntervalMs: number;
  analysisTimeoutMs: number;
  maxCacheAge: number;
  maxProjectAnalysisLength: number;
  postTaskReviewEnabled: boolean;
  preTaskReviewEnabled: boolean;
  proactiveAlertEnabled: boolean;
  reviewTimeoutMs: number;
}

export const DEFAULT_GEMINI_ADVISOR_CONFIG: GeminiAdvisorConfig = {
  enabled: true,
  model: 'gemini-3-flash-preview',
  refreshIntervalMs: 300_000,
  analysisTimeoutMs: 60_000,
  maxCacheAge: 600_000,
  maxProjectAnalysisLength: 4000,
  postTaskReviewEnabled: true,
  preTaskReviewEnabled: true,
  proactiveAlertEnabled: true,
  reviewTimeoutMs: 30_000,
};
