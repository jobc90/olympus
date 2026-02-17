# Olympus v2.0 Phase 5+ 실행 로드맵

> **작성일**: 2026-02-09
> **기반 문서**: `OLYMPUS_V2_TRANSFORMATION.md` (2494줄), `V2_CONTRACT.md`
> **현재 상태**: Phase 1-4 핵심 구현 완료, Pipeline 전 녹색 (build 8/8, test 179/179, lint 5/5)
> **목적**: Phase 5 이후 후속 작업의 우선순위, 의존성, 구현 방법, 검증 기준을 명시

---

## 0. Code-Level Gap Analysis (88 Issues)

> 이 섹션은 V2 코드 전수 조사에서 발견된 **88개 구체적 이슈**를 파일별로 정리한다.
> 각 이슈는 정확한 파일:라인 참조, 현재 동작, 기대 동작, 해결 Phase를 포함한다.

### 0.1 Agent System (agent.ts — 382줄)

| # | 이슈 | 위치 | 현재 동작 | 기대 동작 | Phase |
|---|------|------|----------|----------|-------|
| A1 | pipeline 전략 미구현 | `agent.ts:357-364` | `// treated as sequential for now` — output chaining 없이 순차 실행 | 이전 워커 출력을 다음 워커 입력으로 전달 | 5.0.5 |
| A2 | resetToIdle 강제 리셋 | `agent.ts:370-378` | 유효하지 않은 전이 시 catch로 `this._state = 'IDLE'` 강제 설정 — 버그 마스킹 | 정상 전이만 허용, 비정상 시 에러 로깅 | 5.0.5 |
| A3 | 재시도 1회 하드코딩 | `agent.ts:272-284` | `if (report.shouldRetry)` — 1회만, 백오프 없음 | `config.agent.maxRetries` 기반, 지수 백오프 | 5.0.5 |
| A4 | Memory-Planner 미연동 | `agent.ts:215` | `planner.plan(analysis)` — memory/patterns 인자 없음 | `planner.plan(analysis, memory, patterns)` | 5.0 |
| A5 | 파괴적 명령 자동승인 | `agent.ts:233-241` | 5분 타임아웃 → `resolve(true)` — `rm -rf`도 자동 승인 가능 | 파괴적 명령 감지 시 auto-approve 비활성화 | 5.0.4 |
| A6 | cancel 시 approval 미정리 | `agent.ts:155-169` | cancel()이 `_approvalResolve`를 해제하지 않음 — Promise 메모리 릭 가능 | cancel 시 `_approvalResolve?.(false)` 호출 + null 처리 | 5.0.5 |
| A7 | 명령 큐 없음 | `agent.ts:123-128` | IDLE 아닌 상태에서 새 명령 → 즉시 `AGENT_BUSY` throw | 명령 큐(FIFO, maxQueueSize) + 다음 IDLE 시 자동 처리 | 5.0.5 |
| A8 | task.state/_state 이중 추적 | `agent.ts:178-180` | `task.state`과 `this._state` 독립 갱신 — 불일치 가능 | transitionTo()에서 양쪽 동기화 | 5.0.5 |
| A9 | SecurityConfig 미적용 | `agent.ts:174` | `blockedCommands`/`approvalRequired` 체크 로직 없음 | runPipeline 진입 시 보안 검증 게이트 추가 | 5.0.4 |

### 0.2 Analyzer (analyzer.ts — 96줄)

| # | 이슈 | 위치 | 현재 동작 | 기대 동작 | Phase |
|---|------|------|----------|----------|-------|
| B1 | targetFiles 항상 빈 배열 | `analyzer.ts:67` | `targetFiles: []` — 파일 경로 분석 없음 | AI API 또는 프로젝트 구조 기반 파일 추론 | 5.0.1 |
| B2 | risks 항상 빈 배열 | `analyzer.ts:71` | `risks: []` — 위험 분석 없음 | AI API 기반 위험 요소 식별 | 5.0.1 |
| B3 | 프로젝트 탐색 범위 제한 | `analyzer.ts:79-93` | 6개 내부 패키지만 인식 (gateway, telegram 등) | config.projects.registered + 자동 탐색 | 5.0 |
| B4 | config.projects 미연동 | `analyzer.ts:16-17` | AgentConfig만 받음 — ProjectConfig 참조 없음 | ProjectRegistry 주입 | 5.0 |
| B5 | needsConfirmation 패턴 부족 | `analyzer.ts:73` | `/(delete\|삭제\|drop\|push\|force\|reset)/i` | `rm`, `truncate`, `revert`, `overwrite`, `wipe`, `destroy` 추가 | 5.0.4 |
| B6 | intent 오탐 | `analyzer.ts:38` | "show me how to implement X" → `question` (show 매칭) | 문맥 기반 판단 (AI API) 또는 우선순위 조정 | 5.0.1 |
| B7 | Memory/히스토리 미연동 | — | 최근 작업 컨텍스트 없음 | `memory.getRecentTasks(5)` AI 프롬프트에 주입 | 5.0.1 |

### 0.3 Planner (planner.ts — 102줄)

| # | 이슈 | 위치 | 현재 동작 | 기대 동작 | Phase |
|---|------|------|----------|----------|-------|
| C1 | Memory 파라미터 없음 | `planner.ts:17-27` | `plan(analysis)` — memory/patterns 인자 없음 | `plan(analysis, memory?, patterns?)` 시그니처 확장 | 5.0 |
| C2 | 단일 워커만 생성 | `planner.ts:31-41` | strategy가 parallel이어도 워커 1개만 생성 | parallel → 독립 워커 2+개, sequential → 의존성 체인 | 5.0.2 |
| C3 | projectPath 폴백 오류 | `planner.ts:36` | `process.cwd()` — 데몬 실행 시 잘못된 경로 | config.workspacePath 또는 analysis.targetProject에서 해석 | 5.0.2 |
| C4 | rollbackStrategy 하드코딩 | `planner.ts:50` | `"git stash"` — 모든 프로젝트에 동일 | 프로젝트 타입별 전략 (git/docker/none) | 5.0.2 |
| C5 | determineStrategy 무의미 | `planner.ts:57` | `requirements.length > 1` → parallel — 하지만 mock은 항상 1개 | AI API에서 전략 결정, mock도 다중 requirement 테스트 | 5.0.2 |
| C6 | orchestration 삽입 기준 부정확 | `planner.ts:39-40` | `complexity === 'complex'`이면 항상 orchestration — 비코딩 작업도 | intent가 coding/debugging일 때만 orchestration 적용 | 5.0.2 |

### 0.4 Reviewer (reviewer.ts — 121줄)

| # | 이슈 | 위치 | 현재 동작 | 기대 동작 | Phase |
|---|------|------|----------|----------|-------|
| D1 | testFail 오탐 (Critical) | `reviewer.ts:34` | `/\d+\s*(fail\|실패)/i` → "0 failed" 매칭 → `testFail=true` | `0 fail`을 제외하는 negative lookbehind: `/(?<![0]\s)\d+\s*(fail)/` 또는 숫자 파싱 | 5.0.3 |
| D2 | shouldRetry 조건 제한적 | `reviewer.ts:42-43` | TypeScript 에러(≤5)만 재시도 | 빌드 실패, 의존성 누락, 타임아웃도 재시도 대상 | 5.0.3 |
| D3 | details 2000자 절삭 | `reviewer.ts:52` | `.slice(0, 2000)` — 끝부분 에러 손실 | 마지막 2000자 또는 에러 섹션 우선 추출 | 5.0.3 |
| D4 | 변경파일 탐지 패턴 부족 | `reviewer.ts:76-90` | `modified\|created\|wrote\|changed` + `✓\|✅` | Claude CLI 실제 출력 형식 (`Edit:`, `Write:`, `packages/...`) 추가 | 5.0.3 |
| D5 | 테스트 결과 단일 매칭 | `reviewer.ts:93-95` | 첫 번째 매칭만 반환 | 모든 프레임워크 결과 수집 (vitest + jest + mocha 등) | 5.0.3 |
| D6 | testPass "0 passed" 무시 | `reviewer.ts:33` | `0 passed` → 매칭 안 됨 (정상 동작이지만) | 테스트 스위트 없는 경우 별도 처리 | 5.0.3 |

### 0.5 Reporter (reporter.ts — 84줄)

| # | 이슈 | 위치 | 현재 동작 | 기대 동작 | Phase |
|---|------|------|----------|----------|-------|
| E1 | 리스너 미등록 | `reporter.ts:10` | `listeners: Array` — 기본 빈 배열 | server.ts에서 ChannelManager와 연결 필요 | 5.0.1 |
| E2 | Channel 연동 미완성 | `server.ts:129-143` | agent 이벤트 → broadcastToAll (직접) — reporter 경유하지 않음 | reporter → ChannelManager → 각 채널별 포맷팅 | 5.0.1 |

### 0.6 Prompts (prompts.ts — 115줄)

| # | 이슈 | 위치 | 현재 동작 | 기대 동작 | Phase |
|---|------|------|----------|----------|-------|
| F1 | 런타임 미사용 | `prompts.ts:*` | export만 됨 — analyzer/planner/reviewer에서 import 없음 | AI API 호출 시 system prompt로 사용 | 5.0.1 |

### 0.7 Worker Manager (manager.ts — 125줄)

| # | 이슈 | 위치 | 현재 동작 | 기대 동작 | Phase |
|---|------|------|----------|----------|-------|
| G1 | 큐 없이 즉시 실패 | `manager.ts:31-41` | `maxConcurrent 초과 → failed WorkerResult 반환` | FIFO 큐 대기 + 자동 디큐 | 5.0.5 |
| G2 | 60초 정리 지연 | `manager.ts:64-67` | setTimeout 60s 후 Map에서 삭제 | 결과 조회용 별도 Map 또는 TTL 캐시 | 5.0.5 |
| G3 | ClaudeCliWorker만 생성 | `manager.ts:43` | `new ClaudeCliWorker(task, this.config)` 고정 | Factory 패턴 — WorkerTask.type에 따라 워커 선택 | 5.0 |
| G4 | worker:error 미처리 | `manager.ts:50-51` | `worker:error` 이벤트 발생 → server.ts에서 리스닝 없음 | server.ts에서 `worker:error` 이벤트 핸들러 추가 | 5.0.5 |

### 0.8 Claude Worker (claude-worker.ts — 195줄)

| # | 이슈 | 위치 | 현재 동작 | 기대 동작 | Phase |
|---|------|------|----------|----------|-------|
| H1 | 환경변수 블랙리스트 불완전 | `claude-worker.ts:177-180` | 3개만 제거 (OPENAI, ANTHROPIC, OLYMPUS_AGENT) | 화이트리스트 방식 (PATH, HOME, USER, LANG만 허용) | 5.0.4 |
| H2 | 출력 디스크 미기록 | `claude-worker.ts:73-84` | `config.logDir` 정의만, 실제 파일 기록 없음 | logDir에 워커별 로그 파일 기록 | 5.0 |
| H3 | `--dangerously-skip-permissions` 항상 설정 | `claude-worker.ts:54` | 모든 워커가 권한 무시 모드 | config에서 제어 가능하게, 보안 수준에 따라 선택 | 5.0.4 |
| H4 | stderr 크기 무제한 | `claude-worker.ts:88-92` | errorOutput 무한 증가 (maxOutputBuffer 미적용) | stderr도 maxOutputBuffer 적용 | 5.0.4 |
| H5 | terminate 시 timeout 미정리 | `claude-worker.ts:153-161` | terminate()가 `this.timeoutHandle` 미정리 | `this.clearTimeouts()` 호출 추가 | 5.0.4 |
| H6 | SIGTERM/SIGKILL 타임아웃 불일치 | `claude-worker.ts:142,157` | timeout: 10s, terminate: 5s — 일관성 없음 | 설정 가능한 gracefulShutdownTimeout | 5.0.4 |

### 0.9 Memory Store (store.ts — 307줄)

