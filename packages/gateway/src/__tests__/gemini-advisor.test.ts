import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock GeminiPty ── (vi.mock 호이스팅 — mock* 접두사 변수만 참조 가능)

const mockSendPrompt = vi.fn().mockResolvedValue(JSON.stringify({
  structureSummary: 'NestJS 기반 API 서버',
  techStack: ['NestJS', 'TypeScript', 'PostgreSQL'],
  keyPatterns: ['CQRS', 'Repository'],
  activeContext: '주문 API 리팩토링 중',
  recommendations: ['에러 핸들링 개선', '캐시 도입'],
  workHistory: 'Phase 1: API 기본 구조 구축. Phase 2: 주문 모듈 리팩토링.',
}));

vi.mock('../gemini-pty.js', () => ({
  GeminiPty: class MockGeminiPty {
    start = vi.fn().mockResolvedValue(undefined);
    stop = vi.fn().mockResolvedValue(undefined);
    isAlive = vi.fn().mockReturnValue(true);
    sendPrompt = mockSendPrompt;
  },
}));

import { GeminiAdvisor } from '../gemini-advisor.js';

describe('GeminiAdvisor', () => {
  let advisor: GeminiAdvisor;

  beforeEach(() => {
    vi.useFakeTimers();
    mockSendPrompt.mockResolvedValue(JSON.stringify({
      structureSummary: 'NestJS 기반 API 서버',
      techStack: ['NestJS', 'TypeScript', 'PostgreSQL'],
      keyPatterns: ['CQRS', 'Repository'],
      activeContext: '주문 API 리팩토링 중',
      recommendations: ['에러 핸들링 개선', '캐시 도입'],
      workHistory: 'Phase 1: API 기본 구조 구축. Phase 2: 주문 모듈 리팩토링.',
    }));
    advisor = new GeminiAdvisor({ refreshIntervalMs: 0 }); // 주기적 갱신 비활성화
  });

  afterEach(async () => {
    await advisor.shutdown();
    vi.useRealTimers();
  });

  // ── 생명주기 ──

  describe('lifecycle', () => {
    it('initialize → running + idle', async () => {
      await advisor.initialize([{ name: 'test', path: '/dev/test' }]);
      const status = advisor.getStatus();
      expect(status.running).toBe(true);
      expect(status.ptyAlive).toBe(true);
    });

    it('shutdown → offline', async () => {
      await advisor.initialize([{ name: 'test', path: '/dev/test' }]);
      await advisor.shutdown();
      const status = advisor.getStatus();
      expect(status.running).toBe(false);
      expect(status.behavior).toBe('offline');
    });
  });

  // ── 분석 ──

  describe('analyzeProject', () => {
    it('프로젝트 분석 결과를 캐시에 저장', async () => {
      await advisor.initialize([{ name: 'test', path: '/dev/test' }]);
      const analysis = await advisor.analyzeProject('/dev/test', 'test');

      expect(analysis.projectPath).toBe('/dev/test');
      expect(analysis.projectName).toBe('test');
      expect(analysis.structureSummary).toBe('NestJS 기반 API 서버');
      expect(analysis.techStack).toEqual(['NestJS', 'TypeScript', 'PostgreSQL']);
      expect(analysis.keyPatterns).toEqual(['CQRS', 'Repository']);
      expect(analysis.analyzedAt).toBeGreaterThan(0);
    });

    it('캐시 조회', async () => {
      await advisor.initialize([{ name: 'test', path: '/dev/test' }]);
      await advisor.analyzeProject('/dev/test', 'test');

      const cached = advisor.getCachedAnalysis('/dev/test');
      expect(cached).not.toBeNull();
      expect(cached!.projectName).toBe('test');
    });

    it('존재하지 않는 프로젝트 캐시 → null', () => {
      expect(advisor.getCachedAnalysis('/nonexistent')).toBeNull();
    });

    it('분석 실패 시 기본값 캐시', async () => {
      await advisor.initialize([]); // 빈 프로젝트로 초기화 (백그라운드 분석 없음)

      mockSendPrompt.mockRejectedValueOnce(new Error('PTY 에러'));
      const result = await advisor.analyzeProject('/dev/err', 'err');

      expect(result.structureSummary).toBe('err project (analysis failed)');
      expect(result.techStack).toEqual([]);
    });

    it('잘못된 JSON → 기본값 반환', async () => {
      await advisor.initialize([]); // 빈 프로젝트로 초기화

      mockSendPrompt.mockResolvedValueOnce('not valid json at all');
      const result = await advisor.analyzeProject('/dev/bad', 'bad');

      expect(result.structureSummary).toBe('bad project');
      expect(result.techStack).toEqual([]);
    });
  });

  // ── 캐시 ──

  describe('cache management', () => {
    it('getAllCachedAnalyses → 전체 분석 목록', async () => {
      await advisor.initialize([
        { name: 'a', path: '/dev/a' },
        { name: 'b', path: '/dev/b' },
      ]);
      await advisor.analyzeProject('/dev/a', 'a');
      await advisor.analyzeProject('/dev/b', 'b');

      const all = advisor.getAllCachedAnalyses();
      expect(all).toHaveLength(2);
    });
  });

  // ── 컨텍스트 생성 ──

  describe('buildCodexContext', () => {
    it('캐시가 비어있으면 빈 문자열', () => {
      expect(advisor.buildCodexContext()).toBe('');
    });

    it('캐시된 분석으로 컨텍스트 문자열 생성', async () => {
      await advisor.initialize([{ name: 'test', path: '/dev/test' }]);
      await advisor.analyzeProject('/dev/test', 'test');

      const ctx = advisor.buildCodexContext();
      expect(ctx).toContain('Project Analysis (Gemini Advisor)');
      expect(ctx).toContain('test');
      expect(ctx).toContain('NestJS');
    });

    it('maxLength 제한', async () => {
      await advisor.initialize([{ name: 'test', path: '/dev/test' }]);
      await advisor.analyzeProject('/dev/test', 'test');

      const ctx = advisor.buildCodexContext({ maxLength: 50 });
      // header만 포함하고 프로젝트 섹션이 잘리는지 확인
      expect(ctx).toContain('Gemini Advisor');
    });
  });

  describe('buildProjectContext', () => {
    it('캐시 없으면 빈 문자열', () => {
      expect(advisor.buildProjectContext('/dev/test')).toBe('');
    });

    it('프로젝트 컨텍스트 문자열 생성', async () => {
      await advisor.initialize([{ name: 'test', path: '/dev/test' }]);
      await advisor.analyzeProject('/dev/test', 'test');

      const ctx = advisor.buildProjectContext('/dev/test');
      expect(ctx).toContain('Structure: NestJS 기반 API 서버');
      expect(ctx).toContain('Tech Stack: NestJS, TypeScript, PostgreSQL');
    });
  });

  // ── 이벤트 ──

  describe('events', () => {
    it('status 이벤트 발행', async () => {
      const statusFn = vi.fn();
      advisor.on('status', statusFn);

      await advisor.initialize([{ name: 'test', path: '/dev/test' }]);
      expect(statusFn).toHaveBeenCalled();

      const lastCall = statusFn.mock.calls[statusFn.mock.calls.length - 1][0];
      expect(lastCall).toHaveProperty('running');
      expect(lastCall).toHaveProperty('behavior');
    });

    it('analysis:complete 이벤트 발행', async () => {
      const analysisFn = vi.fn();
      advisor.on('analysis:complete', analysisFn);

      await advisor.initialize([{ name: 'test', path: '/dev/test' }]);
      await advisor.analyzeProject('/dev/test', 'test');

      expect(analysisFn).toHaveBeenCalledWith(
        expect.objectContaining({
          projectPath: '/dev/test',
          projectName: 'test',
        }),
      );
    });
  });

  // ── 상태 ──

  describe('getStatus', () => {
    it('초기 상태', () => {
      const status = advisor.getStatus();
      expect(status.running).toBe(false);
      expect(status.ptyAlive).toBe(false);
      expect(status.cacheSize).toBe(0);
      expect(status.behavior).toBe('offline');
      expect(status.lastAnalyzedAt).toBeNull();
    });

    it('분석 후 상태', async () => {
      await advisor.initialize([{ name: 'test', path: '/dev/test' }]);
      await advisor.analyzeProject('/dev/test', 'test');

      const status = advisor.getStatus();
      expect(status.cacheSize).toBe(1);
      expect(status.lastAnalyzedAt).toBeGreaterThan(0);
    });
  });

  // ── 증분 갱신 ──

  describe('onProjectUpdate', () => {
    it('debounce 적용 (10초)', async () => {
      await advisor.initialize([{ name: 'test', path: '/dev/test' }]);

      const spy = vi.spyOn(advisor, 'analyzeProject');
      advisor.onProjectUpdate('/dev/test');

      // 즉시 호출되지 않음
      expect(spy).not.toHaveBeenCalled();

      // 10초 후 호출
      await vi.advanceTimersByTimeAsync(10_000);
      expect(spy).toHaveBeenCalledWith('/dev/test', 'test');
    });

    it('연속 호출 시 마지막만 실행 (debounce)', async () => {
      await advisor.initialize([{ name: 'test', path: '/dev/test' }]);

      const spy = vi.spyOn(advisor, 'analyzeProject');
      advisor.onProjectUpdate('/dev/test');
      advisor.onProjectUpdate('/dev/test');
      advisor.onProjectUpdate('/dev/test');

      await vi.advanceTimersByTimeAsync(10_000);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('onWorkerComplete는 onProjectUpdate에 위임', () => {
      const spy = vi.spyOn(advisor, 'onProjectUpdate');
      advisor.onWorkerComplete('/dev/test');
      expect(spy).toHaveBeenCalledWith('/dev/test');
    });
  });
});
