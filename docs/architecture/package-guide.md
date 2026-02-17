# Olympus Package Guide

**Complete reference for all 10 packages in the Olympus monorepo.**

This guide is for new team members onboarding to Olympus development. Each section describes a package's purpose, key modules, dependencies, and usage patterns.

---

## Quick Reference

| Package | Purpose | Type | Tests | Build |
|---------|---------|------|-------|-------|
| `@olympus-dev/protocol` | Shared type definitions | Library | 0 | tsup |
| `@olympus-dev/core` | Task/context/orchestration | Library | 26 | tsup |
| `@olympus-dev/gateway` | HTTP/WebSocket server | Library | 131 | tsup |
| `@olympus-dev/client` | WebSocket client (shared) | Library | 0 | tsup |
| `@olympus-dev/web` | React dashboard (OlympusMountain v3) | App | 0 | Vite |
| `@olympus-dev/tui` | Terminal UI (Ink/React) | Library | 0 | tsup |
| `@olympus-dev/telegram-bot` | Telegram remote control | App | 15 | tsup |
| `@olympus-dev/codex` | Codex Orchestrator | Library | 34 | tsc |
| `olympus-dev` (cli) | Main CLI executable | Executable | 11 | tsup |
| `@olympus-dev/claude-dashboard` | Claude Code statusline plugin | Plugin | 0 | esbuild |

**Total: 217 tests** — gateway (131) + codex (34) + telegram-bot (15) + core (26) + cli (11)

---

## 1. @olympus-dev/protocol

**Shared type definitions and WebSocket message schemas.**

### Purpose

Protocol provides the contract between all other packages. It defines:
- Message types (WsMessage, RpcMessage)
- Domain models (Task, Context, Agent states)
- API contracts (RunParams, WorkerRegistration)
- Enums (AgentState, ContextScope, TaskStatus)

Any breaking change to protocol requires rebuild of all packages.

### Location

```
packages/protocol/
├── src/
│   ├── index.ts              ← Main export barrel
│   ├── messages.ts           ← WsMessage, RpcMessage unions
│   ├── rpc.ts                ← RpcMethods, RpcRequest/Response
│   ├── agent.ts              ← AgentState, AgentEvent, AgentHistoryEntry
│   ├── task.ts               ← Task, TaskStatus, TodoItem
│   ├── context.ts            ← Context, ContextScope, ContextVersion
│   ├── cli-runner.ts         ← CliRunParams, CliResult, CliStreamChunk
│   ├── worker.ts             ← RegisteredWorker, WorkerTaskRecord
│   ├── codex.ts              ← CodexSession, CodexMessage
│   ├── local-context.ts      ← ExtractedContext, ProjectContextSnapshot
│   ├── gemini-advisor.ts     ← GeminiProjectAnalysis, GeminiStatus
│   ├── usage.ts              ← UsageTracker, TokenCount
│   ├── helpers.ts            ← assertNever, parseRoute, etc.
│   └── constants.ts          ← Time constants, status codes
├── tsconfig.json
└── package.json
```

### Key Exports

```typescript
// Messages
export interface WsMessage { type: string; payload: unknown }
export type RpcRequest = { method: string; params: unknown; id: string }

// Domain
export interface Task { id: string; title: string; status: TaskStatus; ... }
export interface Context { id: string; content: string; scope: ContextScope; ... }
export enum AgentState { idle | working | reviewing | deploying | ... }

// API
export interface CliRunParams { prompt: string; model?: string; ... }
export interface RegisteredWorker { id: string; name: string; mode?: 'pty' | 'spawn'; ... }

// Codex
export interface CodexSession { id: string; thread_id?: string; ... }
export interface CodexMessage { role: 'user' | 'assistant'; content: string }

// Local Context
export interface ExtractedContext { files: string[]; decisions: string[] ... }
export interface ProjectContextSnapshot { workerContexts: WorkerContextRecord[] ... }

// Gemini Advisor
export interface GeminiProjectAnalysis {
  timestamp: number;
  codeStructure?: string;
  workHistory?: string;
  ...
}
```

### Dependencies

None (base package).

### Build

```bash
pnpm -F @olympus-dev/protocol build  # tsup → dist/index.js + dist/index.d.ts
```

### When to Update

- Adding new agent types or states
- Changing API contracts
- Introducing new domain models (Workers, Codex sessions)
- Modifying WebSocket message formats

**Always increment version when changing protocol** — dependent packages must rebuild.

---

## 2. @olympus-dev/core

**Orchestration engine, task/context storage, local context extraction.**

### Purpose

Core is the central engine for task orchestration, context management, and rule-based knowledge extraction.

Key responsibilities:
- **Orchestrator**: Coordinates CLI runs, manages async operations
- **Task/Context Stores**: SQLite persistence (tasks, contexts, versions)
- **Local Context Store**: Rule-based extraction of project structure + worker history
- **Context Service**: Querying and resolving context dependencies
- **Wisdom**: Pattern learning and lesson storage

### Location

```
packages/core/
├── src/
│   ├── index.ts                      ← Main exports
│   ├── orchestrator.ts               ← Task execution, run lifecycle
│   ├── taskStore.ts                  ← Task CRUD + tree hierarchy
│   ├── contextStore.ts               ← Context CRUD + versioning + merge
│   ├── contextService.ts             ← Context queries + dependency resolution
│   ├── local-context-store.ts        ← SQLite FTS5, project + root level
│   ├── context-extractor.ts          ← Rules engine (no LLM)
│   ├── contextResolver.ts            ← Link resolution + conflict detection
│   ├── wisdom.ts                     ← Pattern/lesson storage
│   ├── history.ts                    ← Context version history
│   ├── events.ts                     ← EventEmitter base class
│   ├── config.ts                     ← Runtime configuration
│   ├── types.ts                      ← Internal types
│   └── __tests__/                    ← 26 test files
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

### Key Classes

```typescript
// Orchestrator
export class Orchestrator extends EventEmitter {
  enqueueRun(params: CliRunParams): string
  getRunStatus(id: string): RunStatus | undefined
  cancelRun(id: string): void
  listRuns(): RunStatus[]
}