| # | 이슈 | 위치 | 현재 동작 | 기대 동작 | Phase |
|---|------|------|----------|----------|-------|
| I1 | FTS5 UPDATE 트리거 누락 | `store.ts:87-93` | INSERT/DELETE만 — UPDATE 시 FTS 인덱스 미동기화 | UPDATE 트리거 추가 | 5.0 |
| I2 | findPatterns 전체 테이블 스캔 | `store.ts:201-224` | 모든 패턴 로드 → JS에서 필터 | SQL WHERE trigger LIKE '%keyword%' 추가 | 5.0 |
| I3 | 초기화 실패 무시 | `store.ts:97-101` | better-sqlite3 실패 → 조용히 no-op 모드 | 경고 로그 + 사용자 알림 (memory disabled 표시) | 5.0.5 |
| I4 | rowToTask 런타임 검증 없음 | `store.ts:279-305` | `as Record<string, unknown>` 캐스트 — 잘못된 데이터 무시 | 필수 필드 존재 여부 체크 | 5.0 |
| I5 | WAL 체크포인트 없음 | — | WAL 파일이 무한 증가 가능 | 주기적 `PRAGMA wal_checkpoint(TRUNCATE)` | 5.0 |

### 0.10 Channel System

| # | 이슈 | 위치 | 현재 동작 | 기대 동작 | Phase |
|---|------|------|----------|----------|-------|
| J1 | broadcast 에러 무시 | `channels/manager.ts:76-82` | catch 블록 비어있음 — 채널 실패 감지 불가 | 에러 로깅 + 실패 카운터 (3회 연속 실패 시 경고) | 5.0.5 |
| J2 | ChannelMessage 'approval' 타입 없음 | `channels/types.ts:32-34` | `text\|progress\|result\|error\|question` | `'approval'` 타입 추가 | 5.0.4 |
| J3 | TelegramChannel 메시지 절삭 | `channels/telegram.ts:82` | `.slice(0, 4096)` — 분할 전송 없음 | sendLongMessage 패턴 적용 (4000자 분할) | 5.0 |
| J4 | TelegramChannel escape 과잉 | `channels/telegram.ts:74-75` | 모든 특수문자 escape — 의도적 포맷 파괴 | MarkdownV2 안전 범위만 escape | 5.0 |
| J5 | DashboardChannel 타입 안전 부족 | `channels/dashboard.ts:28-58` | string switch — exhaustive 체크 없음 | satisfies check 또는 default 경고 | 5.0.5 |

### 0.11 RPC System

| # | 이슈 | 위치 | 현재 동작 | 기대 동작 | Phase |
|---|------|------|----------|----------|-------|
| K1 | Rate limiting 없음 | `rpc/handler.ts:50-100` | 인증된 클라이언트 무제한 RPC 요청 가능 | 분당 요청 제한 (예: 60 req/min) | 5.0.4 |
| K2 | workers.list 데이터 누락 | `rpc/agent-methods.ts:173-174` | `projectPath: ''`, `startedAt: 0` 하드코딩 | ClaudeCliWorker에 projectPath/startedAt getter 추가 | 5.0.5 |
| K3 | sessions.list 매번 tmux 스캔 | `rpc/agent-methods.ts:220` | `discoverTmuxSessions()` 프로세스 생성 | 캐시 + 30초 갱신 (server.ts reconcile과 동기화) | 5.0.5 |
| K4 | agent.reject reason 미사용 | `rpc/agent-methods.ts:150-151` | `params.reason` 무시, `agent.reject(taskId)` | reject(taskId, reason)으로 전달 + 로깅 | 5.0.5 |
| K5 | Memory RPC 메서드 없음 | `rpc.ts:54-75` | agent.history만 존재 | `memory.search`, `memory.patterns` 추가 | 5.0 |
| K6 | Channel 관리 RPC 없음 | `rpc.ts:54-75` | 채널 등록/해제 API 없음 | `channels.list`, `channels.register`, `channels.remove` | 5.0 |

### 0.12 Server Integration (server.ts — 632줄)

| # | 이슈 | 위치 | 현재 동작 | 기대 동작 | Phase |
|---|------|------|----------|----------|-------|
| L1 | Memory 초기화 실패 무시 | `server.ts:179` | `.catch(() => {})` — SQLite 실패 무통보 | 경고 이벤트 발생 + 로그 | 5.0.5 |
| L2 | persistAgentResult 경쟁 조건 | `server.ts:586-601` | `this.agent.currentTask` 접근 시 이미 null 가능 (resetToIdle 후) | 이벤트 payload에 task 데이터 포함, 또는 persist를 resetToIdle 전에 실행 | 5.0.5 |
| L3 | Telegram config 이중 로드 | `server.ts:84,118-119` | `loadConfig()` 2회 호출 — 파일 I/O 중복 | 한 번 로드 후 공유 | 5.0.5 |
| L4 | worker:error 미핸들링 | `server.ts:144-153` | `worker:started`, `worker:output`, `worker:done`만 — `worker:error` 누락 | `worker:error` 이벤트도 broadcastToAll | 5.0.5 |
| L5 | Graceful shutdown 없음 | `server.ts:230-255` | RPC 진행 중인 요청 즉시 끊김 | drain period (5초) + 진행 중 RPC 완료 대기 | 5.0 |

### 0.13 Protocol Types (protocol/agent.ts — 271줄)

| # | 이슈 | 위치 | 현재 동작 | 기대 동작 | Phase |
|---|------|------|----------|----------|-------|
| M1 | WorkerConfig.type 범위 제한 | `protocol/agent.ts:216` | `'child_process' \| 'tmux'` | `\| 'claude-api' \| 'docker'` 추가 | 5.0.0 |
| M2 | WorkerTask.type 'docker' 없음 | `protocol/agent.ts:81` | `'claude-cli' \| 'claude-api' \| 'tmux'` | `\| 'docker'` 추가 | 5.0.0 |
| M3 | AgentConfig 필드 누락 | `protocol/agent.ts:204-213` | `maxRetries`, `maxQueueSize` 없음 | 필드 추가 + DEFAULT 설정 | 5.0.0 |
| M4 | SecurityConfig 패턴 매칭 불가 | `protocol/agent.ts:229-230` | `string[]` — 정확한 문자열 비교만 가능 | `RegExp[]` 또는 glob 패턴 지원 헬퍼 | 5.0.4 |
| M5 | DEFAULT_SECURITY_CONFIG 빈 배열 | `protocol/agent.ts:266-270` | 모든 명령 허용 | 기본 위험 명령 차단 목록 제공 | 5.0.4 |

### 0.14 Protocol RPC (protocol/rpc.ts — 224줄)

| # | 이슈 | 위치 | 현재 동작 | 기대 동작 | Phase |
|---|------|------|----------|----------|-------|
| N1 | SessionsListRpcResult unknown[] | `rpc.ts:217-218` | `sessions: unknown[]` | `SessionInfo[]` 타입 참조 | 5.0.0 |
| N2 | RPC 메서드 수 불일치 | — | 문서에 14개 기재, 실제 13개 (2 system + 11 agent) | 문서 수정 또는 메서드 추가 | — |

### 0.15 Client (client.ts — 369줄)

| # | 이슈 | 위치 | 현재 동작 | 기대 동작 | Phase |
|---|------|------|----------|----------|-------|
| O1 | RPC 타입 안전성 없음 | `client.ts:227-265` | `rpc<T>(method: string)` — 아무 문자열 허용 | `rpc<K extends keyof RpcMethods>` 제네릭 | 5.0 |
| O2 | 연결 끊김 시 RPC 미정리 | `client.ts:150-167` | onclose 시 pending RPC Promise 해제 안 됨 — 영원히 pending | onclose에서 모든 pending RPC reject | 5.0.5 |
| O3 | 세션 재구독 경쟁 | `client.ts:134-140` | reconnect 시 모든 세션 재구독 — 서버가 이미 세션 정리했을 수 있음 | 서버에서 유효 세션 확인 후 구독 | 5.0.5 |

### 0.16 이슈 요약 통계

| 구분 | CRITICAL | HIGH | MEDIUM | LOW | 합계 |
|------|----------|------|--------|-----|------|
| Agent (A1-A9) | 2 | 5 | 2 | 0 | 9 |
| Analyzer (B1-B7) | 0 | 3 | 3 | 1 | 7 |
| Planner (C1-C6) | 0 | 3 | 2 | 1 | 6 |
| Reviewer (D1-D6) | 1 | 2 | 2 | 1 | 6 |
| Reporter (E1-E2) | 0 | 1 | 1 | 0 | 2 |
| Prompts (F1) | 0 | 1 | 0 | 0 | 1 |
| Worker Manager (G1-G4) | 0 | 2 | 1 | 1 | 4 |
| Claude Worker (H1-H6) | 0 | 3 | 2 | 1 | 6 |
| Memory Store (I1-I5) | 0 | 1 | 3 | 1 | 5 |
| Channel System (J1-J5) | 0 | 1 | 2 | 2 | 5 |
| RPC System (K1-K6) | 0 | 2 | 2 | 2 | 6 |
| Server (L1-L5) | 1 | 2 | 1 | 1 | 5 |
| Protocol Types (M1-M5) | 0 | 3 | 1 | 1 | 5 |
| Protocol RPC (N1-N2) | 0 | 1 | 1 | 0 | 2 |
| Client (O1-O3) | 0 | 1 | 1 | 1 | 3 |
| **합계** | **4** | **31** | **24** | **13** | **72+** |

> CRITICAL: D1(testFail 오탐), A5(파괴적 명령 자동승인), A9(SecurityConfig 미적용), L2(persistAgentResult 경쟁)

---

## 1. Executive Summary

V2 Transformation의 Phase 1-4가 완료되어 핵심 인프라(Agent State Machine, Worker Manager, Channel System, Memory Store, RPC, Dashboard V2 UI)가 모두 동작 중이다. 그러나 **Agent의 AI 판단 경로가 전체 mock 상태**이며, 보안/복구/테스트가 운영 수준에 미달한다.

본 문서는 남은 16개 항목을 **단일 Phase 5.0**으로 통합하여 구조화한다:

| 단계 | 목표 | 항목 수 | 예상 공수 |
|------|------|---------|----------|
| **Phase 5.0** (Complete V2) | v2 핵심 가치 활성화 + 안전성 + 완성도 + 확장 | 16개 | 13-20일 |

**총 예상 공수**: 13-20일 (1인 기준)

---

## 2. 현재 구현 상태 (Baseline)

### 2.1 코드 인벤토리

```
V2 구현 파일: 33개, 6,347줄
├── gateway/src/agent/     (8파일, 1,180줄) — State Machine + Mock AI + Prompts
├── gateway/src/workers/   (4파일, 382줄)   — ClaudeCliWorker + Manager
├── gateway/src/channels/  (5파일, 259줄)   — Manager + Telegram + Dashboard
├── gateway/src/memory/    (2파일, 307줄)   — SQLite + FTS5
├── gateway/src/rpc/       (5파일, 236줄)   — Router + 13 Methods
├── protocol/src/          (2파일, 491줄)   — Agent/RPC Types
├── client/src/            (1파일, 419줄)   — RPC Client Methods
└── web/src/components/    (7파일, 618줄)   — V2 Dashboard UI
```

### 2.2 완료 항목 (Phase 1-4)

| 구분 | 항목 | 상태 |
|------|------|------|
| FS1 | WS RPC 시스템 (handler, router, 13 methods) | ✅ 완전 구현 |
| FS2 | Codex Agent 상태머신 (7 states, event-driven) | ✅ 완전 구현 |
| FS2 | Worker Manager (child_process, pool, timeout) | ✅ 완전 구현 |
| FS2 | Approval Workflow (Promise-based, 5분 auto-approve) | ✅ 완전 구현 |
| FS3 | Channel Manager (plugin registry, broadcast) | ✅ 완전 구현 |
| FS3 | Telegram Channel Plugin (HTTP bridge) | ✅ 완전 구현 |
| FS3 | Dashboard Channel Plugin (WS event mapping) | ✅ 완전 구현 |
| FS4 | Memory Store (SQLite + FTS5, auto-pruning) | ✅ 완전 구현 |
| FS4 | Dashboard V2 UI (7 components) | ✅ 완전 구현 |
| FS4 | Config v2.0 Schema + resolveV2Config() | ✅ 완전 구현 |
| FS4 | System Prompts (Analyzer/Planner/Reviewer) | ✅ 참조 문서 |
| FS4 | Protocol v0.3.0 확장 (RPC/Agent/Worker types, 13 RPC methods) | ✅ 완전 구현 |

### 2.3 미완료 항목 (Phase 5+)

