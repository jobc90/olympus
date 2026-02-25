import { useEffect, useRef, useState } from 'react';
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

const FONT_FAMILY = '"JetBrains Mono", SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

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
  // Expose sendResize so the connected-change effect can call it
  const sendResizeRef = useRef<(() => void) | null>(null);
  // Selection mode: suspend PTY mouse-event forwarding, allow drag-to-select
  const [selectionMode, setSelectionMode] = useState(false);
  const selectionModeRef = useRef(selectionMode);

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
    selectionModeRef.current = selectionMode;
  }, [selectionMode]);

  // ─── Terminal init ───────────────────────────────────────────────────────
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
      allowProposedApi: true,
      fontSize: 12,
      fontFamily: FONT_FAMILY,
      lineHeight: 1.25,
      // Faster scroll
      scrollSensitivity: 3,
      fastScrollSensitivity: 10,
      fastScrollModifier: 'shift',
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

    // Send keyboard input to PTY (skip in selection mode or when offline)
    term.onData((data) => {
      if (!connectedRef.current) {
        // Visual flash on the offline banner — handled by React state via ref
        return;
      }
      if (!selectionModeRef.current) {
        onInputRef.current(data);
      }
    });

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
    sendResizeRef.current = sendResize;

    let resizeRaf: number | null = null;
    const scheduleResize = () => {
      if (resizeRaf !== null) return;
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = null;
        sendResize();
      });
    };

    // Initial fit: rAF for immediate layout, + 250ms backup for modal animations
    scheduleResize();
    const delayedFitTimer = setTimeout(sendResize, 250);

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
      if (resizeRaf !== null) cancelAnimationFrame(resizeRaf);
      clearTimeout(delayedFitTimer);
      observer.disconnect();
      sendResizeRef.current = null;
      terminalRef.current = null;
      fitAddonRef.current = null;
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accentColor, workerName]);

  // ─── Sync resize when PTY connection is established ───────────────────────
  // When connected becomes true, force-send current terminal dimensions so the
  // PTY reflects the actual xterm.js viewport (fixes cols-mismatch bugs).
  useEffect(() => {
    if (!connected) return;
    const term = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!term || !fitAddon) return;

    const timer = setTimeout(() => {
      fitAddon.fit();
      // Force-send even if size appears unchanged (PTY may not have our size yet)
      onResizeRef.current?.(term.cols, term.rows);
      lastSizeRef.current = { cols: term.cols, rows: term.rows };
    }, 80);
    return () => clearTimeout(timer);
  }, [connected]);

  // ─── Delta output writer ──────────────────────────────────────────────────
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

  // ─── Selection mode: toggle PTY mouse-event forwarding ───────────────────
  // When the PTY app (Claude CLI) enables mouse reporting (\x1b[?1000h),
  // xterm.js forwards mouse events to PTY, preventing text drag-selection.
  // Selection mode disables onData forwarding and lets the browser handle selection.
  const toggleSelectionMode = () => {
    const next = !selectionMode;
    setSelectionMode(next);
    if (!next) {
      // Restore focus to terminal on exit
      terminalRef.current?.focus();
    }
  };

  const handleSelectAll = () => {
    terminalRef.current?.selectAll();
  };

  return (
    <div className="rounded-lg border h-full flex flex-col" style={{ borderColor: 'var(--border)', backgroundColor: '#0B1020' }}>
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-2 py-1 border-b flex-shrink-0"
        style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(15, 23, 42, 0.85)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-[10px] font-mono truncate" style={{ color: 'var(--text-secondary)' }}>
            {workerName} PTY
          </div>
          <div className="text-[10px] font-mono flex-shrink-0" style={{ color: connected ? '#4ADE80' : '#F87171' }}>
            {connected ? 'CONNECTED' : 'OFFLINE'}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Selection mode hint */}
          {!selectionMode && (
            <span
              className="text-[9px] font-mono hidden sm:block"
              style={{ color: 'var(--text-muted, #475569)' }}
              title="마우스 이벤트가 PTY로 전달되어 드래그 선택이 안 될 경우 선택 모드를 사용하세요"
            >
              Shift+드래그 or
            </span>
          )}

          {/* Selection mode toggle */}
          <button
            onClick={toggleSelectionMode}
            className="text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors"
            style={{
              color: selectionMode ? '#0B1020' : 'var(--text-secondary)',
              backgroundColor: selectionMode ? '#60A5FA' : 'transparent',
              border: `1px solid ${selectionMode ? '#60A5FA' : 'var(--border)'}`,
            }}
            title={selectionMode ? '인터랙티브 모드로 전환 (입력 활성화)' : '선택 모드로 전환 (텍스트 드래그 선택 가능)'}
          >
            {selectionMode ? '✓ 선택 모드' : '선택 모드'}
          </button>

          {/* Select all */}
          <button
            onClick={handleSelectAll}
            className="text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors"
            style={{
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
            title="전체 선택 (Ctrl+A)"
          >
            전체선택
          </button>
        </div>
      </div>

      {/* Offline banner — shown when Gateway disconnected */}
      {!connected && (
        <div
          className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono"
          style={{ backgroundColor: 'rgba(248,113,113,0.1)', borderBottom: '1px solid rgba(248,113,113,0.25)', color: '#F87171' }}
        >
          <span>⚠</span>
          <span>Gateway 연결 끊김 — 키 입력이 전달되지 않습니다</span>
        </div>
      )}

      {/* xterm.js host — stop wheel bubbling to prevent parent scroll stealing */}
      <div
        ref={hostRef}
        className={`${heightClass} w-full flex-1 min-h-0`}
        style={{ cursor: selectionMode ? 'text' : 'default' }}
        onClick={() => {
          if (!selectionMode) terminalRef.current?.focus();
        }}
        onWheel={(e) => {
          // Prevent parent containers from consuming scroll events
          e.stopPropagation();
        }}
        role="presentation"
      />

      {/* Selection mode overlay hint */}
      {selectionMode && (
        <div
          className="flex-shrink-0 px-2 py-1 text-[10px] font-mono text-center"
          style={{ backgroundColor: 'rgba(96,165,250,0.1)', color: '#60A5FA', borderTop: '1px solid rgba(96,165,250,0.3)' }}
        >
          선택 모드 — 텍스트를 드래그하여 선택하세요 · 입력은 비활성화됨 ·{' '}
          <button
            onClick={toggleSelectionMode}
            className="underline"
            style={{ color: '#93C5FD' }}
          >
            인터랙티브 모드 복귀
          </button>
        </div>
      )}
    </div>
  );
}
