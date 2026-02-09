# Olympus v2.0 Contract Document

> **Phase 0 — Contract-First Design**
> **작성일**: 2026-02-09
> **상태**: Auto Mode (전자동)
> **복잡도**: 18/20 (Forced — Full Orchestration)
> **기반 문서**: `docs/OLYMPUS_V2_TRANSFORMATION.md` (2494줄)

---

## Section 1: Goal Statement

Olympus v0.3.0("tmux 세션 모니터링 도구")을 v2.0("자율 AI 에이전트 오케스트레이션 플랫폼")으로 전환한다.

**핵심 전환**: Gateway가 "출력 파이프라인"에서 "제어면(Control Plane)"으로 진화하며, Codex Agent가 Gateway 프로세스 내에서 상시 실행되어 사용자 자연어 명령을 수신→분석→계획→워커 위임→감시→보고의 전체 사이클을 자율 수행한다.

**완료 기준**: Telegram에서 "gateway 테스트 커버리지 올려줘" 입력 → Codex Agent가 Claude CLI 워커를 child_process.spawn()으로 실행 → 실시간 모니터링 → 빌드/테스트 결과 자동 감지 → Telegram/Dashboard에 구조화된 보고서 전송.

---

## Section 2: Scope Boundary

### 포함 (In-Scope)

| # | 항목 | 패키지 | 유형 |
|---|------|--------|------|
| 1 | WS RPC 메서드 시스템 | protocol, gateway | 신규 |
| 2 | Codex Agent 상태머신 + 분석·계획·검토·보고 | gateway | 신규 |
| 3 | Worker Manager (child_process 기반) | gateway | 신규 |
| 4 | Channel Manager 플러그인 시스템 | gateway | 신규 |
| 5 | Telegram 채널 플러그인 | gateway | 마이그레이션 |
| 6 | Dashboard 채널 플러그인 | gateway | 신규 |
| 7 | Memory System (SQLite + FTS5) | gateway | 신규 |
| 8 | Protocol v0.3.0 확장 (RPC/Agent/Worker 타입) | protocol | 변경 |
| 9 | Client RPC 메서드 호출 | client | 변경 |
| 10 | Dashboard v2 UI (Agent 패널, 워커 뷰) | web | 변경 |
| 11 | Config v2.0 스키마 + Migration | gateway | 변경 |
| 12 | 시스템 프롬프트 (Analyzer/Planner/Reviewer) | gateway | 신규 |

### 제외 (Out-of-Scope)

| # | 항목 | 사유 |
|---|------|------|
| 1 | Docker 워커 격리 | Phase 5+ (운영 안정화 이후) |
| 2 | 벡터 임베딩 메모리 | FTS5만으로 충분, 향후 확장 |
| 3 | Slack/Discord 채널 플러그인 | Telegram+Dashboard 우선 |
| 4 | macOS/iOS/Android 노드 앱 | 별도 프로젝트 |
| 5 | connect.challenge nonce 핸드셰이크 | 보안 Phase 5+ |
| 6 | hot reload / restart 정책 | 초기 불필요 |
| 7 | discovery / bonjour / tailscale | 초기 불필요 |
| 8 | TUI 패키지 대폭 변경 | SSH 경량 모니터링만 유지 |

---

## Section 3: Feature Set Map (4 Feature Sets)

### FS1: RPC 시스템 + Protocol 확장

