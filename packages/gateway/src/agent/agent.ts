import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type {
  AgentState,
  AgentTask,
  Analysis,
  ExecutionPlan,
  WorkerResult,
  ReviewReport,
  AgentConfig,
  AgentProgressPayload,
  ApprovalRequest,
  SecurityConfig,
} from '@olympus-dev/protocol';
import { AGENT_STATE_TRANSITIONS, DEFAULT_AGENT_CONFIG, DEFAULT_SECURITY_CONFIG } from '@olympus-dev/protocol';
import type { UserCommand } from './types.js';
import type { CommandAnalyzer } from './analyzer.js';
import type { ExecutionPlanner } from './planner.js';
import type { ResultReviewer } from './reviewer.js';
import type { AgentReporter } from './reporter.js';
import type { WorkerManager } from '../workers/manager.js';
import { CommandQueue } from './command-queue.js';
import { SecurityGuard } from './security-guard.js';

export interface CodexAgentOptions {
  config: AgentConfig;
  analyzer: CommandAnalyzer;
  planner: ExecutionPlanner;
  reviewer: ResultReviewer;
  reporter: AgentReporter;
  workerManager: WorkerManager;
  securityConfig?: SecurityConfig;
  maxQueueSize?: number;
  memoryStore?: import('../memory/store.js').MemoryStore;
}

/**
 * Codex Agent — The autonomous AI engine that lives inside Gateway.
 *
 * State machine: IDLE → ANALYZING → PLANNING → EXECUTING → REVIEWING → REPORTING → IDLE
 *
 * Emits events:
 *   'progress' — AgentProgressPayload (state transitions, progress updates)
 *   'result'   — { taskId, report: ReviewReport }
 *   'error'    — { taskId, error: string }
 *   'queued'   — { taskId, position: number } (when command is queued)
 */
export class CodexAgent extends EventEmitter {
  private _state: AgentState = 'IDLE';
  private _currentTask: AgentTask | null = null;
  private config: AgentConfig;
  private analyzer: CommandAnalyzer;
  private planner: ExecutionPlanner;
  private reviewer: ResultReviewer;
  private reporter: AgentReporter;
  private workerManager: WorkerManager;
  private _pendingApproval: ApprovalRequest | null = null;
  private _approvalResolve: ((approved: boolean) => void) | null = null;
  private commandQueue: CommandQueue;
  private securityGuard: SecurityGuard;
  private memoryStore?: import('../memory/store.js').MemoryStore;

  constructor(options: CodexAgentOptions) {
    super();
    this.config = options.config;
    this.analyzer = options.analyzer;
    this.planner = options.planner;
    this.reviewer = options.reviewer;
    this.reporter = options.reporter;
    this.workerManager = options.workerManager;
    this.commandQueue = new CommandQueue(options.maxQueueSize ?? 50);
    this.securityGuard = new SecurityGuard(options.securityConfig ?? DEFAULT_SECURITY_CONFIG);
    this.memoryStore = options.memoryStore;
  }

  get state(): AgentState {
    return this._state;
  }

  get currentTask(): AgentTask | null {
    return this._currentTask;
  }

  get pendingApproval(): ApprovalRequest | null {
    return this._pendingApproval;
  }

  get queueSize(): number {
    return this.commandQueue.size;
  }

  /**
   * Approve a pending plan. Returns true if there was a pending approval.
   */
  approve(taskId: string): boolean {
    if (!this._pendingApproval || this._pendingApproval.taskId !== taskId) return false;
    this._approvalResolve?.(true);
    return true;
  }

  /**
   * Reject a pending plan. Returns true if there was a pending approval.
   */
  reject(taskId: string): boolean {
    if (!this._pendingApproval || this._pendingApproval.taskId !== taskId) return false;
    this._approvalResolve?.(false);
    return true;
  }

  /**
   * Validate and perform state transition
   */
  private transitionTo(newState: AgentState): void {
    const allowed = AGENT_STATE_TRANSITIONS[this._state];
    if (!allowed.includes(newState)) {
      throw new Error(`Invalid state transition: ${this._state} → ${newState}`);
    }
    this._state = newState;
  }

  /**
   * Emit progress event to all listeners
   */
  private emitProgress(message: string, progress?: number): void {
    const payload: AgentProgressPayload = {
      taskId: this._currentTask?.id ?? '',
      state: this._state,
      message,
      progress,
      workerCount: this._currentTask?.workers.length,
      completedWorkers: this._currentTask?.results.length,
    };
    this.emit('progress', payload);
  }