// Task Store
export class TaskStore {
  createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Task
  getTask(id: string): Task | undefined
  listRootTasks(): Task[]
  getTaskChildren(id: string): Task[]
  updateTask(id: string, updates: Partial<Task>): Task
  deleteTask(id: string): void
}

// Context Store
export class ContextStore {
  createContext(context: Omit<Context, 'id' | 'version' | ...>): Context
  getContext(id: string): Context | undefined
  updateContext(id: string, content: string, expectedVersion: number): Context
  listContextVersions(id: string): ContextVersion[]
  mergeContexts(sourceId: string, targetId: string): void
}

// Local Context Store
export class LocalContextStore {
  extractContext(paths: string[]): ExtractedContext
  getProjectContext(): ProjectContextSnapshot
  getRootContext(): RootProjectEntry[]
  queryWorkerHistory(maxRecords: number): WorkerContextRecord[]
}

// Wisdom
export class Wisdom {
  addLesson(lesson: string): void
  addPattern(pattern: string): void
  getLessons(): string[]
  getPatterns(): string[]
}
```

### Dependencies

```json
{
  "@olympus-dev/protocol": "workspace:*",
  "better-sqlite3": "^11.8.1",
  "nanoid": "^5.1.5"
}
```

### Tests

26 test files covering:
- Task CRUD + hierarchy
- Context versioning + merging
- Rule-based extraction
- Query performance

```bash
pnpm -F @olympus-dev/core test
```

### Build

```bash
pnpm -F @olympus-dev/core build  # tsup → dist/index.js + index.d.ts
```

### When to Use

**Core is used by**: gateway, codex, orchestration commands

**Do not directly instantiate Core in CLI**: gateway owns the Orchestrator instance and exposes it via HTTP API.

---

## 3. @olympus-dev/gateway

**HTTP/WebSocket server, CLI runner, session management, worker coordination.**

### Purpose

Gateway is the central hub for all runtime operations:
- **HTTP API**: RESTful endpoints for CLI runs, workers, contexts, tasks
- **WebSocket Server**: Real-time streaming of CLI output, agent events, session status
- **CliRunner**: Spawns Claude/Codex CLI processes, parses JSON/JSONL, manages concurrency
- **Worker Registry**: Manages PTY workers and task assignment
- **Codex Adapter**: Integrates Codex Orchestrator
- **Gemini Advisor**: Context enrichment via Gemini CLI analysis

### Location

```
packages/gateway/
├── src/
│   ├── index.ts                      ← Main export (createServer)
│   ├── server.ts                     ← Express + WebSocket setup
│   ├── api.ts                        ← HTTP endpoint handlers
│   ├── cli-runner.ts                 ← spawnCli, runCli (ConcurrencyLimiter)
│   ├── cli-session-store.ts          ← SQLite session persistence
│   ├── session-manager.ts            ← JSON session registry
│   ├── worker-registry.ts            ← Worker CRUD + heartbeat
│   ├── codex-adapter.ts              ← Codex lifecycle + event routing
│   ├── gemini-advisor.ts             ← Gemini PTY + memory synthesizer
│   ├── gemini-pty.ts                 ← Gemini PTY initialization
│   ├── run-manager.ts                ← Async run orchestration
│   ├── usage-monitor.ts              ← Token/cost tracking
│   ├── auth.ts                       ← API key validation
│   ├── auth-nonce.ts                 ← Nonce generation
│   ├── cors.ts                       ← CORS configuration
│   ├── agent/                        ← Agent orchestration pipeline
│   │   ├── agent.ts                  ← CodexAgent core
│   │   ├── command-queue.ts
│   │   ├── analyzer.ts
│   │   ├── planner.ts
│   │   ├── reviewer.ts
│   │   ├── reporter.ts
│   │   ├── security-guard.ts
│   │   ├── project-registry.ts
│   │   ├── prompts.ts
│   │   ├── providers/
│   │   └── types.ts
│   ├── memory/                       ← Pattern learning
│   │   ├── store.ts
│   │   ├── patterns.ts
│   │   ├── embeddings.ts
│   │   └── index.ts
│   ├── rpc/                          ← RPC method dispatch
│   │   └── index.ts
│   └── __tests__/                    ← 131 test files
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

### Key Classes

```typescript
// Server Setup
export function createServer(port: number): Server
export async function startGateway(options: GatewayOptions): Promise<void>

// CLI Runner (concurrency-limited spawning)
export class CliRunner {
  static async run(params: CliRunParams, onStream?: (chunk: string) => void): Promise<CliResult>
  static setMaxConcurrentCli(n: number): void
  static getConcurrencyInfo(): { current: number; max: number; queued: number }
}

// CLI Session Store (persistence)
export class CliSessionStore {
  saveSesion(sessionData: CliSessionData): void
  loadSession(id: string): CliSessionData | undefined
  listSessions(): CliSessionData[]
  deleteSession(id: string): void
}

// Session Manager (JSON registry)
export class SessionManager {
  createSession(options: SessionOptions): Session
  getSession(id: string): Session | undefined
  listSessions(): Session[]
  terminateSession(id: string): void
}

// Worker Registry
export class WorkerRegistry {
  register(name: string, mode?: 'pty' | 'spawn'): RegisteredWorker
  unregister(id: string): void
  list(): RegisteredWorker[]
  heartbeat(id: string): void
  assignTask(workerId: string, task: WorkerTask): void
  reportTaskResult(taskId: string, result: WorkerTaskResult): void
}

// Codex Adapter
export class CodexAdapter {
  initSession(workDir: string): Promise<CodexSession>
  sendMessage(sessionId: string, message: string): Promise<CodexResponse>
  listSessions(): CodexSession[]
  terminateSession(sessionId: string): void
}

// Gemini Advisor
export class GeminiAdvisor extends EventEmitter {
  async start(): Promise<void>
  async refresh(): Promise<void>
  analyze(projectPath: string): Promise<GeminiProjectAnalysis>
  getStatus(): GeminiStatus
  getProjectAnalysis(path: string): GeminiProjectAnalysis | undefined
}
```

### Dependencies

