/**
 * GeminiAdvisor — Gemini CLI-based project analysis + Codex context assistant AI
 *
 * In-memory cache + periodic refresh + event-driven incremental updates
 */
import { EventEmitter } from 'node:events';
import type { LocalContextStoreManager } from '@olympus-dev/core';
import type {
  GeminiProjectAnalysis,
  GeminiRootAnalysis,
  GeminiAdvisorStatus,
  GeminiAdvisorConfig,
  GeminiBehavior,
} from '@olympus-dev/protocol';
import { DEFAULT_GEMINI_ADVISOR_CONFIG } from '@olympus-dev/protocol';
import { GeminiPty } from './gemini-pty.js';

/** Debounce timer map */
const DEBOUNCE_MS = 10_000;

export class GeminiAdvisor extends EventEmitter {
  private config: GeminiAdvisorConfig;
  private localContextManager: LocalContextStoreManager | null = null;
  private pty: GeminiPty | null = null;
  private projects: Array<{ name: string; path: string }> = [];

  // In-memory cache
  private projectCache = new Map<string, GeminiProjectAnalysis>();
  private rootCache: GeminiRootAnalysis | null = null;
  private behavior: GeminiBehavior = 'offline';
  private currentTask: string | null = null;

  // Timers
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private running = false;

  constructor(config?: Partial<GeminiAdvisorConfig>) {
    super();
    this.config = { ...DEFAULT_GEMINI_ADVISOR_CONFIG, ...config };
  }

  // ── Lifecycle ──

  async initialize(
    projects: Array<{ name: string; path: string }>,
    localContextManager?: LocalContextStoreManager,
  ): Promise<void> {
    this.projects = projects;
    if (localContextManager) {
      this.localContextManager = localContextManager;
    }

    // Start PTY
    this.pty = new GeminiPty(this.config.model);
    try {
      await this.pty.start();
    } catch (err) {
      console.warn(`[GeminiAdvisor] PTY start failed: ${(err as Error).message}`);
      this.setBehavior('offline');
      return;
    }

    this.running = true;
    this.setBehavior('idle');

    // Start async background analysis
    this.analyzeAllProjects().catch((err) => {
      console.warn(`[GeminiAdvisor] Initial analysis failed: ${(err as Error).message}`);
    });

    // Periodic refresh
    this.startPeriodicRefresh();
  }

  setLocalContextManager(manager: LocalContextStoreManager): void {
    this.localContextManager = manager;
  }

  async shutdown(): Promise<void> {
    this.running = false;

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    if (this.pty) {
      await this.pty.stop();
      this.pty = null;
    }

    this.setBehavior('offline');
  }

  // ── Analysis ──

