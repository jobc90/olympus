import { useState } from 'react';

interface HistoryItem {
  id: string;
  prompt: string;
  timestamp: string;
  agents: string[];
  status: 'success' | 'error' | 'pending';
  duration: string;
}

export default function HistoryView() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const mockHistory: HistoryItem[] = [
    {
      id: '1',
      prompt: 'Analyze the performance implications of this React component',
      timestamp: '2 hours ago',
      agents: ['claude', 'gpt'],
      status: 'success',
      duration: '3.2s',
    },
    {
      id: '2',
      prompt: 'Refactor this function to use async/await',
      timestamp: '5 hours ago',
      agents: ['claude', 'gpt', 'gemini'],
      status: 'success',
      duration: '4.1s',
    },
    {
      id: '3',
      prompt: 'Write unit tests for the authentication service',
      timestamp: '1 day ago',
      agents: ['gpt'],
      status: 'error',
      duration: '2.8s',
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'text-green-400';
      case 'error':
        return 'text-red-400';
      case 'pending':
        return 'text-yellow-400';
      default:
        return 'text-text-muted';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">History</h1>
          <p className="text-text-muted mt-2">View past AI task executions</p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search history..."
            className="bg-surface border border-border rounded-lg px-4 py-2 text-text placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button className="bg-surface hover:bg-border text-text border border-border px-4 py-2 rounded-lg transition-colors">
            Filter
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="text-2xl font-bold">24</div>
          <div className="text-sm text-text-muted mt-1">Total Runs</div>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="text-2xl font-bold text-green-400">22</div>
          <div className="text-sm text-text-muted mt-1">Successful</div>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="text-2xl font-bold text-red-400">2</div>
          <div className="text-sm text-text-muted mt-1">Failed</div>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="text-2xl font-bold">3.5s</div>
          <div className="text-sm text-text-muted mt-1">Avg Duration</div>
        </div>
      </div>

      <div className="space-y-3">
        {mockHistory.map((item) => (
          <div key={item.id} className="bg-surface border border-border rounded-lg overflow-hidden">
            <div
              className="p-4 cursor-pointer hover:bg-background transition-colors"
              onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="font-medium">{item.prompt}</div>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-text-muted">
                    <span>{item.timestamp}</span>
                    <span className={getStatusColor(item.status)}>{item.status}</span>
                    <span>{item.agents.length} agents</span>
                    <span>{item.duration}</span>
                  </div>
                </div>
                <button className="text-text-muted hover:text-text">
                  {expandedId === item.id ? '▼' : '▶'}
                </button>
              </div>
            </div>

            {expandedId === item.id && (
              <div className="p-4 bg-background border-t border-border space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Agents Used</h4>
                  <div className="flex gap-2">
                    {item.agents.map((agent) => (
                      <span
                        key={agent}
                        className="px-3 py-1 bg-surface rounded-full text-sm border border-border"
                      >
                        {agent}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Results</h4>
                  <div className="space-y-2">
                    {item.agents.map((agent) => (
                      <div key={agent} className="bg-surface p-3 rounded-lg border border-border">
                        <div className="font-medium mb-1">{agent}</div>
                        <div className="text-sm text-text-muted">
                          Sample response from {agent} would appear here...
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm transition-colors">
                    Re-run
                  </button>
                  <button className="bg-surface hover:bg-border text-text border border-border px-4 py-2 rounded-lg text-sm transition-colors">
                    Export
                  </button>
                  <button className="bg-surface hover:bg-border text-text border border-border px-4 py-2 rounded-lg text-sm transition-colors">
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