```json
{
  "@olympus-dev/core": "workspace:*",
  "@olympus-dev/protocol": "workspace:*",
  "openai": "^4.77.0",
  "ws": "^8.18.0",
  "better-sqlite3": "^11.0.0",      // optional
  "node-pty": "^1.0.0"               // optional
}
```

### API Endpoints

#### CLI Runner
- `POST /api/cli/run` — Synchronous CLI execution (blocks until complete)
- `POST /api/cli/run/async` — Asynchronous CLI execution (returns taskId immediately)
- `GET /api/cli/run/:id/status` — Async task status
- `GET /api/cli/sessions` — Saved session list
- `DELETE /api/cli/sessions/:id` — Delete session

#### Workers
- `POST /api/workers/register` — Register worker
- `GET /api/workers` — Worker list
- `DELETE /api/workers/:id` — Delete worker
- `POST /api/workers/:id/heartbeat` — Worker heartbeat
- `POST /api/workers/:id/task` — Assign task to worker
- `POST /api/workers/tasks/:taskId/result` — Report task result
- `GET /api/workers/tasks/:taskId` — Task status

#### Tasks/Contexts
- `GET /api/tasks` — Root task list
- `POST /api/tasks` — Create task
- `GET /api/contexts` — Context list
- `POST /api/contexts` — Create context

#### Gemini Advisor
- `GET /api/gemini-advisor/status` — Status
- `GET /api/gemini-advisor/projects` — Cached analysis list
- `POST /api/gemini-advisor/refresh` — Manual refresh
- `POST /api/gemini-advisor/analyze/:encodedPath` — Analyze specific project

#### Health
- `GET /healthz` — Health check

### WebSocket Events

Client → Server:
- `connect` — Authentication + registration
- `subscribe` — Subscribe to run/session
- `unsubscribe` — Unsubscribe
- `cancel` — Cancel run
- `ping` — Heartbeat
- `rpc` — RPC method call

Server → Client:
- `connected` — Auth success
- `runs:list` — Run list updates
- `sessions:list` — Active session list
- `cli:stream` — CLI stdout chunks (real-time)
- `cli:complete` — CLI execution complete
- `gemini:status` — Gemini status updates
- `worker:task:assigned` — Task assigned to worker
- `worker:task:completed` — Task completed
- `agent:progress` — Agent progress
- `agent:result` — Agent result

### Key Architecture

**CliRunner Concurrency**:
```typescript
// ConcurrencyLimiter(5) — max 5 concurrent CLI spawns
class ConcurrencyLimiter {
  async run<T>(fn: () => Promise<T>): Promise<T> {
    while (queue.length >= maxConcurrent) await sleep(100)
    // execute fn
  }
}

// Usage
const result = await CliRunner.run(params, onStream)
CliRunner.setMaxConcurrentCli(10)  // adjust dynamically
```

**stdout Streaming**:
```typescript
// spawnCli → onStdout callback → runCli → params.onStream → server → cli:stream broadcast
spawnCli(args, {
  onStdout: (chunk) => {
    // broadcast to WebSocket clients
    wss.broadcast({ type: 'cli:stream', payload: { sessionId, chunk } })
  }
})
```

**Session Persistence**:
```typescript
// SQLite stores: session ID, model, tokens, cost, timestamp
// Enables: /api/cli/sessions list + restore
```

### Tests

131 test files covering:
- CliRunner concurrency limits
- JSONL parsing (Codex output)
- Session persistence
- Worker registration + explicit lifecycle
- WebSocket message routing
- API endpoint contracts

```bash
pnpm -F @olympus-dev/gateway test
```

### Build

```bash
pnpm -F @olympus-dev/gateway build  # tsup → dist/index.js + index.d.ts
```

### When to Use

**Gateway is used by**: CLI, Telegram Bot, Web Dashboard, TUI

**Do not call gateway functions directly from CLI code** — use HTTP API instead (enables remote execution and multi-client scenarios).

---

## 4. @olympus-dev/client

**Shared WebSocket client for TUI and Web.**

### Purpose

Client provides a unified interface for connecting to the Gateway WebSocket server. Used by both TUI and Web to receive real-time updates.

Key responsibilities:
- WebSocket connection management
- Auto-reconnect with exponential backoff
- Message subscription/unsubscription
- RPC method calls
- Event type safety

### Location

```
packages/client/
├── src/
│   ├── index.ts              ← Main OlympusClient export
│   └── __tests__/            ← Connection tests (minimal)
├── tsconfig.json
└── package.json
```

### Key Classes

```typescript
export class OlympusClient extends EventEmitter {
  constructor(url: string, apiKey: string)

  // Lifecycle
  connect(): Promise<void>
  disconnect(): void
  isConnected(): boolean

  // Subscriptions
  subscribe(type: string, handler: (msg: WsMessage) => void): () => void
  unsubscribe(type: string, handler: (msg: WsMessage) => void): void

  // RPC
  call<T>(method: string, params: unknown): Promise<T>

  // Event emission
  on(event: string, listener: (...args: any[]) => void): this
  once(event: string, listener: (...args: any[]) => void): this
  off(event: string, listener: (...args: any[]) => void): this
}
```

### Dependencies

```json
{
  "@olympus-dev/protocol": "workspace:*"
}
```

### Usage Example

```typescript
import { OlympusClient } from '@olympus-dev/client'

const client = new OlympusClient('ws://localhost:8080', 'sk-...')

// Connect
await client.connect()

// Subscribe to agent progress
client.subscribe('agent:progress', (msg) => {
  console.log('Agent progress:', msg.payload)
})

// Call RPC method
const runs = await client.call('getRuns', {})

// Disconnect
client.disconnect()
```

### Build

```bash
pnpm -F @olympus-dev/client build  # tsup → dist/index.js + index.d.ts
```

### When to Use

Use `OlympusClient` in:
- TUI components (for WebSocket events)
- Web dashboard (React hooks via useOlympus)
- Any external tool that needs to connect to the Gateway

---

## 5. @olympus-dev/web

**React dashboard (OlympusMountain v3 theme).**

### Purpose

Web is the primary UI for monitoring and interacting with the Olympus platform. It displays:
- Real-time CLI execution output (LiveOutputPanel)
- Agent history and status (AgentHistoryPanel)
- OlympusMountain visualization (20 god avatars, 10 zones, Greek mythology theme)
- Worker status and context
- Token usage + cost tracking

