<p align="center">
  <img src="assets/mascot.png" alt="Olympus Mascot" width="200"/>
</p>

<h1 align="center">Olympus</h1>

<p align="center">
  <a href="./README.md"><img src="https://img.shields.io/badge/Language-한국어-lightgrey?style=for-the-badge" alt="Korean"/></a>
  <a href="./README.en.md"><img src="https://img.shields.io/badge/Language-English-blue?style=for-the-badge" alt="English"/></a>
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"/></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-18%2B-green.svg" alt="Node.js"/></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.8-blue.svg" alt="TypeScript"/></a>
</p>

<p align="center">
  <b>Claude CLI Enhanced Platform v1.0.0</b> - Team Engineering + Gateway + Dashboard
</p>

<p align="center">
  <i>"Multi-AI collaboration development tool for boosting Claude CLI productivity"</i>
</p>

## Table of Contents

- [What is Olympus?](#what-is-olympus)
- [Quick Start](#quick-start)
- [Key Features](#key-features)
- [Installation Guide](#installation-guide)
- [Usage](#usage)
- [Worker System](#worker-system)
- [Telegram Bot Guide](#telegram-bot-guide)
- [Team Engineering Protocol](#team-engineering-protocol)
- [Custom Agents (19)](#custom-agents-19)
- [Architecture](#architecture)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

## What is Olympus?

Olympus is a **Multi-AI collaboration platform** that maximizes Claude CLI productivity.

It integrates Gateway, Dashboard, and Telegram Bot centered around Claude CLI to manage local/remote development environments, and automates complex tasks through Team Engineering Protocol where 19 specialized agents collaborate.

```
Claude CLI ──┬─→ PTY Worker (persistent CLI)
             ├─→ Gateway (HTTP API + WebSocket)
             ├─→ Dashboard (real-time monitoring)
             ├─→ Telegram Bot (remote control)
             └─→ 19 Custom Agents (Team Engineering)
```

## Quick Start

### macOS / Linux

```bash
git clone https://github.com/jobc90/olympus.git
cd olympus
./install.sh --global
olympus
```

### Windows

```bash
git clone https://github.com/jobc90/olympus.git
cd olympus

# Git Bash / MINGW (recommended)
./install-win.sh --global

# PowerShell
.\install.ps1 -Mode global
```

### Manual Install (all platforms)

```bash
git clone https://github.com/jobc90/olympus.git
cd olympus
pnpm install && pnpm build
cd packages/cli && npm link    # Register olympus CLI globally
```

> **Windows note**: `install.sh` is for macOS/Linux only (uses symlinks). On Windows, use `install-win.sh` (Git Bash) or `install.ps1` (PowerShell). The key difference is using `npm link` to register the CLI, which creates `.cmd` wrappers that work across PowerShell, CMD, and Git Bash.

After installation, inside Claude CLI:
```bash
/team "Improve login page UI"
```

## Key Features

| Feature | Description |
|---------|-------------|
| **19 Custom Agents** | 3 Core + 16 On-Demand specialized agents (`.claude/agents/`) |
| **Team Engineering Protocol** | 5 core mechanisms (Consensus, 2-Phase Dev, Two-Stage Review, Evidence QA, Circuit Breaker) |
| **PTY Worker** | node-pty based persistent Claude CLI + TUI display + command input + completion detection |
| **Worker Registry** | In-memory worker registration/heartbeat/task assignment system in Gateway |
| **stdout Streaming** | Real-time CLI output WebSocket broadcast (`cli:stream` event) |
| **Parallel CLI Execution** | ConcurrencyLimiter (max 5 concurrent executions) |
| **Telegram Worker Delegation** | Direct task assignment to workers via @mention + `/team` bot command |
| **LocalContextStore** | SQLite-based hierarchical context store (project/worker level) |
| **GeminiAdvisor** | Gemini CLI-based project analysis (Codex context enrichment) |
| **OlympusMountain v3** | Greek mythology themed dashboard (20 god worker avatars, 10 zones) |

## Installation Guide

### Prerequisites

- **Node.js 18+** (CI: Node 20/22)
- **pnpm** (`npm i -g pnpm`)
- **Claude CLI** (`npm i -g @anthropic-ai/claude-code`)
- **Build tools** (required for node-pty native module):
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Linux: `build-essential`, `python3`
  - Windows: Visual Studio Build Tools + Python 3
- **Gemini CLI** (optional): Required for Multi-AI collaboration
- **Codex CLI** (optional): Required for Multi-AI collaboration

### Installation Mode Selection

**macOS / Linux:**

```bash
# Global install (recommended) — Install to ~/.claude/, use /team from anywhere
./install.sh --global

# Local install — Install to project's .claude/, use only in this directory
./install.sh --local

# Apply Olympus managed block to CLAUDE.md (optional)
./install.sh --global --with-claude-md
```

**Windows (Git Bash / PowerShell):**

```bash
# Git Bash (recommended)
./install-win.sh --global
./install-win.sh --local
```

```powershell
# PowerShell
.\install.ps1 -Mode global
.\install.ps1 -Mode local
.\install.ps1 -Mode global -WithClaudeMd
```

> **Default behavior is non-invasive**: `~/.claude/CLAUDE.md` is not modified unless explicitly requested.

### Local Install Notes

```bash
# Must run from olympus project directory
cd /path/to/olympus
claude                     # Start Claude CLI
/team "task description"   # Ready to use!
```

> ⚠️ **Local install**: `/team` is only recognized in the olympus directory.

## Usage

### 1. Launch Claude CLI (default)

```bash
olympus
```

Running `olympus` without arguments starts Claude CLI. All Claude CLI features are available as-is.

### 2. Start Worker Session (PTY mode)

```bash
# Register current directory as worker (PTY mode — default)
olympus start

# Specify project path
olympus start -p /path/to/project

# Specify worker name (default: directory name)
olympus start -n backend-worker

# Auto-approval mode (trust)
olympus start-trust
```

`olympus start` registers a **PTY Worker** to Gateway and waits for tasks. Claude CLI TUI is displayed immediately, and worker output is streamed in real-time via WebSocket.

### 3. Server Management

```bash
# Start all services (Gateway + Dashboard + Telegram)
olympus server start

# Start individual services
olympus server start --gateway      # Gateway only
olympus server start --dashboard    # Dashboard only
olympus server start --telegram     # Telegram bot only

# Stop server
olympus server stop

# Check server status
olympus server status
```

### 4. Initial Setup

```bash
# Setup wizard (Gateway + Telegram + model settings)
olympus setup

# Quick setup + start
olympus quickstart
```

## Worker System

### PTY Worker (v1.0.0)

**PTY Worker** is a core module that manages persistent Claude CLI based on node-pty.

**Key Features**:
- **TUI Display**: Shows Claude CLI's Ink TUI as-is
- **Command Input**: Prompt submission + Enter key handling
- **Completion Detection**: Prompt pattern (5s settle) → 30s inactivity → 60s forced completion
- **Background Agent Detection**: 7 patterns (Task completed, Conversation compacted, etc.) + 30s cooldown
- **Result Extraction**: ⏺ marker-based extraction → ANSI removal → TUI artifact filter
- **Double Ctrl+C**: Terminate with Ctrl+C twice within 1 second

**TUI Artifact Filter**:
- Spinners (✢✳✶✻✽·), "(thinking)", "Flowing...", status bars, dividers auto-removed
- Extracts only actual responses with 8000 char limit

**Fallback Mode**:
- Falls back to spawn mode when PTY mode fails
- spawn mode: Foreground execution with `stdio: 'inherit'`

### Worker Registry

In-memory worker registration and heartbeat management in Gateway.

**Worker API**:
- `POST /api/workers/register` — Register worker (mode: 'pty' | 'spawn')
- `DELETE /api/workers/:id` — Delete worker
- `POST /api/workers/:id/heartbeat` — Heartbeat (15s check, 60s timeout)
- `POST /api/workers/:id/task` — Assign task
- `POST /api/workers/:id/task/result` — Report task result
- `GET /api/workers/:id/task/status` — Poll task status

**Worker Type**:
```typescript
interface RegisteredWorker {
  id: string;
  name: string;
  projectPath: string;
  mode?: 'pty' | 'spawn';
  status: 'idle' | 'busy';
  lastHeartbeat: Date;
  currentTask?: {
    id: string;
    prompt: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    result?: string;
    error?: string;
  };
}
```

## Telegram Bot Guide

Control Claude CLI remotely via Telegram bot.

### Setup

#### Step 1: Create Telegram Bot

1. Search for `@BotFather` in Telegram and start chat
2. Send `/newbot` and set bot name/username
3. Save bot token (e.g., `7123456789:AAHxxxxxx...`)

#### Step 2: Get User ID

1. Search for `@userinfobot` in Telegram and start chat
2. Send `/start`
3. Save User ID (e.g., `123456789`)

#### Step 3: Environment Variables

```bash
# Add to ~/.zshrc or ~/.bashrc
export TELEGRAM_BOT_TOKEN="7123456789:AAHxxxxxx..."
export ALLOWED_USERS="123456789"  # Comma-separated for multiple users
```

Restart terminal or `source ~/.zshrc` after setting

#### Step 4: Start Server

```bash
# Start Gateway + Telegram bot
olympus server start

# Or Telegram bot only
olympus server start --telegram
```

### Usage

#### Basic Commands

| Command | Description |
|---------|-------------|
| `/start` | Show help |
| `/health` | Check status |
| `/workers` | List workers |
| `/team <request>` | Run Team Engineering Protocol |
| Normal message | Send to Claude CLI |

#### Worker Delegation (@mention)

```
@worker-name task description
```

Example:
```
@backend-worker Add API endpoint /api/users
```

When you input `@worker-name task` in Telegram:
1. Gateway assigns task via `POST /api/workers/:id/task`
2. Worker polls via `GET /api/workers/:id/task/status`
3. Worker reports result via `POST /api/workers/:id/task/result` after completion
4. Result sent to Telegram

#### Team Engineering Protocol (Telegram)

```
/team Add cart feature
```

Or with worker mention:
```
@backend-worker team Optimize API performance
```

#### Inline Query (Worker List)

Type `@botname` in any chat to see available workers. Select a worker to pre-fill `@worker-name ` and continue with task description.

## Team Engineering Protocol

Olympus v1.0.0 introduces **Team Engineering Protocol** providing a framework where 19 specialized agents collaborate.

### Usage

```bash
# Run from Claude CLI
/team "Improve login page UI"

# Run from Telegram bot
/team Add cart feature

# Delegate team task to worker
@backend-worker team Optimize API performance
```

### 5 Core Mechanisms

| Mechanism | Description |
|-----------|-------------|
| **Consensus Protocol** | Leader (Claude) gathers team opinions for major decisions (architecture, tech choices) |
| **2-Phase Development** | Coding Phase → Debugging Phase separation (prevents masking issues by fixing tests) |
| **Two-Stage Review** | Stage 1 (spec compliance) → Stage 2 (code quality), Stage 2 skipped if Stage 1 fails |
| **Evidence-Based QA** | All assertions require capture evidence, no assumption-based judgments |
| **Circuit Breaker** | Re-evaluate approach after 3 failures, prevents infinite loops |

### Agent Activation Policy

**Core Agents (always available — 3)**:
- `explore` (Haiku) — Fast codebase search
- `executor` (Sonnet) — Focused execution, direct implementation
- `writer` (Haiku) — Documentation

**On-Demand Agents (Team mode only — 16)**:
- `architect` (Opus) — Architecture & debugging
- `analyst` (Opus) — Requirements analysis
- `planner` (Opus) — Strategic planning
- `designer` (Sonnet) — UI/UX design
- `researcher` (Sonnet) — Documentation & research
- `code-reviewer` (Opus) — Code review (2-stage)
- `verifier` (Sonnet) — Visual analysis (screenshots/diagrams)
- `qa-tester` (Sonnet) — CLI/service testing
- `vision` (Sonnet) — Visual analysis
- `test-engineer` (Sonnet) — Test design/implementation
- `build-fixer` (Sonnet) — Build/type error fixes
- `git-master` (Sonnet) — Git workflow
- `api-reviewer` (Sonnet) — API design review
- `performance-reviewer` (Sonnet) — Performance optimization review
- `security-reviewer` (Sonnet) — Security vulnerability review
- `style-reviewer` (Haiku) — Code style review

**Disabled Agents (never use without explicit request)**:
- Duplicate functionality (tiered agents: `*-low`, `*-medium`, `*-high`)
- Special domains (`smart-contract-*`, `unity-*`, `web3-*`, etc.)
- Cloud/infra (`terraform-*`, `aws-*`, `kubernetes-*`, etc.)
- Language-specific (`rust-*`, `go-*`, `kotlin-*`, etc.)

### Verify Installation

```bash
# Global install
ls ~/.claude/agents/

# Local install
ls .claude/agents/
```

Should have 19 agent files (`*.md`) installed.

## Custom Agents (19)

Starting from v1.0.0, Olympus installs 19 Custom Agents to `.claude/agents/`. These agents collaborate through Claude CLI's `/team` command.

### Agent Role Definitions

#### Core Agents (3 — always available)

**`explore`** — Codebase Search Specialist
- **Model**: Haiku (cost-efficient)
- **Allowed tools**: Glob, Grep, Read (parallel execution)
- **Forbidden tools**: Write, Edit, Task (no code modification/delegation)
- **Success criteria**: Absolute paths, comprehensive matching, relationship explanation

**`executor`** — Focused Executor
- **Model**: Sonnet (balanced)
- **Allowed tools**: All tools (Read, Write, Edit, Bash, Glob, Grep)
- **Forbidden**: Agent delegation, architecture decisions
- **Success criteria**: Minimal changes, LSP clean, build/test pass

**`writer`** — Technical Documentation Writer
- **Model**: Haiku (fast generation)
- **Allowed tools**: Read, Glob, Grep, Write (documentation files only)
- **Forbidden**: Code file modifications

#### On-Demand Agents (16 — Team mode only)

**`architect`** — Architecture & Debugging Advisor
- **Model**: Opus (complex reasoning)
- **Allowed tools**: Glob, Grep, Read, Bash (git blame/log only)
- **Forbidden**: Write, Edit (no code modification)
- **Circuit Breaker**: Re-evaluate approach after 3 failed fixes

**`analyst`** — Requirements Analysis Consultant
- **Model**: Opus (analytical thinking)
- **Success criteria**: Identify missing questions, define guardrails, prevent scope creep

**`planner`** — Strategic Planning Specialist
- **Model**: Opus (strategic thinking)
- **Process**: User interview → codebase investigation → task plan generation
- **Success criteria**: 3-6 concrete steps + acceptance criteria

**`designer`** — UI/UX Design Specialist
- **Model**: Sonnet
- **Allowed tools**: Read, Glob, Grep, Write (UI/style files)

**`researcher`** — Documentation & Research Specialist
- **Model**: Sonnet
- **Allowed tools**: Read, Glob, Grep

**`code-reviewer`** — Code Review & Critique Specialist
- **Model**: Opus (deep analysis)
- **2-Stage Review Protocol**:
  - Stage 1: Spec compliance check
  - Stage 2: Code quality review (only if Stage 1 passes)
- **Severity levels**: CRITICAL / HIGH / MEDIUM / LOW

**`verifier`** — Visual Analysis Specialist
- **Model**: Sonnet
- **Allowed tools**: Read, Glob, Grep

**`qa-tester`** — Evidence-Based Testing Specialist
- **Model**: Sonnet (execution + analysis)
- **Critical Rule**: "Always capture-pane BEFORE asserting"
- **Session naming**: `qa-{service}-{test}-{timestamp}`

**`vision`** — Visual Analysis Specialist
- **Model**: Sonnet
- **Allowed tools**: Screenshot/diagram analysis

**`test-engineer`** — Test Design/Implementation Specialist
- **Model**: Sonnet
- **Allowed tools**: Read, Write, Bash

**`build-fixer`** — Build/Type Error Fix Specialist
- **Model**: Sonnet
- **Allowed tools**: Read, Edit, Bash

**`git-master`** — Git Workflow Specialist
- **Model**: Sonnet
- **Allowed tools**: Bash (git), Read, Edit

**`api-reviewer`** — API Design Review Specialist
- **Model**: Sonnet
- **Allowed tools**: Read, Grep, Glob

**`performance-reviewer`** — Performance Optimization Review Specialist
- **Model**: Sonnet
- **Allowed tools**: Read, Grep, Bash

**`security-reviewer`** — Security Vulnerability Review Specialist
- **Model**: Sonnet
- **Allowed tools**: Read, Grep, Bash

**`style-reviewer`** — Code Style Review Specialist
- **Model**: Haiku (fast check)
- **Allowed tools**: Read, Grep, Bash

## Architecture

### Package Structure (9)

```
protocol → core → gateway → cli
    │        │       ↑        ↑
    ├→ client → tui ─┤────────┤
    │        └→ web  │        │
    ├→ telegram-bot ─┘────────┘
    └→ codex (Codex Orchestrator)
```

**Package Roles**:

| Package | Role |
|---------|------|
| `protocol` | Message types, Agent state machine, Worker/Task/CliRunner interfaces |
| `core` | Multi-AI orchestration, TaskStore (SQLite), LocalContextStore |
| `gateway` | HTTP + WebSocket server, CliRunner, Worker Registry, Session Store |
| `client` | WebSocket client (auto-reconnect, event subscription) |
| `cli` | Main CLI, Claude CLI wrapper, PTY Worker |
| `web` | React dashboard (OlympusMountain v3, LiveOutputPanel, SessionCostTracker) |
| `telegram-bot` | Telegram bot (worker delegation, /team command, /workers) |
| `tui` | Terminal UI (React + Ink) |
| `codex` | Codex Orchestrator (routing, session management, context DB) |

### Core Modules

#### CliRunner (Gateway)

Spawn CLI process → Parse JSON/JSONL + real-time stdout streaming

- **Implementation**: `gateway/src/cli-runner.ts`
- **Types**: `protocol/src/cli-runner.ts` (12 types + AgentEvent + CliStreamChunk)
- **Parallel execution**: `ConcurrencyLimiter(5)` — max 5 concurrent CLI spawns
- **stdout streaming**: `spawnCli`'s `onStdout` → `runCli`'s `params.onStream` → server `cli:stream` broadcast

#### PTY Worker (CLI)

node-pty based persistent Claude CLI management

- **Implementation**: `cli/src/pty-worker.ts`
- **strip-ansi**: `cli/src/utils/strip-ansi.ts` (ANSI+OSC+control char removal)
- **Completion detection**: Prompt pattern (5s) → 30s inactivity → 60s forced completion
- **Background agent detection**: 7 patterns + 30s cooldown
- **Result extraction**: ⏺ marker-based → stripAnsi → isTuiArtifactLine filter → 8000 char limit

#### Worker Registry (Gateway)

In-memory worker registration + heartbeat + task assignment

- **Implementation**: `gateway/src/worker-registry.ts`
- **Heartbeat**: 15s check, 60s timeout
- **Types**: `protocol/src/worker.ts` (RegisteredWorker, WorkerRegistration, WorkerTaskRecord)

#### Session Store (Gateway)

SQLite-based CLI session store (token/cost accumulation)

- **Implementation**: `gateway/src/cli-session-store.ts`
- **API**: `GET /api/cli/sessions`, `DELETE /api/cli/sessions/:id`

#### LocalContextStore (Core)

SQLite-based hierarchical context store

- **Implementation**: `core/src/local-context-store.ts`
- **Project DB**: `{project}/.olympus/context.db`
- **Root DB**: `{root}/.olympus/context.db`
- **FTS5**: Full-text search support

#### GeminiAdvisor (Gateway)

Gemini CLI-based project analysis

- **Implementation**: `gateway/src/gemini-advisor.ts`
- **GeminiPty**: `gateway/src/gemini-pty.ts` (PTY + spawn fallback)
- **API**: GET /api/gemini-advisor/status, /projects, /projects/:path, POST /refresh, /analyze/:path

## Development

### Build + Test

```bash
# Full build
pnpm install && pnpm build

# Tests (105 tests)
pnpm test

# TypeScript type check (6 packages)
pnpm lint

# Dev mode
pnpm dev
```

### Local CLI Execution

```bash
cd packages/cli
pnpm build
node dist/index.js
```

### Register Global CLI (development)

```bash
# macOS / Linux
./install.sh --local

# Windows (PowerShell) — choose one
.\install.ps1 -Mode local
# Or manual:
cd packages\cli && npm link
```

## Troubleshooting

### Dashboard shows "Failed to fetch" error

**Cause**: Gateway not running or CORS configuration issue

**Solution**:
1. Start server with `olympus server start` (Dashboard receives Gateway config automatically)
2. If developing with Vite dev server (port 5173), CORS is allowed by default
3. **Must restart Gateway** after Gateway configuration changes

### CLI output not showing in dashboard

**Cause**: Gateway server not running or WebSocket connection lost

**Solution**:
1. Check Gateway server: `olympus server status`
2. Restart server: `olympus server start`
3. LiveOutputPanel displays real-time stdout output

### Windows: `olympus` command not recognized

**Cause**: `install.sh` creates symlinks for macOS/Linux which don't work on Windows. Windows needs `.cmd` wrappers via `npm link`.

**Solution**:
```bash
# Option 1: Windows bash installer (Git Bash / MINGW)
./install-win.sh --global

# Option 2: PowerShell installer
.\install.ps1 -Mode global

# Option 3: Manual npm link (works in any shell)
cd packages/cli
npm link

# Verify
olympus --version
```

> `npm link` creates a `.cmd` wrapper in npm's global bin directory, which works in PowerShell, CMD, and Git Bash.

### node-pty build failure

**Cause**: Native module build tools not installed

**Solution**:
- **macOS**: `xcode-select --install`
- **Linux**: `sudo apt install build-essential python3`
- **Windows**: Install Visual Studio Build Tools + Python 3

### Telegram bot not responding

**Cause**: Environment variables not set or Gateway not running

**Solution**:
1. Check `TELEGRAM_BOT_TOKEN`, `ALLOWED_USERS` environment variables
2. `olympus server start --telegram` or `olympus server start`
3. Check status with `/health` command

### `/team` command not recognized

**Cause**: Agent files not installed

**Solution**:
1. Check global install: `ls ~/.claude/agents/` (19 files)
2. Check local install: `ls .claude/agents/` (19 files)
3. Reinstall: `./install.sh --global` or `./install-win.sh --global`

## License

MIT

---

<p align="center">
  <b>Olympus v1.0.0</b> - Multi-AI collaboration development tool for boosting Claude CLI productivity
</p>
