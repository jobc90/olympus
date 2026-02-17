# Olympus v1.0 — Claude CLI Enhanced Platform

**Team Engineering Protocol + Gateway + Dashboard**

## Language Policy

**User-facing output (CLI terminal, Telegram chat) → Korean (한국어)**
**All internal operations → English**: inter-agent communication, subagent task prompts, context storage (LocalContextStore), system prompts, reasoning, logs.

사용자에게 직접 보여지는 응답만 한국어로 작성하고, 나머지 모든 내부 작업은 영어로 진행합니다.

## Architecture

Olympus is a Multi-AI collaborative development platform centered on Claude CLI. Starting from v1.0, it includes 19 Custom Agents and the Team Engineering Protocol.

### Package Dependencies (Build-time)
```
protocol → core → gateway
    │        │       ↑
    ├→ client ─→ tui ┤
    │   └──────→ web │ (standalone build)
    ├→ telegram-bot  │
    └→ codex ─→ core │
                     │
cli (depends on all: protocol, core, gateway, client, tui, codex, telegram-bot)
```

### Runtime Communication
```
web ←──WebSocket──→ gateway (served by cli `olympus server start`)
tui ←──WebSocket──→ gateway (served by cli `olympus server start`)
telegram-bot ←──HTTP──→ gateway (served by cli `olympus server start`)
```

### Gateway Internal Architecture
```
┌──────────────────────── Gateway ─────────────────────────┐
│                                                           │
│  Claude CLI ◄── CliRunner ──────► stdout real-time stream │
│  Codex CLI  ◄── CodexAdapter ◄──► codex package          │
│  Gemini CLI ◄── GeminiAdvisor ──► context enrichment     │
│                     │              (Athena)               │
│                     ├──► Auto-injects project analysis    │
│                     │    into Codex chat / Worker tasks   │
│                     └──► Memory Synthesizer: ALL worker   │
│                          history (50) → workHistory field │
│                                                           │
│  WorkerRegistry · MemoryStore · SessionStore              │
│  LocalContextStore (SQLite + FTS5 hierarchical context)   │
└───────────────────────────────────────────────────────────┘
```

### Core Pipeline (tmux-free)
1. **Gateway** (`packages/gateway/`) — HTTP API + WebSocket server
2. **CliRunner** (`gateway/src/cli-runner.ts`) — Spawn CLI process → JSON/JSONL → parse + stdout real-time streaming
3. **Dashboard** (`packages/web/`) — Real-time dashboard (LiveOutputPanel, AgentHistoryPanel, SessionCostTracker)
4. **Telegram Bot** (`packages/telegram-bot/`) — HTTP API-based sync/async communication

### CLI Execution Modes
- **`olympus server start`** — Unified startup of Gateway + Dashboard + Telegram Bot
- **`olympus start`** — Run Claude CLI in foreground on current terminal (`spawn + stdio: 'inherit'`)
- **`olympus start-trust`** — `--dangerously-skip-permissions` mode

### API Endpoints

#### Health & Auth
- `GET /healthz` — Health check (no auth required)
- `POST /api/auth` — API Key verification
- `POST /api/chat` — Lightweight Gemini chat (fast response)

#### CLI Runner
- `POST /api/cli/run` — Synchronous CLI execution
- `POST /api/cli/run/async` — Asynchronous CLI execution (returns taskId immediately)
- `GET /api/cli/run/:id/status` — Async task status query
- `GET /api/cli/sessions` — Saved CLI session list
- `DELETE /api/cli/sessions/:id` — Delete CLI session

#### Workers
- `POST /api/workers/register` — Register worker
- `GET /api/workers` — Worker list
- `DELETE /api/workers/:id` — Delete worker
- `POST /api/workers/:id/heartbeat` — Worker heartbeat
- `POST /api/workers/:id/task` — Assign task to worker
- `POST /api/workers/tasks/:taskId/result` — Report worker task result
- `GET /api/workers/tasks/:taskId` — Worker task status query