Olympus Mountain represents the state of agents and workers:
- **Zones**: gods_plaza, zeus_temple, sanctuary_0~5, oracle_stone, athenas_library, etc.
- **Behaviors**: idle, working, reviewing, deploying, celebrating, meditating
- **Avatars**: Codex (Zeus), 20 Greek mythology-based worker avatars (Hera, Athena, Apollo, etc.)

### Location

```
packages/web/
├── src/
│   ├── index.html                    ← Entry point
│   ├── main.tsx                      ← React root
│   ├── App.tsx                       ← Router + layout
│   ├── hooks/
│   │   ├── useOlympus.ts            ← WebSocket + state management (main hook)
│   │   ├── useOlympusMountain.ts    ← Mount visualization state
│   │   └── useContextTree.ts        ← Context hierarchy rendering
│   ├── components/
│   │   ├── dashboard/
│   │   │   ├── Dashboard.tsx        ← Main dashboard view
│   │   │   ├── SystemStats.tsx
│   │   │   ├── SessionCostTracker.tsx
│   │   │   └── AgentHistoryPanel.tsx
│   │   ├── olympus-mountain/
│   │   │   ├── OlympusMountainCanvas.tsx
│   │   │   ├── MiniOlympusMountain.tsx
│   │   │   ├── Controls.tsx
│   │   │   └── ZoneLabel.tsx
│   │   ├── LiveOutputPanel.tsx       ← Real-time CLI output streaming
│   │   └── ContextTree.tsx
│   ├── olympus-mountain/
│   │   ├── zones.ts                 ← Zone definitions (10 zones)
│   │   ├── behaviors.ts             ← Animation behaviors (18 animations)
│   │   ├── layout.ts                ← Canvas layout + positioning
│   │   ├── engine/
│   │   │   ├── canvas.ts            ← Canvas rendering engine
│   │   │   ├── renderer.ts
│   │   │   └── particle.ts
│   │   ├── sprites/
│   │   │   ├── avatars.ts           ← God avatars (20 + Codex/Gemini/Athena)
│   │   │   ├── furniture.ts
│   │   │   ├── particles.ts
│   │   │   └── animations.ts
│   │   ├── config.ts                ← AVATAR_OPTIONS, zone colors, etc.
│   │   └── lib/
│   │       ├── types.ts             ← WorkerAvatar, CharacterAnim, etc.
│   │       └── math.ts              ← Positioning calculations
│   ├── styles/
│   │   ├── globals.css
│   │   ├── dashboard.css
│   │   └── olympus-mountain.css
│   └── types/
│       └── index.ts                 ← Shared React types
├── vite.config.ts
├── tsconfig.json
└── package.json
```

### Key Hooks

```typescript
// Main orchestration hook
export function useOlympus() {
  // WebSocket connection + auth
  // Real-time streams: runs, sessions, cli output, gemini status, agent events
  // State: { runs, sessions, cliStreams, agents, gemini, workers, ... }
  return {
    connected: boolean
    runs: Run[]
    sessions: Session[]
    cliStreams: Map<string, CliStreamState>
    agents: AgentHistoryEntry[]
    gemini: GeminiStatus
    workers: RegisteredWorker[]
    // Methods
    executeCliRun(prompt: string): Promise<CliResult>
    subscribeToRun(runId: string): void
    unsubscribeFromRun(runId: string): void
  }
}

// Mount visualization state
export function useOlympusMountain() {
  // Tracks worker positions, animations, behaviors
  // Syncs with Olympus state (agent events → zone transitions)
  return {
    workers: WorkerAvatar[]
    zones: ZoneState[]
    animations: AnimationState[]
    updateWorkerPosition(workerId: string, zoneId: string): void
    triggerAnimation(workerId: string, behavior: Behavior): void
  }
}

// Context hierarchy rendering
export function useContextTree() {
  return {
    contexts: ContextNode[]
    expandedIds: Set<string>
    toggleExpand(id: string): void
    navigateToContext(id: string): void
  }
}
```

### OlympusMountain Zones (10 total)

| Zone ID | Name | Purpose | Worker Behavior |
|---------|------|---------|-----------------|
| `gods_plaza` | Gods' Plaza | Central gathering | idle (free movement) |
| `zeus_temple` | Zeus Temple | Command center | working (active) |
| `sanctuary_0~5` | Personal Sanctuaries | Team workspaces | working (focused) |
| `oracle_stone` | Oracle Stone | Review/analysis | reviewing (judgement) |
| `oracle_chamber` | Oracle Chamber | Deployment/release | deploying (final action) |
| `athenas_library` | Athena's Library | Knowledge/context | idle (studying) |
| `agora` | Agora (Marketplace) | Communication | celebrating (success) |
| `olympus_garden` | Olympus Garden | Rest/meditation | meditating (recovery) |
| `propylaea` | Propylaea (Gate) | Entry point | idle (awaiting) |
| `ambrosia_hall` | Ambrosia Hall | Sustenance | idle (gathering) |

### Worker Avatar System

**20 Greek gods** + 3 special:
- Codex = Zeus (golden crown, lightning)
- Gemini = Athena (owl crown, wisdom aura)
- Special: Hera, Apollo, Artemis, Ares, Aphrodite, Hephaestus, Demeter, Poseidon, Hades, Hermes, Pan, Bacchus, Nike, Iris, Eris, Hecate, Nyx, Selene, Eos

**Character Animations** (18 total):
- idle_standing, idle_seated, idle_floating
- walk_forward, walk_backward, run
- jump, fall, land
- celebrate_victory, celebrate_success
- meditate_breathing, meditate_levitate
- thinking_hand_on_chin, thinking_pondering
- beckoning, waving

**Particles** (13 types):
- sparkles, stars, lightning, fire, water, smoke, mist, dust, leaves, petals, snow, aurora, magic_orbs

### Dependencies

```json
{
  "@olympus-dev/client": "workspace:*",
  "@olympus-dev/protocol": "workspace:*",
  "react": "^18.3.1",
  "react-dom": "^18.3.1"
}
```

### Build

