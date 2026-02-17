# Olympus Telegram Bot - Comprehensive QA Audit Report
## Version: v0.5.1 | Date: 2026-02-13

---

## Executive Summary

The Olympus Telegram bot provides 13 commands, 3 message handlers (text, inline query, @mention), and integration with the Gateway API for AI agent orchestration. This audit identifies all user-facing features, their API contracts, response behaviors, and potential issues.

**Total Features Identified: 16 (13 commands + 3 message handlers)**

---

## FEATURE AUDIT

### Command: /start
**Trigger:** `/start` (first-time welcome)

**API CALL:**
- `GET /api/workers` — Fetch active worker list

**RESPONSE:**
- Welcome message with active workers list (max 5 workers shown)
- Workers displayed with status icon (🟢 idle, 🔴 busy, ⚫ offline)
- Usage instructions: `@워커이름 작업내용` format
- Examples for first worker in list
- Command legend (/workers, /health)

**CODE LOCATION:** Lines 142-187

**POTENTIAL ISSUES:**
- ⚠️ **No timeout on workers fetch** — if Gateway is slow, user sees "processing" delay
- ✅ **Graceful degradation** — if fetch fails, shows generic example with "olympus" as default

---

### Command: /health
**Trigger:** `/health` (system status check)

**API CALLS:**
- `GET /healthz` — Gateway health check
- Internal: WebSocket connection status check
- Internal: Session count from local state

**RESPONSE:**
```
✅ Gateway 정상

상태: [status]
가동시간: [minutes]분
WebSocket: ✅ 연결됨 or ❌ 연결 끊김
활성 세션: [count]개
현재 세션: '[name]' or 없음
```

**CODE LOCATION:** Lines 190-210

**POTENTIAL ISSUES:**
- ✅ No critical issues — simple status display
- ℹ️ **WebSocket status cached** — doesn't re-check connection, uses internal state

---

### Command: /sessions
**Trigger:** `/sessions` (list all sessions)

**API CALLS:**
- `GET /api/sessions` — Fetch all active + unregistered tmux sessions

**RESPONSE:**
```
If no sessions:
📭 활성 세션이 없습니다.
💡 터미널에서 `olympus start`로 Claude CLI 세션을 시작하세요.
💡 또는 `/new 이름`으로 새 세션을 생성하세요.

If sessions exist:
🟢 *현재 세션: [name]*
    📂 `[project_path]`  ⏱ [age]
    💬 메시지를 입력하면 이 세션으로 전송됩니다
─────────────────

📋 *전체 세션* (Nㅅ개)
[Session list with icons: ▶️ current, 🔵 mine, ⚪ external]

⬜ *미연결 세션* (Nㅠ개)
[Unregistered tmux sessions]

Legend: ▶️ = 현재 | 🔵 = 내 세션 | ⚪ = 외부/미연결
```

**CODE LOCATION:** Lines 213-317

**POTENTIAL ISSUES:**
- ✅ Handles empty sessions gracefully
- ✅ Distinguishes session ownership (mine vs external)
- ⚠️ **Session list may be stale** — shows cached state, doesn't refresh if Gateway unavailable
- ⚠️ **Age formatting** — shows "방금 전" (just now) only if <1 minute, else "Xㅡ분 전"

---

### Command: /close [session_name]
**Trigger:** `/close [optional: name]` (terminate session)

**API CALLS:**
- `DELETE /api/sessions/{sessionId}` — Delete session from Gateway

**RESPONSE:**
```
Success:
🛑 세션 '[name]' 종료됨

Failure (session not found):
❌ 세션 '[name]'을 찾을 수 없습니다.
`/sessions`로 활성 세션 목록을 확인하세요.

Failure (API error):
❌ 종료 실패: [error_message]
```

**CODE LOCATION:** Lines 320-371

**POTENTIAL ISSUES:**
- ⚠️ **No active session fallback** — if no name provided and no active session set, unclear error
- ✅ **Proper cleanup** — removes from local state (chatSessions, subscribedRuns, outputHistory)
- ✅ **Active session auto-switch** — if closed session was active, switches to next available

---

### Command: /use [name|main|direct]
**Trigger:** `/use`, `/use main`, `/use <session>`, `/use direct <session>`

**API CALLS:**
- `GET /api/sessions` — Verify session still valid (optional cache check)
- `POST /api/sessions/connect` — Connect to tmux session (if not already connected)

