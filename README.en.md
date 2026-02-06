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
- [Multi-AI Orchestration (AIOS v5.1)](#multi-ai-orchestration-aios-v51)
- [Architecture](#architecture)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

## What is Olympus?

Olympus extends Claude CLI into a practical development operations platform:

1. **Multi-AI Orchestration (AIOS v5.1)**: Claude + Gemini + Codex with Co-Leadership workflow
2. **Context OS**: hierarchical context management (Workspace → Project → Task)
3. **Remote Access**: run and control local sessions through Gateway + Telegram (with output summarization and anti-spam filtering)
4. **Stable Sessions**: tmux-backed long-running Claude sessions
5. **Visibility**: Web dashboard with auto-config, real-time session output, and context explorer

## Quick Start (60s)

```bash
git clone https://github.com/jobc90/olympus.git
cd olympus
./install.sh --global
olympus setup
olympus start
olympus server start
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
- tmux (optional, required for `olympus start`)
- Gemini CLI (optional for Multi-AI)
- Codex CLI (optional for Multi-AI)

## Platform Requirements

| Feature | macOS | Linux | Windows |
|---|---|---|---|
| `/orchestration` protocol | ✅ | ✅ | ✅ |
| `olympus` CLI wrapper | ✅ | ✅ | ✅ |
| Dashboard | ✅ | ✅ | ✅ |
| tmux session mode (`olympus start`) | ✅ | ✅ | ❌ |
| Telegram remote control | ✅ | ⚠️ | ❌ |

## Usage

### Core Commands

```bash
olympus                 # Launch Claude CLI (wrapper)
olympus start           # Start Claude in tmux
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
| `olympus start` | Start Claude in tmux |
| `olympus server start` | Start integrated services |
| `olympus server stop` | Stop services |
| `olympus server status` | Check service status |
| `olympus setup` | Interactive setup wizard |
| `olympus quickstart` | Quick setup + run |
| `olympus config` | Config management |
| `olympus models` | Model config sync (core + MCP) |
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

- `/start`
- `/sessions`
- `/use <name>`
- `/close [name]`
- `/health`
- `/orchestration <request>`

## Multi-AI Orchestration (AIOS v5.1)

Olympus ships with AIOS v5.1 and Claude-Codex Co-Leadership.

Run from Claude CLI:

```bash
/orchestration "Implement cart feature end-to-end"
```

Highlights:

- 10-phase workflow (planning → execution → validation)
- Consensus checkpoints for critical phases
- Quality gates (build/lint/type/test)
- Checkpoint and rollback workflow
- Learning memory for repeated failure prevention

## Architecture

```text
packages/
├── cli/
├── core/
├── gateway/
├── telegram-bot/
├── web/
├── tui/
├── client/
└── protocol/

orchestration/
├── commands/
├── mcps/
├── skills/
└── plugins/
```

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
```

## Troubleshooting

### Dashboard shows "Failed to fetch" or "Cannot connect to Gateway"

When using `olympus server start`, the Dashboard receives Gateway config (host, port, apiKey) automatically via `window.__OLYMPUS_CONFIG__` injection. No manual setup is needed.

If running the Vite dev server separately (port 5173), CORS is allowed by default. For any other port, add it to `packages/gateway/src/cors.ts`.

Always **restart Gateway** after changing Gateway code.

### Telegram bot sends too many notifications

Anti-spam filters are applied at the Gateway level:
- 2s debounce (waits for output to stabilize)
- 3s minimum interval between sends
- 10-char minimum change threshold
- Noise filtering: user prompt lines (`❯`), status bar (token/cost), spinners, and Claude Code UI elements are stripped

If spam persists, **restart Gateway** to apply the latest filters.

### tmux scroll in `olympus start`

If mouse wheel does not scroll past output in tmux, enable mouse mode in `~/.tmux.conf`:

```bash
set -g mouse on
setw -g mode-keys vi
set -g history-limit 50000
```

Then reload:

```bash
tmux source-file ~/.tmux.conf
```

## License

MIT
