# Olympus V2 아키텍처 가이드

## 1. 시스템 개요

**Olympus V2**는 Claude CLI 세션 모니터에서 출발하여 자율 AI 에이전트 플랫폼으로 진화한 시스템입니다.

### 핵심 비전
- 사용자 명령 → 자동 분석 → 실행 계획 수립 → 자율 실행 → 결과 검토 → 보고
- 다중 채널 지원 (Telegram, Dashboard, TUI, CLI)
- 자동 학습을 통한 지속적 개선
- 강력한 보안 정책 및 승인 흐름

### 현재 상태 (v0.4.0)
- 9개 통합 패키지 (protocol, core, gateway, cli, client, tui, web, telegram-bot, codex)
- 483/483 테스트 통과 (gateway 329 + codex 103 + telegram 51)
- 프로덕션 준비 완료 (v5.3 Deep Engineering Protocol)
- V2 전체 완료 — 88개 이슈 전부 구현
- V3 Codex Orchestrator 구현 완료 (Phase 1-3)
- Orchestrator 파이프라인 개선 — 세션 명명, 자동승인, 노이즈 필터링

---

## 2. 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────────────┐
│                      Client Layer (4개 채널)                    │
├──────────────┬──────────────┬──────────────┬────────────────────┤
│  Telegram    │  Dashboard   │     TUI      │        CLI         │
│   Bot        │   Web UI     │   Terminal   │    Commands        │
│  (디지털     │  (브라우저   │   (Ink/     │    (Node.js)        │
│   신호)      │   접근)      │    React)    │                    │
└──────────────┴──────────────┴──────────────┴────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                        Gateway (코어)                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐                   │
│  │  RPC Router     │───→│  CodexAgent     │                   │
│  │ (JSON-RPC 2.0   │    │  (상태머신)     │                   │
│  │   over WS)      │    │  IDLE ─→ ANALYZING                  │
│  └─────────────────┘    │      ↓                               │
│         ↑                │  ANALYZING ─→ PLANNING              │
│         │                │      ↓                               │
│  ┌──────┴─────────┐     │  PLANNING ─→ EXECUTING              │
│  │ChannelManager  │     │      ↓                               │
│  │                │     │  EXECUTING ─→ REVIEWING             │
│  │ • Dashboard    │     │      ↓                               │
│  │ • Telegram     │     │  REVIEWING ─→ REPORTING             │
│  │ • Custom       │     │      ↓                               │
│  └────────────────┘     │  REPORTING ─→ IDLE                  │
│                         └─────────────────┘                   │
│                                 ↓                              │
│  ┌─────────────────┐    ┌──────────────────────────┐          │
│  │ WorkerManager   │←───│ CommandQueue             │          │
│  │ (4 타입+FIFO큐) │    │ SecurityGuard            │          │
│  │                 │    │ PatternManager           │          │
│  │ • ClaudeWorker  │    │ Memory Store (SQLite)    │          │
│  │ • ApiWorker     │    └──────────────────────────┘          │
│  │ • TmuxWorker    │                                          │
│  │ • DockerWorker  │    Memory RPC: search/patterns/stats    │
│  │ FIFO Queue(20)  │                                          │
│  └─────────────────┘                                          │
│         ↓                                                      │
└─────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────┐
│              Worker Layer (실제 작업 실행)                      │
├──────────┬──────────┬──────────────┬────────────────────────────┤
│ Claude   │ Claude   │ tmux         │  Docker                    │
│ CLI      │ API      │ Sessions     │  Container                 │
│ Child    │ SSE      │ (자동발견)   │  (격리실행)                │
│ Process  │ Stream   │              │                            │
└──────────┴──────────┴──────────────┴────────────────────────────┘
```

---

## 3. 핵심 컴포넌트

### 3.1 CodexAgent — 자율 AI 엔진

**위치**: `/packages/gateway/src/agent/agent.ts`

**역할**: Gateway 내부의 상태머신 기반 자율 에이전트

**상태 전이**:
```
IDLE → ANALYZING → PLANNING → EXECUTING → REVIEWING → REPORTING → IDLE
           ↓ (이전 상태 복귀 가능)
      INTERRUPT (취소)