**RESPONSE:**
```
No args:
현재 모드: [🔗 직접 or 🤖 오케스트레이터]
사용법:
• `/use main` — 오케스트레이터 모드
• `/use direct <세션>` — 직접 모드
• `/use <세션>` — 직접 모드로 전환

After /use main:
🤖 오케스트레이터 모드로 전환됨
모든 메시지가 AI 오케스트레이터를 통해 라우팅됩니다.

After /use <session>:
🔗 '[name]' 연결 중...
[then OLYMPUS banner with lightning bolt ASCII art]

Failure:
❌ '[name]' 연결 실패
`/sessions`로 연결 가능한 세션을 확인하세요.
```

**CODE LOCATION:** Lines 376-512

**POTENTIAL ISSUES:**
- ⚠️ **Stale session verification** — if cached sessionId invalid but Gateway has newer entry, auto-recovers with fresh ID
- ⚠️ **Gateway unavailable** — falls through to connect attempt even if verification fails
- ✅ **WebSocket subscription** — auto-subscribes to session events when connecting

---

### Command: /team [prompt]
**Trigger:** `/team <task_description>` (Team Engineering Protocol)

**API CALLS:**
- `POST /api/cli/run/async` — Start async Team Engineering Protocol execution
- `GET /api/cli/run/{taskId}/status` — Poll task status (10sec intervals, 30min max)

**REQUEST BODY:**
```json
{
  "prompt": "[TEAM ENGINEERING PROTOCOL] Execute the Team Engineering Protocol defined in your CLAUDE.md for the following task. Activate all On-Demand agents, follow the full workflow (Skill Discovery → Work Decomposition → Team Creation → Consensus → 2-Phase Development → Review → QA). Task: {prompt}",
  "sessionKey": "telegram:{chatId}:team",
  "provider": "claude",
  "timeoutMs": 1800000,
  "dangerouslySkipPermissions": true
}
```

**RESPONSE (Progress):**
```
Initial:
🚀 *Team Engineering Protocol* 시작 중...

Every 60 seconds:
🔄 *Team 진행 중...* ([elapsed]초 경과)

On completion:
✅ *Team 완료*
[result.text split into 4000-char chunks]
[result.usage: tokens | cost | duration]

On failure:
❌ Team 실패: [error_message]

On timeout (30min):
⏰ Team 타임아웃 (30분)
```

**CODE LOCATION:** Lines 515-566

**POTENTIAL ISSUES:**
- ⚠️ **Long 30-minute timeout** — no intermediate progress shown (only every 60sec)
- ⚠️ **Request timeout 30s** — if network slow, fails before Gateway even starts processing
- ✅ **Proper async polling** — waits up to 30min with 10sec intervals (180 polls max)
- ✅ **Message splitting** — handles long results by splitting on line boundaries

---

### Command: /codex [question]
**Trigger:** `/codex <question>` (Codex Orchestrator routing)

**API CALLS:**
- `RPC codex.route` — Route question to Codex decision engine (WebSocket RPC, 30sec timeout)

**RESPONSE:**
```
If no question:
🤖 *Codex Orchestrator*
사용법: `/codex <질문>`
예:
`/codex 알파 프로젝트 빌드해줘`
`/codex 모든 프로젝트 상태`
`/codex deploy 관련 작업 검색`

If WebSocket not connected:
❌ Gateway에 연결되지 않았습니다.

On RPC result:
🤖 *Codex 응답*
📋 유형: [decision.type] ([confidence]%)
🎯 대상: [targetSessions]
[response.content]
💡 [agentInsight]

On RPC timeout/error:
❌ Codex 오류: [error_message]
```

**CODE LOCATION:** Lines 569-630

**POTENTIAL ISSUES:**
- ⚠️ **30sec RPC timeout** — long-running Codex analysis may timeout
- ⚠️ **No retry logic** — single RPC attempt, no fallback
- ✅ **RPC response parsing** — properly extracts decision type, confidence, content

---

### Command: /tasks
**Trigger:** `/tasks` (show active tasks)

**API CALLS:**
- `RPC codex.activeTasks` — Query active task list from Codex (WebSocket RPC)

