export interface PtyLocalInputTrackerCallbacks {
  isIdle: () => boolean;
  forceCompleteIfSettling: () => boolean;
  onCommand: (line: string) => void;
}

export class PtyLocalInputTracker {
  private buffer = '';
  private inBracketPaste = false;

  consume(decoded: string, callbacks: PtyLocalInputTrackerCallbacks): void {
    if (decoded.includes('\x1b[200~')) {
      this.inBracketPaste = true;
      this.buffer = '';
    }

    if (decoded.includes('\x1b[201~')) {
      this.inBracketPaste = false;
      this.buffer = '';
      return;
    }

    if (decoded.includes('\x1b')) {
      this.buffer = '';
      return;
    }

    if (this.inBracketPaste) return;

    for (const ch of decoded) {
      const code = ch.codePointAt(0) ?? 0;
      if (ch === '\r' || ch === '\n') {
        const trimmed = this.buffer.trim();
        this.buffer = '';
        if (trimmed.length >= 2 && !trimmed.startsWith('\x1b')) {
          const forceCompleted = callbacks.forceCompleteIfSettling();
          if (callbacks.isIdle() || forceCompleted) {
            callbacks.onCommand(trimmed);
          }
        }
      } else if (ch === '\x7f' || ch === '\b') {
        this.buffer = this.buffer.slice(0, -1);
      } else if (code >= 32) {
        this.buffer += ch;
      } else {
        this.buffer = '';
      }
    }
  }

  reset(): void {
    this.buffer = '';
    this.inBracketPaste = false;
  }
}
