# Olympus v2.0 Grand Transformation — 설계 문서

> **작성일**: 2026-02-09
> **상태**: Phase -1 Smart Intake + Architecture Blueprint
> **목표**: Olympus를 "세션 모니터링 도구"에서 "자율 AI 에이전트 오케스트레이션 플랫폼"으로 전환

---

## 1. Executive Summary

### 1.1 현재 상태 (v0.3.0)

Olympus는 **tmux 세션 관리 + 출력 파이프라인** 도구다. Claude CLI를 tmux에 띄우고, Gateway가 tmux 출력을 읽어서 WebSocket으로 Dashboard/Telegram에 중계하는 구조다.

```
[사용자] → Telegram 봇 → Gateway → tmux 세션 (Claude CLI)
                                       ↕ pipe-pane + 파일 오프셋
                                    출력 → Gateway → Telegram/Dashboard
```

**핵심 한계**: 모든 세션이 **수동적(passive)**이다. Gateway는 출력을 읽기만 하고, Telegram 봇은 단순 중계만 한다. "지능"이 없다.

### 1.2 목표 상태 (v2.0)

Olympus를 **자율 AI 에이전트 플랫폼**으로 전환한다. **Codex가 메인 세션에서 살아있는 AI 에이전트**로 동작하며:

1. **사용자 명령 수신** — Telegram/Dashboard에서 자연어로 명령
2. **판단과 계획** — Codex가 명령을 분석하고 실행 계획 수립
3. **작업 위임** — Claude CLI 워커 세션을 생성하고 `/orchestration`으로 작업 지시
4. **결과 감시** — 워커 출력을 실시간 모니터링, 완료/실패 감지
5. **보고** — 결과를 요약하여 사용자에게 Telegram/Dashboard로 전달

```
[사용자] ──→ Telegram/Dashboard
                ↕
            Gateway (제어면)
                ↕
         ┌──────────────────┐
         │  Codex Agent      │  ← 메인 세션: "살아있는 두뇌"
         │  (항상 실행 중)    │
         │                   │
         │  • 명령 수신/해석  │
         │  • 계획 수립       │
         │  • 워커 생성/관리  │
         │  • 결과 수집/보고  │
         └─────┬─────────────┘
               │ 작업 지시
        ┌──────┼──────┐
        ▼      ▼      ▼
    [Worker 1] [Worker 2] [Worker N]
    Claude CLI Claude CLI Claude CLI
    /orchestration         코딩/문서작업
```

### 1.3 핵심 변화 요약

| 영역 | v0.3.0 (현재) | v2.0 (목표) |
|------|--------------|-------------|
| **메인 세션** | Claude CLI (수동 대화) | Codex Agent (자율 판단) |
| **워커 세션** | 사용자가 수동 생성 | Codex가 자동 생성/관리 |
| **Telegram** | 출력 중계 + 수동 입력 | 자연어 명령 → Codex 위임 |
| **Gateway** | 출력 파이프라인 | 제어면 (RPC + 이벤트) |
| **의사결정** | 사용자 직접 | Codex가 판단 → 사용자 승인 |
| **보고** | Raw/Digest 출력 | 구조화된 결과 보고서 |

### 1.4 비전 상세: "살아있는 AI 에이전트"란?

현재 Olympus의 메인 세션은 **사용자가 직접 대화하는 Claude CLI**다. 사용자가 키보드로 타이핑하고, Claude가 응답하고, 사용자가 다시 타이핑한다. Telegram은 이 과정을 단순 중계할 뿐이다.

v2.0의 Codex Agent는 근본적으로 다르다:

1. **항상 깨어 있음** — 사용자가 없어도 Gateway 프로세스 내에서 실행 중. 대기 상태(IDLE)에서 명령을 기다린다.
2. **판단 능력** — "인증 모듈 리팩토링해줘"라는 자연어를 받으면, 프로젝트 구조를 분석하고, 어떤 파일을 변경해야 하는지 판단하고, 복잡도에 따라 단일 워커 vs 다중 워커를 결정한다.
3. **위임과 감시** — 직접 코딩하지 않는다. Claude CLI 워커에게 작업을 위임하고, 워커의 출력을 실시간으로 감시하며, 빌드/테스트 실패를 감지하면 자동으로 재지시한다.
4. **학습** — 과거 작업 히스토리를 SQLite에 저장하고, 유사한 요청이 들어오면 이전 패턴을 적용하여 더 빠르고 정확하게 계획을 수립한다.
5. **구조화된 보고** — 단순 텍스트 출력이 아니라, "변경 파일 N개, 테스트 M/M 통과, 빌드 성공" 같은 구조화된 보고서를 생성한다.

```
현재 (v0.3.0):
  사용자 ──→ 직접 타이핑 ──→ Claude CLI ──→ 결과 읽기
  (능동적 참여 필요: 매 단계마다 사용자가 판단하고 지시)

목표 (v2.0):
  사용자 ──→ "이거 해줘" ──→ Codex Agent ──→ [자동: 분석→계획→실행→검증→보고]
                                ↕
                         Claude CLI Workers
  (사용자는 결과만 받음: 자율 운영, 필요 시에만 승인 요청)
```

### 1.5 OpenClaw와의 포지셔닝 차이

OpenClaw는 **범용 AI 메신저 허브**다. WhatsApp/Telegram/Slack 등 다양한 채널을 통합하고, 에이전트가 대화에 응답하는 구조다. 핵심은 "채널 통합"이다.

Olympus v2.0은 **소프트웨어 엔지니어링 자동화 플랫폼**이다. Codex Agent가 코딩/테스트/문서 작업을 자율적으로 수행한다. 핵심은 "작업 실행과 감시"다.

| 차원 | OpenClaw | Olympus v2.0 |
|------|----------|-------------|
| **주요 사용자** | 다양한 메신저 사용자 | 소프트웨어 엔지니어 |
| **에이전트 역할** | 대화 응답 | 코딩 작업 자율 실행 |
| **워커** | 없음 (단일 에이전트) | Claude CLI 다중 워커 |
| **핵심 가치** | 채널 통합 | 작업 자동화 + 감시 |
| **배울 점** | Gateway 제어면, WS RPC, 플러그인 시스템 | — |
| **차별점** | — | /orchestration, 워커 풀, 빌드/테스트 감시 |

---

## 2. 현재 아키텍처 상세 분석

### 2.1 패키지 구조 (8 packages)

```
packages/
├── protocol/    # 공유 타입, WS 메시지 스키마 (v0.2.0)
├── core/        # OlympusBus, TaskStore, ContextStore, GeminiExecutor
├── gateway/     # WS+HTTP 서버, SessionManager, RunManager, API
├── cli/         # olympus 명령어 (start, server, setup)
├── client/      # Gateway WS 클라이언트 라이브러리
├── tui/         # 터미널 UI (Ink/React) — 미완성
├── web/         # Dashboard (React + Vite)
└── telegram-bot/# Telegraf 봇 + Digest 시스템
```

### 2.2 Protocol 패키지 상세

**파일**: `packages/protocol/src/` (6개 파일)

프로토콜 계층은 모든 패키지가 공유하는 **타입 정의와 상수**를 담는다.

```typescript
// messages.ts — WS 메시지 엔벨로프
interface WsMessage<T> {
  type: string;
  id: string;      // UUID
  timestamp: number;
  payload: T;
}

// 클라이언트 → 게이트웨이
type ClientMessage = 'connect' | 'subscribe' | 'unsubscribe' | 'cancel' | 'ping';
// 게이트웨이 → 클라이언트
type ServerMessage = 'connected' | 'phase:change' | 'agent:start' | 'agent:chunk'
  | 'agent:complete' | 'agent:error' | 'task:update' | 'log' | 'snapshot'
  | 'runs:list' | 'sessions:list' | 'session:output' | 'session:error'
  | 'session:closed' | 'context:*' | 'pong';
```

```typescript
// task.ts — 계층적 태스크 (Materialized Path)
interface Task {
  id: string;
  parentId: string | null;
  path: string;           // 예: "/root/phase1/task3" (경로 기반 쿼리 최적화)
  depth: number;
  siblingOrder: number;
  name: string;
  context: string | null;
  metadata: Record<string, unknown>;
  status: 'active' | 'archived' | 'deleted';
  version: number;        // 낙관적 잠금용
}
```

```typescript
// context.ts — Context OS 3-Layer
interface Context {
  id: string;
  scope: 'workspace' | 'project' | 'task';
  path: string;
  parentId: string | null;
  status: string;
  summary: string | null;
  content: string | null;
  version: number;
}

interface ContextMerge {
  sourceId: string;
  targetId: string;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'applied' | 'conflict';
  diff: string | null;
  resolution: string | null;
}
```

```typescript
// constants.ts — Gateway 연결 상수
DEFAULT_GATEWAY_PORT = 8200;
DEFAULT_GATEWAY_HOST = '127.0.0.1';
WS_PATH = '/ws';
HEARTBEAT_INTERVAL = 30_000;     // 30초
MAX_RECONNECT_ATTEMPTS = 10;
RECONNECT_BASE_DELAY = 1_000;    // 1초 (지수 백오프)
```

**v2.0 변경 필요성**: RPC 메서드 메시지 타입 추가, Agent 이벤트 타입 추가, Worker 상태 타입 추가

### 2.3 Core 패키지 상세

**파일**: `packages/core/src/` (7개 파일, ~2000줄)

Core는 Gateway와 CLI가 공유하는 **비즈니스 로직**을 담는다.

**OlympusBus (이벤트 버스)**:
```typescript
// events.ts — Singleton 또는 run-scoped 인스턴스
class OlympusBus extends EventEmitter {
  static create(runId: string): OlympusBus;
  emitPhase(phase: number, phaseName: string): void;
  emitAgentChunk(agentId: string, content: string): void;
  emitTaskUpdate(task: TaskPayload): void;
  emitLog(level: 'info' | 'warn' | 'error', message: string, source?: string): void;
}
```

**ContextStore (SQLite 기반, 820줄)**:
```typescript
// contextStore.ts — better-sqlite3, WAL 모드
class ContextStore {
  static getInstance(): ContextStore;    // Singleton

  // 테이블: contexts, context_edges, context_versions, context_merges, operations
  create(input, actor): Context;         // scope 계층 검증, 중복 방지
  update(id, input, actor): Context;     // 낙관적 잠금 (version 체크)
  getTree(scope?): ContextTreeNode[];    // 재귀 CTE로 트리 구성
  getAncestors(id): Context[];           // 재귀 CTE, 안전 LIMIT
  createMerge(sourceId, targetId): Merge; // 멱등성 키로 중복 방지
  applyMerge(mergeId): void;             // approved → applied 전이
  seedWorkspace(path): void;             // 자동 계층 생성
  seedProject(workspacePath, projectPath): void;
}
```

**TaskStore (SQLite 기반, 554줄)**:
```typescript
// taskStore.ts — Materialized Path 최적화
class TaskStore {
  create(input): Task;                           // siblingOrder 자동 계산
  getWithContext(id, maxAncestorLevels): TaskWithResolvedContext;  // 조상 컨텍스트 병합
  getAncestors(id, maxLevels): Task[];           // 재귀 CTE + LIMIT
  getDescendants(id): Task[];                    // path LIKE 쿼리
  reparent(id, newParentId): void;               // 순환 참조 검사, 하위 경로 갱신
  recordContextVersion(taskId, context, changedBy): void;
}
```

**ContextService / ContextResolver**:
```typescript
// contextService.ts — 도메인 로직
class ContextService {
  autoReportPolicy: 'manual' | 'auto' | 'on-threshold';
  cascadeReportUpstream(): void;  // 계층 순회: task → project → workspace
}

// contextResolver.ts — 양방향 컨텍스트 전파
class ContextResolver {
  resolve(taskId): TaskWithResolvedContext;
  buildPromptContext(taskId): string;        // AI 프롬프트용 마크다운 포맷
  getAffectedTasks(taskId): Task[];          // 영향 받는 하위 태스크
}
```

**v2.0 변경 필요성**: AgentMemory 추가 (기존 ContextStore 패턴 재활용), WorkerEvent 타입 추가

### 2.4 Gateway (핵심 서버)

**파일**: `packages/gateway/src/server.ts` (433줄)

```typescript
class Gateway {
  private wss: WebSocketServer;      // WS 서버
  private httpServer;                 // HTTP 서버 (같은 포트)
  private clients: Map<string, ClientInfo>;  // 연결된 클라이언트
  private runManager: RunManager;     // 오케스트레이션 실행 관리
  private sessionManager: SessionManager;  // tmux 세션 관리
}
```

**WS 프로토콜**: connect → subscribe/unsubscribe → ping/pong
- 인증: API Key 기반 (`oly_xxx`)
- 이벤트: `session:output`, `session:error`, `session:closed`, `runs:list`, `sessions:list`

**HTTP API**:
- `/api/sessions/connect` — tmux 세션 연결
- `/api/sessions/discover` — Olympus tmux 세션 탐색
- `/api/sessions/:id/input` — tmux에 입력 전송
- `/api/sessions/:id/output` — 세션 출력 조회
- `/api/runs` — 오케스트레이션 실행 관리
- `/api/tasks`, `/api/contexts` — 작업/컨텍스트 CRUD

