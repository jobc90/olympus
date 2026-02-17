# Gateway Internals — Deep Dive

## Overview

The **Gateway** (`packages/gateway/`) is the central nervous system of Olympus — the HTTP/WebSocket server that orchestrates all CLI processes, workers, sessions, and AI advisors. It serves multiple user interfaces (Web, TUI, Telegram) and coordinates with external CLI processes (Claude, Codex, Gemini).

### Architecture Diagram

```
┌──────────────────────────── Gateway ────────────────────────────┐
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  WebSocket Server                                       │   │
│  │  ├── Client Auth (API key)                              │   │
│  │  ├── Message Routing                                    │   │
│  │  ├── Broadcast System (runs:list, cli:stream, etc)      │   │
│  │  └── RPC Handler (request/ack/result/error)             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              ↓                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Core Managers                                          │   │
│  │  ├── RunManager (orchestration runs)                    │   │
│  │  ├── SessionManager (CLI sessions)                      │   │
│  │  ├── WorkerRegistry (registered Claude workers)         │   │
│  │  ├── CliSessionStore (SQLite persistence)               │   │
│  │  └── MemoryStore (in-memory pattern/learning)           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              ↓                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Execution & Analysis                                   │   │
│  │  ├── CliRunner (spawn Claude/Codex, parse JSON/JSONL)   │   │
│  │  ├── CodexAdapter (orchestrator integration)            │   │
│  │  ├── GeminiAdvisor (project analysis AI)                │   │
│  │  └── CodexAgent (legacy agent state machine)            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              ↓                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Integrations                                           │   │
│  │  ├── LocalContextStoreManager (context OS)              │   │
│  │  ├── ChannelManager (dashboard, telegram)               │   │
│  │  ├── WorkerManager (legacy agent workers)               │   │
│  │  └── UsageMonitor (token tracking)                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
         ↓                    ↓                    ↓
    Claude CLI           Codex CLI           Gemini CLI
    (prompts)            (messages)          (analysis)
```

---

## 1. WebSocket Server (`server.ts`)

### Purpose
Manages WebSocket connections from Web, TUI, and Telegram clients. Authenticates clients, routes messages, broadcasts events to subscribers.

### Client Lifecycle

```typescript
// ClientInfo structure in server.ts
interface ClientInfo {
  ws: WebSocket;
  clientType: string;              // 'web' | 'tui' | 'cli'
  connectedAt: number;
  alive: boolean;
  authenticated: boolean;
  subscribedRuns: Set<string>;     // Run IDs this client subscribes to
  subscribedSessions: Set<string>; // Session IDs this client subscribes to
}
```

### Connection Flow

```
1. Client connects → WebSocket server accepts
2. Client sends 'connect' message with API key
3. Gateway validates key (validateWsApiKey)
4. Gateway sends 'connected' response + initial snapshots
5. Client can now subscribe/unsubscribe/send RPC
6. Periodic heartbeat (HEARTBEAT_INTERVAL_MS) to detect dead clients
```

### Message Types

**Client → Gateway:**
- `connect` — API key authentication
- `subscribe` — Subscribe to specific Run/Session events
- `unsubscribe` — Unsubscribe
- `cancel` — Cancel Run/Task
- `ping` — Heartbeat

**Gateway → Client (Broadcast):**
- `connected` — Auth success with protocol version
- `runs:list` — Full run list on change
- `sessions:list` — Active session list on change
- `cli:stream` — Claude CLI stdout chunks (real-time)
- `cli:complete` — CLI execution finished
- `gemini:status` — Gemini Advisor status updates
- `context:*` — Context OS events (created, updated, merged, etc)
- `worker:*` — Worker registration/task/completion events
- `phase:change`, `agent:start/chunk/complete/error` — Run phase changes

### RPC System

The Gateway exposes remote methods via WebSocket RPC:

```
Client → { type: 'rpc', payload: { method: 'agent.command', params: {...} } }
Gateway → { type: 'rpc:ack', payload: { requestId } }
Gateway → { type: 'rpc:result', payload: { requestId, result } }
    OR
Gateway → { type: 'rpc:error', payload: { requestId, code, message } }
```

Methods registered via `RpcRouter.register()`:
- `agent.command` — Submit command to CodexAgent
- `memory.learn` — Learn pattern for MemoryStore
- `codex.status` — Query Codex orchestrator status
- `codex.projects` — List Codex projects

---

## 2. CliRunner (`cli-runner.ts`) — Core CLI Execution Module

### Purpose
Spawns Claude/Codex CLI processes in non-interactive mode, parses structured output (JSON/JSONL), manages concurrency, streams stdout in real-time.

