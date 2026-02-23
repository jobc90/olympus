import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';

interface PtyTerminalProps {
  workerName: string;
  output: string;
  connected: boolean;
  accentColor?: string;
  heightClass?: string;
  onInput: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
}

const FONT_FAMILY = 'SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

export function PtyTerminal({
  workerName,
  output,
  connected,
  accentColor,
  heightClass = 'h-[260px]',
  onInput,
  onResize,
}: PtyTerminalProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const previousOutputRef = useRef('');
  const connectedRef = useRef(connected);
  const onInputRef = useRef(onInput);
  const onResizeRef = useRef(onResize);
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);

  useEffect(() => {
    connectedRef.current = connected;
  }, [connected]);

  useEffect(() => {
    onInputRef.current = onInput;
  }, [onInput]);

  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    previousOutputRef.current = '';
    lastSizeRef.current = null;

    const term = new Terminal({
      cursorBlink: true,
      convertEol: false,
      scrollback: 5000,
      allowTransparency: true,
      fontSize: 12,
      fontFamily: FONT_FAMILY,
      lineHeight: 1.25,
      theme: {
        background: '#0B1020',
        foreground: '#E8ECF2',
        cursor: accentColor ?? '#7DD3FC',
        black: '#0B1020',
        red: '#FF6B6B',
        green: '#4ADE80',
        yellow: '#FACC15',
        blue: '#60A5FA',
        magenta: '#E879F9',
        cyan: '#22D3EE',
        white: '#E8ECF2',
        brightBlack: '#475569',
        brightRed: '#FB7185',
        brightGreen: '#86EFAC',
        brightYellow: '#FDE047',
        brightBlue: '#93C5FD',
        brightMagenta: '#F0ABFC',
        brightCyan: '#67E8F9',
        brightWhite: '#F8FAFC',
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(host);
    fitAddon.fit();
    term.focus();
    term.onData((data) => {
      if (connectedRef.current) onInputRef.current(data);
    });

    let resizeRaf: number | null = null;
    const sendResize = () => {
      fitAddon.fit();
      const cols = term.cols;
      const rows = term.rows;
      const prevSize = lastSizeRef.current;
      if (!prevSize || prevSize.cols !== cols || prevSize.rows !== rows) {
        lastSizeRef.current = { cols, rows };
        if (connectedRef.current) {
          onResizeRef.current?.(cols, rows);
        }
      }
    };
    const scheduleResize = () => {
      if (resizeRaf !== null) return;
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = null;
        sendResize();
      });
    };
    scheduleResize();

    // Render already-buffered output on first mount.
    if (output) {
      term.write(output);
      previousOutputRef.current = output;
    } else {
      previousOutputRef.current = '';
    }

    const observer = new ResizeObserver(() => scheduleResize());
    observer.observe(host);

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    return () => {
      if (resizeRaf !== null) {
        cancelAnimationFrame(resizeRaf);
      }
      observer.disconnect();
      terminalRef.current = null;
      fitAddonRef.current = null;
      term.dispose();
    };
  }, [accentColor, workerName]);

  useEffect(() => {
    const term = terminalRef.current;
    if (!term) return;

    const prev = previousOutputRef.current;
    if (output === prev) return;

    if (output.startsWith(prev)) {
      const delta = output.slice(prev.length);
      if (delta) term.write(delta);
    } else {
      // Handle front-trimmed ring buffer without resetting terminal each chunk.
      const maxOverlap = Math.min(prev.length, output.length, 8192);
      let overlap = 0;
      for (let size = maxOverlap; size > 0; size--) {
        if (prev.endsWith(output.slice(0, size))) {
          overlap = size;
          break;
        }
      }
      if (overlap > 0) {
        const delta = output.slice(overlap);
        if (delta) term.write(delta);
      } else {
        term.reset();
        if (output) term.write(output);
      }
    }
    previousOutputRef.current = output;
  }, [output]);

  const sendKey = (data: string) => {
    if (!connected) return;
    onInput(data);
    terminalRef.current?.focus();
  };

  return (
    <div className="rounded-lg border" style={{ borderColor: 'var(--border)', backgroundColor: '#0B1020' }}>
      <div
        className="flex items-center justify-between px-2 py-1 border-b"
        style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(15, 23, 42, 0.85)' }}
      >
        <div className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
          {workerName} PTY
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="text-[10px] font-mono px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onClick={() => sendKey('\u001b[A')}
            title="Arrow Up"
          >
            ↑
          </button>
          <button
            type="button"
            className="text-[10px] font-mono px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onClick={() => sendKey('\u001b[B')}
            title="Arrow Down"
          >
            ↓
          </button>
          <button
            type="button"
            className="text-[10px] font-mono px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onClick={() => sendKey('\t')}
            title="Tab"
          >
            Tab
          </button>
          <button
            type="button"
            className="text-[10px] font-mono px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onClick={() => sendKey('\r')}
            title="Enter"
          >
            Enter
          </button>
          <button
            type="button"
            className="text-[10px] font-mono px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onClick={() => sendKey('\u0003')}
            title="Ctrl+C"
          >
            Ctrl+C
          </button>
        </div>
      </div>

      <div
        ref={hostRef}
        className={`${heightClass} w-full`}
        onClick={() => terminalRef.current?.focus()}
        role="presentation"
      />
    </div>
  );
}
