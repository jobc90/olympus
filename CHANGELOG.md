# Changelog

All notable changes to the Olympus project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.1] - 2026-02-11

### Changed

- **Telegram @mention delegation**: Users now directly mention workers with `@worker-name task` instead of Codex auto-delegating. This gives users explicit control over which worker receives the task.
- **Inline query**: Telegram inline query now shows available workers (with status) instead of session list. Type `@botname` in any chat to pick a worker.
- **Codex chat simplification**: `/api/codex/chat` returns only `chat` type responses. Removed `delegate` and `no_workers` response types — worker delegation is now handled by the Telegram bot's @mention parser.
- **System prompt**: Codex system prompt simplified to advise users about `@worker mention` syntax instead of generating `[DELEGATE:name]` patterns.

## [0.5.0] - 2026-02-11

### Added

- **Dashboard auto-config**: Server injects `window.__OLYMPUS_CONFIG__` (host, port, apiKey) into Dashboard HTML at serve time — no manual Settings input needed
- **Dashboard TaskList grouping**: Tasks grouped by feature set with collapsible sections and per-group stats
- **Context Explorer edit mode**: Read-only by default with lock/unlock toggle; Settings button shown on auth errors
- **Telegram output summarization**: `summarizeOutput()` collapses long code blocks, removes verbose tool-use lines, head+tail truncation
- **Telegram message queue**: `enqueueSessionMessage()` serializes per-session sends to prevent interleaving
- **Telegram session display**: `/sessions` command with icons, relative age, short paths (`~/`), and visual hierarchy
- **Session Output Panel**: New web dashboard component showing real-time Claude CLI session output (`SessionOutputPanel.tsx`)
- **Session subscription**: `OlympusClient.subscribeSession()`/`unsubscribeSession()` + `onSessionOutput()`/`onSessionError()`/`onSessionClosed()` event handlers
- **Worker registry API**: Added `/api/workers/register`, `/api/workers`, `/api/workers/:id/heartbeat`, `/api/workers/:id` for worker lifecycle management
- **Worker daemon mode**: `olympus start` now registers a worker and waits for task assignment (with heartbeat + graceful unregister)
- **Codex chat endpoint**: Added `/api/codex/chat` with worker-aware system prompt and task delegation flow
- **CLI curl utility**: Added `olympus curl` wrapper that injects Gateway API key automatically

### Fixed

- **Dashboard CORS**: Added port 8201 (production Dashboard) to Gateway CORS whitelist — fixes "Failed to fetch" errors
- **Dashboard Context Explorer**: Added apiKey guard, AbortController for request cancellation, user-friendly error messages
- **Telegram output spam**: `filterOutput()` now strips user prompt lines (`❯ ...`), status bar lines (token/cost updates), spinner/progress indicators, and Claude Code UI chrome; `findNewContent()` filters both old and new output before diffing to eliminate false positives
- **Telegram message truncation**: Replaced 3500-char hard truncation with multi-part message delivery
- **Dashboard session clicks**: `TmuxSessionItem` now has click handler and active selection highlight
- **Dashboard logs empty**: `session:output`/`session:error`/`session:closed` events now populate the Logs panel
- **Context DB unused**: Session output now auto-updates task context via `ContextService` with `on-threshold` auto-report policy
- **Default port consistency**: Standardized Gateway/Dashboard defaults to `8200/8201` across CLI, docs, and remote access guidance

## [0.3.0] - 2026-02-06

Initial public release of Olympus — Claude CLI Enhanced Platform.

### Added

- **Monorepo scaffold**: 8-package pnpm + Turborepo workspace (`protocol`, `core`, `client`, `gateway`, `tui`, `telegram-bot`, `web`, `cli`) (`83743aa`)
- **Olympus CLI**: `olympus` command wrapping Claude CLI with `commander` + `ink` REPL (`50ebea2`, `d3b525a`)
- **CLI commands**: `start`, `setup`, `quickstart`, `server`, `gateway`, `telegram`, `tui`, `dashboard`, `config`, `models`, `auth` (`c392f5c`)
- **WebSocket Gateway**: HTTP/WS gateway server with session management, run manager, and API routes (`42b70ed`)
- **Session Manager**: tmux-backed session lifecycle with idle timeout (default: disabled) (`b7b5d24`)
- **Web Dashboard**: React + Vite + Tailwind SPA with agent stream, task list, phase progress, context explorer, and drag-and-drop task tree (`9071670`)
- **Telegram Bot**: Remote Claude CLI control via Telegram with `/start`, `/sessions`, `/use`, `/close`, `/health`, `/orchestration` commands (`42b70ed`)
- **TUI**: Ink-based terminal UI client (`42b70ed`)
- **Client SDK**: Shared WebSocket client library for TUI and Web (`42b70ed`)
- **Hierarchical Task DB**: SQLite-backed task store for AI agent long-term memory (`7318db2`)
- **Multi-AI Orchestration Protocol v5.1 (AIOS)**: 10-phase workflow with Claude-Codex Co-Leadership consensus protocol (`54a0a4b`)
- **Context OS**: 3-layer context management (Workspace/Project/Task) with SQLite storage and auto-escalation (`54a0a4b`)
- **MCP servers**: `ai-agents` (Gemini/Codex/GPT routing) and `openapi` (Swagger spec loader) (`80df4d7`)
- **Model auto-update**: Gemini model parsing from `@google/gemini-cli-core`, Codex model extraction from binary (`a6f3f17`)
- **install.sh**: Global/local install modes with direct symlink, CLAUDE.global.md template deployment, MCP server setup (`6ee29b5`)
- **Bilingual README**: Korean (726 lines) + English (269 lines) with language switcher badges (`c3a6f95`)
- **npm packaging**: `publishConfig`, `engines`, `bin`, `files` fields for npm distribution (`9b01147`)
- **Lint pipeline**: `tsc --noEmit` for 5 packages (cli, core, gateway, protocol, web)
- **Test pipeline**: `vitest` for core with `--passWithNoTests` fallback for CLI

### Changed

- **MCP config**: Extracted to portable `.mcp.json` with `${PWD}` relative paths (`ad474e8`)

### Fixed

- Build errors: `@types/node`, `tsconfig`, `tsup` external resolution (`0884be9`)
- Code review findings from momus agent (`74e8826`)
- GitHub URL corrected to `jobc90` (`ac40a51`)
- Gateway session idle timeout disabled by default to prevent long-running session kills (`b7b5d24`)
- CLI tsconfig: added `"jsx": "react-jsx"` for Ink/React TSX compilation

[Unreleased]: https://github.com/jobc90/olympus/compare/v0.5.1...HEAD
[0.5.1]: https://github.com/jobc90/olympus/releases/tag/v0.5.1
[0.5.0]: https://github.com/jobc90/olympus/releases/tag/v0.5.0
[0.3.0]: https://github.com/jobc90/olympus/releases/tag/v0.3.0
