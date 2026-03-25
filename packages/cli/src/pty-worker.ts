/**
 * PTY Worker — 상주 Claude CLI PTY 세션 관리
 *
 * Claude CLI를 대화형 모드(Ink TUI)로 실행하고,
 * 프로그래밍적으로 명령을 입력하여 작업을 처리합니다.
 *
 * - start(): Claude CLI를 PTY로 실행 (TUI 화면 즉시 표시)
 * - executeTask(): 프롬프트를 PTY에 입력하고 완료를 대기
 * - destroy(): PTY 종료
 */

import { stripAnsi } from './utils/strip-ansi.js';
import type { TaskResult, TimeoutAwareResult } from './worker-runtime.js';
import { PtyLocalInputTracker } from './pty-local-input-tracker.js';
import { PtySessionAdapter, type PtySessionAdapterLike, type PtySessionHandle } from './pty-session-adapter.js';
import { PtyStdinBridge } from './pty-stdin-bridge.js';
import { PtyTerminalBridge } from './pty-terminal-bridge.js';
export type { TaskResult, TimeoutAwareResult } from './worker-runtime.js';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface PtyWorkerOptions {
  projectPath: string;
  trustMode: boolean;
  cols?: number;
  rows?: number;
  /** Raw PTY output callback for mirroring/stream relay */
  onData?: (data: string) => void;
  onReady?: () => void;
  onExit?: () => void; // worker 종료 콜백 (Ctrl+] escape)
  /**
   * Called when the user presses Enter in the local terminal while PTY is idle.
   * Used for cross-channel input sync (local PTY → Telegram/Dashboard Chat).
   * Only fires when the PTY is not already processing a task.
   */
  onLocalInput?: (line: string) => void;
  sessionAdapter?: PtySessionAdapterLike;
  terminalBridge?: PtyTerminalBridge;
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
  /** 마지막 출력 수신 시각 (idle prompt false-positive 억제) */
  lastOutputAt: number;
  /** 출력 정적 상태 재검사 타이머 (출력 멈춤 시 완료 감지 보강) */
  completionRecheckTimer: ReturnType<typeof setTimeout> | null;
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

/** 프롬프트 감지 후 추가 대기 (10초) */
const SETTLE_MS = 10_000;

/** 최소 실행 시간: 이 시간 이전에는 완료 감지하지 않음 (10초) */
const MIN_EXECUTION_MS = 10_000;

/** 백그라운드 에이전트 활동 후 완료 감지 유예 시간 */
const AGENT_COOLDOWN_MS = 30_000;

/** 시간 기반 init fallback: 첫 데이터 수신 후 이 시간 경과 시 ready로 전환 */
const TIME_BASED_READY_MS = 15_000;

/** 텍스트 입력 후 Enter 전송까지 대기 (Ink가 텍스트를 처리할 시간) */
const SUBMIT_DELAY_MS = 150;

/** 출력이 멈춘 뒤 완료 재검사 지연 */
const QUIET_RECHECK_MS = 2_500;

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
  // Shell-style prompts — STRICT: must be at start of line on own line
  /^>\s*$/m,
  /^❯\s*$/m,
  /^\$\s*$/m,
  // Ink TUI box-drawing borders (Claude Code renders these when idle)
  /╭─/,
  /╰─/,
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
  /gemini.*preview/i,                    // Gemini model in status bar
  /claude.*opus|claude.*sonnet|claude.*haiku/i,  // Claude model in status bar
  /█+[░▓]*/,                            // Progress bar characters
  /\d+시간\d*분/,                       // Korean time display
  /│\s*\d+%/,                           // Status bar separator with percentage
  /ctrl\+o\s*to\s*expand/i,            // TUI expand hint
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
  /^\w{1,3}$/,                            // 1-3 char fragments like "Can", "ae"
  /\(thinking\)/i,                        // Any thinking indicator
  /Flowing\.\.\./i,                       // Streaming indicator
  /^\d{1,2}s\s*\(ctrl/,                  // "2s (ctrl+o to expand)"
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
// Compatibility Completion Heuristics (테스트용 export)
// ──────────────────────────────────────────────
//
// Important:
// These helpers are intentionally retained only as compatibility fallbacks for
// interactive PTY/tmux flows. Authoritative task truth now lives in task
// state, runtime-control state, and task artifacts, not in terminal text.

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

/** thinking/animation 출력이 아직 진행 중인지 감지 */
export function hasOngoingThinkingActivity(cleanText: string): boolean {
  const lastChunk = cleanText.slice(-3000);
  return /(\(thinking\)|Flowing|Forming|Deliberating|Topsy-turvying|Stewing|Brewing|Reasoning|Pondering|Mulling)/i.test(lastChunk);
}

/** 완료 판정용 유휴 프롬프트 감지 (ready 판정보다 더 보수적) */
export function detectIdlePromptForCompletion(cleanText: string): boolean {
  const lastChunk = cleanText.slice(-6000);
  const lines = lastChunk.split('\n').map((line) => line.trim());
  const recentWindow = lines.slice(-12).join('\n');
  if (hasOngoingThinkingActivity(recentWindow)) return false;

  const tailLines = lines.slice(-80);
  // Keep this strict to avoid false positives from command examples in model output.
  // Completion fallback is handled by quiet recheck timer + broader idle detection.
  const promptOnlyPattern = /^(?:claude\s*)?[>❯$]\s*$/i;
  return tailLines.some((line) => promptOnlyPattern.test(line));
}

/** 완료 재검사 타이머 실행 */
function scheduleCompletionRecheck(state: ProcessingState, checkFn: () => void): void {
  if (state.completionRecheckTimer) {
    clearTimeout(state.completionRecheckTimer);
  }
  state.completionRecheckTimer = setTimeout(() => {
    checkFn();
  }, QUIET_RECHECK_MS);
}

/** 완료 재검사 타이머 정리 */
function clearCompletionRecheck(state: ProcessingState): void {
  if (state.completionRecheckTimer) {
    clearTimeout(state.completionRecheckTimer);
    state.completionRecheckTimer = null;
  }
}

/** 완화된 idle 프롬프트 감지 (조용한 상태에서 보조 판정용) */
function detectRelaxedIdlePrompt(cleanText: string): boolean {
  const lastChunk = cleanText.slice(-5000);
  const lines = lastChunk.split('\n').map((line) => line.trim()).slice(-120);
  const recentWindow = lines.slice(-16).join('\n');
  if (hasOngoingThinkingActivity(recentWindow)) return false;

  // Strict prompt line OR known idle hints shown when input is ready
  const strictPrompt = lines.some((line) => /^(?:claude\s*)?[>❯$]\s*$/i.test(line));
  if (strictPrompt) return true;

  return lines.some((line) => /(ctrl\+g to edit|Enter your message|Type a message|What would you like to do)/i.test(line));
}

export function detectIdlePromptWithRelaxedFallback(cleanText: string): boolean {
  return detectIdlePromptForCompletion(cleanText) || detectRelaxedIdlePrompt(cleanText);
}

/** data 이벤트 없이 출력이 멈춘 경우 완료 상태 재검사 */
function shouldRunQuietRecheck(state: ProcessingState): boolean {
  return Date.now() - state.lastOutputAt >= QUIET_RECHECK_MS;
}

function hasTableLayout(text: string): boolean {
  if (!text) return false;
  if (/[┌┬┐├┼┤└┴┘│]/.test(text)) return true;
  const lines = text.split('\n');
  let pipeLikeLines = 0;
  for (const line of lines) {
    if (/\|/.test(line)) pipeLikeLines++;
    if (pipeLikeLines >= 3) return true;
  }
  return false;
}

export function shouldForceCompletionOnQuiet(
  cleanText: string,
  submittedAt: number,
  lastOutputAt: number,
  now: number,
): boolean {
  if (now - submittedAt < MIN_EXECUTION_MS) return false;
  if (now - lastOutputAt < QUIET_RECHECK_MS) return false;
  return detectIdlePromptWithRelaxedFallback(cleanText) || detectCompletionPattern(cleanText);
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

  // 결과가 비어 있을 때만 TUI 필터 없는 marker fallback을 사용한다.
  // 짧지만 유효한 응답(SMOKE_OK 등)을 footer chrome으로 오염시키지 않기 위함이다.
  if (result.length === 0) {
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
  // Keep alignment if output includes table-like layout.
  if (!hasTableLayout(result)) {
    result = result.replace(/ {4,}/g, ' ');
  }
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

export class PtyWorker {
  private pty: PtySessionHandle | null = null;
  private state: { phase: 'idle' } | ProcessingState = { phase: 'idle' };
  private idleBuffer = '';
  private ready = false;
  private readyResolve: (() => void) | null = null;
  private initFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private localInputTracker = new PtyLocalInputTracker();
  private stdinBridge: PtyStdinBridge;
  private readonly sessionAdapter: PtySessionAdapterLike;
  private readonly terminalBridge: PtyTerminalBridge;

  constructor(private options: PtyWorkerOptions) {
    this.sessionAdapter = options.sessionAdapter ?? new PtySessionAdapter();
    this.terminalBridge = options.terminalBridge ?? new PtyTerminalBridge();
    this.stdinBridge = new PtyStdinBridge({
      writeToPty: (data: string) => {
        this.pty?.write(data);
      },
      exitWorker: () => {
        if (this.options.onExit) {
          this.options.onExit();
        } else {
          process.exit(0);
        }
      },
      handleLocalInput: this.options.onLocalInput
        ? (decoded: string) => {
            this.localInputTracker.consume(decoded, {
              isIdle: () => this.state.phase === 'idle',
              forceCompleteIfSettling: () => this.forceCompleteIfSettling(),
              onCommand: (line: string) => {
                this.options.onLocalInput?.(line);
              },
            });
          }
        : undefined,
    });
  }

  // ──────────────────────────────────────
  // Public API
  // ──────────────────────────────────────

  async start(): Promise<void> {
    const { cols, rows } = this.terminalBridge.getInitialSize(this.options.cols, this.options.rows);

    this.pty = await this.sessionAdapter.startSession({
      projectPath: this.options.projectPath,
      trustMode: this.options.trustMode,
      cols,
      rows,
      onData: (data: string) => {
        this.terminalBridge.writeOutput(data);
        this.options.onData?.(data);
        this.idleBuffer += data;

        if (this.state.phase === 'processing' && this.state.submitted) {
          this.state.buffer += data;
          this.state.lastOutputAt = Date.now();

          if (hasBackgroundAgentActivity(data)) {
            this.state.hasBackgroundAgents = true;
            this.state.lastAgentActivityAt = Date.now();
            if (this.state.settleTimer) {
              clearTimeout(this.state.settleTimer);
              this.state.settleTimer = null;
            }
          }

          this.checkCompletion();
          this.armCompletionRecheck();
        }

        if (!this.ready) {
          if (!this.initFallbackTimer) {
            this.initFallbackTimer = setTimeout(() => {
              if (!this.ready) {
                if (!this.terminalBridge.isAttachedToTty()) {
                  process.stderr.write('[PTY] Claude CLI active for 15s — marking ready (time-based fallback)\n');
                }
                this.ready = true;
                this.readyResolve?.();
                this.options.onReady?.();
              }
              this.initFallbackTimer = null;
            }, TIME_BASED_READY_MS);
          }

          const clean = stripAnsi(this.idleBuffer);
          if (this.detectIdlePrompt(clean)) {
            if (this.initFallbackTimer) {
              clearTimeout(this.initFallbackTimer);
              this.initFallbackTimer = null;
            }
            if (!this.terminalBridge.isAttachedToTty()) {
              process.stderr.write('[PTY] Idle prompt detected — ready (pattern match)\n');
            }
            this.ready = true;
            this.readyResolve?.();
            this.options.onReady?.();
          }
        }
      },
      onExit: ({ exitCode }) => {
        if (this.initFallbackTimer) {
          clearTimeout(this.initFallbackTimer);
          this.initFallbackTimer = null;
        }
        if (this.state.phase === 'processing') {
          this.clearTimers();
          this.state.reject(new Error(`Claude CLI가 예기치 않게 종료됨 (code: ${exitCode})`));
          this.state = { phase: 'idle' };
        }
        this.detachTerminal();
        this.pty = null;
      },
    });

    this.terminalBridge.attach({
      session: this.pty,
      stdinBridge: this.stdinBridge,
    });

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
        lastOutputAt: startTime,
        completionRecheckTimer: null,
      };

      // 1단계: 프롬프트 텍스트 입력
      this.pty!.write(prompt);

      // 2단계: 별도 이벤트로 Enter 전송
      setTimeout(() => {
        if (this.pty && this.state.phase === 'processing') {
          this.pty.write('\r');
          (this.state as ProcessingState).submitted = true;
          (this.state as ProcessingState).submittedAt = Date.now();
          this.armCompletionRecheck();
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

  sendInput(data: string): void {
    if (!this.pty || !data) return;
    this.pty.write(data);
  }

  /**
   * Start monitoring for task completion without writing to PTY.
   * Used when input has already been sent via sendInput() (terminal mode).
   * Reuses the same completion detection logic as executeTask().
   */
  monitorForCompletion(prompt: string): Promise<TaskResult> {
    if (this.state.phase !== 'idle') {
      throw new Error('이미 작업 진행 중입니다');
    }
    if (!this.pty) {
      throw new Error('PTY가 시작되지 않았습니다');
    }

    return new Promise<TaskResult>((resolve, reject) => {
      const now = Date.now();

      this.state = {
        phase: 'processing',
        prompt,
        startTime: now,
        buffer: '',
        resolve,
        reject,
        settleTimer: null,
        submitted: true,
        submittedAt: now,
        hasBackgroundAgents: false,
        lastAgentActivityAt: 0,
        lastOutputAt: now,
        completionRecheckTimer: null,
      };

      this.armCompletionRecheck();
    });
  }

  resize(cols: number, rows: number): void {
    if (!this.pty) return;
    if (!Number.isFinite(cols) || !Number.isFinite(rows)) return;
    const safeCols = Math.max(20, Math.floor(cols));
    const safeRows = Math.max(8, Math.floor(rows));
    this.pty.resize(safeCols, safeRows);
  }

  destroy(): void {
    if (this.state.phase === 'processing') {
      this.clearTimers();
    }
    if (this.initFallbackTimer) {
      clearTimeout(this.initFallbackTimer);
      this.initFallbackTimer = null;
    }
    this.detachTerminal();
    this.pty?.kill();
    this.pty = null;
    this.state = { phase: 'idle' };
  }

  // ──────────────────────────────────────
  // Private: stdin management
  // ──────────────────────────────────────

  private detachTerminal(): void {
    this.terminalBridge.detach();
    this.stdinBridge.reset();
    this.localInputTracker.reset();
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

    // Terminal-text completion remains a compatibility fallback only.
    // Structured task state/reporting is authoritative.
    // Check strict idle prompt patterns first, then allow quiet fallback.
    const hasIdlePrompt = detectIdlePromptForCompletion(clean);
    const hasCompletionText = detectCompletionPattern(clean);
    const forceByQuiet = shouldForceCompletionOnQuiet(
      clean,
      this.state.submittedAt,
      this.state.lastOutputAt,
      now,
    );

    // Idle prompt만으로 완료 판단할 때는 출력이 잠잠해질 때까지 대기.
    if (hasIdlePrompt && !hasCompletionText && !forceByQuiet && now - this.state.lastOutputAt < 2_000) {
      if (this.state.settleTimer) {
        clearTimeout(this.state.settleTimer);
        this.state.settleTimer = null;
      }
      return;
    }

    if (hasIdlePrompt || hasCompletionText || forceByQuiet) {
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

  /**
   * Force-complete the current task if a settle timer is active.
   * Called when the user presses Enter in the local terminal while Claude
   * has already responded (settle window). Allows the new input to be
   * tracked as a fresh task for cross-channel sync (Telegram/Dashboard).
   * Returns true if the task was force-completed.
   */
  forceCompleteIfSettling(): boolean {
    if (this.state.phase !== 'processing') return false;
    if (!this.state.settleTimer) return false;
    // Cancel settle timer and force-complete (skip quality checks —
    // user moving on means whatever result we have is the final result)
    clearTimeout(this.state.settleTimer);
    this.state.settleTimer = null;
    this.completeTask(true);
    // After completeTask(force=true), phase has transitioned to 'idle'.
    // TypeScript cannot track the mutation inside the called method,
    // so we avoid the narrowing error by not comparing the narrowed type.
    return true;
  }

  private completeTask(force = false): void {
    if (this.state.phase !== 'processing') return;

    const result = this.extractResult();
    const durationMs = Date.now() - this.state.startTime;

    // Quality checks — skip when forced (user explicitly moved on to next task)
    if (!force) {
      // 결과 품질 검증: 결과가 너무 짧고 실행 시간이 30초 미만이면 재대기
      if (result.length < 20 && durationMs < 30_000) {
        if (this.state.settleTimer) {
          clearTimeout(this.state.settleTimer);
          this.state.settleTimer = null;
        }
        // completionRecheck가 settleTimer 등록 시점에 중단되었으므로 재등록
        this.armCompletionRecheck();
        return;
      }

      // 추가: 백그라운드 에이전트가 있었는데 결과가 50자 미만이면 재대기
      if (this.state.hasBackgroundAgents && result.length < 50) {
        if (this.state.settleTimer) {
          clearTimeout(this.state.settleTimer);
          this.state.settleTimer = null;
        }
        // completionRecheck가 settleTimer 등록 시점에 중단되었으므로 재등록
        this.armCompletionRecheck();
        return;
      }
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
    clearCompletionRecheck(this.state);
  }

  private armCompletionRecheck(): void {
    if (this.state.phase !== 'processing') return;
    const recheck = () => {
      if (this.state.phase !== 'processing') return;
      if (!shouldRunQuietRecheck(this.state)) return;
      this.checkCompletion();
      // Keep checking while output is quiet until task is completed.
      if (this.state.phase === 'processing' && !this.state.settleTimer) {
        scheduleCompletionRecheck(this.state, recheck);
      }
    };
    scheduleCompletionRecheck(this.state, recheck);
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