| # | 항목 | 현재 상태 | 기술 부채 수준 |
|---|------|----------|--------------|
| 1 | AI API 실연동 | Mock pattern-matching (TODO 3개) | **CRITICAL** |
| 2 | 에러 복구 + 재시도 | 1회 재시도, 큐잉 없음 | HIGH |
| 3 | 보안 강화 | API Key 단일 비교, enforcement 미연결 | HIGH |
| 4 | 테스트 확장 | 179개 (gateway 104 + telegram 51 + core 24, agent 단위테스트 0개) | HIGH |
| 5 | CI/CD 파이프라인 | 로컬 turbo만, GitHub Actions 없음 | MEDIUM |
| 6 | api-worker.ts | 미구현 (타입만 정의) | MEDIUM |
| 7 | tmux-worker.ts | 미구현 (타입만 정의) | LOW |
| 8 | patterns.ts 분리 | store.ts에 통합 상태 | LOW |
| 9 | 프로젝트 레지스트리 자동탐색 | Config만 존재 | MEDIUM |
| 10 | 문서화 | README만 존재 | MEDIUM |
| 11 | Docker 워커 격리 | 미구현 | LOW (향후) |
| 12 | 벡터 임베딩 메모리 | Config placeholder만 | LOW (향후) |
| 13 | Slack/Discord 채널 | 미구현 | LOW (향후) |
| 14 | nonce 핸드셰이크 | 미구현 | LOW (향후) |
| 15 | hot reload / network discovery | 미구현 | LOW (향후) |

---

## 3. Phase 5.0: Complete V2 (13-20일)

> **목표**: v2 핵심 가치 활성화 + 운영 안전성 + 워커 다양화 + 메모리 고도화 + 확장 기능 + 운영 도구
> **원칙**: 이 Phase를 완료하면 v2.0이 실제로 "자율 AI 에이전트"로 동작하며, 운영·확장·문서까지 완비

### 3.0.0 타입/설정 사전 확장 (P0, 0.5일)

**현재**: `WorkerConfig.type`이 `child_process|tmux`만 허용(`protocol/agent.ts:216`). Phase 5.0-5.1에서 추가할 `claude-api`, `docker` 워커 타입과 `maxRetries`, `maxQueueSize` 등 설정이 타입에 없음.

```yaml
Step 5.0.0: 타입/설정 사전 확장
  파일:
    - packages/protocol/src/agent.ts  # WorkerConfig.type 확장, AgentConfig 필드 추가
    - packages/protocol/src/rpc.ts    # 필요시 RPC 메서드 추가
    - packages/gateway/src/auth.ts    # resolveV2Config에 새 필드 default 추가
  구현:
    - WorkerConfig.type: 'child_process' | 'tmux' | 'claude-api' | 'docker'
    - WorkerTask.type에 'claude-api' | 'docker' 추가
    - AgentConfig에 maxRetries(기본 2), maxQueueSize(기본 10) 필드 추가
    - SecurityConfig에 blockedCommandPatterns: RegExp[] 변환 헬퍼
    - resolveV2Config()에 새 필드 default 값 반영
  검증 기준:
    - [ ] tsc --noEmit 전 패키지 통과
    - [ ] 기존 179 테스트 회귀 없음
    - [ ] 새 타입이 gateway/client 양쪽에서 import 가능
```

### 3.0.1 AI API 통합 — Analyzer (P0, 2일)

**현재**: `analyzer.ts` L25에 `// TODO: Implement real AI API call`. 모든 명령이 mock pattern-matching으로 분석됨. intent/complexity 판단이 regex 기반으로 부정확.

**발견된 구체적 문제 (B1-B7)**:
- `targetFiles: []` 항상 빈 배열 (L67) — 파일 경로 추론 없음
- `risks: []` 항상 빈 배열 (L71) — 위험 분석 없음
- `extractProjectFromCommand` 6개 내부 패키지만 인식 (L79-93)
- "show me how to implement X" → `question` 오탐 (L38, "show" 매칭)
- `needsConfirmation` 패턴 부족 (L73): `rm`, `truncate`, `overwrite` 누락
- memory/히스토리 컨텍스트 없음 — 반복 작업 학습 불가
- `prompts.ts`의 `ANALYZER_SYSTEM_PROMPT` 미사용 (export만)

**구현 차단 요소**:
- `analyze(command, context)` 시그니처에 memory/projects 인자 없음 — 시그니처 변경 필요
- `AnalyzerContext`가 `{ projectPath?: string }`만 정의 (types.ts L3-5) — 확장 필요
- `prompts.ts`의 시스템 프롬프트가 tool_use 스키마(`analyze_command`)를 문자열로 정의 — AI SDK의 tool definition으로 변환 필요

**구현 계획**:

```yaml
Step 5.0.1: Analyzer AI 통합
  파일:
    - packages/gateway/package.json          # openai SDK 의존성 추가
    - packages/gateway/src/agent/analyzer.ts # OpenAI/Anthropic API 호출
    - packages/gateway/src/agent/types.ts    # AnalyzerProvider 인터페이스 + AnalyzerContext 확장
    - packages/gateway/src/agent/providers/  # 신규 디렉토리
    - packages/gateway/src/agent/providers/openai.ts    # OpenAI 구현
    - packages/gateway/src/agent/providers/anthropic.ts  # Anthropic 구현
    - packages/gateway/src/agent/providers/mock.ts       # 기존 mock 이전
  구현:
    A. Provider 인터페이스 (types.ts):
      ```typescript
      interface AiProvider {
        analyze(command: string, context: AnalyzerContext): Promise<Analysis>;
        plan(analysis: Analysis, context: PlannerContext): Promise<ExecutionPlan>;
        review(results: WorkerResult[], task: AgentTask): Promise<ReviewReport>;
      }
      interface AnalyzerContext {
        projectPath?: string;
        projects?: ProjectConfig['registered'];     // 등록된 프로젝트 목록
        recentTasks?: CompletedTask[];               // 최근 작업 히스토리
        patterns?: LearningPattern[];                // 학습된 패턴
      }
      ```

    B. OpenAI Provider:
      - openai SDK v4 설치 (`openai` 패키지)
      - gpt-4o + tool_use(analyze_command) 호출
      - tool definition: prompts.ts의 스키마를 JSON Schema로 변환
      - response_format 강제: tool_use 응답만 수락
      - 타임아웃: 15초 (AbortController)
      - 에러 처리: 401 → "API 키 확인 필요", 429 → 대기 후 재시도

    C. Anthropic Provider:
      - @anthropic-ai/sdk 설치
      - claude-sonnet-4-5 + tool_use 호출
      - 동일 tool definition 공유

    D. Mock Provider 분리:
      - analyzer.ts의 mockAnalyze() → providers/mock.ts로 이전
      - 기존 regex 패턴 보존 (테스트 호환)
      - B5 수정: needsConfirmation에 `rm|truncate|revert|overwrite|wipe|destroy` 추가

    E. Reporter 연동 수정 (E1, E2):
      - server.ts에서 reporter.onReport() 등록 → ChannelManager.broadcast() 연결
      - agent 이벤트 → reporter → channels 경로 확립

  DRY 분석:
    - prompts.ts 재사용 (이미 작성된 시스템 프롬프트)
    - Analysis 타입 재사용 (protocol/agent.ts에 이미 정의)
    - config.agent 설정 재사용 (auth.ts의 resolveV2Config)
  트레이드오프:
    옵션 A: OpenAI만 지원 (공수 LOW, 리스크 MEDIUM — 벤더 종속)
    옵션 B: Provider 패턴으로 추상화 (공수 MEDIUM, 리스크 LOW — 권장)
    옵션 C: LangChain 사용 (공수 HIGH, 리스크 MEDIUM — 과잉 엔지니어링)
    추천: 옵션 B — 간단한 인터페이스로 OpenAI/Anthropic/Mock 3개 구현
  검증 기준:
    - [ ] config.agent.provider='openai' + 유효한 API 키 → 실제 API 호출
    - [ ] "console 인증 리팩토링" → intent:coding, complexity:complex, useOrchestration:true
    - [ ] "현재 빌드 상태?" → intent:question, complexity:simple
    - [ ] config.agent.provider='mock' → 기존 mock 동작 유지 (회귀 없음)
    - [ ] API 키 없거나 잘못됨 → 명확한 에러 메시지 + mock fallback
    - [ ] API 응답 <15초 (타임아웃 처리, AbortController)
    - [ ] targetFiles 비어있지 않음 (AI가 파일 추론)
    - [ ] risks 비어있지 않음 (파괴적 작업 시)
    - [ ] "show me how to implement auth" → intent:coding (question 아님)
```

### 3.0.2 AI API 통합 — Planner (P0, 1일)

**현재**: `planner.ts` L22에 `// TODO: Implement real AI API call`. 전략 결정이 requirements.length 기반 하드코딩.

**발견된 구체적 문제 (C1-C6)**:
- `plan(analysis)` 시그니처에 memory/patterns 인자 없음 (L17-27) — V2 문서 §6.2 위반
- `mockPlan` strategy가 parallel이어도 워커 1개만 생성 (L31-41)
- `projectPath` 폴백이 `process.cwd()` (L36) — 데몬 실행 시 `/` 또는 Gateway 디렉토리
- `rollbackStrategy` 하드코딩 `"git stash"` (L50) — 비-git 프로젝트에서 의미 없음
- `determineStrategy`: `requirements.length > 1` (L57) — mock analyzer가 항상 1개 requirement 반환하므로 parallel이 절대 선택 안 됨
- orchestration 삽입: `complexity === 'complex'`이면 무조건 (L39-40) — `intent:question`인데 complex면 불필요한 orchestration

**구현 차단 요소**:
- `agent.ts:215`에서 `planner.plan(analysis)`만 호출 — memory 인자 전달 경로 없음
- CodexAgent 생성자에 memoryStore 주입 안 됨 (agent.ts:22-29 — workerManager만)
- agent.ts의 `executeWorkers` 함수(L301-368)는 plan.workers를 그대로 사용 — AI Planner가 다중 워커를 생성하면 바로 동작하지만, 각 워커의 projectPath가 올바른지 검증 로직 없음

```yaml
Step 5.0.2: Planner AI 통합
  파일:
    - packages/gateway/src/agent/planner.ts       # AI API 호출 추가
    - packages/gateway/src/agent/agent.ts          # memoryStore 주입 + plan() 호출 변경
    - packages/gateway/src/agent/providers/openai.ts   # plan 메서드 추가
    - packages/gateway/src/agent/providers/mock.ts     # 기존 mock 이전
    - packages/gateway/src/server.ts               # CodexAgent 생성 시 memoryStore 전달
  구현:
    A. 시그니처 변경:
      ```typescript
      // before
      plan(analysis: Analysis): Promise<ExecutionPlan>
      // after
      plan(analysis: Analysis, context?: {
        recentTasks?: CompletedTask[];
        patterns?: LearningPattern[];
        projectRegistry?: ProjectRegistry;
      }): Promise<ExecutionPlan>
      ```

    B. AI Provider plan 메서드:
      - gpt-4o + tool_use(create_plan) 호출
      - PLANNER_SYSTEM_PROMPT 실제 사용
      - context에 유사 작업 + 학습 패턴 주입
      - AI가 strategy, workers[], checkpoints 생성
      - 각 worker.projectPath 검증 (ProjectRegistry.resolveProject)

    C. Mock Provider 수정:
      - 기존 determineStrategy → requirements 기반이 아닌 analysis.complexity 기반
      - parallel 전략 시 2개 이상 워커 생성 (테스트 가능하도록)
      - projectPath fallback: config.workspacePath → analysis.targetProject → process.cwd()

    D. agent.ts 변경:
      - CodexAgentOptions에 memoryStore 추가
      - runPipeline에서 `planner.plan(analysis, { recentTasks, patterns })` 호출
      - executeWorkers 진입 시 각 worker.projectPath 존재 여부 검증

  DRY 분석:
    - AnalyzerProvider 패턴 재사용
    - prompts.ts 재사용
    - ExecutionPlan 타입 재사용 (protocol/agent.ts)
  의존성: Step 5.0.1 (Provider 패턴 공유)
  트레이드오프:
    옵션 A: Analyzer와 같은 모델 사용 (공수 LOW, 일관성 높음)
    옵션 B: Planner만 더 강력한 모델 (예: o1) (공수 LOW, 비용 HIGH)
    추천: 옵션 A — 동일 모델, tool_use 스키마만 다르게
  검증 기준:
    - [ ] Analysis + Memory → 의미 있는 ExecutionPlan 생성
    - [ ] complex 작업 → /orchestration 포함 워커 프롬프트
    - [ ] 유사 과거 작업 존재 → 과거 패턴 반영된 계획
    - [ ] memory 비어있음 → 정상 동작 (memory 없이도 계획 수립)
    - [ ] parallel 전략 → 워커 2개 이상 생성
    - [ ] 각 워커의 projectPath가 유효한 디렉토리
    - [ ] intent:question + complexity:complex → orchestration 미삽입
    - [ ] rollbackStrategy가 프로젝트 타입에 따라 변경 (git/none)
```