#### Codex
- `POST /api/codex/chat` — Codex conversation (delegates to worker on @mention)
- `POST /api/codex/route` — Codex Orchestrator routing
- `POST /api/codex/summarize` — Lightweight text summarization

#### Runs (Orchestration)
- `POST /api/runs` — Create new run
- `GET /api/runs` — List all runs
- `GET /api/runs/:id` — Get run status
- `DELETE /api/runs/:id` — Cancel run

#### Sessions
- `POST /api/sessions` — Create session
- `GET /api/sessions` — List active sessions
- `GET /api/sessions/:id` — Get session
- `GET /api/sessions/:id/context` — Get session + linked context
- `DELETE /api/sessions/:id` — Terminate session
- `POST /api/sessions/:id/input` — *deprecated* (use POST /api/cli/run)
- `GET /api/sessions/:id/output` — *deprecated* (use CLI streaming)

#### Tasks (Context OS)
- `GET /api/tasks` — Root task list (?format=tree for tree view)
- `POST /api/tasks` — Create task
- `GET /api/tasks/:id` — Get task
- `PATCH /api/tasks/:id` — Update task
- `DELETE /api/tasks/:id` — Delete task (soft)
- `GET /api/tasks/:id/children` — Child task list
- `GET /api/tasks/:id/context` — Task + resolved context
- `GET /api/tasks/:id/history` — Context change history
- `GET /api/tasks/search` — Search tasks (?q=)
- `GET /api/tasks/stats` — Task statistics

#### Contexts (Context OS)
- `GET /api/contexts` — Context list (?scope=, ?format=tree)
- `POST /api/contexts` — Create context
- `GET /api/contexts/:id` — Get context
- `PATCH /api/contexts/:id` — Update context (optimistic locking, expectedVersion required)
- `DELETE /api/contexts/:id` — Delete context (soft)
- `GET /api/contexts/:id/versions` — Version history
- `GET /api/contexts/:id/children` — Child contexts
- `POST /api/contexts/:id/merge` — Merge request (async 202)
- `POST /api/contexts/:id/report-upstream` — Report to parent context (async 202)

#### Operations
- `GET /api/operations/:id` — Async operation status query

#### Local Context
- `GET /api/local-context/projects` — Root-level all project contexts
- `GET /api/local-context/:encodedPath/summary` — Project integrated context
- `GET /api/local-context/:encodedPath/workers` — Worker context list
- `GET /api/local-context/:encodedPath/injection` — Context for injection

#### Gemini Advisor
- `GET /api/gemini-advisor/status` — Gemini Advisor status
- `GET /api/gemini-advisor/projects` — Cached project analysis list
- `GET /api/gemini-advisor/projects/:encodedPath` — Specific project analysis
- `POST /api/gemini-advisor/refresh` — Manual full refresh
- `POST /api/gemini-advisor/analyze/:encodedPath` — Analyze specific project immediately

### WebSocket Events

WebSocket connections are established on the `GATEWAY_PATH` path. After authentication via a `connect` message, events can be received.

#### Client → Server
- `connect` — API Key auth + client registration
- `subscribe` — Subscribe to specific Run/Session
- `unsubscribe` — Unsubscribe
- `cancel` — Cancel Run
- `ping` — Heartbeat
- `rpc` — RPC method call

#### Server → Client (Broadcast)
- `connected` — Auth success response
- `runs:list` — Full run list (initial snapshot + on change)
- `sessions:list` — Active session list (initial snapshot + on change)
- `cli:stream` — CLI stdout real-time chunks
- `cli:complete` — CLI execution completion result
- `gemini:status` — Gemini Advisor status (initial snapshot + on change)
- `gemini:analysis` — Gemini analysis completed

#### Server → Client (Worker Events)
- `worker:task:assigned` — Task assigned to worker
- `worker:task:completed` — Worker task completed

#### Server → Client (Agent Events, legacy/hybrid mode)
- `agent:progress` — Agent progress
- `agent:result` — Agent result
- `agent:error` — Agent error
- `agent:approval` — Agent approval request
- `worker:started` — Legacy worker started
- `worker:output` — Legacy worker output
- `worker:done` — Legacy worker done