```yaml
feature_set: FS1
name: "RPC 시스템 + Protocol 확장"
business_workflow: "WS를 통한 요청-응답 RPC 패턴으로 모든 신규 기능의 통신 기반 구축"
input_artifacts:
  - packages/protocol/src/messages.ts (기존 WS 메시지 타입)
  - packages/gateway/src/server.ts (기존 WS 핸들러)
output_artifacts:
  - packages/protocol/src/rpc.ts (RPC 타입 정의)
  - packages/protocol/src/agent.ts (Agent/Worker 타입 정의)
  - packages/gateway/src/rpc/handler.ts (RPC 라우터)
  - packages/gateway/src/rpc/methods.ts (메서드 레지스트리)
  - packages/gateway/src/rpc/types.ts (내부 타입)
dependencies: 없음 (기반)
constraints:
  - 기존 ClientMessage/ServerMessage 완전 호환
  - 기존 connect/subscribe/unsubscribe/cancel/ping 동작 유지
  - RPC 메시지는 type:'rpc' 네임스페이스로 분리
acceptance_criteria:
  - WS 클라이언트가 type:'rpc' 메시지로 health 호출 → rpc:result 응답
  - 존재하지 않는 메서드 호출 → rpc:error (code: 'METHOD_NOT_FOUND')
  - 기존 subscribe/session:output 정상 동작 (회귀 없음)
  - tsc --noEmit 전 패키지 통과
  - 기존 41개 gateway 테스트 통과
performance_requirements:
  - RPC 응답 지연 < 10ms (health 기준)
  - 메서드 등록/조회 O(1) Map lookup
error_handling:
  - 잘못된 JSON → rpc:error (PARSE_ERROR)
  - 메서드 미존재 → rpc:error (METHOD_NOT_FOUND)
  - 핸들러 throw → rpc:error (INTERNAL_ERROR)
  - 인증 실패 → rpc:error (UNAUTHORIZED)
security_requirements:
  - 인증되지 않은 클라이언트의 RPC 호출 차단
  - 메서드별 권한 검증 가능 (확장점)
testing_requirements:
  - 단위: RPC 라우팅, 메서드 등록/조회, 에러 변환
  - 통합: WS 왕복 (rpc → rpc:result), 인증 연동
```

### FS2: Codex Agent + Worker Manager

```yaml
feature_set: FS2
name: "Codex Agent + Worker Manager"
business_workflow: |
  사용자 명령 수신 → Analyzer가 intent/complexity 판정 → Planner가 워커 계획 수립 →
  WorkerManager가 Claude CLI child_process 실행 → stdout 실시간 스트리밍 →
  Reviewer가 결과 판정 → Reporter가 구조화 보고서 생성
input_artifacts:
  - FS1 RPC 메서드 시스템
  - packages/gateway/src/run-manager.ts (RunManager 패턴 참고)
  - packages/telegram-bot/src/digest/engine.ts (출력 분석 패턴 참고)
output_artifacts:
  - packages/gateway/src/agent/agent.ts (상태머신)
  - packages/gateway/src/agent/analyzer.ts (명령 분석)
  - packages/gateway/src/agent/planner.ts (실행 계획)
  - packages/gateway/src/agent/reviewer.ts (결과 검토)
  - packages/gateway/src/agent/reporter.ts (보고서 생성)
  - packages/gateway/src/agent/prompts.ts (시스템 프롬프트)
  - packages/gateway/src/agent/types.ts (타입)
  - packages/gateway/src/agent/index.ts (진입점)
  - packages/gateway/src/workers/manager.ts (Worker Pool)
  - packages/gateway/src/workers/claude-worker.ts (Claude CLI 래퍼)
  - packages/gateway/src/workers/types.ts (타입)
  - packages/gateway/src/workers/index.ts (진입점)
dependencies: [FS1]
constraints:
  - AI Provider 선택 가능 (OpenAI/Anthropic) — config 기반
  - Claude CLI 비대화형 모드 필수 (claude --trust -p path --message "...")
  - maxConcurrentWorkers = 3 (기본, 설정 가능)
  - 워커 타임아웃 기본 5분 (300_000ms)
  - Agent는 Gateway 프로세스 내 실행 (별도 프로세스 아님)
acceptance_criteria:
  - agent.command("hello") → ack + echo 응답 (Mock AI)
  - agent.status → { state: 'IDLE' } 응답
  - 상태 전이 (IDLE→ANALYZING→PLANNING→EXECUTING→REVIEWING→REPORTING→IDLE)
  - 워커 생성 → Claude CLI 프로세스 시작 → stdout 수신
  - 워커 타임아웃 → SIGTERM → 정리
  - workers.list RPC → 활성 워커 목록
  - 워커 실패 → Reviewer가 shouldRetry 판정 → 자동 재시도 (1회)
performance_requirements:
  - Agent ack 응답 < 100ms
  - Analyzer 판단 < 5초 (API 호출 포함)
  - 워커 stdout 스트리밍 < 500ms 지연
  - 동시 워커 3개 병렬 실행 가능
error_handling:
  - AI API 실패 → 재시도 1회 → 사용자에게 에러 보고
  - 워커 spawn 실패 → 즉시 에러 보고 (claude 바이너리 미발견 등)
  - 워커 SIGTERM 후 10초 내 미종료 → SIGKILL
  - 상태머신 비정상 전이 → IDLE로 리셋 + 에러 로그
security_requirements:
  - 워커 환경변수에서 API 키 제외
  - 워커 프로젝트 디렉토리 범위 제한 (chdir)
  - maxConcurrentWorkers로 리소스 폭발 방지
testing_requirements:
  - 단위: 상태머신 전이, Analyzer Mock, Planner Mock, Reviewer Mock
  - 통합: 전체 워크플로우 (Mock AI + Mock child_process)
  - Mock 전략: MockOpenAI, MockClaudeProcess (미리 정의된 응답)
```