### CLI Providers

#### Claude Mode
```bash
claude -p --output-format json "prompt here"
```

**Output Structure (JSON):**
```typescript
interface ClaudeCliOutput {
  result: string;              // Agent response
  session_id: string;          // Session for resume
  is_error: boolean;
  total_cost_usd: number;
  num_turns: number;
  duration_ms: number;
  duration_api_ms: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;  // Prompt caching
    cache_read_input_tokens?: number;
  };
}
```

#### Codex Mode
```bash
codex exec --json "prompt here"           # New session
codex exec resume --json <sessionId> "prompt"  # Resume
```

**Output Structure (JSONL):**
```
{ "type": "thread", "data": { ... } }
{ "type": "turn", "data": { ... } }
{ "type": "item", "data": { "role": "user", "content": "..." } }
...
```

### Key Functions

#### `buildCliArgs(params: CliRunParams, backend: CliBackendConfig): string[]`

Constructs CLI command-line arguments based on execution parameters:

```typescript
interface CliRunParams {
  prompt: string;
  provider?: 'claude' | 'codex';
  model?: string;
  sessionId?: string;              // Reuse session
  resumeSession?: boolean;         // Resume conversation
  workspaceDir?: string;           // Working directory
  timeoutMs?: number;              // Execution timeout
  systemPrompt?: string;           // Claude system prompt
  dangerouslySkipPermissions?: boolean;  // Auto-approve
  allowedTools?: string[];         // Restrict tools
  onStream?: (chunk: string) => void;  // Real-time stdout
}
```

**Example: Resume Codex Session**
```typescript
buildCliArgs(
  {
    prompt: "next step",
    provider: "codex",
    resumeSession: true,
    sessionId: "abc123",
  },
  CODEX_BACKEND,
);
// → ['exec', 'resume', '--json', 'abc123', "next step"]
```

#### `runCli(params: CliRunParams): Promise<CliRunResult>`

Main entry point — spawns CLI process and returns structured result:

```typescript
export interface CliRunResult {
  success: boolean;
  text: string;               // Parsed response
  sessionId: string;
  model: string;
  usage: CliRunUsage;
  cost: number;
  durationMs: number;
  numTurns: number;
  error?: CliRunError;
}
```

**Execution Flow:**
1. Check concurrency limit (max 5 parallel CLIs)
2. Spawn CLI process with timeout
3. Collect stdout in real-time
4. Trigger `onStream` callback for WebSocket broadcast
5. Parse output (JSON for Claude, JSONL for Codex)
6. Save to CliSessionStore
7. Return CliRunResult

#### `spawnCli(...)` (Internal)

Low-level spawn wrapper:

```typescript
function spawnCli(
  backend: InternalBackendConfig,
  args: string[],
  cwd?: string,
  timeoutMs?: number,
  onStdout?: (chunk: string) => void,
): Promise<{ stdout: string; stderr: string; exitCode: number }>
```

- **Concurrency Control**: ConcurrencyLimiter(5) queue
- **Timeout Handling**: SIGTERM at timeout, SIGKILL at timeout+5s
- **stdout Streaming**: Lines split by `\n`, passed to `onStdout` immediately
- **Error Classification**: Parse stderr for known error patterns

#### `parseClaudeJson(stdout: string): ClaudeCliOutput`

Parses Claude's `--output-format json` output. Handles:
- Empty output → throw
- Invalid JSON → detailed error with first 200 chars
- Coerces all fields to expected types (string, number, boolean)

#### `parseCodexJsonl(stdout: string): CodexCliOutput`

Parses Codex's JSONL output. Collects all lines, parses each as JSON event, synthesizes into:

```typescript
interface CodexCliOutput {
  result: string;
  session_id: string;
  is_error: boolean;
  total_cost_usd: number;
  usage: CliRunUsage;
}
```

### Concurrency Management

**ConcurrencyLimiter(5)** enforces max 5 parallel CLI spawns:

```typescript
class ConcurrencyLimiter {
  async run<T>(fn: () => Promise<T>): Promise<T> {
    // Wait for queue to have capacity
    while (activeCount >= maxConcurrency) {
      await sleep(100);
    }
    activeCount++;
    try {
      return await fn();
    } finally {
      activeCount--;
    }
  }
}
```

**Configuration:**
```typescript
export function setMaxConcurrentCli(n: number): void
```

Default: 5. Can be adjusted at runtime.

---

## 3. WorkerRegistry (`worker-registry.ts`)

### Purpose
Tracks registered Claude CLI workers (started via `olympus start`), manages task assignment, monitors health via heartbeat.

### Worker Lifecycle