**RESPONSE:**
```
If WebSocket not connected:
❌ Gateway에 연결되지 않았습니다.

If tasks exist:
📋 *활성 작업* (Nㅟ개)
─────────────────
🔵 `[sessionId]`: [task_description]
    ⏱ [elapsed]초 경과

If no tasks or RPC fails:
💡 /tasks 기능은 Codex 작업 추적 시스템과 연동됩니다.
현재 대시보드에서 실시간 스트리밍으로 작업 진행 상황을 확인할 수 있습니다.
```

**CODE LOCATION:** Lines 633-660

**POTENTIAL ISSUES:**
- ⚠️ **Fallback hides errors** — fails gracefully with dashboard hint rather than real error
- ⚠️ **No RPC timeout handling** — relies on default RPC_TIMEOUT_MS (30sec)
- ℹ️ **Dashboard preferred** — bot acknowledges this is not the main way to track tasks

---

### Command: /last
**Trigger:** `/last` (retrieve last session output)

**API CALLS:**
- None (uses local output history buffer)

**RESPONSE:**
```
If no connected session:
❌ 연결된 세션이 없습니다.

If session not found:
❌ 세션을 찾을 수 없습니다.

If no history:
📭 아직 출력이 없습니다.

If output exists:
📋 [sessionName] 마지막 출력
[last output from history buffer (max 10 entries)]
```

**CODE LOCATION:** Lines 663-686

**POTENTIAL ISSUES:**
- ⚠️ **Memory-only buffer** — lost on bot restart, limited to 10 entries (OUTPUT_HISTORY_SIZE)
- ✅ **Per-session history** — keeps separate buffer per sessionId
- ✅ **No API call** — fast local lookup

---

### Command: /workers
**Trigger:** `/workers` (list registered workers)

**API CALLS:**
- `GET /api/workers` — Fetch worker registry

**RESPONSE:**
```
If no workers:
📭 등록된 워커가 없습니다.
💡 터미널에서 워커를 시작하세요:
`olympus start --name hub --project ~/dev/console`

If workers exist:
⚡ *워커 목록* (Nㅜ개)

*[name]* [icon] [status]
📂 `[projectPath]`
⏱ [age]
💬 [currentTaskPrompt (first 60 chars)]
➡️ `@[name] 명령`
[... repeat for each worker ...]

─────────────────
💡 *사용법*: `@워커이름 작업내용`
예시: `@[first_worker] 빌드하고 테스트 돌려줘`
```

**CODE LOCATION:** Lines 689-731

**POTENTIAL ISSUES:**
- ✅ Clean formatting with status icons (🟢 idle, 🔴 busy, ⚫ offline)
- ✅ Shows current task being executed
- ⚠️ **No timeout** — might block if Gateway is slow

---

## MESSAGE HANDLERS

### Handler: Text Message (Orchestrator Mode)
**Trigger:** Regular text message (not starting with `/`, and not in direct mode)

**EXECUTION PATH:**
1. User sends: "Some message"
2. `POST /api/codex/chat` — Send to Codex for processing
3. If Codex OK: display `data.response`
4. If Codex fails: FALLBACK to `POST /api/cli/run` (sync Claude CLI call)

**API CALLS:**
- Primary: `POST /api/codex/chat` 
  - Timeout: 30min (1,800,000ms)
  - Body: `{ message, chatId }`
  - Returns: `{ type, response, taskId? }`
- Fallback: `POST /api/cli/run` (if Codex fails)

**RESPONSE:**
```
[Codex processing...]

On success:
[response.data.response]

On Codex error (fallback to Claude):
[Claude CLI response]

On timeout:
응답 시간 초과

On error:
오류: [error_message]
```

**CODE LOCATION:** Lines 734-781

**POTENTIAL ISSUES:**
- ⚠️ **Long 30min timeout** — blocks Telegram update processing for entire duration
- ⚠️ **Fallback loses context** — if Codex times out, falls back to Claude without passing through Codex routing
- ✅ **Error classification** — distinguishes TimeoutError from other errors

---

### Handler: Text Message (Direct Mode)
**Trigger:** Text message when direct mode enabled (`/use <session>`)

**EXECUTION PATH:**
1. Check for `@sessionName prompt` format (explicit target)
2. If not, use active session
3. **SPECIAL: Detect "team:" or "team " prefix**
   - If detected: run Team Engineering Protocol async (30min timeout)
   - Else: route through Codex (MULTI_SESSION, SESSION_FORWARD, etc.)