**인증 시스템** (`auth.ts`, 170줄):
```typescript
// API Key: oly_ 접두사 + 24바이트 랜덤 hex (총 52자)
generateApiKey(): string → `oly_${randomBytes(24).toString('hex')}`

// 설정 파일: ~/.olympus/config.json
interface OlympusClientConfig {
  apiKey: string;
  gatewayUrl: string;        // 'http://127.0.0.1:8200'
  gatewayHost: string;
  gatewayPort: number;
  telegram?: { token: string; allowedUsers: number[] };
}

// HTTP: Bearer 토큰 또는 x-api-key 헤더
// WS: connect 메시지의 apiKey 필드
```

**CORS 설정** (`cors.ts`, 46줄):
```typescript
ALLOWED_ORIGINS = [
  'http://localhost:5173',    // Vite dev
  'http://localhost:3000',    // 대체 dev
  'http://localhost:8201',   // 프로덕션 대시보드
  // + 각각의 127.0.0.1 버전
];
```

**RunManager** (`run-manager.ts`, 220줄):
```typescript
class RunManager {
  maxConcurrentRuns = 5;   // 동시 실행 제한
  createRun(options): RunInstance;      // OlympusBus 인스턴스 생성, 이벤트 구독
  cancelRun(runId): boolean;            // AbortController.abort()
  cleanup(keepLast = 10): void;         // 완료된 실행 정리, bus.dispose()
}

interface RunInstance {
  id: string;
  bus: OlympusBus;              // run-scoped 이벤트 버스
  abortController: AbortController;
  status: 'running' | 'completed' | 'cancelled' | 'failed';
  tasks: Map<string, TaskPayload>;
  phase: number;
  phaseName: string;
}
```

**문제점**:
1. **메서드 표면 부재** — OpenClaw처럼 `health`, `send`, `agent`, `sessions.*` 같은 RPC 메서드 시스템이 없음. 단순 REST + WS 이벤트만.
2. **플러그인 시스템 부재** — 채널/기능 확장이 하드코딩됨
3. **에이전트 런타임 부재** — "에이전트"가 실행되는 런타임이 없음. RunManager는 있지만 실제 AI 에이전트 실행은 없음.
4. **30초 폴링** — 세션 reconcile이 30초 setInterval. 실시간성 부족.
5. **인증 단순** — API Key 단일 비교. 키 로테이션, 만료, 역할 기반 접근 제어 없음.
6. **CORS 하드코딩** — 포트 목록 수동 관리. 동적 오리진 등록 불가.

### 2.5 SessionManager (tmux 관리)

**파일**: `packages/gateway/src/session-manager.ts` (~1000줄)

```typescript
class SessionManager {
  // tmux 세션 연결
  connectToTmuxSession(chatId, tmuxSession): Session
  // 새 세션 생성
  create(chatId, projectPath?, name?): Session
  // tmux 출력 감시 (pipe-pane + 파일 오프셋 폴링)
  startOutputPolling(sessionId, tmuxSession)
  // tmux에 입력 전송
  sendInput(sessionId, input)
  // 출력 필터링 (프롬프트, 스피너, 상태바 제거)
  filterOutput(raw): string
  // 세션 정리
  reconcileSessions(): boolean
}
```

**출력 스트리밍 방식**:
1. `tmux pipe-pane -t {session} "cat >> {logFile}"` — 출력을 파일로 리디렉트
2. 1초 간격 폴링으로 파일 오프셋 읽기
3. `filterOutput()`으로 노이즈 제거
4. WS로 구독자에게 브로드캐스트

**출력 스트리밍 상세 파이프라인**:
```
tmux 세션 (Claude CLI 실행 중)
│
├── pipe-pane "cat >> /tmp/olympus-session-{id}.log"
│   └── 모든 터미널 출력이 파일에 추가됨
│
├── 1초 간격 폴링 (setInterval)
│   ├── fs.read(logFile, offset)  ← 마지막 읽은 위치부터
│   ├── offset 갱신
│   └── 새 데이터가 있으면 ↓
│
├── filterOutput(raw)
│   ├── 프롬프트 제거: /^❯.*$/
│   ├── 스피너 제거: /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/
│   ├── 상태바 제거: /[🤖📁🔷💎].*토큰.*비용/
│   ├── Thinking/Working 제거
│   └── 빈 줄 정리
│
├── debounce (1초) + throttle (2초) + minimum (5자)
│   └── 노이즈 방지: 빈번한 업데이트 억제
│
└── WS 브로드캐스트
    └── 구독 중인 클라이언트에게 session:output 이벤트 전송
```

**세션 영속성 (SessionStore)**:
```typescript
// sessions.json — JSON 파일 기반 영속성
interface SessionStore {
  sessions: Map<string, Session>;
  save(): void;           // JSON.stringify → 파일 쓰기
  load(): void;           // 파일 읽기 → Map 복원
  reconcile(): void;      // 실제 tmux 세션과 동기화 (30초 간격)
}
```

**문제점**:
1. **pipe-pane 한계** — tmux 출력만 읽을 수 있음. Claude CLI의 구조화된 상태(Phase, Task 등)를 알 수 없음.
2. **입력 전송 불안정** — `tmux send-keys`는 키 입력 시뮬레이션. 구조화된 명령 전달 불가.
3. **세션 간 통신 없음** — 메인 세션과 워커 세션이 서로의 존재를 모름.
4. **상태 추적 없음** — 세션이 뭘 하고 있는지(코딩? 빌드? 테스트?) 알 수 없음.
5. **SessionStore 영속성** — JSON 파일 기반. 동시 쓰기 안전하지 않음. SQLite 전환 필요.
6. **출력 필터링 불완전** — 새로운 Claude CLI 버전에서 출력 포맷이 변경되면 필터가 깨짐.

### 2.6 Client 패키지

**파일**: `packages/client/src/client.ts` (240줄)

```typescript
class OlympusClient {
  // WebSocket 클라이언트 — Gateway에 연결
  connect(): void;
  disconnect(): void;

  // 구독 관리 (자동 재구독)
  private subscribedRuns: Set<string>;
  private subscribedSessions: Set<string>;
  subscribe(runId): void;
  subscribeSession(sessionId): void;

  // 편의 이벤트 핸들러 (타입 안전)
  onPhase(handler): () => void;      // unsubscribe 함수 반환
  onAgentChunk(handler): () => void;
  onTask(handler): () => void;
  onLog(handler): () => void;
  onSnapshot(handler): () => void;
  on(type, handler): () => void;     // 와일드카드

  // Ping (30초 간격)
  private startPing(): void;
  // 재연결 (지수 백오프, 최대 10회)
  private handleReconnect(): void;
}
```

**문제점**:
1. **RPC 호출 불가** — 단방향 이벤트만. 클라이언트가 요청하고 응답을 받는 패턴 없음.
2. **타입 안전성 부족** — `on(type, handler)`의 타입이 느슨. 메시지 타입별 정확한 페이로드 타입 없음.

### 2.7 Telegram Bot

**파일**: `packages/telegram-bot/src/index.ts` (~750줄)

```typescript
class OlympusBot {
  private bot: Telegraf;
  private ws: WebSocket;           // Gateway WS 연결
  private subscribedRuns: Map;
  private chatSessions: Map;       // chatId → sessions
  private digestSessions: Map;     // 스마트 요약
  private sendQueues: Map;         // 메시지 큐
}
```

**명령어**: `/start`, `/session`, `/sessions`, `/connect`, `/input`, `/last`, `/mode`, `/raw`, `/help`

**Digest 시스템** (`digest/` 모듈):
- 6개 카테고리: build, test, commit, error, phase, change
- 하이브리드 트리거링: 에러/완료 → 즉시, 일반 → 5초 debounce
- 비밀 마스킹: API 키, Bearer 토큰 등

**Digest 시스템 상세** (`telegram-bot/src/digest/`, 5개 파일):

```typescript
// engine.ts — 분류 → 그룹핑 → 축약 파이프라인 (291줄)
// 점수 가중치: error:5, build:4, test:4, quality:4, commit:3, phase:3, change:2, other:1, noise:0
digestOutput(content: string): DigestResult {
  1. classifyLine(line)  → 카테고리 + 점수 부여
     ⚠️ 패턴 순서 중요: NOISE → BUILD/TEST → ERROR (오분류 방지)
     예: "Tests: 64 passed, 0 failed" → test 카테고리 (error 아님)
  2. groupIntoBlocks()   → 연속된 같은 카테고리를 블록으로 묶음
  3. buildDigest(blocks)  → 점수 내림차순 정렬 → 원래 순서 복원 → maxLength 잘라내기
  4. redactSecrets()      → sk-*, ghp_*, Bearer, 긴 hex 마스킹
}
```

```typescript
// session.ts — DigestSession (세션별 버퍼 관리)
class DigestSession {
  buffer: string = '';
  maxBufferSize = 8000;
  debounceTtl = 5000;       // 5초 디바운스
  ttl = 30000;              // 30초 비활성 TTL

  push(content): void {
    // IMMEDIATE_FLUSH_PATTERNS 매칭 시 → 즉시 flush
    // 그 외 → 5초 디바운스 타이머 리셋
    // 버퍼 초과 시 → flush 후 새 버퍼 (에러 컨텍스트 보존)
  }

  flush(): void {
    digestOutput(buffer) → formatDigest() → onFlush(callback)
  }
}

// IMMEDIATE_FLUSH_PATTERNS (14개):
// error.*failed, Quality Gates, phase.*complete,
// push.*done, successfully, build complete,
// test.*complete, lint.*complete, ...
```

**문제점**:
1. **수동 소통** — 사용자가 직접 `/input`으로 Claude에게 타이핑해야 함
2. **지능 없음** — 봇은 메시지를 그대로 전달할 뿐, 판단하지 않음
3. **세션 관리 수동** — 세션 생성/전환/종료를 사용자가 수동으로
4. **결과 해석 없음** — 출력을 필터링/요약만 하지, "작업이 성공했는가?"를 판단하지 않음
5. **Digest 한계** — 패턴 기반 텍스트 분류만 가능. AI 기반 의미론적 판단 불가.
6. **Telegram API 제약** — 4096자 메시지 한계, 마크다운 파싱 불완전

### 2.8 Dashboard (Web)

**패키지**: `packages/web/` (React + Vite)

**기능**:
- 세션 목록 + 출력 패널 (`SessionOutputPanel`)
- Context Explorer (3-layer context)
- TaskList (기능셋별 그룹핑)
- Gateway 자동 연결 (`window.__OLYMPUS_CONFIG__`)

**현재 컴포넌트 구조** (13개 컴포넌트 + 2개 훅):
```
App.tsx (메인, 3-column 그리드 레이아웃)
├── Header.tsx          — 로고, 마스코트, 연결 상태, 설정 버튼
├── SessionList.tsx     — 좌측: 연결된 세션(🖥️), 가용 세션(📡), 오케스트레이션(⚡)
├── PhaseProgress.tsx   — 중앙: 10단계 Phase 시각화 (-1~8)
├── TaskList.tsx        — 중앙: featureSet별 그룹핑, 접기/펼치기, 진행률 바
├── AgentStream.tsx     — 중앙: 에이전트별 출력 (Gemini/Codex/Claude 컬러 구분)
├── SessionOutputPanel.tsx — 중앙: tmux 세션 실시간 출력
├── ContextExplorer.tsx — 우측: 계층적 컨텍스트 트리 (CRUD + 버전)
├── LogPanel.tsx        — 우측: 레벨별 필터 (error/warn), 카운트 배지
├── SettingsModal.tsx   — 모달: Gateway 호스트/포트/API키 설정
├── EmptyState.tsx      — 빈 상태: 마스코트 + CLI 퀵스타트
├── ConnectionStatus.tsx — 연결 상태 점 (success/warning/error)
├── Card.tsx            — 재사용 카드 컴포넌트 (hover, active 상태)
└── SparkyMascot.tsx    — 마스코트 이미지 (sm/md/lg, 바운스 애니메이션)

hooks/
├── useOlympus.ts       — WS 클라이언트 훅: runs/sessions/tasks/logs/agents/phases 관리
│   ├── 자동 구독: 첫 활성 세션에 자동 연결
│   ├── 세션 출력 버퍼: 50개 max
│   └── 로그 버퍼: 100개 max
└── useContextTree.ts   — REST API 훅: 컨텍스트 CRUD, 버전 히스토리
    ├── AbortController 기반 페치 취소
    ├── 30초 자동 갱신
    └── 업스트림 보고, 머지 요청
```

**기술 스택**: React 18.3, Vite 6, Tailwind CSS 3.4, TypeScript 5.7
**설정 주입**: `startDashboardServer(port, config)` → index.html `<head>`에 `<script>window.__OLYMPUS_CONFIG__ = {...}</script>` 주입

