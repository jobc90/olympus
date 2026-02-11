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
  inactivityTimer: ReturnType<typeof setTimeout> | null;
  maxTimer: ReturnType<typeof setTimeout>;
  settleTimer: ReturnType<typeof setTimeout> | null;
  submitted: boolean;
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

/** 비활동 타임아웃: 의미있는 출력이 없으면 완료로 간주 */
const INACTIVITY_TIMEOUT_MS = 20_000;

/** 비활동 2차 타임아웃: 패턴 미매칭 시 강제 완료 */
const INACTIVITY_FORCE_MS = 30_000;

/** 프롬프트 감지 후 추가 대기 */
const SETTLE_MS = 3_000;

/** 절대 최대 타임아웃 */
const MAX_TASK_TIMEOUT_MS = 30 * 60 * 1000; // 30분

/** 준비 상태 대기 최대 시간 */
const READY_TIMEOUT_MS = 60_000;

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
  /ctrl\+g to edit/i,           // Claude CLI v2.x 유휴 상태 표시
  /shift\+tab to cycle/i,      // 권한 모드 표시 (유휴 시 보임)
  /> \s*$/,                     // ">" 프롬프트 (뒤 공백/개행 허용)
  /❯ \s*$/,                     // "❯" 프롬프트 (뒤 공백/개행 허용)
  /\$ \s*$/,                    // "$" 프롬프트 (뒤 공백/개행 허용)
  /^>\s*$/m,                    // 줄 시작에 ">"만 있는 경우
  /^❯\s*$/m,                    // 줄 시작에 "❯"만 있는 경우
  /Enter your message/i,
  /Type a message/i,
  /What would you like to do/i,
  /bypass\s*permissions?\s*(?:on|off)/i,  // 유휴 시에만 보이는 권한 상태
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

/** 상태바 업데이트 감지 (비활동 타이머를 리셋하지 않을 데이터) */
function isStatusBarUpdate(data: string): boolean {
  const clean = stripAnsi(data).trim();
  if (!clean) return true;
  return TUI_CHROME_PATTERNS.some(p => p.test(clean));
}

// ──────────────────────────────────────────────
// Standalone Detection Functions (테스트용 export)
// ──────────────────────────────────────────────

