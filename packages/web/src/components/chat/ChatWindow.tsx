import { useState, useRef, useEffect } from 'react';

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: number;
}

interface ChatWindowProps {
  agentId: string;
  agentName: string;
  agentEmoji?: string;
  agentColor?: string;
  messages: ChatMessage[];
  onSend: (agentId: string, message: string) => void;
  onClose: () => void;
}

export default function ChatWindow({
  agentId,
  agentName,
  agentEmoji = '\u{1F916}',
  agentColor = '#4FC3F7',
  messages,
  onSend,
  onClose,
}: ChatWindowProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const userSentRef = useRef(false);
  const prevMessageCountRef = useRef(0);

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
    if (e.key === 'Enter' && !e.shiftKey) {
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

      {/* Chat panel */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 flex flex-col border-l shadow-2xl"
        style={{
          width: 384,
          background: 'var(--bg-primary)',
          borderColor: 'var(--border)',
          animation: 'slide-in 0.3s ease-out',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
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
            \u2715
          </button>
        </div>

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
                <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
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
              \u2191
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
