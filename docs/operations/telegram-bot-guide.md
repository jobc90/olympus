# Telegram Bot Operations Guide

This document provides handover guidance for operating the Olympus Telegram bot in production. The bot enables remote control of Claude CLI via Telegram, communicating with the Gateway over HTTP and WebSocket.

---

## Overview

The Olympus Telegram bot is a multi-session manager built on Telegraf that routes user messages through:
- **Codex orchestrator** (default mode) — Smart intent routing, multi-session parallel execution
- **Direct mode** — Bypass orchestrator, send commands directly to specific sessions
- **Worker delegation** — Route tasks to registered workers via `@workerName` mentions
- **Team Engineering Protocol** — Async multi-agent orchestration over 30 minutes

The bot maintains per-user session state, message queuing, output history, and real-time WebSocket subscriptions to the Gateway.

---

## Setup & Initialization

### Prerequisites

- **Gateway running**: `olympus server start` or standalone Gateway process
- **Telegram Bot Token**: Obtain from [@BotFather](https://t.me/botfather)
- **API Key**: Generate in Gateway (`OLYMPUS_API_KEY` environment variable)
- **User IDs** (optional): Restrict bot access via `ALLOWED_USERS`

### Configuration

The bot loads configuration from environment variables:

```bash
# Required
export TELEGRAM_BOT_TOKEN="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"

# Optional (default: http://127.0.0.1:8200)
export OLYMPUS_GATEWAY_URL="http://127.0.0.1:8200"

# Optional (default: empty = no restriction)
export OLYMPUS_API_KEY="oly_xxx"

# Optional (default: all users allowed)
export ALLOWED_USERS="123456789,987654321"
```

### Startup

**Integrated with Server:**
```bash
olympus server start
# Starts Gateway (port 8200) + Web Dashboard (port 3001) + Telegram Bot
```

**Standalone Bot:**
```bash
olympus telegram
# Starts only the Telegram bot (requires Gateway to be running separately)
```

---

## Commands Reference

### Session Management

#### `/start`
- Shows welcome message with active worker list
- Displays quick-start examples based on registered workers
- No arguments required

#### `/health`
- Gateway health status and uptime
- WebSocket connection state
- Active session count and current session name
- Example:
  ```
  ✅ Gateway 정상
  상태: running
  가동시간: 42분
  WebSocket: ✅ 연결됨
  활성 세션: 3개
  현재 세션: 'main'
  ```

#### `/sessions`
- List all active registered sessions (regardless of ownership)
- Show available (unregistered) tmux sessions
- Current session marked with ▶️
- Usage: `/sessions`

#### `/use <name>`
- Switch to an existing session
- Alternatives:
  - `/use main` — Return to orchestrator mode
  - `/use orchestrator` — Same as above
  - `/use direct <name>` — Enable direct mode for specified session

#### `/close [name]`
- Terminate a session by name
- If no name provided, closes the active session
- Usage: `/close sessionname` or `/close` (closes active)

#### `/last`
- Retrieve the last output from the active session
- Shows up to 10 most recent outputs
- Useful for checking previous results

### Task Execution

#### `/team <task>`
- Trigger Team Engineering Protocol via async API
- Supports up to 30-minute execution with polling
- Examples:
  ```
  /team 로그인 UI 개선
  /team 결제 시스템 리팩토링
  /team 데이터베이스 마이그레이션
  ```
- Progress updates every 60 seconds
- Returns final result with token count, cost, and duration

#### `/codex <prompt>`
- Send a query directly to Codex Orchestrator
- Uses RPC (Remote Procedure Call) for fast response
- Examples:
  ```
  /codex 알파 프로젝트 빌드해줘
  /codex 모든 프로젝트 상태
  /codex deploy 관련 작업 검색
  ```
- Returns decision type, confidence score, and response

#### `/tasks`
- Show all currently active tasks
- Displays task ID, description, and elapsed time
- Requires Codex active task tracking to be available

### Worker Interaction

#### `/workers`
- List all registered workers
- Shows status (🟢 idle / 🔴 busy), project path, and current task
- Displays quick-command syntax for each worker

#### Inline Query (@ mention)
- Type `@` in chat to see worker suggestions
- Select a worker to pre-fill `@workerName` mention
- Useful for fast worker delegation

### Direct Text Messages

#### Orchestrator Mode (Default)
Plain text messages are routed through Codex chat:
- Codex analyzes intent
- Routes to appropriate session(s) or workers
- Supports multi-session parallel execution

#### Direct Mode
When `/use <session>` is active:
- Messages bypass orchestrator
- Send directly to the specified session
- Support for `@sessionName message` prefix for ad-hoc routing

#### Worker Delegation
Format: `@workerName task description`
- Codex identifies the worker
- Routes via `POST /api/workers/:id/task`
- Polls for completion and sends result
- Supports Team Engineering via `team: task` prefix

---

## Architecture & Communication

### WebSocket Events

The bot maintains a persistent WebSocket connection to the Gateway for real-time updates.

**Client → Server (Outbound):**
- `connect` — Initial auth + client registration (fire-and-forget)
- `subscribe` — Subscribe to session events
- `rpc` — RPC method call (with requestId for response matching)
- `ping` — Keep-alive heartbeat (every 30 seconds)

**Server → Client (Inbound):**

*Broadcast events:*
- `sessions:list` — Active session list changed (triggers sync)

*Session-specific events:*
- `session:screen` — CLI output (enqueued per session)
- `session:error` — Execution error
- `session:closed` — Session terminated

*Worker events:*
- `worker:task:assigned` — Task assigned to worker
- `worker:task:completed` — Worker finished with result
- `worker:task:timeout` — 30-minute timeout with partial result
- `worker:task:final_after_timeout` — Late completion after timeout

*RPC responses:*
- `rpc:result` — RPC call succeeded
- `rpc:error` — RPC call failed
- `rpc:ack` — RPC received (intermediate)

### HTTP API Usage

The bot interacts with the Gateway via these endpoints:

**Synchronous CLI Execution:**
```bash
POST /api/cli/run
{
  "prompt": "user command",
  "sessionKey": "telegram:chatId:sessionName",
  "provider": "claude",
  "dangerouslySkipPermissions": true
}
# Response: { result: CliRunResult }
```

**Asynchronous CLI Execution:**
```bash
POST /api/cli/run/async
{
  "prompt": "task description",
  "sessionKey": "telegram:chatId:sessionName",
  "provider": "claude",
  "timeoutMs": 1800000,  # 30 minutes
  "dangerouslySkipPermissions": true
}
# Response: { taskId: string }
# Poll: GET /api/cli/run/{taskId}/status
```

**Worker Task Delegation:**
```bash
POST /api/workers/{workerId}/task
{
  "prompt": "task description",
  "chatId": number
}
# Bot polls: GET /api/workers/tasks/{taskId}
# WebSocket receives: worker:task:completed event
```

**Codex Chat:**
```bash
POST /api/codex/chat
{
  "message": "user message",
  "chatId": number
}
# Response: { type, response, taskId? }
```

**Codex Routing:**
```bash
POST /api/codex/route
{
  "text": "user input",
  "source": "telegram",
  "chatId": number
}
# Response: { decision, response? }
# decision.type: SELF_ANSWER | SESSION_FORWARD | MULTI_SESSION | WORKER_DELEGATE
```

---

## Message Handling Flow

### Orchestrator Mode (Default)

1. User sends text message
2. Bot calls `/api/codex/chat` (async route + fast Haiku response)
3. If Codex returns high-confidence response → send to user
4. Otherwise fall back to `/api/cli/run` (sync Claude execution)

### Direct Mode

1. User sends text message
2. Check for `@sessionName prefix` or use active session
3. Detect "team:" prefix for Team Engineering Protocol
4. Call `/api/codex/route` for smart routing
5. Based on decision:
   - `SELF_ANSWER` — Send Codex response
   - `SESSION_FORWARD` — Call `/api/cli/run` (sync)
   - `MULTI_SESSION` — Call `/api/cli/run/async` for each session (parallel)
   - `WORKER_DELEGATE` — Call `/api/workers/:id/task`
6. Poll for async results and send to user

### Message Splitting

Telegram has a 4000-character message limit. The bot:
- Splits long responses on line boundaries
- Preserves session prefix in continuation parts
- Handles single lines exceeding limit via force-split

---

## State Management

### Per-Chat State

The bot maintains per-chat state in memory:

```typescript
chatSessions: Map<chatId, Map<sessionName, sessionId>>
activeSession: Map<chatId, sessionName>
directMode: Map<chatId, boolean>
outputHistory: Map<sessionId, string[]>  // Last 10 outputs
subscribedRuns: Map<sessionId, chatId>   // For reverse lookup
sendQueues: Map<sessionId, Promise>      // Message queue per session
```

### Output History

- Last 10 outputs per session stored in memory
- Accessible via `/last` command
- Cleared when session is closed via WebSocket event

### Message Queuing

- Per-session queue ensures messages don't interleave across sessions
- Resolves when message is sent
- Memory cleanup when queue completes

### Session Synchronization

Bot syncs sessions from Gateway on:
- Initial startup
- WebSocket reconnection (re-subscribe)
- `sessions:list` broadcast (throttled 1s)
- On demand via `/sessions` command

If Gateway reports no active sessions, bot clears local state for that chat.

---

## Error Handling

### Error Classification

The bot uses `classifyError()` to categorize errors:

| Category | Detection | Retryable |
|----------|-----------|-----------|
| `telegram_api` | Telegraf response error | 429 (rate limit) or 5xx |
| `timeout` | "timed out" message | Yes |
| `network` | ECONNREFUSED, ENOTFOUND | Yes |
| `internal` | Other errors | No |

### User-Facing Error Messages

**Retryable errors:**
```
⚠️ 일시적 오류가 발생했습니다. 잠시 후 다시 시도해주세요.
```

**Non-retryable errors:**
```
❌ 오류가 발생했습니다. 지속되면 관리자에게 문의하세요.
```

### Fallback Handling

- **Markdown parse failure** → Retry with plaintext (sanitized)
- **Codex unavailable** → Fall back to direct CLI execution
- **WebSocket disconnected** → Buffer state, reconnect in 5 seconds
- **RPC timeout** — Default 30 seconds, retries fail fast

### Global Error Handler

Unhandled errors in update processing are caught and:
- Logged with `structuredLog()` (JSON format for machine parsing)
- User notified with generic error message
- Process continues (does not crash)

---

## Known Issues & Limitations

### Critical Issues

1. **No rate limiting** — Bot can be spammed with requests
   - Workaround: Use `ALLOWED_USERS` to restrict access
   - Future: Implement per-user request throttling

2. **No request deduplication** — Duplicate messages processed twice
   - Future: Implement idempotency key tracking

3. **Error messages expose internals** — API errors shown to users
   - Workaround: Sanitize error messages in fallback handlers
   - Future: Use error codes instead of raw messages

### High-Priority Issues

1. **Session persistence across bot restarts** — No local session recovery
   - Workaround: `/sessions` command re-syncs from Gateway
   - Future: Store sessions.json with metadata

2. **Worker @mention validation weak** — Accepts invalid worker names
   - Workaround: Check worker list before mentioning
   - Future: Validate against `/api/workers` list before routing

3. **Large message handling** — Naive line-splitting may break code blocks
   - Workaround: Use `/last` to retrieve in parts
   - Future: Detect code blocks and preserve formatting

### Medium-Priority Issues

1. **Inline query caching** — No worker list cache (fetches on every query)
   - Impact: Slow inline query response
   - Future: Cache worker list (5-10 second TTL)

2. **Multi-session output interleaving** — Enqueue prevents it but adds latency
   - Impact: Messages for different sessions appear slower
   - Future: Use concurrent sending with merge-point tracking

3. **WebSocket reconnection storms** — May reconnect too aggressively
   - Impact: Wasted bandwidth, gateway spam
   - Future: Exponential backoff for reconnect attempts

---

## Monitoring & Debugging

### Structured Logging

The bot logs all events in JSON format to stdout:

```json
{
  "ts": "2026-02-16T21:00:00.000Z",
  "level": "info",
  "component": "telegram-bot",
  "event": "bot_started",
  "gateway": "http://127.0.0.1:8200",
  "allowedUsers": [123456789]
}
```

**Log levels:** `info`, `warn`, `error`

**Events to monitor:**
- `bot_started` — Bot initialization successful
- `bot_launch_failed` — Auth or startup failure
- `unhandled_update_error` — Unexpected error processing message
- `codex_chat_fallback` — Codex unavailable, using CLI
- `task_completed_send_failed` — Failed to deliver worker result
- `update_received` — Debug: all incoming updates
- `unauthorized_access` — User not in ALLOWED_USERS

### Health Checks

**HTTP health endpoint:**
```bash
curl http://127.0.0.1:8200/healthz
# { "status": "running", "uptime": 3600 }
```

**In Telegram:**
```
/health
```

### Debugging Commands

1. **Check active sessions:**
   ```
   /sessions
   ```

2. **View worker list:**
   ```
   /workers
   ```

3. **Retrieve last CLI output:**
   ```
   /last
   ```

4. **View active tasks (if Codex tracking available):**
   ```
   /tasks
   ```

---

## Common Scenarios

### Scenario 1: Remote Team Engineering Protocol

**User request:** Large feature requiring multiple agents

**Execution:**
```
/team 로그인 UI 개선 및 성능 최적화
```

**Bot behavior:**
1. Sends async request with full prompt to Gateway
2. Polls status every 10 seconds
3. Updates message every 60 seconds with elapsed time
4. Returns final result with cost and duration
5. Max execution: 30 minutes

### Scenario 2: Multi-Session Parallel Execution

**User request:** Run tests across multiple projects

**Execution:**
```
<direct mode, multi-session routing>
test and report results
```

**Bot behavior:**
1. Codex determines MULTI_SESSION type
2. Sends async request to each target session
3. Polls all tasks in parallel
4. Aggregates results

### Scenario 3: Worker Delegation with Team Protocol

**User request:** Ask a specific worker to run Team Engineering

**Execution:**
```
@hub team 결제 기능 추가
```

**Bot behavior:**
1. Routes `@hub` to worker registry
2. Detects `team:` prefix
3. Sends Team Engineering Protocol request to worker
4. Polls for 30-minute max
5. Sends result with worker attribution

### Scenario 4: Direct Session Commands

**User request:** Send raw command to specific session, bypass orchestrator

**Execution:**
```
/use direct main
npm test
```

**Bot behavior:**
1. Enables direct mode for this chat
2. All subsequent messages go directly to 'main' session
3. No orchestrator routing
4. `/use main` to return to orchestrator mode

---

## Performance & Scaling

### Concurrency Limits

- **Max concurrent CLI runs:** 5 (Gateway ConcurrencyLimiter)
- **Max pending RPC calls:** Unlimited (per Gateway capacity)
- **Max WebSocket connections:** 1 per bot (shared)
- **Message queue depth:** Unlimited (per session)

### Timeouts

| Operation | Timeout | Retries |
|-----------|---------|---------|
| Codex chat | 30 min (HTTP) | None (streaming) |
| CLI sync | 10 min (HTTP) | None |
| CLI async | 30 min (polling) | 180 polls × 10s |
| Team Protocol | 30 min (polling) | 180 polls × 10s |
| Worker task | 30 min (polling) | 180 polls × 10s |
| RPC call | 30 seconds | None |
| Inline query | 5 seconds | None |
| Message send | Implicit | Built-in (Telegraf) |

### Resource Usage

- **Memory per chat:** ~50 KB (session map + history)
- **Memory per WebSocket:** ~200 KB (message buffer + state)
- **Bandwidth per message:** ~1-2 KB (overhead)
- **CPU per message:** <100 ms (JSON parsing + routing)

---

## Deployment Checklist

- [ ] Environment variables configured (TELEGRAM_BOT_TOKEN, OLYMPUS_API_KEY)
- [ ] Gateway running and accessible from bot machine
- [ ] Firewall allows bot → Gateway connectivity (port 8200)
- [ ] Telegram API accessible from bot machine
- [ ] Bot process monitoring in place (e.g., systemd, supervisor, Docker)
- [ ] Logs being collected and rotated
- [ ] `/health` responds successfully
- [ ] `/start` shows active workers
- [ ] Test message routed through Codex
- [ ] Test worker delegation via @mention
- [ ] Test Team Engineering Protocol with `/team`

---

## Troubleshooting

| Issue | Diagnosis | Solution |
|-------|-----------|----------|
| Bot doesn't respond to commands | Check logs for `bot_launch_failed` | Verify TELEGRAM_BOT_TOKEN is valid |
| "Gateway 연결 실패" | Check Gateway is running | Start Gateway via `olympus server start` |
| Messages appear but no response | Check `unhandled_update_error` logs | Verify API_KEY matches Gateway |
| `/start` doesn't show workers | `/workers` works but `/start` fails | Likely timeout — increase fetch timeout |
| **Messages send twice** | Check for duplicate bot processes | `pkill olympus` then restart |
| **Worker @mention doesn't work** | Logs show `unauthorized_access` | Add user ID to ALLOWED_USERS |
| **Long output truncated** | Message limit exceeded | Message is split — check continuation |
| **Session doesn't exist after /use** | Session ID stale or Gateway restart | Run `/sessions` to re-sync |

---

## References

- [Telegraf Documentation](https://telegraf.dev/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Olympus Gateway API](../architecture/gateway-api.md)
- [Team Engineering Protocol](../architecture/team-protocol.md)
- [Structured Logging Format](./logging-format.md)
