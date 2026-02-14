import React, { useState, useCallback, useEffect } from 'react';
import { useOlympus } from './hooks/useOlympus';
import { useOlympusMountain } from './hooks/useOlympusMountain';

// --- Existing components (preserved) ---
import { SessionOutputPanel } from './components/SessionOutputPanel';
// EmptyState removed — "Ready to Roll!" 불필요
import { PhaseProgress } from './components/PhaseProgress';
import { TaskList } from './components/TaskList';
import { AgentStream } from './components/AgentStream';
// CommandInput removed — Codex 직접 입력 불필요
import { AgentApprovalDialog } from './components/AgentApprovalDialog';
import { Card } from './components/Card';
// ContextExplorer, CodexPanel removed — 불필요
import { AgentHistoryPanel } from './components/AgentHistoryPanel';
import { LiveOutputPanel } from './components/LiveOutputPanel';
// useContextTree removed — ContextExplorer 삭제

// --- New dashboard components ---
import Navbar from './components/dashboard/Navbar';
import SystemStats from './components/dashboard/SystemStats';
import { WorkerGrid } from './components/dashboard/WorkerGrid';
import ActivityFeed from './components/dashboard/ActivityFeed';
import { CodexAgentPanel } from './components/dashboard/CodexAgentPanel';
import { GeminiAdvisorPanel } from './components/dashboard/GeminiAdvisorPanel';
import UsageBar from './components/dashboard/UsageBar';
import { MiniOlympusMountain } from './components/olympus-mountain/MiniOlympusMountain';
import { OlympusMountainCanvas } from './components/olympus-mountain/OlympusMountainCanvas';
import ChatWindow from './components/chat/ChatWindow';
import SettingsPanel from './components/settings/SettingsPanel';
import { WorkerTaskBoard } from './components/WorkerTaskBoard';
import { GatewayEventLog } from './components/GatewayEventLog';
import CliSessionsPanel from './components/dashboard/CliSessionsPanel';

import type { WorkerConfig, WorkerDashboardState, CodexConfig, GeminiConfig, WorkerAvatar, WorkerBehavior } from './lib/types';
import { DEFAULT_GEMINI } from './lib/config';
import { BEHAVIOR_INFO, formatTokens, formatRelativeTime } from './lib/state-mapper';

// ---------------------------------------------------------------------------
// localStorage 마이그레이션 — 낡은 키 일괄 정리 (버전 기반, 1회 실행)
// ---------------------------------------------------------------------------
const LS_VERSION_KEY = 'olympus-ls-version';
const LS_CURRENT_VERSION = '1'; // 버전 올리면 다시 정리됨

function migrateLocalStorage() {
  if (localStorage.getItem(LS_VERSION_KEY) === LS_CURRENT_VERSION) return;
  // 기존 세션에서 쌓인 불필요한 키 제거
  const staleKeys = [
    'olympus-config',
    'olympus-dashboard-config',
    'olympus-theme',
  ];
  for (const key of staleKeys) localStorage.removeItem(key);
  localStorage.setItem(LS_VERSION_KEY, LS_CURRENT_VERSION);
}
migrateLocalStorage();

// Config priority: server-injected > URL params > localStorage > defaults
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
    port: injected?.port ?? parseInt(params.get('port') ?? String(storedConfig.port ?? '8200')),
    apiKey: injected?.apiKey ?? params.get('apiKey') ?? (storedConfig.apiKey as string) ?? '',
  };

  // Security: URL에서 민감 파라미터 즉시 제거 (브라우저 히스토리/Referer 노출 방지)
  if (params.has('apiKey')) {
    params.delete('apiKey');
    const cleaned = params.toString();
    const newUrl = window.location.pathname + (cleaned ? `?${cleaned}` : '');
    window.history.replaceState(null, '', newUrl);
  }

  if (config.apiKey) {
    localStorage.setItem('olympus-config', JSON.stringify(config));
  }

  return config;
}


// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [config, setConfig] = useState(getConfig);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTabRaw] = useState<'console' | 'monitor'>(() => {
    const saved = localStorage.getItem('olympus-active-tab');
    return saved === 'monitor' ? 'monitor' : 'console';
  });
  const setActiveTab = useCallback((tab: 'console' | 'monitor') => {
    setActiveTabRaw(tab);
    localStorage.setItem('olympus-active-tab', tab);
  }, []);
  const [chatTarget, setChatTarget] = useState<{ id: string; name: string; emoji?: string; color?: string } | null>(null);
  const [chatMessages, setChatMessages] = useState<Record<string, Array<{ id: string; role: 'user' | 'agent'; content: string; timestamp: number }>>>({});

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
    sessionScreens,
    error,
    pendingApproval,
    subscribe,
    subscribeSession,
    cancel,
    connectAvailableSession,
    sendAgentCommand,
    approveTask,
    rejectTask,
    codexRoute,
    codexProjects,
    codexSessions,
    codexSearch,
    chatWithGemini,
    chatWithCodex,
    cliHistory,
    cliStreams,
    workerConfigs: polledWorkerConfigs,
    workerBehaviors: polledWorkerBehaviors,
    codexBehavior: polledCodexBehavior,
    geminiBehavior: polledGeminiBehavior,
    geminiCurrentTask: polledGeminiCurrentTask,
    geminiCacheCount: polledGeminiCacheCount,
    geminiLastAnalyzed: polledGeminiLastAnalyzed,
    systemStats: polledSystemStats,
    activityEvents: polledActivityEvents,
    usageData,
    workerTasks,
    cliSessions,
    deleteCliSession,
    lastWorkerCompletion,
  } = useOlympus(config);

  // Build WorkerConfig[] and WorkerDashboardState map for new components
  const WORKER_AVATARS = ['athena', 'poseidon', 'ares', 'apollo', 'artemis', 'hermes', 'hephaestus', 'dionysus', 'demeter', 'aphrodite', 'hades', 'persephone', 'prometheus', 'helios', 'nike', 'pan', 'hecate', 'iris', 'heracles'];
  const workerConfigs: WorkerConfig[] = (connected && polledWorkerConfigs.length > 0)
    ? polledWorkerConfigs.map((w, i) => ({
        id: w.id,
        name: w.name,
        emoji: w.emoji ?? '',
        color: w.color,
        avatar: (w.avatar || WORKER_AVATARS[i % WORKER_AVATARS.length]) as WorkerAvatar,
        behavior: polledWorkerBehaviors[w.id],
        skinToneIndex: i,
        projectPath: w.projectPath,
      } satisfies WorkerConfig))
    : [];

  const workerStates: Record<string, WorkerDashboardState> = (connected && polledWorkerConfigs.length > 0)
    ? Object.fromEntries(
        polledWorkerConfigs.map(w => [
          w.id,
          {
            behavior: (polledWorkerBehaviors[w.id] ?? 'idle') as WorkerBehavior,
            olympusMountainState: 'idle',
            currentTask: null,
            taskHistory: [],
            tokenUsage: [],
            totalTokens: 0,
            totalTasks: 0,
            lastActivity: Date.now(),
            sessionLog: [],
            uptime: 0,
          } as WorkerDashboardState,
        ])
      )
    : {};

  const codexConfig: CodexConfig = { name: 'Zeus', emoji: '\u26A1', avatar: 'zeus' };
  const geminiConfig: GeminiConfig = DEFAULT_GEMINI;

  // useOlympusMountain hook
  const { olympusMountainState, tick } = useOlympusMountain({
    workers: workerConfigs,
    workerStates: Object.fromEntries(
      Object.entries(workerStates).map(([k, v]) => [k, { behavior: v.behavior }])
    ),
    codexConfig,
    codexBehavior: connected ? polledCodexBehavior : 'supervising',
    geminiBehavior: connected ? polledGeminiBehavior : 'idle',
  });

  // System stats
  const systemStats = (connected && polledSystemStats.totalWorkers > 0)
    ? polledSystemStats
    : { totalWorkers: 0, activeWorkers: 0, totalTokens: 0, failedTasks: 0 };

  // --- Config handlers ---
  const handleConfigSave = useCallback(
    (newConfig: { host: string; port: number; apiKey: string }) => {
      setConfig(newConfig);
      setShowSettings(false);
      window.location.reload();
    },
    []
  );

  const handleThemeChange = useCallback((theme: string) => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('olympus-theme', theme);
  }, []);

  // --- Chat handlers ---
  const handleChatSend = useCallback(async (agentId: string, message: string) => {
    const userMsg = { id: crypto.randomUUID(), role: 'user' as const, content: message, timestamp: Date.now() };
    setChatMessages(prev => ({
      ...prev,
      [agentId]: [...(prev[agentId] || []), userMsg],
    }));

    try {
      let content: string;

      if (agentId.startsWith('gemini')) {
        // Hera (Gemini) → POST /api/chat
        const res = await chatWithGemini(message);
        content = res.reply ?? 'No response';
      } else if (agentId.startsWith('codex')) {
        // Zeus (Codex) → POST /api/codex/chat
        const res = await chatWithCodex(message);
        content = res.response ?? 'No response';
      } else {
        // Worker → POST /api/codex/chat with @mention
        const wConfig = polledWorkerConfigs.find(w => w.id === agentId);
        const mentionName = wConfig?.registeredName ?? wConfig?.name ?? agentId;
        const res = await chatWithCodex(`@${mentionName} ${message}`);
        content = res.response ?? 'No response';
      }

      const agentMsg = { id: crypto.randomUUID(), role: 'agent' as const, content, timestamp: Date.now() };
      setChatMessages(prev => ({
        ...prev,
        [agentId]: [...(prev[agentId] || []), agentMsg],
      }));
    } catch (e) {
      const errorContent = `Error: ${(e as Error).message}`;
      const errorMsg = { id: crypto.randomUUID(), role: 'agent' as const, content: errorContent, timestamp: Date.now() };
      setChatMessages(prev => ({
        ...prev,
        [agentId]: [...(prev[agentId] || []), errorMsg],
      }));
    }
  }, [chatWithGemini, chatWithCodex, polledWorkerConfigs]);

  // Worker task completion → ChatWindow message
  useEffect(() => {
    if (!lastWorkerCompletion) return;

    const { workerId, workerName, summary, success } = lastWorkerCompletion;
    const icon = success ? '✅' : '❌';
    const content = `${icon} ${summary}`;

    const agentMsg = {
      id: crypto.randomUUID(),
      role: 'agent' as const,
      content,
      timestamp: lastWorkerCompletion.timestamp,
    };

    setChatMessages(prev => ({
      ...prev,
      [workerId]: [...(prev[workerId] || []), agentMsg],
    }));
  }, [lastWorkerCompletion?.timestamp]);

  const handleChatClick = useCallback((workerId: string) => {
    const w = workerConfigs.find(w => w.id === workerId);
    setChatTarget(w ? { id: w.id, name: w.name, emoji: w.emoji, color: w.color } : { id: workerId, name: workerId });
  }, [workerConfigs]);

  const currentRun = runs.find((r) => r.runId === currentRunId);
  const currentSession = sessions.find((s) => s.id === currentSessionId);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-primary, #0A0F1C)' }}>
      {/* Navbar (replaces old Header) */}
      <Navbar
        connected={connected}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onSettingsClick={() => setShowSettings(true)}
      />

      {/* Error Banner */}
      {error && (
        <div className="mx-6 mt-20 p-3 bg-error/10 border border-error/30 rounded-lg text-error text-sm flex items-center gap-2">
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
      <main className={`flex-1 pt-16 px-4 pb-16 mx-auto w-full ${activeTab === 'monitor' ? 'max-w-[80vw]' : 'max-w-[1600px]'}`}>
        {/* ===================== CONSOLE TAB ===================== */}
        {activeTab === 'console' && (
          <>
            {/* Usage — Statusline Dashboard */}
            <div className="mb-6 mt-4">
              <h2 className="font-pixel text-sm mb-3" style={{ color: 'var(--text-primary)' }}>
                Usage
              </h2>
              <UsageBar data={usageData} />
            </div>

            {/* Overview — System Stats */}
            <div className="mb-6">
              <h2 className="font-pixel text-sm mb-3" style={{ color: 'var(--text-primary)' }}>
                Overview
              </h2>
              <SystemStats stats={systemStats} />
            </div>

            {/* Main 4-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Left: Command + Workers + Operational panels (3/4) */}
              <div className="lg:col-span-3 space-y-6">
                {/* Olympian Command — Zeus + Hera */}
                <div>
                  <h2 className="font-pixel text-sm mb-3" style={{ color: 'var(--text-primary)' }}>
                    Olympian Command
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <CodexAgentPanel
                      codexConfig={codexConfig}
                      codexBehavior={connected ? polledCodexBehavior : 'supervising'}
                      connected={connected}
                      onChatClick={() => setChatTarget({ id: 'codex', name: 'Zeus', emoji: '\u26A1', color: '#FFD700' })}
                    />
                    <GeminiAdvisorPanel
                      geminiConfig={geminiConfig}
                      geminiBehavior={connected ? polledGeminiBehavior : 'offline'}
                      cacheCount={polledGeminiCacheCount}
                      lastAnalyzed={polledGeminiLastAnalyzed}
                      currentTask={polledGeminiCurrentTask}
                      formatRelativeTime={formatRelativeTime}
                      onChatClick={() => setChatTarget({ id: 'gemini', name: 'Hera', emoji: '\uD83E\uDD89', color: '#CE93D8' })}
                    />
                  </div>
                </div>

                {/* Active Workers */}
                <div>
                  <h2 className="font-pixel text-sm mb-3" style={{ color: 'var(--text-primary)' }}>
                    Active Workers
                  </h2>
                  <WorkerGrid
                    workers={workerConfigs}
                    workerStates={workerStates}
                    onChatClick={handleChatClick}
                  />
                </div>

                {/* Operational panels */}
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
                  <SessionOutputPanel session={currentSession} outputs={sessionOutputs.filter(o => o.sessionId === currentSessionId)} screen={sessionScreens.get(currentSessionId!)} />
                ) : (
                  <>
                    <WorkerTaskBoard tasks={workerTasks} />
                    <LiveOutputPanel streams={cliStreams} />
                    <AgentHistoryPanel history={cliHistory} />
                    <GatewayEventLog logs={logs} />
                  </>
                )}
              </div>

              {/* Right Sidebar: MiniOlympus + Activity + Context + Sessions (1/4) */}
              <aside className="lg:col-span-1 space-y-4">
                {/* Compact Olympus Mountain preview — click to go to Monitor tab */}
                <div className="cursor-pointer" onClick={() => setActiveTab('monitor')}>
                  <MiniOlympusMountain
                    workers={workerConfigs}
                    workerStates={workerStates}
                    codexConfig={codexConfig}
                    olympusMountainState={olympusMountainState}
                    onTick={tick}
                  />
                </div>
                <ActivityFeed events={connected && polledActivityEvents.length > 0 ? polledActivityEvents.map(e => ({
                  id: e.id, type: e.type, agentName: e.agentName, message: e.message, timestamp: e.timestamp, color: e.color,
                })) : []} />
                <CliSessionsPanel
                  sessions={cliSessions}
                  onDelete={deleteCliSession}
                />
              </aside>
            </div>
          </>
        )}

        {/* ===================== MONITOR TAB ===================== */}
        {activeTab === 'monitor' && (
          <div className="space-y-4">
            <OlympusMountainCanvas
              olympusMountainState={olympusMountainState}
              workers={workerConfigs}
              codexConfig={codexConfig}
              geminiConfig={geminiConfig}
              onTick={tick}
              connected={connected}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 py-2 px-6 border-t text-center" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary, #0A0F1C)' }}>
        <span className="text-xs" style={{ color: 'var(--text-secondary, #666)' }}>
          Gateway: {config.host}:{config.port}
          {config.apiKey && (
            <span className="ml-2" style={{ color: 'var(--accent-success, #4CAF50)' }}>Authenticated</span>
          )}
        </span>
      </footer>

      {/* ChatWindow */}
      {chatTarget && (() => {
        const isCodex = chatTarget.id === 'codex';
        const ws = workerStates[chatTarget.id];
        const behavior = isCodex ? (connected ? polledCodexBehavior : 'supervising') : (ws?.behavior ?? 'idle');
        const bInfo = BEHAVIOR_INFO[behavior as keyof typeof BEHAVIOR_INFO];
        const wConfig = workerConfigs.find(w => w.id === chatTarget.id);
        const projectPath = wConfig?.projectPath;
        const details: Array<{ label: string; value: string; color?: string }> = [
          { label: 'Status', value: bInfo?.label ?? behavior, color: bInfo?.neonColor },
          { label: 'ID', value: chatTarget.id },
          { label: 'Project', value: projectPath || (connected ? `${config.host}:${config.port}` : 'Disconnected'), color: projectPath ? undefined : (connected ? undefined : 'var(--accent-danger)') },
        ];
        if (!isCodex && ws) {
          details.push({ label: 'Tokens', value: formatTokens(ws.totalTokens ?? 0) });
          details.push({ label: 'Tasks', value: String(ws.totalTasks ?? 0) });
          details.push({ label: 'Last', value: formatRelativeTime(ws.lastActivity) });
          if (ws.currentTask) details.push({ label: 'Task', value: ws.currentTask.title });
        }
        return (
          <ChatWindow
            agentId={chatTarget.id}
            agentName={chatTarget.name}
            agentEmoji={chatTarget.emoji}
            agentColor={chatTarget.color}
            details={details}
            messages={chatMessages[chatTarget.id] || []}
            onSend={handleChatSend}
            onClose={() => setChatTarget(null)}
          />
        );
      })()}

      {/* Settings Panel (replaces old SettingsModal) */}
      {showSettings && (
        <SettingsPanel
          config={{
            gateway: { url: `${config.host}:${config.port}`, token: config.apiKey },
            theme: localStorage.getItem('olympus-theme') || 'midnight',
          }}
          onUpdate={(cfg) => {
            if (cfg.theme) handleThemeChange(cfg.theme);
            // Parse gateway URL back to host:port
            if (cfg.gateway) {
              const parts = cfg.gateway.url.split(':');
              const host = parts[0] || config.host;
              const port = parseInt(parts[1]) || config.port;
              handleConfigSave({ host, port, apiKey: cfg.gateway.token || config.apiKey });
            } else {
              setShowSettings(false);
            }
          }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Approval Dialog */}
      {pendingApproval && (
        <AgentApprovalDialog
          request={pendingApproval as unknown as import('./components/AgentApprovalDialog').ApprovalRequestData}
          onApprove={approveTask}
          onReject={rejectTask}
        />
      )}
    </div>
  );
}