  async analyzeProject(projectPath: string, projectName: string): Promise<GeminiProjectAnalysis> {
    if (!this.pty?.isAlive()) {
      throw new Error('GeminiPty not available');
    }

    this.setBehavior('analyzing', projectName);

    // Collect ALL worker contexts (up to 50) for comprehensive work history
    let localContextStr = '';
    let workerHistoryStr = '';
    if (this.localContextManager) {
      try {
        const store = await this.localContextManager.getProjectStore(projectPath);
        const injection = store.buildContextInjection({ maxTokens: 1500 });
        if (injection.projectSummary) {
          localContextStr += `${injection.projectSummary}\n`;
        }

        // Read ALL worker contexts for work history synthesis
        const allWorkers = store.getRecentWorkerContexts(50);
        if (allWorkers.length > 0) {
          const entries = allWorkers.map((w, i) => {
            const status = w.success ? 'OK' : 'FAIL';
            const files = w.filesChanged.length > 0 ? ` [${w.filesChanged.slice(0, 3).join(', ')}${w.filesChanged.length > 3 ? '...' : ''}]` : '';
            return `${allWorkers.length - i}. [${w.workerName}] ${status}: ${w.summary.slice(0, 150)}${files}`;
          });
          workerHistoryStr = entries.join('\n');
        }
      } catch { /* context not available */ }
    }

    const prompt = this.buildAnalysisPrompt(projectPath, projectName, localContextStr, workerHistoryStr);

    try {
      const response = await this.pty.sendPrompt(prompt, this.config.analysisTimeoutMs);
      const parsed = this.parseAnalysisResponse(response);

      const analysis: GeminiProjectAnalysis = {
        projectPath,
        projectName,
        structureSummary: parsed.structureSummary ?? `${projectName} project`,
        techStack: parsed.techStack ?? [],
        keyPatterns: parsed.keyPatterns ?? [],
        activeContext: parsed.activeContext ?? '',
        recommendations: parsed.recommendations ?? [],
        workHistory: parsed.workHistory ?? '',
        analyzedAt: Date.now(),
      };

      this.projectCache.set(projectPath, analysis);
      this.emit('analysis:complete', analysis);
      return analysis;
    } catch (err) {
      console.warn(`[GeminiAdvisor] Analysis failed for ${projectName}: ${(err as Error).message}`);

      // Cache fallback on failure — preserve previous workHistory if available
      const previous = this.projectCache.get(projectPath);
      const fallback: GeminiProjectAnalysis = {
        projectPath,
        projectName,
        structureSummary: `${projectName} project (analysis failed)`,
        techStack: [],
        keyPatterns: [],
        activeContext: '',
        recommendations: [],
        workHistory: previous?.workHistory ?? '',
        analyzedAt: Date.now(),
      };
      this.projectCache.set(projectPath, fallback);
      return fallback;
    } finally {
      if (this.running) {
        this.setBehavior('idle');
      }
    }
  }

  async analyzeAllProjects(): Promise<void> {
    this.setBehavior('scanning');

    for (const project of this.projects) {
      if (!this.running) break;
      try {
        await this.analyzeProject(project.path, project.name);
      } catch { /* individual failure handled in analyzeProject */ }
    }

    if (this.running) {
      this.setBehavior('idle');
    }
  }

  // ── Cache queries ──

  getCachedAnalysis(projectPath: string): GeminiProjectAnalysis | null {
    return this.projectCache.get(projectPath) ?? null;
  }

  getCachedRootAnalysis(): GeminiRootAnalysis | null {
    return this.rootCache;
  }

  getAllCachedAnalyses(): GeminiProjectAnalysis[] {
    return Array.from(this.projectCache.values());
  }

  // ── Build context for Codex system prompt ──

  buildCodexContext(options?: { maxLength?: number }): string {
    const maxLength = options?.maxLength ?? 4000;
    const analyses = this.getAllCachedAnalyses();
    if (analyses.length === 0) return '';

    const lines: string[] = ['\n\n## Project Analysis (Gemini Advisor)\n'];

    for (const a of analyses) {
      const section: string[] = [`### ${a.projectName} (${a.projectPath})`];
      if (a.structureSummary) section.push(`- Structure: ${a.structureSummary}`);
      if (a.techStack.length > 0) section.push(`- Tech: ${a.techStack.join(', ')}`);
      if (a.keyPatterns.length > 0) section.push(`- Patterns: ${a.keyPatterns.join(', ')}`);
      if (a.activeContext) section.push(`- Status: ${a.activeContext}`);
      if (a.recommendations.length > 0) section.push(`- Recommendations: ${a.recommendations.slice(0, 2).join('; ')}`);
      if (a.workHistory) section.push(`\n#### Work History\n${a.workHistory}`);
      section.push('');

      const sectionStr = section.join('\n');
      if (lines.join('\n').length + sectionStr.length > maxLength) break;
      lines.push(sectionStr);
    }

    return lines.join('\n');
  }

  buildProjectContext(projectPath: string, options?: { maxLength?: number }): string {
    const maxLength = options?.maxLength ?? 3000;
    const analysis = this.projectCache.get(projectPath);
    if (!analysis) return '';

    const lines: string[] = [];
    if (analysis.structureSummary) lines.push(`Structure: ${analysis.structureSummary}`);
    if (analysis.techStack.length > 0) lines.push(`Tech Stack: ${analysis.techStack.join(', ')}`);
    if (analysis.keyPatterns.length > 0) lines.push(`Patterns: ${analysis.keyPatterns.join(', ')}`);
    if (analysis.activeContext) lines.push(`Current Status: ${analysis.activeContext}`);
    if (analysis.recommendations.length > 0) lines.push(`Recommendations: ${analysis.recommendations.join('; ')}`);
    if (analysis.workHistory) lines.push(`\nWork History:\n${analysis.workHistory}`);

    const result = lines.join('\n');
    return result.slice(0, maxLength);
  }

