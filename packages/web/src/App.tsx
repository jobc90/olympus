import React, { useState, useCallback } from 'react';
import { useOlympus } from './hooks/useOlympus';
import { Header } from './components/Header';
import { SessionList } from './components/SessionList';
import { SessionOutputPanel } from './components/SessionOutputPanel';
import { EmptyState } from './components/EmptyState';
import { SettingsModal } from './components/SettingsModal';
import { PhaseProgress } from './components/PhaseProgress';
import { TaskList } from './components/TaskList';
import { AgentStream } from './components/AgentStream';
import { LogPanel } from './components/LogPanel';
import { Card, CardHeader } from './components/Card';
import { ContextExplorer } from './components/ContextExplorer';
import { useContextTree } from './hooks/useContextTree';

// Config priority: server-injected > URL params > localStorage > defaults
// Server injects window.__OLYMPUS_CONFIG__ via <script> tag in index.html
declare global {
  interface Window {
    __OLYMPUS_CONFIG__?: { host: string; port: number; apiKey: string };
  }
}

function getConfig() {
  const injected = window.__OLYMPUS_CONFIG__;
  const params = new URLSearchParams(window.location.search);
  const stored = localStorage.getItem('olympus-config');

  let storedConfig: Record<string, unknown> = {};
  if (stored) {
    try {
      storedConfig = JSON.parse(stored);
    } catch {
      localStorage.removeItem('olympus-config');
    }
  }

  const config = {
    host: injected?.host ?? params.get('host') ?? (storedConfig.host as string) ?? '127.0.0.1',
    port: injected?.port ?? parseInt(params.get('port') ?? String(storedConfig.port ?? '18790')),
    apiKey: injected?.apiKey ?? params.get('apiKey') ?? (storedConfig.apiKey as string) ?? '',
  };

  // Persist to localStorage for consistency
  if (config.apiKey) {
    localStorage.setItem('olympus-config', JSON.stringify(config));
  }

  return config;
}

export default function App() {
  const [config, setConfig] = useState(getConfig);
  const [showSettings, setShowSettings] = useState(!config.apiKey);

  const {
    connected,
    phase,
    tasks,
    logs,
    agentStreams,
    runs,
    sessions,
    availableSessions,
    currentRunId,
    currentSessionId,
    sessionOutputs,
    error,
    subscribe,
    subscribeSession,
    cancel,
    connectAvailableSession,
  } = useOlympus(config);

  const contextTree = useContextTree({
    baseUrl: `http://${config.host}:${config.port}`,
    apiKey: config.apiKey,
  });

  const handleConfigSave = useCallback(
    (newConfig: { host: string; port: number; apiKey: string }) => {
      setConfig(newConfig);
      setShowSettings(false);
      window.location.reload();
    },
    []
  );

  const currentRun = runs.find((r) => r.runId === currentRunId);
  const currentSession = sessions.find((s) => s.id === currentSessionId);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <Header
        connected={connected}
        error={error}
        onSettingsClick={() => setShowSettings(true)}
      />

      {/* Error Banner */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-error/10 border border-error/30 rounded-lg text-error text-sm flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          {error}
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
          {/* Left Sidebar: Sessions */}
          <aside className="lg:col-span-3 xl:col-span-2">
            <SessionList
              runs={runs}
              sessions={sessions}
              availableSessions={availableSessions}
              currentRunId={currentRunId}
              currentSessionId={currentSessionId}
              onSelect={subscribe}
              onSelectSession={subscribeSession}
              onCancel={(runId) => cancel(runId)}
              onConnectAvailable={connectAvailableSession}
            />
          </aside>

          {/* Center: Main Content */}
          <section className="lg:col-span-6 xl:col-span-7 space-y-4">
            {currentRunId && currentRun ? (
              <>
                {/* Run Header */}
                <Card className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <span className="font-mono text-sm text-primary">
                      {currentRunId}
                    </span>
                    <span className="text-xs text-text-muted">
                      Phase {currentRun.phase}: {currentRun.phaseName}
                    </span>
                  </div>
                  {currentRun.status === 'running' && (
                    <button
                      onClick={() => cancel(currentRunId)}
                      className="text-xs text-error hover:text-error/80 transition-colors flex items-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Cancel
                    </button>
                  )}
                </Card>

                {/* Phase Progress */}
                <PhaseProgress phase={phase} />

                {/* Tasks */}
                <TaskList tasks={tasks} />

                {/* Agent Stream */}
                <AgentStream agentStreams={agentStreams} />
              </>
            ) : currentSessionId && currentSession ? (
              <SessionOutputPanel session={currentSession} outputs={sessionOutputs.filter(o => o.sessionId === currentSessionId)} />
            ) : (
              <EmptyState config={config} hasRuns={runs.length > 0} hasSessions={sessions.filter(s => s.status === 'active').length > 0} />
            )}
          </section>

          {/* Right Sidebar: Context + Logs */}
          <aside className="lg:col-span-3 space-y-4">
            <ContextExplorer ctx={contextTree} onSettingsClick={() => setShowSettings(true)} />
            <LogPanel logs={logs} />
          </aside>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-3 px-6 border-t border-border text-center">
        <span className="text-xs text-text-muted">
          Gateway: {config.host}:{config.port}
          {config.apiKey && (
            <span className="ml-2 text-success">● Authenticated</span>
          )}
        </span>
      </footer>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          config={config}
          onSave={handleConfigSave}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