#### Server → Client (Session Events, subscribed clients only)
- `session:screen` — Session screen output
- `session:error` — Session error
- `session:closed` — Session closed

#### Server → Client (Context Events)
- `context:created` — Context created
- `context:updated` — Context updated
- `context:merge_requested` — Merge requested
- `context:merged` — Merge completed
- `context:conflict_detected` — Merge conflict detected
- `context:reported_upstream` — Upstream report completed

### Telegram Bot Worker Delegation
- **Direct mention**: `@workerName task` format for users to directly instruct workers
- **Team mode**: `/team task` bot command or `@worker team task` prefix to activate Team Engineering Protocol
- **Inline query**: Type `@botName` to display worker list
- **`/workers` command**: View worker list

### 19 Custom Agents (`.claude/agents/`)
- **Core 3**: explore (Haiku), executor (Sonnet), writer (Haiku)
- **On-Demand 16**: architect, analyst, planner, designer, researcher, code-reviewer, verifier, qa-tester, vision, test-engineer, build-fixer, git-master, api-reviewer, performance-reviewer, security-reviewer, style-reviewer

### Team Engineering Protocol v3.2 (`/team` command — MCP 3-Way Verification + Proactive Skills)
- **Step 0**: Session Setup + **Proactive Skill & Plugin Discovery** (`find-skills` mandatory, 10-domain auto-activation mapping)
- **Step 1**: Requirement Registry (ZERO LOSS — analyst + explore parallel, **MCP 3-Way Auto-Verification** replacing user confirmation, `.team/requirements.md` persistent storage)
- **Step 2**: Work Decomposition + **File Ownership Analysis** (planner DAG, **Shared File Zone**, **File Ownership Matrix** → `.team/ownership.json`, **Dependency DAG** — WI-level blockedBy, architect Quality Gate)
- **Step 3**: Team Creation (**1 WI = 1 Teammate** dynamic scaling, `{subagent_type}-{N}` naming, **OWNED + SHARED FILES + BOUNDARY** per WI)
- **Step 4**: Consensus Protocol (codex_analyze MCP)
- **Step 5**: **DAG-Based Parallel Execution** (ai_team_patch + domain-specific MCP active usage, **all WIs without blockedBy start immediately**, **Streaming Reconciliation 3-Tier** — C-1 Per-WI lightweight verification + C-2 Checkpoint build + C-3 Final)
- **Step 6**: Multi-Reviewer Gate (code-reviewer + style-reviewer always, api/security/performance/vision conditional parallel)
- **Step 7**: Spec Verification (verifier — `.team/requirements.md` based R# evidence verification)
- **Step 8**: Evidence-Based QA (qa-tester)
- **Step 9**: Finalization (writer documentation + git-master commit cleanup + `.team/` deletion)
- **Circuit Breaker**: Task metadata `failCount` permanent record, escalate to architect after 3 failures
- **File Ownership Invariant**: At any point, 1 file = max 1 teammate; SHARED files managed by leader/designated owner
- **Crash Recovery**: Teammate unresponsive 30s → retry, 60s → re-spawn + WI reassignment

## Development

```bash
pnpm install && pnpm build    # Full build
pnpm test                     # Full test suite
pnpm lint                     # TypeScript type check
```

### CLI Backend Configuration
- **Claude**: `-p --output-format json` → JSON single object
- **Codex**: `exec --json` → JSONL (thread/turn/item events)
- **skipPermissions**: Codex = `--dangerously-bypass-approvals-and-sandbox`

## Olympus Local Data

`~/.olympus/` directory:
- `sessions.json` — Session metadata
- `worker-logs/` — Worker output logs
- `context.db` — Context OS workspace/project/task data

## Key Conventions

- No `tmux` dependency (fully removed in v0.4.0)
- Gateway `sessionTimeout <= 0` = no timeout
- `bot.launch()` — NEVER await (fire-and-forget + `.catch()`)
- ESM environment: `vi.spyOn(cp, 'spawn')` not possible, focus on pure function tests
- `parseRoute` query is `Record<string, string>` (not Map)