4. Codex response types:
   - `SELF_ANSWER` (high confidence) → display response
   - `SELF_ANSWER` (low confidence) → fallback to Claude CLI
   - `MULTI_SESSION` → run prompts in parallel across sessions
   - `SESSION_FORWARD` → forward to specific session
   - (else) → "cannot process"

**API CALLS:**
- For "team:" prefix: `POST /api/cli/run/async` (async 30min)
- For normal: `POST /api/codex/route` (sync 10sec timeout)
- For fallback: `POST /api/cli/run` (sync 600sec timeout)
- For MULTI_SESSION: Multiple `POST /api/cli/run/async` in parallel

**REQUEST BODY (Team Mode):**
```json
{
  "prompt": "[TEAM ENGINEERING PROTOCOL] ...",
  "sessionKey": "telegram:{chatId}:{sessionName}:team",
  "provider": "claude",
  "timeoutMs": 1800000,
  "dangerouslySkipPermissions": true
}
```

**REQUEST BODY (Codex Route):**
```json
{
  "text": "user message",
  "source": "telegram",
  "chatId": chatId
}
```

**RESPONSE:**
```
For Team Protocol:
🚀 *Team Engineering Protocol* 시작 중...
워커: [displayName]
[polling for 30min, updates every 60sec]

For Codex high confidence:
📩 [displayName]
[response.content]
💡 [agentInsight]

For MULTI_SESSION:
🔄 [N]개 작업을 병렬로 실행합니다...
[async tasks running in parallel]

For SESSION_FORWARD:
[Claude CLI result]

For errors:
❌ [error_message]
```

**CODE LOCATION:** Lines 965-1076

**POTENTIAL ISSUES:**
- ⚠️ **"team:" detection case-sensitive** — regex is `/^team[:\s]/is` (case-insensitive OK, but requires colon or space)
- ⚠️ **@mention handling** — `@name prompt` must be exact format, whitespace matters
- ⚠️ **MULTI_SESSION parallel** — all sessions run in parallel, no ordering control
- ⚠️ **Codex route timeout 10sec** — if Gateway slow, fails immediately
- ✅ **Proper fallback chain** — Codex → Claude → error message

---

### Handler: Inline Query
**Trigger:** User types `@bot_name` in message box (Telegram inline query feature)

**EXECUTION PATH:**
1. Fetch available workers from `GET /api/workers` (5sec timeout)
2. Filter workers by query string (case-insensitive substring match)
3. Generate inline query results showing:
   - Worker name with status icon
   - Project path
   - Pre-filled `@worker_name ` text for quick @mention
4. If no workers: show `/workers` suggestion

**API CALLS:**
- `GET /api/workers` (5sec timeout)

**RESPONSE:**
```
For each worker:
[article result]
Type: "article"
ID: worker.id
Title: "[status_icon] @[worker_name]"
Description: "[status] — [projectPath]"
Input text: "@[worker_name] "

Cache time: 5 seconds
Is personal: true (not cached globally)

If no workers:
ID: "no-workers"
Title: "워커 없음"
Description: "olympus start로 워커를 시작하세요"
Input text: "/workers"
```

**CODE LOCATION:** Lines 784-831

**POTENTIAL ISSUES:**
- ⚠️ **Network timeout 5sec** — if Gateway slow, returns no workers silently (try/catch ignores errors)
- ✅ **Status-aware display** — shows 🟢 for idle, 🔵 for busy
- ✅ **Cache 5sec** — good balance between freshness and load

---

## WEBSOCKET EVENT HANDLERS

### Worker Task Completed
**Event:** `worker:task:completed`

**PAYLOAD:**
```json
{
  "taskId": "string",
  "workerName": "string",
  "chatId": 123456,
  "summary": "string (optional)",
  "success": boolean,
  "durationMs": 123456
}
```

**RESPONSE:**
```
[✅ or ❌] 완료 ([duration]초)
[summary or success/failure message]
```

**CODE LOCATION:** Lines 1527-1547

**POTENTIAL ISSUES:**
- ✅ Proper event handling with all fields
- ⚠️ **Missing error handling** — if sendLongMessage fails, error logged but no retry

---

### Worker Task Timeout (30min)
**Event:** `worker:task:timeout`

**PAYLOAD:**
```json
{
  "taskId": "string",
  "workerName": "string",
  "chatId": 123456,
  "summary": "string (optional)",
  "success": boolean,
  "durationMs": 1800000
}
```

