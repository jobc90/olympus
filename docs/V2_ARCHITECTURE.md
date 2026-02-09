# Olympus V2 아키텍처 가이드

## 1. 시스템 개요

**Olympus V2**는 Claude CLI 세션 모니터에서 출발하여 자율 AI 에이전트 플랫폼으로 진화한 시스템입니다.

### 핵심 비전
- 사용자 명령 → 자동 분석 → 실행 계획 수립 → 자율 실행 → 결과 검토 → 보고
- 다중 채널 지원 (Telegram, Dashboard, TUI, CLI)
- 자동 학습을 통한 지속적 개선
- 강력한 보안 정책 및 승인 흐름

### 현재 상태 (v0.3.0)
- 8개 통합 패키지 (protocol, core, gateway, cli, client, tui, web, telegram-bot)
- 92/92 테스트 통과
- 프로덕션 준비 완료 (v5.3 Deep Engineering Protocol)

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
│  │ (3 타입)        │    │ SecurityGuard            │          │
│  │                 │    │ Memory Store (SQLite)    │          │
│  │ • ClaudeWorker  │    └──────────────────────────┘          │
│  │ • ApiWorker     │                                          │
│  │ • TmuxWorker    │                                          │
│  └─────────────────┘                                          │
│         ↓                                                      │
└─────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────┐
│              Worker Layer (실제 작업 실행)                      │
├──────────────┬──────────────┬─────────────────────────────────┤
│  Claude CLI  │   Claude     │   tmux Sessions                 │
│  Child       │   API        │   (자동 발견/등록)              │
│  Process     │   Streaming  │                                 │
└──────────────┴──────────────┴─────────────────────────────────┘
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
- `result`: 완료된 작업 보고서
- `error`: 파이프라인 실패
- `approval`: 사용자 승인 대기
- `queued`: 명령 큐잉 (위치 정보)

### 3.2 WorkerManager — 워커 풀 관리

**위치**: `/packages/gateway/src/workers/manager.ts`

**역할**: 작업 실행 팩토리 + 생명주기 관리

**팩토리 패턴** (WorkerTask.type에 따라):
```typescript
switch (task.type) {
  case 'claude-api':   → ApiWorker (직접 Claude API 호출)
  case 'tmux':         → TmuxWorker (tmux 세션 내 실행)
  case 'claude-cli':   → ClaudeCliWorker (자식 프로세스, 기본값)
}
```

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

**API**:
- `saveTask(task)`: 완료된 작업 저장
- `searchTasks(query, limit)`: FTS 검색 + LIKE 폴백
- `savePattern(pattern)`: 학습된 패턴 저장
- `findPatterns(command, minConfidence)`: 매칭 패턴 검색

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
- `TelegramChannel`: Telegram Bot (Telegraf, 선택사항)

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
- `agent:submit`: 명령 제출 → taskId 반환
- `agent:approve`: 승인 대기 중인 계획 승인
- `agent:cancel`: 실행 중인 작업 취소
- `session:execute`: tmux 세션 명령 실행
- `memory:search`: 작업 히스토리 검색

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
4. 300초(5분) 타임아웃 후 자동 거부

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

## 6. 패키지 의존성 구조 (8개 통합)

```
@olympus-dev/protocol (핵심 타입 + 상수)
    ↑
    ├─→ @olympus-dev/core (RunManager, SessionManager, auth)
    ├─→ @olympus-dev/gateway (여기!)
    ├─→ @olympus-dev/client (WebSocket 클라이언트)
    ├─→ @olympus-dev/cli (Node.js CLI 명령)
    ├─→ @olympus-dev/tui (Ink 터미널)
    ├─→ @olympus-dev/web (Next.js 대시보드)
    └─→ @olympus-dev/telegram-bot (Telegraf Bot)
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

**Gateway 종료 (`stop()`)**:
1. 모든 실행 중인 runs 취소
2. 모든 워커 종료
3. 채널 정리
4. MemoryStore 닫기
5. WebSocket 클라이언트 연결 해제

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
| 동시 runs | 5 (설정 가능) |
| 명령 큐 크기 | 50 |
| Heartbeat | 20초 |
| Session 자동 발견 | 30초 |
| 승인 타임아웃 | 300초 |
| 워커 메모리 정리 | 60초 |
| MemoryStore 최대 히스토리 | 1000 작업 |

---

## 11. 확장 포인트

### 새 Worker 타입 추가
```typescript
// WorkerManager.createWorker()에서
case 'custom-type':
  return new CustomWorker(task, this.config);
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

## 참고 자료

- **Protocol**: `/packages/protocol/` — 타입 + 상수
- **Worker 구현**: `/packages/gateway/src/workers/` — 3 타입
- **테스트**: `/packages/gateway/test/` — 92개 테스트
- **명령**: `/packages/cli/src/commands/` — CLI 진입점
