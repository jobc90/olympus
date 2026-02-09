import { randomUUID } from 'node:crypto';
import type {
  Analysis,
  ExecutionPlan,
  WorkerTask,
  WorkerResult,
  AgentTask,
  ReviewReport,
} from '@olympus-dev/protocol';
import type { AIProvider, AnalyzerContext, PlannerContext, AIProviderConfig } from './types.js';
import {
  ANALYZER_SYSTEM_PROMPT,
  PLANNER_SYSTEM_PROMPT,
  REVIEWER_SYSTEM_PROMPT,
} from '../prompts.js';

/**
 * OpenAI AI Provider — uses Chat Completions API with tool_use for structured output.
 *
 * Features:
 * - Retry with exponential backoff (max 2 retries)
 * - Rate limit (429) handling with Retry-After
 * - Configurable timeout per operation
 * - Graceful error reporting
 */
export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private config: AIProviderConfig;
  private client: import('openai').default | null = null;
  private maxRetries: number;

  constructor(config: AIProviderConfig) {
    this.config = config;
    this.maxRetries = config.maxRetries ?? 2;
  }

  /**
   * Lazy-initialize the OpenAI client on first use
   */
  private async getClient(): Promise<import('openai').default> {
    if (this.client) return this.client;

    const { default: OpenAI } = await import('openai');
    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      timeout: this.config.defaultTimeout,
      maxRetries: 0, // We handle retries ourselves
    });
    return this.client;
  }

  async analyze(command: string, context: AnalyzerContext): Promise<Analysis> {
    const client = await this.getClient();

    const userMessage = [
      `사용자 명령: ${command}`,
      context.projectPath ? `프로젝트 경로: ${context.projectPath}` : '',
    ].filter(Boolean).join('\n');

    const result = await this.callWithRetry<Analysis>(async () => {
      const response = await client.chat.completions.create({
        model: this.config.model,
        messages: [
          { role: 'system', content: ANALYZER_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'analyze_command',
            description: '사용자 명령을 분석하여 구조화된 결과를 반환합니다.',
            parameters: {
              type: 'object',
              properties: {
                intent: { type: 'string', enum: ['coding', 'documentation', 'testing', 'debugging', 'analysis', 'question'] },
                complexity: { type: 'string', enum: ['simple', 'moderate', 'complex'] },
                targetProject: { type: 'string' },
                targetFiles: { type: 'array', items: { type: 'string' } },
                requirements: { type: 'array', items: { type: 'string' } },
                useOrchestration: { type: 'boolean' },
                suggestedApproach: { type: 'string' },
                risks: { type: 'array', items: { type: 'string' } },
                estimatedDuration: { type: 'string' },
                needsConfirmation: { type: 'boolean' },
              },
              required: ['intent', 'complexity', 'targetProject', 'targetFiles', 'requirements', 'useOrchestration', 'suggestedApproach', 'risks', 'estimatedDuration', 'needsConfirmation'],
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'analyze_command' } },
      }, { timeout: 30_000 });

      return this.extractToolResult<Analysis>(response, 'analyze_command');
    });

    return result;
  }

  async plan(analysis: Analysis, context: PlannerContext): Promise<ExecutionPlan> {
    const client = await this.getClient();

    const userMessage = [
      `분석 결과: ${JSON.stringify(analysis, null, 2)}`,
      context.similarTasks?.length
        ? `유사 작업: ${JSON.stringify(context.similarTasks.slice(0, 3))}`
        : '',
    ].filter(Boolean).join('\n\n');

    const result = await this.callWithRetry<ExecutionPlan>(async () => {
      const response = await client.chat.completions.create({
        model: this.config.model,
        messages: [
          { role: 'system', content: PLANNER_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'create_plan',
            description: '실행 계획을 생성합니다.',
            parameters: {
              type: 'object',
              properties: {
                strategy: { type: 'string', enum: ['single', 'parallel', 'sequential', 'pipeline'] },
                workers: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      type: { type: 'string', enum: ['claude-cli', 'claude-api', 'tmux'] },
                      prompt: { type: 'string' },
                      projectPath: { type: 'string' },
                      dependencies: { type: 'array', items: { type: 'string' } },
                      timeout: { type: 'number' },
                      orchestration: { type: 'boolean' },
                      successCriteria: { type: 'array', items: { type: 'string' } },
                    },
                    required: ['id', 'type', 'prompt', 'projectPath', 'dependencies', 'timeout', 'orchestration', 'successCriteria'],
                  },
                },
                checkpoints: { type: 'array', items: { type: 'string' } },
                rollbackStrategy: { type: 'string' },
                totalEstimate: { type: 'string' },
              },
              required: ['strategy', 'workers', 'checkpoints', 'rollbackStrategy', 'totalEstimate'],
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'create_plan' } },
      }, { timeout: 60_000 });

      const plan = this.extractToolResult<ExecutionPlan>(response, 'create_plan');

      // Ensure worker IDs are unique
      for (const worker of plan.workers) {
        if (!worker.id) worker.id = randomUUID().slice(0, 8);
        if (!worker.timeout) worker.timeout = this.config.defaultTimeout;
      }

      return plan;
    });

    return result;
  }

  async review(results: WorkerResult[], task: AgentTask): Promise<ReviewReport> {
    const client = await this.getClient();

    const userMessage = [
      `작업 ID: ${task.id}`,
      `원본 명령: ${task.command}`,
      `워커 결과:`,
      ...results.map((r, i) => `  [워커 ${i + 1}] status=${r.status}, exitCode=${r.exitCode}, output=${r.output.slice(0, 1000)}`),
    ].join('\n');

    const result = await this.callWithRetry<ReviewReport>(async () => {
      const response = await client.chat.completions.create({
        model: this.config.model,
        messages: [
          { role: 'system', content: REVIEWER_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'review_result',
            description: '워커 실행 결과를 검토합니다.',
            parameters: {
              type: 'object',
              properties: {
                status: { type: 'string', enum: ['success', 'partial', 'failed'] },
                summary: { type: 'string' },
                details: { type: 'string' },
                changedFiles: { type: 'array', items: { type: 'string' } },
                testResults: { type: 'string' },
                buildStatus: { type: 'string', enum: ['pass', 'fail', 'unknown'] },
                warnings: { type: 'array', items: { type: 'string' } },
                nextSteps: { type: 'array', items: { type: 'string' } },
                shouldRetry: { type: 'boolean' },
                retryReason: { type: 'string' },
              },
              required: ['status', 'summary', 'details', 'changedFiles', 'testResults', 'buildStatus', 'warnings', 'nextSteps', 'shouldRetry'],
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'review_result' } },
      }, { timeout: 30_000 });

      const report = this.extractToolResult<ReviewReport>(response, 'review_result');
      report.taskId = task.id;
      return report;
    });

    return result;
  }

  // ──────────────────────────────────────────────
  // Internal helpers
  // ──────────────────────────────────────────────

  /**
   * Extract tool_use result from OpenAI response
   */
  private extractToolResult<T>(
    response: { choices: Array<{ message?: { tool_calls?: Array<{ function: { name: string; arguments: string } }> } }> },
    toolName: string,
  ): T {
    const message = response.choices[0]?.message;
    if (!message) {
      throw new Error('OpenAI returned empty response');
    }

    const toolCall = message.tool_calls?.find((tc: { function: { name: string } }) => tc.function.name === toolName);
    if (!toolCall) {
      throw new Error(`OpenAI did not call expected tool: ${toolName}`);
    }

    try {
      return JSON.parse(toolCall.function.arguments) as T;
    } catch {
      throw new Error(`Failed to parse tool result for ${toolName}: ${toolCall.function.arguments.slice(0, 200)}`);
    }
  }

  /**
   * Call with retry + exponential backoff
   */
  private async callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err as Error;
        const errAny = err as { status?: number; headers?: { get?: (k: string) => string | null } };

        // Don't retry on 4xx (except 429)
        if (errAny.status && errAny.status >= 400 && errAny.status < 500 && errAny.status !== 429) {
          throw err;
        }

        // Check for 429 Retry-After
        if (errAny.status === 429 && attempt < this.maxRetries) {
          const retryAfter = errAny.headers?.get?.('retry-after');
          const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : this.getBackoffDelay(attempt);
          await this.sleep(Math.min(delay, 10_000));
          continue;
        }

        // Retry on network errors and 5xx
        if (attempt < this.maxRetries) {
          const delay = this.getBackoffDelay(attempt);
          await this.sleep(delay);
        }
      }
    }

    throw lastError!;
  }

  /**
   * Exponential backoff with full jitter
   */
  private getBackoffDelay(attempt: number): number {
    const base = 300;
    const maxDelay = 5000;
    const exponential = Math.min(base * Math.pow(2, attempt), maxDelay);
    return Math.random() * exponential;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