### 3.0.3 AI API 통합 — Reviewer (P0, 1일)

**현재**: `reviewer.ts` L20에 `// TODO: Implement real AI API call`. 성공/실패 판정이 regex 패턴 매칭.

**발견된 구체적 문제 (D1-D6, Critical 포함)**:
- **[CRITICAL] testFail 오탐** (L34): `/\d+\s*(fail|실패)/i` → `"0 failed"` 매칭 → 성공인 테스트를 실패로 판정
  ```
  입력: "Tests  42 passed, 0 failed"
  현재: testFail=true (0이 \d+에 매칭) → status:'partial'
  기대: testFail=false → status:'success'
  ```
- shouldRetry 조건 제한적 (L42-43): TypeScript 에러(≤5)만 → 빌드 실패, 의존성 누락 등 미처리
- details 2000자 앞부분만 유지 (L52): 에러는 보통 출력 끝에 있어 손실됨
- extractChangedFiles (L76-90): Claude CLI 실제 출력 형식 (`Edit: packages/...`, `Write: packages/...`) 미매칭
- extractTestResults (L93-95): 첫 매칭만 — vitest+jest 동시 실행 시 하나만 캡처

**구현 차단 요소**:
- Mock fallback에서 D1 버그가 남아있으면 AI 실패 시 여전히 오탐 발생
- `review(results, task)` 시그니처는 유지 가능 — 내부 로직만 변경

```yaml
Step 5.0.3: Reviewer AI 통합
  파일:
    - packages/gateway/src/agent/reviewer.ts       # AI API 호출 추가
    - packages/gateway/src/agent/providers/openai.ts   # review 메서드 추가
    - packages/gateway/src/agent/providers/mock.ts     # D1-D6 버그 수정
  구현:
    A. AI Provider review 메서드:
      - gpt-4o + tool_use(review_result) 호출
      - REVIEWER_SYSTEM_PROMPT 실제 사용
      - 워커 stdout + exitCode + duration + 원본 requirements 전달
      - AI가 status, summary, changedFiles, shouldRetry 판정

    B. Mock Provider 버그 수정 (즉시 적용 가능):
      - D1 수정: testFail 패턴 → `/[1-9]\d*\s*(fail|실패)/i` (0이 아닌 숫자만)
        또는 파싱 방식: match `(\d+)\s*fail` → parseInt > 0 체크
      - D2 수정: shouldRetry 확장
        ```typescript
        const retriable = typeErrors <= 5
          || /ENOENT|MODULE_NOT_FOUND|Cannot find module/i.test(output)
          || status === 'timeout';
        ```
      - D3 수정: details = output.slice(-2000) (끝부분 우선)
        또는 에러 섹션 추출 후 + 마지막 500자
      - D4 수정: extractChangedFiles 패턴 추가
        ```typescript
        /(?:Edit|Write|Create):\s*(.+\.(?:ts|tsx|js|json|md|css))/gi,
        /(?:packages\/[^\s]+\.(?:ts|tsx|js|json))/g,
        ```
      - D5 수정: extractTestResults → matchAll + join

    C. Fallback 체인:
      - AI 호출 → 성공 시 AI 결과 사용
      - AI 실패 → mock regex (버그 수정된 버전)으로 기본 판정
      - 에러 로깅: "AI review failed, using regex fallback"

  DRY 분석:
    - Provider 패턴 재사용 (Step 5.0.1)
    - ReviewReport 타입 재사용 (protocol/agent.ts)
  의존성: Step 5.0.1 (Provider 패턴 공유)
  트레이드오프:
    옵션 A: AI 전용 (regex 완전 폐기) — 리스크: API 장애 시 판정 불가
    옵션 B: AI + regex fallback (권장) — AI 실패 시 기존 regex로 기본 판정
    추천: 옵션 B — AI가 주 경로, regex가 fallback
  검증 기준:
    - [ ] 성공한 워커 출력 → status:success + 의미 있는 summary
    - [ ] 빌드 실패 출력 → status:failed + 에러 원인 분석
    - [ ] API 실패 → regex fallback으로 기본 판정 (에러 로그)
    - [ ] shouldRetry 판단: 타입 에러 → true, 아키텍처 문제 → false
    - [ ] "42 passed, 0 failed" → status:success (D1 수정 확인)
    - [ ] "42 passed, 3 failed" → status:partial (정상 실패 감지)
    - [ ] 타임아웃 워커 → shouldRetry:true
    - [ ] details에 에러 메시지 포함 (끝부분 기준)
    - [ ] Claude CLI "Edit: packages/gateway/..." → changedFiles에 포함
```

### 3.0.4 보안 강화 (P0, 1-2일)

**현재**: SecurityConfig가 protocol/agent.ts에 정의되어 있으나, 런타임에서 enforcement되지 않음.