**RESPONSE:**
```
[⏰] [duration]분 타임아웃 — 계속 모니터링 중
중간 결과:
[summary]
_실제 완료 시 최종 결과가 전송됩니다._
```

**CODE LOCATION:** Lines 1550-1569

**POTENTIAL ISSUES:**
- ✅ Distinguishes timeout from completion
- ✅ Shows that monitoring continues
- ⚠️ Timeout message sent even if summary is empty

---

### Worker Task Final After Timeout
**Event:** `worker:task:final_after_timeout`

**RESPONSE:**
```
[✅ or ❌] 최종 완료 ([duration]분)
[summary]
```

**CODE LOCATION:** Lines 1572-1592

**POTENTIAL ISSUES:**
- ✅ Distinguishes final result from timeout
- ⚠️ No visual cue that this is "after previous timeout" message

---

### Session Output (Real-time)
**Event:** `session:screen`

**PAYLOAD:**
```json
{
  "sessionId": "string",
  "content": "string"
}
```

**RESPONSE:**
```
📩 [sessionName]
[content]
```

**CODE LOCATION:** Lines 1603-1635

**POTENTIAL ISSUES:**
- ✅ Stores output in local history buffer (for /last command)
- ✅ Queues messages per-session to prevent interleaving
- ✅ Strips "olympus-" prefix for display

---

### Session Closed
**Event:** `session:closed`

**RESPONSE:**
```
🛑 세션 '[sessionName]' 종료됨
```

**CODE LOCATION:** Lines 1645-1678

**POTENTIAL ISSUES:**
- ✅ Cleans up local state (sessions, history, queues)
- ✅ Auto-switches to next session if closed was active
- ⚠️ Silent cleanup if cleanup fails during WebSocket message handling

---

## SECURITY AUDIT

### Authentication
- ✅ API Key validation via Bearer token (`Authorization: Bearer {apiKey}`)
- ✅ Allowed users list (whitelist-based, empty list = allow all)
- ✅ Auth middleware on all command handlers

### Input Validation
- ⚠️ **Message limit enforcement** — 4000 char Telegram limit enforced, but user can send unlimited text (split across messages)
- ⚠️ **@mention parsing** — regex allows any non-whitespace as worker name: `/^@(\S+)\s+(.+)$/`
- ✅ **JSON parsing** — body size limited to 10MB

### Rate Limiting
- ❌ **NO rate limiting** — any user can spam commands
- ❌ **NO per-user throttling** — can launch infinite /team tasks in parallel

### Data Storage
- ✅ **No persistent storage** — all session state in-memory only
- ⚠️ **Output history lost on restart** — `/last` command returns empty after bot restart

### Error Handling
- ✅ Global error handler catches unhandled errors
- ✅ Structured logging for all updates
- ⚠️ **Some errors logged silently** — user may not see all failures

---

## API ENDPOINT ANALYSIS

### CLI Execution
- `POST /api/cli/run` — Sync (600sec timeout)
- `POST /api/cli/run/async` — Async (30min task timeout)
- `GET /api/cli/run/{taskId}/status` — Poll async task

**POTENTIAL ISSUES:**
- ⚠️ Long timeouts may block client connections
- ✅ Proper async polling with status checks

### Worker Management
- `GET /api/workers` — List workers
- `POST /api/workers/{id}/task` — Assign task to worker (used internally)
- `POST /api/workers/tasks/{taskId}/result` — Report task result (used internally)

### Codex Routes
- `POST /api/codex/chat` — Lightweight chat (Haiku model)
- `POST /api/codex/route` — Decision routing (MULTI_SESSION, SESSION_FORWARD, etc.)

### Sessions
- `POST /api/sessions/connect` — Connect to tmux session
- `GET /api/sessions` — List sessions
- `DELETE /api/sessions/{id}` — Terminate session

---

## EDGE CASES & TESTING CHECKLIST

### Command Edge Cases

#### /start
- [ ] When no workers available
- [ ] When /api/workers returns error
- [ ] When /api/workers returns empty array

#### /health
- [ ] When Gateway is down
- [ ] When WebSocket disconnected
- [ ] When multiple sessions active

#### /sessions
- [ ] When no sessions exist
- [ ] When mixed (active + unregistered) sessions
- [ ] When session becomes stale during display