### FS3: Channel Manager + Telegram 마이그레이션

```yaml
feature_set: FS3
name: "Channel Manager + Telegram 마이그레이션"
business_workflow: |
  ChannelPlugin 인터페이스로 Telegram/Dashboard를 추상화.
  수신 메시지 → agent.command RPC 라우팅.
  에이전트 응답 → 채널별 포맷 변환 + 전송.
input_artifacts:
  - FS1 RPC 시스템
  - FS2 Agent 시스템
  - packages/telegram-bot/src/ (기존 OlympusBot)
output_artifacts:
  - packages/gateway/src/channels/manager.ts (플러그인 레지스트리)
  - packages/gateway/src/channels/types.ts (인터페이스)
  - packages/gateway/src/channels/telegram.ts (Telegram 플러그인)
  - packages/gateway/src/channels/dashboard.ts (Dashboard 플러그인)
  - packages/gateway/src/channels/index.ts (진입점)
dependencies: [FS1, FS2]
constraints:
  - 기존 Telegram 명령어 완전 호환 (/sessions, /connect, /input, /mode 등)
  - 기존 Digest 시스템 유지
  - telegram-bot 독립 패키지는 re-export 래퍼로 유지 (하위 호환)
  - 자연어 명령 = / 접두사 없는 메시지 → agent.command 라우팅
acceptance_criteria:
  - Telegram /sessions 명령 정상 동작 (기존과 동일)
  - Telegram "gateway 테스트 추가해줘" → agent.command로 전달
  - 에이전트 결과 → Telegram 마크다운 포맷 전송 (4000자 분할)
  - Dashboard WS에서 agent.command → 에이전트 실행 → 결과 WS 이벤트
  - 기존 51개 telegram-bot 테스트 통과 (또는 동등 커버리지)
performance_requirements:
  - 채널 메시지 라우팅 < 10ms
  - Telegram 메시지 전송 debounce 2초 유지
error_handling:
  - 채널 플러그인 초기화 실패 → 해당 채널만 비활성, Gateway 유지
  - Telegram API 실패 → safeReply 패턴 유지
  - Dashboard 연결 끊김 → 메시지 버퍼링 (재연결 시 재전송)
security_requirements:
  - Telegram allowedUsers 화이트리스트 유지
  - 파괴적 명령 패턴 → 승인 요청 (config.security.approvalRequired)
testing_requirements:
  - 단위: ChannelManager 등록/해제, 메시지 라우팅
  - 통합: Telegram 플러그인 메시지 수신/전송 (Mock Telegraf)
  - 회귀: 기존 Telegram 명령어 전부 동작 확인
```

### FS4: Memory System + Dashboard v2 + Client 확장