```
1. Worker starts (olympus start)
   ↓
2. Worker calls POST /api/workers/register
   → Returns workerId
   ↓
3. Worker sends heartbeat periodically (diagnostic only)
   → lastHeartbeat = now
   ↓
4. No automatic health checks or auto-removal
   → Workers persist until explicitly unregistered
   ↓
5. Worker shuts down
   → Calls DELETE /api/workers/:id (explicit unregister only)
```

### Types

```typescript
interface RegisteredWorker {
  id: string;
  name: string;                  // Derived from projectPath basename
  projectPath: string;
  pid: number;
  status: 'idle' | 'busy';
  registeredAt: number;
  lastHeartbeat: number;
  currentTaskId?: string;
  currentTaskPrompt?: string;
  mode?: 'pty' | 'spawn';       // How worker runs Claude CLI
}

interface WorkerTaskRecord {
  taskId: string;
  workerId: string;
  workerName: string;
  prompt: string;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  startedAt: number;
  completedAt?: number;
  result?: CliRunResult;
  chatId?: number;              // Telegram response target
}
```

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/workers/register` | POST | Register worker, returns `{ workerId, ... }` |
| `/api/workers` | GET | List all workers |
| `/api/workers/:id` | DELETE | Unregister worker |
| `/api/workers/:id/heartbeat` | POST | Update lastHeartbeat timestamp |
| `/api/workers/:id/task` | POST | Assign task (prompt), returns taskId |
| `/api/workers/tasks/:taskId` | GET | Query task status |
| `/api/workers/tasks/:taskId/result` | POST | Report task completion (CliRunResult) |

### Health Check (Removed)

Heartbeat-based auto-removal has been removed. Workers are only removed via explicit `DELETE /api/workers/:id` calls. The `heartbeat()` method still updates `lastHeartbeat` for diagnostic purposes but does not trigger auto-removal.

### Task Lifecycle

```typescript
createTask(workerId: string, prompt: string): WorkerTaskRecord
  → Marks worker as 'busy'
  → Returns taskId

reportTaskResult(taskId: string, result: CliRunResult): void
  → Updates task.result
  → Sets status to 'completed'
  → Marks worker as 'idle'
  → Emits 'task:completed' event
```

---

## 4. GeminiAdvisor (`gemini-advisor.ts` + `gemini-pty.ts`)

### Purpose
Uses Gemini CLI to analyze project structure and synthesize worker history into contextual insights for Codex and other AI systems. Provides long-term memory via "work history synthesis."

### Initialization

```typescript
async initialize(
  projects: Array<{ name: string; path: string }>,
  localContextManager?: LocalContextStoreManager,
): Promise<void>
```

1. Starts **GeminiPty** (PTY session with Gemini CLI)
2. Spawns background task: `analyzeAllProjects()`
3. Starts periodic refresh (every 5 minutes)

### Analysis Workflow

**Per Project:**
```
1. Collect LocalContext (if available)
   → Get project summary
   → Get recent 50 worker contexts for work history

2. Build analysis prompt
   → Include work history (max 50 entries)
   → Request JSON response

3. Send to Gemini CLI via PTY
   → Gemini analyzes + responds

4. Parse response
   → Extract structureSummary, techStack, keyPatterns, workHistory
   → Store in projectCache

5. Broadcast 'gemini:analysis' event
```

### Memory Synthesizer

The **workHistory** field synthesizes ALL worker task history into a compact narrative (max 2000 chars):

```typescript
// Get up to 50 worker contexts
const allWorkers = store.getRecentWorkerContexts(50);

// Format as narrative entries
const entries = allWorkers.map((w, i) => {
  const status = w.success ? 'OK' : 'FAIL';
  const files = w.filesChanged.slice(0, 3).join(', ');
  return `${allWorkers.length - i}. [${w.workerName}] ${status}: ${w.summary}`;
});

const workerHistoryStr = entries.join('\n');
```

This is included in:
- **Codex context** (buildCodexContext) → 4000 chars
- **Worker task** injection (buildProjectContext) → 3000 chars

### Cache & Refresh

```typescript
// In-memory cache
private projectCache = new Map<string, GeminiProjectAnalysis>();
private rootCache: GeminiRootAnalysis | null = null;
```

**Periodic refresh** (every 5 minutes):
- Re-analyze all projects
- Debounce rapid requests (10 seconds)
- On failure, preserve previous cache's workHistory

**API:**
- `GET /api/gemini-advisor/status` — Current behavior, analyzed projects
- `GET /api/gemini-advisor/projects/:encodedPath` — Specific analysis
- `POST /api/gemini-advisor/refresh` — Manual full refresh
- `POST /api/gemini-advisor/analyze/:encodedPath` — Immediate analysis

### GeminiPty

Manages PTY session with Gemini CLI:

```typescript
export class GeminiPty {
  async start(): Promise<void>
    → Spawn Gemini CLI in PTY
    → Wait for initialization prompt (3 + 15 seconds)
    → Filter initialization noise