#### /close
- [ ] When no active session (if no arg provided)
- [ ] When session closed by external user
- [ ] When session was already deleted

#### /use
- [ ] Switching between multiple sessions
- [ ] Connecting to stale session that became active again
- [ ] /use main to exit direct mode
- [ ] /use direct when already in direct mode

#### /team
- [ ] 30min timeout scenario
- [ ] Interrupting with another /team command
- [ ] Checking status while /team runs
- [ ] /team with very long prompt (>4000 chars)

#### /codex
- [ ] When WebSocket disconnected
- [ ] When RPC times out
- [ ] Low confidence response (<50%)

#### /tasks
- [ ] When no tasks active
- [ ] When WebSocket disconnected

#### /workers
- [ ] When same worker name in multiple projects
- [ ] Worker status change during display

#### Text Messages (Orchestrator)
- [ ] Commands vs regular messages
- [ ] Very long messages (>4000 chars)
- [ ] Messages with special characters (Markdown breaking)
- [ ] Codex timeout fallback to Claude

#### Text Messages (Direct Mode)
- [ ] @mention with invalid worker name
- [ ] "team:" prefix with no prompt
- [ ] MULTI_SESSION execution failures (partial)
- [ ] Switching sessions mid-message

#### Inline Query
- [ ] Empty query
- [ ] Worker name with special characters
- [ ] Gateway timeout (should return no results)

### WebSocket Events
- [ ] Task completed while offline (message queued?)
- [ ] Session closed from external client
- [ ] Rapid succession of events
- [ ] RPC response to missing requestId

### Error Scenarios
- [ ] Gateway connection lost mid-operation
- [ ] Telegram rate limit (too many messages)
- [ ] Worker crash during task execution
- [ ] Session tmux window deleted externally
- [ ] API key invalidated during session

---

## RECOMMENDATIONS

### Priority: CRITICAL

1. **Add Rate Limiting**
   - Per-user: max 5 commands/min
   - Per-chat: max 10 /team tasks in parallel
   - Prevent: infinite async task spawning

2. **Improve Error Messages**
   - "❌ 오류" is too vague for troubleshooting
   - Show actual error type (TimeoutError, NetworkError, etc.)
   - Add retry guidance where applicable

3. **Add Request Timeouts**
   - `/start` worker fetch: add 5sec timeout
   - Codex route: log if >3sec
   - Alert user if Gateway response slow

### Priority: HIGH

4. **Session State Persistence**
   - Save active session mapping to file
   - Restore after bot restart
   - `/last` command can reference history

5. **Worker @mention Validation**
   - Pre-validate worker name exists before sending
   - Suggest corrections if typo (levenshtein distance)
   - Show worker offline status in @mention inline query

6. **Improve Team Task Feedback**
   - Show intermediate progress (task count, completion %)
   - Add cancellation support (/cancel-team)
   - Log team task results to file for audit

### Priority: MEDIUM

7. **Add Message Deduplication**
   - Prevent duplicate messages if API called twice
   - Track message IDs from Telegram
   - Idempotent operations for webhooks

8. **Inline Query Caching**
   - Cache worker list locally (refresh on /workers command)
   - Reduce API calls from 5-10 per keystroke
   - Fallback to cache if Gateway timeout

9. **Add /debug Command**
   - Show internal state (sessions map, WebSocket status)
   - Show pending RPC calls
   - Help with troubleshooting

10. **Structured Logging Improvements**
    - Add request ID tracing
    - Log all API calls (request/response)
    - Separate debug/info/warn/error clearly

---

## SUMMARY TABLE

| Feature | Commands | Handlers | Total |
|---------|----------|----------|-------|
| Commands | 10 | - | 10 |
| Message Handlers | - | 3 | 3 |
| WebSocket Events | - | 6+ | 6+ |
| **API Endpoints Called** | | | |
| - GET endpoints | 6 | - | 6 |
| - POST endpoints | 10 | - | 10 |
| - DELETE endpoints | 1 | - | 1 |
| - RPC calls | 2 | - | 2 |

---

## CONCLUSION

The Olympus Telegram bot is **feature-complete for basic operations** but has gaps in:
1. Rate limiting (allow abuse vectors)
2. Error visibility (users can't troubleshoot)
3. Resilience (network failures not always handled gracefully)
4. Persistence (session state lost on restart)

**Recommendation: Implement CRITICAL items before production use.**