  /**
   * Handle a user command — the main entry point.
   * Returns the task ID immediately, actual work is async.
   *
   * If agent is busy, the command is queued (up to maxQueueSize).
   */
  async handleCommand(cmd: UserCommand): Promise<string> {
    // Security check first
    const secCheck = this.securityGuard.validateCommand(cmd.command);
    if (!secCheck.allowed) {
      const err = new Error(secCheck.reason ?? 'Command blocked by security policy') as Error & { code: string };
      err.code = 'COMMAND_BLOCKED';
      throw err;
    }

    // Override needsConfirmation if security guard says so
    const forcedApproval = this.securityGuard.requiresApproval(cmd.command);

    const taskId = randomUUID().slice(0, 12);

    // If busy, queue the command
    if (this._state !== 'IDLE') {
      const queued = this.commandQueue.enqueue(cmd, taskId);
      this.emit('queued', { taskId, position: this.commandQueue.size });
      return queued.taskId;
    }

    this._currentTask = {
      id: taskId,
      command: cmd.command,
      state: 'IDLE',
      analysis: null,
      plan: null,
      workers: [],
      results: [],
      report: null,
      startedAt: Date.now(),
    };

    // Run the full pipeline asynchronously
    this.runPipeline(cmd, forcedApproval).catch((err) => {
      this.emit('error', { taskId, error: (err as Error).message });
      this.resetToIdle();
    });

    return taskId;
  }

  /**
   * Cancel current task
   */
  cancel(): boolean {
    if (this._state === 'IDLE') return false;

    // Terminate all active workers
    if (this._currentTask) {
      for (const worker of this._currentTask.workers) {
        this.workerManager.terminate(worker.id);
      }
    }

    this.transitionTo('INTERRUPT');
    this.emitProgress('작업 취소됨');
    this.resetToIdle();
    return true;
  }

  /**
   * The full agent pipeline: analyze → plan → execute → review → report
   */
  private async runPipeline(cmd: UserCommand, forcedApproval = false): Promise<void> {
    const task = this._currentTask!;

    // 1. ANALYZING
    this.transitionTo('ANALYZING');
    task.state = 'ANALYZING';
    this.emitProgress('명령 분석 중...', 10);

    const analysis = await this.analyzer.analyze(cmd.command, {
      projectPath: cmd.projectPath,
    });
    task.analysis = analysis;

    // Simple questions can be answered directly
    if (analysis.intent === 'question' && analysis.complexity === 'simple') {
      this.transitionTo('REPORTING');
      task.state = 'REPORTING';
      task.report = {
        taskId: task.id,
        status: 'success',
        summary: analysis.suggestedApproach,
        details: '',
        changedFiles: [],
        testResults: '',
        buildStatus: 'unknown',
        warnings: [],
        nextSteps: [],
        shouldRetry: false,
      };
      this.emitProgress('응답 생성 중...', 90);
      await this.reporter.report(task.report);
      this.emit('result', { taskId: task.id, report: task.report });
      this.resetToIdle();
      return;
    }

    // 2. PLANNING
    this.transitionTo('PLANNING');
    task.state = 'PLANNING';
    this.emitProgress('실행 계획 수립 중...', 20);

    // Build planner context with memory (similar tasks + learned patterns)
    const plannerContext = await this.buildPlannerContext(cmd.command);
    const plan = await this.planner.plan(analysis, plannerContext);
    task.plan = plan;
    task.workers = plan.workers;

    // Needs confirmation? (from analysis or forced by security guard)
    const needsConfirmation = analysis.needsConfirmation || forcedApproval;
    if (needsConfirmation && !cmd.autoApprove && !this.config.autoApprove) {
      this._pendingApproval = {
        taskId: task.id,
        command: task.command,
        analysis,
        plan,
        timestamp: Date.now(),
      };
      this.emit('approval', { taskId: task.id, request: this._pendingApproval });
      this.emitProgress('사용자 승인 대기 중...', 25);

      const approved = await new Promise<boolean>((resolve) => {
        this._approvalResolve = resolve;
        // A5 FIX: Timeout rejects instead of auto-approving
        setTimeout(() => {
          if (this._approvalResolve === resolve) {
            this._pendingApproval = null;
            this._approvalResolve = null;
            resolve(false); // was: resolve(true) — A5 security fix
          }
        }, 300_000);
      });

      this._pendingApproval = null;
      this._approvalResolve = null;

      if (!approved) {
        this.emitProgress('사용자가 작업을 거부했습니다.');
        task.error = 'User rejected the plan';
        this.emit('error', { taskId: task.id, error: task.error });
        this.resetToIdle();
        return;
      }
    }

    // 3. EXECUTING
    this.transitionTo('EXECUTING');
    task.state = 'EXECUTING';
    this.emitProgress(`워커 ${plan.workers.length}개 실행 중...`, 30);

    const results = await this.executeWorkers(plan);
    task.results = results;

    // 4. REVIEWING
    this.transitionTo('REVIEWING');
    task.state = 'REVIEWING';
    this.emitProgress('결과 검토 중...', 80);

    const report = await this.reviewer.review(results, task);
    task.report = report;

    // Auto-retry if needed (once)
    if (report.shouldRetry) {
      this.emitProgress('재시도 중...', 85);
      this.transitionTo('EXECUTING');
      task.state = 'EXECUTING';

      const retryResults = await this.executeWorkers(plan);
      task.results = [...results, ...retryResults];

      this.transitionTo('REVIEWING');
      task.state = 'REVIEWING';
      const retryReport = await this.reviewer.review(retryResults, task);
      task.report = retryReport;
    }

    // 5. REPORTING
    this.transitionTo('REPORTING');
    task.state = 'REPORTING';
    this.emitProgress('보고서 생성 중...', 95);

    await this.reporter.report(task.report);
    this.emit('result', { taskId: task.id, report: task.report });

    task.completedAt = Date.now();
    this.resetToIdle();
  }

