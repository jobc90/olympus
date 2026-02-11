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
  <b>Claude CLI Enhanced Platform</b> - Multi-AI Orchestration + Gateway + Dashboard
</p>

## Table of Contents

- [What is Olympus?](#what-is-olympus)
- [Quick Start (60s)](#quick-start-60s)
- [Quick Install](#quick-install)
- [Platform Requirements](#platform-requirements)
- [Usage](#usage)
- [Model Configuration](#model-configuration)
- [Telegram Bot Guide](#telegram-bot-guide)
- [Multi-AI Orchestration (AIOS v5.3)](#multi-ai-orchestration-aios-v53)
- [Architecture](#architecture)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

## What is Olympus?

Olympus extends Claude CLI into a practical development operations platform:

1. **Multi-AI Orchestration (AIOS v5.3)**: Claude + Gemini + Codex with Co-Leadership workflow
2. **Codex Orchestrator (V3)**: Multi-project AI orchestrator — routing, session management, context DB, agent brain
3. **Codex Agent (V2)**: Autonomous AI agent — command analysis → planning → execution → review → reporting pipeline
4. **Worker Factory (V2)**: 4 worker types (Claude CLI / Anthropic API SSE / Spawn / Docker), FIFO queue, pipeline output chaining, auto-selected per task
5. **Memory Store (V2)**: SQLite + FTS5 task learning, PatternManager (SQL-level filtering), similar task retrieval, Memory RPC methods
6. **Context OS**: hierarchical context management (Workspace → Project → Task)
7. **Remote Access**: run and control local sessions through Gateway + Telegram (with Smart Digest, `/codex` RPC queries, secret masking)
8. **Stable Sessions**: spawn-based long-running worker sessions (tmux-free)
9. **Visibility**: Web dashboard with auto-config, CodexPanel, ProjectBrowser, real-time session output

## Quick Start (60s)

```bash
git clone https://github.com/jobc90/olympus.git
cd olympus
./install.sh --global
olympus setup
olympus server start
olympus start
```

Then:

```bash
olympus
# inside Claude CLI
/orchestration "Improve login page UI"
```

## Quick Install

```bash
git clone https://github.com/jobc90/olympus.git
cd olympus
./install.sh
```

Install modes:

- `--global`: install to `~/.claude/` and use `/orchestration` from any project
- `--local`: install under current project only
- `--with-claude-md`: optionally insert/update an Olympus managed block in `~/.claude/CLAUDE.md`

```bash
./install.sh --global
./install.sh --local
./install.sh --global --with-claude-md
```

Default behavior is non-invasive: `~/.claude/CLAUDE.md` is not modified unless `--with-claude-md` is provided.

## Prerequisites

- Node.js 18+
- Claude CLI: `npm i -g @anthropic-ai/claude-code`
- Gemini CLI (optional for Multi-AI)
- Codex CLI (optional for Multi-AI)

## Platform Requirements

| Feature | macOS | Linux | Windows |
|---|---|---|---|
| `/orchestration` protocol | ✅ | ✅ | ✅ |
| `olympus` CLI wrapper | ✅ | ✅ | ✅ |
| Worker session (`olympus start`) | ✅ | ✅ | ✅ |
| Dashboard | ✅ | ✅ | ✅ |
| Telegram remote control | ✅ | ✅ | ✅ |

## Usage

### Core Commands

```bash
olympus                 # Launch Claude CLI (wrapper)
olympus start           # Register worker and wait for tasks (Gateway required)
olympus server start    # Start Gateway + Dashboard + Telegram (Dashboard auto-connects)
olympus setup           # Setup wizard (gateway/telegram/models)
olympus models show     # Show runtime model preferences
```

### Services

```bash
olympus gateway
olympus telegram
olympus dashboard
olympus tui
```

### CLI Commands Reference

| Command | Description |
|---|---|
| `olympus` | Launch Claude CLI |
| `olympus start` | Register worker and wait for tasks |
| `olympus start-trust` | Register worker in trust mode |
| `olympus server start` | Start integrated services |
| `olympus server stop` | Stop services |
| `olympus server status` | Check service status |
| `olympus setup` | Interactive setup wizard |
| `olympus quickstart` | Quick setup + run |
| `olympus config` | Config management |
| `olympus models` | Model config sync (core + MCP) |
| `olympus curl` | curl wrapper with auto API key injection |
| `olympus gateway` | Run gateway only |
| `olympus telegram` | Run telegram bot only |
| `olympus dashboard` | Open web dashboard |
| `olympus tui` | Run terminal UI |

## Model Configuration

Model resolution priority:

1. Model passed directly from command/request
2. `~/.olympus/config.json`
3. Environment variables (`OLYMPUS_*_MODEL`)
4. Built-in defaults

Important env vars:

- `OLYMPUS_GEMINI_MODEL`
- `OLYMPUS_GEMINI_PRO_MODEL`
- `OLYMPUS_GEMINI_FALLBACK_MODEL`
- `OLYMPUS_GEMINI_FALLBACK_PRO_MODEL`
- `OLYMPUS_CODEX_MODEL`
- `OLYMPUS_OPENAI_MODEL`
- `OLYMPUS_OPENAI_API_BASE_URL`

Examples:

```bash
export OLYMPUS_GEMINI_MODEL=gemini-2.5-flash
export OLYMPUS_GEMINI_PRO_MODEL=gemini-2.5-pro
export OLYMPUS_CODEX_MODEL=gpt-4.1
```

Sync commands:

```bash
olympus models show
olympus models set --gemini gemini-2.5-flash --gemini-pro gemini-2.5-pro --codex gpt-4.1
olympus models sync
```

## Telegram Bot Guide

1. Create bot token with `@BotFather`
2. Get your user ID from `@userinfobot`
3. Configure:

```bash
export TELEGRAM_BOT_TOKEN="your_token"
export ALLOWED_USERS="123456789"
```

4. Start services:

```bash
olympus start
olympus server start --telegram
```

Telegram commands:

| Command | Description |
|---|---|
| `/start` | Help |
| `/sessions` | List available sessions |
| `/use <name>` | Connect to session |
| `/close [name]` | Disconnect session |
| `/health` | Check status |
| `/mode raw\|digest` | Switch output mode (default: digest) |
| `/raw` | Shortcut for raw mode |
| `/last` | Show last output |
| `/codex <question>` | Query Codex Orchestrator via RPC (routing + response) |
| `/orchestration <request>` | Run Multi-AI orchestration |
| `/workers` | List available workers |
| `@worker-name task` | Direct task to a specific worker (bypasses Codex) |

### Inline Mode (Worker Selection)

Type `@botname` in any chat to see available workers. Select a worker to pre-fill `@worker-name ` and then type your task.

### Smart Digest Mode

The Telegram bot uses **digest mode** by default. It extracts only key results from hundreds of lines of CLI output into a concise summary (max 1500 chars).

- **6-category classification**: build, test, commit, error, phase, change
- **Noise removal**: Reading, Searching, spinners, empty lines
- **Secret masking**: API keys, Bearer tokens, GitHub PAT, long hex strings
- **Hybrid triggering**: errors/completion flush immediately, normal output debounces 5s
- **Priority budgeting**: error(5) > build/test(4) > commit/phase(3) fills 1500 chars

## Multi-AI Orchestration (AIOS v5.3)

Olympus ships with AIOS v5.3 — Deep Engineering Protocol with Claude-Codex Co-Leadership.

Run from Claude CLI:

```bash
# Auto mode (default) — fully autonomous, no user intervention
/orchestration "Implement cart feature end-to-end"

# Approval mode — user confirms at Phase 3 (plan lock) and Phase 8 (final)
/orchestration --plan "Refactor authentication flow"

# Strict mode — user approves every phase transition
/orchestration --strict "Payment system overhaul"
```

Highlights:

- 10-phase workflow (planning → execution → validation)
- **Auto mode by default** — fully autonomous execution
- `--plan` for approval checkpoints, `--strict` for full control
- Consensus checkpoints for critical phases
- Quality gates (build/lint/type/test)
- Checkpoint and rollback workflow
- Learning memory for repeated failure prevention

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Client Layer                                │
│  Telegram Bot  │  Web Dashboard  │  TUI  │  CLI         │
│  (/codex RPC)  │  (CodexPanel)   │       │  (--mode)    │
└────────────────┴─────────────────┴───────┴──────────────┘
                         ↕ WebSocket + REST
┌─────────────────────────────────────────────────────────┐
│                    Gateway (Core)                        │
│  RPC Router (+codex.*) │ Channels │ Codex Agent (V2)    │
│  CodexAdapter ──→ Codex Orchestrator (V3)               │
│  WorkerManager (legacy/hybrid) │ Memory │ Security      │
└─────────────────────────────────────────────────────────┘
                         ↕
┌─────────────────────────────────────────────────────────┐
│              Codex Orchestrator (packages/codex/)        │
│  Router │ SessionManager │ OutputMonitor │ AgentBrain   │
│  ResponseProcessor │ ContextManager (FTS5 per-project)  │
└─────────────────────────────────────────────────────────┘
```

### Packages (9)

```text
packages/
├── protocol/     # Message types, Agent state machine, Codex types
├── core/         # Orchestration, TaskStore (SQLite)
├── gateway/      # HTTP+WS server, Agent, Workers, Memory, Channels, CodexAdapter
├── cli/          # CLI entry point + Claude wrapper + --mode selection
├── client/       # WebSocket client (auto-reconnect, Codex RPC)
├── web/          # React dashboard (Vite, Tailwind, CodexPanel, ProjectBrowser)
├── tui/          # Terminal UI (Ink)
├── telegram-bot/ # Telegram bot (Telegraf, Smart Digest, /codex RPC)
└── codex/        # ⭐ Codex Orchestrator (multi-project AI orchestrator)

orchestration/
├── commands/     # Slash commands
├── mcps/         # MCP servers
├── skills/       # Bundled skills
└── plugins/      # Plugins
```

### CLI `--mode` option

| Mode | Behavior |
|------|----------|
| `legacy` | Full V2 Agent/Worker/Memory initialization |
| `hybrid` | V2 + Codex Orchestrator running simultaneously |
| `codex` (default) | Codex Orchestrator only, V2 Agent/Worker/Memory disabled |

> Detailed architecture: [`docs/V2_ARCHITECTURE.md`](docs/V2_ARCHITECTURE.md)
> API reference: [`docs/V2_API_REFERENCE.md`](docs/V2_API_REFERENCE.md)

## Development

```bash
pnpm install
pnpm build
pnpm test       # 535 tests (gateway 372 + codex 82 + telegram 57 + core 24)
pnpm lint       # tsc --noEmit (6 packages)
```

## Troubleshooting

### Dashboard shows "Failed to fetch" or "Cannot connect to Gateway"

When using `olympus server start`, the Dashboard receives Gateway config (host, port, apiKey) automatically via `window.__OLYMPUS_CONFIG__` injection. No manual setup is needed.

If running the Vite dev server separately (port 5173), CORS is allowed by default. For any other port, add it to `packages/gateway/src/cors.ts`.

Always **restart Gateway** after changing Gateway code.

### Telegram bot sends too many notifications

The bot uses **Smart Digest mode** by default. All output passes through the digest engine, extracting only key results (build/test/error/commit info). Switch to raw mode with `/mode raw` if needed.

**Digest Engine Features**:
- 6-category line classification with priority scoring
- Noise pattern filtering (tool actions, spinners, dividers)
- Secret redaction (API keys, tokens, hex strings)
- Hybrid triggering (immediate on error/completion, 5s debounce otherwise)

**Additional Gateway-level anti-spam**:
- 2s debounce + 3s throttle
- 10-char minimum change threshold
- Noise filtering: prompts, status bars, spinners

If spam persists, **restart Gateway** to apply the latest filters.

### `olympus start` fails to connect to Gateway

`olympus start` registers a worker through Gateway APIs. Start Gateway first:

```bash
olympus server start
olympus start -n my-worker
```

## License

MIT
