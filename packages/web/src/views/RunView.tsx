import { useState } from 'react';

export default function RunView() {
  const [prompt, setPrompt] = useState('');
  const [selectedAgents, setSelectedAgents] = useState<string[]>(['claude', 'gpt']);

  const agents = [
    { id: 'claude', name: 'Claude (Anthropic)', color: 'bg-orange-500' },
    { id: 'gpt', name: 'GPT-4 (OpenAI)', color: 'bg-green-500' },
    { id: 'gemini', name: 'Gemini (Google)', color: 'bg-blue-500' },
  ];

  const toggleAgent = (agentId: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Run Multi-AI Task</h1>
        <p className="text-text-muted mt-2">Execute a prompt across multiple AI models</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-surface border border-border rounded-lg p-6">
            <label className="block font-semibold mb-3">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your prompt here..."
              className="w-full h-48 bg-background border border-border rounded-lg p-4 text-text placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent resize-none"
            />
          </div>

          <div className="bg-surface border border-border rounded-lg p-6">
            <h3 className="font-semibold mb-4">Select Agents</h3>
            <div className="space-y-3">
              {agents.map((agent) => (
                <label
                  key={agent.id}
                  className="flex items-center gap-3 p-3 bg-background rounded-lg cursor-pointer hover:bg-border transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedAgents.includes(agent.id)}
                    onChange={() => toggleAgent(agent.id)}
                    className="w-5 h-5 accent-accent"
                  />
                  <div className={`w-3 h-3 rounded-full ${agent.color}`}></div>
                  <span className="font-medium">{agent.name}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            disabled={!prompt || selectedAgents.length === 0}
            className="w-full bg-accent hover:bg-accent-hover disabled:bg-border disabled:text-text-muted text-white px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            Run Task
          </button>
        </div>

        <div className="space-y-6">
          <div className="bg-surface border border-border rounded-lg p-6">
            <h3 className="font-semibold mb-4">Configuration</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-text-muted mb-2 block">Temperature</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  defaultValue="0.7"
                  className="w-full accent-accent"
                />
                <div className="text-sm text-text-muted text-right mt-1">0.7</div>
              </div>

              <div>
                <label className="text-sm text-text-muted mb-2 block">Max Tokens</label>
                <input
                  type="number"
                  defaultValue="2048"
                  className="w-full bg-background border border-border rounded px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-accent" defaultChecked />
                  <span className="text-sm">Stream responses</span>
                </label>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-accent" />
                  <span className="text-sm">Save to history</span>
                </label>
              </div>
            </div>
          </div>

          <div className="bg-surface border border-border rounded-lg p-6">
            <h3 className="font-semibold mb-4">Status</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-text-muted">Ready to run</span>
              </div>
              <div className="text-text-muted">
                Selected: <span className="text-text font-medium">{selectedAgents.length} agents</span>
              </div>
              <div className="text-text-muted">
                Prompt length: <span className="text-text font-medium">{prompt.length} chars</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-lg p-6">
        <h3 className="font-semibold mb-4">Results</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {selectedAgents.map((agentId) => {
            const agent = agents.find((a) => a.id === agentId);
            return (
              <div key={agentId} className="bg-background border border-border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-3 h-3 rounded-full ${agent?.color}`}></div>
                  <h4 className="font-semibold">{agent?.name}</h4>
                </div>
                <div className="text-sm text-text-muted">Waiting for task execution...</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
