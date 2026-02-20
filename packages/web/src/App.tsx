import React, { useState, useCallback, useEffect, useRef } from 'react';
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
import { OlympusMountainControls } from './components/olympus-mountain/OlympusMountainControls';
import ChatWindow from './components/chat/ChatWindow';
import SettingsPanel from './components/settings/SettingsPanel';
import { WorkerTaskBoard } from './components/WorkerTaskBoard';
import { GatewayEventLog } from './components/GatewayEventLog';
import CliSessionsPanel from './components/dashboard/CliSessionsPanel';
import { WorkerLogPanel } from './components/dashboard/WorkerLogPanel';

import type { WorkerConfig, WorkerDashboardState, CodexConfig, GeminiConfig, WorkerAvatar, WorkerBehavior } from './lib/types';
import { DEFAULT_GEMINI } from './lib/config';
import { BEHAVIOR_INFO, behaviorToOlympusMountainState, formatTokens, formatRelativeTime } from './lib/state-mapper';

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
  const [monitorSelectedWorkerId, setMonitorSelectedWorkerId] = useState<string | null>(null);
  const [monitorBehaviorOverrides, setMonitorBehaviorOverrides] = useState<Record<string, WorkerBehavior>>({});
  const [perfTick, setPerfTick] = useState(0);
  const [monitorPerf, setMonitorPerf] = useState<{ fps: number; frameTimeMs: number }>({ fps: 0, frameTimeMs: 0 });
  const renderStatsRef = useRef({ app: 0, console: 0, monitor: 0 });

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
    workerDashboardStates: polledWorkerStates,
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
    lastWorkerAssignment,
    lastWorkerFailure,
    workerLogs,
    selectedWorkerId,
    setSelectedWorkerId,
    codexGreeting,
    syncStatus,
  } = useOlympus(config);

  renderStatsRef.current.app += 1;
  if (activeTab === 'console') {
    renderStatsRef.current.console += 1;
  } else {
    renderStatsRef.current.monitor += 1;
  }

  useEffect(() => {
    const timer = setInterval(() => setPerfTick((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, []);

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

  const workerStates: Record<string, WorkerDashboardState> = connected ? polledWorkerStates : {};
  const effectiveWorkerStates: Record<string, WorkerDashboardState> = Object.fromEntries(
    Object.entries(workerStates).map(([id, workerState]) => {
      const override = monitorBehaviorOverrides[id];
      if (!override) return [id, workerState];
      return [
        id,
        {
          ...workerState,
          behavior: override,
          olympusMountainState: behaviorToOlympusMountainState(override),
        },
      ];
    }),
  );

  const codexConfig: CodexConfig = { name: 'Zeus', emoji: '\u26A1', avatar: 'zeus' };
  const geminiConfig: GeminiConfig = DEFAULT_GEMINI;

  // useOlympusMountain hook
  const { olympusMountainState, tick } = useOlympusMountain({
    workers: workerConfigs,
    workerStates: Object.fromEntries(
      Object.entries(effectiveWorkerStates).map(([k, v]) => [k, { behavior: v.behavior }])
    ),
    codexConfig,
    codexBehavior: connected ? polledCodexBehavior : 'supervising',
    geminiBehavior: connected ? polledGeminiBehavior : 'idle',
  });

  // System stats
  const systemStats = (connected && polledSystemStats.totalWorkers > 0)
    ? polledSystemStats
    : { totalWorkers: 0, activeWorkers: 0, totalTokens: 0, failedTasks: 0 };
  const activeTaskCount = workerTasks.filter(t => t.status === 'active' || t.status === 'timeout').length;
  const failedTaskCount = workerTasks.filter(t => t.status === 'failed').length;
  const nowMs = Date.now() + perfTick * 0; // 1s tick-driven recalculation
  const lastSyncTimestamp = Math.max(syncStatus.lastPollAt ?? 0, syncStatus.lastWsEventAt ?? 0);
  const syncLabel = lastSyncTimestamp > 0 ? formatRelativeTime(lastSyncTimestamp) : 'never';
  const syncStale = lastSyncTimestamp > 0 ? (nowMs - lastSyncTimestamp > 20_000) : true;
  const wsEventLagMs = syncStatus.lastWsEventAt ? Math.max(0, nowMs - syncStatus.lastWsEventAt) : null;
  const pollLagMs = syncStatus.lastPollAt ? Math.max(0, nowMs - syncStatus.lastPollAt) : null;
  const selectedMonitorWorkerId = monitorSelectedWorkerId ?? workerConfigs[0]?.id ?? null;
  const selectedMonitorWorker = selectedMonitorWorkerId
    ? workerConfigs.find(w => w.id === selectedMonitorWorkerId) ?? null
    : null;
  const selectedMonitorState = selectedMonitorWorkerId ? effectiveWorkerStates[selectedMonitorWorkerId] : undefined;
  const selectedMonitorLogs = selectedMonitorWorkerId ? (workerLogs.get(selectedMonitorWorkerId) ?? []) : [];
  const selectedMonitorActiveTask = selectedMonitorWorkerId
    ? workerTasks.find(t => t.workerId === selectedMonitorWorkerId && (t.status === 'active' || t.status === 'timeout'))
    : undefined;

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

  // Worker task assignment → ChatWindow message (R2)
  useEffect(() => {
    if (!lastWorkerAssignment) return;

    const { workerId, prompt, summary } = lastWorkerAssignment;
    const startedMsg = {
      id: crypto.randomUUID(),
      role: 'agent' as const,
      content: `🔄 ${summary}`,
      timestamp: lastWorkerAssignment.timestamp,
    };

    setChatMessages(prev => {
      const existing = prev[workerId] || [];
      const last = existing[existing.length - 1];
      const hasSameRecentUserPrompt = !!(
        prompt &&
        last &&
        last.role === 'user' &&
        last.content.trim() === prompt.trim() &&
        Math.abs(last.timestamp - lastWorkerAssignment.timestamp) < 10_000
      );

      const next = hasSameRecentUserPrompt
        ? [...existing, startedMsg]
        : [
            ...existing,
            ...(prompt ? [{
              id: crypto.randomUUID(),
              role: 'user' as const,
              content: prompt,
              timestamp: lastWorkerAssignment.timestamp - 1,
            }] : []),
            startedMsg,
          ];

      return {
        ...prev,
        [workerId]: next,
      };
    });
  }, [lastWorkerAssignment?.timestamp]);

  // Worker task failure → ChatWindow message (R2)
  useEffect(() => {
    if (!lastWorkerFailure) return;

    const { workerId, summary } = lastWorkerFailure;
    const content = `⚠️ ${summary}`;

    const agentMsg = {
      id: crypto.randomUUID(),
      role: 'agent' as const,
      content,
      timestamp: lastWorkerFailure.timestamp,
    };

    setChatMessages(prev => ({
      ...prev,
      [workerId]: [...(prev[workerId] || []), agentMsg],
    }));
  }, [lastWorkerFailure?.timestamp]);

  // Codex greeting → ChatWindow message for Zeus
  useEffect(() => {
    if (!codexGreeting) return;

    const agentMsg = {
      id: crypto.randomUUID(),
      role: 'agent' as const,
      content: `🏛️ Olympus 브리핑\n\n${codexGreeting.text}`,
      timestamp: codexGreeting.timestamp,
    };

    setChatMessages(prev => ({
      ...prev,
      codex: [...(prev['codex'] || []), agentMsg],
    }));
  }, [codexGreeting?.timestamp]);

  const handleDetailClick = useCallback((workerId: string) => {
    setSelectedWorkerId(selectedWorkerId === workerId ? null : workerId);
  }, [selectedWorkerId, setSelectedWorkerId]);

  const handleChatClick = useCallback((workerId: string) => {
    const w = workerConfigs.find(w => w.id === workerId);
    setMonitorSelectedWorkerId(workerId);
    setChatTarget(w ? { id: w.id, name: w.name, emoji: w.emoji, color: w.color } : { id: workerId, name: workerId });
  }, [workerConfigs]);

  const handleReuseCliSession = useCallback(async (session: { key: string; lastPrompt: string }) => {
    const prompt = `세션 ${session.key} 기반으로 이어서 진행해줘.\n최근 프롬프트: ${session.lastPrompt}`;
    await handleChatSend('codex', prompt);
    setChatTarget({ id: 'codex', name: 'Zeus', emoji: '\u26A1', color: '#FFD700' });
  }, [handleChatSend]);

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
            {/* Global Control Strip */}
            <Card className="mb-6 mt-4 py-3">
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: connected ? 'var(--accent-success)' : 'var(--accent-danger)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>Gateway</span>
                  <span style={{ color: connected ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                    {connected ? 'connected' : 'disconnected'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ color: 'var(--text-secondary)' }}>Active Tasks</span>
                  <span style={{ color: 'var(--accent-primary)' }}>{activeTaskCount}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ color: 'var(--text-secondary)' }}>Failed Tasks</span>
                  <span style={{ color: failedTaskCount > 0 ? 'var(--accent-danger)' : 'var(--text-primary)' }}>{failedTaskCount}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ color: 'var(--text-secondary)' }}>Last Sync</span>
                  <span style={{ color: syncStale ? 'var(--accent-warning)' : 'var(--text-primary)' }}>{syncLabel}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ color: 'var(--text-secondary)' }}>Poll Failures</span>
                  <span style={{ color: syncStatus.pollFailureCount > 0 ? 'var(--accent-warning)' : 'var(--text-primary)' }}>
                    {syncStatus.pollFailureCount}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ color: 'var(--text-secondary)' }}>WS Lag</span>
                  <span style={{ color: wsEventLagMs !== null && wsEventLagMs > 5000 ? 'var(--accent-warning)' : 'var(--text-primary)' }}>
                    {wsEventLagMs !== null ? `${wsEventLagMs}ms` : '-'}
                  </span>
                </div>
              </div>
              {syncStatus.lastPollError && (
                <div className="mt-2 text-[11px] font-mono" style={{ color: 'var(--accent-warning)' }}>
                  Poll Warning: {syncStatus.lastPollError}
                </div>
              )}
            </Card>

            {/* Usage — Statusline Dashboard */}
            <div className="mb-6">
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
                    onDetailClick={handleDetailClick}
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
                  onReuse={handleReuseCliSession}
                />
              </aside>
            </div>
          </>
        )}

        {/* ===================== MONITOR TAB ===================== */}
        {activeTab === 'monitor' && (
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
            <div className="xl:col-span-3 space-y-4">
              <OlympusMountainCanvas
                olympusMountainState={olympusMountainState}
                workers={workerConfigs}
                codexConfig={codexConfig}
                geminiConfig={geminiConfig}
                onTick={tick}
                connected={connected}
                onWorkerClick={(workerId) => setMonitorSelectedWorkerId(workerId)}
                onPerformanceUpdate={setMonitorPerf}
              />
              <OlympusMountainControls
                workers={workerConfigs}
                workerStates={effectiveWorkerStates}
                onSetBehavior={(workerId, behavior) => {
                  setMonitorBehaviorOverrides(prev => ({ ...prev, [workerId]: behavior }));
                  setMonitorSelectedWorkerId(workerId);
                }}
              />
            </div>

            <aside className="space-y-4">
              <Card>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-pixel text-xs" style={{ color: 'var(--text-primary)' }}>Monitor Workers</h3>
                  <button
                    onClick={() => setMonitorBehaviorOverrides({})}
                    className="text-[10px] font-mono px-2 py-1 rounded hover:bg-white/10 transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Reset Overrides
                  </button>
                </div>
                <div className="space-y-2 max-h-[280px] overflow-y-auto">
                  {workerConfigs.map(worker => {
                    const workerState = effectiveWorkerStates[worker.id];
                    const selected = selectedMonitorWorkerId === worker.id;
                    return (
                      <button
                        key={worker.id}
                        onClick={() => setMonitorSelectedWorkerId(worker.id)}
                        className="w-full text-left px-3 py-2 rounded-md transition-colors border"
                        style={{
                          backgroundColor: selected ? 'color-mix(in srgb, var(--accent-primary) 14%, transparent)' : 'var(--bg-card)',
                          borderColor: selected ? 'var(--accent-primary)' : 'var(--border)',
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono truncate" style={{ color: 'var(--text-primary)' }}>
                            {worker.name}
                          </span>
                          <span className="text-[10px] font-mono" style={{ color: BEHAVIOR_INFO[workerState?.behavior ?? 'idle'].neonColor }}>
                            {BEHAVIOR_INFO[workerState?.behavior ?? 'idle'].label}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono truncate mt-1" style={{ color: 'var(--text-secondary)' }}>
                          {worker.projectPath?.replace(/^\/Users\/[^/]+\//, '~/') ?? '-'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Card>

              <Card>
                <h3 className="font-pixel text-xs mb-3" style={{ color: 'var(--text-primary)' }}>Performance</h3>
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span style={{ color: 'var(--text-secondary)' }}>Canvas FPS</span>
                    <span style={{ color: monitorPerf.fps < 20 ? 'var(--accent-warning)' : 'var(--text-primary)' }}>
                      {monitorPerf.fps.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span style={{ color: 'var(--text-secondary)' }}>Frame Time</span>
                    <span style={{ color: monitorPerf.frameTimeMs > 50 ? 'var(--accent-warning)' : 'var(--text-primary)' }}>
                      {monitorPerf.frameTimeMs.toFixed(1)}ms
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span style={{ color: 'var(--text-secondary)' }}>WS Event Lag</span>
                    <span style={{ color: wsEventLagMs !== null && wsEventLagMs > 5000 ? 'var(--accent-warning)' : 'var(--text-primary)' }}>
                      {wsEventLagMs !== null ? `${wsEventLagMs}ms` : '-'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span style={{ color: 'var(--text-secondary)' }}>Poll Lag</span>
                    <span style={{ color: pollLagMs !== null && pollLagMs > 20000 ? 'var(--accent-warning)' : 'var(--text-primary)' }}>
                      {pollLagMs !== null ? `${pollLagMs}ms` : '-'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span style={{ color: 'var(--text-secondary)' }}>Renders(C/M)</span>
                    <span style={{ color: 'var(--text-primary)' }}>
                      {renderStatsRef.current.console}/{renderStatsRef.current.monitor}
                    </span>
                  </div>
                </div>
              </Card>

              <Card>
                <h3 className="font-pixel text-xs mb-3" style={{ color: 'var(--text-primary)' }}>Selected Worker</h3>
                {selectedMonitorWorker && selectedMonitorState ? (
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex items-center justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Name</span>
                      <span style={{ color: 'var(--text-primary)' }}>{selectedMonitorWorker.name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Status</span>
                      <span style={{ color: BEHAVIOR_INFO[selectedMonitorState.behavior].neonColor }}>
                        {BEHAVIOR_INFO[selectedMonitorState.behavior].label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Last</span>
                      <span style={{ color: 'var(--text-primary)' }}>{formatRelativeTime(selectedMonitorState.lastActivity)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Tokens</span>
                      <span style={{ color: 'var(--text-primary)' }}>{formatTokens(selectedMonitorState.totalTokens)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Tasks</span>
                      <span style={{ color: 'var(--text-primary)' }}>{selectedMonitorState.totalTasks}</span>
                    </div>
                    <div className="pt-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      {selectedMonitorActiveTask
                        ? `Task: ${selectedMonitorActiveTask.prompt || 'running...'}`
                        : selectedMonitorLogs[0]?.summary ?? 'No active task'}
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <button
                        onClick={() => handleChatClick(selectedMonitorWorker.id)}
                        className="text-[10px] font-mono px-2 py-1 rounded border hover:bg-white/10 transition-colors"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                      >
                        Chat
                      </button>
                      <button
                        onClick={() => handleDetailClick(selectedMonitorWorker.id)}
                        className="text-[10px] font-mono px-2 py-1 rounded border hover:bg-white/10 transition-colors"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                      >
                        Logs
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                    Select a worker from the monitor list.
                  </div>
                )}
              </Card>
            </aside>
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

      {/* Worker Log Panel */}
      {selectedWorkerId && (
        <WorkerLogPanel
          workerId={selectedWorkerId}
          workerConfig={polledWorkerConfigs.find(w => w.id === selectedWorkerId)}
          logs={workerLogs.get(selectedWorkerId) ?? []}
          onClose={() => setSelectedWorkerId(null)}
        />
      )}

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
