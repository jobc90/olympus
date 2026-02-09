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

/**
 * Mock AI Provider — pattern-based analysis for testing and development.
 *
 * Extracts the mock logic previously embedded in CommandAnalyzer,
 * ExecutionPlanner, and ResultReviewer into a single cohesive provider.
 */
export class MockProvider implements AIProvider {
  readonly name = 'mock';
  private config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
  }

  async analyze(command: string, context: AnalyzerContext): Promise<Analysis> {
    return this.mockAnalyze(command, context);
  }

  async plan(analysis: Analysis, _context: PlannerContext): Promise<ExecutionPlan> {
    return this.mockPlan(analysis);
  }

  async review(results: WorkerResult[], task: AgentTask): Promise<ReviewReport> {
    return this.mockReview(results, task);
  }

  // ──────────────────────────────────────────────
  // Analyzer Logic (from analyzer.ts)
  // ──────────────────────────────────────────────

  private mockAnalyze(command: string, context: AnalyzerContext): Analysis {
    const lower = command.toLowerCase();

    // Determine intent (avoid \b for Korean — use non-capturing groups)
    let intent: Analysis['intent'] = 'coding';
    if (/(what|how|why|show|list|status|state|현재|상태|알려|어때)/i.test(lower)) {
      intent = 'question';
    } else if (/(test|테스트|커버리지|coverage)/i.test(lower)) {
      intent = 'testing';
    } else if (/(doc|문서|readme|docs)/i.test(lower)) {
      intent = 'documentation';
    } else if (/(bug|fix|debug|에러|오류|수정)/i.test(lower)) {
      intent = 'debugging';
    } else if (/(analyze|분석|리뷰|review)/i.test(lower)) {
      intent = 'analysis';
    }

    // Determine complexity
    let complexity: Analysis['complexity'] = 'moderate';
    if (intent === 'question') {
      complexity = 'simple';
    } else if (/(리팩토링|refactor|마이그레이션|migration|architecture|아키텍처)/i.test(lower)) {
      complexity = 'complex';
    } else if (/(추가|add|간단|simple|one|하나)/i.test(lower)) {
      complexity = 'simple';
    }

    // Extract project
    const targetProject = context.projectPath || this.extractProjectFromCommand(command);

    return {
      intent,
      complexity,
      targetProject,
      targetFiles: [],
      requirements: [command],
      useOrchestration: complexity === 'complex',
      suggestedApproach: `${intent} 작업: ${command}`,
      risks: [],
      estimatedDuration: complexity === 'simple' ? '1-2분' : complexity === 'moderate' ? '5-10분' : '15-30분',
      needsConfirmation: /(delete|삭제|drop|push|force|reset)/i.test(lower),
    };
  }

  private extractProjectFromCommand(command: string): string {
    const projectPatterns = [
      /\b(gateway|게이트웨이)\b/i,
      /\b(telegram|텔레그램)\b/i,
      /\b(dashboard|대시보드)\b/i,
      /\b(protocol|프로토콜)\b/i,
      /\b(cli)\b/i,
      /\b(web)\b/i,
    ];

    for (const pattern of projectPatterns) {
      const match = command.match(pattern);
      if (match) return match[1].toLowerCase();
    }

    return '';
  }

  // ──────────────────────────────────────────────
  // Planner Logic (from planner.ts)
  // ──────────────────────────────────────────────

  private mockPlan(analysis: Analysis): ExecutionPlan {
    const workers: WorkerTask[] = [];
    const useOrch = this.shouldUseOrchestration(analysis);

    // Create primary worker
    const primaryId = randomUUID().slice(0, 8);
    workers.push({
      id: primaryId,
      type: 'claude-cli',
      prompt: this.buildWorkerPrompt(analysis, useOrch),
      projectPath: analysis.targetProject || process.cwd(),
      dependencies: [],
      timeout: this.config.defaultTimeout,
      orchestration: useOrch,
      successCriteria: this.buildSuccessCriteria(analysis),
    });

    const strategy = this.determineStrategy(analysis);

    return {
      strategy,
      workers,
      checkpoints: strategy === 'sequential' ? ['각 워커 완료 후 빌드 확인'] : [],
      rollbackStrategy: 'git stash로 복원',
      totalEstimate: analysis.estimatedDuration,
    };
  }

  private determineStrategy(analysis: Analysis): ExecutionPlan['strategy'] {
    if (analysis.complexity === 'simple') return 'single';
    if (analysis.requirements.length > 1) return 'parallel';
    if (analysis.complexity === 'complex') return 'single';
    return 'single';
  }

  private shouldUseOrchestration(analysis: Analysis): boolean {
    switch (this.config.orchestrationMode) {
      case 'always': return true;
      case 'never': return false;
      case 'auto': return analysis.useOrchestration;
      default: return analysis.useOrchestration;
    }
  }

  private buildWorkerPrompt(analysis: Analysis, useOrch: boolean): string {
    const base = analysis.requirements.join('\n');
    if (useOrch) {
      return `/orchestration "${base}"`;
    }
    return `${base}\n\n작업 완료 후 빌드와 테스트를 실행하고 결과를 보고해주세요.`;
  }

  private buildSuccessCriteria(analysis: Analysis): string[] {
    const criteria: string[] = [];
    switch (analysis.intent) {
      case 'coding':
        criteria.push('빌드 성공', '테스트 통과');
        break;
      case 'testing':
        criteria.push('테스트 추가', '모든 테스트 통과');
        break;
      case 'documentation':
        criteria.push('문서 생성/수정');
        break;
      case 'debugging':
        criteria.push('빌드 성공', '에러 해결');
        break;
      default:
        criteria.push('작업 완료');
    }
    return criteria;
  }

  // ──────────────────────────────────────────────
  // Reviewer Logic (from reviewer.ts)
  // ──────────────────────────────────────────────

  private mockReview(results: WorkerResult[], task: AgentTask): ReviewReport {
    const allCompleted = results.every(r => r.status === 'completed');
    const anyFailed = results.some(r => r.status === 'failed');
    const allFailed = results.every(r => r.status === 'failed');

    // Extract info from output
    const combinedOutput = results.map(r => r.output).join('\n');
    const buildPass = /빌드 성공|build\s*success|Build complete/i.test(combinedOutput);
    const buildFail = /빌드 실패|build\s*fail|error\s*TS/i.test(combinedOutput);
    const testPass = /\d+\s*(passed|통과).*0\s*(fail|실패)/i.test(combinedOutput);
    // D1 FIX: "0 failed" should NOT be a failure — require 1+ failures
    const testFail = /[1-9]\d*\s*(fail|실패)/i.test(combinedOutput);

    // Determine status
    let status: ReviewReport['status'] = 'success';
    if (allFailed) status = 'failed';
    else if (anyFailed || buildFail || testFail) status = 'partial';

    // Should retry?
    const typeErrors = (combinedOutput.match(/error\s*TS\d+/gi) || []).length;
    const shouldRetry = status === 'failed' && typeErrors > 0 && typeErrors <= 5;

    // Extract changed files
    const changedFiles = this.extractChangedFiles(combinedOutput);

    return {
      taskId: task.id,
      status,
      summary: this.buildSummary(status, results, changedFiles),
      details: combinedOutput.slice(0, 2000),
      changedFiles,
      testResults: this.extractTestResults(combinedOutput),
      buildStatus: buildPass ? 'pass' : buildFail ? 'fail' : 'unknown',
      warnings: this.extractWarnings(combinedOutput),
      nextSteps: this.suggestNextSteps(status, task),
      shouldRetry,
      retryReason: shouldRetry ? `타입 에러 ${typeErrors}건 자동 수정 시도` : undefined,
    };
  }

  private buildSummary(status: string, results: WorkerResult[], files: string[]): string {
    const workerCount = results.length;
    const completed = results.filter(r => r.status === 'completed').length;

    if (status === 'success') {
      return `작업 완료. 워커 ${completed}/${workerCount} 성공, 변경 파일 ${files.length}개.`;
    }
    if (status === 'partial') {
      return `부분 완료. 워커 ${completed}/${workerCount} 성공. 경고 사항 확인 필요.`;
    }
    return `작업 실패. 워커 0/${workerCount} 성공.`;
  }

  private extractChangedFiles(output: string): string[] {
    const files: string[] = [];
    const patterns = [
      /(?:modified|created|wrote|changed):\s*(.+\.(?:ts|tsx|js|json|md))/gi,
      /(?:✓|✅)\s+(.+\.(?:ts|tsx|js|json|md))/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        const file = match[1].trim();
        if (!files.includes(file)) files.push(file);
      }
    }
    return files;
  }

  private extractTestResults(output: string): string {
    const testLine = output.match(/Tests?\s*.*\d+\s*(passed|failed|통과|실패).*/i);
    return testLine ? testLine[0] : '';
  }

  private extractWarnings(output: string): string[] {
    const warnings: string[] = [];
    const lines = output.split('\n');
    for (const line of lines) {
      if (/warning|⚠️|warn/i.test(line) && line.trim().length > 10) {
        warnings.push(line.trim().slice(0, 200));
        if (warnings.length >= 5) break;
      }
    }
    return warnings;
  }

  private suggestNextSteps(status: string, task: AgentTask): string[] {
    const steps: string[] = [];
    if (status !== 'success') {
      steps.push('에러 로그 확인 필요');
    }
    if (task.analysis?.intent === 'coding') {
      steps.push('API 문서 업데이트 권장');
    }
    return steps;
  }
}