```

**주요 특징**:
- `handleCommand(cmd)`: 사용자 명령 진입점 (즉시 taskId 반환, 비동기 처리)
- `CommandQueue`: 에이전트 바쁠 때 최대 50개까지 명령 큐잉
- `SecurityGuard`: 모든 명령 사전 검증 + 승인 정책 강제
- 파이프라인: analyzer → planner → (approval?) → executeWorkers → reviewer → reporter

**이벤트**:
- `progress`: 상태 전이 + 진행도 (10% → 95%)
- `result`: 완료된 작업 보고서 (task snapshot 사전 캡처로 race condition 방지)
- `error`: 파이프라인 실패 + 강제 상태 리셋 시 에러 발행 (A2)
- `approval`: 사용자 승인 대기
- `queued`: 명령 큐잉 (위치 정보)

**안정성 개선**:
- **A2 (resetToIdle)**: 비정상 상태 전이 시 `error` 이벤트 발행 (디버깅 가시성)
- **L2 (persistAgentResult)**: task snapshot 사전 캡처로 resetToIdle과의 race condition 해결
- **O2 (클라이언트 disconnect)**: WebSocket close 시 구독(subscription) 자동 정리
- **J1 (broadcast 안정성)**: broadcastToAll 에러 시 console.warn 로깅 (전체 실패 방지)

### 3.2 WorkerManager — 워커 풀 관리

**위치**: `/packages/gateway/src/workers/manager.ts`

**역할**: 작업 실행 팩토리 + 생명주기 관리

**팩토리 패턴** (WorkerTask.type에 따라):
```typescript
switch (task.type) {
  case 'claude-api':   → ApiWorker (직접 Claude API 호출, SSE 스트리밍)
  case 'tmux':         → TmuxWorker (tmux 세션 내 실행)
  case 'docker':       → DockerWorker (컨테이너 격리 실행)
  case 'claude-cli':   → ClaudeCliWorker (자식 프로세스, 기본값)
}
```

**FIFO 큐** (G1):
- 풀이 가득 차면 즉시 거부 대신 FIFO 큐에 대기
- `maxQueueSize` (기본 20): 큐 크기 한계
- `drainQueue()`: 워커 완료 시 자동으로 큐에서 다음 작업 실행
- `worker:queued` 이벤트: 큐잉 위치 정보 포함

**파이프라인 출력 체이닝** (A1):
- `strategy: 'pipeline'` 시 이전 워커 출력을 다음 워커 프롬프트에 주입
- `--- Previous step output ---\n{output}` 형식으로 컨텍스트 전달
- 파이프라인 중간 실패 시 즉시 중단

**워커 로그 파일** (H2):
- 각 워커 결과를 `~/.olympus/worker-logs/{workerId}.log`에 기록
- 디렉토리 자동 생성 (`mkdirSync`)

**제약**:
- 동시 워커 한계: `maxConcurrent` (기본 3개)
- 타임아웃: 기본 5분 (task 설정 가능)
- 클린업: 완료 후 60초 후 워커 메모리 해제

**인터페이스** (모든 워커 구현):
```typescript
interface Worker extends EventEmitter {
  getStatus(): string;           // 'pending' | 'running' | 'completed' | 'failed'
  getOutput(): string;           // 누적 출력
  getOutputPreview(max?): string;
  start(): Promise<WorkerResult>;
  terminate(): void;
}
```

### 3.3 MemoryStore — 학습 기억소

**위치**: `/packages/gateway/src/memory/store.ts`

**기술**: SQLite + FTS5 (full-text search)

**테이블**:
- `completed_tasks`: taskId, command, analysis, plan, result, success, duration, timestamp, ...
- `learning_patterns`: trigger, action, confidence, usage_count, last_used

**특징**:
- WAL 모드 (동시성 향상)
- FTS5 트리거로 자동 인덱싱
- 최대 히스토리: `maxHistory` (기본 1000개)

**PatternManager** (A4/C1 분리):
- MemoryStore에서 패턴 관리 로직 추출 (단일 책임 원칙)
- SQL-level LIKE 필터링 (I2): 키워드를 `%keyword%` 형태로 WHERE 조건에 전달
- `findMatching(command, minConfidence)`: 명령어에서 키워드 추출 → SQL LIKE → confidence/usage 정렬

**API**:
- `saveTask(task)`: 완료된 작업 저장
- `searchTasks(query, limit)`: FTS 검색 + LIKE 폴백
- `savePattern(pattern)`: 학습된 패턴 저장 (→ PatternManager 위임)
- `findPatterns(command, minConfidence)`: 매칭 패턴 검색 (→ PatternManager 위임)
- `getPatternCount()`: 저장된 패턴 수
- `deletePattern(id)`: 패턴 삭제
- `recordPatternUsage(id)`: 사용 횟수 증가 + 마지막 사용 시간 갱신

**Memory RPC 메서드** (K5):
- `memory.search`: 작업 히스토리 FTS 검색 (`query`, `limit` 파라미터)
- `memory.patterns`: 패턴 조회 (`command`로 필터링 또는 전체 조회)
- `memory.stats`: 통계 반환 (taskCount, patternCount, recentTasks)

**에이전트 활용**:
- 분석 단계: 유사 작업 3개 조회 (`similarTasks`)
- 계획 단계: 매칭 패턴 추출 (`learnedPatterns`)

### 3.4 ChannelManager — 채널 플러그인 시스템

**위치**: `/packages/gateway/src/channels/manager.ts`

**역할**: 다중 채널 통합 (broadcast, targeted messaging)

**플러그인 인터페이스**:
```typescript
interface ChannelPlugin {
  name: string;
  initialize(): Promise<void>;
  destroy(): Promise<void>;
  sendMessage(target: string, message: ChannelMessage): Promise<void>;
}
```

**내장 채널**:
- `DashboardChannel`: 웹 대시보드 (WebSocket 직접 연결)
- `TelegramChannel`: Telegram Bot (fetch 기반 event bridge)
- `SlackChannel`: Slack Block Kit 기반 알림 (P2)
- `DiscordChannel`: Discord Rich Embeds 기반 알림 (P2)

**사용**:
- `register(channel)`: 채널 등록 (비동기 초기화)
- `broadcast(message)`: 모든 채널에 전송
- `sendTo(channelName, target, message)`: 특정 채널의 특정 대상에 전송

### 3.5 RPC Router — JSON-RPC 2.0 핸들러

**위치**: `/packages/gateway/src/rpc/`

**역할**: WebSocket 메시지 → RPC 메서드 라우팅

**핸드셰이크**:
1. Client: `{ type: 'connect', payload: { apiKey, clientType } }`
2. Gateway: `{ type: 'connected', payload: { protocolVersion, sessionId } }`
3. Client: `{ type: 'subscribe', payload: { runId or sessionId } }`

**핵심 메서드**:
- `agent:submit` / `agent.command`: 명령 제출 → taskId 반환
- `agent:approve` / `agent.approve`: 승인 대기 중인 계획 승인
- `agent:cancel` / `agent.cancel`: 실행 중인 작업 취소
- `session:execute`: tmux 세션 명령 실행
- `memory.search`: 작업 히스토리 FTS 검색
- `memory.patterns`: 학습 패턴 조회/필터링
- `memory.stats`: 메모리 통계 (taskCount, patternCount, recentTasks)

### 3.6 SecurityGuard — 명령 검증 + 승인

**위치**: `/packages/gateway/src/agent/security-guard.ts`

**역할**:
- `validateCommand(cmd)`: 정책 기반 검증 (명령 차단)
- `requiresApproval(cmd)`: 사용자 확인 필요 여부

**정책** (SecurityConfig):
- `requireApprovalFor`: 특정 명령어 패턴 (정규식)
- `blockedCommands`: 금지된 명령어
- `allowedPaths`: 접근 가능한 디렉토리

**승인 흐름**:
1. 에이전트 PLANNING 단계에서 승인 필요 감지
2. `emit('approval', { taskId, plan })`
3. 채널 UI에서 사용자 승인/거부
4. 300초(5분) 타임아웃 후 **자동 거부** (A5: 기존 자동 승인 → 자동 거부로 수정)

### 3.7 CommandQueue — 바쁜 에이전트용 FIFO

**위치**: `/packages/gateway/src/agent/command-queue.ts`

**역할**: 에이전트 IDLE이 아닐 때 명령 큐잉

**특징**:
- 최대 크기: `maxQueueSize` (기본 50)
- FIFO: 먼저 도착한 명령이 먼저 처리
- 이벤트: `queued` (위치 정보 포함)
- `drainQueue()`: IDLE 전환 시 자동 처리

---

## 4. 데이터 플로우

```
사용자 명령 (Telegram/Dashboard/CLI)
        ↓
