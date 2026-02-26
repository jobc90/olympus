import React, { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
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
// useContextTree removed — ContextExplorer 삭제

// --- New dashboard components ---
import Navbar from './components/dashboard/Navbar';
import SystemStats from './components/dashboard/SystemStats';
import { WorkerGrid } from './components/dashboard/WorkerGrid';
import ActivityFeed from './components/dashboard/ActivityFeed';
import { CodexAgentPanel } from './components/dashboard/CodexAgentPanel';
import { GeminiAdvisorPanel } from './components/dashboard/GeminiAdvisorPanel';
import UsageBar from './components/dashboard/UsageBar';
import { WorkerTaskBoard } from './components/WorkerTaskBoard';
import { MiniOlympusMountain } from './components/olympus-mountain/MiniOlympusMountain';
import { OlympusTempleMonitor } from './components/monitor/OlympusTempleMonitor';
import ChatWindow from './components/chat/ChatWindow';
import SettingsPanel from './components/settings/SettingsPanel';
const WorkerLogPanel = lazy(() =>
  import('./components/dashboard/WorkerLogPanel').then(m => ({ default: m.WorkerLogPanel }))
);

import type { WorkerConfig, WorkerDashboardState, CodexConfig, GeminiConfig, WorkerAvatar } from './lib/types';
import { DEFAULT_GEMINI } from './lib/config';
import { assignWorkerAvatars, WORKER_AVATAR_POOL } from './lib/avatar-pool';
import { BEHAVIOR_INFO, formatTokens, formatRelativeTime } from './lib/state-mapper';
import { preloadPortraits } from './sprites/portrait-loader';
import { DIVERSE_AVATAR_ORDER_V2 } from './sprites/characters';
import { preloadSpriteSheets } from './sprites/sprite-sheet-loader';

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

type ChatMessage = {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: number;
};

const CHAT_MESSAGES_STORAGE_KEY = 'olympus-chat-messages-v1';
const CHAT_MESSAGES_PER_AGENT_LIMIT = 200;

function loadChatMessages(): Record<string, ChatMessage[]> {
  try {
    const raw = localStorage.getItem(CHAT_MESSAGES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ChatMessage[]>;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

function trimChatMessages(
  input: Record<string, ChatMessage[]>,
  limit = CHAT_MESSAGES_PER_AGENT_LIMIT,
): Record<string, ChatMessage[]> {
  const next: Record<string, ChatMessage[]> = {};
  for (const [agentId, messages] of Object.entries(input)) {
    if (!Array.isArray(messages) || messages.length === 0) continue;
    next[agentId] = messages.slice(-limit);
  }
  return next;
}

function appendChatMessage(list: ChatMessage[], msg: ChatMessage): ChatMessage[] {
  const last = list[list.length - 1];
  if (
    last &&
    last.role === msg.role &&
    last.content.trim() === msg.content.trim() &&
    Math.abs(last.timestamp - msg.timestamp) < 1_500
  ) {
    return list;
  }
  return [...list, msg];
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
  const [chatMessages, setChatMessages] = useState<Record<string, ChatMessage[]>>(loadChatMessages);
  const [monitorSelectedWorkerId, setMonitorSelectedWorkerId] = useState<string | null>(null);
  const hasEverConnected = useRef<boolean>(false);
  const leftConsoleColumnRef = useRef<HTMLDivElement | null>(null);
  const [leftConsoleHeight, setLeftConsoleHeight] = useState<number>(0);
  const [isXlLayout, setIsXlLayout] = useState<boolean>(() => (typeof window !== 'undefined' ? window.innerWidth >= 1280 : false));

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
    workerDashboardStates: polledWorkerStates,
    codexBehavior: polledCodexBehavior,
    geminiBehavior: polledGeminiBehavior,
    geminiCurrentTask: polledGeminiCurrentTask,
    geminiCacheCount: polledGeminiCacheCount,
    geminiLastAnalyzed: polledGeminiLastAnalyzed,
    systemStats: polledSystemStats,
    activityEvents: polledActivityEvents,
    usageData,
    workers,
    workerTasks,
    sendWorkerInput,
    resizeWorkerTerminal,
    lastWorkerCompletion,
    lastWorkerAssignment,
    lastWorkerSummary,
    lastWorkerFailure,
    workerLogs,
    selectedWorkerId,
    setSelectedWorkerId,
    codexGreeting,
    syncStatus,
  } = useOlympus(config);

  // Apply persisted theme on initial load.
  useEffect(() => {
    const savedTheme = localStorage.getItem('olympus-theme') || 'midnight';
    document.documentElement.dataset.theme = savedTheme;
  }, []);

  // Preload portrait PNGs and sprite sheets for all 22 characters on mount.
  useEffect(() => {
    void preloadPortraits(DIVERSE_AVATAR_ORDER_V2 as unknown as string[]);
    void preloadSpriteSheets(DIVERSE_AVATAR_ORDER_V2 as unknown as string[]);
  }, []);

  // Track first successful connection so we can distinguish "initial loading" vs "reconnecting"
  useEffect(() => {
    if (connected) { hasEverConnected.current = true; }
  }, [connected]);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_MESSAGES_STORAGE_KEY, JSON.stringify(trimChatMessages(chatMessages)));
    } catch {
      // ignore localStorage quota errors
    }
  }, [chatMessages]);

  useEffect(() => {
    const onResize = () => setIsXlLayout(window.innerWidth >= 1280);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (activeTab !== 'console') {
      // Reset so stale height doesn't lock the layout on re-mount
      setLeftConsoleHeight(0);
      return;
    }
    const el = leftConsoleColumnRef.current;
    if (!el) return;

    const update = () => {
      // Temporarily remove aside height constraint to measure left column's natural height
      const next = Math.round(el.scrollHeight);
      setLeftConsoleHeight(prev => (prev === next ? prev : next));
    };

    // Delay first measurement by one frame so grid lays out without stale aside height
    const raf = requestAnimationFrame(update);
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [activeTab, workerTasks.length, polledWorkerConfigs.length, polledActivityEvents.length]);

  // Build WorkerConfig[] and WorkerDashboardState map for new components
  const assignedAvatars = assignWorkerAvatars(polledWorkerConfigs.map((w) => w.id));

  const workerConfigs: WorkerConfig[] = (connected && polledWorkerConfigs.length > 0)
    ? polledWorkerConfigs.map((w, i) => {
        // Name-based avatar: worker named "Heracles" gets heracles avatar, etc.
        const nameLower = w.name.toLowerCase() as WorkerAvatar;
        const nameAvatar = WORKER_AVATAR_POOL.includes(nameLower) ? nameLower : null;
        return {
          id: w.id,
          name: w.name,
          emoji: w.emoji ?? '',
          color: w.color,
          // Priority: name match > hash-based random > fallback index
          avatar: (nameAvatar || assignedAvatars.get(w.id) || w.avatar || WORKER_AVATAR_POOL[i % WORKER_AVATAR_POOL.length]) as WorkerAvatar,
          behavior: polledWorkerStates[w.id]?.behavior,
          skinToneIndex: i,
          projectPath: w.projectPath,
        } satisfies WorkerConfig;
      })
    : [];

  const workerStates: Record<string, WorkerDashboardState> = connected ? polledWorkerStates : {};

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
      [agentId]: appendChatMessage(prev[agentId] || [], userMsg),
    }));

    try {
      let content = '';
      let shouldAppendResponse = true;

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
        if (res.type === 'delegation') {
          // Show brief delegation confirmation; final result arrives via worker:task:summary event
          content = `🔄 \`@${mentionName}\`에게 작업을 위임했습니다. 완료 시 결과가 여기에 표시됩니다.`;
        }
      }

      if (shouldAppendResponse && content.trim()) {
        const agentMsg = { id: crypto.randomUUID(), role: 'agent' as const, content, timestamp: Date.now() };
        setChatMessages(prev => ({
          ...prev,
          [agentId]: appendChatMessage(prev[agentId] || [], agentMsg),
        }));
      }
    } catch (e) {
      const errorContent = `Error: ${(e as Error).message}`;
      const errorMsg = { id: crypto.randomUUID(), role: 'agent' as const, content: errorContent, timestamp: Date.now() };
      setChatMessages(prev => ({
        ...prev,
        [agentId]: appendChatMessage(prev[agentId] || [], errorMsg),
      }));
    }
  }, [chatWithGemini, chatWithCodex, polledWorkerConfigs]);

  // Worker task completion → ChatWindow message (only on failure; success waits for Codex summary)
  useEffect(() => {
    if (!lastWorkerCompletion) return;
    // On success, Codex summary (worker:task:summary) will provide the chat message
    if (lastWorkerCompletion.success) return;

    const { workerId, summary } = lastWorkerCompletion;
    const agentMsg = {
      id: crypto.randomUUID(),
      role: 'agent' as const,
      content: `❌ ${summary}`,
      timestamp: lastWorkerCompletion.timestamp,
    };

    setChatMessages(prev => ({
      ...prev,
      [workerId]: appendChatMessage(prev[workerId] || [], agentMsg),
    }));
  }, [lastWorkerCompletion?.timestamp]);

  // Worker task Codex summary → ChatWindow message (preferred over raw completion text)
  useEffect(() => {
    if (!lastWorkerSummary) return;

    const { workerId, summary } = lastWorkerSummary;
    const agentMsg = {
      id: crypto.randomUUID(),
      role: 'agent' as const,
      content: `✅ ${summary}`,
      timestamp: lastWorkerSummary.timestamp,
    };

    setChatMessages(prev => ({
      ...prev,
      [workerId]: appendChatMessage(prev[workerId] || [], agentMsg),
    }));
  }, [lastWorkerSummary?.timestamp]);

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
        ? appendChatMessage(existing, startedMsg)
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
      [workerId]: appendChatMessage(prev[workerId] || [], agentMsg),
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
      codex: appendChatMessage(prev['codex'] || [], agentMsg),
    }));
  }, [codexGreeting?.timestamp]);

  const handleDetailClick = useCallback((workerId: string) => {
    const next = selectedWorkerId === workerId ? null : workerId;
    setSelectedWorkerId(next);
    setMonitorSelectedWorkerId(next); // keep Monitor tab in sync
  }, [selectedWorkerId, setSelectedWorkerId]);

  const handleChatClick = useCallback((workerId: string) => {
    const w = workerConfigs.find(w => w.id === workerId);
    setMonitorSelectedWorkerId(workerId);
    setChatTarget(w ? { id: w.id, name: w.name, emoji: w.emoji, color: w.color } : { id: workerId, name: workerId });
  }, [workerConfigs]);

  const handleWorkerTerminalInput = useCallback((data: string) => {
    if (!selectedWorkerId) return;
    void sendWorkerInput(selectedWorkerId, data);
  }, [selectedWorkerId, sendWorkerInput]);

  const handleWorkerTerminalResize = useCallback((cols: number, rows: number) => {
    if (!selectedWorkerId) return;
    void resizeWorkerTerminal(selectedWorkerId, cols, rows);
  }, [selectedWorkerId, resizeWorkerTerminal]);

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

      {/* Connection State Banner */}
      {!connected && !hasEverConnected.current && (
        <div
          className="mx-6 mt-4 p-4 rounded-xl border flex items-center gap-3"
          style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(10,14,26,0.8)' }}
        >
          <div
            className="w-4 h-4 border-2 rounded-full animate-spin flex-shrink-0"
            style={{ borderColor: 'var(--accent-primary)', borderTopColor: 'transparent' }}
          />
          <span className="text-sm font-mono" style={{ color: 'var(--text-secondary)' }}>
            Gateway에 연결 중... — Gateway가 실행 중인지 확인하세요 (<code className="opacity-70">olympus server start</code>)
          </span>
        </div>
      )}
      {!connected && hasEverConnected.current && (
        <div
          className="mx-6 mt-4 p-3 rounded-lg border flex items-center gap-2"
          style={{ borderColor: 'rgba(255,180,0,0.35)', backgroundColor: 'rgba(255,180,0,0.06)' }}
        >
          <span className="text-yellow-400 flex-shrink-0">⚠</span>
          <span className="text-sm font-mono text-yellow-400">연결 끊김 — 재연결 중...</span>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 px-4 pb-8 mx-auto w-full max-w-[1680px]">
        {activeTab === 'console' && (
          <div className="mt-5 space-y-6">
            <section>
              <UsageBar data={connected ? usageData : null} />
            </section>

            {currentRunId && currentRun ? (
              <section className="space-y-6">
                <Card className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <span className="font-mono text-sm text-primary">{currentRunId}</span>
                    <span className="text-xs text-text-muted">
                      Phase {currentRun.phase}: {currentRun.phaseName}
                    </span>
                  </div>
                  {currentRun.status === 'running' && (
                    <button
                      onClick={() => cancel(currentRunId)}
                      className="text-xs text-error hover:text-error/80 transition-colors flex items-center gap-1"
                    >
                      Cancel
                    </button>
                  )}
                </Card>
                <PhaseProgress phase={phase} />
                <TaskList tasks={tasks} />
                <AgentStream agentStreams={agentStreams} />
              </section>
            ) : currentSessionId && currentSession ? (
              <SessionOutputPanel session={currentSession} outputs={sessionOutputs.filter(o => o.sessionId === currentSessionId)} screen={sessionScreens.get(currentSessionId!)} />
            ) : (
              <section className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
                <div ref={leftConsoleColumnRef} className="xl:col-span-3 space-y-6">
                  <Card className="rounded-2xl h-[248px] pb-2 flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>
                        Olympian Command
                      </h2>
                      <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                        codex / gemini
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
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
                  </Card>

                  <WorkerGrid
                    workers={workerConfigs}
                    workerStates={workerStates}
                    onChatClick={handleChatClick}
                    onDetailClick={handleDetailClick}
                  />

                  <div className="min-h-[420px] h-[clamp(420px,52vh,620px)]">
                    <WorkerTaskBoard tasks={workerTasks} />
                  </div>
                </div>

                <aside
                  className="xl:col-span-1 h-full min-h-0 flex flex-col gap-6"
                  style={isXlLayout && leftConsoleHeight > 0 ? { height: leftConsoleHeight } : undefined}
                >
                  <Card className="rounded-2xl shrink-0">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-3">
                        <h2 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>
                          Olympus Live Preview
                        </h2>
                        <button
                          type="button"
                          className="text-[11px] font-mono px-2 py-1 rounded-md border hover:bg-white/10 transition-colors"
                          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                          onClick={() => setActiveTab('monitor')}
                        >
                          Open Monitor
                        </button>
                      </div>
                      <div className="cursor-pointer h-[196px] xl:h-[208px]" onClick={() => setActiveTab('monitor')}>
                        <MiniOlympusMountain
                          workers={workerConfigs}
                          workerStates={workerStates}
                          codexConfig={codexConfig}
                          olympusMountainState={olympusMountainState}
                          onTick={tick}
                        />
                      </div>

                      <div
                        className="rounded-xl border p-3"
                        style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(8, 13, 26, 0.45)' }}
                      >
                        <h2 className="font-semibold text-lg mb-3" style={{ color: 'var(--text-primary)' }}>
                          Overview
                        </h2>
                        <SystemStats stats={systemStats} />
                      </div>
                    </div>
                  </Card>

                  <div className="flex-1 min-h-[220px] overflow-hidden">
                    <ActivityFeed
                      events={connected && polledActivityEvents.length > 0 ? polledActivityEvents.map(e => ({
                        id: e.id,
                        type: e.type,
                        agentName: e.agentName,
                        message: e.message,
                        timestamp: e.timestamp,
                        color: e.color,
                      })) : []}
                      height="100%"
                    />
                  </div>

                  {syncStatus.lastPollError && (
                    <Card>
                      <h3 className="font-semibold text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
                        Sync Warning
                      </h3>
                      <p className="text-xs font-mono" style={{ color: 'var(--accent-warning)' }}>
                        {syncStatus.lastPollError}
                      </p>
                    </Card>
                  )}
                </aside>
              </section>
            )}
          </div>
        )}

        {activeTab === 'monitor' && (
          <OlympusTempleMonitor
            connected={connected}
            workers={workerConfigs}
            workerStates={workerStates}
            workerTasks={workerTasks}
            activityEvents={connected && polledActivityEvents.length > 0 ? polledActivityEvents.map(e => ({
              id: e.id,
              type: e.type,
              agentName: e.agentName,
              message: e.message,
              timestamp: e.timestamp,
              color: e.color,
            })) : []}
            codexBehavior={connected ? polledCodexBehavior : 'supervising'}
            geminiBehavior={connected ? polledGeminiBehavior : 'offline'}
            geminiCurrentTask={polledGeminiCurrentTask}
            geminiLastAnalyzed={polledGeminiLastAnalyzed}
            selectedWorkerId={monitorSelectedWorkerId}
            olympusMountainState={olympusMountainState}
            codexConfig={codexConfig}
            geminiConfig={geminiConfig}
            onTick={tick}
            onSelectWorker={setMonitorSelectedWorkerId}
            onOpenWorkerChat={handleChatClick}
            onOpenWorkerTerminal={handleDetailClick}
            onOpenCodexChat={() => setChatTarget({ id: 'codex', name: 'Zeus', emoji: '\u26A1', color: '#FFD700' })}
            onOpenGeminiChat={() => setChatTarget({ id: 'gemini', name: 'Hera', emoji: '\uD83E\uDD89', color: '#CE93D8' })}
            formatTokens={formatTokens}
            formatRelativeTime={formatRelativeTime}
          />
        )}
      </main>

      <footer className="py-3 px-6 border-t text-center" style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(10, 14, 25, 0.72)' }}>
        <span className="text-xs font-mono" style={{ color: 'var(--text-secondary, #666)' }}>
          Gateway: {config.host}:{config.port}
          {config.apiKey && (
            <span className="ml-2" style={{ color: 'var(--accent-success, #4CAF50)' }}>Authenticated</span>
          )}
        </span>
      </footer>

      {/* Worker Log Panel — lazy loaded so xterm.js is not in the main chunk */}
      {selectedWorkerId && (
        <Suspense fallback={null}>
          <WorkerLogPanel
            key={selectedWorkerId}
            workerId={selectedWorkerId}
            workerConfig={workerConfigs.find(w => w.id === selectedWorkerId)}
            liveOutput={workers.get(selectedWorkerId)?.output ?? ''}
            connected={connected}
            onTerminalInput={handleWorkerTerminalInput}
            onTerminalResize={handleWorkerTerminalResize}
            onClose={() => setSelectedWorkerId(null)}
          />
        </Suspense>
      )}

      {/* ChatWindow */}
      {chatTarget && (() => {
        const isCodex = chatTarget.id === 'codex';
        const isGemini = chatTarget.id.startsWith('gemini');
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
        if (isCodex || isGemini) {
          details.push({ label: 'Sync', value: 'Dashboard + Telegram', color: 'var(--accent-success)' });
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
            if (!cfg.gateway) {
              setShowSettings(false);
              return;
            }

            // Parse gateway URL back to host:port (supports "host:port" and "http(s)://host:port").
            const normalized = cfg.gateway.url.trim().replace(/^https?:\/\//i, '');
            const parts = normalized.split(':');
            const host = parts[0] || config.host;
            const parsedPort = Number(parts[1]);
            const port = Number.isFinite(parsedPort) && parsedPort > 0 ? Math.floor(parsedPort) : config.port;
            const apiKey = cfg.gateway.token || config.apiKey;

            const gatewayChanged = host !== config.host || port !== config.port || apiKey !== config.apiKey;
            if (gatewayChanged) {
              handleConfigSave({ host, port, apiKey });
              return;
            }

            setShowSettings(false);
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
