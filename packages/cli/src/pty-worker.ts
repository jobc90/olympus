/**
 * PTY Worker — node-pty를 통한 상주 Claude CLI 관리
 *
 * Claude CLI를 대화형 모드(Ink TUI)로 실행하고,
 * 프로그래밍적으로 명령을 입력하여 작업을 처리합니다.
 *
 * - start(): Claude CLI를 PTY로 실행 (TUI 화면 즉시 표시)
 * - executeTask(): 프롬프트를 PTY에 입력하고 완료를 대기
 * - destroy(): PTY 종료
 */

import { chmodSync, accessSync, constants } from 'fs';
import { join, dirname } from 'path';
import { createRequire } from 'module';
import { stripAnsi } from './utils/strip-ansi.js';

/**
 * node-pty의 spawn-helper 바이너리에 실행 권한을 부여한다.
 * pnpm/npm이 prebuild를 설치할 때 실행 권한이 빠지는 경우가 있음.
 */
function ensureSpawnHelperPermissions(): void {
  try {
    const require = createRequire(import.meta.url);
    const ptyPath = dirname(require.resolve('node-pty/package.json'));
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    const platform = process.platform;
    const helperPath = join(ptyPath, 'prebuilds', `${platform}-${arch}`, 'spawn-helper');

    try {
      accessSync(helperPath, constants.X_OK);
    } catch {
      chmodSync(helperPath, 0o755);
    }
  } catch {
    // node-pty 경로 해석 실패 시 무시
  }
}

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface PtyWorkerOptions {
  projectPath: string;
  trustMode: boolean;
  cols?: number;
  rows?: number;
  onReady?: () => void;
  onExit?: () => void; // Double Ctrl+C 종료 콜백
}

export interface TaskResult {
  success: boolean;
  text: string;
  durationMs: number;
}

