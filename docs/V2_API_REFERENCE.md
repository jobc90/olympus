# Olympus V2 API Reference

**Protocol Version**: 0.2.0 | **Status**: Production Ready

## WebSocket 프로토콜

### 연결 흐름

```
1. 클라이언트 → 게이트웨이: { type: 'connect', payload: { clientType, protocolVersion, apiKey? } }
2. 게이트웨이 → 클라이언트: { type: 'connected', payload: { protocolVersion, sessionId } }
3. 하트비트: ping/pong 주기적 교환
```

### 메시지 포맷

```typescript
interface WsMessage<T = unknown> {
  type: string;
  id: string;              // 고유 메시지 ID
  timestamp: number;       // Unix milliseconds
  payload: T;
}
```

### 클라이언트 → 게이트웨이

| 타입 | 페이로드 | 설명 |
|------|---------|------|
| `connect` | `ConnectPayload` | 초기 연결, clientType: 'tui'\|'web'\|'cli' |
| `subscribe` | `{ runId?, sessionId? }` | 이벤트 구독 (runId 또는 sessionId 지정) |
| `unsubscribe` | `{ runId?, sessionId? }` | 구독 해제 |
| `cancel` | `{ runId?, taskId? }` | Run/Task 취소 |
| `ping` | `{}` | 하트비트 요청 |
| `rpc` | `RpcRequestPayload` | RPC 메서드 호출 |

### 게이트웨이 → 클라이언트 (이벤트)

| 타입 | 설명 | 페이로드 |
|------|------|---------|
| `connected` | 연결 성공 | `{ protocolVersion, sessionId }` |
| `agent:start` | 에이전트 시작 | `AgentPayload` (agentId, taskId, content) |
| `agent:chunk` | 에이전트 스트림 | `AgentPayload` (content) |
| `agent:complete` | 에이전트 완료 | `AgentPayload` (content) |
| `agent:error` | 에이전트 에러 | `AgentPayload` (error) |
| `phase:change` | 단계 변경 | `{ phase: -1..8, phaseName, status, progress? }` |
| `task:update` | 태스크 업데이트 | `{ taskId, subject, status, featureSet? }` |
| `worker:started` | 워커 시작 | `WorkerStartedPayload` |
| `worker:output` | 워커 출력 | `WorkerOutputPayload` |
| `worker:done` | 워커 완료 | `WorkerDonePayload` |
| `log` | 로그 메시지 | `{ level, message, source? }` |
| `pong` | 하트비트 응답 | `{}` |
| `runs:list` | Run 목록 갱신 | `{ runs: RunStatus[] }` |
| `sessions:list` | Session 목록 갱신 | `{ sessions, availableSessions? }` |
| `context:*` | Context 이벤트 | `ContextCreatedPayload` 등 |

---

## RPC 메서드

RPC 호출: `{ type: 'rpc', payload: { method, params } }`
응답: `{ type: 'rpc:ack' }` (즉시) → `{ type: 'rpc:result' | 'rpc:error' }` (최종)

### 시스템 메서드

#### `health` (인증 불필요)
```
params: (없음)
result: { status: 'ok', uptime: number, version: string }
```
헬스 체크. CORS preflight, 외부 모니터링 용.

#### `status`
```
params: (없음)
result: {
  agentState: string,          // 에이전트 현재 상태
  activeWorkers: number,        // 활성 워커 수
  connectedClients: number,     // 연결된 클라이언트 수
  activeSessions: number        // 활성 세션 수
}
```

### 에이전트 메서드

#### `agent.command`
```
params: {
  command: string,              // 실행할 명령어
  projectPath?: string,
  autoApprove?: boolean
}
result: {
  taskId: string,
  status: 'accepted' | 'rejected',
  message: string
}
```
새 에이전트 작업 시작. 상태머신: IDLE → ANALYZING → PLANNING → EXECUTING → REVIEWING → REPORTING → IDLE

#### `agent.status`
```
params: (없음)
result: {
  state: string,                // IDLE, ANALYZING, PLANNING, EXECUTING, REVIEWING, REPORTING, INTERRUPT
  currentTask: AgentTaskSummary | null,
  activeWorkers: number,
  queuedCommands: number
}
```

#### `agent.cancel`
```
params: { taskId?: string }
result: { cancelled: boolean, message: string }
```
작업 취소. taskId 생략 시 현재 작업 취소.

#### `agent.approve`
```
params: { taskId: string }
result: { approved: boolean, message: string }
```
실행 계획 승인 (autoApprove=false 시).

#### `agent.reject`
```
params: { taskId: string, reason?: string }
result: { rejected: boolean, message: string }
```
실행 계획 거절.

#### `agent.history`
```
params: { limit?: number, offset?: number }
result: {
  tasks: CompletedAgentTask[],
  total: number
}
```
완료된 작업 이력 조회.

### 워커 메서드

#### `workers.list`
```
params: (없음)
result: { workers: WorkerInfo[] }
```
활성/완료된 모든 워커 나열.

#### `workers.output`
```
params: {
  workerId: string,
  offset?: number,
  limit?: number
}
result: {
  workerId: string,
  output: string,
  totalLength: number
}
```
워커 출력 스트림 조회 (pagination).