**문제점**:
1. **읽기 전용** — 세션 출력만 볼 수 있음. 명령 전송/관리 제한적.
2. **에이전트 상태 없음** — Codex 에이전트의 판단/계획을 시각화하는 UI 없음
3. **워크플로우 없음** — "새 작업 생성 → 에이전트 할당 → 진행 추적 → 완료 확인" 워크플로우가 없음
4. **명령 입력 없음** — Telegram처럼 자연어 명령을 입력하는 UI 없음
5. **워커 가시성 없음** — 어떤 워커가 어떤 작업을 하고 있는지 볼 수 없음

### 2.9 TUI 패키지

**파일**: `packages/tui/src/` (3개 파일)

Ink (React for terminal) 기반 터미널 UI. 현재 미완성이지만 기본 구조는 갖추고 있다.

```typescript
// start.ts
startTui(options: { port?, host?, apiKey?, demoRunId?, WebSocket }): { waitUntilExit }
// → OlympusClient 생성 → Ink render() → App 컴포넌트 마운트

// App.tsx — Phase 점(●/◉/○), 태스크 목록(✓/⟳/✗/○), 에이전트 출력(200자), 로그(20개)
```

**v2.0 역할**: TUI는 유지하되, Dashboard가 주력 UI. TUI는 SSH 접속 시 경량 모니터링 용도.

### 2.10 Protocol (WS 메시지)

**버전**: v0.2.0

**Client → Gateway**: `connect`, `subscribe`, `unsubscribe`, `cancel`, `ping`
**Gateway → Client**: `connected`, `phase:change`, `agent:*`, `task:update`, `log`, `snapshot`, `runs:list`, `sessions:list`, `session:output/error/closed`, `context:*`, `pong`

**문제점**:
1. **단방향 중심** — 대부분 Gateway→Client 이벤트. 클라이언트의 RPC 호출 체계 부재.
2. **에이전트 메시지 부재** — "에이전트 명령", "에이전트 판단", "에이전트 보고" 메시지 타입 없음.
3. **OpenClaw 대비** — `send`, `agent`, `sessions.*`, `config.*` 같은 메서드 표면이 없음.

---

## 3. OpenClaw 벤치마킹 분석

### 3.1 OpenClaw 핵심 아키텍처

```
                    ┌─────────────────────────────┐
                    │      Gateway (단일 프로세스)  │
                    │                              │
                    │  WS + HTTP 멀티플렉스         │
                    │  제어면 소유                  │
                    │                              │
                    │  ┌──────────────────────┐   │
                    │  │  플러그인 레지스트리    │   │
                    │  │  • 채널 플러그인       │   │
                    │  │  • 툴 플러그인         │   │
                    │  │  • 핸들러 플러그인      │   │
                    │  └──────────────────────┘   │
                    │                              │
                    │  ┌──────────────────────┐   │
                    │  │  메모리 시스템         │   │
                    │  │  SQLite + vec + FTS   │   │
                    │  │  임베딩 (multi-provider)│   │
                    │  └──────────────────────┘   │
                    │                              │
                    │  ┌──────────────────────┐   │
                    │  │  에이전트 런타임       │   │
                    │  │  ack → stream → final │   │
                    │  └──────────────────────┘   │
                    └─────────────┬────────────────┘
                                  │
          ┌───────────────────────┼──────────────────────┐
          │                       │                      │
    ┌─────┴─────┐          ┌─────┴─────┐         ┌─────┴─────┐
    │  CLI      │          │  WebChat  │         │  노드 앱   │
    │  클라이언트 │          │  Control  │         │ macOS/iOS  │
    └───────────┘          └───────────┘         └───────────┘
```

### 3.2 Olympus가 배워야 할 것

| OpenClaw 기능 | 현재 Olympus 상태 | 벤치마킹 필요성 |
|--------------|------------------|---------------|
| **WS RPC 메서드 시스템** | REST API + WS 이벤트 분리 | **필수** — 단일 WS에서 RPC 호출 |
| **connect 핸드셰이크** (nonce challenge) | 단순 API Key 검증 | 중간 — 보안 강화 |
| **프로토콜 버전 협상** | 단순 버전 문자열 | 낮음 |
| **플러그인 런타임 레지스트리** | 하드코딩 | **필수** — 채널/기능 확장 |
| **에이전트 실행 패턴** (ack→stream→final) | 없음 | **필수** — Codex Agent 핵심 |
| **메모리 시스템** (SQLite+vec+FTS) | ContextStore (SQLite 기본) | 높음 — 에이전트 기억 |
| **채널 어댑터 다중화** | Telegram 하드코딩 | 중간 — 향후 확장 |
| **config migration + validation** | 단순 JSON | 중간 |
| **hot reload / restart 정책** | 없음 | 낮음 (초기) |
| **discovery / bonjour / tailscale** | 없음 | 낮음 |
| **pairing / allowlist** | Telegram allowedUsers만 | 중간 |
| **idempotency key dedupe** | 없음 | 중간 |
| **security audit CLI** | 없음 | 낮음 (초기) |
| **온보딩 위저드** | `olympus setup` (기본) | 중간 |

### 3.3 핵심 차용 포인트

1. **Gateway가 모든 제어를 소유** — 현재 Olympus의 Gateway는 "파이프라인"이지만, OpenClaw의 Gateway는 "제어면"이다. 이 패러다임 전환이 핵심.

2. **에이전트 실행 모델: ack → stream → final** — Codex Agent가 명령을 받으면:
   - `ack`: "명령 수신, 분석 중" (즉시)
   - `stream`: "워커 A 생성, 작업 진행 중..." (실시간)
   - `final`: "작업 완료. 결과: ..." (최종)

3. **플러그인 레지스트리** — Telegram을 "채널 플러그인"으로 분리하면, 향후 Slack/Discord/Web Chat 추가가 쉬워짐.

4. **메모리 시스템** — 에이전트가 과거 작업을 기억하고, 유사한 요청에 대해 학습된 패턴을 적용.

---

## 4. 목표 아키텍처 상세 설계

### 4.1 전체 구조

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Olympus Gateway v2                         │
│                    (단일 프로세스, 제어면 소유)                        │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────┐ │
│  │  WS Server        │  │  HTTP Server      │  │  Agent Runtime    │ │
│  │  • RPC 메서드     │  │  • REST API       │  │  • Agent Lifecycle│ │
│  │  • 이벤트 스트림   │  │  • Dashboard 서빙 │  │  • ack/stream/fin│ │
│  │  • 구독/발행      │  │  • Health/Status  │  │  • Worker Pool   │ │
│  └──────────────────┘  └──────────────────┘  └────────────────────┘ │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────┐ │
│  │  Channel Manager  │  │  Memory System   │  │  Session Manager  │ │
│  │  • Telegram 플러그│  │  • SQLite + FTS  │  │  • Worker Pool    │ │
│  │  • Dashboard 플러그│  │  • 작업 히스토리  │  │  • 프로세스 관리   │ │
│  │  • (확장 가능)    │  │  • 에이전트 기억  │  │  • 출력 스트리밍   │ │
│  └──────────────────┘  └──────────────────┘  └────────────────────┘ │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────────┐│
│  │                    Codex Agent (메인 에이전트)                     ││
│  │                                                                   ││
│  │  • 상시 실행 (Gateway 프로세스 내 또는 전용 프로세스)               ││
│  │  • 사용자 명령 수신 → 분석 → 계획 → 워커 위임 → 감시 → 보고      ││
│  │  • OpenAI Codex API / Claude API 직접 호출                       ││
│  │  • 상태 머신: IDLE → PLANNING → EXECUTING → REVIEWING → REPORTING││
│  └──────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
              ┌─────┴─────┐ ┌─────┴─────┐ ┌─────┴─────┐
              │  Worker 1  │ │  Worker 2  │ │  Worker N  │
              │            │ │            │ │            │
              │  방법 A:   │ │            │ │            │
              │  Claude CLI│ │            │ │            │
              │  (tmux)    │ │            │ │            │
              │            │ │            │ │            │
              │  방법 B:   │ │            │ │            │
              │  Claude API│ │            │ │            │
              │  (직접 호출)│ │            │ │            │
              │            │ │            │ │            │
              │  방법 C:   │ │            │ │            │
              │  Subprocess│ │            │ │            │
              │  (child_process)          │ │            │
              └───────────┘ └───────────┘ └───────────┘
```

### 4.2 Codex Agent — 핵심 설계

#### 4.2.1 Agent 상태 머신

```
                    ┌────────────┐
         ┌─────────│    IDLE     │←────────────────────────┐
         │         │  (대기 중)   │                         │
         │         └──────┬─────┘                          │
         │                │ 사용자 명령 수신                 │
         │                ▼                                │
         │         ┌────────────┐                          │
         │         │  ANALYZING  │                         │
         │         │  (명령 해석) │                         │
         │         └──────┬─────┘                          │
         │                │ 분석 완료                       │
         │                ▼                                │
         │         ┌────────────┐     거부/불명확           │
         │         │  PLANNING   │──────────────→ 사용자에게│
         │         │  (계획 수립) │     질문 전송    답변 대기│
         │         └──────┬─────┘                          │
         │                │ 계획 확정                       │
         │                ▼                                │
         │         ┌────────────┐                          │
         │         │  EXECUTING  │                         │
         │         │  (워커 실행) │ ←── 워커 실패 시 재시도   │
         │         └──────┬─────┘                          │
         │                │ 모든 워커 완료                   │
         │                ▼                                │
         │         ┌────────────┐                          │
         │         │  REVIEWING  │                         │
         │         │  (결과 검토) │                         │
         │         └──────┬─────┘                          │
         │                │ 검토 완료                       │
         │                ▼                                │
         │         ┌────────────┐                          │
         │         │  REPORTING  │──────────────────────────┘
         │         │  (결과 보고) │
         │         └────────────┘
         │
         │ 긴급 명령
         ▼
  ┌────────────┐
  │  INTERRUPT  │ → 현재 작업 중단 → IDLE
  └────────────┘
```

#### 4.2.2 Agent 핵심 인터페이스

```typescript
interface CodexAgent {
  // 상태
  state: AgentState;  // IDLE | ANALYZING | PLANNING | EXECUTING | REVIEWING | REPORTING
  currentTask: AgentTask | null;
  workers: Map<string, WorkerSession>;
  memory: AgentMemory;

  // 명령 수신
  handleCommand(command: UserCommand): Promise<AgentResponse>;

  // 내부 판단 (Codex API 호출)
  analyze(command: string): Promise<Analysis>;
  plan(analysis: Analysis): Promise<ExecutionPlan>;

  // 워커 관리
  createWorker(task: WorkerTask): Promise<WorkerSession>;
  monitorWorker(workerId: string): AsyncIterable<WorkerEvent>;
  terminateWorker(workerId: string): Promise<void>;

  // 결과 처리
  reviewResults(results: WorkerResult[]): Promise<ReviewReport>;
  reportToUser(report: ReviewReport): Promise<void>;
}

interface AgentTask {
  id: string;
  command: string;        // 원본 사용자 명령
  analysis: Analysis;     // 분석 결과
  plan: ExecutionPlan;    // 실행 계획
  workers: WorkerTask[];  // 하위 작업들
  status: AgentState;
  startedAt: number;
  completedAt?: number;
}

interface WorkerTask {
  id: string;
  type: 'coding' | 'documentation' | 'testing' | 'analysis';
  prompt: string;         // 워커에게 전달할 프롬프트
  projectPath: string;
  useOrchestration: boolean;  // /orchestration 사용 여부
  timeout: number;
  dependencies: string[]; // 선행 워커 ID
}

interface ExecutionPlan {
  strategy: string;       // "병렬 실행" | "순차 실행" | "단일 워커"
  workers: WorkerTask[];
  estimatedDuration: string;
  risks: string[];
  fallbackPlan: string;
}
```

#### 4.2.3 Codex Agent 구현 방식 — 3가지 옵션

**옵션 A: Gateway 프로세스 내 내장 (Recommended)**

```
Gateway 프로세스
├── WS/HTTP 서버
├── SessionManager
├── ChannelManager
└── CodexAgent  ← Gateway 내부 모듈
    ├── OpenAI API 직접 호출 (Codex/GPT-4o)
    ├── 워커 관리 (child_process 또는 tmux)
    └── 메모리 시스템 접근
```

- **장점**: 프로세스 간 통신 불필요, 즉시 반응, 단순 배포
- **단점**: Gateway 프로세스가 무거워짐, Agent 장애 시 Gateway도 영향
- **공수**: 중간 (새 모듈 추가)
- **리스크**: 낮음 (단일 프로세스 관리)
- **유지보수**: 쉬움

**옵션 B: 별도 프로세스 (Codex CLI in tmux)**

```
Gateway 프로세스
├── WS/HTTP 서버
├── SessionManager
└── AgentProxy  ← Codex Agent에 메시지 전달