[채널 수신] (ChannelManager)
        ↓
[명령 검증] (SecurityGuard) ← blockedCommands, requireApprovalFor
        ↓
[에이전트 큐잉] (CommandQueue) ← 바쁘면 큐잉
        ↓
[ANALYZING] (CommandAnalyzer + AIProvider)
   • 의도 분류 (action, question, etc.)
   • 복잡도 판단 (simple, moderate, complex)
   • 필요한 워커 타입 추천
        ↓
[PLANNING] (ExecutionPlanner + AIProvider + MemoryStore)
   • 유사 작업 조회 (MemoryStore)
   • 학습 패턴 적용 (MemoryStore)
   • 워커 계획 수립 (strategy: single, sequential, parallel, pipeline)
        ↓
[승인 체크] (SecurityGuard)
   • needsConfirmation = true이면 사용자 승인 대기
   • 타임아웃: 300초
        ↓
[EXECUTING] (WorkerManager)
   • 전략에 따라 워커 실행
   • 의존성 충족 확인 (sequential)
   • 출력/에러 수집
        ↓
[REVIEWING] (ResultReviewer + AIProvider)
   • 성공/실패 판단
   • 자동 재시도 여부 결정
   • 경고/다음단계 도출
        ↓
[REPORTING] (AgentReporter)
   • 최종 보고서 생성
   • MemoryStore에 저장 (학습)
   • 모든 채널에 broadcast
        ↓