```yaml
feature_set: FS4
name: "Memory System + Dashboard v2 + Client 확장"
business_workflow: |
  Memory: 완료 작업 히스토리 + 학습 패턴 저장, Planner에 유사 작업 제공.
  Dashboard: Agent 상태 시각화 + 명령 입력 + 워커 모니터링 UI.
  Client: RPC 호출 메서드 추가 (sendCommand, getAgentStatus 등).
input_artifacts:
  - FS1 RPC 시스템
  - FS2 Agent + Worker
  - packages/core/src/contextStore.ts (SQLite 패턴 참고)
  - packages/web/src/ (현재 Dashboard)
  - packages/client/src/client.ts (현재 Client)
output_artifacts:
  - packages/gateway/src/memory/store.ts (SQLite + FTS5)
  - packages/gateway/src/memory/types.ts (타입)
  - packages/gateway/src/memory/index.ts (진입점)
  - packages/web/src/components/AgentPanel.tsx
  - packages/web/src/components/CommandInput.tsx
  - packages/web/src/components/WorkerGrid.tsx
  - packages/web/src/components/WorkerDetailModal.tsx
  - packages/web/src/components/TaskTimeline.tsx
  - packages/web/src/components/AgentApprovalDialog.tsx
  - packages/client/src/client.ts (RPC 메서드 추가)
dependencies: [FS1, FS2]
constraints:
  - Memory DB: ~/.olympus/memory.db (better-sqlite3, WAL 모드)
  - FTS5 인덱스: 작업 command + analysis + result 필드
  - Dashboard: 기존 컴포넌트 유지 + 신규 추가 (파괴 없음)
  - Client: 기존 on() 이벤트 API 유지 + RPC 메서드 추가
acceptance_criteria:
  - 작업 완료 → Memory에 자동 기록 (command, analysis, plan, result, duration)
  - 유사 명령 → FTS5 검색 → 과거 작업 반환
  - Dashboard AgentPanel: 상태머신 실시간 표시
  - Dashboard CommandInput: 명령 입력 → agent.command RPC 호출
  - Dashboard WorkerGrid: 활성 워커 카드 (상태, 진행률, 출력 미리보기)
  - Client.sendCommand("...") → rpc:result Promise 반환
  - 기존 Dashboard 기능 회귀 없음
performance_requirements:
  - FTS5 검색 < 100ms (1000개 히스토리 기준)
  - Dashboard 상태 업데이트 < 200ms
  - Memory DB 쓰기 < 10ms
error_handling:
  - Memory DB 초기화 실패 → Memory 비활성, Agent 정상 동작
  - Dashboard 연결 실패 → 재연결 시도 (기존 패턴)
security_requirements: 없음 (내부 시스템)
testing_requirements:
  - 단위: MemoryStore CRUD, FTS5 검색 정확도
  - 통합: Agent 워크플로우에서 Memory 자동 기록 확인
  - Dashboard: 빌드 성공 확인 (tsc --noEmit)
```

---

## Section 4: DRY Audit

기존 코드 재활용 지점:

| 기존 패턴 | 위치 | 재활용 위치 | 방법 |
|----------|------|-----------|------|
| OlympusBus (EventEmitter) | core/events.ts | Agent 이벤트 전파 | Agent에 run-scoped bus 할당 |
| ContextStore (better-sqlite3, WAL) | core/contextStore.ts | MemoryStore | 동일 패턴: singleton, WAL, LIMIT |
| TaskStore (Materialized Path) | core/taskStore.ts | Worker 작업 추적 | 참고만 (복잡도 불필요) |
| RunManager (동시 실행 제한) | gateway/run-manager.ts | WorkerManager | maxConcurrent + AbortController 패턴 |
| Digest Engine (classify→build→redact) | telegram-bot/digest/ | Worker 출력 분석 | import 직접 or 패턴 복제 |
| SessionManager (pipe-pane) | gateway/session-manager.ts | tmux 워커 하위호환 | 기존 유지, 새 코드는 child_process |
| filterOutput() | gateway/session-manager.ts | Worker stdout 정제 | 참고만 (child_process는 다른 출력) |
| createMessage/parseMessage | protocol/helpers.ts | RPC 메시지 생성 | 직접 사용 |
| Auth (oly_ + Bearer) | gateway/auth.ts | RPC 인증 | 기존 validateWsApiKey 재활용 |

**중복 위험 지점:**
1. ~~RunManager vs WorkerManager~~ — WorkerManager는 **child_process 관리** 전문, RunManager는 **orchestration run** 관리. 역할이 다르므로 중복 아님.
2. ~~SessionManager vs WorkerManager~~ — SessionManager는 tmux, WorkerManager는 child_process. 공존하되 인터페이스는 다름.
3. **Digest 재활용 주의** — telegram-bot 패키지의 Digest를 gateway에서 직접 import하면 순환 의존. 해결: Digest를 core로 이동하거나, 워커 출력 분석은 별도 구현.

---

## Section 5: Engineering Balance

### 적정 엔지니어링 원칙

| 영역 | 과소 엔지니어링 위험 | 과잉 엔지니어링 위험 | 적정 수준 |
|------|-------|-------|-------|
| **RPC 시스템** | 하드코딩 switch → 메서드 추가마다 수정 | 완전한 미들웨어 체인 + 인터셉터 | Map 기반 레지스트리 + 에러 래핑 |
| **Agent 상태머신** | if/else 중첩 → 버그 | xstate 같은 라이브러리 도입 | enum + switch + 전이 검증 함수 |
| **Worker Manager** | spawn만 → 정리 누락 | 풀 + 큐 + 우선순위 | maxConcurrent + AbortController + 타임아웃 |
| **Channel Plugin** | Telegram 하드코딩 | 완전한 플러그인 로더 + 동적 import | interface + register() + iterate() |
| **Memory System** | JSON 파일 | 벡터 DB + 임베딩 | SQLite + FTS5 (검증된 패턴) |
| **Dashboard v2** | 상태 표시만 | 완전한 WYSIWYG 에디터 | 상태 패널 + 명령 입력 + 워커 그리드 |