interface ProcessingState {
  phase: 'processing';
  prompt: string;
  startTime: number;
  buffer: string;
  resolve: (r: TaskResult) => void;
  reject: (e: Error) => void;
  settleTimer: ReturnType<typeof setTimeout> | null;
  submitted: boolean;
  submittedAt: number;
  /** 백그라운드 에이전트가 활성 상태인지 (완료 감지 억제) */
  hasBackgroundAgents: boolean;
  /** 마지막으로 백그라운드 에이전트 출력이 감지된 시각 */
  lastAgentActivityAt: number;
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

/** 프롬프트 감지 후 추가 대기 (5초) */
const SETTLE_MS = 5_000;

/** 최소 실행 시간: 이 시간 이전에는 완료 감지하지 않음 (10초) */
const MIN_EXECUTION_MS = 10_000;

/** 백그라운드 에이전트 활동 후 완료 감지 유예 시간 */
const AGENT_COOLDOWN_MS = 30_000;

/** 텍스트 입력 후 Enter 전송까지 대기 (Ink가 텍스트를 처리할 시간) */
const SUBMIT_DELAY_MS = 150;

/** Double Ctrl+C 감지 시간 (ms) */
const DOUBLE_CTRLC_MS = 1000;

// ──────────────────────────────────────────────
// Prompt / Completion patterns
// ──────────────────────────────────────────────

/**
 * Claude CLI가 유휴 상태(입력 대기)인지 감지하는 패턴.
 * Claude Code v2.x Ink TUI의 실제 출력 기반.
 */
export const IDLE_PROMPT_PATTERNS = [
  // Claude Code TUI hints (v2.x)
  /ctrl\+g to edit/i,
  /shift\+tab to cycle/i,
  /Enter your message/i,
  /Type a message/i,
  /What would you like to do/i,
  // Shell-style prompts (relaxed — no ^ anchor, TUI may embed mid-line)
  />\s*$/m,
  /❯\s*$/m,
  /\$\s*$/m,
  // Ink TUI box-drawing borders (Claude Code renders these)
  /╭─/,
  /╰─/,
  // v2.1.38+ status line indicators (appear when CLI is idle/ready)
  /\d+\s*tokens?\s*remaining/i,
  /cost:\s*\$/i,
  /claude(?:\s+code)?\s*$/im,
];

/** Claude가 작업 완료 후 출력하는 텍스트 패턴 */
export const COMPLETION_PATTERNS = [
  /I've (?:completed|finished|made|created|updated|added|fixed|removed|implemented)/i,
  /(?:changes|modifications|updates) (?:have been|were) (?:made|applied|saved)/i,
  /Let me know if/i,
  /Is there anything else/i,
  /Done[.!]?\s*$/i,
  /Task completed/i,
  /(?:작업|수정|변경|구현|추가|삭제)(?:이|을|을\s)?\s*(?:완료|마쳤|끝났)/,  // 한국어 완료
  /파일을?\s*(?:수정|생성|삭제|변경)(?:했|하였)/,  // 한국어 파일 작업 완료
];

/** TUI 크롬 (상태바, 구분선 등) — 결과에서 필터링 */
const TUI_CHROME_PATTERNS = [
  /^[─━═\s]*$/,                          // 구분선
  /🤖.*(?:Opus|Sonnet|Haiku|Claude)/i,   // 모델 상태
  /📁/,                                   // 프로젝트 상태
  /🔷|💎/,                               // AI 모델 상태
  /⏵⏵/,                                  // 권한 모드
  /ctrl\+g to edit/i,                     // 입력 힌트
  /shift\+tab to cycle/i,                // 모드 전환 힌트
  /\d+\s*토큰/,                          // 토큰 통계
  /\$[\d.]+.*\d+초/,                     // 비용/시간 통계
  /🔥.*\/min/,                           // 속도 표시
  /할일:\s*-/,                           // 할일 표시
  /bypass\s*permissions?\s*on/i,         // 권한 모드 텍스트
  /↓[\d.]+k?\s*tokens?/i,               // 영어 토큰 표시 (↓2.4ktokens)
  /\d+K?\/\d+K?\s*(?:tokens|tok)/i,     // 토큰 비율 표시 (47K/200K tokens)
];

/** TUI 아티팩트 (스피너, thinking, Flowing 등) — 결과에서 필터링 */
const TUI_ARTIFACT_PATTERNS = [
  /^[✢✳✶✻✽·\s]+$/,                      // 스피너 문자만
  /^[✢✳✶✻✽·].{0,15}$/,                  // 스피너 + 짧은 프래그먼트
  /^\(thinking\)\s*$/,                    // thinking 표시
  /^\((?:thought|cogitated|brewed|stewed|pondered|reasoned|mulled)\s+for\s+[\dm\s]+s?\)\s*$/i, // thinking 소요 시간 (분+초, 동사 변형)
  /^[✢✳✶✻✽·]?\s*(?:Stewing|Brewing|Thinking|Reasoning|Pondering|Mulling|Flowing|Spinning)…/i, // Thinking 진행형 (P0-1)
  /^[✢✳✶✻✽·]?\s*(?:Cogitated|Brewed|Thought|Pondered|Reasoned|Mulled|Stewed)\s+for\s+[\dm\s]+s?/i, // Thinking 완료형 (P0-2)
  /^\([\dm\s]+s?\s*[·•]\s*↓/,            // 시간·토큰 괄호 조합 (P1-1)
  /^\d{4,}$/,                             // 독립 숫자 줄 4자리+ (P2-1, 토큰 카운트 잔여)
  /Flowing…?\s*$/,                        // 스트리밍 애니메이션
  /^[✢✳✶✻✽·].*Flowing/,                 // 스피너 + Flowing
  /\]0;/,                                 // 터미널 타이틀 잔여
];

/** 백그라운드 에이전트 활동 감지 패턴 */
const BACKGROUND_AGENT_PATTERNS = [
  /⏺\s*Task\s+".*"\s*completed\s*in\s*background/i,
  /⏺\s*Agent\s+".*"\s*completed/i,
  /Task\s+".*"\s*completed\s*in\s*background/i,
  /Agent\s+".*"\s*completed/i,
  /completed\s*in\s*background/i,
  /✻\s*Conversation\s+compacted/i,
  /✻\s*Cooked\s+for/i,
];

/** 데이터 내 백그라운드 에이전트 활동이 있는지 감지 */
export function hasBackgroundAgentActivity(data: string): boolean {
  const clean = stripAnsi(data).trim();
  if (!clean) return false;
  return BACKGROUND_AGENT_PATTERNS.some(p => p.test(clean));
}

// ──────────────────────────────────────────────
// Standalone Detection Functions (테스트용 export)
// ──────────────────────────────────────────────

/** 유휴 프롬프트 감지 (standalone) */
export function detectIdlePrompt(cleanText: string): boolean {
  const lastChunk = cleanText.slice(-5000);
  return IDLE_PROMPT_PATTERNS.some(p => p.test(lastChunk));
}

/** 완료 텍스트 패턴 감지 (standalone) */
export function detectCompletionPattern(cleanText: string): boolean {
  const lastChunk = cleanText.slice(-2000);
  return COMPLETION_PATTERNS.some(p => p.test(lastChunk));
}

/** TUI 크롬 라인인지 판별 (standalone) */
export function isTuiChromeLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  return TUI_CHROME_PATTERNS.some(p => p.test(trimmed));
}