  /**
   * Execute workers according to plan strategy
   */
  private async executeWorkers(plan: ExecutionPlan): Promise<WorkerResult[]> {
    const results: WorkerResult[] = [];

    switch (plan.strategy) {
      case 'single':
      case 'sequential': {
        for (const workerTask of plan.workers) {
          // Wait for dependencies
          for (const depId of workerTask.dependencies) {
            const dep = results.find(r => r.workerId === depId);
            if (dep?.status === 'failed') {
              results.push({
                workerId: workerTask.id,
                status: 'failed',
                exitCode: null,
                output: `Dependency ${depId} failed, skipping`,
                duration: 0,
                error: 'Dependency failed',
              });
              continue;
            }
          }

          const result = await this.workerManager.execute(workerTask);
          results.push(result);

          this.emitProgress(
            `워커 ${results.length}/${plan.workers.length} 완료`,
            30 + (50 * results.length / plan.workers.length),
          );
        }
        break;
      }

      case 'parallel': {
        const promises = plan.workers.map(wt => this.workerManager.execute(wt));
        const parallelResults = await Promise.allSettled(promises);

        for (let i = 0; i < parallelResults.length; i++) {
          const pr = parallelResults[i];
          if (pr.status === 'fulfilled') {
            results.push(pr.value);
          } else {
            results.push({
              workerId: plan.workers[i].id,
              status: 'failed',
              exitCode: null,
              output: '',
              duration: 0,
              error: pr.reason?.message || 'Unknown error',
            });
          }
        }
        break;
      }

      case 'pipeline': {
        // Pipeline = sequential with output chaining
        // Each worker receives the previous worker's output as context
        let previousOutput = '';
        for (const workerTask of plan.workers) {
          if (previousOutput) {
            workerTask.prompt = `${workerTask.prompt}\n\n--- Previous step output ---\n${previousOutput}`;
          }
          const result = await this.workerManager.execute(workerTask);
          results.push(result);

          // Chain output to next worker (only on success)
          if (result.status === 'completed' && result.output) {
            previousOutput = result.output;
          } else if (result.status === 'failed') {
            // Stop pipeline on failure
            break;
          }

          this.emitProgress(
            `파이프라인 ${results.length}/${plan.workers.length} 완료`,
            30 + (50 * results.length / plan.workers.length),
          );
        }
        break;
      }
    }

    return results;
  }

  private resetToIdle(): void {
    const prevState = this._state;
    if (prevState !== 'IDLE') {
      try {
        this.transitionTo('IDLE');
      } catch {
        // Log forced reset for debugging (A2 fix: visibility into forced resets)
        this.emit('error', {
          taskId: this._currentTask?.id ?? '',
          error: `Forced reset from ${prevState} → IDLE (invalid transition)`,
        });
        this._state = 'IDLE';
      }
    }
    this._currentTask = null;

    // Process next queued command
    this.drainQueue();
  }

  /**
   * Process the next command from the queue (if any)
   */
  private drainQueue(): void {
    const next = this.commandQueue.dequeue();
    if (!next) return;

    // Re-submit the queued command
    this.handleCommand(next.command).catch((err) => {
      this.emit('error', { taskId: next.taskId, error: (err as Error).message });
    });
  }

  /**
   * Build PlannerContext from MemoryStore (similar tasks + learned patterns).
   */
  private async buildPlannerContext(command: string): Promise<import('./providers/types.js').PlannerContext> {
    if (!this.memoryStore) return {};

    try {
      const similarTasks = this.memoryStore.searchTasks(command, 3).map(t => ({
        command: t.command,
        plan: t.plan || '',
      }));

      const patterns = this.memoryStore.findPatterns(command, 0.3).map(p => ({
        trigger: p.trigger,
        action: p.action,
      }));

      return {
        similarTasks: similarTasks.length > 0 ? similarTasks : undefined,
        learnedPatterns: patterns.length > 0 ? patterns : undefined,
      };
    } catch {
      return {};
    }
  }
}