  async sendPrompt(prompt: string, timeoutMs: number): Promise<string>
    → Send prompt via PTY.write()
    → Wait for response (idle 5 seconds)
    → Timeout handling (30s → SIGTERM)

  async stop(): Promise<void>
    → Kill PTY session
    → Clean up resources
}
```

---

## 5. SessionManager (`session-manager.ts`)

### Purpose
Manages CLI session lifecycle (tmux-free, JSON-based). Tracks active sessions, idle timeouts, context links.

### Session Structure

```typescript
interface Session {
  id: string;
  name: string;              // "backend", "frontend", "main"
  chatId: number;            // Telegram chat for async responses
  taskId: string;
  status: 'active' | 'closed';
  projectPath: string;
  workspaceContextId?: string;
  projectContextId?: string;
  taskContextId?: string;
  createdAt: number;
  lastActivityAt: number;
}
```

### Storage

**SessionStore** (internal JSON file store):
- Path: `~/.olympus/sessions.json`
- Format: JSON object with session ID → session data
- Auto-save on create/update/delete

### Lifecycle

```typescript
// Create session (returns sessionId)
createSession({
  name: "backend",
  projectPath: "/path/to/project",
  chatId: 123456,
  taskId: "task-id",
}): Session

// Get session
getSession(sessionId): Session | undefined

// Update activity (on CLI execution)
updateActivity(sessionId): void

