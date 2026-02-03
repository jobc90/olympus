import React, { useState, useCallback } from 'react';
import { useOlympus } from './hooks/useOlympus';
import { PhaseProgress } from './components/PhaseProgress';
import { TaskList } from './components/TaskList';
import { AgentStream } from './components/AgentStream';
import { LogPanel } from './components/LogPanel';
import type { RunStatus } from '@olympus-dev/protocol';

// Get config from URL params or localStorage
function getConfig() {
  const params = new URLSearchParams(window.location.search);
  const stored = localStorage.getItem('olympus-config');
  const storedConfig = stored ? JSON.parse(stored) : {};

  return {
    host: params.get('host') ?? storedConfig.host ?? '127.0.0.1',
    port: parseInt(params.get('port') ?? storedConfig.port ?? '18790'),
    apiKey: params.get('apiKey') ?? storedConfig.apiKey ?? '',
  };
}

function RunList({
  runs,
  currentRunId,
  onSelect,
  onCancel,
}: {
  runs: RunStatus[];
  currentRunId: string | null;
  onSelect: (runId: string) => void;
  onCancel: (runId: string) => void;
}) {
  if (runs.length === 0) {
    return (
      <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800">
        <h2 className="text-lg font-semibold text-gray-300 mb-2">Runs</h2>
        <p className="text-gray-500 text-sm">No runs yet. Create one via CLI or HTTP API.</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800">
      <h2 className="text-lg font-semibold text-gray-300 mb-3">Runs</h2>
      <div className="space-y-2">
        {runs.map((run) => (
          <div
            key={run.runId}
            className={`p-3 rounded-lg cursor-pointer transition-colors ${
              currentRunId === run.runId
                ? 'bg-cyan-900/30 border border-cyan-700'
                : 'bg-gray-800/50 border border-gray-700 hover:bg-gray-800'
            }`}
            onClick={() => onSelect(run.runId)}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm text-cyan-400">{run.runId}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded ${
                  run.status === 'running'
                    ? 'bg-yellow-900/50 text-yellow-400'
                    : run.status === 'completed'
                    ? 'bg-green-900/50 text-green-400'
                    : 'bg-red-900/50 text-red-400'
                }`}
              >
                {run.status}
              </span>
            </div>
            <p className="text-gray-400 text-sm mt-1 truncate">{run.prompt}</p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-500">
                Phase {run.phase}: {run.phaseName}
              </span>
              {run.status === 'running' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancel(run.runId);
                  }}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfigPanel({
  config,
  onSave,
}: {
  config: { host: string; port: number; apiKey: string };
  onSave: (config: { host: string; port: number; apiKey: string }) => void;
}) {
  const [host, setHost] = useState(config.host);
  const [port, setPort] = useState(config.port.toString());
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [isOpen, setIsOpen] = useState(!config.apiKey);

  const handleSave = () => {
    const newConfig = { host, port: parseInt(port), apiKey };
    localStorage.setItem('olympus-config', JSON.stringify(newConfig));
    onSave(newConfig);
    setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="text-xs text-gray-500 hover:text-gray-400"
      >
        ⚙️ Settings
      </button>
    );
  }

  return (
    <div className="bg-gray-900/80 rounded-xl p-4 border border-gray-700 mb-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">Gateway Connection</h3>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500">Host</label>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Port</label>
            <input
              type="text"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="oly_..."
            className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded"
          >
            Connect
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [config, setConfig] = useState(getConfig);
  const {
    connected,
    phase,
    tasks,
    logs,
    agentStreams,
    runs,
    currentRunId,
    error,
    subscribe,
    cancel,
  } = useOlympus(config);

  const handleConfigSave = useCallback(
    (newConfig: { host: string; port: number; apiKey: string }) => {
      setConfig(newConfig);
      // Page will re-render with new config
      window.location.reload();
    },
    []
  );

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 md:mb-6 gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            ⚡ Olympus
          </h1>
          <span className="text-xs text-gray-500">v0.2.0</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
            <span className="text-sm text-gray-400">{connected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <ConfigPanel config={config} onSave={handleConfigSave} />
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Main Layout - Responsive */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Left Sidebar: Runs (1 col on lg) */}
        <div className="lg:col-span-1 order-2 lg:order-1">
          <RunList
            runs={runs}
            currentRunId={currentRunId}
            onSelect={subscribe}
            onCancel={(runId) => cancel(runId)}
          />
        </div>

        {/* Center: Phase + Tasks + Agent (2 cols on lg) */}
        <div className="lg:col-span-2 space-y-4 order-1 lg:order-2">
          {currentRunId ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">
                  Viewing run: <span className="font-mono text-cyan-400">{currentRunId}</span>
                </span>
                <button
                  onClick={() => cancel(currentRunId)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Cancel Run
                </button>
              </div>
              <PhaseProgress phase={phase} />
              <TaskList tasks={tasks} />
              <AgentStream agentStreams={agentStreams} />
            </>
          ) : (
            <div className="bg-gray-900/50 rounded-xl p-8 border border-gray-800 text-center">
              <div className="text-4xl mb-4">📡</div>
              <h2 className="text-lg font-semibold text-gray-300 mb-2">Select a Run</h2>
              <p className="text-gray-500 text-sm">
                {runs.length > 0
                  ? 'Click on a run from the list to view its progress.'
                  : 'No active runs. Start one using the CLI or HTTP API.'}
              </p>
              <div className="mt-4 p-4 bg-gray-800/50 rounded-lg text-left">
                <p className="text-xs text-gray-400 font-mono">
                  # Create a run via CLI
                  <br />
                  olympus run "your prompt" --gateway http://{config.host}:{config.port}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right: Logs (1 col on lg) */}
        <div className="lg:col-span-1 order-3">
          <LogPanel logs={logs} />
        </div>
      </div>

      {/* Mobile-friendly footer */}
      <div className="mt-8 text-center text-xs text-gray-600">
        Gateway: {config.host}:{config.port} | API Key: {config.apiKey ? '***' : 'not set'}
      </div>
    </div>
  );
}