Codex CLI 프로세스 (tmux "olympus-agent")
├── OpenAI Codex CLI
├── .codex.md에 에이전트 지침 설정
└── stdin/stdout으로 Gateway와 통신
```

- **장점**: 기존 tmux 패턴 재사용, Codex CLI 기능 활용
- **단점**: 프로세스 간 통신 복잡, Codex CLI 제어 불안정 (send-keys 기반)
- **공수**: 높음 (IPC 설계 필요)
- **리스크**: 높음 (tmux send-keys 불안정)
- **유지보수**: 어려움

**옵션 C: 하이브리드 (API 기반 Agent + tmux Workers)**

```
Gateway 프로세스
├── WS/HTTP 서버
├── SessionManager
└── CodexAgent  ← OpenAI API로 "두뇌" 역할
    ├── 판단: OpenAI API (Codex/GPT-4o) 직접 호출
    └── 실행: Claude CLI 워커 (tmux 또는 child_process)
```

- **장점**: 안정적 API 호출 + 검증된 Claude CLI 실행
- **단점**: API 비용 발생
- **공수**: 중간
- **리스크**: 낮음
- **유지보수**: 중간

**선택: 옵션 C (하이브리드)** — API 기반 판단 + 프로세스 기반 실행이 가장 안정적.

### 4.3 Worker 관리 — tmux vs child_process vs Claude API

#### 4.3.1 워커 실행 방식 비교

| 방식 | 장점 | 단점 | 적합한 경우 |
|------|------|------|------------|
| **tmux 세션** | 기존 코드 재사용, 사용자가 attach 가능, 시각적 확인 | send-keys 불안정, 구조화된 입출력 어려움 | 대화형 작업, 디버깅 |
| **child_process** | 정확한 stdin/stdout 제어, 구조화된 통신 가능 | 사용자가 실시간 확인 어려움 | 자동화된 작업, 배치 |
| **Claude API 직접** | 가장 안정적, 구조화된 응답, 도구 사용 가능 | Claude CLI의 파일 시스템 접근/터미널 기능 없음 | 분석, 계획, 리뷰 |

#### 4.3.2 권장 하이브리드 전략

```
Codex Agent의 "두뇌" = OpenAI API (판단/계획/리뷰)
│
├── 코딩 작업 → Claude CLI (child_process with pty)
│   • claude --trust -p "프로젝트경로" --message "작업지시"
│   • stdout/stderr 파이프로 실시간 모니터링
│   • 종료 코드로 성공/실패 판단
│
├── 분석/리뷰 → Claude API 직접 호출
│   • Anthropic SDK
│   • 구조화된 도구 사용 (file read, grep 등)
│
└── 대화형 디버깅 → tmux 세션 (기존 방식 유지)
    • 사용자가 직접 attach하여 개입 가능
    • 특수한 경우에만 사용
```

#### 4.3.3 Claude CLI 비대화형 실행 (핵심 혁신)

현재 문제: Claude CLI를 tmux에 띄우고 `send-keys`로 입력하는 방식은 불안정함.

해결: Claude CLI의 **비대화형 모드** 활용:

```bash
# 단일 명령 실행 (비대화형)
claude --trust -p /path/to/project --message "이 프로젝트의 테스트를 실행해줘"

# 파이프로 프롬프트 전달
echo "auth 모듈을 리팩토링해줘" | claude --trust -p /path/to/project

# JSON 출력 모드 (구조화된 결과)
claude --trust -p /path/to/project --message "..." --output-format json
```

이 방식이면:
- `child_process.spawn()`으로 정확하게 제어 가능
- stdout/stderr를 직접 파이프로 읽기 가능
- 종료 코드로 성공/실패 판단 가능
- tmux send-keys의 불안정성 제거

### 4.4 Gateway v2 — RPC 메서드 시스템

OpenClaw의 메서드 표면을 벤치마킹:

```typescript
// Gateway v2 메서드 목록
const METHODS = {
  // 시스템
  'health': {},
  'status': {},

  // 에이전트 (핵심 신규)
  'agent.command': { command: string },       // 사용자 명령 → Codex Agent
  'agent.status': {},                          // Agent 현재 상태
  'agent.cancel': { taskId?: string },         // 현재 작업 취소
  'agent.history': { limit?: number },         // 작업 히스토리

  // 워커
  'workers.list': {},                          // 활성 워커 목록
  'workers.create': { task: WorkerTask },      // 수동 워커 생성
  'workers.terminate': { workerId: string },   // 워커 종료
  'workers.output': { workerId: string },      // 워커 출력 조회

  // 세션 (기존 호환)
  'sessions.list': {},
  'sessions.connect': { tmuxSession: string },
  'sessions.input': { sessionId: string, input: string },
  'sessions.discover': {},

  // 작업/컨텍스트 (기존 유지)
  'tasks.list': {},
  'tasks.create': {},
  'tasks.update': {},
  'contexts.list': {},
  'contexts.get': {},

  // 설정
  'config.get': {},
  'config.update': {},
};
```

**WS RPC 프로토콜**:

```typescript
// 요청
{
  type: 'rpc',
  id: 'req-uuid',
  method: 'agent.command',
  payload: { command: 'console 프로젝트의 인증 모듈을 리팩토링해줘' }
}

// 응답 (ack)
{
  type: 'rpc:ack',
  id: 'req-uuid',
  payload: { taskId: 'task-123', message: '명령 수신, 분석 중...' }
}

// 스트림 이벤트
{
  type: 'agent:progress',
  payload: {
    taskId: 'task-123',
    state: 'EXECUTING',
    message: 'Worker 1 생성 완료, /orchestration 실행 중...',
    progress: 30
  }
}

// 최종 응답
{
  type: 'rpc:result',
  id: 'req-uuid',
  payload: {
    taskId: 'task-123',
    status: 'completed',
    summary: '인증 모듈 리팩토링 완료. 변경 파일 5개, 테스트 12/12 통과.',
    details: { ... }
  }
}
```

### 4.5 Channel Manager — 플러그인 기반 채널

```typescript
interface ChannelPlugin {
  name: string;           // 'telegram' | 'dashboard' | 'slack' | ...
  initialize(gateway: Gateway): Promise<void>;
  handleIncoming(message: ChannelMessage): Promise<void>;
  sendOutgoing(message: AgentMessage): Promise<void>;
  destroy(): Promise<void>;
}

interface ChannelMessage {
  channelType: string;
  senderId: string;
  content: string;
  metadata: Record<string, unknown>;  // 채널별 메타데이터
}

interface AgentMessage {
  type: 'text' | 'progress' | 'result' | 'error' | 'question';
  content: string;
  metadata: Record<string, unknown>;
}
```

**Telegram 채널 플러그인**:
```typescript
class TelegramChannel implements ChannelPlugin {
  // 기존 OlympusBot 로직을 채널 플러그인으로 리팩토링
  // 사용자 명령 → agent.command RPC 호출
  // 에이전트 응답 → Telegram 메시지 전송
}
```

**Dashboard 채널 플러그인**:
```typescript
class DashboardChannel implements ChannelPlugin {
  // WS 클라이언트의 agent.command → 에이전트로 전달
  // 에이전트 상태/결과 → WS로 브로드캐스트
}
```

### 4.6 Memory System — 에이전트 기억

```typescript
interface AgentMemory {
  // 작업 히스토리
  recordTask(task: CompletedTask): void;
  searchSimilarTasks(query: string): CompletedTask[];

  // 프로젝트 지식
  recordProjectInsight(project: string, insight: string): void;
  getProjectInsights(project: string): string[];

  // 학습 패턴
  recordPattern(pattern: LearningPattern): void;
  getRelevantPatterns(context: string): LearningPattern[];
}

interface CompletedTask {
  id: string;
  command: string;
  analysis: string;
  plan: string;
  result: string;
  success: boolean;
  duration: number;
  timestamp: number;
  projectPath: string;
}

interface LearningPattern {
  trigger: string;     // "빌드 실패 후 ..."
  action: string;      // "... 타입 에러부터 확인"
  confidence: number;  // 0-1
  usageCount: number;
}
```

---

## 5. 마이그레이션 전략

### 5.1 Phase 계획

```
Phase 1: 기반 (2-3일)
├── Gateway v2 RPC 메서드 시스템 구축
├── Agent Runtime 프레임워크
├── Worker Manager (child_process 기반)
└── 기존 REST API 호환 유지

Phase 2: Codex Agent 핵심 (3-5일)
├── Agent 상태 머신 구현
├── OpenAI API 통합 (판단/계획)
├── Claude CLI 비대화형 워커 실행
├── 워커 출력 모니터링 + 완료 감지
└── 결과 수집 + 요약

Phase 3: 채널 통합 (2-3일)
├── Channel Manager 플러그인 시스템
├── Telegram 채널 플러그인 (기존 봇 리팩토링)
├── Dashboard 채널 플러그인
└── 사용자 명령 → Agent 파이프라인

Phase 4: 고도화 (3-5일)
├── Memory System (SQLite + FTS)
├── /orchestration 자동 주입
├── 멀티 프로젝트 지원
├── 에이전트 학습 + 패턴 인식
└── Dashboard v2 UI (에이전트 상태 시각화)

Phase 5: 안정화 (2-3일)
├── 에러 복구 + 재시도 로직
├── 보안 강화 (인증, 권한)
├── 테스트 스위트 확장
└── 문서화
```

### 5.2 Phase별 세부 단계 및 검증 기준

#### Phase 1: 기반 (2-3일) — 상세

```yaml
Step 1.1: RPC 메서드 프레임워크
  파일:
    - packages/gateway/src/rpc/handler.ts     # RPC 라우터 (WS 메시지 → 핸들러 디스패치)
    - packages/gateway/src/rpc/methods.ts     # 메서드 등록 레지스트리
    - packages/gateway/src/rpc/types.ts       # RPC 요청/응답/에러 타입
  구현:
    - WS 메시지에 type: 'rpc' → RPC 라우터로 디스패치
    - 메서드별 핸들러 등록: methods.register('health', healthHandler)
    - 응답 패턴: rpc:ack (즉시) → rpc:result (최종) / rpc:error (실패)
    - 기존 REST API와 병행 (기존 클라이언트 깨지지 않음)
  검증 기준:
    - [ ] WS 클라이언트가 'health' RPC 호출 → 응답 수신
    - [ ] 존재하지 않는 메서드 호출 → rpc:error 응답
    - [ ] 기존 subscribe/unsubscribe 메시지 정상 동작

Step 1.2: Agent Runtime 프레임워크
  파일:
    - packages/gateway/src/agent/types.ts     # AgentState, AgentTask, WorkerTask 타입
    - packages/gateway/src/agent/agent.ts     # 상태 머신 스켈레톤 (IDLE → ... → REPORTING)
    - packages/gateway/src/agent/index.ts     # 모듈 진입점
  구현:
    - 상태 머신 구현 (각 상태의 진입/퇴출 로직)
    - Gateway.server.ts에 agent 인스턴스 바인딩
    - agent.command RPC 메서드 등록 (아직 실제 AI 호출 없음, 에코만)
  검증 기준:
    - [ ] agent.command('hello') → ack + result('echo: hello') 응답
    - [ ] agent.status → { state: 'IDLE' } 응답
    - [ ] 상태 전이 이벤트가 WS로 브로드캐스트

Step 1.3: Worker Manager 기초
  파일:
    - packages/gateway/src/workers/manager.ts     # WorkerPool
    - packages/gateway/src/workers/types.ts       # WorkerProcess, WorkerEvent 타입
    - packages/gateway/src/workers/claude-worker.ts # Claude CLI child_process 래퍼
    - packages/gateway/src/workers/index.ts       # 모듈 진입점
  구현:
    - child_process.spawn('claude', ['--trust', '-p', path, '--message', prompt])
    - stdout/stderr 파이프 읽기
    - 종료 코드 감지
    - maxConcurrent 제한 (기본 3)
  검증 기준:
    - [ ] 워커 생성 → Claude CLI 프로세스 시작 → stdout 수신
    - [ ] 워커 타임아웃 → SIGTERM → 정리
    - [ ] workers.list RPC → 활성 워커 목록 반환

Step 1.4: 프로토콜 확장
  파일:
    - packages/protocol/src/messages.ts       # RPC 메시지 타입 추가
    - packages/protocol/src/rpc.ts            # RPC 전용 타입 (신규)
    - packages/protocol/src/agent.ts          # Agent 전용 타입 (신규)
  구현:
    - RpcRequest, RpcAck, RpcResult, RpcError 타입
    - AgentState, AgentProgress, AgentReport 타입
    - WorkerStatus, WorkerOutput 타입
  검증 기준:
    - [ ] 기존 ClientMessage/ServerMessage 호환 유지
    - [ ] 새 타입이 gateway/client 양쪽에서 import 가능
    - [ ] tsc --noEmit 전 패키지 통과
```

#### Phase 2: Codex Agent 핵심 (3-5일) — 상세

```yaml
Step 2.1: 명령 분석기 (Analyzer)
  파일:
    - packages/gateway/src/agent/analyzer.ts
    - packages/gateway/src/agent/prompts.ts   # 시스템 프롬프트
  구현:
    - OpenAI API (gpt-4o) 호출로 사용자 명령 분석
    - tool_use로 구조화된 Analysis 객체 반환
    - 프로젝트 경로 자동 감지 (워크스페이스 내 프로젝트 매칭)
  검증 기준:
    - [ ] "console 인증 모듈 리팩토링" → intent:coding, complexity:complex, useOrchestration:true
    - [ ] "현재 빌드 상태 알려줘" → intent:question, complexity:simple
    - [ ] 잘못된 프로젝트명 → risks 배열에 경고 포함