---

## Section 6: Dependency Map

```
패키지 의존 그래프 (변경 후):

protocol (확장: RPC/Agent/Worker 타입)
    ↓
core (변경 없음 — OlympusBus, ContextStore 등)
    ↓
gateway (대규모 확장)
├── rpc/ (신규)
├── agent/ (신규, openai 의존)
├── workers/ (신규)
├── channels/ (신규, telegraf 의존)
├── memory/ (신규, better-sqlite3 의존)
├── server.ts (변경: RPC + Agent 통합)
├── session-manager.ts (변경 최소: Worker 연동)
├── api.ts (변경: Agent REST API 추가)
└── auth.ts (변경: config v2.0 호환)
    ↓
client (변경: RPC 메서드 추가)
    ↓
web (변경: Dashboard v2 컴포넌트)
tui (변경 최소)
```

**신규 npm 의존성:**
- `openai` (^4.x) — Agent AI 호출 (gateway/package.json)
- `@anthropic-ai/sdk` (^0.x) — 대안 AI provider (gateway/package.json)

**기존 의존성 이동:**
- `telegraf` — telegram-bot/package.json → gateway/package.json (채널 플러그인)
- `better-sqlite3` — core에 이미 있음 → gateway에서도 사용 (memory)

---

## Section 7: Trade-off Decisions

### TD1: Agent AI Provider — OpenAI vs Anthropic

| 옵션 | Effort | Risk | Impact | Maintenance |
|------|--------|------|--------|-------------|
| **A: OpenAI만 (GPT-4o)** | 낮음 | 중간 (단일 벤더 종속) | 높음 (tool_use 안정) | 쉬움 |
| **B: Anthropic만 (Claude API)** | 낮음 | 중간 (동일) | 높음 | 쉬움 |
| **C: 양쪽 지원 (config 선택)** | 중간 | 낮음 | 높음 | 중간 |

**결정: C (양쪽 지원)** — `config.agent.provider` 설정으로 선택. 추상화 비용이 낮고, 단일 벤더 종속 회피.

### TD2: Telegram 마이그레이션 전략

| 옵션 | Effort | Risk | Impact | Maintenance |
|------|--------|------|--------|-------------|
| **A: 즉시 전량 이전** | 높음 | 높음 (기능 파손) | 높음 | 쉬움 (단일 위치) |
| **B: 점진적 이전 (기존 유지 + 플러그인 추가)** | 중간 | 낮음 | 중간 | 중간 (2곳 관리) |
| **C: 기존 유지 + IPC 연동** | 낮음 | 낮음 | 낮음 | 어려움 (IPC) |

**결정: B (점진적 이전)** — 1단계에서 채널 플러그인 프레임워크만 구축하고, Telegram 핵심 로직은 기존 패키지에 유지. 2단계에서 점진적 이전. 이유: 51개 테스트 보존이 최우선.

### TD3: Worker 출력 스트리밍 방식

| 옵션 | Effort | Risk | Impact | Maintenance |
|------|--------|------|--------|-------------|
| **A: child_process stdout pipe** | 낮음 | 낮음 | 높음 | 쉬움 |
| **B: pty (node-pty)** | 중간 | 중간 (네이티브 모듈) | 높음 (터미널 시뮬) | 중간 |
| **C: JSON-RPC over stdio** | 높음 | 중간 | 높음 (구조화) | 중간 |

**결정: A (stdout pipe)** — Claude CLI의 `--output-format stream-json` 지원 여부에 따라 C로 전환 가능. 초기에는 plain stdout + Digest 패턴 분석.

### TD4: Digest 코드 위치

| 옵션 | Effort | Risk | Impact | Maintenance |
|------|--------|------|--------|-------------|
| **A: core로 이동** | 중간 | 낮음 | 높음 (공유) | 쉬움 |
| **B: gateway에 복사** | 낮음 | 낮음 | 낮음 (중복) | 어려움 (2곳) |
| **C: telegram-bot에서 import** | 낮음 | 높음 (순환 의존) | 낮음 | 어려움 |

