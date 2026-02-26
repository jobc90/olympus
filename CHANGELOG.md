# Changelog

All notable changes to the Olympus project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

---

## [1.0.1] - 2026-02-26

### Added

- **Dashboard Chat buttons on Codex/Gemini panels**: Zeus (Codex) and Hera (Gemini) status panels now have Chat buttons (bottom-right, `absolute bottom-2.5 right-2.5`) matching WorkerCard UX — tap to open chat modal directly from the panel
- **`olympus server stop --web-port`**: Stop command now accepts `--web-port <port>` option to correctly stop Dashboard running on a non-default port (e.g., `olympus server stop --web-port 8202`)
- **`olympus setup --reset` API Key rotation**: `--reset` now prompts "API Key도 재생성하시겠습니까? (y/N)" — allows key rotation without full reinstall; existing connections warned before key changes
- **Port validation in `olympus setup`**: Setup wizard now validates port input — rejects `NaN`, empty values, and out-of-range (1–65535) inputs with a clear error message
- **4-channel local PTY sync** (`start.ts`): Local terminal inputs now propagate to Gateway as task records → Telegram + Dashboard receive notifications for every command typed in the PTY terminal; `forceCompleteIfSettling()` in `pty-worker.ts` prevents blocking on settle timer during sequential inputs
- **Windows `cmd.exe` env var instructions** (`install-win.sh` Phase 4.9): `setx` command now listed alongside PowerShell method for users without Git Bash

### Changed

- **Gemini/Codex CLI installation is now opt-in** (`install.sh`): Previously auto-installed globally without consent; now prompts `y/N` before installing either CLI — reduces unwanted global package changes for existing users
- **Windows `commands` mode skips MCP install** (`install-win.sh`): `commands` mode no longer installs MCP dependencies (they were unused in this mode); informational message guides users to `--local`/`--global` if MCP tools are needed
- **Node.js engine requirement corrected** (`packages/cli/package.json`): `engines` field updated from `>=18` to `>=22` — prevents silent runtime failures on Node 18/20 where `npm install` completes but `olympus` crashes at runtime
- **API Key masked in setup summary** (`setup.ts`): `olympus setup` now displays only the first 12 characters (`oly_xxxx...`) in the completion summary instead of the full key — reduces accidental exposure in screen recordings or shared terminal output
- **DM policy default corrected** (`.env.example`): `TELEGRAM_DM_POLICY` changed from `allow` to `allowlist` to match the actual code default (`security.ts`); added warning comment about the security implications of `allow`

### Fixed

