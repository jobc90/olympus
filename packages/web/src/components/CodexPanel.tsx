import React, { useState, useCallback } from 'react';
import { Card, CardHeader } from './Card';

interface CodexResponse {
  requestId: string;
  decision: {
    type: string;
    targetSessions: string[];
    processedInput: string;
    confidence: number;
    reason: string;
  };
  response?: {
    type: string;
    content: string;
    metadata: Record<string, unknown>;
    rawOutput: string;
    agentInsight?: string;
  };
}

interface CodexPanelProps {
  connected: boolean;
  onRoute: (text: string) => Promise<CodexResponse | null>;
}

const DECISION_ICONS: Record<string, string> = {
  SELF_ANSWER: '🧠',
  FORWARD: '📤',
  MULTI_SESSION: '📡',
  STATUS: '📊',
};

export function CodexPanel({ connected, onRoute }: CodexPanelProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<Array<{ query: string; result: CodexResponse; ts: number }>>([]);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setLoading(true);
    setError(null);
    try {
      const result = await onRoute(text);
      if (result) {
        setHistory(prev => [{ query: text, result, ts: Date.now() }, ...prev].slice(0, 20));
      }
      setInput('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [input, loading, onRoute]);

  return (
    <Card>
      <CardHeader>Codex Q&amp;A</CardHeader>

      {/* Input */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder={connected ? 'Ask Codex...' : 'Not connected'}
          disabled={!connected || loading}
          className="flex-1 bg-surface-hover border border-border rounded px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary"
        />
        <button
          onClick={handleSubmit}
          disabled={!connected || loading || !input.trim()}
          className="px-3 py-1.5 bg-primary text-white text-sm rounded hover:bg-primary/80 disabled:opacity-40 transition-colors"
        >
          {loading ? '...' : 'Ask'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="text-xs text-error mb-2">{error}</div>
      )}

      {/* History */}
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {history.map((item) => (
          <div key={item.result.requestId} className="bg-surface-hover rounded p-2 text-xs">
            <div className="flex items-center gap-1 mb-1">
              <span className="text-text-muted">Q:</span>
              <span className="text-text-primary font-medium">{item.query}</span>
            </div>
            <div className="flex items-center gap-1 mb-1">
              <span>{DECISION_ICONS[item.result.decision.type] ?? '🔹'}</span>
              <span className="text-primary">{item.result.decision.type}</span>
              <span className="text-text-muted ml-auto">
                {Math.round(item.result.decision.confidence * 100)}%
              </span>
            </div>
            {item.result.response && (
              <div className="mt-1 text-text-secondary whitespace-pre-wrap break-words">
                {item.result.response.content.slice(0, 500)}
                {item.result.response.content.length > 500 && '...'}
              </div>
            )}
            {item.result.response?.agentInsight && (
              <div className="mt-1 text-text-muted italic">
                {item.result.response.agentInsight}
              </div>
            )}
          </div>
        ))}
        {history.length === 0 && (
          <p className="text-xs text-text-muted text-center py-4">
            Ask a question to route through Codex Orchestrator
          </p>
        )}
      </div>
    </Card>
  );
}