완료 또는 다음 큐 작업 처리 (IDLE → drainQueue)
```

---

## 5. AI Provider 추상화

**위치**: `/packages/gateway/src/agent/providers/`

**목적**: 다양한 AI 백엔드 지원 (현재: Mock, OpenAI)

**인터페이스**:
```typescript
interface AIProvider {
  analyze(command, context): Promise<Analysis>;
  plan(analysis, context): Promise<ExecutionPlan>;
  review(results, task): Promise<ReviewReport>;
}
```

**구현체**:
- `MockProvider`: 패턴 기반 응답 (테스트용, Orchestration mode)
- `OpenAIProvider`: Claude API 호출 (프로덕션)

**문맥**:
- `AnalyzerContext`: projectPath, recentHistory
- `PlannerContext`: similarTasks (MemoryStore에서 조회), learnedPatterns
- ReviewerContext: 암묵적 (results, task만 전달)

---

## 6. 패키지 의존성 구조 (9개 통합)

```
@olympus-dev/protocol (핵심 타입 + 상수 + Codex 타입)
    ↑
    ├─→ @olympus-dev/core (RunManager, SessionManager, auth)
    ├─→ @olympus-dev/gateway (여기! + CodexAdapter)
    ├─→ @olympus-dev/client (WebSocket 클라이언트 + Codex RPC)
    ├─→ @olympus-dev/cli (Node.js CLI 명령 + --mode)
    ├─→ @olympus-dev/tui (Ink 터미널)
    ├─→ @olympus-dev/web (React 대시보드 + CodexPanel)
    ├─→ @olympus-dev/telegram-bot (Telegraf Bot + /codex)
    └─→ @olympus-dev/codex (⭐ Codex Orchestrator)
```

**각 의존성**:
- protocol: WorkerTask, AgentState, WsMessage, 상수
- core: config 로드, 자격증명 관리
- gateway: RPC, Worker, Memory, Channel, Security 등 모든 코어 시스템

---

## 7. 주요 설정 (GatewayOptions)

```typescript
interface GatewayOptions {
  port?: number;              // 기본: 3333
  host?: string;              // 기본: 127.0.0.1
  maxConcurrentRuns?: number; // 기본: 5
}
```

**런타임 설정** (v2Config):
```typescript
{
  agent: {
    model: string;            // 'claude-3.5-sonnet'
    provider: 'openai' | 'mock';
    apiKey: string;
    autoApprove: boolean;
    maxConcurrentWorkers: number; // WorkerManager.maxConcurrent
    orchestrationMode: string;
  },
  security: {
    requireApprovalFor: string[]; // 정규식 배열
    blockedCommands: string[];
  },
  worker: {
    timeout: number;          // 5분
  },
  memory: {
    enabled: boolean;
    dbPath: string;           // ~/.cache/olympus/memory.db
    maxHistory: number;       // 1000
  }
}
```

---

## 8. 생명주기 이벤트

**Gateway 시작 (`start()`)**:
1. MemoryStore 초기화 (SQLite 생성)
2. HTTP 서버 생성
3. WebSocket 서버 온라인
4. Heartbeat 타이머 시작 (20초마다)
5. Session 자동 발견 타이머 시작 (30초마다)

**클라이언트 연결**:
1. 인증 (API 키 검증)
2. Snapshot 전송 (현재 runs, sessions)
3. 구독 관리 (runId 또는 sessionId)

**에이전트 작업**:
1. 상태 전이 → `progress` 이벤트
2. 완료 → `result` 이벤트 + MemoryStore 저장

**Gateway 종료 (`stop()`)** — L5 Graceful Shutdown:
1. 하트비트/자동발견 타이머 정리
2. 모든 실행 중인 runs 취소
3. 모든 워커 종료 (terminateAll)
4. 채널 정리 (destroyAll)
5. WebSocket 클라이언트 연결 해제
6. MemoryStore 닫기 (마지막에 안전하게)

---

## 9. 보안 흐름

```
User Command
    ↓