Step 2.2: 실행 계획기 (Planner)
  파일:
    - packages/gateway/src/agent/planner.ts
  구현:
    - Analysis + Memory → ExecutionPlan 생성
    - 병렬/순차/파이프라인 전략 결정
    - 워커별 프롬프트 생성 (/orchestration 주입 포함)
  검증 기준:
    - [ ] complex 작업 → /orchestration 포함된 워커 프롬프트 생성
    - [ ] 의존성 있는 작업 → 순차 전략 선택
    - [ ] 독립 작업 2개 → 병렬 전략 선택

Step 2.3: 워커 실행 + 모니터링
  구현:
    - ClaudeCliWorker.start() → child_process.spawn()
    - stdout 실시간 파싱 → Digest 엔진으로 핵심 이벤트 추출
    - 빌드/테스트 결과 자동 감지 (기존 Digest 패턴 재활용)
    - 종료 코드 + 출력 분석 → 성공/실패 판정
  검증 기준:
    - [ ] 워커 실행 → stdout 실시간 스트리밍 → agent:progress 이벤트
    - [ ] 빌드 실패 감지 → 워커 상태 'failed' + 에러 출력 캡처
    - [ ] 타임아웃 → SIGTERM → 워커 정리 → 에이전트에 실패 보고

Step 2.4: 결과 검토기 (Reviewer)
  파일:
    - packages/gateway/src/agent/reviewer.ts
  구현:
    - 워커 출력 수집 → OpenAI API로 종합 판단
    - 성공/부분성공/실패 3단계 판정
    - 변경 파일 목록, 테스트 결과, 경고사항 구조화
  검증 기준:
    - [ ] 성공한 워커 → status:success + 요약 + 변경 파일 목록
    - [ ] 실패한 워커 → status:failed + 에러 원인 분석
    - [ ] 혼합 결과 → status:partial + 성공/실패 분리 보고

Step 2.5: 보고기 (Reporter)
  파일:
    - packages/gateway/src/agent/reporter.ts
  구현:
    - ReviewReport → 사용자 친화적 포맷 변환
    - Telegram용 (마크다운, 4000자 한계) / Dashboard용 (구조화 JSON) 분리
    - 아이콘 + 요약 + 상세 + 후속 작업 제안
  검증 기준:
    - [ ] Telegram 포맷: 4000자 이내, 마크다운, 아이콘 포함
    - [ ] Dashboard 포맷: JSON, 구조화된 필드
    - [ ] 후속 작업 제안 포함 (예: "API 문서 업데이트 권장")
```

#### Phase 3: 채널 통합 (2-3일) — 상세

```yaml
Step 3.1: Channel Manager 프레임워크
  파일:
    - packages/gateway/src/channels/manager.ts
    - packages/gateway/src/channels/types.ts
  구현:
    - ChannelPlugin 인터페이스 정의
    - 플러그인 등록/해제 레지스트리
    - 수신 메시지 → agent.command 라우팅
    - 에이전트 응답 → 채널별 포맷 변환 + 전송
  검증 기준:
    - [ ] 플러그인 등록 → 초기화 콜백 호출
    - [ ] 수신 메시지 → agent.command RPC 호출
    - [ ] 에이전트 응답 → 플러그인.sendOutgoing() 호출

Step 3.2: Telegram 채널 플러그인
  파일:
    - packages/gateway/src/channels/telegram.ts
  구현:
    - 기존 OlympusBot 코어 로직 마이그레이션
    - Telegraf 봇 인스턴스를 채널 플러그인으로 래핑
    - /sessions, /connect 등 기존 명령어 유지
    - 자연어 명령 → agent.command 라우팅 추가
    - Digest 시스템 유지 (워커 출력 요약)
  검증 기준:
    - [ ] 기존 /sessions 명령어 정상 동작
    - [ ] "console 인증 리팩토링" → Codex Agent로 전달 → 결과 보고
    - [ ] Digest 모드 유지 (/mode raw|digest)

Step 3.3: Dashboard 채널 플러그인
  파일:
    - packages/gateway/src/channels/dashboard.ts
  구현:
    - WS 클라이언트의 agent.command RPC → 에이전트 전달
    - 에이전트 상태/진행/결과 → WS 이벤트로 브로드캐스트
    - 명령 입력 UI용 엔드포인트
  검증 기준:
    - [ ] Dashboard에서 명령 입력 → 에이전트 실행 → 결과 표시
    - [ ] 에이전트 진행 상태 실시간 업데이트
```

#### Phase 4: 고도화 (3-5일) — 상세

```yaml
Step 4.1: Memory System
  파일:
    - packages/gateway/src/memory/store.ts
    - packages/gateway/src/memory/patterns.ts
  구현:
    - SQLite + FTS5 (full-text search)
    - 완료된 작업 히스토리 저장: command, analysis, plan, result, duration
    - 유사 작업 검색: FTS5 쿼리
    - 학습 패턴 저장: trigger → action, confidence, usageCount
  검증 기준:
    - [ ] 작업 완료 → 히스토리에 자동 기록
    - [ ] 유사 명령 → 과거 작업 검색 결과 반환
    - [ ] 학습 패턴 적용 → 계획 수립 시 참조

Step 4.2: /orchestration 자동 주입
  구현:
    - complex 작업의 워커 프롬프트에 /orchestration 자동 삽입
    - CLAUDE.md 컨텍스트 자동 주입 (프로젝트별)
    - 워커별 CLAUDE.md 동적 생성 (작업 범위에 맞게)
  검증 기준:
    - [ ] complex 코딩 작업 → /orchestration "..." 형태로 워커에 전달
    - [ ] 프로젝트 CLAUDE.md 존재 시 → 워커에 컨텍스트로 포함

Step 4.3: Dashboard v2 UI
  구현:
    - AgentPanel: 에이전트 상태 머신 시각화 (IDLE→...→REPORTING)
    - CommandInput: 자연어 명령 입력 UI
    - WorkerGrid: 워커별 상태 + 출력 미리보기
    - WorkerDetailModal: 워커 상세 출력 확인
    - TaskTimeline: 작업 히스토리 타임라인
  검증 기준:
    - [ ] 에이전트 상태 전이 실시간 반영
    - [ ] 명령 입력 → 에이전트 실행 → 진행 표시 → 결과 표시
    - [ ] 워커 클릭 → 상세 출력 모달

Step 4.4: 멀티 프로젝트 지원
  구현:
    - 프로젝트 레지스트리: 워크스페이스 내 프로젝트 자동 탐색
    - 명령에서 프로젝트명 추출 → 해당 경로의 워커 생성
    - 프로젝트 간 의존성 인식 (모노레포 패키지)
  검증 기준:
    - [ ] "console API 빌드" → /Users/jobc/dev/console 경로 워커 생성
    - [ ] "olympus gateway 테스트" → packages/gateway 경로 워커 생성
```

### 5.2 패키지 구조 변경

```
packages/
├── protocol/         # v2 프로토콜 (RPC 메서드 추가)
├── core/             # 공통 유틸 (기존 유지)
├── gateway/          # Gateway v2 (RPC + Agent Runtime + Channel Manager)
│   ├── src/
│   │   ├── server.ts           # Gateway 메인 (RPC 핸들러 추가)
│   │   ├── agent/              # ← 신규: Codex Agent
│   │   │   ├── agent.ts        # Agent 상태 머신
│   │   │   ├── analyzer.ts     # 명령 분석
│   │   │   ├── planner.ts      # 실행 계획
│   │   │   ├── reviewer.ts     # 결과 검토
│   │   │   └── reporter.ts     # 보고서 생성
│   │   ├── workers/            # ← 신규: Worker Manager
│   │   │   ├── manager.ts      # Worker Pool
│   │   │   ├── claude-worker.ts # Claude CLI 워커
│   │   │   ├── api-worker.ts   # API 기반 워커
│   │   │   └── tmux-worker.ts  # tmux 워커 (하위 호환)
│   │   ├── channels/           # ← 신규: Channel Manager
│   │   │   ├── manager.ts      # 채널 플러그인 레지스트리
│   │   │   ├── telegram.ts     # Telegram 플러그인
│   │   │   └── dashboard.ts    # Dashboard 플러그인
│   │   ├── memory/             # ← 신규: Memory System
│   │   │   ├── store.ts        # SQLite + FTS
│   │   │   └── patterns.ts     # 학습 패턴
│   │   ├── rpc/                # ← 신규: RPC 시스템
│   │   │   ├── handler.ts      # RPC 라우터
│   │   │   └── methods.ts      # 메서드 정의
│   │   ├── session-manager.ts  # 기존 유지 (하위 호환)
│   │   ├── run-manager.ts      # 기존 유지
│   │   ├── api.ts              # 기존 REST API (하위 호환)
│   │   └── auth.ts             # 인증
│   └── ...
├── cli/              # CLI (기존 유지 + agent 명령 추가)
├── client/           # 클라이언트 (RPC 메서드 추가)
├── web/              # Dashboard v2 (에이전트 UI 추가)
└── telegram-bot/     # → channels/telegram.ts로 이전 (독립 패키지 폐기)
```

### 5.3 하위 호환성 전략

1. **기존 REST API 유지** — `/api/sessions/*`, `/api/tasks/*` 그대로 동작
2. **기존 WS 프로토콜 유지** — `connect`, `subscribe`, `session:output` 등 그대로
3. **신규 RPC 메서드 추가** — 기존과 병행. 클라이언트가 점진적으로 마이그레이션
4. **tmux 세션 방식 유지** — Codex Agent가 tmux 워커도 사용 가능 (하위 호환)
5. **Telegram 봇 명령어 유지** — 기존 `/sessions`, `/connect` 등 유지. 신규 자연어 명령 추가

---

## 6. Codex Agent 상세 설계

### 6.1 명령 분석 (Analyzer)

```typescript
class CommandAnalyzer {
  /**
   * 사용자 자연어 명령을 분석하여 구조화된 작업으로 변환
   */
  async analyze(command: string, context: AgentContext): Promise<Analysis> {
    // OpenAI API 호출 (Codex 또는 GPT-4o)
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',  // 또는 codex
      messages: [
        { role: 'system', content: ANALYZER_SYSTEM_PROMPT },
        { role: 'user', content: command },
      ],
      tools: [
        { type: 'function', function: analyzeCommandSchema },
      ],
    });

    return parseAnalysis(response);
  }
}

interface Analysis {
  intent: 'coding' | 'documentation' | 'testing' | 'debugging' | 'analysis' | 'question';
  complexity: 'simple' | 'moderate' | 'complex';
  targetProject: string;
  targetFiles: string[];
  requirements: string[];
  useOrchestration: boolean;  // complex일 때 true
  suggestedApproach: string;
  risks: string[];
  estimatedDuration: string;
}
```

### 6.2 실행 계획 (Planner)

```typescript
class ExecutionPlanner {
  /**
   * 분석 결과를 기반으로 워커 실행 계획 수립
   */
  async plan(analysis: Analysis, memory: AgentMemory): Promise<ExecutionPlan> {
    // 유사 작업 히스토리 검색
    const similar = memory.searchSimilarTasks(analysis.requirements.join(' '));

    // 학습된 패턴 적용
    const patterns = memory.getRelevantPatterns(analysis.intent);

    // 계획 수립 (OpenAI API)
    const plan = await this.createPlan(analysis, similar, patterns);

    return plan;
  }
}

interface ExecutionPlan {
  strategy: 'single' | 'parallel' | 'sequential' | 'pipeline';
  workers: WorkerPlan[];
  checkpoints: string[];        // 중간 검증 시점
  rollbackStrategy: string;
  totalEstimate: string;
}

interface WorkerPlan {
  id: string;
  type: 'claude-cli' | 'claude-api' | 'tmux';
  prompt: string;               // 워커에게 전달할 전체 프롬프트
  projectPath: string;
  dependencies: string[];       // 선행 워커
  timeout: number;
  orchestration: boolean;       // /orchestration 사용 여부
  successCriteria: string[];    // 성공 판단 기준
}
```

### 6.3 워커 실행 (Worker Manager)

```typescript
class WorkerManager {
  private workers = new Map<string, WorkerProcess>();
  private maxConcurrent = 3;

  /**
   * Claude CLI 워커 생성 및 실행
   */
  async createClaudeWorker(plan: WorkerPlan): Promise<WorkerProcess> {
    const worker = new ClaudeCliWorker(plan);
    await worker.start();
    this.workers.set(plan.id, worker);
    return worker;
  }
}

class ClaudeCliWorker {
  private process: ChildProcess | null = null;
  private output = '';
  private status: 'pending' | 'running' | 'completed' | 'failed' = 'pending';

  async start(): Promise<void> {
    const claudePath = await which('claude');

    // Claude CLI 비대화형 실행
    this.process = spawn(claudePath, [
      '--trust',
      '-p', this.plan.projectPath,
      '--message', this.buildPrompt(),
      // '--output-format', 'json',  // 구조화된 출력 (가능할 경우)
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CLAUDE_NO_INTERACTIVE: '1' },
    });