- **CRITICAL — `handledTaskIds` TDZ race condition** (`start.ts`): `const handledTaskIds` declaration moved from after `ptyWorker.start()` to before PtyWorker instantiation — a `ReferenceError` could occur if `onLocalInput` fired in the narrow window between PTY ready and line 303
- **CRITICAL — CodexOrchestrator zombie process on shutdown** (`gateway/src/codex-adapter.ts`, `server.ts`): Added `CodexAdapter.shutdown()` method that delegates to the underlying `CodexOrchestrator.shutdown()`; `olympus server start` now calls it on exit instead of leaving the stub comment — Codex CLI child processes are no longer orphaned after Ctrl+C
- **CRITICAL (security) — `.env.example` DM policy mismatch**: Default `TELEGRAM_DM_POLICY=allow` in the example file conflicted with the code default `allowlist`; users copying the example verbatim would unknowingly create a publicly accessible bot
- **HIGH — Windows-incompatible `sed` pipe in update check** (`server.ts`): `npm list -g ... | grep ... | sed 's/.*@//'` shell pipeline replaced with cross-platform `npm list --json` + JSON parsing — no longer fails silently on Windows where `sed`/`grep` are unavailable
- **HIGH — Missing `SIGHUP`/`SIGQUIT` signal handlers** (`server.ts`): Only `SIGINT`/`SIGTERM` were handled; SSH disconnect (`SIGHUP`) and terminal quit (`SIGQUIT`) now trigger the same graceful shutdown path; added `isShuttingDown` guard to prevent double-invocation
- **HIGH — `--dashboard` alone starts in broken state** (`server.ts`): `olympus server start --dashboard` without `--gateway` now warns the user that Dashboard cannot connect without a Gateway, instead of silently starting a disconnected Dashboard
- **HIGH — Dashboard stop ignores custom Dashboard port** (`server.ts`): `olympus server stop` hardcoded port `8201`; now uses the `--web-port` option value (default: 8201) so non-default ports are correctly terminated
- **LOW — Windows paths not shortened in Dashboard** (`WorkerCard.tsx`, `OlympusTempleMonitor.tsx`): `C:\Users\...\` paths now shortened to `~\` — macOS/Linux `~/` shortening was already present; Windows equivalent added

---

## [1.0.0] - 2026-02-25

### Added

- **Local PTY → Gateway 4-channel sync** (`start.ts`, `pty-worker.ts`): `onLocalInput` callback captures Enter keystrokes in the local PTY terminal and relays them as Gateway task records → Telegram (Ch3) and Dashboard (Ch1) receive notifications; `monitorForCompletion()` reports task results back through the same pipeline
- **Dashboard chat mirror to Telegram**: Codex/Gemini replies triggered from Dashboard character-card chat are now mirrored to Telegram as concise messages (`🖥️ [Dashboard→Zeus/Hera] ...`) for cross-channel visibility
- **Worker task recovery fallback**: Worker daemon now polls `/api/workers/tasks` (5 s interval + WS reconnect hook) to recover tasks that may have been missed when `worker:task:assigned` WS events are dropped
- **Sprite rendering overhaul**: Full character sprite redesign — chibi proportions, hair shading, 6 outfits, 4 crown accessories, 21 prop types, divine symbol glyphs; removed v2 sprite system
- **OlympusMountain top-down RPG map**: Complete visual redesign — RPG Maker style top-down view, 6 sanctuary zones, 10 furniture types, 13 particle types, worker motion with workerId-seeded cadence variance
- **Team Engineering Protocol v4.0**: Step 0 proactive skill discovery, Step 1 MCP 3-way auto-verification, Step 2 File Ownership Matrix + Dependency DAG, Step 3 dynamic team scaling, Step 5 DAG-based parallel execution, Step 6 multi-reviewer gate, plus Circuit Breaker + Crash Recovery

### Changed

- **Dashboard chat request metadata**: Web Dashboard now sends `source: "dashboard"` and optional `chatId` for `/api/codex/chat` and `/api/chat`, enabling channel-aware routing and mirror delivery
- **Telegram source tagging**: Telegram bot now sends `source: "telegram"` to `/api/codex/chat` to prevent cross-channel echo loops
- **ChatWindow detail hint**: Codex/Gemini chat panel now shows `Sync: Dashboard + Telegram` status for clearer UX expectations
- **Version bump**: 0.3.0 → 1.0.0 across all packages

### Fixed

- **Telegram duplicate completion noise**: Telegram no longer sends raw `worker:task:completed`/`worker:task:final_after_timeout` payload text; users receive only `worker:task:summary` concise output
- **Reconnect replay duplication**: Telegram catch-up path no longer replays raw worker completion bodies after reconnect, reducing message spam
- **install-win.sh Node.js v22+ version check** and `USERPROFILE` fallback
- **Telegram help message**: `/team` → `team` (no slash prefix in bot commands)
- **Mode fallback**: Unknown `--mode` values now fall back to `codex` with a warning instead of crashing

---

## [0.5.1] - 2026-02-11

### Changed

- **Telegram @mention delegation**: Users now directly mention workers with `@worker-name task` instead of Codex auto-delegating. This gives users explicit control over which worker receives the task.
- **Inline query**: Telegram inline query now shows available workers (with status) instead of session list. Type `@botname` in any chat to pick a worker.
- **Codex chat simplification**: `/api/codex/chat` returns only `chat` type responses. Removed `delegate` and `no_workers` response types — worker delegation is now handled by the Telegram bot's @mention parser.
- **System prompt**: Codex system prompt simplified to advise users about `@worker mention` syntax instead of generating `[DELEGATE:name]` patterns.

---

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

---

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

---

[Unreleased]: https://github.com/jobc90/olympus/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/jobc90/olympus/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/jobc90/olympus/compare/v0.5.1...v1.0.0
[0.5.1]: https://github.com/jobc90/olympus/releases/tag/v0.5.1
[0.5.0]: https://github.com/jobc90/olympus/releases/tag/v0.5.0
[0.3.0]: https://github.com/jobc90/olympus/releases/tag/v0.3.0
