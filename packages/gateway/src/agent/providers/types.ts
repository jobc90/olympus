import type {
  Analysis,
  ExecutionPlan,
  WorkerResult,
  AgentTask,
  ReviewReport,
  AgentConfig,
} from '@olympus-dev/protocol';

/**
 * Context passed to the analyzer
 */
export interface AnalyzerContext {
  projectPath?: string;
  recentHistory?: string[];
}

/**
 * Context passed to the planner
 */
export interface PlannerContext {
  similarTasks?: Array<{ command: string; plan: string }>;
  learnedPatterns?: Array<{ trigger: string; action: string }>;
}

/**
 * AI Provider — abstraction over different AI backends.
 *
 * Each provider implements the three core operations:
 * - analyze: Parse user command into structured Analysis
 * - plan: Create execution plan from analysis
 * - review: Evaluate worker results and generate report
 *
 * Implementations: MockProvider (pattern-based), OpenAIProvider (API-based)
 */
export interface AIProvider {
  readonly name: string;

  /**
   * Analyze a user command into a structured Analysis object.
   */
  analyze(command: string, context: AnalyzerContext): Promise<Analysis>;

  /**
   * Create an execution plan from an analysis result.
   */
  plan(analysis: Analysis, context: PlannerContext): Promise<ExecutionPlan>;

  /**
   * Review worker results and generate a report.
   */
  review(results: WorkerResult[], task: AgentTask): Promise<ReviewReport>;
}

/**
 * Configuration for AI provider initialization
 */
export interface AIProviderConfig {
  provider: AgentConfig['provider'];
  model: string;
  apiKey: string;
  defaultTimeout: number;
  maxRetries?: number;
  orchestrationMode: AgentConfig['orchestrationMode'];
}