    // stdout 실시간 스트리밍
    this.process.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      this.output += text;
      this.emit('output', text);
    });

    // stderr 모니터링
    this.process.stderr.on('data', (chunk) => {
      this.emit('error', chunk.toString());
    });

    // 완료 감지
    this.process.on('close', (code) => {
      this.status = code === 0 ? 'completed' : 'failed';
      this.emit('done', { code, output: this.output });
    });

    // 타임아웃
    setTimeout(() => {
      if (this.status === 'running') {
        this.process?.kill('SIGTERM');
        this.status = 'failed';
        this.emit('timeout');
      }
    }, this.plan.timeout);

    this.status = 'running';
  }

  private buildPrompt(): string {
    let prompt = this.plan.prompt;

    // /orchestration 주입
    if (this.plan.orchestration) {
      prompt = `/orchestration "${prompt}"`;
    }

    return prompt;
  }
}
```

### 6.4 결과 검토 (Reviewer)

```typescript
class ResultReviewer {
  /**
   * 워커 결과를 검토하여 성공/실패/부분성공 판정
   */
  async review(workers: WorkerResult[]): Promise<ReviewReport> {
    // 각 워커 출력에서 핵심 결과 추출
    const summaries = workers.map(w => this.extractSummary(w));

    // OpenAI API로 종합 판단
    const judgment = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: REVIEWER_SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(summaries) },
      ],
    });

    return this.parseJudgment(judgment, workers);
  }

  private extractSummary(worker: WorkerResult): string {
    // 빌드 결과, 테스트 결과, 에러, 변경 파일 등 추출
    // 기존 Digest 엔진의 패턴 매칭 재활용
    return digestEngine.process(worker.output);
  }
}

interface ReviewReport {
  status: 'success' | 'partial' | 'failed';
  summary: string;          // 한 줄 요약
  details: string;          // 상세 보고
  changedFiles: string[];   // 변경된 파일 목록
  testResults: string;      // 테스트 결과
  warnings: string[];       // 경고사항
  nextSteps: string[];      // 후속 작업 제안
}
```

### 6.5 사용자 보고 (Reporter)

```typescript
class AgentReporter {
  /**
   * 결과를 사용자 친화적 형식으로 변환하여 채널로 전송
   */
  async report(review: ReviewReport, channel: ChannelPlugin): Promise<void> {
    const message = this.formatReport(review);
    await channel.sendOutgoing({
      type: 'result',
      content: message,
      metadata: {
        taskId: review.taskId,
        status: review.status,
      },
    });
  }

  private formatReport(review: ReviewReport): string {
    const icon = review.status === 'success' ? '✅' :
                 review.status === 'partial' ? '⚠️' : '❌';

    return [
      `${icon} **작업 완료**`,
      '',
      review.summary,
      '',
      review.details,
      '',
      review.changedFiles.length > 0
        ? `📁 변경 파일 (${review.changedFiles.length}개):\n${review.changedFiles.map(f => `  • ${f}`).join('\n')}`
        : '',
      '',
      review.testResults || '',
      '',
      review.warnings.length > 0
        ? `⚠️ 경고:\n${review.warnings.map(w => `  • ${w}`).join('\n')}`
        : '',
      '',
      review.nextSteps.length > 0
        ? `📋 후속 작업:\n${review.nextSteps.map(s => `  • ${s}`).join('\n')}`
        : '',
    ].filter(Boolean).join('\n');
  }
}
```

---

## 7. 사용 시나리오

### 7.1 시나리오 1: 코딩 작업

```
사용자 (Telegram): "console 프로젝트에 결제 모듈 추가해줘"

Codex Agent (ANALYZING):
→ API 호출: intent=coding, complexity=complex, useOrchestration=true
→ 사용자에게: "명령 수신. 분석 중..."

Codex Agent (PLANNING):
→ 유사 작업 검색: console 프로젝트 Feature 추가 패턴 발견
→ 계획 수립: Worker 1개, /orchestration 모드
→ 사용자에게: "결제 모듈 추가 계획 수립 완료. Worker 1개 생성합니다."

Codex Agent (EXECUTING):
→ Worker 생성: claude --trust -p /Users/jobc/dev/console --message '/orchestration "결제 모듈 추가..."'
→ Worker 출력 스트리밍 → Digest → 사용자에게 진행상황 중계
→ 사용자에게: "Phase 0 완료... Phase 1 진행 중... (30%)"

Codex Agent (REVIEWING):
→ Worker 완료 감지
→ 출력 분석: 빌드 성공, 테스트 12/12 통과, 변경 파일 8개
→ 사용자에게: "결과 검토 중..."

Codex Agent (REPORTING):
→ 사용자에게:
  "✅ 결제 모듈 추가 완료
   • 변경 파일 8개 (payment.module.ts, payment.service.ts, ...)
   • 테스트 12/12 통과
   • 빌드 성공
   • 후속 작업: API 문서 업데이트 권장"
```

### 7.2 시나리오 2: 멀티 워커 병렬 실행

```
사용자: "olympus gateway의 테스트 커버리지를 올려줘. 동시에 README도 업데이트해줘."

Codex Agent (PLANNING):
→ 계획: Worker 2개 병렬
  - Worker 1: 테스트 작성 (coding, /orchestration)
  - Worker 2: README 업데이트 (documentation, 단순)

Codex Agent (EXECUTING):
→ Worker 1 시작: claude --trust -p .../gateway --message '/orchestration "테스트 커버리지 개선"'
→ Worker 2 시작: claude --trust -p .../olympus --message "README.md 업데이트: 현재 기능 반영"
→ 병렬 모니터링

Worker 2 먼저 완료 (문서 작업은 빠름)
→ 사용자에게: "📝 README 업데이트 완료 (Worker 2/2)"

Worker 1 완료 (테스트 작성)
→ 사용자에게: "🧪 테스트 커버리지 개선 완료 (Worker 1/2)"

Codex Agent (REPORTING):
→ 종합 보고
```

### 7.3 시나리오 3: 에러 복구

```
사용자: "dearwell-user-next에 다크 모드 추가"

Worker 실행 중 빌드 실패 감지...

Codex Agent:
→ 워커 출력 분석: TypeScript 타입 에러 3건
→ 자동 재시도 결정: "단순 타입 에러, 워커에 수정 지시"
→ 기존 워커에 추가 입력: "빌드 에러 3건 수정해줘: ..."
→ (또는 새 워커 생성하여 수정)

재시도 후 성공:
→ 사용자에게: "⚠️ 첫 시도에서 타입 에러 발생, 자동 수정 후 성공"
```

---

## 8. 기술적 결정 사항 (Trade-offs)

### 8.1 Codex Agent의 "두뇌" — OpenAI API vs Codex CLI vs Claude API

| 옵션 | 공수 | 안정성 | 비용 | 유연성 |
|------|------|--------|------|--------|
| **OpenAI API (GPT-4o)** | 낮음 | 높음 | 높음 | 높음 |
| **Codex CLI** | 높음 | 낮음 (tmux 기반) | 낮음 | 낮음 |
| **Claude API** | 낮음 | 높음 | 높음 | 높음 |
| **로컬 LLM** | 매우 높음 | 중간 | 없음 | 중간 |

**결정**: OpenAI API (GPT-4o) 또는 Claude API. 사용자 설정으로 선택 가능하게.
**근거**: API 기반이 가장 안정적이고, 도구 사용(tool use)으로 구조화된 판단 가능.

### 8.2 워커 실행 — child_process vs tmux vs Docker

| 옵션 | 공수 | 격리 | 관찰성 | 안정성 |
|------|------|------|--------|--------|
| **child_process (pty)** | 낮음 | 낮음 | 높음 (stdout) | 높음 |
| **tmux 세션** | 중간 | 낮음 | 중간 (pipe-pane) | 중간 |
| **Docker 컨테이너** | 높음 | 높음 | 중간 | 높음 |

**결정**: child_process (pty) 기본 + tmux 하위 호환.
**근거**: Claude CLI의 비대화형 모드가 child_process에 최적화. tmux는 디버깅 용도로 유지.

### 8.3 프로토콜 — 기존 확장 vs 완전 신규

**결정**: 기존 프로토콜 확장 (v0.3.0).
**근거**: 하위 호환성 유지. 기존 클라이언트가 깨지지 않으면서 RPC 메서드 추가.

### 8.4 Telegram 봇 — 독립 패키지 유지 vs Gateway 내 플러그인

**결정**: 우선 Gateway 내 플러그인으로 이전. 독립 패키지는 빈 re-export.
**근거**: 단일 프로세스에서 Agent와 직접 통신하는 것이 효율적. IPC 오버헤드 제거.

---

## 9. 리스크 매트릭스

| # | 리스크 | 심각도 | 확률 | 점수 | 완화 전략 |
|---|--------|--------|------|------|----------|
| 1 | Claude CLI 비대화형 모드 제한 | HIGH | MEDIUM | 8 | tmux 폴백, API 워커 대안 |
| 2 | OpenAI API 비용 증가 | MEDIUM | HIGH | 6 | 캐싱, 경량 모델 옵션, 로컬 LLM 지원 |
| 3 | Codex Agent 판단 오류 | HIGH | MEDIUM | 8 | 사용자 승인 모드, rollback 체크포인트 |
| 4 | 워커 무한 실행 (hang) | MEDIUM | MEDIUM | 4 | 타임아웃 + watchdog + 강제 종료 |
| 5 | 기존 기능 퇴행 | HIGH | LOW | 4 | 하위 호환성 테스트, 점진적 마이그레이션 |
| 6 | 보안 — API 키 노출 | HIGH | LOW | 4 | 환경변수, 키 로테이션, 권한 분리 |
| 7 | 멀티 프로젝트 경로 충돌 | MEDIUM | MEDIUM | 4 | 프로젝트별 워커 격리, 작업 디렉토리 잠금 |
| 8 | 컨텍스트 윈도우 초과 | MEDIUM | HIGH | 6 | 출력 요약, 점진적 전달, 분할 실행 |

---

## 10. 복잡도 매트릭스 (Phase -1)

```yaml
normalized_request:
  goal: "Olympus를 자율 AI 에이전트 플랫폼으로 전환. Codex Agent가 메인 세션에서 사용자 명령을 받아 Claude CLI 워커에 작업 위임."
  scope: "Gateway 전면 리팩토링 + Agent 모듈 신규 + Worker Manager 신규 + Channel Manager 신규 + Protocol v0.3.0 + Dashboard v2"
  constraints: "하위 호환성 유지, Claude CLI 비대화형 모드 의존, OpenAI API 비용"
  acceptance_criteria:
    - "Telegram에서 자연어 명령 → Codex Agent가 분석·계획·실행·보고"
    - "Claude CLI 워커가 /orchestration으로 코딩 작업 수행"
    - "워커 완료 시 자동 감지 + 결과 요약 + Telegram 보고"
    - "기존 수동 세션 관리 기능 하위 호환"
    - "Dashboard에서 Agent 상태 + Worker 진행 실시간 확인"

complexity_matrix:
  IMPACT: 5  # 전체 패키지 리팩토링, 새 모듈 5+개, 기존 패키지 변경
  CONTEXT: 4  # OpenAI API 의존, Claude CLI 비대화형 모드 활용
  LOGIC: 9   # AI 에이전트 상태 머신, 멀티 워커 관리, 결과 판정
  TOTAL: 18  # → Forced (Full Orchestration 필수)
```

---

## 11. 파일 변경 예상 목록

### 신규 파일 (~25개)
```
packages/gateway/src/agent/agent.ts            # Codex Agent 상태 머신
packages/gateway/src/agent/analyzer.ts         # 명령 분석
packages/gateway/src/agent/planner.ts          # 실행 계획
packages/gateway/src/agent/reviewer.ts         # 결과 검토
packages/gateway/src/agent/reporter.ts         # 사용자 보고
packages/gateway/src/agent/types.ts            # 에이전트 타입
packages/gateway/src/agent/prompts.ts          # LLM 시스템 프롬프트
packages/gateway/src/agent/index.ts            # 모듈 진입점
packages/gateway/src/workers/manager.ts        # Worker Pool
packages/gateway/src/workers/claude-worker.ts  # Claude CLI 워커
packages/gateway/src/workers/api-worker.ts     # API 기반 워커
packages/gateway/src/workers/tmux-worker.ts    # tmux 워커 (하위 호환)
packages/gateway/src/workers/types.ts          # 워커 타입
packages/gateway/src/workers/index.ts          # 모듈 진입점
packages/gateway/src/channels/manager.ts       # Channel Manager
packages/gateway/src/channels/telegram.ts      # Telegram 채널 플러그인
packages/gateway/src/channels/dashboard.ts     # Dashboard 채널 플러그인
packages/gateway/src/channels/types.ts         # 채널 타입
packages/gateway/src/channels/index.ts         # 모듈 진입점
packages/gateway/src/rpc/handler.ts            # RPC 라우터
packages/gateway/src/rpc/methods.ts            # 메서드 정의
packages/gateway/src/rpc/types.ts              # RPC 타입
packages/gateway/src/memory/store.ts           # 에이전트 메모리
packages/gateway/src/memory/patterns.ts        # 학습 패턴
packages/gateway/src/memory/index.ts           # 모듈 진입점
```

### 수정 파일 (~15개)
```
packages/protocol/src/messages.ts              # RPC 메시지 타입 추가
packages/protocol/src/index.ts                 # 신규 타입 export
packages/gateway/src/server.ts                 # RPC 핸들러, Agent 통합
packages/gateway/src/session-manager.ts        # Worker 연동
packages/gateway/src/api.ts                    # 에이전트 REST API 추가
packages/gateway/src/index.ts                  # 신규 모듈 export
packages/gateway/package.json                  # openai 의존성 추가
packages/client/src/client.ts                  # RPC 메서드 호출 추가
packages/web/src/App.tsx                       # Agent 상태 패널 추가
packages/web/src/components/AgentPanel.tsx      # 신규 컴포넌트
packages/cli/src/commands/server.ts            # Agent 시작 로직
packages/cli/src/commands/start.ts             # Worker 모드 옵션
packages/telegram-bot/src/index.ts             # 채널 플러그인 전환
```

### 삭제/이동 대상
```
packages/telegram-bot/ → packages/gateway/src/channels/telegram.ts로 이전
  (독립 패키지는 re-export 래퍼로 유지하여 하위 호환)