SecurityGuard.validateCommand(cmd)
    │
    ├─ blockedCommands 체크? → REJECT
    ├─ sandbox path 체크?    → REJECT
    └─ 통과 → 다음 단계
    ↓
SecurityGuard.requiresApproval(cmd)
    │
    ├─ requireApprovalFor 매칭? → SET needsConfirmation
    └─ 통과 → PLANNING
    ↓
[PLANNING 단계]
    │
    ├─ needsConfirmation = true?
    │   ├─ emit('approval', {taskId, plan})
    │   ├─ 사용자 UI에서 승인/거부
    │   └─ 타임아웃(300초) → 자동 거부
    │
    └─ 승인 완료 → EXECUTING
```

---

## 10. 성능 특성

| 메트릭 | 값 |
|--------|-----|
| 동시 워커 | 3 (설정 가능) |
| 워커 큐 크기 | 20 (maxQueueSize) |
| 동시 runs | 5 (설정 가능) |
| 명령 큐 크기 | 50 (CommandQueue) |
| Heartbeat | 20초 |
| Session 자동 발견 | 30초 |
| 승인 타임아웃 | 300초 |
| 워커 메모리 정리 | 60초 |
| MemoryStore 최대 히스토리 | 1000 작업 |

---

## 11. P2-P3 고급 기능

### Embeddings (벡터 임베딩)
- MemoryStore의 작업/패턴에 벡터 임베딩 지원
- 의미 기반 유사도 검색 (FTS5 키워드 검색 보완)

### Nonce Handshake (HMAC-SHA256)
- 클라이언트-게이트웨이 간 challenge-response 인증
- API Key 도청 방지를 위한 일회성 nonce 기반 핸드셰이크

### Docker Worker
- 격리된 컨테이너 환경에서 워커 실행
- WorkerTask `type: 'docker'` 지정 시 DockerWorker 팩토리 생성
- 호스트 시스템과 격리된 안전한 실행 환경

---

## 12. 확장 포인트

### 새 Worker 타입 추가
```typescript
// WorkerManager.createWorker()에서
case 'custom-type':
  return new CustomWorker(task, this.config);
// 기존 4 타입: claude-cli, claude-api, tmux, docker
```

### 새 Channel 플러그인
```typescript
class CustomChannel implements ChannelPlugin {
  async initialize() { /* 설정 */ }
  async sendMessage(target, message) { /* 전송 */ }
  async destroy() { /* 정리 */ }
}