// Close session
closeSession(sessionId): void
  → Sets status to 'closed'
  → Broadcasts 'closed' event
  → Keeps historical record (doesn't delete)

// List active sessions
listActive(): Session[]
```

### Idle Timeout

```typescript
sessionTimeout: number  // ms, <= 0 = disabled (default)
```

If enabled, SessionManager checks every 30 seconds:
```typescript
if (now - session.lastActivityAt > sessionTimeout) {
  closeSession(sessionId);
}
```

---

## 6. CliSessionStore (`cli-session-store.ts`)

### Purpose
SQLite persistence for Claude CLI session IDs and token/cost tracking.

### Schema

```sql
CREATE TABLE cli_sessions (
  key TEXT PRIMARY KEY,              -- "project:provider" or custom key
  provider TEXT DEFAULT 'claude',    -- 'claude' | 'codex'
  cli_session_id TEXT NOT NULL,      -- Session ID for --session-id / --resume
  model TEXT DEFAULT '',
  last_prompt TEXT DEFAULT '',
  last_response TEXT DEFAULT '',
  total_input_tokens INTEGER,
  total_output_tokens INTEGER,
  total_cost_usd REAL,
  turn_count INTEGER,
  created_at INTEGER,
  updated_at INTEGER
)
```

### Usage

```typescript
// Save after CLI execution
cliSessionStore.save({
  key: "olympus-main",
  provider: "claude",
  cliSessionId: "abc123",
  model: "claude-3-5-sonnet-20241022",
  totalInputTokens: 1000,
  totalOutputTokens: 500,
  totalCostUsd: 0.015,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// Retrieve for resume
const record = cliSessionStore.get("olympus-main");
// → Can use record.cliSessionId for --resume
```

### Configuration

```typescript
// Graceful degradation if better-sqlite3 not available
// (operates in-memory fallback)
```

---

## 7. CodexAdapter (`codex-adapter.ts`)

### Purpose
Bridges Gateway and Codex Orchestrator. Delegates Codex commands to the orchestrator, forwards Codex events through Gateway broadcast system.

### Event Flow

```
Codex Orchestrator
  ↓ (events)
CodexAdapter
  ↓ (broadcast)
Gateway.broadcastToAll()
  ↓
WebSocket clients
```

### Integration Points

```typescript
// CodexAdapter listens to Codex events
this.codex.on('session:screen', (payload) => {
  this.broadcast('session:screen', payload);
});

this.codex.on('session:execute', async (event) => {
  // Delegate CLI execution to runCli
  const result = await runCli({ prompt: event.input, ... });
  this.codex.completeTask(taskId, result.success);
});
```

### Context Injection

When handling user input, CodexAdapter injects:
- **Codex context** (4000 chars) — buildCodexContext()
  - Project summary
  - Work history
  - Active context
- **Local context** — from LocalContextStoreManager

---

## 8. RPC Router (`rpc/handler.ts`)

### Purpose
Routes WebSocket RPC method calls to registered handlers. Implements request/ack/result/error protocol.

### Method Registration

```typescript
rpcRouter.register(
  'agent.command',                // Method name
  async (params, context) => {    // Handler
    // Process params
    return result;
  },
  true  // requiresAuth (default: true)
);
```

### Request/Response Protocol

```
Client sends:
  {
    type: 'rpc',
    id: '12345',
    payload: {
      method: 'agent.command',
      params: { ... }
    }
  }

Gateway sends immediately (ack):
  {
    type: 'rpc:ack',
    id: '12345',
    payload: { requestId: '12345', message: 'Processing...' }
  }

Then (result):
  {
    type: 'rpc:result',
    id: '12345',
    payload: { requestId: '12345', result: { ... } }
  }

Or (error):
  {
    type: 'rpc:error',
    id: '12345',
    payload: {
      requestId: '12345',
      code: 'INTERNAL_ERROR',
      message: '...'
    }
  }
```

### Built-in Methods

#### System Methods (registerSystemMethods)
- `system.status` — Gateway uptime, client count
- `system.methods` — List all registered RPC methods

#### Agent Methods (registerAgentMethods)
- `agent.command` — Submit user command to CodexAgent
- `agent.approve` — Approve pending agent approval request

#### Memory Methods (registerMemoryMethods)
- `memory.learn` — Learn pattern for MemoryStore
- `memory.patterns` — List learned patterns

---

## 9. RunManager (`run-manager.ts`)

### Purpose
Manages orchestration "runs" — high-level multi-phase agent execution sequences.

### Run Structure

```typescript
interface RunInstance {
  id: string;
  bus: OlympusBus;               // Event bus for this run
  abortController: AbortController;
  status: 'running' | 'completed' | 'cancelled' | 'failed';
  createdAt: number;
  prompt: string;
  options: RunOptions;
  tasks: Map<string, TaskPayload>;
  phase: number;                 // -1 to 8
  phaseName: string;
}
```

### Lifecycle

```typescript
// Create run
const run = runManager.createRun({
  prompt: "Implement feature X",
  context: "...",
  agents: ['gemini', 'codex', 'gpt'],
  timeout: 60_000,
});
// → Returns RunInstance with id, bus, abortController

// Get run
const run = runManager.getRun(runId);

// List active runs
const activeRuns = runManager.listActiveRuns();

// Cancel run
runManager.cancelRun(runId);
  → Triggers abortController.abort()
  → All subscribed clients get 'run:cancelled' event
```

### Concurrency Control

```typescript
maxConcurrentRuns: number  // Default: 5
// Enforced on createRun()
```

---

## 10. API Routes (`api.ts`)

The Gateway exposes REST endpoints via HTTP server. All endpoints require API key authentication (via authMiddleware) except `/healthz`.

### Health & Config

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/healthz` | GET | Health check (no auth) |
| `/api/auth` | POST | Verify API key |

### CLI Runner

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/cli/run` | POST | Sync CLI execution, returns CliRunResult |
| `/api/cli/run/async` | POST | Async CLI execution, returns taskId |
| `/api/cli/run/:id/status` | GET | Query async task status |
| `/api/cli/sessions` | GET | List saved CLI sessions |
| `/api/cli/sessions/:id` | DELETE | Delete CLI session |

**Example Request:**
```bash
curl -X POST http://localhost:8765/api/cli/run \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "ls -la",
    "provider": "claude",
    "dangerouslySkipPermissions": true
  }'
```

### Workers

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/workers/register` | POST | Register worker |
| `/api/workers` | GET | List workers |
| `/api/workers/:id` | DELETE | Unregister |
| `/api/workers/:id/heartbeat` | POST | Send heartbeat |
| `/api/workers/:id/task` | POST | Assign task |
| `/api/workers/tasks/:taskId` | GET | Query task status |
| `/api/workers/tasks/:taskId/result` | POST | Report result |

### Codex

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/codex/chat` | POST | Codex conversation |
| `/api/codex/route` | POST | Route message to orchestrator |
| `/api/codex/summarize` | POST | Summarize text |

### Context OS (Tasks & Contexts)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/tasks` | GET / POST | Task CRUD |
| `/api/tasks/:id` | GET / PATCH / DELETE | Task detail operations |
| `/api/tasks/:id/children` | GET | Child tasks |
| `/api/tasks/search` | GET | Search tasks (query param: `q=`) |
| `/api/tasks/stats` | GET | Task statistics |
| `/api/contexts` | GET / POST | Context CRUD |
| `/api/contexts/:id` | GET / PATCH / DELETE | Context detail |
| `/api/contexts/:id/versions` | GET | Version history |
| `/api/contexts/:id/merge` | POST | Merge contexts |
| `/api/contexts/:id/report-upstream` | POST | Report to parent |

### Local Context

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/local-context/projects` | GET | Root project list |
| `/api/local-context/:encodedPath/summary` | GET | Project integrated context |
| `/api/local-context/:encodedPath/workers` | GET | Worker contexts for project |
| `/api/local-context/:encodedPath/injection` | GET | Context for injection (into prompts) |

### Gemini Advisor

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/gemini-advisor/status` | GET | Current status |
| `/api/gemini-advisor/projects` | GET | Cached analyses |
| `/api/gemini-advisor/projects/:encodedPath` | GET | Specific project analysis |
| `/api/gemini-advisor/refresh` | POST | Manual refresh |
| `/api/gemini-advisor/analyze/:encodedPath` | POST | Immediate analysis |

---

## 11. Agent Subsystem (`agent/`)

### Purpose
Legacy agent state machine (IDLE → ANALYZING → PLANNING → EXECUTING → REVIEWING → REPORTING → IDLE) for autonomous task execution.

### CodexAgent State Machine

```
     ┌─────────────┐
     │    IDLE     │ ← Start
     └──────┬──────┘
            │ receive command
            ↓
     ┌─────────────────┐
     │   ANALYZING     │ → CommandAnalyzer parses user intent
     └────────┬────────┘
              │ analysis complete
              ↓
     ┌──────────────────┐
     │    PLANNING      │ → ExecutionPlanner creates DAG
     └────────┬─────────┘
              │ approval needed?
         ┌────┴─────┐
         │ (approve) │
         ↓           │
     ┌─────────────┐ │
     │  EXECUTING  │←┘ → WorkerManager.execute()
     └────────┬────┘
              │ workers done
              ↓
     ┌──────────────────┐
     │   REVIEWING      │ → ResultReviewer checks quality
     └────────┬─────────┘
              │ review complete
              ↓
     ┌─────────────────┐
     │   REPORTING     │ → AgentReporter generates report
     └────────┬────────┘
              │ report done
              ↓
     ┌─────────────┐
     │    IDLE     │ ← Back to start
     └─────────────┘
```

### Task Structure

```typescript
interface AgentTask {
  taskId: string;
  prompt: string;
  state: AgentState;
  analysis?: Analysis;
  plan?: ExecutionPlan;
  workers: WorkerResult[];
  review?: ReviewReport;
  report?: string;
  createdAt: number;
  completedAt?: number;
}
```

### Events Emitted

```typescript
// State transitions
agent.on('progress', (payload: AgentProgressPayload) => {
  // { taskId, state, phaseName, progress }
});

// Task completion
agent.on('result', ({ taskId, report }) => {});

// Errors
agent.on('error', ({ taskId, error }) => {});

// Command queued (when agent busy)
agent.on('queued', ({ taskId, position }) => {});
```

### Approval Flow

```typescript
// Planner generates plan that needs approval
agent.pendingApproval = { taskId, plan, message };
agent.emit('approval:needed', ...);

// Client sends approval
agent.approve(taskId);  // → resolves planner promise
// Agent proceeds to EXECUTING
```

---

## 12. Memory Subsystem (`memory/`)

### Purpose
In-memory pattern and learning storage for autonomous decision-making.

### Components

#### MemoryStore
```typescript
class MemoryStore {
  learn(pattern: Pattern): void
  forget(patternId: string): boolean
  getPatterns(category?: string): Pattern[]
  searchPatterns(query: string): Pattern[]
  getEmbedding(text: string): number[]  // Mock implementation
}
```

#### PatternManager
Manages common task patterns:
- Debugging workflows
- Code review procedures
- Deployment steps

#### Embeddings
Mock vector embeddings (placeholder for real ML in future).

---

## 13. LocalContextStore Integration

### Purpose
Contextual knowledge base for Olympus — extracts file structure, decisions, errors from worker execution history.

### Manager Initialization

```typescript
// In server.ts
const localContextManager = new LocalContextStoreManager();

// Inject into components
codeAdapter.setLocalContextManager(localContextManager);
geminiAdvisor.setLocalContextManager(localContextManager);
```

### Auto-Save Flow

```
1. CLI execution completes (runCli)
2. API handler calls localContextManager.extractAndSave()
3. extractContext() analyzes CLI result
4. Saves to project-level .olympus/context.db
5. Propagates to root-level .olympus/context.db
```

### Context Injection

When assigning worker task:
```typescript
const injection = store.buildContextInjection({ maxTokens: 1500 });
// Returns:
{
  projectSummary: "Recent changes: ...",
  workHistory: "1. [worker-1] OK: Fixed bug in auth...",
  activeContext: "Currently working on refactoring...",
}
```

Appended to task prompt for context-aware execution.

---

## 14. Gateway Initialization (`server.ts` Constructor)

```typescript
constructor(options: GatewayOptions = {}) {
  // 1. Initialize HTTP/WebSocket server
  this.httpServer = createServer(...)
  this.wss = new WebSocketServer({ server: this.httpServer })

  // 2. Initialize core managers
  this.runManager = new RunManager(...)
  this.sessionManager = new SessionManager(...)
  this.cliSessionStore = new CliSessionStore()
  this.workerRegistry = new WorkerRegistry()
  this.localContextManager = new LocalContextStoreManager()

  // 3. Initialize RPC router
  this.rpcRouter = new RpcRouter()
  registerSystemMethods(this.rpcRouter)
  registerAgentMethods(this.rpcRouter)

  // 4. Mode-specific: initialize Agent/Worker/Memory
  if (this.mode !== 'codex') {
    this.workerManager = new WorkerManager(...)
    this.agent = new CodexAgent(...)
    this.memoryStore = new MemoryStore(...)
  }

  // 5. Initialize Channel Manager
  this.channelManager = new ChannelManager()
  // Register Dashboard, Telegram

  // 6. Optional: Codex Adapter, Gemini Advisor
  if (options.codexAdapter) {
    this.codexAdapter = options.codexAdapter
    this.codexAdapter.setBroadcast((...) => this.broadcastToAll(...))
  }

  if (options.geminiAdvisor) {
    this.geminiAdvisor = options.geminiAdvisor
    this.geminiAdvisor.setLocalContextManager(this.localContextManager)
  }

  // 7. Start heartbeat & session cleanup timers
  this.startHeartbeat()
  this.startSessionCleanup()
}
```

### Startup

```typescript
async start(): Promise<void> {
  // 1. Initialize CLI session store
  await this.cliSessionStore.initialize()

  // 2. Initialize Codex Adapter (if present)
  if (this.codexAdapter) {
    // Set up RPC methods for Codex
    this.codexAdapter.registerRpcMethods(this.rpcRouter)
  }

  // 3. Initialize Gemini Advisor (if present)
  if (this.geminiAdvisor) {
    await this.geminiAdvisor.initialize([...], this.localContextManager)
  }

  // 4. Listen on port
  this.httpServer!.listen(this.port, this.host, ...)
}
```

---

## 15. Mode of Operation

### Legacy Mode (`mode: 'legacy'`)
- Full agent + worker support
- MemoryStore active
- WorkerManager active
- CodexAgent state machine active

### Hybrid Mode (`mode: 'hybrid'`)
- Both legacy and Codex support
- All components initialized
- Can switch between agent types

### Codex Mode (`mode: 'codex'`)
- Codex Orchestrator only
- No legacy agent/worker
- Minimal memory store
- Optimized for Codex workflow

---

## 16. Error Handling & Resilience

### CLI Timeout & Recovery

```typescript
// Spawn with timeout
const proc = spawn('claude', args, { timeout: 30_000 });

if (timeout) {
  proc.kill('SIGTERM');  // Graceful
  await sleep(5_000);
  if (proc.exitCode === null) {
    proc.kill('SIGKILL');  // Forced
  }
  throw new TimeoutError('CLI execution timeout');
}
```

### Worker Health & Recovery

```typescript
// No auto-removal — workers persist until explicit unregister
// Worker can re-register if needed after manual cleanup
```

### Codex Event Delivery

```typescript
// Events queued if client not subscribed
// Delivered on re-connect + subscription
```

### Context Degradation

```typescript
// LocalContextStore unavailable?
//   → Proceed without context injection
// GeminiAdvisor fails?
//   → Use previous cache, continue
// MemoryStore missing?
//   → Operate without patterns
```

---

## 17. Configuration & Startup

### Environment Variables

```bash
OLYMPUS_GATEWAY_PORT=8765
OLYMPUS_GATEWAY_HOST=localhost
OLYMPUS_MODE=legacy|hybrid|codex
OLYMPUS_MAX_CONCURRENT_RUNS=5
OLYMPUS_MAX_CONCURRENT_CLI=5
```

### Typical Startup (CLI)

```bash
olympus server start
  → Gateway.start()
  → Listens on :8765
  → Web dashboard connects
  → Telegram bot connects
  → Workers can register
```

---

## 18. Data Flow Diagrams

### CLI Execution Flow

```
User (Web/Telegram)
     ↓
  POST /api/cli/run
     ↓
  api.ts handler
     ↓
  runCli(params)
     ↓
  ConcurrencyLimiter.run()
     ↓
  spawnCli(backend, args)
     ↓
  [ Claude/Codex Process ]
     ↓
  stdout chunks → onStream callback
     ↓
  Gateway.broadcastToAll('cli:stream', chunk)
     ↓
  [All subscribed clients receive real-time output]
     ↓
  Process exits
     ↓
  Parse output (JSON/JSONL)
     ↓
  Save to CliSessionStore
     ↓
  Extract context → LocalContextStore
     ↓
  Broadcast 'cli:complete'
     ↓
  Return CliRunResult
```

### Worker Task Flow

```
Telegram: /task "refactor auth"
     ↓
  Gateway.handleWorkerTask(workerId, prompt)
     ↓
  WorkerRegistry.createTask(workerId, prompt)
     ↓
  Broadcast 'worker:task:assigned'
     ↓
  [ Worker executes prompt via running Claude CLI ]
     ↓
  Worker calls POST /api/workers/tasks/:taskId/result
     ↓
  WorkerRegistry.reportTaskResult(taskId, result)
     ↓
  Extract context
     ↓
  Broadcast 'worker:task:completed'
     ↓
  Send response back to Telegram chat
```

### Gemini Analysis Flow

```
Worker completes task
     ↓
  LocalContextStore updated
     ↓
  GeminiAdvisor debounce timer fires (10s)
     ↓
  analyzeProject(projectPath, projectName)
     ↓
  Collect LocalContext + work history (50 entries)
     ↓
  Build analysis prompt
     ↓
  Send to GeminiPty
     ↓
  Gemini responds with JSON
     ↓
  Cache result in projectCache
     ↓
  Broadcast 'gemini:analysis'
     ↓
  Available for context injection in next tasks
```

---

## 19. Testing & Monitoring

### Test Coverage Areas

- **CliRunner**: Output parsing (Claude JSON, Codex JSONL), timeout handling, concurrency limits
- **WorkerRegistry**: Registration, explicit unregister, task lifecycle
- **GeminiAdvisor**: PTY lifecycle, prompt building, cache invalidation
- **RPC Router**: Method registration, auth checks, error handling
- **API**: Request/response serialization, 400/401/500 status codes
- **WebSocket**: Client subscription/unsubscribe, broadcast delivery

### Monitoring Points

```typescript
// In Dashboard
- Active runs count
- CLI execution latency p50/p95/p99
- Worker count + health
- Gemini analysis freshness
- Context store size
- WebSocket client count

// Logs
- CLI spawn/exit (with args summary)
- Worker heartbeat failures
- RPC method execution time
- API errors with stack traces
```

---

## 20. Security Considerations

### API Key Validation

```typescript
// All HTTP requests checked via authMiddleware
const valid = validateApiKey(apiKey, loadConfig().apiKey);
```

### WebSocket Authentication

```typescript
// Client sends 'connect' with API key
// Gateway validates before 'connected' response
// Unauthenticated clients cannot call methods (requiresAuth=true)
```

### Permission Checks (CLI)

```typescript
// dangerouslySkipPermissions flag auto-approves all prompts
// Without it, Claude CLI interactive mode required
// Default: false (require explicit approval)
```

### CORS Configuration

```typescript
// api.ts setCorsHeaders() allows specific origins
// Configurable via loadConfig().cors
```

---

## Summary

The Gateway is a **highly modular, event-driven architecture** that:

1. **Manages CLI execution** via CliRunner (Claude, Codex JSON/JSONL parsing)
2. **Coordinates workers** via WorkerRegistry (health checks, task assignment)
3. **Provides real-time updates** via WebSocket (events, RPC calls)
4. **Supports async analysis** via GeminiAdvisor (project context synthesis)
5. **Maintains contextual knowledge** via LocalContextStore (work history)
6. **Offers flexible modes** (legacy agent, hybrid, Codex-only)

**Key strengths:**
- Concurrency control with ConcurrencyLimiter(5)
- Graceful degradation (missing dependencies don't crash)
- Event-driven broadcast for real-time collaboration
- Persistent session storage for resumable conversations
- Memory synthesis for long-term learning

**Design principles:**
- Clear separation of concerns (CliRunner, WorkerRegistry, GeminiAdvisor)
- Duck-typed integrations (CodexAdapter doesn't import codex package)
- Timeout safeguards (SIGTERM → SIGKILL escalation)
- Health monitoring (heartbeat, activity tracking)
- Error classification (known error patterns)
