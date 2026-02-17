# Olympus v1.0 System Overview

**A Handover Document for New Team Members**

---

## Table of Contents

1. [What is Olympus?](#what-is-olympus)
2. [High-Level Architecture](#high-level-architecture)
3. [Package Structure](#package-structure)
4. [Data Flow](#data-flow)
5. [Core Components](#core-components)
6. [Technology Stack](#technology-stack)
7. [Key Design Decisions](#key-design-decisions)
8. [Running Olympus](#running-olympus)
9. [Where to Start](#where-to-start)

---

## What is Olympus?

**Olympus** is a Claude CLI Enhanced Platform that adds:

- **Multi-AI Orchestration**: 19 custom AI agents (architect, designer, qa-tester, etc.) coordinate via Team Engineering Protocol
- **Real-Time Monitoring**: OlympusMountain dashboard with live agent status visualization
- **Remote Control**: Telegram bot for distributed team coordination
- **Context Management**: LocalContextStore with SQLite + FTS5 for persistent project knowledge
- **Parallel Execution**: ConcurrencyLimiter allowing up to 5 concurrent Claude/Codex CLI processes
- **Long-Term Memory**: GeminiAdvisor synthesizes work history to boost Codex decision-making

**Target Users**: AI developers using Claude CLI for software engineering who need team-scale orchestration, remote access, and historical context.

### Problem → Solution

| Problem | Olympus Solution |
|---------|------------------|
| Claude CLI runs sequentially on one terminal | ConcurrencyLimiter + 5 parallel CLI processes |
| Only 1 AI (Claude) handles all work | 19 specialized agents via `/team` command |
| No remote access | Telegram bot for distributed async commands |
| No progress visibility | Real-time OlympusMountain dashboard |
| Context resets per session | LocalContextStore (SQLite) persists project knowledge |
| Codex has no long-term memory | GeminiAdvisor synthesizes 50 work history items |

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   User Interfaces (4 channels)           │
├──────────────────┬──────────────┬───────────┬────────────┤
│   Web Dashboard  │  Telegram    │    TUI    │   CLI      │
│  (localhost:80)  │  (Telegram)  │(Terminal) │ (commands) │
└────────┬─────────┴────────┬─────┴──────┬────┴────────────┘
         │                  │            │
         └──────────────────┼────────────┘
                            │
                 ┌──────────▼──────────┐
                 │  WebSocket Gateway  │
                 │  (localhost:8200)   │
                 └────────┬────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
   ┌────▼────┐   ┌────────▼───────┐  ┌─────▼──────┐
   │CliRunner │   │ WorkerRegistry │  │GeminiAdvisor│
   │(spawn)   │   │(register/task) │  │(synthesis) │
   └────┬────┘   └────────────────┘  └─────────────┘
        │
        │                ┌─────────────────┐
        └───────────────▶│ CLI Processes   │
                        │ 1. Claude CLI   │
                        │ 2. Codex CLI    │
                        │ 3. Gemini CLI   │
                        │ (max 5 parallel)│
                        └─────────────────┘
```

### Runtime Communication

```
┌─────────────┐  WebSocket   ┌─────────┐
│ Web         │◄────────────▶│ Gateway │
│ Dashboard   │              │ (HTTP + │
└─────────────┘              │  WS)    │
                             └────┬────┘
┌─────────────┐  WebSocket        │
│ TUI         │◄────────────────┐ │
│ Terminal    │                 │ │
└─────────────┘                 │ │
                                │ │
┌──────────────┐  HTTP          │ │
│ Telegram     │───────────────┐│ │
│ Bot          │               ││ │
└──────────────┘               ││ │
                               ││ │
   ┌──────────────────────────┘│ │
   │   LocalContextStore       │ │
   │   (SQLite)                │ │
   └──────────────────────────┘ │
                                │
                    ┌───────────▼────┐
                    │ CLI Processes: │
                    │ - Claude       │
                    │ - Codex        │
                    │ - Gemini       │
                    │ (via spawn)    │
                    └────────────────┘
```

---

## Package Structure

Olympus is a **pnpm monorepo** with 10 packages (9 core + 1 plugin).

### Build-Time Dependency Graph

```
protocol (shared types) ───┬──────────────┐
                           │              │
                    ┌──────▼────┐  ┌─────▼────┐
                    │   core     │  │  codex   │
                    └──────┬─────┘  └────┬─────┘
                           │             │
                    ┌──────▼─────────────▼─────┐
                    │     gateway              │
                    └──────┬────────────────────┘
                           │
           ┌───────────────┼────────────┐
           │               │            │
        ┌──▼───┐    ┌──────▼───┐  ┌────▼──┐
        │client │    │ telegram │  │ tui   │
        └──┬────┘    └──────────┘  └───────┘
           │
        ┌──▼────┐
        │  web   │
        └────────┘

cli (CLI entry) ← depends on all above
claude-dashboard (statusline plugin for claude command)
```

### Package Details

| Package | Purpose | Key Files | Tech |
|---------|---------|-----------|------|
| **protocol** | Shared types + WebSocket schemas | `src/types.ts`, `src/messages.ts` | TypeScript |
| **core** | Context extraction + LocalContextStore | `context-extractor.ts`, `local-context-store.ts` | SQLite, FTS5 |
| **gateway** | WebSocket server + HTTP API + CLI orchestration | `server.ts`, `cli-runner.ts`, `api.ts` | Node.js, ws |
| **cli** | Entry point + commands | `index.ts`, `commands/start.ts` | Commander.js |
| **client** | Shared React hooks | `useOlympus.ts`, `useGateway.ts` | React |
| **web** | OlympusMountain dashboard | `components/OlympusMountainCanvas.tsx` | React + Vite |
| **tui** | Terminal UI | `index.ts`, `components/` | Ink + React |
| **telegram-bot** | Telegram integration | `index.ts`, `handlers/` | Telegraf |
| **codex** | Codex CLI orchestration | `codex-adapter.ts`, `session-manager.ts` | CLI wrapper |
| **claude-dashboard** | Claude CLI statusline plugin | `index.ts` | Claude plugin |

---

## Data Flow

### 1. User Command Entry Points

Users can send commands via:
- **Web Dashboard**: Click button → WebSocket `rpc` call → Gateway
- **Telegram Bot**: Type `@worker-name task` → HTTP POST → Gateway
- **TUI Terminal**: Type command → WebSocket `rpc` call → Gateway
- **CLI**: `olympus run "task"` → HTTP POST `/api/cli/run` → Gateway

### 2. Gateway Request Processing

```
Request arrives at Gateway
         │
    ┌────▼─────┐
    │Authenticate│ (API key validation)
    └────┬──────┘
         │
    ┌────▼─────────────────────────────────────────┐
    │Route to handler                               │
    │ - RPC method call → RpcRouter                │
    │ - HTTP POST /api/cli/run → CliRunner         │
    │ - HTTP POST /api/workers/:id/task → WorkerReg│
    └────┬───────────────────────────────────────────┘
         │
    ┌────▼────────────────────┐
    │Handler executes action  │
    │ - Spawns CLI process    │
    │ - Registers worker task │
    │ - Queries LocalContext  │
    └────┬───────────────────┘
         │
    ┌────▼────────────┐
    │Result returned  │ (sync or async via taskId)
    │& broadcast      │
    └─────────────────┘
```

### 3. CLI Execution Pipeline

```
CliRunner receives CliRunParams
         │
    ┌────▼─────────────────────────────┐
    │Build CLI args                    │
    │ - Claude: -p --output-format json│
    │ - Codex: exec --json             │
    └────┬──────────────────────────────┘
         │
    ┌────▼──────────────────┐
    │ConcurrencyLimiter     │ (max 5 concurrent)
    │ - Queue if full       │
    │ - Wait for slot       │
    └────┬───────────────────┘
         │
    ┌────▼──────────────────────┐
    │spawn(command, args)       │
    │ + onStdout(chunk)         │ (real-time streaming)
    │ + timeout handling        │
    └────┬───────────────────────┘
         │
    ┌────▼─────────────────────┐
    │Parse output              │
    │ - Claude: JSON.parse()   │
    │ - Codex: JSONL per line  │
    └────┬──────────────────────┘
         │
    ┌────▼──────────────────────────────┐
    │Store in CliSessionStore (SQLite)  │
    │ + token usage tracking             │
    └────┬───────────────────────────────┘
         │
    ┌────▼──────────────────────────────┐
    │Emit cli:stream to subscribers      │ (WebSocket)
    │On completion: cli:complete event   │
    └───────────────────────────────────┘
```

### 4. LocalContextStore Persistence

```
CLI execution completes
         │
    ┌────▼───────────────────────────┐
    │Context Extraction               │
    │ (rules-based, no LLM)           │
    │ - Extract file changes          │
    │ - Extract decisions             │
    │ - Extract errors                │
    │ - Extract dependencies          │
    └────┬────────────────────────────┘
         │
    ┌────▼──────────────────────────────────┐
    │LocalContextStore                      │
    │ (per-project .olympus/context.db)    │
    │ + Root level context.db (FTS5 index) │
    └────┬───────────────────────────────────┘
         │
    ┌────▼──────────────────────┐
    │GeminiAdvisor reads context │
    │(10-second debounce)        │
    └────┬───────────────────────┘
         │
    ┌────▼──────────────────────┐
    │Synthesize work history     │
    │ + max 50 worker contexts   │
    │ + max 2000 char summary    │
    └────┬───────────────────────┘
         │
    ┌────▼───────────────────────┐
    │Inject into Codex context   │
    │ (via buildCodexContext)    │
    │ + worker tasks (3000 char) │
    └────────────────────────────┘
```

---

## Core Components

### CliRunner (`gateway/src/cli-runner.ts`)

**What it does**: Spawns Claude/Codex CLI processes, captures JSON/JSONL output, streams to clients.

**Key Functions**:
- `buildCliArgs(params, backend)` — Constructs shell command with flags
- `spawnCli(backend, args, options)` — Spawns child process + streams stdout
- `runCli(params)` — Main entry: orchestrate spawn + parse + return result
- `parseClaudeJson(stdout)` — JSON parser for Claude output
- `parseCodexJsonl(stdout)` — JSONL parser for Codex (one JSON per line)

**Concurrency**: `ConcurrencyLimiter` with max 5 parallel processes (configurable)

**Output Handling**:
- **Real-time**: `onStream(chunk)` callback for stdout streaming
- **On complete**: Parsed JSON result returned
- **Error handling**: `classifyError()` categorizes failures (timeout, parse error, crash)

### WorkerRegistry (`gateway/src/worker-registry.ts`)

**What it does**: Manages named workers (e.g., `worker-1`, `worker-2`) for Telegram and distributed execution.

**API**:
- `register(worker)` — Register new worker with mode (pty | spawn)
- `delete(id)` — Deregister worker
- `getAll()` — List active workers
- `assignTask(id, task)` — Send task to worker
- `reportTaskResult(taskId, result)` — Worker reports completion
- `heartbeat(id)` — Worker heartbeat (15s check, 60s timeout)

**Worker Lifecycle**:
```
Register → Heartbeat (every 15s) → Assign Task → Complete → Deregister
                       │
                    (60s timeout → auto-remove)
```

### GeminiAdvisor (`gateway/src/gemini-advisor.ts`)

**What it does**: Periodically analyzes project state and synthesizes work history for Codex.

**Architecture**:
```
LocalContextStore (SQLite)
    ↓ (read every 5min)
getRecentWorkerContexts(50)
    ↓
Format as string (task history)
    ↓
Spawn Gemini CLI (headless)
    ↓
Parse analysis JSON
    ↓
Cache result (file + memory)
    ↓
buildProjectContext() ← Inject into Codex/Worker tasks
```

**Key Features**:
- **Debounced**: 10-second debounce to avoid excessive spawning
- **Resilient**: On failure, preserves previous `workHistory` field
- **Synthesized field**: `workHistory` (max 2000 chars) injected into Codex prompts
- **Project analysis**: Caches file structure, key decisions, errors

### LocalContextStore (`core/src/local-context-store.ts`)

**What it does**: SQLite-based hierarchical context storage for projects.

**Data Model**:
```sqlite
worker_contexts
├── id (UUID)
├── workerId (string)
├── context (JSON)
│   ├── files (changed files)
│   ├── decisions (architectural decisions)
│   ├── errors (encountered errors)
│   └── dependencies (module relationships)
├── createdAt
└── updatedAt

project_context
├── projectPath
├── context (aggregated)
└── lastUpdated

FTS5 index (full-text search)
```

**Manager API** (`LocalContextStoreManager`):
- `getProjectStore(path)` — Get/create project-level DB
- `getRootStore()` — Root-level aggregated context
- `propagateToRoot()` — Copy project context to root

### SessionManager (`gateway/src/session-manager.ts`)

**What it does**: Manages CLI session metadata (tokens, costs, timeline).

**Session Data**:
```json
{
  "id": "main",
  "backend": "claude",
  "createdAt": 1708050000000,
  "completedAt": 1708051000000,
  "totalTokens": 45000,
  "inputTokens": 30000,
  "outputTokens": 15000,
  "cost": 0.65
}
```

**API**:
- `createSession(id, backend)` — Start new session
- `saveSession(session)` — Persist to SQLite
- `getSessions()` — List all sessions
- `updateTokens(id, input, output)` — Update usage

---

## Technology Stack

### Runtime
- **Node.js** 18+ (ESM modules)
- **TypeScript** 5.8+ (strict mode)

### Build & Package Management
- **pnpm** (workspace monorepo)
- **tsup** (library bundling)
- **Vite** (web dashboard build)
- **Turbo** (build orchestration)

### Database
- **SQLite** (via better-sqlite3)
- **FTS5** (full-text search for context)

### CLI & Server
- **Commander.js** (CLI argument parsing)
- **Node.js http** (HTTP server)
- **ws** (WebSocket)
- **Telegraf** (Telegram bot framework)

### Frontend (Dashboard)
- **React** 18+
- **Tailwind CSS** (styling)
- **Vite** (bundler)
- **Zustand** (state management)

### Testing
- **Vitest** (unit tests)
- **better-sqlite3** (native module for SQLite)
- **node-pty** (PTY support for interactive mode)

---

## Key Design Decisions

### 1. No tmux Dependency (Removed v0.4.0)

**Why**: Simplify cross-platform support, reduce external dependencies.

**Solution**: Use Node.js `spawn()` with stdio streaming + node-pty for interactive TUI.

**Impact**:
- ✅ Windows 11 support
- ✅ Simpler debugging (direct stdout/stderr)
- ❌ Interactive mode requires node-pty (native module)

### 2. Structured Output (JSON/JSONL)

**Why**: Parse and relay output reliably across network.

**Solution**:
- Claude: `-p --output-format json` (single JSON object)
- Codex: `exec --json` (JSONL, one JSON per line)

**Impact**: Real-time streaming, no terminal escapes to strip.

### 3. ConcurrencyLimiter (Max 5 Parallel)

**Why**: Prevent resource exhaustion, manage token usage.

**Solution**: Queue pending CLI runs, release slot on completion.

**Impact**: Predictable resource usage, fair scheduling.

### 4. Telegram Fire-and-Forget (`bot.launch()`)

**Why**: Don't block on bot startup, allow graceful shutdown.

**Solution**: `bot.launch().catch(err => console.error(err))` — never await.

**Impact**: Fast server startup, async bot initialization.

### 5. SQLite for Everything

**Why**: Single process, ACID transactions, FTS5 for search.

**Solution**: CliSessionStore, LocalContextStore, TaskStore, ContextStore all SQLite.

**Impact**: No external database, portable (single `.db` file), fast local queries.

### 6. Layered Context Injection

**Why**: Provide AI agents with right information at right scope.

**Solution**:
- **Codex chat**: 4000 chars project context
- **Worker task**: 3000 chars project context
- **GeminiAdvisor synthesis**: 2000 char work history

**Impact**: Balanced context window usage, scalable to large projects.

---

## Running Olympus

### Development Setup

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Type-check
pnpm lint

# Start Gateway + Dashboard
cd packages/cli
pnpm start:dev    # or: olympus server start

# Start just the Gateway (development)
cd packages/gateway
pnpm start:dev    # Listens on :8200

# Start Dashboard (separate dev server)
cd packages/web
pnpm dev          # Listens on :5173
```

### Commands

| Command | What it Does |
|---------|--------------|
| `olympus start` | Launch Claude CLI in PTY mode (foreground) |
| `olympus start-trust` | Same, but skip permission prompts |
| `olympus server start` | Start unified Gateway + Dashboard + Telegram |
| `olympus run "task"` | Execute task via Gateway API |
| `olympus dashboard` | Start web dashboard only |
| `olympus gateway` | Start Gateway only |
| `olympus telegram` | Start Telegram bot only |

### Configuration

Config file: `~/.olympus/config.json`

```json
{
  "apiKey": "...",
  "gateway": {
    "port": 8200,
    "host": "0.0.0.0"
  },
  "telegram": {
    "token": "...",
    "allowedUsers": ["..."]
  },
  "agent": {
    "model": "claude-opus-4-1-20250805",
    "maxConcurrentWorkers": 3
  }
}
```

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `OLYMPUS_PORT` | Gateway port (default: 8200) |
| `OLYMPUS_HOST` | Gateway host (default: 0.0.0.0) |
| `OLYMPUS_API_KEY` | API key for auth |
| `CLAUDE_API_KEY` | Claude CLI auth (inherited) |
| `CODEX_API_KEY` | Codex CLI auth |

---

## Where to Start

### As a Backend Developer

1. **Start here**: `packages/gateway/src/server.ts` — Main server initialization
2. **Understand flows**:
   - `api.ts` → HTTP endpoints
   - `cli-runner.ts` → How CLI execution works
   - `worker-registry.ts` → How worker tasks are assigned
3. **Learn the protocol**: `packages/protocol/src/types.ts` — All message types
4. **Add a feature**: Start with `packages/gateway/src/api.ts` (new HTTP endpoint)

### As a Frontend Developer

1. **Start here**: `packages/web/src/components/OlympusMountainCanvas.tsx` — Main dashboard
2. **Understand**: `packages/client/src/useOlympus.ts` — Gateway connection + events
3. **Learn styling**: Tailwind CSS in components (see `pages/dashboard.tsx`)
4. **Add a feature**: Create component in `components/` + hook into WebSocket events

### As a Systems Engineer

1. **Start here**: `packages/cli/src/index.ts` — Command-line entry point
2. **Understand**: `packages/cli/src/commands/server.ts` — How services start
3. **Learn architecture**: Read this document + `V2_ARCHITECTURE.md`
4. **Troubleshoot**: Check logs in `~/.olympus/worker-logs/`

### For Team Coordination (`/team` Protocol)

1. **Read**: `~/.claude/commands/team.md` — The Team Engineering Protocol v3.1
2. **Understand**: 19 agents + file ownership + DAG execution
3. **Implement**: `packages/cli/src/commands/team.ts` coordinates the protocol
4. **Dashboard**: View team progress in OlympusMountain `Team Status` tab

---

## File Organization Guide

```
olympus/
├── docs/                          # Documentation
│   ├── architecture/              # This file + V2_ARCHITECTURE.md
│   ├── design/                    # Design specs
│   ├── reports/                   # Audit reports
│   └── spec/                      # Protocol specs
│
├── packages/
│   ├── protocol/                  # Shared types (TypeScript)
│   ├── core/                      # Context extraction + LocalContextStore
│   ├── gateway/                   # WebSocket server + HTTP API + orchestration
│   │   └── src/
│   │       ├── api.ts             # HTTP endpoints
│   │       ├── cli-runner.ts      # Claude/Codex CLI spawning
│   │       ├── worker-registry.ts # Worker task management
│   │       ├── gemini-advisor.ts  # Work history synthesis
│   │       └── server.ts          # WebSocket Gateway
│   │
│   ├── cli/                       # Entry point + commands
│   │   └── src/
│   │       ├── index.ts           # Main entry
│   │       ├── commands/
│   │       │   ├── start.ts       # `olympus start`
│   │       │   ├── server.ts      # `olympus server start`
│   │       │   └── ...
│   │       └── pty-worker.ts      # PTY interaction
│   │
│   ├── web/                       # OlympusMountain dashboard
│   │   └── src/
│   │       ├── components/        # React components
│   │       ├── pages/
│   │       │   └── dashboard.tsx  # Main dashboard
│   │       └── olympus-mountain/  # Canvas + behaviors
│   │
│   ├── gateway/                   # Copy of gateway (for build)
│   ├── telegram-bot/              # Telegram integration
│   ├── codex/                     # Codex orchestration
│   ├── tui/                       # Terminal UI
│   └── client/                    # React hooks
│
├── pnpm-workspace.yaml            # Monorepo config
├── tsconfig.json                  # TypeScript root config
├── turbo.json                     # Turbo build config
└── README.md                      # Project README
```

---

## Typical Development Workflow

### Making a Change

1. **Identify package**: Which package does this affect?
   - New API endpoint? → `gateway/src/api.ts`
   - New dashboard widget? → `web/src/components/`
   - New CLI command? → `cli/src/commands/`

2. **Update types first**: Add to `protocol/src/types.ts`

3. **Implement in package**

4. **Test locally**:
   ```bash
   pnpm test
   pnpm lint
   ```

5. **Verify integration**:
   ```bash
   pnpm build
   pnpm start:dev   # in cli/
   ```

6. **Check dashboard**: Open http://localhost:5173

### Making a Gateway Change

1. Modify `packages/gateway/src/`
2. Restart gateway: `pnpm start:dev` in gateway folder
3. Dashboard auto-reloads (WebSocket reconnects)

### Making a CLI Change

1. Modify `packages/cli/src/`
2. Rebuild: `pnpm build` (or watch mode)
3. Reinstall link: `npm link` in cli/ folder
4. Test command: `olympus <command>`

---

## Next Steps

- **Architecture Deep Dive**: Read `V2_ARCHITECTURE.md`
- **Protocol Spec**: See `../spec/protocol.md`
- **Team Engineering**: Read `~/.claude/commands/team.md`
- **Development**: Start with `CONTRIBUTING.md` (if exists)
- **Troubleshooting**: See `../operations/TROUBLESHOOTING.md`

---

**Version**: v1.0.0
**Last Updated**: February 2026
**For questions**: Refer to issues or team documentation
