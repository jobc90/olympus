import { useState, useRef, useEffect } from 'react';

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: number;
}

interface AgentDetail {
  label: string;
  value: string;
  color?: string;
}

interface ChatWindowProps {
  agentId: string;
  agentName: string;
  agentEmoji?: string;
  agentColor?: string;
  details?: AgentDetail[];
  messages: ChatMessage[];
  onSend: (agentId: string, message: string) => void;
  onClose: () => void;
}

export default function ChatWindow({
  agentId,
  agentName,
  agentEmoji = '\u{1F916}',
  agentColor = '#4FC3F7',
  details,
  messages,
  onSend,
  onClose,
}: ChatWindowProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const userSentRef = useRef(false);
  const prevMessageCountRef = useRef(0);

  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // Smart auto-scroll
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const prevCount = prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;

    // History just loaded — scroll to bottom instantly
    if (prevCount === 0 && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
      return;
    }

    // Always scroll if user just sent a message
    if (userSentRef.current) {
      userSentRef.current = false;
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    // Otherwise, only auto-scroll if near the bottom
    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    userSentRef.current = true;
    onSend(agentId, text);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Chat modal (centered popup) */}
      <div
        className="fixed z-50 flex flex-col rounded-2xl shadow-2xl border"
        style={{
          width: 560,
          height: '70vh',
          maxHeight: 700,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'var(--bg-primary)',
          borderColor: 'var(--border)',
          animation: 'fade-scale-in 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b rounded-t-2xl"
          style={{
            borderColor: 'var(--border)',
            background: `${agentColor}15`,
          }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xl">{agentEmoji}</span>
            <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
              {agentName}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            {'\u2715'}
          </button>
        </div>

        {/* Agent Detail Info */}
        {details && details.length > 0 && (
          <div
            className="px-4 py-3 border-b grid grid-cols-2 gap-x-4 gap-y-1.5"
            style={{ borderColor: 'var(--border)', background: `${agentColor}08` }}
          >
            {details.map((d, i) => (
              <div key={i} className="flex items-center gap-1.5 min-w-0">
                <span className="text-[10px] font-mono flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                  {d.label}
                </span>
                <span
                  className="text-[11px] font-mono truncate"
                  style={{ color: d.color || 'var(--text-primary)' }}
                >
                  {d.value}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Messages */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-sm mt-8" style={{ color: 'var(--text-secondary)' }}>
              <span className="text-3xl block mb-2">{agentEmoji}</span>
              Start a conversation with {agentName}
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
                <div
                  className="max-w-[80%] rounded-2xl px-4 py-2 text-sm"
                  style={
                    msg.role === 'user'
                    ? {
                        background: 'var(--accent-primary)',
                        color: '#fff',
                        borderBottomRightRadius: '0.375rem',
                      }
                    : {
                        background: 'var(--bg-card)',
                        color: 'var(--text-primary)',
                        borderBottomLeftRadius: '0.375rem',
                        border: '1px solid var(--border)',
                    }
                }
              >
                <div
                  style={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`,
                  }}
                >
                  {msg.content}
                </div>
                <div
                  className="text-[10px] mt-1"
                  style={{
                    color: msg.role === 'user' ? 'rgba(255,255,255,0.6)' : 'var(--text-secondary)',
                  }}
                >
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${agentName}...`}
              rows={1}
              className="flex-1 rounded-xl px-4 py-2 text-sm resize-none focus:outline-none"
              style={{
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent-primary)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
            <button
              onClick={handleSend}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
              style={{ background: agentColor, color: '#fff' }}
            >
              {'\u2191'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
