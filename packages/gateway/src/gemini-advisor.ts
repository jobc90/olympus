/**
 * GeminiAdvisor — Gemini CLI 기반 프로젝트 분석 + Codex 컨텍스트 보조 AI
 *
 * 인메모리 캐시 + 주기적 갱신 + 이벤트 기반 증분 갱신
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

/** Debounce 타이머 맵 */
const DEBOUNCE_MS = 10_000;

export class GeminiAdvisor extends EventEmitter {
  private config: GeminiAdvisorConfig;
  private localContextManager: LocalContextStoreManager | null = null;
  private pty: GeminiPty | null = null;
  private projects: Array<{ name: string; path: string }> = [];

  // 인메모리 캐시
  private projectCache = new Map<string, GeminiProjectAnalysis>();
  private rootCache: GeminiRootAnalysis | null = null;
  private behavior: GeminiBehavior = 'offline';
  private currentTask: string | null = null;

  // 타이머
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private running = false;

  constructor(config?: Partial<GeminiAdvisorConfig>) {
    super();
    this.config = { ...DEFAULT_GEMINI_ADVISOR_CONFIG, ...config };
  }

  // ── 생명주기 ──

  async initialize(
    projects: Array<{ name: string; path: string }>,
    localContextManager?: LocalContextStoreManager,
  ): Promise<void> {
    this.projects = projects;
    if (localContextManager) {
      this.localContextManager = localContextManager;
    }

    // PTY 시작
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

    // 비동기 백그라운드 분석 시작
    this.analyzeAllProjects().catch((err) => {
      console.warn(`[GeminiAdvisor] Initial analysis failed: ${(err as Error).message}`);
    });

    // 주기적 갱신
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

  // ── 분석 ──

  async analyzeProject(projectPath: string, projectName: string): Promise<GeminiProjectAnalysis> {
    if (!this.pty?.isAlive()) {
      throw new Error('GeminiPty not available');
    }

    this.setBehavior('analyzing', projectName);

    // LocalContext 데이터 수집
    let localContextStr = '';
    if (this.localContextManager) {
      try {
        const store = await this.localContextManager.getProjectStore(projectPath);
        const injection = store.buildContextInjection({ maxTokens: 1500 });
        if (injection.projectSummary) {
          localContextStr += `${injection.projectSummary}\n`;
        }
        if (injection.recentActivity) {
          localContextStr += `${injection.recentActivity}\n`;
        }
      } catch { /* context not available */ }
    }

    const prompt = this.buildAnalysisPrompt(projectPath, projectName, localContextStr);

    try {
      const response = await this.pty.sendPrompt(prompt, this.config.analysisTimeoutMs);
      const parsed = this.parseAnalysisResponse(response);

      const analysis: GeminiProjectAnalysis = {
        projectPath,
        projectName,
        structureSummary: parsed.structureSummary ?? `${projectName} 프로젝트`,
        techStack: parsed.techStack ?? [],
        keyPatterns: parsed.keyPatterns ?? [],
        activeContext: parsed.activeContext ?? '',
        recommendations: parsed.recommendations ?? [],
        analyzedAt: Date.now(),
      };

      this.projectCache.set(projectPath, analysis);
      this.emit('analysis:complete', analysis);
      return analysis;
    } catch (err) {
      console.warn(`[GeminiAdvisor] Analysis failed for ${projectName}: ${(err as Error).message}`);

      // 실패 시 기본값 캐시
      const fallback: GeminiProjectAnalysis = {
        projectPath,
        projectName,
        structureSummary: `${projectName} 프로젝트 (분석 실패)`,
        techStack: [],
        keyPatterns: [],
        activeContext: '',
        recommendations: [],
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

  // ── 캐시 조회 ──

  getCachedAnalysis(projectPath: string): GeminiProjectAnalysis | null {
    return this.projectCache.get(projectPath) ?? null;
  }

  getCachedRootAnalysis(): GeminiRootAnalysis | null {
    return this.rootCache;
  }

  getAllCachedAnalyses(): GeminiProjectAnalysis[] {
    return Array.from(this.projectCache.values());
  }

  // ── Codex 시스템 프롬프트용 컨텍스트 생성 ──

  buildCodexContext(options?: { maxLength?: number }): string {
    const maxLength = options?.maxLength ?? 3000;
    const analyses = this.getAllCachedAnalyses();
    if (analyses.length === 0) return '';

    const lines: string[] = ['\n\n## 프로젝트 분석 (Gemini Advisor)\n'];

    for (const a of analyses) {
      const section: string[] = [`### ${a.projectName} (${a.projectPath})`];
      if (a.structureSummary) section.push(`- 구조: ${a.structureSummary}`);
      if (a.techStack.length > 0) section.push(`- 기술: ${a.techStack.join(', ')}`);
      if (a.keyPatterns.length > 0) section.push(`- 패턴: ${a.keyPatterns.join(', ')}`);
      if (a.activeContext) section.push(`- 현황: ${a.activeContext}`);
      if (a.recommendations.length > 0) section.push(`- 권장: ${a.recommendations.slice(0, 2).join('; ')}`);
      section.push('');

      const sectionStr = section.join('\n');
      if (lines.join('\n').length + sectionStr.length > maxLength) break;
      lines.push(sectionStr);
    }

    return lines.join('\n');
  }

  buildProjectContext(projectPath: string, options?: { maxLength?: number }): string {
    const maxLength = options?.maxLength ?? 2000;
    const analysis = this.projectCache.get(projectPath);
    if (!analysis) return '';

    const lines: string[] = [];
    if (analysis.structureSummary) lines.push(`구조: ${analysis.structureSummary}`);
    if (analysis.techStack.length > 0) lines.push(`기술 스택: ${analysis.techStack.join(', ')}`);
    if (analysis.keyPatterns.length > 0) lines.push(`패턴: ${analysis.keyPatterns.join(', ')}`);
    if (analysis.activeContext) lines.push(`현재 상황: ${analysis.activeContext}`);
    if (analysis.recommendations.length > 0) lines.push(`권장사항: ${analysis.recommendations.join('; ')}`);

    const result = lines.join('\n');
    return result.slice(0, maxLength);
  }

  // ── 이벤트 기반 갱신 ──

  onProjectUpdate(projectPath: string): void {
    // debounce 10초
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

  // ── 상태 ──

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

  // ── 내부 ──

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

  private buildAnalysisPrompt(projectPath: string, projectName: string, localContext: string): string {
    const parts = [
      'Analyze the following project and respond with JSON only. Do not include any other text.',
      '',
      `Project: ${projectName} (${projectPath})`,
    ];

    if (localContext) {
      parts.push('', 'Recent Activity:', localContext);
    }

    parts.push(
      '',
      'JSON response (this format only):',
      '{"structureSummary": "...", "techStack": [...], "keyPatterns": [...], "activeContext": "...", "recommendations": [...]}',
    );

    return parts.join('\n');
  }

  private parseAnalysisResponse(response: string): Partial<GeminiProjectAnalysis> {
    try {
      // JSON 블록 추출 시도
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return {};

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        structureSummary: typeof parsed.structureSummary === 'string' ? parsed.structureSummary : undefined,
        techStack: Array.isArray(parsed.techStack) ? parsed.techStack.filter((s: unknown) => typeof s === 'string') : undefined,
        keyPatterns: Array.isArray(parsed.keyPatterns) ? parsed.keyPatterns.filter((s: unknown) => typeof s === 'string') : undefined,
        activeContext: typeof parsed.activeContext === 'string' ? parsed.activeContext : undefined,
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.filter((s: unknown) => typeof s === 'string') : undefined,
      };
    } catch {
      return {};
    }
  }
}