```bash
pnpm -F @olympus-dev/web build  # tsc + Vite → dist/ (321KB JS + 31.6KB CSS)
```

### Development

```bash
pnpm -F @olympus-dev/web dev    # Vite dev server on http://localhost:5173
```

### Important Notes

**Type Synchronization**: Always keep these files in sync:
- `engine/canvas.ts` — WorkerAvatar, CharacterAnim, FurnitureType, Particle
- `lib/types.ts` — Same types + documentation
- `config.ts` — AVATAR_OPTIONS, CODEX_AVATAR_OPTIONS, DEFAULT_WORKERS

**localStorage**: Dashboard preserves active tab on refresh via `olympus-active-tab` key.

**Responsive Design**: Console tab max-w-[1600px], Monitor tab max-w-[80vw] for wide displays.

---

## 6. @olympus-dev/tui

**Terminal UI built with Ink and React.**

### Purpose

TUI provides a terminal-based alternative to the Web dashboard. Uses Ink to render React components in the terminal.

Key displays:
- Real-time CLI output
- Active runs
- Agent status
- Worker list
- Session info

### Location

```
packages/tui/
├── src/
│   ├── index.ts              ← Main export (createTui)
│   ├── components/
│   │   ├── App.tsx           ← Root TUI component
│   │   ├── LiveOutput.tsx    ← Real-time CLI streaming
│   │   ├── Runs.tsx          ← Run list
│   │   ├── Sessions.tsx      ← Active sessions
│   │   ├── Workers.tsx       ← Worker status
│   │   ├── Status.tsx        ← Health + connectivity
│   │   └── Help.tsx          ← Keyboard shortcuts
│   └── __tests__/            ← Connection tests
├── tsconfig.json
└── package.json
```

### Key Exports

```typescript
export async function createTui(options: TuiOptions): Promise<TuiInstance>

export interface TuiInstance {
  render(): void
  unmount(): void
  updateState(updates: Partial<TuiState>): void
}

export interface TuiState {
  connected: boolean
  runs: Run[]
  sessions: Session[]
  workers: RegisteredWorker[]
  selectedTab: 'runs' | 'sessions' | 'workers' | 'output'
}
```

### Dependencies

```json
{
  "@olympus-dev/client": "workspace:*",
  "@olympus-dev/protocol": "workspace:*",
  "ink": "^5.1.0",
  "react": "^18.3.1",
  "ws": "^8.18.0"
}
```

### Build

```bash
pnpm -F @olympus-dev/tui build  # tsup → dist/index.js + index.d.ts
```

### When to Use

Use TUI via `olympus tui` command for:
- Remote CLI sessions (SSH, terminals without X11)
- Lightweight monitoring (Raspberry Pi, embedded systems)
- Scripted automation (CI/CD pipelines)

---

## 7. olympus-dev (CLI)

**Main executable, CLI commands, PTY worker, argument parsing.**

### Purpose

CLI is the entry point for all Olympus operations. It:
- Spawns the Gateway server
- Launches Claude CLI with PTY mode (shows TUI)
- Routes commands (server, start, dashboard, etc.)
- Manages PTY workers for background agents
- Synchronizes models and configurations

**Bin entry**: `olympus` → `packages/cli/dist/index.js`

### Location

```
packages/cli/
├── src/
│   ├── index.ts                      ← Commander setup + main exports
│   ├── claude-wrapper.ts             ← Claude CLI invocation
│   ├── pty-worker.ts                 ← PTY lifecycle + completion detection
│   ├── model-sync.ts                 ← Model syncing logic
│   ├── commands/
│   │   ├── server.ts                 ← `olympus server start`
│   │   ├── start.ts                  ← `olympus start` (PTY mode, default)
│   │   ├── gateway.ts                ← `olympus gateway` (internal)
│   │   ├── dashboard.ts              ← `olympus dashboard` (launch web)
│   │   ├── telegram.ts               ← `olympus telegram` (launch bot)
│   │   ├── tui.ts                    ← `olympus tui` (launch TUI)
│   │   ├── setup.ts                  ← `olympus setup` (initial config)
│   │   ├── quickstart.ts             ← `olympus quickstart`
│   │   ├── interactive.ts            ← `olympus interactive` (REPL)
│   │   ├── config.ts                 ← `olympus config` (view/set config)
│   │   └── models.ts                 ← `olympus models` (list/sync models)
│   ├── repl/
│   │   ├── index.ts                  ← REPL implementation
│   │   └── evaluator.ts
│   ├── utils/
│   │   ├── strip-ansi.ts             ← Custom ANSI removal (4 patterns)
│   │   ├── which.ts                  ← Executable PATH search
│   │   └── index.ts                  ← Helpers
│   └── __tests__/                    ← 11 test files
├── tsup.config.ts                    ← tsup configuration
├── tsconfig.json
└── package.json
```

### Key Commands

```bash
# Main entry point (PTY mode, shows Claude CLI TUI)
olympus start

# Trust mode (skip permission prompts)
olympus start-trust

# Full server (Gateway + Dashboard + Telegram Bot + TUI)
olympus server start

# Launch individual services
olympus gateway
olympus dashboard
olympus telegram
olympus tui

# Configuration
olympus config get
olympus config set --model claude-opus-4-6
olympus models list
olympus models sync

# Interactive REPL
olympus interactive

# Initial setup
olympus setup
olympus quickstart

# Help
olympus --help
olympus start --help
```

### Key Classes

```typescript
// Claude CLI Wrapper
export class ClaudeWrapper {
  constructor(cwd?: string)

  spawn(args: string[], options?: SpawnOptions): ChildProcess
  runSync(prompt: string, options?: RunOptions): CliResult
  runAsync(prompt: string): Promise<CliResult>
}

// PTY Worker (background agent mode)
export class PtyWorker extends EventEmitter {
  constructor(cwd: string, args: string[])

  initialize(): Promise<void>
  submit(prompt: string): Promise<string>
  detectCompletion(): Promise<CompletionResult>
  terminate(): void

  on('output', (chunk: string) => void)
  on('complete', (result: CompletionResult) => void)
  on('error', (error: Error) => void)
}
```

### PTY Worker Architecture (Key Feature)