/** TUI 아티팩트 라인인지 판별 (standalone) */
export function isTuiArtifactLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  // TUI 크롬도 아티팩트
  if (TUI_CHROME_PATTERNS.some(p => p.test(trimmed))) return true;
  // 스피너/thinking/Flowing 등
  if (TUI_ARTIFACT_PATTERNS.some(p => p.test(trimmed))) return true;
  // 아주 짧은 프래그먼트 (1자 이하)
  if (trimmed.length <= 1) return true;
  return false;
}

/** PTY 출력 버퍼에서 결과 텍스트 추출 (standalone) */
export function extractResultFromBuffer(buffer: string, prompt: string): string {
  let clean = stripAnsi(buffer);

  // ⏺ 마커 기반 응답 추출 (Claude CLI는 응답 블록을 ⏺로 시작)
  const markerIdx = clean.lastIndexOf('⏺');
  if (markerIdx >= 0) {
    clean = clean.slice(markerIdx + 1);
  } else {
    // 폴백: 입력 에코 제거
    const echoIdx = clean.indexOf(prompt);
    if (echoIdx >= 0) {
      clean = clean.slice(echoIdx + prompt.length);
    }
  }

  // 라인 내 선행 스피너 문자 제거 → TUI 아티팩트 필터링
  const lines = clean.split('\n')
    .map(line => line.replace(/^[✢✳✶✻✽·]+\s*/, ''))
    .filter(line => !isTuiArtifactLine(line));

  // 뒤에서부터 프롬프트/빈 라인 제거
  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim();
    if (last === '' || last === '>' || last === '❯' || /^(claude\s*)?[>❯$]\s*$/i.test(last)) {
      lines.pop();
    } else {
      break;
    }
  }

  // 앞에서부터 빈 줄 제거
  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }

  let result = lines.join('\n').trim();

  // 결과가 너무 짧으면 TUI 필터 없이 fallback
  if (result.length < 10) {
    const fallbackClean = stripAnsi(buffer);
    const mi = fallbackClean.lastIndexOf('⏺');
    if (mi >= 0) {
      const fallbackText = fallbackClean.slice(mi + 1).trim()
        .replace(/ {4,}/g, ' ').replace(/\n{3,}/g, '\n\n');
      if (fallbackText.length > result.length) {
        result = fallbackText;
      }
    }
  }

  // 커서 이동에 의한 과다 공백 정리
  result = result.replace(/ {4,}/g, ' ');
  result = result.replace(/\n{3,}/g, '\n\n');

  // 깨진 텍스트 감지 (짧은 단어 비율이 너무 높으면, 한국어 제외)
  const hasKorean = /[가-힣]/.test(result);
  if (!hasKorean) {
    const words = result.split(/\s+/).filter(w => w.length > 0);
    if (words.length >= 5) {
      const avgLen = words.reduce((s, w) => s + w.length, 0) / words.length;
      if (avgLen < 3) {
        result = '(결과 추출 실패 — 원본 출력 확인 필요)';
      }
    }
  }

  // 길이 제한 (8000자)
  if (result.length > 8000) {
    result = '...(앞부분 생략)...\n\n' + result.slice(-8000);
  }

  return result;
}

