import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import { statSync, openSync, readSync, closeSync } from 'node:fs';

/**
 * OutputMonitor — Claude CLI 응답 완료 감지
 *
 * pipe-pane을 통해 tmux 세션 출력을 로그 파일로 캡처하고,
 * 500ms 폴링으로 신규 출력을 감지하여 이벤트로 전파한다.
 *
 * 완료 감지 알고리즘:
 * 1. COMPLETION_SIGNALS 매치 → 즉시 prompt-detected
 * 2. PROMPT_PATTERNS 매치 + BUSY_PATTERNS 없음 → prompt-detected
 * 3. 10초 무출력 → prompt-detected (타임아웃 폴백)
 *
 * Events:
 * - 'output'          — 필터링된 신규 출력
 * - 'prompt-detected' — Claude가 응답 완료하여 프롬프트 복귀
 * - 'error'           — 에러 발생
 */
export class OutputMonitor extends EventEmitter {
  private logPath: string;
  private offset: number = 0;
  private poller: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastOutputTime: number = 0;
  private _running = false;

  static readonly POLL_INTERVAL = 500;
  static readonly NO_OUTPUT_TIMEOUT = 10_000;
  static readonly DEBOUNCE_MS = 1000;
  static readonly MID_STREAM_FLUSH_INTERVAL = 5000;

  static readonly PROMPT_PATTERNS: RegExp[] = [
    /❯\s*$/m,
    /^\s*❯\s+/m,
    /\$\s*$/m,
  ];

  static readonly BUSY_PATTERNS: RegExp[] = [
    /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/,
    /[✶✳✢✻✽·]/,
    /\(thinking\)/i,
    /Working\.\.\./i,
    /Reading\.\.\./i,
    /Searching\.\.\./i,
  ];

  static readonly COMPLETION_SIGNALS: RegExp[] = [
    /⏺\s*(Done|완료|Finished)/i,
    /✅\s*(All|모든).*pass/i,
    /Build\s+succeeded/i,
    /test.*\d+\s+pass/i,
  ];

  /** ANSI escape sequences */
  private static readonly ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?\x07/g;

  /** Noise patterns to filter out */
  private static readonly NOISE_PATTERNS: RegExp[] = [
    /^🤖.*📁.*🔷.*💎/,
    /^\d[\d,]* tokens.*\$[\d.]+/,
    /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/,
    /^❯\s*$/,
    /^❯\s+.*/,
    /Thinking\.\.\./i,
    /Working\.\.\./i,
  ];

  constructor(
    public readonly sessionId: string,
    private tmuxSession: string,
    logPath: string,
  ) {
    super();
    this.logPath = logPath;
  }

  get running(): boolean {
    return this._running;
  }

  start(): void {
    if (this._running) return;

    // Start pipe-pane
    try {
      execFileSync('tmux', [
        'pipe-pane', '-t', this.tmuxSession, '-o', `cat >> "${this.logPath}"`,
      ], { stdio: 'pipe' });
    } catch {
      this.emit('error', `pipe-pane 시작 실패: ${this.tmuxSession}`);
      return;
    }

    // Skip existing content
    try {
      this.offset = statSync(this.logPath).size;
    } catch { /* file doesn't exist yet */ }

    this._running = true;
    this.poller = setInterval(() => this.poll(), OutputMonitor.POLL_INTERVAL);
  }

  stop(): void {
    this._running = false;
    if (this.poller) {
      clearInterval(this.poller);
      this.poller = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    try {
      execFileSync('tmux', ['pipe-pane', '-t', this.tmuxSession], { stdio: 'pipe' });
    } catch { /* already stopped */ }
  }

  private poll(): void {
    try {
      const stats = statSync(this.logPath);
      if (stats.size <= this.offset) {
        // No new output — check timeout
        if (this.lastOutputTime > 0 &&
            Date.now() - this.lastOutputTime > OutputMonitor.NO_OUTPUT_TIMEOUT) {
          this.emit('prompt-detected');
          this.lastOutputTime = 0;
        }
        return;
      }

      // Read new content from offset
      const bytesToRead = stats.size - this.offset;
      const buffer = Buffer.alloc(bytesToRead);
      const fd = openSync(this.logPath, 'r');
      try {
        readSync(fd, buffer, 0, bytesToRead, this.offset);
      } finally {
        closeSync(fd);
      }

      const newContent = buffer.toString('utf-8');
      this.offset = stats.size;
      this.lastOutputTime = Date.now();

      // Filter noise
      const filtered = this.filterOutput(newContent);
      if (!filtered || filtered.trim().length < 5) {
        // Still check for prompt in raw content
        this.checkCompletion(newContent);
        return;
      }

      // Emit debounced output
      this.emitDebounced('output', filtered);

      // Check completion
      this.checkCompletion(newContent);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      this.emit('error', (err as Error).message);
    }
  }

  private checkCompletion(rawContent: string): void {
    // 1. Completion signals — immediate
    for (const pattern of OutputMonitor.COMPLETION_SIGNALS) {
      if (pattern.test(rawContent)) {
        this.emit('prompt-detected');
        return;
      }
    }

    // 2. Prompt patterns (check raw content for ANSI-decorated prompts)
    for (const pattern of OutputMonitor.PROMPT_PATTERNS) {
      if (pattern.test(rawContent)) {
        const isBusy = OutputMonitor.BUSY_PATTERNS.some(p => p.test(rawContent));
        if (!isBusy) {
          this.emit('prompt-detected');
          return;
        }
      }
    }
  }

  private emitDebounced(event: string, content: string): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.emit(event, content);
    }, OutputMonitor.DEBOUNCE_MS);
  }

  filterOutput(content: string): string {
    // Strip ANSI
    let cleaned = content.replace(OutputMonitor.ANSI_REGEX, '');

    // Filter noise lines
    const lines = cleaned.split('\n');
    const filtered = lines.filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      return !OutputMonitor.NOISE_PATTERNS.some(p => p.test(trimmed));
    });

    // Remove consecutive blank lines
    cleaned = filtered.join('\n').replace(/\n{3,}/g, '\n\n');

    return cleaned;
  }
}
