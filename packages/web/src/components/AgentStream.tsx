import React, { useRef, useEffect } from 'react';

interface Props {
  agentStreams: Map<string, string>;
}

const AGENT_COLORS: Record<string, string> = {
  gemini: 'text-blue-400',
  gpt: 'text-green-400',
};

export function AgentStream({ agentStreams }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  });

  if (agentStreams.size === 0) return null;

  return (
    <div className="bg-gray-800/50 rounded-lg p-4">
      <h2 className="text-sm font-semibold text-gray-400 mb-2">AGENT OUTPUT</h2>
      <div ref={scrollRef} className="max-h-64 overflow-y-auto space-y-2">
        {[...agentStreams.entries()].map(([id, content]) => (
          <div key={id}>
            <span className={`text-xs font-bold ${AGENT_COLORS[id] ?? 'text-purple-400'}`}>
              {id.toUpperCase()}
            </span>
            <pre className="text-xs text-gray-300 whitespace-pre-wrap mt-1 font-mono">
              {content.slice(-500)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