```

---

## 12. 성공 기준

1. **기능**: Telegram에서 "console 프로젝트 인증 모듈 리팩토링" 입력 → Codex가 계획 수립 → Claude CLI 워커 실행 → 완료 보고
2. **자율성**: 사용자 개입 없이 분석→계획→실행→검토→보고 완전 자동
3. **안정성**: 워커 실패 시 자동 재시도 또는 사용자 알림
4. **호환성**: 기존 수동 세션 관리, Telegram 명령어, Dashboard 모두 정상 동작
5. **관찰성**: Dashboard에서 Agent 상태, Worker 진행, 결과를 실시간 확인
6. **학습**: 반복 작업에서 패턴 학습, 유사 요청에 빠른 대응

---

## 13. 다음 단계

이 문서를 기반으로 `/orchestration --plan` 모드로 실제 구현 계획을 수립할 수 있습니다:

1. **Phase 0**: Contract 문서 작성 (이 문서를 기반으로 15 sections)
2. **Phase 1**: Feature Map 생성 (4개 Feature Set으로 분할)
3. **Phase 2**: Deep Review (아키텍처/코드/테스트/성능 4-Section)
4. **Phase 3**: Implementation Playbook + Pre-flight Checklist

---

---

## 14. 보안 모델

### 14.1 현재 보안 상태

| 영역 | 현재 | 위험도 |
|------|------|--------|
| **인증** | API Key 단일 비교 (`oly_xxx`) | 중간 |
| **전송** | 평문 HTTP/WS (로컬호스트) | 낮음 (로컬) |
| **Telegram** | allowedUsers 화이트리스트 | 높음 (숫자 ID만) |
| **워커 격리** | 없음 (같은 사용자 권한) | 높음 |
| **비밀 관리** | ~/.olympus/config.json 평문 | 중간 |
| **입력 검증** | execFileSync (shell injection 방지) | 낮음 |
| **출력 마스킹** | Digest의 redactSecrets() | 중간 |

### 14.2 v2.0 보안 강화 계획

**인증 계층화**:
```
Level 0: 로컬 접근 (localhost)
  → API Key 인증 (현재와 동일)

Level 1: 원격 접근 (Tailscale/SSH 터널)
  → API Key + HMAC 시그니처
  → 타임스탬프 기반 리플레이 방지

Level 2: Telegram 명령
  → allowedUsers + 명령 승인 모드
  → 파괴적 명령 (삭제, 푸시 등) → 사용자 확인 필수
```

**워커 격리**:
```
Level 0 (기본): 같은 사용자 권한
  → 프로젝트 디렉토리 범위만 접근 (chdir)

Level 1 (강화): 제한된 환경변수
  → API 키, 토큰 등 워커에 전달하지 않음
  → CLAUDE_NO_TELEMETRY=1

Level 2 (최대): Docker 컨테이너 (Phase 5+)
  → 파일 시스템 마운트 제한
  → 네트워크 접근 제한
```

**비밀 관리 개선**:
```typescript
// 현재: 평문 JSON
{ "apiKey": "oly_abc123...", "telegram": { "token": "123456:ABC..." } }

// v2.0: keychain 통합 (macOS) 또는 파일 권한 강화
// 최소: chmod 600 ~/.olympus/config.json
// 권장: macOS Keychain / Linux secret-tool
```

### 14.3 위협 모델

| 위협 | 경로 | 완화 |
|------|------|------|
| **API Key 유출** | config.json 노출 | 파일 권한, 키 로테이션 |
| **워커가 악의적 코드 실행** | Claude CLI가 시스템 명령 실행 | --trust 범위 제한, 감사 로깅 |
| **Telegram 스푸핑** | 허가되지 않은 사용자 명령 | allowedUsers + 명령 확인 |
| **LLM 프롬프트 주입** | 워커 프롬프트에 악의적 내용 삽입 | 입력 검증, 프롬프트 격리 |
| **DoS** | 무한 워커 생성 | maxConcurrent 제한, 타임아웃 |

---

## 15. 설정 스키마 (v2.0)

### 15.1 통합 설정 파일

```typescript
// ~/.olympus/config.json v2.0
interface OlympusConfig {
  // 기존 호환
  apiKey: string;                          // oly_xxx (자동 생성)
  gatewayUrl: string;                      // http://127.0.0.1:8200
  gatewayHost: string;
  gatewayPort: number;

  // Telegram (기존)
  telegram?: {
    token: string;
    allowedUsers: number[];
  };

  // 신규: Agent 설정
  agent: {
    enabled: boolean;                      // Codex Agent 활성화
    provider: 'openai' | 'anthropic';      // AI 제공자
    model: string;                         // 'gpt-4o' | 'claude-sonnet-4-5-20250929'
    apiKey: string;                        // OpenAI 또는 Anthropic API Key
    maxConcurrentWorkers: number;          // 기본 3
    defaultTimeout: number;                // 워커 기본 타임아웃 (ms, 기본 300000 = 5분)
    autoApprove: boolean;                  // 사용자 승인 없이 자동 실행
    orchestrationMode: 'auto' | 'always' | 'never';  // /orchestration 주입 정책
  };

  // 신규: Worker 설정
  workers: {
    type: 'child_process' | 'tmux' | 'docker';  // 워커 실행 방식
    claudePath?: string;                   // Claude CLI 경로 (자동 감지)
    logDir: string;                        // 워커 로그 디렉토리
    maxOutputBuffer: number;               // stdout 버퍼 한계 (bytes)
  };

  // 신규: Memory 설정
  memory: {
    enabled: boolean;
    dbPath: string;                        // SQLite DB 경로
    maxHistory: number;                    // 최대 히스토리 수
    embeddingProvider?: 'openai' | 'local'; // 벡터 검색용 (향후)
  };

  // 신규: 보안 설정
  security: {
    approvalRequired: string[];            // 승인 필요 명령 패턴
    blockedCommands: string[];             // 금지 명령 패턴
    maxWorkerDuration: number;             // 워커 최대 실행 시간 (ms)
  };

  // 신규: 프로젝트 레지스트리
  projects: {
    workspacePath: string;                 // 워크스페이스 루트
    registered: Array<{
      name: string;
      path: string;
      aliases: string[];                   // "console", "api", "web" 등
    }>;
  };
}
```

### 15.2 환경변수 오버라이드

```bash
OLYMPUS_GATEWAY_PORT=8200
OLYMPUS_GATEWAY_HOST=127.0.0.1
OLYMPUS_API_KEY=oly_xxx
OLYMPUS_AGENT_PROVIDER=openai
OLYMPUS_AGENT_MODEL=gpt-4o
OLYMPUS_AGENT_API_KEY=sk-xxx
OLYMPUS_WORKER_TYPE=child_process
OLYMPUS_WORKER_MAX_CONCURRENT=3
OLYMPUS_MEMORY_ENABLED=true
```

우선순위: 환경변수 > config.json > 기본값

### 15.3 Config Migration

```typescript
// 기존 v0.3.0 config → v2.0 config 자동 마이그레이션
function migrateConfig(old: OlympusConfigV1): OlympusConfigV2 {
  return {
    ...old,
    agent: {
      enabled: false,          // 기본 비활성화 (opt-in)
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: '',              // 사용자가 설정해야 함
      maxConcurrentWorkers: 3,
      defaultTimeout: 300_000,
      autoApprove: false,
      orchestrationMode: 'auto',
    },
    workers: {
      type: 'child_process',
      logDir: '~/.olympus/worker-logs',
      maxOutputBuffer: 10_000_000,
    },
    memory: { enabled: true, dbPath: '~/.olympus/memory.db', maxHistory: 1000 },
    security: { approvalRequired: [], blockedCommands: [], maxWorkerDuration: 600_000 },
    projects: { workspacePath: process.cwd(), registered: [] },
  };
}
```

---

## 16. Codex Agent 시스템 프롬프트 설계

### 16.1 Analyzer 시스템 프롬프트

```markdown
# System Prompt: Olympus Command Analyzer

당신은 소프트웨어 엔지니어링 작업 분석 전문가입니다.
사용자의 자연어 명령을 분석하여 구조화된 작업 명세로 변환합니다.

## 입력
- 사용자 명령 (자연어)
- 현재 프로젝트 목록 (이름, 경로, 기술 스택)
- 최근 작업 히스토리 (선택)

## 출력 (tool_use로 반환)
analyze_command({
  intent: "coding" | "documentation" | "testing" | "debugging" | "analysis" | "question",
  complexity: "simple" | "moderate" | "complex",
  targetProject: "프로젝트명",
  targetFiles: ["예상 파일 경로"],
  requirements: ["구체적 요구사항"],
  useOrchestration: boolean,  // complex이면 true
  suggestedApproach: "접근 방법 설명",
  risks: ["잠재적 위험"],
  estimatedDuration: "예상 소요 시간",
  needsConfirmation: boolean  // 파괴적 작업이면 true
})

## 판단 기준
- simple: 단일 파일 수정, 명확한 변경, 5분 이내
- moderate: 2-5개 파일, 로직 변경, 15분 이내
- complex: 6개+ 파일, 아키텍처 변경, /orchestration 필요

## 주의
- targetProject가 불명확하면 risks에 경고 추가
- 파괴적 작업 (삭제, 리셋, 푸시)은 needsConfirmation: true
- 프로젝트 목록에 없는 프로젝트명이면 가장 유사한 프로젝트 추천
```

### 16.2 Planner 시스템 프롬프트

```markdown
# System Prompt: Olympus Execution Planner

당신은 소프트웨어 엔지니어링 실행 계획 전문가입니다.
분석된 작업을 Claude CLI 워커로 실행할 계획을 수립합니다.

## 입력
- Analysis 결과
- 유사 과거 작업 (Memory에서 검색)
- 학습된 패턴

## 출력 (tool_use로 반환)
create_plan({
  strategy: "single" | "parallel" | "sequential" | "pipeline",
  workers: [{
    id: "worker-1",
    type: "claude-cli",
    prompt: "워커에게 전달할 전체 프롬프트",
    projectPath: "/absolute/path",
    dependencies: [],         // 선행 워커 ID
    timeout: 300000,
    orchestration: true,      // /orchestration 사용 여부
    successCriteria: ["빌드 성공", "테스트 통과"]
  }],
  checkpoints: ["Step 1 완료 후 빌드 확인"],
  rollbackStrategy: "git stash로 복원",
  estimatedDuration: "예상 소요 시간"
})

## 전략 선택 기준
- single: 단일 워커로 충분한 작업
- parallel: 독립적인 작업 2개 이상 (예: 코딩 + 문서)
- sequential: 의존성 있는 작업 (예: 코딩 → 테스트)
- pipeline: 단계별 검증이 필요한 복잡한 작업

## 워커 프롬프트 생성 규칙
- complex 작업: /orchestration "작업 설명" 형태
- moderate 작업: 직접 작업 지시 + 검증 요청
- 항상 포함: "작업 완료 후 빌드와 테스트를 실행하고 결과를 보고해주세요"
```

### 16.3 Reviewer 시스템 프롬프트

```markdown
# System Prompt: Olympus Result Reviewer

당신은 소프트웨어 엔지니어링 결과 검토 전문가입니다.
워커의 실행 결과를 분석하여 성공/실패를 판정합니다.

## 입력
- 워커별 실행 결과 (stdout, exitCode, duration)
- 원본 요구사항
- 성공 기준

## 출력 (tool_use로 반환)
review_result({
  status: "success" | "partial" | "failed",
  summary: "한 줄 요약",
  details: "상세 분석",
  changedFiles: ["변경된 파일 목록"],
  testResults: "테스트 결과 요약",
  buildStatus: "pass" | "fail" | "unknown",
  warnings: ["경고사항"],
  nextSteps: ["후속 작업 제안"],
  shouldRetry: boolean,
  retryReason: "재시도 사유 (shouldRetry=true일 때)"
})