**Pattern-Based Completion Detection** (no time-based timeouts):

1. **Prompt Pattern Match** (settle timer 5s) — Detects Claude CLI prompt via IDLE_PROMPT_PATTERNS
2. **Background Agent Detection** — 7 patterns with 30s cooldown suppress premature completion

**Background Agent Detection** (7 patterns):
- "Task completed"
- "Conversation compacted"
- "Agent finished"
- Work-related patterns

**Cooldown Logic** (30s AGENT_COOLDOWN_MS):
- Resets settle timer
- Extends inactivity timeout
- Prevents premature completion

**Example**:
```typescript
const worker = new PtyWorker(process.cwd(), ['claude', '-p', '--output-format', 'json'])
await worker.initialize()

const result = await worker.submit('Analyze this code')
// → Waits 5s for prompt, detects completion, returns result

worker.on('complete', (result) => {
  console.log('Result:', result.output)
  console.log('Tokens:', result.tokenUsage)
})
```

### strip-ansi Utility

Custom ANSI code removal (no npm dependency):

```typescript
export function stripAnsi(str: string): string {
  // Removes:
  // - CSI sequences (e.g. \x1b[1;31m)
  // - OSC sequences (e.g. \x1b]8;;\x07)
  // - Charset selections (e.g. \x1b(B)
  // - 2-char codes (e.g. \x1b>)
  return str.replace(/...\x1b.../g, '')
}
```

### Dependencies

```json
{
  "@olympus-dev/client": "workspace:*",
  "@olympus-dev/codex": "workspace:*",
  "@olympus-dev/core": "workspace:*",
  "@olympus-dev/gateway": "workspace:*",
  "@olympus-dev/protocol": "workspace:*",
  "@olympus-dev/telegram-bot": "workspace:*",
  "@olympus-dev/tui": "workspace:*",
  "chalk": "^5.4.0",
  "commander": "^13.1.0",
  "ink": "^5.1.0",
  "node-pty": "^1.1.0",
  "ora": "^8.2.0",
  "react": "^18.3.1",
  "ws": "^8.18.0"
}
```

### Tests

11 test files covering:
- Commander routing
- PTY completion detection
- ANSI stripping
- Model sync

```bash
pnpm -F olympus-dev test
```

### Build

```bash
pnpm -F olympus-dev build  # tsup → dist/index.js (+ make executable)
```

### Installation

```bash
pnpm install
pnpm build
npm link packages/cli
olympus --version
```

### When to Use

CLI is the user-facing interface. Users interact with Olympus primarily through:
- `olympus start` — most common (Claude CLI + Gateway in one process)
- `olympus server start` — run full stack (Gateway + Dashboard + Telegram + TUI)
- `olympus setup` — initial configuration

---

## 8. @olympus-dev/telegram-bot

**Telegram remote control via Telegraf library.**

### Purpose

Telegram Bot enables remote interaction with Olympus through Telegram. Users can:
- Execute CLI commands via @mention: `@olympus_bot task description`
- Query worker status: `/workers`
- Initiate team mode: `/team task description`
- Poll long-running tasks asynchronously
- Receive real-time notifications

### Location

```
packages/telegram-bot/
├── src/
│   ├── index.ts              ← Main entry, bot.launch()
│   ├── commands/
│   │   ├── start.ts          ← /start command
│   │   ├── health.ts         ← /health command
│   │   ├── workers.ts        ← /workers command
│   │   ├── team.ts           ← /team command
│   │   └── handlers.ts       ← Message handlers
│   ├── services/
│   │   ├── cli-executor.ts   ← Execute CLI via Gateway API
│   │   ├── worker-delegator.ts
│   │   └── polling.ts        ← Task polling
│   ├── types.ts              ← Telegram message types
│   ├── error-utils.ts        ← Error handling
│   └── __tests__/            ← 15 test files
├── tsconfig.json
└── package.json
```

### Key Features

**Commands**:
```bash
/start         # Welcome message + help
/health        # Gateway health check
/workers       # List all workers
/team          # Start team mode with task description
```

**Inline Queries** (type `@botName`):
- Display worker list for direct @mention

**@mention Delegation** (type `@botName task description`):
- Execute task on first available worker
- Return result in chat

### Key Functions

```typescript
// Bot initialization
export async function createTelegramBot(options: TelegramBotOptions): Promise<Telegraf>

// Execute CLI command (sync)
export async function executeCliCommand(
  chat_id: number,
  prompt: string,
  model?: string
): Promise<CliResult>

// Delegate to worker (async with polling)
export async function delegateToWorker(
  chat_id: number,
  workerId: string,
  task: WorkerTask
): Promise<void>

// Poll task result
export async function pollWorkerTask(
  taskId: string,
  maxAttempts?: number
): Promise<WorkerTaskResult>
```

### Architecture

**Sync Execution** (quick commands):
```
User @mention → Telegraf handler → executeCliCommand()
  → POST /api/cli/run → response.json → Telegram reply
```

**Async Execution** (long tasks):
```
User /team command → Telegraf handler → POST /api/cli/run/async
  → returns taskId → polling loop → WorkerRegistry → task result → Telegram reply
```

### Dependencies

```json
{
  "telegraf": "^4.16.3",
  "ws": "^8.18.1",
  "@olympus-dev/protocol": "workspace:*"
}
```

### Environment Variables

```bash
TELEGRAM_BOT_TOKEN=<bot-token>        # From BotFather
GATEWAY_URL=http://localhost:8080     # Gateway server
GATEWAY_API_KEY=sk-...                # API key
```

### Tests

15 test files covering:
- Command routing
- Message parsing
- Worker delegation
- Error handling
- Polling timeout

```bash
pnpm -F @olympus-dev/telegram-bot test
```

### Build

```bash
pnpm -F @olympus-dev/telegram-bot build  # tsup → dist/index.js
```

### Running

```bash
# Via CLI
olympus telegram

# Standalone
pnpm -F @olympus-dev/telegram-bot start
```

### When to Use

Telegram Bot is useful for:
- Remote execution from mobile (Telegram always available)
- Integration with Telegram groups/channels
- Quick status checks (`/health`, `/workers`)
- Asynchronous task delegation (@mention)