**결정: A (core로 이동)** — Digest 엔진(patterns.ts, engine.ts, types.ts)을 core 패키지로 이동. telegram-bot과 gateway 모두 core에서 import.

---

## Section 8: Performance Budget

| 메트릭 | 현재 (v0.3.0) | 목표 (v2.0) | 측정 방법 |
|--------|-------------|------------|----------|
| RPC health 왕복 | N/A | < 10ms | vitest benchmark |
| Agent ack 응답 | N/A | < 100ms | RPC 타임스탬프 diff |
| Analyzer 판단 | N/A | < 5s | API 응답 시간 |
| Worker stdout 지연 | N/A | < 500ms | pipe event 타임스탬프 |
| Memory FTS5 검색 | N/A | < 100ms (1K records) | vitest benchmark |
| Dashboard 상태 반영 | ~1s (폴링) | < 200ms (WS 이벤트) | WS 라운드트립 |
| Gateway 시작 시간 | ~500ms | < 2s (Memory 초기화 포함) | 측정 로그 |
| 동시 워커 메모리 | N/A | < 100MB (3 workers) | process.memoryUsage() |

---

## Section 9: Risk Mitigation Plan

| # | 리스크 | 완화 전략 | 검증 방법 |
|---|--------|----------|----------|
| R1 | Claude CLI 비대화형 모드 제한 | tmux-worker 폴백 코드 포함 | 통합 테스트: child_process 실패 → tmux 폴백 |
| R2 | 기존 테스트 회귀 | 매 Step 후 `pnpm test` 실행 | CI 상태 확인 |
| R3 | Agent 판단 오류 | Mock AI로 deterministic 테스트 + autoApprove:false 기본 | 시나리오 테스트 4종 |
| R4 | API 비용 | Mock 모드 지원 (config.agent.provider: 'mock') | 테스트 전부 Mock |
| R5 | telegram-bot 마이그레이션 파손 | 점진적 이전 (기존 유지) | 기존 51개 테스트 통과 |
| R6 | 워커 hang | 타임아웃 + SIGTERM → SIGKILL 에스컬레이션 | 단위 테스트: timeout → kill |
| R7 | 출력 폭발 | maxOutputBuffer + Digest 요약 | 통합 테스트: 큰 출력 시나리오 |
| R8 | 빌드 깨짐 | protocol → gateway 단방향 의존 유지 | tsc --noEmit 전 패키지 |

---

## Section 10: Security Checklist

- [ ] RPC 메서드 인증 검증 (미인증 클라이언트 차단)
- [ ] 워커 환경변수에서 OLYMPUS_API_KEY, OPENAI_API_KEY 제외
- [ ] Telegram allowedUsers 체크 유지
- [ ] LLM 프롬프트에 사용자 입력 직접 삽입 금지 (template 분리)
- [ ] maxConcurrentWorkers 강제 (config로만 변경)
- [ ] config.json 파일 권한 0600 유지
- [ ] Worker SIGTERM/SIGKILL 에스컬레이션으로 좀비 방지
- [ ] API Key를 WS/HTTP 로그에 노출하지 않음

---

## Section 11: Config v2.0 Schema

기존 `~/.olympus/config.json`에 신규 필드 추가:

```typescript
interface OlympusConfigV2 extends OlympusConfigV1 {
  agent: {
    enabled: boolean;                    // default: false (opt-in)
    provider: 'openai' | 'anthropic' | 'mock';
    model: string;                       // 'gpt-4o' | 'claude-sonnet-4-5-20250929'
    apiKey: string;                      // provider별 API Key
    maxConcurrentWorkers: number;        // default: 3
    defaultTimeout: number;              // default: 300_000 (5분)
    autoApprove: boolean;                // default: false
    orchestrationMode: 'auto' | 'always' | 'never';
  };
  workers: {
    type: 'child_process' | 'tmux';
    claudePath?: string;
    logDir: string;
    maxOutputBuffer: number;             // default: 10_000_000 (10MB)
  };
  memory: {
    enabled: boolean;                    // default: true
    dbPath: string;                      // default: '~/.olympus/memory.db'
    maxHistory: number;                  // default: 1000
  };
  security: {
    approvalRequired: string[];          // 파괴적 명령 패턴
    blockedCommands: string[];
    maxWorkerDuration: number;           // default: 600_000 (10분)
  };
  projects: {
    workspacePath: string;
    registered: Array<{
      name: string;
      path: string;
      aliases: string[];
    }>;
  };
}
```

