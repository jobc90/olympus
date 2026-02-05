import React, { useRef, useEffect, useState } from 'react';
import { Card, CardHeader } from './Card';

interface Props {
  agentStreams: Map<string, string>;
}

const AGENT_CONFIG: Record<string, { name: string; color: string; bgColor: string; icon: string }> = {
  gemini: {
    name: 'Gemini',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
    icon: '💎',
  },
  gpt: {
    name: 'GPT',
    color: 'text-green-400',
    bgColor: 'bg-green-400/10',
    icon: '🤖',
  },
  claude: {
    name: 'Claude',
    color: 'text-secondary',
    bgColor: 'bg-secondary/10',
    icon: '⚡',
  },
  codex: {
    name: 'Codex',
    color: 'text-purple-400',
    bgColor: 'bg-purple-400/10',
    icon: '📝',
  },
};

export function AgentStream({ agentStreams }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [autoScroll, agentStreams.size]);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScroll(isAtBottom);
    }
  };

  if (agentStreams.size === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader
        action={
          <button
            onClick={() => {
              setAutoScroll(true);
              if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
              }
            }}
            className={`text-xs transition-colors ${
              autoScroll ? 'text-text-muted' : 'text-primary hover:text-primary-dim'
            }`}
          >
            {autoScroll ? 'Auto-scroll ON' : 'Scroll to bottom'}
          </button>
        }
      >
        Agent Output
      </CardHeader>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="max-h-72 overflow-y-auto space-y-3"
      >
        {[...agentStreams.entries()].map(([id, content]) => {
          const config = AGENT_CONFIG[id.toLowerCase()] ?? {
            name: id.toUpperCase(),
            color: 'text-primary',
            bgColor: 'bg-primary/10',
            icon: '🔧',
          };

          return (
            <div key={id} className="space-y-1">
              <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full ${config.bgColor}`}>
                <span>{config.icon}</span>
                <span className={`text-xs font-semibold ${config.color}`}>
                  {config.name}
                </span>
              </div>

              <pre className="text-xs text-text-secondary whitespace-pre-wrap font-mono bg-background/50 rounded-lg p-3 overflow-x-auto">
                {content.slice(-1000)}
              </pre>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