---

## 9. @olympus-dev/codex

**Codex Orchestrator — Session management, routing, agent coordination.**

### Purpose

Codex Orchestrator manages the lifecycle of Codex CLI sessions. It:
- Creates and maintains Codex sessions (thread-based)
- Routes CLI commands to appropriate Codex sessions
- Parses JSONL output (thread, turn, item events)
- Coordinates agent task assignment
- Tracks active tasks

### Location

```
packages/codex/
├── src/
│   ├── index.ts                      ← Main export (CodexOrchestrator)
│   ├── orchestrator.ts               ← Session lifecycle + routing
│   ├── session-manager.ts            ← In-memory session registry
│   ├── router.ts                     ← Command routing logic
│   ├── response-processor.ts         ← JSONL parsing + event handling
│   ├── agent-brain.ts                ← Agent decision logic
│   ├── types.ts                      ← Session, Route, Event types
│   └── __tests__/                    ← 34 test files
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

### Key Classes

```typescript
export class CodexOrchestrator extends EventEmitter {
  constructor(options: OrchestratorOptions)

  // Session lifecycle
  createSession(workDir: string, trustMode?: boolean): Promise<CodexSession>
  getSession(id: string): CodexSession | undefined
  listSessions(): CodexSession[]
  terminateSession(id: string): Promise<void>

  // Command execution
  execute(sessionId: string, prompt: string): Promise<CodexResponse>
  resume(sessionId: string, threadId: string, prompt: string): Promise<CodexResponse>

  // Task tracking
  trackTask(sessionId: string, taskId: string): void
  completeTask(taskId: string, result: string): void
  getActiveTasks(): ActiveCliTask[]
}

export class SessionManager {
  createSession(id: string, options: SessionOptions): CodexSession
  getSession(id: string): CodexSession | undefined
  updateSessionState(id: string, updates: Partial<CodexSession>): void
  deleteSession(id: string): void
}
```

### JSONL Parsing

Codex outputs JSONL (JSON Lines). Each line is a separate event:

```json
{"type": "thread", "id": "thread-123", ...}
{"type": "turn", "thread_id": "thread-123", ...}
{"type": "item", "turn_id": "turn-456", "content": "..."}
```

Response processor unpacks this into structured events.

### Dependencies

```json
{
  "@olympus-dev/protocol": "workspace:*",
  "@olympus-dev/core": "workspace:*",
  "better-sqlite3": "^11.0.0"  // optional
}
```

### Tests

34 test files covering:
- Session creation + lifecycle
- JSONL parsing
- Routing logic
- Task tracking
- Error recovery

```bash
pnpm -F @olympus-dev/codex test
```

### Build

```bash
pnpm -F @olympus-dev/codex build  # tsc → dist/
```

### When to Use

Codex Orchestrator is used by:
- Gateway (via CodexAdapter)
- Team Engineering Protocol
- Multi-turn agent conversations

---

## 10. @olympus-dev/claude-dashboard

**Claude Code statusline plugin — Token tracking, cost display, model name, i18n.**

### Purpose

Claude Dashboard is a statusline plugin for Claude Code. It displays:
- Model name
- Current token usage / context window size
- Total cost (USD)
- Language-aware formatting (i18n)

**Output Format**: One-liner suitable for terminal statusline (max 80 chars)

Example:
```
Claude 3.5 Sonnet (180K / 200K tokens) | $0.85
```

### Location

```
packages/claude-dashboard/
├── src/
│   ├── index.ts              ← Main statusline formatter
│   ├── formatter.ts          ← Output formatting
│   ├── config.ts             ← i18n + defaults
│   └── __tests__/            ← Unit tests
├── scripts/
│   └── build.js              ← esbuild script
└── package.json
```

### Key Function

```typescript
export function formatStatusline(input: StatuslineInput): string

export interface StatuslineInput {
  model?: { display_name?: string }
  context_window?: {
    context_window_size: number
    current_usage: {
      input_tokens: number
      cache_creation_input_tokens: number
      cache_read_input_tokens: number
    }
  }
  cost?: { total_cost_usd: number }
}
```

### Usage

Claude Code reads stdin (JSON) and pipes to the plugin:

```bash
echo '{"model":{"display_name":"Opus"},...}' | node claude-dashboard/dist/index.js
# Output: Claude Opus (180K / 200K) | $0.85
```

### Build

```bash
pnpm -F @olympus-dev/claude-dashboard build  # esbuild → dist/index.js (65KB)
```

### When to Use

Claude Dashboard integrates with Claude Code's statusline. Users should not invoke directly.

---

## Build Pipeline

### Dependency Order

Packages with zero internal dependencies:
1. `@olympus-dev/protocol` (base)

Packages depending on protocol only:
2. `@olympus-dev/client`
3. `@olympus-dev/telegram-bot`

Packages depending on protocol + core:
4. `@olympus-dev/core` (depends on protocol)
5. `@olympus-dev/codex` (depends on protocol + core)
6. `@olympus-dev/gateway` (depends on core + protocol)

Packages depending on multiple:
7. `@olympus-dev/tui` (depends on client + protocol)
8. `@olympus-dev/web` (depends on client + protocol)

Final aggregator:
9. `olympus-dev` (cli) — depends on ALL

Plugin (standalone):
10. `@olympus-dev/claude-dashboard` — no dependencies

### Build Commands

```bash
# Build all packages (Turbo resolves order)
pnpm build

# Build specific package
pnpm -F @olympus-dev/protocol build
pnpm -F @olympus-dev/core build
pnpm -F @olympus-dev/gateway build

# Watch mode
pnpm -F <package> dev

# Clean before rebuild
pnpm clean
pnpm build
```

### Test Commands

```bash
# All tests (521 total)
pnpm test

# Specific package
pnpm -F @olympus-dev/gateway test
pnpm -F @olympus-dev/core test

# Watch mode
pnpm -F <package> test:watch
```

### Lint Commands

```bash
# TypeScript check all packages
pnpm lint

# Specific package
pnpm -F @olympus-dev/core lint
```

### Web Build

```bash
# Development
pnpm -F @olympus-dev/web dev