  // ── Event-driven updates ──

  onProjectUpdate(projectPath: string): void {
    // debounce 10s
    const existing = this.debounceTimers.get(projectPath);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(projectPath);
      const project = this.projects.find(p => p.path === projectPath);
      if (project && this.running) {
        this.analyzeProject(projectPath, project.name).catch(() => {});
      }
    }, DEBOUNCE_MS);

    this.debounceTimers.set(projectPath, timer);
  }

  onWorkerComplete(projectPath: string): void {
    this.onProjectUpdate(projectPath);
  }

  // ── Status ──

  getStatus(): GeminiAdvisorStatus {
    const analyses = this.getAllCachedAnalyses();
    const lastAnalyzedAt = analyses.length > 0
      ? Math.max(...analyses.map(a => a.analyzedAt))
      : null;

    return {
      running: this.running,
      ptyAlive: this.pty?.isAlive() ?? false,
      projectCount: this.projects.length,
      lastAnalyzedAt,
      cacheSize: this.projectCache.size,
      behavior: this.behavior,
      currentTask: this.currentTask,
    };
  }

  // ── Internal ──

  private setBehavior(behavior: GeminiBehavior, task?: string): void {
    this.behavior = behavior;
    this.currentTask = task ?? null;
    this.emit('status', this.getStatus());
  }

  private startPeriodicRefresh(): void {
    if (this.config.refreshIntervalMs <= 0) return;

    this.refreshTimer = setInterval(() => {
      if (!this.running) return;
      this.setBehavior('refreshing');
      this.analyzeAllProjects().catch(() => {}).finally(() => {
        if (this.running) this.setBehavior('idle');
      });
    }, this.config.refreshIntervalMs);
  }

  private buildAnalysisPrompt(projectPath: string, projectName: string, localContext: string, workerHistory?: string): string {
    const parts = [
      'Analyze the following project and respond with JSON only. Do not include any other text.',
      '',
      `Project: ${projectName} (${projectPath})`,
    ];

    if (localContext) {
      parts.push('', 'Project Summary:', localContext);
    }

    if (workerHistory) {
      parts.push(
        '',
        'Complete Task History (oldest→newest, ALL tasks executed by workers):',
        workerHistory,
        '',
        'IMPORTANT: Synthesize ALL tasks above into a coherent "workHistory" narrative.',
        'Include: what was built, key decisions made, bugs fixed, features added, refactoring done.',
        'This summary will be used as persistent memory for the orchestrator AI.',
      );
    }

    parts.push(
      '',
      'JSON response (this format only):',
      '{"structureSummary": "...", "techStack": [...], "keyPatterns": [...], "activeContext": "...", "recommendations": [...], "workHistory": "comprehensive summary of all work done, key changes and decisions (max 1500 chars)"}',
    );

    return parts.join('\n');
  }

  private parseAnalysisResponse(response: string): Partial<GeminiProjectAnalysis> {
    try {
      // Attempt to extract JSON block
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return {};

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        structureSummary: typeof parsed.structureSummary === 'string' ? parsed.structureSummary : undefined,
        techStack: Array.isArray(parsed.techStack) ? parsed.techStack.filter((s: unknown) => typeof s === 'string') : undefined,
        keyPatterns: Array.isArray(parsed.keyPatterns) ? parsed.keyPatterns.filter((s: unknown) => typeof s === 'string') : undefined,
        activeContext: typeof parsed.activeContext === 'string' ? parsed.activeContext : undefined,
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.filter((s: unknown) => typeof s === 'string') : undefined,
        workHistory: typeof parsed.workHistory === 'string' ? parsed.workHistory.slice(0, 2000) : undefined,
      };
    } catch {
      return {};
    }
  }
}