// ──────────────────────────────────────────────
// PtyWorker Class
// ──────────────────────────────────────────────

export interface TimeoutAwareResult {
  result: TaskResult;
  finalResult?: Promise<TaskResult>;
}

export class PtyWorker {
  private pty: { write: (data: string) => void; kill: () => void; onData: { (handler: (data: string) => void): { dispose: () => void } }; onExit: { (handler: (e: { exitCode: number }) => void): { dispose: () => void } }; resize: (cols: number, rows: number) => void } | null = null;
  private state: { phase: 'idle' } | ProcessingState = { phase: 'idle' };
  private idleBuffer = '';
  private ready = false;
  private readyResolve: (() => void) | null = null;
  private stdinHandler: ((data: Buffer) => void) | null = null;
  private resizeHandler: (() => void) | null = null;
  private originalRawMode: boolean | undefined;
  private lastCtrlC = 0;
  private ctrlCResetTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private options: PtyWorkerOptions) {}

  // ──────────────────────────────────────
  // Public API
  // ──────────────────────────────────────

  async start(): Promise<void> {
    ensureSpawnHelperPermissions();

    const ptyModule = await import('node-pty');
    const pty = (ptyModule as Record<string, unknown>).default ?? ptyModule;
    const spawn = (pty as { spawn: typeof import('node-pty')['spawn'] }).spawn;

    const claudeArgs: string[] = [];
    if (this.options.trustMode) {
      claudeArgs.push('--dangerously-skip-permissions');
    }

    this.pty = spawn('claude', claudeArgs, {
      name: 'xterm-256color',
      cols: this.options.cols ?? process.stdout.columns ?? 120,
      rows: this.options.rows ?? process.stdout.rows ?? 30,
      cwd: this.options.projectPath,
      env: { ...process.env } as Record<string, string>,
    });

    // PTY 출력 핸들러
    this.pty.onData((data: string) => {
      process.stdout.write(data);
      this.idleBuffer += data;

      if (this.state.phase === 'processing' && this.state.submitted) {
        this.state.buffer += data;

        // 백그라운드 에이전트 활동 감지
        if (hasBackgroundAgentActivity(data)) {
          this.state.hasBackgroundAgents = true;
          this.state.lastAgentActivityAt = Date.now();
          // settle 타이머가 있으면 취소 (아직 작업 중)
          if (this.state.settleTimer) {
            clearTimeout(this.state.settleTimer);
            this.state.settleTimer = null;
          }
        }

        this.checkCompletion();
      }

      if (!this.ready) {
        const clean = stripAnsi(this.idleBuffer);
        if (process.env.OLYMPUS_PTY_DEBUG) {
          process.stderr.write(`[PTY-DEBUG] Init buffer (last 500): ${clean.slice(-500)}\n`);
        }
        if (this.detectIdlePrompt(clean)) {
          this.ready = true;
          this.readyResolve?.();
          this.options.onReady?.();
        }
      }
    });

    // PTY 종료 핸들러
    this.pty.onExit(({ exitCode }) => {
      if (this.state.phase === 'processing') {
        this.clearTimers();
        this.state.reject(new Error(`Claude CLI가 예기치 않게 종료됨 (code: ${exitCode})`));
        this.state = { phase: 'idle' };
      }
      this.restoreStdin();
      this.pty = null;
    });

    // stdin → PTY 포워딩 (사용자 키보드 입력 + Ctrl+C 처리)
    if (process.stdin.isTTY) {
      this.originalRawMode = process.stdin.isRaw;
      process.stdin.setRawMode(true);
      process.stdin.resume();

      this.stdinHandler = (data: Buffer) => {
        if (!this.pty) return;

        // Ctrl+C (0x03) 처리: 더블 Ctrl+C → 종료
        if (data.length === 1 && data[0] === 0x03) {
          const now = Date.now();
          if (now - this.lastCtrlC < DOUBLE_CTRLC_MS) {
            // 더블 Ctrl+C → 워커 종료
            if (this.options.onExit) {
              this.options.onExit();
            } else {
              process.exit(0);
            }
            return;
          }
          this.lastCtrlC = now;
          // Clear the timestamp after the double-press window expires
          if (this.ctrlCResetTimer) clearTimeout(this.ctrlCResetTimer);
          this.ctrlCResetTimer = setTimeout(() => {
            this.lastCtrlC = 0;
            this.ctrlCResetTimer = null;
          }, DOUBLE_CTRLC_MS);
          // Show hint after first Ctrl+C
          process.stderr.write('\x1b[90m  (Ctrl+C once more to exit)\x1b[0m\r\n');
          // 첫 Ctrl+C → Claude CLI에 전달 (작업 중단)
        }

        this.pty.write(data.toString());
      };
      process.stdin.on('data', this.stdinHandler);
    }

    // 터미널 리사이즈 핸들링
    this.resizeHandler = () => {
      if (this.pty && process.stdout.columns && process.stdout.rows) {
        this.pty.resize(process.stdout.columns, process.stdout.rows);
      }
    };
    process.stdout.on('resize', this.resizeHandler);

    // 유휴 프롬프트가 나타날 때까지 대기 (무제한)
    await new Promise<void>((resolve) => {
      this.readyResolve = resolve;
      if (this.ready) resolve();
    });

    this.idleBuffer = '';
  }

  /**
   * 타임아웃 인식 작업 실행.
   * 타임아웃 없이 프롬프트 패턴 감지로만 완료 판정.
   */
  async executeTaskWithTimeout(prompt: string): Promise<TimeoutAwareResult> {
    const result = await this.executeTask(prompt);
    return { result };
  }

  /**
   * Claude CLI에 프롬프트를 입력하고 완료를 대기합니다.
   *
   * 텍스트와 Enter(\r)를 분리하여 전송합니다.
   * Ink TUI는 단일 stdin 이벤트에서 \r을 독립적으로 감지하므로,
   * "text\r"을 한 번에 보내면 Enter가 인식되지 않습니다.
   */
  async executeTask(prompt: string): Promise<TaskResult> {
    if (this.state.phase !== 'idle') {
      throw new Error('이미 작업 진행 중입니다');
    }
    if (!this.pty) {
      throw new Error('PTY가 시작되지 않았습니다');
    }

    return new Promise<TaskResult>((resolve, reject) => {
      const startTime = Date.now();

      this.state = {
        phase: 'processing',
        prompt,
        startTime,
        buffer: '',
        resolve,
        reject,
        settleTimer: null,
        submitted: false,
        submittedAt: 0,
        hasBackgroundAgents: false,
        lastAgentActivityAt: 0,
      };

      // 1단계: 프롬프트 텍스트 입력
      this.pty!.write(prompt);

      // 2단계: 별도 이벤트로 Enter 전송
      setTimeout(() => {
        if (this.pty && this.state.phase === 'processing') {
          this.pty.write('\r');
          (this.state as ProcessingState).submitted = true;
          (this.state as ProcessingState).submittedAt = Date.now();
        }
      }, SUBMIT_DELAY_MS);
    });
  }

  get isProcessing(): boolean {
    return this.state.phase === 'processing';
  }

  get isAlive(): boolean {
    return this.pty !== null;
  }

  destroy(): void {
    if (this.state.phase === 'processing') {
      this.clearTimers();
    }
    if (this.ctrlCResetTimer) {
      clearTimeout(this.ctrlCResetTimer);
      this.ctrlCResetTimer = null;
    }
    if (this.resizeHandler) {
      process.stdout.removeListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
    this.restoreStdin();
    this.pty?.kill();
    this.pty = null;
    this.state = { phase: 'idle' };
  }

  // ──────────────────────────────────────
  // Private: stdin management
  // ──────────────────────────────────────

  private restoreStdin(): void {
    if (this.stdinHandler) {
      process.stdin.removeListener('data', this.stdinHandler);
      this.stdinHandler = null;
    }
    if (process.stdin.isTTY && this.originalRawMode !== undefined) {
      try {
        process.stdin.setRawMode(this.originalRawMode);
      } catch {
        // stdin may already be destroyed
      }
    }
  }

  // ──────────────────────────────────────
  // Completion Detection (Private)
  // ──────────────────────────────────────

  private checkCompletion(): void {
    if (this.state.phase !== 'processing') return;

    const now = Date.now();

    // 최소 실행 시간 이전에는 완료 감지 하지 않음
    if (now - this.state.submittedAt < MIN_EXECUTION_MS) return;

    // 백그라운드 에이전트 쿨다운: 에이전트 활동이 최근에 감지되었으면 완료 감지 억제
    if (this.state.hasBackgroundAgents && now - this.state.lastAgentActivityAt < AGENT_COOLDOWN_MS) {
      // settle 타이머가 있으면 취소
      if (this.state.settleTimer) {
        clearTimeout(this.state.settleTimer);
        this.state.settleTimer = null;
      }
      return;
    }

    const clean = stripAnsi(this.state.buffer);

    if (this.detectIdlePrompt(clean)) {
      if (!this.state.settleTimer) {
        this.state.settleTimer = setTimeout(() => {
          this.completeTask();
        }, SETTLE_MS);
      }
    } else if (this.state.settleTimer) {
      clearTimeout(this.state.settleTimer);
      this.state.settleTimer = null;
    }
  }

  private completeTask(): void {
    if (this.state.phase !== 'processing') return;

    const result = this.extractResult();
    const durationMs = Date.now() - this.state.startTime;

    // 결과 품질 검증: 백그라운드 에이전트가 있었는데 결과가 너무 짧으면 재대기
    if (this.state.hasBackgroundAgents && result.length < 50) {
      // 결과가 빈약하면 settle 타이머 초기화하고 추가 대기
      if (this.state.settleTimer) {
        clearTimeout(this.state.settleTimer);
        this.state.settleTimer = null;
      }
      return;
    }

    const resolveRef = this.state.resolve;

    this.clearTimers();
    this.state = { phase: 'idle' };
    this.idleBuffer = '';

    resolveRef({
      success: true,
      text: result,
      durationMs,
    });
  }

  private clearTimers(): void {
    if (this.state.phase !== 'processing') return;

    if (this.state.settleTimer) clearTimeout(this.state.settleTimer);
  }

  // ──────────────────────────────────────
  // Pattern Detection (Private)
  // ──────────────────────────────────────

  private detectIdlePrompt(cleanText: string): boolean {
    const lastChunk = cleanText.slice(-5000);
    return IDLE_PROMPT_PATTERNS.some(p => p.test(lastChunk));
  }

  // ──────────────────────────────────────
  // Result Extraction (Private)
  // ──────────────────────────────────────

  private extractResult(): string {
    if (this.state.phase !== 'processing') return '';
    return extractResultFromBuffer(this.state.buffer, this.state.prompt);
  }
}