**마이그레이션**: 기존 v1 config → v2 자동 변환 (신규 필드에 기본값 할당, `agent.enabled = false`).

---

## Section 12: Implementation Order

```
Step 순서 (의존성 기반):

[Week 1: 기반]
 1. Protocol 확장 (rpc.ts, agent.ts) — FS1
 2. RPC 핸들러 + 메서드 레지스트리 — FS1
 3. Gateway server.ts에 RPC 디스패치 추가 — FS1
 4. Config v2.0 스키마 + Migration — FS1
 5. Agent 타입 + 상태머신 스켈레톤 — FS2
 6. Worker 타입 + Manager 기초 — FS2

[Week 2: Agent 핵심]
 7. Analyzer (AI 호출 + Mock) — FS2
 8. Planner (전략 결정 + Mock) — FS2
 9. ClaudeCliWorker (child_process) — FS2
 10. Reviewer (결과 판정 + Mock) — FS2
 11. Reporter (포맷 변환) — FS2
 12. Agent 전체 워크플로우 통합 — FS2

[Week 3: 채널 + 메모리]
 13. Digest core 이동 — 준비
 14. Channel Manager 프레임워크 — FS3
 15. Dashboard 채널 플러그인 — FS3
 16. Telegram 채널 플러그인 (점진적) — FS3
 17. Memory Store (SQLite + FTS5) — FS4
 18. Client RPC 메서드 추가 — FS4

[Week 4: Dashboard + 안정화]
 19. AgentPanel + CommandInput — FS4
 20. WorkerGrid + WorkerDetailModal — FS4
 21. TaskTimeline + ApprovalDialog — FS4
 22. 전체 통합 테스트 — 검증
 23. 성능 테스트 + 최적화 — 검증
 24. 문서 업데이트 — 마무리
```

---

## Section 13: Test Strategy Summary

```
Level 1: 단위 테스트 (vitest)
  기존: 92개 (gateway 41 + telegram 51) → 전부 통과 유지
  신규: ~50-60개 예상
    - rpc/handler.test.ts (~8개)
    - agent/agent.test.ts (~10개)
    - agent/analyzer.test.ts (~6개)
    - agent/planner.test.ts (~6개)
    - agent/reviewer.test.ts (~6개)
    - workers/manager.test.ts (~8개)
    - workers/claude-worker.test.ts (~6개)
    - channels/manager.test.ts (~6개)
    - memory/store.test.ts (~8개)

Level 2: 통합 테스트 (vitest)
  신규: ~15-20개
    - agent-workflow.test.ts (~5개)
    - rpc-roundtrip.test.ts (~4개)
    - worker-lifecycle.test.ts (~4개)
    - memory-search.test.ts (~3개)

총 예상: 92(기존) + 65-80(신규) = 157-172개
```

---

## Section 14: Rollback Strategy

1. **기능 플래그**: `config.agent.enabled = false` → 모든 v2 기능 비활성, v0.3.0과 동일 동작
2. **Protocol 호환**: 신규 RPC 메시지는 기존 타입과 union. 기존 클라이언트는 무시 가능
3. **telegram-bot 래퍼**: 독립 패키지 유지 (re-export). 점진 이전 실패 시 원복 가능
4. **Git 태그**: Phase 4 시작 전 `v0.3.0-pre-v2` 태그. 전체 롤백 가능
5. **DB 분리**: Memory DB는 별도 파일 (memory.db). 삭제해도 기존 기능 무영향

---

## Section 15: Acceptance Gates

### Phase 4 완료 Gate (코드 실행)
- [ ] 8개 패키지 빌드 통과 (`pnpm build`)
- [ ] 92개 기존 테스트 통과 (`pnpm test`)
- [ ] 신규 테스트 65개+ 추가 + 통과
- [ ] `tsc --noEmit` 전 패키지 통과
- [ ] agent.command RPC → Mock AI → 워커 실행 → 결과 보고 전체 흐름 동작

### Phase 8 완료 Gate (최종 판정)
- [ ] 모든 Acceptance Criteria 충족
- [ ] 성능 예산 충족
- [ ] 보안 체크리스트 전항 통과
- [ ] 기존 기능 회귀 없음
- [ ] 문서 업데이트 완료