# Production
pnpm -F @olympus-dev/web build  # → dist/ (321KB JS + 31.6KB CSS)

# Preview
pnpm -F @olympus-dev/web preview
```

---

## Adding a New Package

Follow these steps to add a new package to the Olympus monorepo:

### 1. Create Directory Structure

```bash
mkdir -p packages/my-package/src
mkdir -p packages/my-package/__tests__
```

### 2. Create package.json

```json
{
  "name": "@olympus-dev/my-package",
  "version": "1.0.0",
  "type": "module",
  "description": "Description of my package",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@olympus-dev/protocol": "workspace:*"
  },
  "devDependencies": {
    "tsup": "^8.5.0",
    "vitest": "^3.0.0"
  }
}
```

### 3. Create tsconfig.json

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src"],
  "exclude": ["**/*.test.ts", "**/__tests__"]
}
```

### 4. Create vitest.config.ts (if adding tests)

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json']
    }
  }
})
```

### 5. Create src/index.ts

```typescript
export * from './my-module.ts'

// Main class/function
export class MyClass {
  // implementation
}
```

### 6. Create tsup.config.ts (if using tsup)

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true
})
```

### 7. Add to monorepo (automatic)

pnpm workspace auto-detects packages in `packages/*/package.json`.

Verify:
```bash
pnpm -F @olympus-dev/my-package build
```

### 8. Import from CLI

Edit `packages/cli/package.json`:
```json
{
  "dependencies": {
    "@olympus-dev/my-package": "workspace:*"
  }
}
```

Then rebuild:
```bash
pnpm install
pnpm build
```

### Best Practices

1. **Keep dependencies minimal** — only import what you use
2. **Use workspace: protocol** — always depend on protocol for types
3. **Test from the start** — add tests alongside implementation
4. **Document public API** — export types, not implementations
5. **Follow naming conventions** — PascalCase for classes, camelCase for functions
6. **Use barrel exports** — src/index.ts should re-export all public APIs

---

## Troubleshooting

### Build Fails

**Error**: `Cannot find module '@olympus-dev/protocol'`

**Solution**: Run `pnpm install` at root to link workspace packages.

### Tests Fail

**Error**: `vitest not found`

**Solution**: Check `package.json` has `vitest` in devDependencies, then `pnpm install`.

**Error**: ESM spawn mock not working

**Solution**: ESM doesn't support `vi.spyOn(cp, 'spawn')`. Focus on pure function tests instead. Use integration tests for spawn behavior.

### TypeScript Errors

**Error**: `Type '<Type>' is not assignable to type '<Type>'`

**Solution**: Check protocol was rebuilt. Run `pnpm -F @olympus-dev/protocol build` first.

### Installation Failed

**Error**: `node-pty build failed`

**Solution**: node-pty requires build tools (python, g++). On macOS, ensure Xcode CLI tools: `xcode-select --install`. On Windows, use `npm install --global windows-build-tools`.

### better-sqlite3 Errors

**Error**: `Better-sqlite3 not found`

**Solution**: better-sqlite3 is optional for some packages. Install with: `pnpm install`. If still missing, check `pnpm-workspace.yaml` has `onlyBuiltDependencies: better-sqlite3`.

---

## Key Architectural Decisions

### 1. No tmux Dependency (v0.5.0)

Originally, Olympus used tmux for session management. As of v0.5.0, tmux is **completely removed**:
- Use `node-pty` for PTY interaction (PtyWorker)
- Use `spawn` for CLI execution (CliRunner)
- Store sessions in JSON/SQLite instead

**Benefit**: Windows support, simpler code, reduced system dependencies.

### 2. Protocol-First Design

All packages depend on `@olympus-dev/protocol`. Changes to protocol require:
1. Update protocol types
2. Rebuild protocol
3. Rebuild all dependent packages
4. Test integration

This ensures type safety across the monorepo.

### 3. Gateway as Single Source of Truth

All runtime state lives in Gateway:
- Orchestrator (task execution)
- SessionManager (CLI sessions)
- WorkerRegistry (worker lifecycle)
- MemoryStore (pattern learning)
- LocalContextStore (project context)

Other packages **do not** create their own stores.

### 4. WebSocket for Real-Time Updates

Instead of polling, Gateway broadcasts WebSocket events:
- `cli:stream` — stdout chunks (real-time)
- `cli:complete` — execution result
- `runs:list` — run status changes
- `agent:progress` — agent events

This keeps Web/TUI synchronized with Gateway state.

### 5. Workspace (monorepo) Over Monolith

Each package has clear responsibility:
- protocol → types
- core → orchestration
- gateway → HTTP/WebSocket
- cli → user entry point
- web/tui → UI

**Benefit**: Testable, deployable independently, clear contracts.

### 6. Local Context Store (SQLite FTS5)

Project context is stored locally in `.olympus/context.db`:
- Hierarchical (project + root level)
- Full-text search (FTS5)
- Worker history (rule-based extraction)
- No LLM required (deterministic)

This avoids cloud storage, supports offline, and provides fast queries.

---

## Key Files to Know

| File | Purpose |
|------|---------|
| `pnpm-workspace.yaml` | Monorepo configuration |
| `turbo.json` | Turbo build cache (if using) |
| `.npmrc` | pnpm + npm config |
| `tsconfig.json` (root) | Shared TypeScript config |
| `packages/protocol/src/index.ts` | Type definitions (reference) |
| `packages/gateway/src/server.ts` | HTTP/WebSocket server setup |
| `packages/cli/src/index.ts` | CLI command definitions |
| `packages/web/src/App.tsx` | Dashboard root component |

---

## Further Reading

- [Olympus CLAUDE.md](/dev/olympus/CLAUDE.md) — Project-specific conventions
- [Olympus v1.0 Architecture](../OLYMPUS_IMPROVEMENT_PLAN.md) — OpenClaw v2.0 phases
- [Team Engineering Protocol](../../orchestration/commands/team.md) — Multi-agent workflow
- [GeminiAdvisor Design](../memory/v3-codex-orchestrator.md) — Memory synthesis for Codex

---

**Version**: Olympus v0.5.1
**Last Updated**: 2026-02-16
**Maintainer**: Olympus Team