## 판정 기준
- success: 모든 성공 기준 충족 + 빌드 성공 + 테스트 통과
- partial: 일부 성공 기준 충족 또는 경고 존재
- failed: 주요 성공 기준 미충족 또는 빌드/테스트 실패

## 재시도 판단
- 타입 에러 → shouldRetry: true (단순 수정 가능)
- 아키텍처 문제 → shouldRetry: false (접근 방식 재검토 필요)
- 타임아웃 → shouldRetry: true (한 번만, 타임아웃 2배)
```

---

## 17. Dashboard v2 UI 설계

### 17.1 레이아웃 변경

```
v1.0 (현재):
┌──────────┬────────────────────────┬──────────┐
│ Sessions │ Run/Session Display    │ Context  │
│ (좌측)   │ (중앙)                 │ + Logs   │
│          │                        │ (우측)   │
└──────────┴────────────────────────┴──────────┘

v2.0 (목표):
┌──────────┬────────────────────────┬──────────┐
│ Sessions │ Agent Command Center   │ Workers  │
│ + Agent  │ (중앙)                 │ + Logs   │
│ (좌측)   │                        │ (우측)   │
└──────────┴────────────────────────┴──────────┘
```

### 17.2 신규 컴포넌트

```
새로 추가할 컴포넌트:

AgentPanel.tsx          — 에이전트 상태 머신 시각화
  ├── 현재 상태 (IDLE/ANALYZING/PLANNING/EXECUTING/REVIEWING/REPORTING)
  ├── 상태 전이 애니메이션
  ├── 현재 작업 요약
  └── 경과 시간

CommandInput.tsx        — 자연어 명령 입력
  ├── 텍스트 입력 + 전송 버튼
  ├── 자동완성 (프로젝트명, 최근 명령)
  ├── 명령 히스토리 (↑↓)
  └── 진행 중 비활성화

WorkerGrid.tsx          — 워커 그리드 뷰
  ├── 워커별 카드 (상태, 프로젝트, 경과 시간, 진행률)
  ├── 실시간 출력 미리보기 (최근 3줄)
  ├── 클릭 → WorkerDetailModal
  └── 워커 종료 버튼

WorkerDetailModal.tsx   — 워커 상세 모달
  ├── 전체 stdout 출력 (스크롤, 검색)
  ├── 워커 메타데이터 (프롬프트, 프로젝트, 시작 시간)
  ├── 성공 기준 체크리스트
  └── 강제 종료 / 재시도 버튼

TaskTimeline.tsx        — 작업 히스토리 타임라인
  ├── 완료된 작업 목록 (시간순)
  ├── 각 작업의 요약 + 상태
  ├── 클릭 → 상세 결과 보기
  └── 검색 + 필터

AgentApprovalDialog.tsx — 사용자 승인 다이얼로그
  ├── 에이전트의 계획 표시
  ├── 승인 / 거부 / 수정 후 승인
  └── 자동 승인 옵션
```

### 17.3 상태 관리 변경

```typescript
// useOlympus.ts 확장
interface OlympusState {
  // 기존
  runs: RunStatus[];
  sessions: SessionInfo[];
  currentRunId: string | null;
  currentSessionId: string | null;

  // 신규
  agentState: AgentState;           // IDLE | ANALYZING | ...
  agentTask: AgentTask | null;      // 현재 작업
  workers: WorkerStatus[];          // 활성 워커 목록
  taskHistory: CompletedTask[];     // 완료 히스토리
  pendingApproval: ApprovalRequest | null;  // 승인 대기

  // 액션
  sendCommand(command: string): void;       // agent.command RPC
  approveTask(taskId: string): void;        // 승인
  rejectTask(taskId: string): void;         // 거부
  terminateWorker(workerId: string): void;  // 워커 종료
}
```

---

## 18. 테스트 전략

### 18.1 테스트 레벨

```
Level 1: 단위 테스트 (vitest)
├── agent/analyzer.test.ts    — 명령 분석 결과 검증
├── agent/planner.test.ts     — 실행 계획 생성 검증
├── agent/reviewer.test.ts    — 결과 판정 검증
├── workers/manager.test.ts   — 워커 풀 관리
├── rpc/handler.test.ts       — RPC 라우팅
├── channels/manager.test.ts  — 채널 등록/해제
└── memory/store.test.ts      — 히스토리 저장/검색

Level 2: 통합 테스트 (vitest)
├── agent-workflow.test.ts    — 전체 에이전트 워크플로우 (Mock API)
├── worker-lifecycle.test.ts  — 워커 생성→실행→완료→정리
├── rpc-roundtrip.test.ts     — WS RPC 요청→응답 왕복
├── channel-routing.test.ts   — 채널→에이전트→채널 라우팅
└── memory-search.test.ts     — FTS5 검색 정확도

Level 3: E2E 테스트 (tmux + qa-tester 에이전트)
├── telegram-command.test.ts  — Telegram에서 명령 → 결과 수신
├── dashboard-command.test.ts — Dashboard에서 명령 → UI 업데이트
├── multi-worker.test.ts      — 병렬 워커 실행 + 결과 수집
└── error-recovery.test.ts    — 워커 실패 → 재시도 → 보고
```

### 18.2 Mock 전략

```typescript
// AI API Mock (단위/통합 테스트용)
class MockOpenAI {
  // 미리 정의된 분석/계획/검토 결과 반환
  chat.completions.create(params): Promise<MockResponse> {
    // params.messages 기반으로 미리 정의된 응답 매칭
  }
}

// Claude CLI Mock (워커 테스트용)
class MockClaudeProcess {
  // child_process.spawn 대신 사용
  // 미리 정의된 stdout 출력 + exitCode 반환
  stdout: Readable;  // "✅ 빌드 성공\n테스트 12/12 통과" 같은 출력
  exitCode: 0;
}

// Telegram Mock (채널 테스트용)
class MockTelegraf {
  sentMessages: Array<{ chatId: number; text: string }>;
  simulateMessage(chatId: number, text: string): void;
}
```

### 18.3 테스트 데이터

```typescript
// 표준 테스트 시나리오
const TEST_SCENARIOS = {
  simpleCoding: {
    command: "gateway의 health 엔드포인트에 uptime 추가해줘",
    expectedAnalysis: { intent: 'coding', complexity: 'simple', useOrchestration: false },
    expectedPlan: { strategy: 'single', workers: 1 },
  },
  complexRefactor: {
    command: "console 프로젝트의 인증 모듈을 Keycloak에서 NextAuth로 마이그레이션",
    expectedAnalysis: { intent: 'coding', complexity: 'complex', useOrchestration: true },
    expectedPlan: { strategy: 'sequential', workers: 2 },
  },
  parallelTasks: {
    command: "olympus gateway 테스트 추가하고 동시에 README 업데이트",
    expectedAnalysis: { intent: 'coding', complexity: 'moderate' },
    expectedPlan: { strategy: 'parallel', workers: 2 },
  },
  question: {
    command: "현재 빌드 상태가 어때?",
    expectedAnalysis: { intent: 'question', complexity: 'simple', useOrchestration: false },
    expectedPlan: { strategy: 'single', workers: 0 }, // API 직접 응답
  },
};
```

---

## 19. 데이터 흐름 시퀀스 다이어그램

### 19.1 명령 실행 전체 흐름

```
사용자                 Telegram           Gateway           Codex Agent        Worker
  │                      │                  │                   │                │
  │ "인증 리팩토링"       │                  │                   │                │
  │─────────────────────→│                  │                   │                │
  │                      │ agent.command    │                   │                │
  │                      │─────────────────→│                   │                │
  │                      │                  │ dispatch          │                │
  │                      │                  │──────────────────→│                │
  │                      │                  │                   │                │
  │                      │                  │ agent:progress    │ analyze()      │
  │                      │←─────────────────│←──────────────────│                │
  │ "분석 중..."         │                  │                   │                │
  │←─────────────────────│                  │                   │                │
  │                      │                  │                   │ plan()         │
  │                      │                  │ agent:progress    │                │
  │ "계획 수립 완료"     │←─────────────────│←──────────────────│                │
  │←─────────────────────│                  │                   │                │
  │                      │                  │                   │ createWorker() │
  │                      │                  │                   │───────────────→│
  │                      │                  │                   │                │ claude --trust
  │                      │                  │                   │                │ -p /path
  │                      │                  │ worker:output     │ monitor()      │ --message "..."
  │ "[30%] 코딩 중..."   │←─────────────────│←──────────────────│←───────────────│
  │←─────────────────────│                  │                   │                │
  │                      │                  │                   │                │ exit 0
  │                      │                  │ worker:done       │                │
  │                      │                  │──────────────────→│ review()       │
  │                      │                  │                   │                │
  │                      │                  │ agent:progress    │                │
  │ "검토 중..."         │←─────────────────│←──────────────────│                │
  │←─────────────────────│                  │                   │                │
  │                      │                  │                   │ report()       │
  │                      │                  │ agent:result      │                │
  │ "✅ 완료: 파일 5개"  │←─────────────────│←──────────────────│                │
  │←─────────────────────│                  │                   │                │
```

### 19.2 워커 실패 → 재시도 흐름

```
Codex Agent           Worker 1            Worker 1 (재시도)
  │                      │                      │
  │ createWorker()       │                      │
  │─────────────────────→│                      │
  │                      │ claude --trust ...    │
  │ monitor()            │                      │
  │←─────────────────────│ stdout: "빌드 실패"  │
  │                      │ exit 1               │
  │                      │                      │
  │ review(output)       │                      │
  │ → "타입 에러 3건,    │                      │
  │    shouldRetry: true"│                      │
  │                      │                      │
  │ createWorker(retry)  │                      │
  │──────────────────────│─────────────────────→│
  │                      │                      │ claude --trust ...
  │ monitor()            │                      │ "이전 에러 수정: ..."
  │←─────────────────────│──────────────────────│ stdout: "빌드 성공"
  │                      │                      │ exit 0
  │                      │                      │
  │ review(output)       │                      │
  │ → "success"          │                      │
  │                      │                      │
  │ report() → 사용자    │                      │
  │ "⚠️ 첫 시도 실패,   │                      │
  │  자동 수정 후 성공"  │                      │
```

### 19.3 병렬 워커 실행 흐름

```
Codex Agent     Worker 1 (코딩)     Worker 2 (문서)
  │                  │                    │
  │ strategy: parallel                    │
  │ createWorker(1)  │                    │
  │─────────────────→│                    │
  │ createWorker(2)  │                    │
  │──────────────────│───────────────────→│
  │                  │ coding...          │ docs...
  │ monitor(1,2)     │                    │
  │←─────────────────│                    │
  │←─────────────────│───────────────────←│ exit 0 (먼저 완료)
  │                  │                    │
  │ partial report:  │                    │
  │ "📝 문서 완료"   │                    │
  │                  │ exit 0             │
  │←─────────────────│                    │
  │                  │                    │
  │ all done → review() → report()       │
  │ "✅ 코딩 + 문서 모두 완료"            │
```

---

## 20. 용어 사전

| 용어 | 정의 |
|------|------|
| **Codex Agent** | Gateway 내에서 상시 실행되는 AI 판단 엔진. OpenAI/Claude API를 호출하여 사용자 명령을 분석하고 워커를 관리한다. |
| **Worker** | Codex Agent가 생성하는 Claude CLI 프로세스. 실제 코딩/테스트/문서 작업을 수행한다. |
| **RPC 메서드** | WS를 통한 요청-응답 패턴. 클라이언트가 메서드를 호출하고 Gateway가 응답한다. |
| **Channel Plugin** | Telegram, Dashboard 등 사용자 접점을 추상화하는 플러그인 인터페이스. |
| **Agent Runtime** | Codex Agent의 상태 머신과 워커 관리를 포함하는 실행 환경. |
| **Memory System** | SQLite 기반 에이전트 작업 히스토리 및 학습 패턴 저장소. |
| **Digest** | 텔레그램 봇의 출력 요약 시스템. 패턴 매칭으로 핵심 정보만 추출한다. |
| **Control Plane** | Gateway가 소유하는 WS/HTTP 제어면. 모든 클라이언트가 이 제어면에 접속한다. |
| **Materialized Path** | 태스크 계층을 `/root/phase1/task3` 형태의 경로로 표현하는 최적화 기법. |
| **Context OS** | 3-Layer (Workspace → Project → Task) 컨텍스트 관리 시스템. |
| **OlympusBus** | run-scoped 이벤트 버스. phase:change, agent:*, task:update, log 이벤트를 전파한다. |
| **pipe-pane** | tmux의 출력 리디렉션 기능. 세션 출력을 파일로 추출한다. |
| **Orchestration** | /orchestration 프로토콜 (v5.3). 10단계 AI 오케스트레이션 워크플로우. |

---

*이 문서는 Olympus v2.0 대격변의 청사진입니다. 실제 구현은 `/orchestration` 프로토콜을 통해 체계적으로 진행됩니다.*