#### `workers.terminate`
```
params: { workerId: string }
result: { terminated: boolean, message: string }
```
실행 중인 워커 강제 종료.

### 세션 메서드 (REST + RPC)

#### `sessions.list`
```
params: (없음)
result: {
  sessions: SessionInfo[],
  availableSessions?: AvailableSession[]
}
```

#### `sessions.discover`
```
params: (없음)
result: { sessions: AvailableSession[] }
```

---

## REST API 엔드포인트

### 인증

**Header**: `Authorization: Bearer <api-key>`

```http
POST /api/auth
Body: { "apiKey": "..." }
Response: { "valid": true }
```

### Run API

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| POST | `/api/runs` | Run 생성 (Body: `{ prompt, context?, agents?, usePro?, timeout? }`) |
| GET | `/api/runs` | 모든 Run 나열 |
| GET | `/api/runs/:id` | Run 상태 조회 |
| DELETE | `/api/runs/:id` | Run 취소 |

### Session API

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | `/api/sessions` | 활성 + 발견된 세션 나열 |
| POST | `/api/sessions` | 새 tmux 세션 생성 (Body: `{ chatId, projectPath?, name? }`) |
| POST | `/api/sessions/connect` | 기존 tmux 연결 (Body: `{ chatId, tmuxSession }`) |
| GET | `/api/sessions/discover` | tmux 세션 발견 |
| GET | `/api/sessions/:id` | 세션 정보 조회 |
| GET | `/api/sessions/:id/context` | 세션 + 컨텍스트 링크 조회 |
| GET | `/api/sessions/:id/output` | tmux 출력 캡처 (Query: `lines=100`) |
| POST | `/api/sessions/:id/input` | 입력 전송 (Body: `{ message }`) |
| DELETE | `/api/sessions/:id` | 세션 종료 |

### Task API

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | `/api/tasks` | 루트 태스크 나열 (Query: `format=tree` → 트리 구조) |
| POST | `/api/tasks` | 태스크 생성 (Body: `CreateTaskInput`) |
| GET | `/api/tasks/search` | 태스크 검색 (Query: `q=keyword`) |
| GET | `/api/tasks/stats` | 통계 (완료/실패/진행 중) |
| GET | `/api/tasks/:id` | 태스크 조회 |
| PATCH | `/api/tasks/:id` | 태스크 업데이트 |
| DELETE | `/api/tasks/:id` | 태스크 삭제 (soft) |
| GET | `/api/tasks/:id/children` | 하위 태스크 나열 |
| GET | `/api/tasks/:id/context` | 태스크 + 해결된 컨텍스트 (Query: `maxLevels=3`) |
| GET | `/api/tasks/:id/history` | 컨텍스트 이력 조회 |

### Context API (계층형 컨텍스트 관리)

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | `/api/contexts` | 컨텍스트 나열 (Query: `scope=workspace\|project\|task`, `format=tree`) |
| POST | `/api/contexts` | 컨텍스트 생성 (Body: `{ scope, path, parentId?, summary?, content? }`) |
| GET | `/api/contexts/:id` | 컨텍스트 조회 |
| PATCH | `/api/contexts/:id` | 업데이트 with 낙관적 잠금 (Body: `{ summary?, content?, expectedVersion }`) |
| DELETE | `/api/contexts/:id` | 컨텍스트 삭제 (soft) |
| GET | `/api/contexts/:id/versions` | 버전 이력 (Query: `limit=100`) |
| GET | `/api/contexts/:id/children` | 자식 컨텍스트 나열 |
| POST | `/api/contexts/:id/merge` | 병합 요청 (Body: `{ targetId, idempotencyKey?, autoApply? }`) → 202 |
| POST | `/api/contexts/:id/report-upstream` | 상위 보고 (Query: `cascade=true`) → 202 |

### 기타

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | `/healthz` | 헬스 체크 (인증 불필요) |
| POST | `/api/chat` | 간단한 채팅 (Body: `{ message }`, Gemini 기반) |
| GET | `/api/operations/:id` | 비동기 작업 상태 조회 |

---

## 타입 정의

### Agent 관련

```typescript
type AgentState = 'IDLE' | 'ANALYZING' | 'PLANNING' | 'EXECUTING' | 'REVIEWING' | 'REPORTING' | 'INTERRUPT';

interface AgentTask {
  id: string;
  command: string;
  state: AgentState;
  analysis: Analysis | null;
  plan: ExecutionPlan | null;
  workers: WorkerTask[];
  results: WorkerResult[];
  report: ReviewReport | null;
  startedAt: number;
  completedAt?: number;
  error?: string;
}

interface Analysis {
  intent: 'coding' | 'documentation' | 'testing' | 'debugging' | 'analysis' | 'question';
  complexity: 'simple' | 'moderate' | 'complex';
  targetProject: string;
  targetFiles: string[];
  requirements: string[];
  useOrchestration: boolean;
  suggestedApproach: string;
  risks: string[];
  estimatedDuration: string;
  needsConfirmation: boolean;
}

interface ExecutionPlan {
  strategy: 'single' | 'parallel' | 'sequential' | 'pipeline';
  workers: WorkerTask[];
  checkpoints: string[];
  rollbackStrategy: string;
  totalEstimate: string;
}

interface ReviewReport {
  taskId: string;
  status: 'success' | 'partial' | 'failed';
  summary: string;
  details: string;
  changedFiles: string[];
  testResults: string;
  buildStatus: 'pass' | 'fail' | 'unknown';
  warnings: string[];
  nextSteps: string[];
  shouldRetry: boolean;
  retryReason?: string;
}
```