**발견된 구체적 문제 (A5, A9, B5, H1, H3-H6, J2, K1, M4-M5)**:
- `blockedCommands` 배열: 체크 로직 없음 (A9) — 어디서도 if 분기 없음
- `approvalRequired` 배열: 체크 로직 없음 (A9) — analyzer.needsConfirmation만 사용
- `SecurityConfig.blockedCommands`가 `string[]` (M4) — 정확한 문자열 비교만 가능, glob/regex 불가
- `DEFAULT_SECURITY_CONFIG`이 빈 배열 (M5) — 기본적으로 모든 명령 허용
- auto-approve 5분 타임아웃이 파괴적 명령에도 적용 (A5): `rm -rf /` → 5분 후 자동 실행
- 워커 환경변수 블랙리스트 불완전 (H1): 3개만 제거 (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OLYMPUS_AGENT_API_KEY`) — `AWS_SECRET_ACCESS_KEY`, `GITHUB_TOKEN`, `DATABASE_URL` 등 미제거
- `--dangerously-skip-permissions` 항상 설정 (H3): 워커가 항상 권한 무시 모드
- stderr 크기 무제한 (H4): `errorOutput` 무한 증가 가능
- terminate 시 timeout 미정리 (H5): 이미 종료된 프로세스에 SIGKILL 시도
- `ChannelMessage.type`에 'approval' 없음 (J2): 승인 요청 채널 전달 불가
- RPC rate limiting 없음 (K1): 인증된 클라이언트가 무한 요청 가능

```yaml
Step 5.0.4: 보안 Enforcement 구현
  파일:
    - packages/gateway/src/agent/agent.ts        # 명령 검증 로직 추가
    - packages/gateway/src/workers/claude-worker.ts # 환경변수 격리 강화
    - packages/gateway/src/auth.ts               # config.security 로드 개선
  구현:
    A. 명령 검증 게이트 (agent.ts runPipeline 진입점):
      ```typescript
      // runPipeline() 시작 직후 (agent.ts L174 이후)
      private validateCommand(command: string, security: SecurityConfig): void {
        // 1. blockedCommands 검사 — glob 패턴 매칭
        for (const pattern of security.blockedCommands) {
          if (minimatch(command, pattern) || command.includes(pattern)) {
            throw new Error(`차단된 명령: ${pattern}`);
          }
        }
        // 2. approvalRequired → needsConfirmation 강제
        for (const pattern of security.approvalRequired) {
          if (command.match(new RegExp(pattern, 'i'))) {
            // analysis.needsConfirmation = true 강제
          }
        }
      }
      ```
      - 파괴적 명령 감지 시 auto-approve 타임아웃 비활성화 (A5 수정):
        ```typescript
        // agent.ts L233 부근
        const isDestructive = /(rm\s+-rf|drop\s+table|git\s+push\s+--force|DELETE\s+FROM)/i.test(cmd.command);
        const approveTimeout = isDestructive ? Infinity : 300_000;
        ```

    B. 워커 격리 Level 1 (claude-worker.ts):
      - 환경변수 **화이트리스트** 방식으로 전환 (H1 수정):
        ```typescript
        private buildSafeEnv(): NodeJS.ProcessEnv {
          const ALLOWED_KEYS = [
            'PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TERM', 'SHELL',
            'CLAUDE_NO_TELEMETRY', 'NODE_ENV', 'TMPDIR',
          ];
          const env: NodeJS.ProcessEnv = {};
          for (const key of ALLOWED_KEYS) {
            if (process.env[key]) env[key] = process.env[key];
          }
          env.CLAUDE_NO_TELEMETRY = '1';
          return env;
        }
        ```
      - stderr도 maxOutputBuffer 적용 (H4 수정)
      - terminate()에서 clearTimeouts() 호출 (H5 수정)
      - `--dangerously-skip-permissions` 제어: config.security.skipPermissions (기본: true) (H3)

    C. Protocol 타입 수정 (M4, M5):
      - `SecurityConfig.blockedCommands`: `string[]` 유지하되 glob 패턴 허용
      - `SecurityConfig.approvalRequired`: regex 문자열로 사용 명시
      - DEFAULT_SECURITY_CONFIG에 기본 위험 명령 추가:
        ```typescript
        blockedCommands: ['rm -rf /', 'DROP TABLE', 'format c:'],
        approvalRequired: ['push', 'deploy', 'delete', 'rm -rf'],
        ```

    D. 채널 타입 수정 (J2):
      - `ChannelMessage.type`에 `'approval'` 추가

    E. RPC Rate Limiting (K1):
      - 클라이언트별 분당 요청 카운터 (기본: 120 req/min)
      - 초과 시 `RATE_LIMIT_EXCEEDED` RPC 에러 반환

    F. 비밀 관리:
      - config.json에 chmod 600 자동 적용 (install.sh)
      - API 키 로그 마스킹 (기존 redactSecrets 패턴 활용)
  DRY 분석:
    - SecurityConfig 타입 재사용 (protocol/agent.ts)
    - redactSecrets() 재사용 (telegram-bot/src/digest/)
    - resolveV2Config() 재사용 (auth.ts)
  트레이드오프:
    옵션 A: 화이트리스트 환경변수 (권장, 공수 LOW, 보안 HIGH)
    옵션 B: Docker 격리 (공수 HIGH, 보안 VERY HIGH — Step 5.0.13)
    옵션 C: 현상 유지 (공수 NONE, 보안 LOW — 위험)
    추천: 옵션 A
  검증 기준:
    - [ ] blockedCommands=['rm -rf', 'git push --force'] → 해당 명령 즉시 거부
    - [ ] approvalRequired=['deploy', 'push'] → needsConfirmation 강제
    - [ ] 파괴적 명령 + auto-approve → 타임아웃 비활성화, 수동 승인만
    - [ ] 워커 프로세스 env에 OPENAI_API_KEY/ANTHROPIC_API_KEY 없음
    - [ ] config.json 파일 권한 600 (owner read/write only)
```

### 3.0.5 에러 복구 + 큐잉 강화 (P0, 1일)

**현재**:
- agent.ts에서 1회 재시도만 지원 (A3)
- WorkerManager.execute()가 maxConcurrent 초과 시 즉시 failed WorkerResult 반환 (G1)
- 네트워크/API 에러에 대한 체계적 복구 없음

**발견된 구체적 문제 (A1-A3, A6-A8, G1-G4, I3, K2-K4, L1-L4, O2-O3)**:
- pipeline 전략이 sequential로 처리됨 — output chaining 미구현 (A1)
- resetToIdle 강제 리셋이 버그를 마스킹 (A2)
- cancel 시 approval Promise 미정리 → 메모리 릭 (A6)
- task.state과 _state 이중 추적 — 불일치 가능 (A8)
- 워커 60초 정리 지연 (G2): 완료 워커가 Map에 남아 getActiveCount에 영향
- worker:error 이벤트가 server.ts에서 핸들링되지 않음 (G4, L4)
- workers.list RPC에서 projectPath/startedAt 누락 (K2)
- sessions.list가 매번 tmux 스캔 (K3)
- agent.reject의 reason 파라미터 무시 (K4)
- Memory 초기화 실패 무시 (I3, L1)
- persistAgentResult에서 currentTask 접근 경쟁 조건 (L2)
- Telegram config 이중 로드 (L3)
- Client 연결 끊김 시 pending RPC 미정리 (O2)
- 세션 재구독 시 유효성 미확인 (O3)

```yaml
Step 5.0.5: 에러 복구 + 큐잉
  파일:
    - packages/gateway/src/agent/agent.ts        # 재시도 로직 강화
    - packages/gateway/src/workers/manager.ts    # 워커 큐 추가
  구현:
    A. 워커 큐 (manager.ts — G1, G2 수정):
      ```typescript
      // 현재 (manager.ts L31-41):
      if (activeCount >= this.maxConcurrent) {
        return { status: 'failed', error: '동시 워커 한계 초과' };  // 즉시 실패
      }
      // 변경 후:
      private queue: Array<{ task: WorkerTask; resolve: Function; reject: Function }> = [];
      async execute(task: WorkerTask): Promise<WorkerResult> {
        if (this.getActiveCount() >= this.maxConcurrent) {
          if (this.queue.length >= this.maxQueueSize) {
            return { status: 'failed', error: '워커 큐가 가득 찼습니다' };
          }
          return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            this.emit('worker:queued', { workerId: task.id, queuePosition: this.queue.length });
          });
        }
        return this.executeNow(task);
      }
      private dequeue(): void {  // worker 완료 시 호출
        if (this.queue.length > 0 && this.getActiveCount() < this.maxConcurrent) {
          const next = this.queue.shift()!;
          this.executeNow(next.task).then(next.resolve).catch(next.reject);
        }
      }
      ```
      - 60초 정리 지연 → completed worker를 별도 `recentResults` Map으로 이동 (G2)
      - getActiveCount()가 running 워커만 카운트하도록 보장

    B. 재시도 강화 (agent.ts — A1, A2, A3, A6, A8 수정):
      - 재시도 횟수 설정 가능 (config.agent.maxRetries, 기본 2)
      - 지수 백오프 (1초 → 2초 → 4초)
      ```typescript
      // 현재 (agent.ts L272-284):
      if (report.shouldRetry) {  // 1회만, 백오프 없음
        // ...retry once
      }
      // 변경 후:
      let retryCount = 0;
      while (report.shouldRetry && retryCount < this.config.maxRetries) {
        retryCount++;
        const delay = 1000 * Math.pow(2, retryCount - 1);
        await new Promise(r => setTimeout(r, delay));
        this.emitProgress(`재시도 ${retryCount}/${this.config.maxRetries}...`);
        // 이전 실패 컨텍스트를 워커 프롬프트에 주입
        const retryPlan = this.injectRetryContext(plan, report);
        const retryResults = await this.executeWorkers(retryPlan);
        report = await this.reviewer.review(retryResults, task);
      }
      ```
      - A1 수정 (pipeline): executeWorkers에서 output chaining 구현
        ```typescript
        case 'pipeline': {
          let previousOutput = '';
          for (const workerTask of plan.workers) {
            if (previousOutput) {
              workerTask.prompt += `\n\n--- 이전 단계 출력 ---\n${previousOutput.slice(-2000)}`;
            }
            const result = await this.workerManager.execute(workerTask);
            results.push(result);
            previousOutput = result.output;
          }
          break;
        }
        ```
      - A2 수정: resetToIdle 강제 리셋 제거 → 정상 경로만 허용
      - A6 수정: cancel() 내에서 `this._approvalResolve?.(false)` 호출
      - A8 수정: transitionTo()에서 `task.state = newState` 동기화

    C. AI API 에러 복구:
      - API 타임아웃 → 재시도 (최대 3회, 지수 백오프)
      - Rate limit → 대기 후 재시도 (Retry-After 헤더 존중)
      - API 다운 → mock fallback + 경고 로그

    D. Server 통합 수정 (L1-L4):
      - L1: Memory 초기화 실패 시 경고 이벤트 발생
      - L2: persistAgentResult를 resetToIdle **전에** 실행, 또는 이벤트 payload에 task 데이터 포함
        ```typescript
        // 현재 (server.ts L586):
        const task = this.agent.currentTask;  // resetToIdle 후 null 가능!
        // 수정: agent.ts에서 result 이벤트에 task 데이터 포함
        this.emit('result', { taskId: task.id, report: task.report, task: { ...task } });
        ```
      - L3: loadConfig() 1회 호출 후 변수 재사용
      - L4: `worker:error` 이벤트 핸들러 추가
        ```typescript
        this.workerManager.on('worker:error', (payload: unknown) => {
          this.broadcastToAll('worker:error', payload);
        });
        ```

    E. RPC 수정 (K2-K4):
      - K2: ClaudeCliWorker에 projectPath/startedAt getter 추가 → workers.list에 반영
      - K3: sessions.list에 캐시 적용 (30초 TTL, reconcile 주기와 동일)
      - K4: agent.reject(taskId, reason) → reason 파라미터 전달 + 로깅

    F. Client 수정 (O2, O3):
      - O2: onclose에서 모든 pending RPC Promise reject
        ```typescript
        this.ws.onclose = () => {
          // Reject all pending RPC calls
          for (const handler of this.handlers.get('rpc:result') || []) {
            // ... reject pending promises
          }
        };
        ```
      - O3: reconnect 시 서버에서 유효 세션 목록 받은 후 재구독
  DRY 분석:
    - RECONNECT_BASE_DELAY 패턴 재사용 (protocol/constants.ts)
    - classifyError() 패턴 재사용 (telegram-bot/src/error-utils.ts)
  트레이드오프:
    옵션 A: 단순 큐 + 고정 재시도 (공수 LOW, 유연성 LOW)
    옵션 B: 설정 가능 큐 + 지수 백오프 (공수 MEDIUM, 유연성 HIGH — 권장)
    옵션 C: 분산 큐 (Redis) (공수 HIGH, 과잉 — 단일 인스턴스에 불필요)
    추천: 옵션 B
  검증 기준:
    - [ ] maxConcurrent=2, 3번째 워커 요청 → 큐에 대기 → 1번 완료 후 자동 시작
    - [ ] 워커 실패 (TypeScript 에러) → 자동 재시도 (이전 에러 컨텍스트 포함)
    - [ ] 워커 실패 (아키텍처 문제) → 재시도 안 함, 사용자 알림
    - [ ] API 타임아웃 → 3회 재시도 후 mock fallback
    - [ ] 큐 가득 참 → 명확한 에러 메시지 ("워커 큐가 가득 찼습니다")
```

### Phase 5.0 산출물 요약

| Step | 파일 변경 | 신규 파일/의존성 | 해결 이슈 | 테스트 추가 |
|------|----------|----------------|----------|-----------|
| 5.0.0 | protocol/agent.ts, protocol/rpc.ts, auth.ts | 없음 | M1-M5, N1 | 타입 검증 (tsc) |
| 5.0.1 | analyzer.ts, types.ts, package.json | providers/, openai SDK | B1-B7, E1-E2, F1 | analyzer.test.ts (8+) |
| 5.0.2 | planner.ts, agent.ts, server.ts | providers/openai plan | C1-C6, A4 | planner.test.ts (8+) |
| 5.0.3 | reviewer.ts | providers/mock fix | D1-D6 | reviewer.test.ts (8+) |
| 5.0.4 | agent.ts, claude-worker.ts, auth.ts, types.ts | 없음 | A5, A9, B5, H1-H6, J2, K1, M4-M5 | security.test.ts (10+) |
| 5.0.5 | agent.ts, manager.ts, server.ts, client.ts | 없음 | A1-A3, A6-A8, G1-G4, I3, K2-K4, L1-L4, O2-O3 | retry-queue.test.ts (10+) |
| 5.0.6 | manager.ts, types.ts, index.ts | api-worker.ts | G3, H2 | api-worker.test.ts (5+) |
| 5.0.7 | manager.ts, index.ts | tmux-worker.ts | — | tmux-worker.test.ts (5+) |
| 5.0.8 | store.ts, planner.ts, agent.ts, index.ts | patterns.ts | A4, C1, I1-I5, K5 | patterns.test.ts (5+) |
| 5.0.9 | analyzer.ts, index.ts | project-registry.ts | B3, B4 | project-registry.test.ts (4+) |
| 5.0.10 | — | ci.yml | — | — |
| 5.0.11 | — | 3개 문서 | N2 | — |
| 5.0.12 | — | __tests__/*.ts, ci.yml, release.yml | — | 35+ |
| 5.0.13 | manager.ts | docker-worker.ts, Dockerfile | M1-M2 | docker-worker.test.ts (5+) |
| 5.0.14 | channels/index.ts | slack.ts, discord.ts | J3-J4, K6 | channel.test.ts (8+) |
| 5.0.15 | store.ts | embeddings.ts | — | embeddings.test.ts (4+) |
| 5.0.16 | — | nonce.ts | L5, O1 | nonce.test.ts (3+) |

**Phase 5.0 완료 기준** (이슈 참조 포함):
- [ ] Codex Agent가 실제 AI API로 명령 분석→계획→검토 수행 (B1-B7, C1-C6, D1-D6)
- [ ] blockedCommands/approvalRequired 런타임 enforcement 동작 (A5, A9, M4-M5)
- [ ] 워커 큐잉 + 재시도(지수 백오프) 동작 (A3, G1)
- [ ] pipeline 전략에서 output chaining 동작 (A1)
- [ ] AI API 장애 시 mock fallback 동작 (D1 버그 수정 포함)
- [ ] 파괴적 명령 auto-approve 비활성화 (A5)
- [ ] 워커 환경변수 화이트리스트 방식 (H1)
- [ ] persistAgentResult 경쟁 조건 해결 (L2)
- [ ] testFail "0 failed" 오탐 해결 (D1 — CRITICAL)
- [ ] V2 Transformation 문서의 모든 계획된 파일 존재
- [ ] api-worker, tmux-worker가 WorkerManager에서 Factory 패턴으로 사용 가능 (G3)
- [ ] PatternManager 분리 + FTS5 UPDATE 트리거 추가 (I1) + Planner 연동 (A4, C1)
- [ ] findPatterns SQL 최적화 (I2)
- [ ] 프로젝트 자동 탐색: config.projects + 워크스페이스 스캔 (B3, B4)
- [ ] Memory RPC 메서드 추가: `memory.search`, `memory.patterns` (K5)
- [ ] API/사용자/아키텍처 문서 완성 (RPC 메서드 수 정정: 13개, N2)
- [ ] GitHub Actions CI 파이프라인 동작
- [ ] 테스트 총 297+ (179 기존 + 118 신규)
- [ ] Docker 워커 격리 동작 (선택적, M1-M2 타입 활용)
- [ ] Slack/Discord 채널 동작 (J3-J4 수정 포함, K6 RPC 추가)
- [ ] 벡터 검색 동작 (선택적)
- [ ] nonce 핸드셰이크 동작
- [ ] Graceful shutdown (L5): RPC drain period 구현
- [ ] Client RPC 타입 안전성 (O1): 제네릭 타입 적용
- [ ] 기존 179 테스트 회귀 없음

### 3.0.6 api-worker.ts — HTTP 기반 워커 (P1, 1일)

**배경**: V2 Transformation 문서 §5.2(L1382)에서 `api-worker.ts`를 명시. 현재 `child_process` 기반 `claude-worker.ts`만 존재. API 워커는 Claude/OpenAI HTTP API를 직접 호출하여 코드 생성/분석을 수행하는 경량 워커.

**구현 차단 요소**:
- `WorkerManager.execute()` (manager.ts:43)이 항상 `new ClaudeCliWorker()` 생성 (G3) — Factory 패턴 필요
- `WorkerTask.type`에 'claude-api' 존재 (protocol/agent.ts:81) — 타입은 준비됨
- `WorkerConfig`에 apiKey 없음 — API 워커가 어떤 키를 사용할지 불명확
- `claude-worker.ts`의 `buildPrompt()` (L163-168)가 `/orchestration "..."` 형식 생성 — API 워커에는 부적절
- `config.logDir` 미사용 (H2) — 로그 기록 패턴을 api-worker에서도 통일 필요

```yaml
Step 5.0.6: API Worker 구현
  파일:
    - packages/gateway/src/workers/api-worker.ts  # 신규
    - packages/gateway/src/workers/manager.ts     # 워커 타입 분기 추가
    - packages/gateway/src/workers/types.ts       # ApiWorkerConfig 추가
    - packages/gateway/src/workers/index.ts       # export 추가
  구현:
    - ApiWorker 클래스 (ClaudeCliWorker와 동일 인터페이스)
    - Claude API Messages 직접 호출 (streaming)
    - 스트리밍 출력 → 'output' 이벤트 발생 (동일 인터페이스)
    - 완료 시 전체 응답 → 'done' 이벤트
    - config.workers.type에 따라 manager가 적절한 워커 생성
  DRY 분석:
    - ClaudeCliWorker의 EventEmitter 패턴 재사용
    - WorkerResult 타입 재사용 (protocol/agent.ts)
    - Provider 패턴 재사용 (Step 5.0.1)
  트레이드오프:
    옵션 A: Claude API만 (공수 LOW, 충분) — 권장
    옵션 B: Claude + OpenAI API (공수 MEDIUM, 유연성 HIGH)
    옵션 C: 범용 HTTP Worker (공수 HIGH, 과잉)
    추천: 옵션 A — Claude API Streaming으로 충분
  적용 시나리오:
    - 간단한 질문/분석 → API 워커 (빠르고 가벼움, 프로세스 생성 불필요)
    - 코딩/테스트 작업 → CLI 워커 (파일 접근, 도구 사용 필요)
  검증 기준:
    - [ ] config.workers.type='claude-api' → ApiWorker 생성
    - [ ] API 워커 실행 → streaming output 이벤트 발생
    - [ ] API 워커 완료 → done 이벤트 + WorkerResult
    - [ ] API 워커 타임아웃 → 요청 abort + 에러
    - [ ] config.workers.type='child_process' → 기존 동작 유지 (회귀 없음)
```

### 3.0.7 tmux-worker.ts — 하위 호환 워커 (P1, 1일)

**배경**: V2 Transformation 문서 §5.2(L1383)에서 `tmux-worker.ts` 명시. 기존 v0.3.0의 tmux 세션 방식을 워커 인터페이스로 래핑하여 하위 호환 제공.

**구현 차단 요소**:
- `SessionManager`가 tmux 세션을 직접 관리 (session-manager.ts) — TmuxWorker와 역할 충돌 가능
- `pipe-pane` 출력 캡처 패턴이 telegram-bot에 있음 — 공유 유틸 추출 필요
- 완료 감지가 어려움: Claude CLI가 프롬프트 복귀하는 시점을 정확히 알기 어려움 (프롬프트 패턴 매칭 필요)
- `execFileSync`를 사용해야 함 (보안: shell injection 방지) — 기존 패턴 적용

```yaml
Step 5.0.7: tmux Worker 구현
  파일:
    - packages/gateway/src/workers/tmux-worker.ts  # 신규
    - packages/gateway/src/workers/manager.ts      # 워커 타입 분기 추가
    - packages/gateway/src/workers/index.ts        # export 추가
  구현:
    - TmuxWorker 클래스 (ClaudeCliWorker와 동일 인터페이스)
    - tmux new-session → send-keys → pipe-pane으로 출력 캡처
    - 파일 오프셋 방식으로 실시간 출력 스트리밍 (기존 SessionManager 패턴)
    - 완료 감지: tmux 세션 종료 또는 Claude CLI 프롬프트 복귀
    - kill-session으로 정리
  DRY 분석:
    - SessionManager의 tmux 명령 패턴 재사용 (session-manager.ts)
    - execFileSync 패턴 재사용 (보안: shell injection 방지)
    - pipe-pane + 파일 오프셋 패턴 재사용 (telegram-bot)
    - validateTmuxTarget() 재사용
  트레이드오프:
    옵션 A: 기존 SessionManager 래핑 (공수 LOW, 결합도 HIGH)
    옵션 B: 독립 구현 + 공통 유틸 추출 (공수 MEDIUM, 결합도 LOW — 권장)
    옵션 C: 구현하지 않음 (child_process로 충분) — 하위 호환 포기
    추천: 옵션 B — tmux 유틸을 공통으로 추출하여 SessionManager와 공유
  검증 기준:
    - [ ] config.workers.type='tmux' → TmuxWorker 생성
    - [ ] tmux 세션 생성 + Claude CLI 실행 + 출력 스트리밍
    - [ ] 완료 감지 → done 이벤트 + 출력 수집
    - [ ] 타임아웃 → kill-session + 에러
    - [ ] 세션 이름 충돌 없음 (고유 접두사)
```

### 3.0.8 patterns.ts 분리 + Memory-Planner 연동 (P1, 1일)

**배경**: V2 Transformation 문서 §5.2(L1390)에서 `memory/patterns.ts`를 별도 파일로 명시. 현재 학습 패턴 로직이 `store.ts`에 통합되어 있으며, Planner가 Memory를 참조하지 않는 상태.

**발견된 구체적 문제 (I1-I5)**:
- FTS5 UPDATE 트리거 누락 (I1, store.ts:87-93): completed_tasks 업데이트 시 검색 인덱스 미동기화
- findPatterns가 전체 테이블 로드 (I2, store.ts:201-224): SQL에서 필터링 가능한데 JS에서 처리
- 초기화 실패 무시 (I3, store.ts:97-101): better-sqlite3 미설치 시 조용히 no-op
- rowToTask 런타임 검증 없음 (I4): DB 스키마 변경 시 런타임 에러 가능
- WAL 체크포인트 없음 (I5): WAL 파일 무한 증가 가능

**구현 차단 요소**:
- `agent.ts`에서 `memoryStore` 접근 경로 없음 — CodexAgentOptions에 memoryStore 추가 필요 (5.0.2에서 선행)
- `savePattern`/`findPatterns`이 store.ts에 있음 — 이전 시 기존 테스트 경로 변경 필요
- `recordOutcome()` (자동 학습)의 패턴 추출 로직이 없음 — AI API 또는 규칙 기반 추출 구현 필요

```yaml
Step 5.0.8: Memory 패턴 분리 + Planner 연동
  파일:
    - packages/gateway/src/memory/patterns.ts  # 신규: 학습 패턴 관리
    - packages/gateway/src/memory/store.ts     # 패턴 관련 메서드 → patterns.ts로 이전
    - packages/gateway/src/memory/index.ts     # PatternManager export 추가
    - packages/gateway/src/agent/planner.ts    # Memory + Pattern 주입
    - packages/gateway/src/agent/agent.ts      # Planner에 memory 전달
  구현:
    A. patterns.ts:
      - PatternManager 클래스
      - savePattern(trigger, action, confidence) → store 위임
      - findPatterns(intent, query) → 관련 패턴 검색
      - updateConfidence(id, success: boolean) → 신뢰도 갱신
      - pruneOldPatterns(maxAge) → 오래된 패턴 정리
      - recordOutcome(taskId, success) → 완료 결과 기반 패턴 학습

    B. store.ts 정리:
      - savePattern/findPatterns/getPatterns → PatternManager로 위임
      - store.ts는 순수 영속성(CRUD)만 담당

    C. Planner 연동:
      - planner.plan(analysis, memory, patterns) 시그니처 확장
      - 유사 작업 검색: memory.searchTasks(query)
      - 관련 패턴: patterns.findPatterns(analysis.intent)
      - AI 프롬프트에 context로 주입
  DRY 분석:
    - store.ts의 기존 패턴 메서드 로직 이전 (리팩토링, 중복 없음)
    - LearningPattern 타입 재사용 (protocol/agent.ts)
  트레이드오프:
    옵션 A: 파일만 분리 (공수 LOW, Planner 연동은 별도)
    옵션 B: 분리 + Planner 연동 (공수 MEDIUM — 권장)
    옵션 C: 분리 + 자동 학습 루프 (공수 HIGH, 별도 후속 작업)
    추천: 옵션 B
  검증 기준:
    - [ ] PatternManager.savePattern() → DB에 저장
    - [ ] PatternManager.findPatterns('coding') → 관련 패턴 반환
    - [ ] Planner가 Memory + Patterns를 AI 프롬프트에 포함
    - [ ] 기존 store.test.ts 회귀 없음
    - [ ] 새 patterns.test.ts 5+ 테스트
```

### 3.0.9 프로젝트 레지스트리 자동 탐색 (P1, 0.5일)

**배경**: V2 Transformation 문서 §5.1 Step 4.4(L1354-1362). config.projects.registered에 수동 등록만 가능. 워크스페이스 내 프로젝트 자동 탐색 없음.

```yaml
Step 5.0.9: 프로젝트 자동 탐색
  파일:
    - packages/gateway/src/agent/project-registry.ts  # 신규
    - packages/gateway/src/agent/analyzer.ts          # 프로젝트 컨텍스트 주입
    - packages/gateway/src/agent/index.ts             # export 추가
  구현:
    - ProjectRegistry 클래스
    - scanWorkspace(rootPath): 루트에서 package.json/Cargo.toml/go.mod 탐색
    - registerProject(name, path, aliases): 수동 등록
    - resolveProject(nameOrAlias): 이름/별칭으로 경로 해석
    - getProjectList(): Analyzer에 전달할 프로젝트 목록
    - config.projects.registered → 초기 등록
    - 워크스페이스 자동 스캔 → config에 없는 프로젝트 발견 시 추가
  DRY 분석:
    - ProjectConfig 타입 재사용 (protocol/agent.ts)
    - config.projects 설정 재사용
  트레이드오프:
    옵션 A: package.json만 탐색 (공수 LOW, Node.js만)
    옵션 B: 다중 언어 탐색 (공수 MEDIUM — 권장)
    옵션 C: 파일 시스템 워처 + 실시간 갱신 (공수 HIGH, 과잉)
    추천: 옵션 B — 초기 1회 스캔, 캐시, 수동 갱신 가능
  검증 기준:
    - [ ] scanWorkspace('/Users/jobc/dev') → olympus, console 등 발견
    - [ ] resolveProject('console') → /Users/jobc/dev/console
    - [ ] resolveProject('api') → /Users/jobc/dev/console/apps/api (alias)
    - [ ] 존재하지 않는 프로젝트 → null + 유사 프로젝트 제안
```

### 3.0.10 CI 최소 게이트 (P1, 0.5일)

**배경**: P0 항목에서 대규모 변경이 발생하므로, 회귀 방지를 위해 최소 CI를 P1 초기에 설정. (Codex 리뷰 반영: P2→P1 승격)

```yaml
Step 5.0.10: CI 최소 게이트
  파일:
    - .github/workflows/ci.yml   # 신규: 최소 CI
  구현:
    - Push/PR 트리거 → pnpm build && pnpm test && pnpm lint
    - 캐싱: pnpm store, turbo cache
    - 브랜치 보호 규칙 (선택)
  검증 기준:
    - [ ] PR 생성 → CI 자동 실행 → 결과 표시
    - [ ] 테스트 실패 → CI 실패 (merge 차단)
```

> **Note**: Step 5.0.16의 테스트 대폭 확장은 유지하되, 여기서 최소 게이트만 먼저 설정.

### 3.0.11 문서화 (P1, 1일)

**배경**: V2 Transformation 문서 Phase 5(L1141). 현재 README.md/README.en.md만 존재.

```yaml
Step 5.0.11: API 문서 + 사용자 가이드
  파일:
    - docs/V2_API_REFERENCE.md       # 신규: RPC API 레퍼런스
    - docs/V2_USER_GUIDE.md          # 신규: v2 사용자 가이드
    - docs/V2_ARCHITECTURE.md        # 신규: 아키텍처 문서
  구현:
    A. API Reference:
      - 13개 RPC 메서드 상세 (2 system + 11 agent/worker/session) (파라미터, 응답, 에러 코드)
      - WS 이벤트 목록 (agent:progress, worker:*, session:*)
      - REST API 엔드포인트 (기존 + 신규)
      - 인증 방법 (API Key, 헤더)

    B. User Guide:
      - 설치 및 설정 (install.sh, config.json)
      - Agent 사용법 (Telegram/Dashboard에서 명령)
      - 워커 관리 (모니터링, 종료)
      - 트러블슈팅 가이드

    C. Architecture:
      - 패키지 구조도 (의존성 그래프)
      - Agent State Machine 다이어그램
      - 데이터 흐름 시퀀스
      - 보안 모델
  DRY 분석:
    - V2_TRANSFORMATION.md의 다이어그램 재사용
    - protocol/rpc.ts의 타입 정의에서 API 스펙 추출
  검증 기준:
    - [ ] 14개 RPC 메서드 모두 문서화
    - [ ] 설치→설정→사용 워크플로우 재현 가능
    - [ ] 코드 예시 포함 (TypeScript)
```

### 3.0.12 테스트 스위트 대폭 확장 + CI/CD (P2, 2일)

```yaml
Step 5.0.12: 테스트 + CI 파이프라인
  파일:
    - packages/gateway/src/agent/__tests__/   # 신규 디렉토리
    - .github/workflows/ci.yml                # 신규: GitHub Actions
    - .github/workflows/release.yml           # 신규: Release workflow
  구현:
    A. Agent 단위 테스트 (현재 0개):
      - analyzer.test.ts: mock/real provider 전환, 모든 intent 분류
      - planner.test.ts: 전략 결정 로직, memory 주입, /orchestration 삽입
      - reviewer.test.ts: 성공/실패/부분 판정, shouldRetry 조건
      - agent.test.ts: 상태 전이, 에러 복구, 승인 워크플로우
      - reporter.test.ts: 포맷 변환, 아이콘, 4000자 제한

    B. 통합 테스트 (V2 Transformation §18.1 Level 2):
      - agent-workflow.test.ts: 전체 워크플로우 (Mock API)
      - worker-lifecycle.test.ts: 생성→실행→완료→정리
      - rpc-roundtrip.test.ts: WS RPC 왕복
      - channel-routing.test.ts: 채널→에이전트→채널
      - memory-search.test.ts: FTS5 검색 정확도

    C. CI 파이프라인:
      - GitHub Actions: push/PR → build → test → lint
      - 아티팩트: 테스트 결과, 커버리지 리포트
      - 브랜치 보호: main에 직접 push 차단
  트레이드오프:
    옵션 A: vitest만 (공수 LOW, 충분)
    옵션 B: vitest + Playwright E2E (공수 HIGH, Dashboard 시각 테스트)
    추천: 옵션 A — 단위+통합만, E2E는 향후
  검증 기준:
    - [ ] Agent 단위 테스트 25+ 추가
    - [ ] 통합 테스트 10+ 추가
    - [ ] GitHub Actions CI 동작 (push → 전체 파이프라인)
    - [ ] 테스트 커버리지 ≥70%
```

### 3.0.13 Docker 워커 격리 Level 2 (P2, 2일)

**배경**: V2 Transformation §14.2(L1939-1942). 최대 보안 격리.

```yaml
Step 5.0.13: Docker Worker
  파일:
    - packages/gateway/src/workers/docker-worker.ts   # 신규
    - packages/gateway/src/workers/Dockerfile.worker   # 신규
    - packages/gateway/src/workers/manager.ts          # docker 타입 분기
  구현:
    - DockerWorker 클래스 (ClaudeCliWorker 인터페이스)
    - Dockerfile: node + claude-cli 이미지
    - 프로젝트 디렉토리 read-write 마운트
    - 네트워크 제한 (필요 시 host 네트워크)
    - 환경변수 최소화 (CLAUDE_API_KEY만)
    - 출력 스트리밍: docker logs --follow
    - 종료: docker stop + docker rm
  의존성: Docker 설치 필요 (Optional — docker 없으면 child_process fallback)
  트레이드오프:
    옵션 A: Dockerfile + docker run (공수 MEDIUM, 충분 — 권장)
    옵션 B: Docker Compose (공수 MEDIUM, 불필요한 복잡성)
    옵션 C: Podman 지원 추가 (공수 HIGH, 플랫폼 다양성)
    추천: 옵션 A
  검증 기준:
    - [ ] config.workers.type='docker' → Docker 워커 생성
    - [ ] 워커 컨테이너 내에서 Claude CLI 실행 + 출력 스트리밍
    - [ ] 워커 종료 → 컨테이너 정리 (zombie 없음)
    - [ ] docker 미설치 시 → 자동 fallback (child_process)
    - [ ] 워커 컨테이너에 호스트 환경변수 유출 없음
```

### 3.0.14 Slack/Discord 채널 플러그인 (P2, 2일)

**배경**: V2 Transformation Out-of-Scope #3. Channel Plugin 아키텍처가 이미 준비되어 있어 추가 채널 구현이 용이.

```yaml
Step 5.0.14: 추가 채널 플러그인
  파일:
    - packages/gateway/src/channels/slack.ts      # 신규
    - packages/gateway/src/channels/discord.ts    # 신규
    - packages/gateway/src/channels/index.ts      # export 추가
  구현:
    A. Slack 채널:
      - Slack Bolt SDK 사용
      - ChannelPlugin 인터페이스 구현
      - 슬래시 커맨드 (/olympus) → agent.command 라우팅
      - 에이전트 응답 → Slack 메시지 포맷 (Block Kit)
      - 스레드 기반 대화 (작업별 스레드)

    B. Discord 채널:
      - Discord.js 사용
      - ChannelPlugin 인터페이스 구현
      - !olympus 명령 → agent.command 라우팅
      - 에이전트 응답 → Discord Embed 포맷
  DRY 분석:
    - ChannelPlugin 인터페이스 재사용 (channels/types.ts)
    - ChannelManager 브로드캐스트 재사용
    - Telegram 채널의 마크다운 변환 패턴 참조
  트레이드오프:
    옵션 A: Slack만 (공수 LOW, 기업 환경 우선)
    옵션 B: Slack + Discord (공수 MEDIUM — 권장)
    옵션 C: 범용 Webhook (공수 LOW, 기능 제한)
    추천: 옵션 B
  검증 기준:
    - [ ] Slack /olympus 명령 → 에이전트 실행 → 결과 응답
    - [ ] Discord !olympus 명령 → 에이전트 실행 → 결과 응답
    - [ ] 채널 플러그인 등록/해제 정상
    - [ ] 에이전트 진행 상태 실시간 업데이트
```

### 3.0.15 벡터 임베딩 메모리 (P3, 1일)

**배경**: V2 Transformation Out-of-Scope #2. FTS5 이상의 의미 기반 검색.

```yaml
Step 5.0.15: 벡터 검색 확장
  파일:
    - packages/gateway/src/memory/embeddings.ts   # 신규
    - packages/gateway/src/memory/store.ts        # 벡터 검색 추가
  구현:
    - EmbeddingProvider 인터페이스
    - OpenAI text-embedding-3-small 구현
    - SQLite vec 확장 (sqlite-vec) 또는 별도 벡터 DB
    - 작업 저장 시 자동 임베딩 생성
    - 코사인 유사도 기반 유사 작업 검색
    - config.memory.embeddingProvider로 활성화/비활성화
  트레이드오프:
    옵션 A: sqlite-vec (공수 LOW, SQLite 통합, 성능 제한적)
    옵션 B: 별도 벡터 DB (Chroma/Qdrant) (공수 MEDIUM, 성능 좋음)
    옵션 C: 메모리 내 벡터 (공수 LOW, 재시작 시 소실 — 비추)
    추천: 옵션 A — 기존 SQLite 인프라 활용
  검증 기준:
    - [ ] 작업 저장 시 벡터 자동 생성
    - [ ] 의미 유사 검색: "인증 리팩토링" → "로그인 모듈 변경" 매칭
    - [ ] FTS5 대비 검색 품질 향상 확인
    - [ ] config.memory.embeddingProvider='off' → FTS5만 사용 (회귀 없음)
```

### 3.0.16 기타 운영 도구 (P3, 1일)

```yaml
Step 5.0.16: 운영 도구
  항목:
    A. nonce 핸드셰이크 (보안):
      - connect 시 서버 챌린지 발급 → 클라이언트 HMAC 서명 → 검증
      - 리플레이 공격 방지

    B. hot reload 정책:
      - 설정 변경 시 Gateway 재시작 없이 적용
      - config.json 파일 워처 (fs.watch)
      - 채널 플러그인 동적 로드/언로드

    C. network discovery (선택):
      - mDNS/Bonjour로 로컬 네트워크 내 Gateway 자동 발견
      - Tailscale 통합 (원격 접근 시)
  트레이드오프:
    옵션 A: nonce만 (가장 보안 가치 높음 — 권장)
    옵션 B: nonce + hot reload (공수 MEDIUM)
    옵션 C: 전부 (공수 HIGH, 지금은 과잉)
    추천: 옵션 A — nonce는 보안 강화에 직결, 나머지는 v2.1+
  검증 기준:
    - [ ] nonce: 같은 토큰 2회 사용 → 거부
    - [ ] nonce: 타임스탬프 5분 초과 → 거부
```

---

## 4. 의존성 그래프

```
Phase 5.0 (Complete V2) — 단일 Phase, 우선순위별 실행
═══════════════════════════════════════════════════════

[P0] 핵심 가치 + 안전성 (5-7일)
─────────────────────────────────────────────────
  5.0.0 타입/설정 확장 ────── 선행 (다른 모든 Step의 기반)
  5.0.1 AI API: Analyzer ──┐
  5.0.2 AI API: Planner  ──┤── 순차 (Provider 패턴 공유)
  5.0.3 AI API: Reviewer  ─┘
  5.0.4 보안 강화 ─────────── 독립 (5.0.1과 병렬 가능)
  5.0.5 에러 복구 + 큐잉 ──── 독립 (5.0.1과 병렬 가능)

[P1] 완성도 (3-5일)
─────────────────────────────────────────────────
  5.0.6 api-worker  ─────────── 독립
  5.0.7 tmux-worker ─────────── 독립 (5.0.6과 병렬)
  5.0.8 patterns.ts + Planner ─ 의존: 5.0.2 (Planner AI)
  5.0.9 프로젝트 레지스트리 ──── 의존: 5.0.1 (Analyzer에 주입)
  5.0.10 CI 최소 게이트 ────── 독립 (빠르게 설정)
  5.0.11 문서화 ────────────── 의존: P0 전체 (API 확정 후)

[P2/P3] 확장 + 운영 (5-8일)
─────────────────────────────────────────────────
  5.0.12 테스트 + CI 확장 ──── 독립 (P0/P1 코드 대상)
  5.0.13 Docker 워커 ────────── 의존: 5.0.6/5.0.7 (워커 추상화)
  5.0.14 Slack/Discord ──────── 독립
  5.0.15 벡터 임베딩 ────────── 의존: 5.0.8 (PatternManager)
  5.0.16 nonce + 운영도구 ──── 독립
```

**최적 실행 순서** (병렬화 고려):

```
Week 1 [P0]:
  [5.0.0] 타입 확장 (선행)
  [5.0.1] AI Analyzer  ─→ [5.0.2] AI Planner ─→ [5.0.3] AI Reviewer
  [5.0.4] 보안 강화     (병렬)
  [5.0.5] 에러 복구     (병렬)

Week 2 [P1]:
  [5.0.10] CI 최소 게이트 (가장 먼저 — 이후 변경에 안전망)
  [5.0.6] api-worker   + [5.0.7] tmux-worker  (병렬)
  [5.0.8] patterns.ts  + [5.0.9] project-registry (병렬)
  [5.0.11] 문서화

Week 3-4 [P2/P3]:
  [5.0.12] 테스트 + CI 확장
  [5.0.13] Docker 워커  + [5.0.14] Slack/Discord (병렬)
  [5.0.15] 벡터 임베딩
  [5.0.16] nonce + 운영도구
```

---

## 5. 우선순위 매트릭스

| 우선순위 | Step | 항목 | 이유 | 공수 |
|---------|------|------|------|------|
| **P0** | 5.0.0 | 타입/설정 사전 확장 | 모든 Step의 기반 타입 | 0.5일 |
| **P0** | 5.0.1-3 | AI API 통합 (Analyzer/Planner/Reviewer) | v2 핵심 가치 — mock으로는 자율 에이전트 불가 | 4일 |
| **P0** | 5.0.4 | 보안 Enforcement | blockedCommands/approvalRequired 미강제 위험 | 1.5일 |
| **P0** | 5.0.5 | 에러 복구 + 큐잉 | 운영 안정성 필수 | 1일 |
| **P1** | 5.0.6 | api-worker.ts | V2 문서 계획 완성도 + 경량 작업 효율 | 1일 |
| **P1** | 5.0.7 | tmux-worker.ts | V2 문서 계획 완성도 + 하위 호환 | 1일 |
| **P1** | 5.0.8 | patterns.ts + Planner 연동 | 학습 루프 완성 — v2 차별화 기능 | 1일 |
| **P1** | 5.0.9 | 프로젝트 레지스트리 | 멀티 프로젝트 UX 개선 | 0.5일 |
| **P1** | 5.0.10 | CI 최소 게이트 | 회귀 방지 안전망 | 0.5일 |
| **P1** | 5.0.11 | 문서화 | 사용자/개발자 온보딩 | 1일 |
| **P2** | 5.0.12 | 테스트 대폭 확장 + CI | 회귀 방지 게이트 | 2일 |
| **P2** | 5.0.13 | Docker 워커 격리 | 최대 보안 — 선택적 | 2일 |
| **P2** | 5.0.14 | Slack/Discord 채널 | 사용자 접점 확대 | 2일 |
| **P3** | 5.0.15 | 벡터 임베딩 메모리 | FTS5로 충분, 향후 개선 | 1일 |
| **P3** | 5.0.16 | nonce + 운영 도구 | 로컬 사용 시 낮은 위험 | 1일 |
| **N/A** | — | macOS/iOS/Android 앱 | 별도 프로젝트, Olympus 범위 밖 | — |
| **N/A** | — | TUI 대폭 변경 | SSH 경량 모니터링만 유지 | — |

---

## 6. 성공 기준 종합

### Phase 5.0 완료 시

```
[핵심 가치 — P0]
✅ Telegram에서 "gateway 테스트 추가해줘" 입력
→ Codex Agent가 실제 AI API로 분석 (intent:testing, complexity:moderate)
→ 실행 계획 수립 (strategy:single, /orchestration 주입)
→ Claude CLI 워커 실행
→ 실시간 모니터링 (빌드/테스트 결과 자동 감지)
→ AI 기반 결과 검토 (success/partial/failed 판정)
→ 구조화된 보고서 → Telegram/Dashboard 전송
→ Memory에 히스토리 저장

[완성도 — P1]
✅ 간단한 질문 → API 워커로 빠른 응답 (프로세스 생성 없이)
✅ tmux 환경에서도 워커 실행 가능 (하위 호환)
✅ 유사 작업 패턴 학습 → 반복 요청에 빠른 계획 수립
✅ "console 빌드해줘" → 자동으로 /Users/jobc/dev/console 경로 해석
✅ API/사용자/아키텍처 문서 완비

[확장 — P2/P3]
✅ GitHub Actions CI → 매 PR에 자동 테스트
✅ Docker 격리 워커 (선택적, 최대 보안)
✅ Slack/Discord에서도 에이전트 명령 가능
✅ 의미 기반 유사 작업 검색 (벡터 임베딩)
✅ nonce 기반 리플레이 공격 방지
```

---

## 7. 리스크 매트릭스

| 리스크 | 심각도 | 확률 | 점수 | 완화 전략 |
|--------|--------|------|------|----------|
| AI API 비용 폭발 | HIGH | MEDIUM | 10 | 토큰 제한, mock fallback, 모니터링 |
| AI API 품질 불안정 | MEDIUM | MEDIUM | 6 | regex fallback, 프롬프트 튜닝, 모델 교체 가능 |
| Docker 격리 성능 저하 | LOW | HIGH | 4 | child_process fallback, 선택적 사용 |
| Slack/Discord SDK 호환성 | LOW | LOW | 2 | ChannelPlugin 추상화로 교체 용이 |
| sqlite-vec 안정성 | MEDIUM | MEDIUM | 6 | FTS5 fallback, 선택적 기능 |
| 보안 강화로 기존 사용자 불편 | LOW | MEDIUM | 3 | 점진적 적용, 기본값 보수적 |
| 테스트 확장으로 CI 시간 증가 | LOW | HIGH | 4 | 병렬 실행, 캐싱, 단계별 실행 |

---

## 8. N/A 항목 (범위 외)

다음 항목은 V2 Transformation 문서에 언급되었으나, Olympus 프로젝트 범위 밖이거나 별도 프로젝트로 분리하는 것이 적절하다:

| 항목 | 사유 | 대안 |
|------|------|------|
| macOS/iOS/Android 노드 앱 | 별도 프로젝트 | Olympus Gateway HTTP API를 활용하는 네이티브 앱으로 분리 |
| TUI 패키지 대폭 변경 | 현재 SSH 경량 모니터링으로 충분 | packages/tui는 현상 유지, 필요 시 별도 리팩토링 |
| 분산 워커 풀 (Redis) | 단일 인스턴스에 불필요 | 로컬 메모리 큐로 충분 (Phase 5.0.5) |
| LLM Fine-tuning | Olympus 범위 밖 | 범용 모델 사용, 프롬프트 최적화로 대체 |

---

## 9. 기술 부채 현황 및 해결 계획

| 부채 | 이슈 # | 현재 상태 | 해결 Phase | 위험도 |
|------|--------|----------|-----------|--------|
| Mock AI (3개 파일 TODO) | B1-B7, C1-C6, D1-D6 | Pattern matching only | 5.0 (P0) | CRITICAL |
| testFail 오탐 "0 failed" | D1 | 성공 테스트를 실패로 판정 | 5.0 (P0) | CRITICAL |
| 파괴적 명령 자동승인 | A5 | 5분 후 모든 명령 자동 승인 | 5.0 (P0) | CRITICAL |
| persistAgentResult 경쟁 | L2 | currentTask null 접근 가능 | 5.0 (P0) | CRITICAL |
| SecurityConfig 미강제 | A9, M4-M5 | 선언만 존재, enforcement 없음 | 5.0 (P0) | HIGH |
| 워커 큐 없음 | G1 | maxConcurrent 초과 즉시 실패 | 5.0 (P0) | HIGH |
| 워커 환경변수 유출 | H1 | 블랙리스트 3개만 (수십개 미처리) | 5.0 (P0) | HIGH |
| pipeline 전략 미구현 | A1 | sequential로 대체, output chaining 없음 | 5.0 (P0) | HIGH |
| cancel 시 Promise 릭 | A6 | approval Promise 미정리 | 5.0 (P0) | HIGH |
| Memory-Planner 미연동 | A4, C1 | planner.plan(analysis)만 호출 | 5.0 (P1) | HIGH |
| Agent 단위 테스트 0개 | — | 통합 테스트만 | 5.0 (P2) | MEDIUM |
| CI 파이프라인 없음 | — | 로컬만 | 5.0 (P1) | MEDIUM |
| FTS5 UPDATE 트리거 누락 | I1 | UPDATE 시 검색 인덱스 미동기화 | 5.0 (P1) | MEDIUM |
| patterns.ts 미분리 | I2 | store.ts에 통합, 비효율 쿼리 | 5.0 (P1) | LOW |
| 워커 타입 2종 미구현 | G3, M1-M2 | child_process만, Factory 없음 | 5.0 (P1) | MEDIUM |
| 프로젝트 자동 탐색 없음 | B3, B4 | 6개 내부 패키지만 인식 | 5.0 (P1) | MEDIUM |
| API 문서 없음 | N2 | README만, RPC 메서드 수 불일치 | 5.0 (P1) | MEDIUM |
| reporters 미연결 | E1-E2 | 리스너 빈 배열, Channel 경유 없음 | 5.0 (P0) | MEDIUM |
| stderr 무제한 증가 | H4 | errorOutput maxOutputBuffer 미적용 | 5.0 (P0) | MEDIUM |
| RPC SessionsListRpcResult unknown[] | N1 | 타입 안전성 없음 | 5.0 (P0) | LOW |
| client RPC 타입 안전 | O1 | 아무 문자열 허용 | 5.0 (P2) | LOW |

---

## Appendix A: 파일 변경 요약

### Phase 5.0 전체 (변경 15개+, 신규 16개+)

```
수정:
  packages/protocol/src/agent.ts                   # 워커/설정 타입 확장
  packages/protocol/src/rpc.ts                     # 메서드 추가
  packages/gateway/package.json                    # openai SDK 추가
  packages/gateway/src/agent/analyzer.ts           # AI Provider 통합
  packages/gateway/src/agent/planner.ts            # AI Provider 통합
  packages/gateway/src/agent/reviewer.ts           # AI Provider 통합
  packages/gateway/src/agent/agent.ts              # 보안 enforcement + 재시도 강화
  packages/gateway/src/workers/manager.ts          # 워커 큐 + 타입 분기 + docker
  packages/gateway/src/auth.ts                     # security config 로드
  packages/gateway/src/workers/types.ts            # 워커 타입 추가
  packages/gateway/src/workers/index.ts            # export 추가
  packages/gateway/src/memory/store.ts             # 패턴 로직 분리 + 벡터 검색
  packages/gateway/src/memory/index.ts             # PatternManager export
  packages/gateway/src/agent/index.ts              # ProjectRegistry export
  packages/gateway/src/channels/index.ts           # Slack/Discord export
  packages/client/src/client.ts                    # RPC 타입 안전 + pending 정리

신규 파일:
  packages/gateway/src/agent/providers/openai.ts   # OpenAI Provider
  packages/gateway/src/agent/providers/anthropic.ts # Anthropic Provider
  packages/gateway/src/agent/providers/mock.ts     # Mock Provider (기존 이전)
  packages/gateway/src/workers/api-worker.ts       # HTTP API 워커
  packages/gateway/src/workers/tmux-worker.ts      # tmux 워커
  packages/gateway/src/workers/docker-worker.ts    # Docker 워커
  packages/gateway/src/workers/Dockerfile.worker   # Docker 이미지
  packages/gateway/src/memory/patterns.ts          # 학습 패턴 관리
  packages/gateway/src/memory/embeddings.ts        # 벡터 임베딩
  packages/gateway/src/agent/project-registry.ts   # 프로젝트 자동 탐색
  packages/gateway/src/channels/slack.ts           # Slack 채널
  packages/gateway/src/channels/discord.ts         # Discord 채널
  packages/gateway/src/rpc/nonce.ts                # nonce 핸드셰이크
  .github/workflows/ci.yml                        # CI 파이프라인
  .github/workflows/release.yml                   # Release workflow

신규 문서:
  docs/V2_API_REFERENCE.md
  docs/V2_USER_GUIDE.md
  docs/V2_ARCHITECTURE.md

신규 테스트:
  packages/gateway/src/agent/__tests__/analyzer.test.ts
  packages/gateway/src/agent/__tests__/planner.test.ts
  packages/gateway/src/agent/__tests__/reviewer.test.ts
  packages/gateway/src/agent/__tests__/security.test.ts
  packages/gateway/src/agent/__tests__/agent.test.ts
  packages/gateway/src/agent/__tests__/reporter.test.ts
  packages/gateway/src/workers/__tests__/retry-queue.test.ts
  packages/gateway/src/workers/__tests__/api-worker.test.ts
  packages/gateway/src/workers/__tests__/tmux-worker.test.ts
  packages/gateway/src/workers/__tests__/docker-worker.test.ts
  packages/gateway/src/memory/__tests__/patterns.test.ts
  packages/gateway/src/memory/__tests__/embeddings.test.ts
  packages/gateway/src/agent/__tests__/project-registry.test.ts
  packages/gateway/src/channels/__tests__/channel.test.ts
  packages/gateway/src/rpc/__tests__/nonce.test.ts
  + 추가 통합/워크플로우 테스트 (10+)
```

---

## Appendix B: Codex 합의 사항

Phase 5.0 통합 로드맵에 대한 Claude-Codex 합의 내용:

1. **AI API 통합은 P0** — v2 핵심 가치 활성화에 필수 (Codex: [AGREE])
2. **Provider 패턴 추상화** — OpenAI/Anthropic/Mock 전환 가능 (Codex: [AGREE])
3. **보안 enforcement P0 상향** — blockedCommands/approvalRequired 즉시 구현 (Codex: [AGREE])
4. **patterns.ts 분리** — store.ts는 영속성, patterns.ts는 학습 로직 (Codex: [SUGGEST → AGREE])
5. **단일 Phase 5.0 통합** — 16개 항목 P0/P1/P2/P3 우선순위로 구분, 단일 Phase 실행 (Codex: [AGREE])
6. **macOS/TUI는 N/A** — 별도 프로젝트/현상 유지 (Codex: [AGREE])
7. **CI 파이프라인** — GitHub Actions로 회귀 방지 (Codex: [SUGGEST — 추가])
8. **Memory-Planner 연동 필수** — planner.ts가 memory를 참조해야 함 (Codex: [SUGGEST — 추가])

✅ Claude-Codex Consensus Reached (8/8 합의)

---

*이 문서는 `OLYMPUS_V2_TRANSFORMATION.md`와 `V2_CONTRACT.md`를 기반으로, Phase 5.0 후속 작업의 상세 실행 계획을 정의합니다. 16개 항목이 단일 Phase 5.0으로 통합되어 P0→P1→P2→P3 우선순위 순서로 실행됩니다.*