/** 유휴 프롬프트 감지 (standalone) */
export function detectIdlePrompt(cleanText: string): boolean {
  const lastChunk = cleanText.slice(-2000);
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
  // 아주 짧은 영문 프래그먼트 (3자 이하, 한국어 아님)
  if (trimmed.length <= 3 && !/[가-힣]/.test(trimmed) && !/^\d+$/.test(trimmed)) return true;
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

  // 커서 이동에 의한 과다 공백 정리
  result = result.replace(/ {4,}/g, ' ');
  result = result.replace(/\n{3,}/g, '\n\n');

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
  private pty: { write: (data: string) => void; kill: () => void; onData: { (handler: (data: string) => void): { dispose: () => void } }; onExit: { (handler: (e: { exitCode: number }) => void): { dispose: () => void } }; resize: (cols: number, rows: number) => void } | null = null;
  private state: { phase: 'idle' } | ProcessingState = { phase: 'idle' };
  private idleBuffer = '';
  private ready = false;
  private readyResolve: (() => void) | null = null;
  private stdinHandler: ((data: Buffer) => void) | null = null;
  private originalRawMode: boolean | undefined;
  private lastCtrlC = 0;

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
        this.checkCompletion();
        if (!isStatusBarUpdate(data)) {
          this.resetInactivityTimer();
        }
      }

      if (!this.ready) {
        const clean = stripAnsi(this.idleBuffer);
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
          // 첫 Ctrl+C → Claude CLI에 전달 (작업 중단)
        }

        this.pty.write(data.toString());
      };
      process.stdin.on('data', this.stdinHandler);
    }

    // 터미널 리사이즈 핸들링
    process.stdout.on('resize', () => {
      if (this.pty && process.stdout.columns && process.stdout.rows) {
        this.pty.resize(process.stdout.columns, process.stdout.rows);
      }
    });

    // 유휴 프롬프트가 나타날 때까지 대기
    await new Promise<void>((resolve) => {
      this.readyResolve = resolve;

      const timeout = setTimeout(() => {
        if (!this.ready) {
          this.ready = true;
          resolve();
        }
      }, READY_TIMEOUT_MS);

      if (this.ready) {
        clearTimeout(timeout);
        resolve();
      }
    });

    this.idleBuffer = '';
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

      const maxTimer = setTimeout(() => {
        if (this.state.phase === 'processing') {
          const result = this.extractResult();
          this.clearTimers();
          this.state = { phase: 'idle' };
          resolve({
            success: true,
            text: result || '(작업 시간 초과 — 30분)',
            durationMs: Date.now() - startTime,
          });
        }
      }, MAX_TASK_TIMEOUT_MS);

      this.state = {
        phase: 'processing',
        prompt,
        startTime,
        buffer: '',
        resolve,
        reject,
        inactivityTimer: null,
        maxTimer,
        settleTimer: null,
        submitted: false,
      };

      // 1단계: 프롬프트 텍스트 입력
      this.pty!.write(prompt);

      // 2단계: 별도 이벤트로 Enter 전송
      setTimeout(() => {
        if (this.pty && this.state.phase === 'processing') {
          this.pty.write('\r');
          (this.state as ProcessingState).submitted = true;
          this.resetInactivityTimer();
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
      process.stdin.setRawMode(this.originalRawMode);
    }
  }

  // ──────────────────────────────────────
  // Completion Detection (Private)
  // ──────────────────────────────────────

  private checkCompletion(): void {
    if (this.state.phase !== 'processing') return;

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

  private resetInactivityTimer(): void {
    if (this.state.phase !== 'processing') return;

    if (this.state.inactivityTimer) {
      clearTimeout(this.state.inactivityTimer);
    }

    this.state.inactivityTimer = setTimeout(() => {
      this.onInactivityTimeout();
    }, INACTIVITY_TIMEOUT_MS);
  }

  private onInactivityTimeout(): void {
    if (this.state.phase !== 'processing') return;

    const clean = stripAnsi(this.state.buffer);

    if (this.detectIdlePrompt(clean) || this.detectCompletionPattern(clean)) {
      this.completeTask();
      return;
    }

    // TUI 크롬 비율 기반 유휴 감지: 마지막 영역이 대부분 TUI 크롬이면 유휴 상태
    const lastChunk = clean.slice(-500);
    const lines = lastChunk.split('\n').filter(l => l.trim());
    const chromeLines = lines.filter(l => isTuiChromeLine(l));
    if (lines.length > 0 && chromeLines.length / lines.length > 0.7) {
      this.completeTask();
      return;
    }

    // 추가 대기 후 강제 완료
    this.state.inactivityTimer = setTimeout(() => {
      if (this.state.phase === 'processing') {
        this.completeTask();
      }
    }, INACTIVITY_FORCE_MS - INACTIVITY_TIMEOUT_MS);
  }

  private completeTask(): void {
    if (this.state.phase !== 'processing') return;

    const result = this.extractResult();
    const durationMs = Date.now() - this.state.startTime;
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

    if (this.state.inactivityTimer) clearTimeout(this.state.inactivityTimer);
    if (this.state.settleTimer) clearTimeout(this.state.settleTimer);
    clearTimeout(this.state.maxTimer);
  }

  // ──────────────────────────────────────
  // Pattern Detection (Private)
  // ──────────────────────────────────────

  private detectIdlePrompt(cleanText: string): boolean {
    const lastChunk = cleanText.slice(-2000);
    return IDLE_PROMPT_PATTERNS.some(p => p.test(lastChunk));
  }

  private detectCompletionPattern(cleanText: string): boolean {
    const lastChunk = cleanText.slice(-2000);
    return COMPLETION_PATTERNS.some(p => p.test(lastChunk));
  }

  // ──────────────────────────────────────
  // Result Extraction (Private)
  // ──────────────────────────────────────

  private extractResult(): string {
    if (this.state.phase !== 'processing') return '';
    return extractResultFromBuffer(this.state.buffer, this.state.prompt);
  }
}