### Worker 관련

```typescript
interface WorkerTask {
  id: string;
  type: 'claude-cli' | 'claude-api' | 'tmux';
  prompt: string;
  projectPath: string;
  dependencies: string[];
  timeout: number;
  orchestration: boolean;
  successCriteria: string[];
}

interface WorkerResult {
  workerId: string;
  status: 'completed' | 'failed' | 'timeout';
  exitCode: number | null;
  output: string;
  duration: number;
  error?: string;
}
```

### Context 관련

```typescript
type ContextScope = 'workspace' | 'project' | 'task';
type ContextStatus = 'active' | 'archived' | 'deleted';

interface Context {
  id: string;
  scope: ContextScope;
  path: string;
  parentId: string | null;
  status: ContextStatus;
  summary: string | null;
  content: string | null;
  version: number;           // 낙관적 잠금
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ContextMerge {
  id: string;
  sourceId: string;
  targetId: string;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'applied' | 'conflict';
  conflicts: string[];
  createdAt: string;
}
```

### Run 및 Session

```typescript
interface RunStatus {
  runId: string;
  status: 'running' | 'completed' | 'cancelled' | 'failed';
  prompt: string;
  createdAt: number;
  phase: number;           // -1 to 8
  phaseName: string;
  tasks: TaskPayload[];
}

interface SessionInfo {
  id: string;
  name: string;
  chatId: number;
  tmuxSession: string;
  status: 'active' | 'closed';
  projectPath: string;
  workspaceContextId?: string;
  projectContextId?: string;
  taskContextId?: string;
  createdAt: number;
  lastActivityAt: number;
}
```

---

## 에러 처리

### RPC 에러 코드

```typescript
type RpcErrorCode =
  | 'PARSE_ERROR'              // 요청 파싱 실패
  | 'METHOD_NOT_FOUND'         // 등록되지 않은 메서드
  | 'INVALID_PARAMS'           // 매개변수 검증 실패
  | 'INTERNAL_ERROR'           // 서버 내부 오류
  | 'UNAUTHORIZED'             // 인증 필요
  | 'TIMEOUT'                  // 요청 초과 시간
  | 'AGENT_BUSY'               // 에이전트 작업 중
  | 'WORKER_LIMIT_REACHED';    // 워커 수 초과
```

### HTTP 상태 코드

- `200` – 성공
- `201` – 생성됨
- `202` – 비동기 작업 수락 (merge/report-upstream)
- `400` – 잘못된 요청
- `401` – 인증 실패
- `404` – 리소스 없음
- `409` – 충돌 (버전 불일치)
- `429` – 제한 (동시 Run 수 초과)
- `500` – 서버 오류

---

## 인증 및 CORS

### API Key 생성
```bash
olympus auth generate
```

### CORS 설정
게이트웨이는 `ALLOWED_ORIGINS`로 명시된 출처만 허용.
기본값: `http://localhost:3001` (Dashboard), `http://localhost:3000` (CLI)

### 헤더 예시
```http
Authorization: Bearer sk-xxxxxxxxxxxxx
X-Changed-By: user@example.com        // Context 작업 추적
```

---

## 예제

### WebSocket 연결 및 구독

```javascript
const ws = new WebSocket('ws://localhost:3333');
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'connect',
    id: 'conn-1',
    timestamp: Date.now(),
    payload: { clientType: 'web', protocolVersion: '0.2.0', apiKey: '...' }
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'connected') {
    // 구독
    ws.send(JSON.stringify({
      type: 'subscribe',
      id: 'sub-1',
      timestamp: Date.now(),
      payload: { runId: 'run-123' }
    }));
  }
};
```

### RPC 호출 (Run 생성)

```bash
curl -X POST http://localhost:3333/api/runs \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "구현: 사용자 인증 기능",
    "agents": ["gemini", "codex"],
    "timeout": 300000
  }'
# Response: { "runId": "run-abc123" }
```

### Context 병합 (비동기)

```bash
curl -X POST http://localhost:3333/api/contexts/ctx-1/merge \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "targetId": "ctx-2", "autoApply": true }'
# Response: { "operationId": "op-xyz", "mergeId": "merge-123" }

# 비동기 상태 확인
curl http://localhost:3333/api/operations/op-xyz \
  -H "Authorization: Bearer $API_KEY"
# Response: { "operation": { "id": "op-xyz", "status": "succeeded", "result": {...} } }
```

---

**최종 업데이트**: 2026-02-09 | **Protocol v0.2.0** | **Olympus v0.3.0+**