gateway.getChannelManager().register(new CustomChannel());
```

### 새 AI Provider
```typescript
class CustomProvider implements AIProvider {
  async analyze(command, context) { /* 분석 */ }
  async plan(analysis, context) { /* 계획 */ }
  async review(results, task) { /* 검토 */ }
}
```

---

## 13. V3 Codex Orchestrator

### 개요

Codex Orchestrator는 복수의 Claude CLI 세션을 관리하는 멀티 프로젝트 AI 오케스트레이터입니다. Gateway의 V2 Agent와 별개로 동작하며, `--mode codex`(기본값)에서 활성화됩니다.

**위치**: `/packages/codex/`

### 7개 모듈

| 모듈 | 위치 | 역할 |
|------|------|------|
| **Router** | `router.ts` | 5단계 우선순위 라우팅 (@mention → multi-session → global query → keyword → last active) |
| **CodexSessionManager** | `session-manager.ts` | tmux 세션 생성/발견/전송/종료, 6-state lifecycle (starting→ready↔busy↔idle→closed) |
| **OutputMonitor** | `output-monitor.ts` | pipe-pane 기반 500ms 폴링, PROMPT/BUSY/COMPLETION 패턴 감지 |
| **ResponseProcessor** | `response-processor.ts` | 출력 타입 감지 (build/test/error/code/text/question), `⏺ Edit/Write` 파일 변경 파싱 |
| **ContextManager** | `context-manager.ts` | global.db (FTS5) + 프로젝트별 memory.db 샤드, 글로벌 검색, 태스크 저장 |
| **AgentBrain** | `agent-brain.ts` | 의도 분석 (session cmd/history/status/cross-project/forward), 유사 작업/실패 패턴 조회, 컨텍스트 주입 |
| **CodexOrchestrator** | `orchestrator.ts` | initialize→processInput→shutdown 파이프라인, session:output 이벤트 브로드캐스트 |

### Gateway 연동 (CodexAdapter)

**위치**: `/packages/gateway/src/codex-adapter.ts`

Gateway는 `codex` 패키지를 직접 import하지 않고 **duck-typed 인터페이스** (`CodexOrchestratorLike`)로 연동합니다:

```typescript
interface CodexOrchestratorLike {
  initialized: boolean;
  on(event: string, listener: (...args: unknown[]) => void): void;
  processInput(input: { text: string; source: string; timestamp?: number }): Promise<unknown>;
  getSessions(): Array<{ id, name, projectPath, status, lastActivity }>;
  getProjects(): Promise<Array<{ name, path, aliases, techStack }>>;
  globalSearch(query: string, limit?: number): Promise<Array<unknown>>;
  shutdown(): Promise<void>;
}
```

**등록 RPC 메서드** (5개):
- `codex.route` — 입력 라우팅 + 응답
- `codex.sessions` — 세션 목록
- `codex.projects` — 프로젝트 목록
- `codex.search` — 크로스 프로젝트 FTS 검색
- `codex.status` — 오케스트레이터 상태

**이벤트 포워딩**:
- `session:output` → 클라이언트에 session:output 브로드캐스트
- `session:status` → 클라이언트에 codex:session-event 브로드캐스트

### CLI `--mode` 옵션

| 모드 | Gateway 동작 |
|------|-------------|
| `legacy` | V2 Agent/Worker/Memory 전체 초기화, Codex 비활성 |
| `hybrid` | V2 + Codex Orchestrator 동시 실행 |
| `codex` (기본값) | Codex Orchestrator만, `getAgent()` → null, `getMemoryStore()` → null |

### 데이터 플로우

```
사용자 입력 (Telegram /codex, Dashboard CodexPanel, CLI)
    ↓
Gateway RPC Router → codex.route
    ↓
CodexAdapter.handleInput() → requestId 생성
    ↓
CodexOrchestrator.processInput()
    ├─ Router: @mention 감지 → SESSION_FORWARD
    ├─ Router: 상태 질의 → SELF_ANSWER (AgentBrain 생성)
    ├─ Router: 키워드 매칭 → SESSION_FORWARD
    └─ Router: 폴백 → lastActiveSession
    ↓
결과: { decision, response } → RPC 응답으로 반환
```

### 테스트

- **유닛 테스트**: 80개 (`packages/codex/src/__tests__/`)
- **E2E 테스트**: 23개 (`packages/codex/src/__tests__/e2e.test.ts`)
- **Gateway 통합 테스트**: 15개 (`packages/gateway/src/__tests__/codex-integration.test.ts`)

---

## 참고 자료

- **Protocol**: `/packages/protocol/` — 타입 + 상수 + Codex 타입
- **Worker 구현**: `/packages/gateway/src/workers/` — 4 타입 (CLI, API, tmux, Docker)
- **Memory**: `/packages/gateway/src/memory/` — MemoryStore, PatternManager
- **Codex**: `/packages/codex/` — Codex Orchestrator (7 모듈, 103 테스트)
- **테스트**: `/packages/gateway/src/__tests__/` — 329개 테스트
- **명령**: `/packages/cli/src/commands/` — CLI 진입점
