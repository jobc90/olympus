# Olympus 워크플로우 개선 계획 v3.0

> **작성일**: 2026-02-20
> **기반 분석**: OPENCLAW_VS_OLYMPUS_ANALYSIS.md + 5개 독립 감사 + 사용자 6개 대화 요구사항
> **현재 버전**: v0.5.1 (commit 7633efa)
> **목표**: 실사용 시나리오 기반 워크플로우 완전 정상화

---

## 사용자 시나리오 (설계 기준)

```
사무실 컴퓨터 (상시 가동):
  $ olympus server start        → Gateway (8200) + Dashboard (8201) + Telegram Bot
  $ olympus start-trust × 4~N   → Claude CLI Worker 4+ 대기

사무실 근무:
  - 대시보드 열어놓고 모니터링 (OlympusMountain 캐릭터 움직임)
  - 워커 카드 클릭 → 작업 이력/로그 확인
  - Zeus(Codex) 카드 클릭 → 대화창으로 명령

퇴근/외출:
  - 텔레그램으로 명령 전달 ("@apollo 코드 리뷰해줘")
  - 텔레그램으로 실시간 스트리밍 결과 수신
  - 텔레그램으로 상황 보고 수신 (완료/실패/Gemini 리뷰)

보고 체계:
  - Critical/Warning → Codex가 텔레그램으로 자동 Push
  - "특이사항 있어?" → Codex가 Gemini 분석 기반 브리핑
```

---

## 역할 정의 (불변)

| 역할 | 엔티티 | 설명 |
|------|--------|------|
| **사용자 인터페이스** | Codex (Zeus) | 사용자와 대화, 워커 위임, 상황 보고 |
| **지식 고문** | Gemini (Athena) | 프로젝트 분석, 작업 리뷰, 컨텍스트 보강 |
| **실행자** | Workers (Claude CLI) | PTY/Spawn으로 실제 코딩 작업 수행 |
| **인프라** | Gateway | HTTP API + WebSocket + 레지스트리 |

---

## 현재 상태 감사 결과

### 이미 구현된 항목 (변경 불필요)

| 항목 | 상태 | 위치 |
|------|------|------|
| 좀비 워커 감지 (startStaleCheck) | ✅ 완료 | worker-registry.ts:206-243 |
| Task Map LRU 정리 (200개 + 1hr) | ✅ 완료 | worker-registry.ts:154-163, 235-241 |
| ConcurrencyLimiter (큐50 + 120s timeout) | ✅ 완료 | cli-runner.ts:253-299 |
| Gemini Pre/Post Review 비동기 | ✅ 완료 | api.ts:499-508, 620-634 (fire-and-forget) |
| 텔레그램 DraftStream 구현 | ✅ 완료 | telegram-bot/src/draft-stream.ts |
| 텔레그램 보안 3층 (command+isAdmin) | ✅ 완료 | telegram-bot/src/index.ts:117-140 |
| WebSocket 재연결 HTTP catch-up | ✅ 완료 | telegram-bot/src/index.ts:2030-2053 |
| deliveredTasks 중복 방지 | ✅ 완료 | telegram-bot/src/index.ts:104, 1659 |
| worker:died → broadcastToAll 연결 | ✅ 완료 | server.ts:249-252 |
| chatId 워커 태스크 전달 | ✅ 완료 | api.ts:484, worker-registry.ts:97 |
| 응답 필터 파이프라인 (5단계) | ✅ 완료 | gateway/src/response-filter.ts |

### 발견된 문제 (수정 필요)

| 심각도 | 문제 | 영향 | 위치 |
|--------|------|------|------|
| **CRITICAL** | PTY Worker init 무한 대기 | 워커 등록 불가 | cli/src/commands/start.ts:62 |
| **CRITICAL** | Codex→Gemini 컨텍스트 단절 | Codex가 Gemini 분석 무시 | codex-adapter.ts 전체 |
| **HIGH** | forwardToCli 핸들러 블로킹 | 텔레그램 응답 지연 | telegram-bot:1134-1211 |
| **HIGH** | Codex stub 메서드 다수 | 검색/상태/이력 기능 비작동 | codex/*.ts 5개 파일 |
| **HIGH** | 워커 결과 응답 필터 미적용 | 내부 마커/TUI 잔여물 노출 | api.ts:588, 685 |
| **HIGH** | 하이브리드 보고 체계 미구현 | 사용자에게 자동 알림 없음 | 신규 |
| **MEDIUM** | 대시보드 워커 로그 패널 없음 | 워커 작업 이력 확인 불가 | 신규 |
| **MEDIUM** | asyncTasks 메모리 누수 | running 태스크 영구 잔류 | api.ts:1288-1293 |
| **MEDIUM** | Dead code (rootCache 등) | 코드 복잡성 증가 | gemini-advisor.ts |
| **LOW** | GeminiPty 복원력 부족 | MAX_RESTARTS 후 영구 중단 | gemini-pty.ts |

---

## Phase 0: PTY Worker 등록 복구 (P0 — 즉시)

> **이미 적용**: start.ts에 30초 타임아웃 추가 완료

### WI-0.1: PTY Worker init 타임아웃 ✅
- **파일**: `packages/cli/src/commands/start.ts`
- `ptyWorker.start()`에 `Promise.race` 30초 타임아웃 적용
- 타임아웃 시 PTY destroy → spawn 모드 폴백 → 정상 등록 진행
- **상태**: 적용 완료 (빌드 확인)

### WI-0.2: Claude CLI idle prompt 패턴 확장
- **파일**: `packages/cli/src/pty-worker.ts` (lines 101-109)
- Claude CLI 2.1.38 신규 프롬프트 패턴 추가 조사
- `--dangerously-skip-permissions` 모드의 워크스페이스 신뢰 대화상자 대응
- IDLE_PROMPT_PATTERNS에 신규 패턴 추가 (필요시)
- **의존성**: 워커 재시작 후 PTY 출력 캡처로 실제 패턴 확인 필요

---

## Phase 1: Codex 자율성 강화 + Gemini 통합 (P0)

> **핵심 목표**: Codex가 진짜 자율적 AI 비서 역할 수행, Gemini 분석을 실제로 활용

### WI-1.1: Codex→Gemini 컨텍스트 주입
- **파일**: `packages/gateway/src/api.ts` (POST /api/codex/chat, lines 813-1037)
- **현재**: LocalContextStore + GeminiAdvisor의 `buildCodexContext()` 주입됨 (lines 826-853)
- **문제**: Codex Orchestrator 내부 라우팅(Router/AgentBrain)에는 Gemini 컨텍스트 없음
- **수정**:
  - `POST /api/codex/chat` 시스템 프롬프트에 워커 상태 정보 강화:
    ```
    ## 현재 워커 상태
    - apollo: idle (최근 작업: "코드 리뷰" — 성공, 3분전)
    - hermes: busy (현재 작업: "테스트 작성" — 진행중, 5분째)
    - ares: idle (최근 작업: "빌드 수정" — 실패, 에러: type mismatch)
    ```
  - 워커별 최근 작업 이력 1~2건을 시스템 프롬프트에 포함
  - **구현**: `workerRegistry.getAll()` + `workerRegistry.getAllTaskRecords()` 조합

### WI-1.2: Codex stub 메서드 정리
- **파일**: `packages/codex/src/agent-brain.ts`
  - `isHistoryQuery()` (line 38): 하드코딩 → 삭제, `analyzeIntent()`에서 직접 처리
  - `isCrossProjectQuery()` (line 50): 하드코딩 → 삭제
  - `generateStatusReport()` (line 109): 세션 메타데이터만 → 워커 상태 포함으로 확장
- **파일**: `packages/codex/src/router.ts`
  - `projectAliases` Map (line 20): 미사용 → 삭제
- **파일**: `packages/codex/src/session-manager.ts`
  - `contextDbPath` (line 48): 미사용 → 삭제
- **파일**: `packages/codex/src/orchestrator.ts`
  - `initialize()` (line 55-59): 빈 메서드 → 삭제 또는 의미있는 초기화
- **파일**: `packages/gateway/src/codex-adapter.ts`
  - `codex.status` RPC (line 189-196): `projectCount: 0` → 실제 LocalContextStore 프로젝트 수
  - `codex.search` RPC (line 158-187): `[]` 폴백 → LocalContextStore FTS5 검색 활용

### WI-1.3: Codex 워커 위임 응답 템플릿화
- **파일**: `packages/gateway/src/api.ts` (lines 978-1012)
- **현재**: `@worker task` → Codex CLI 호출로 자연어 응답 생성 (느림, 비용)
- **수정**: 워커 위임 성공/실패 시 즉시 템플릿 반환 (CLI 호출 제거)
  - 성공: `✅ {workerName}에게 작업을 전달했습니다: "{prompt.slice(0,80)}..."`
  - Busy: `⏳ {workerName}은(는) 현재 작업 중입니다. 잠시 후 다시 시도해 주세요.`
- **효과**: 위임 응답 45-60초 → <1초

### WI-1.4: Codex chat 에러 HTTP 상태코드
- **파일**: `packages/gateway/src/api.ts` (lines 1024-1026)
- `runCli` 실패 시 HTTP 200 → HTTP 500 변경
- 텔레그램 봇이 에러를 정확히 감지 가능

---

## Phase 2: 텔레그램 응답 품질 (P1)

> **핵심 목표**: 실시간 스트리밍 + 깨끗한 응답 + non-blocking

### WI-2.1: forwardToCli 비블로킹 전환
- **파일**: `packages/telegram-bot/src/index.ts` (lines 1134-1211)
- **현재**: `await pollTaskStatus()` 가 Telegraf 핸들러를 30분간 블로킹
- **수정**: 폴링 루프를 분리하여 핸들러 즉시 반환
  ```typescript
  async forwardToCli(ctx, prompt, sessionKey, prefix) {
    // 1. DraftStream 생성
    // 2. POST /api/cli/run/async → taskId
    // 3. 즉시 "⏳ 작업 시작..." 응답
    // 4. 핸들러 반환 (non-blocking)

    // 백그라운드: WebSocket cli:stream → DraftStream 실시간 업데이트
    // 백그라운드: cli:complete 이벤트 → DraftStream flush + footer
    // 폴백: 10초 간격 HTTP 폴링 (WebSocket 이벤트 미수신 시)
  }
  ```
- **DraftStream 연동**: cli:stream WebSocket 이벤트 → DraftStream.append() → editMessageText
- **완료 감지**: cli:complete 이벤트 수신 시 DraftStream.flush() + footer 전송
- **폴백**: WebSocket 이벤트 미수신 시 기존 HTTP 폴링으로 자동 전환

### WI-2.2: 워커 결과 응답 필터 적용
- **파일**: `packages/gateway/src/api.ts` (lines 588, 685, 705, 723)
- **현재**: 워커 결과(rawText)가 필터 없이 브로드캐스트
- **수정**:
  - `worker:task:completed` 이벤트 발행 시 `filterForTelegram(rawText)` 적용
  - 텔레그램용: ANSI 제거 + TUI 아티팩트 제거 + 4096자 청킹
  - 대시보드용: ANSI 제거 + TUI 아티팩트 제거 (청킹 없음)
  - 이벤트에 `filteredText` 필드 추가 (rawText도 유지)

### WI-2.3: 텔레그램 Gemini 리뷰 이벤트 핸들러
- **파일**: `packages/telegram-bot/src/index.ts`
- **현재**: `gemini:review` 이벤트 → 워커 결과 메시지에 배지 추가 (line 1671-1677)
- **추가**: `worker:task:summary` 이벤트 → 완료 메시지에 요약 업데이트
- **추가**: `gemini:pre-review` 이벤트 → 작업 시작 시 워커에게 추천사항 표시 (선택적)

---

## Phase 3: 하이브리드 보고 시스템 (P1)

> **핵심 목표**: Critical → 자동 Push, 일반 → Pull 기반 브리핑

### WI-3.1: Gemini Alert → 텔레그램 자동 Push
- **파일**: `packages/telegram-bot/src/index.ts`
- **현재**: `gemini:alert` WebSocket 이벤트 수신 가능하지만 텔레그램 전송 미구현
- **수정**:
  - `gemini:alert` 이벤트 핸들러 추가:
    ```typescript
    case 'gemini:alert': {
      const { severity, message, projectPath } = payload;
      if (severity === 'critical' || severity === 'warning') {
        const icon = severity === 'critical' ? '🚨' : '⚠️';
        await this.notifyAdmin(`${icon} [${severity.toUpperCase()}]\n${message}\n📁 ${projectPath}`);
      }
      break;
    }
    ```
  - `worker:task:failed` (좀비 워커) 이벤트도 텔레그램 알림
  - 빌드 실패 패턴 감지 시 즉시 알림

### WI-3.2: "특이사항 있어?" Pull 브리핑
- **파일**: `packages/gateway/src/api.ts` (POST /api/codex/chat 시스템 프롬프트)
- **현재**: Gemini 분석 캐시가 Codex 시스템 프롬프트에 주입됨 (lines 848-853)
- **강화**:
  - 시스템 프롬프트에 브리핑 지시 추가:
    ```
    ## 브리핑 모드
    사용자가 프로젝트 상태, 특이사항, 현황, 보고를 요청하면:
    1. Gemini 프로젝트 분석 (recommendations, activeContext)
    2. 워커 상태 (idle/busy/offline, 최근 작업)
    3. 최근 작업 이력 (성공/실패, 에러 내용)
    위 정보를 기반으로 프로젝트별로 간결하게 브리핑하세요.
    ```
  - 워커별 최근 작업 이력 포함 (WI-1.1과 연동)
  - Gemini의 `recommendations` 배열을 "개선 제안" 섹션으로 포함

### WI-3.3: Gemini detectAlerts 개선
- **파일**: `packages/gateway/src/gemini-advisor.ts`
- **현재**: 문자열 정확 일치 비교 (recommendations 변경 감지)
- **수정**:
  - 정규화 비교: 소문자화 + 공백 정규화 + 구두점 제거 후 비교
  - severity 기준 명확화:
    - `critical`: 워커 crash, 빌드 연속 실패 (3회+), 에러 급증
    - `warning`: 새 recommendations, activeContext 급변
    - `info`: 일반 변경 (Push 안 함)
  - workHistory FAIL 카운트: `"FAIL"` → `/fail|failed|error|unsuccessful/i` 패턴 확장

---

## Phase 4: 대시보드 워커 로그 패널 (P2)

> **핵심 목표**: 워커 카드 클릭 → 작업 이력 확인

### WI-4.1: useOlympus 상태 확장
- **파일**: `packages/web/src/hooks/useOlympus.ts`
- 새 상태 필드:
  ```typescript
  workerLogs: Map<string, WorkerLogEntry[]>   // workerId → 작업 이력
  selectedWorkerId: string | null              // 현재 선택된 워커
  geminiReviews: Map<string, GeminiReview>     // taskId → Gemini 리뷰
  ```
- `WorkerLogEntry` 타입:
  ```typescript
  {
    taskId: string;
    prompt: string;
    status: 'running' | 'completed' | 'failed' | 'timeout';
    summary?: string;
    rawText?: string;
    durationMs?: number;
    cost?: number;
    geminiReview?: { quality: string; summary: string; concerns: string[] };
    startedAt: number;
    completedAt?: number;
  }
  ```

### WI-4.2: 비동기 이벤트 핸들러 추가
- **파일**: `packages/web/src/hooks/useOlympus.ts`
- `worker:task:assigned` → workerLogs에 새 항목 추가 (status: running)
- `worker:task:completed` → workerLogs 항목 업데이트 (status: completed, rawText, duration)
- `worker:task:failed` → workerLogs 항목 업데이트 (status: failed)
- `worker:task:summary` → workerLogs 항목의 summary 업데이트
- `gemini:review` → geminiReviews에 추가 + workerLogs 항목의 geminiReview 업데이트

### WI-4.3: WorkerLogPanel 컴포넌트
- **파일**: `packages/web/src/components/dashboard/WorkerLogPanel.tsx` (신규)
- 워커 카드 클릭 시 해당 워커의 작업 이력 표시
- 각 작업 항목:
  - 프롬프트 (축약)
  - 상태 배지 (✅/❌/⏳/⚠️)
  - 소요시간
  - Gemini 리뷰 (quality 배지 + 클릭 시 상세)
  - rawText (축소/확장 가능)
- 최근 20개 작업, 스크롤
- 빈 상태: "아직 작업 이력이 없습니다"

### WI-4.4: App.tsx 레이아웃 통합
- **파일**: `packages/web/src/App.tsx`
- WorkerGrid 내 워커 카드 클릭 → `selectedWorkerId` 설정
- selectedWorkerId 설정 시 WorkerLogPanel 표시 (사이드 패널)
- 닫기 버튼으로 selectedWorkerId = null

---

## Phase 5: Dead Code 정리 + 안정성 (P2)

### WI-5.1: GeminiAdvisor dead code 삭제
- **파일**: `packages/gateway/src/gemini-advisor.ts`
  - `rootCache` 필드 삭제 (line 86)
  - `getCachedRootAnalysis()` 삭제 (lines 270-272)
- **파일**: `packages/protocol/src/gemini-advisor.ts`
  - `GeminiRootAnalysis` 타입 삭제 (미사용)

### WI-5.2: asyncTasks 메모리 누수 수정
- **파일**: `packages/gateway/src/api.ts` (lines 1288-1293)
- **현재**: running 상태 태스크는 영구 잔류
- **수정**: 2시간 이상 running인 태스크도 정리 (stuck 판정)
  ```typescript
  // cleanup: completed/failed after 1hr OR running after 2hr
  if (status === 'running' && Date.now() - startedAt > 7_200_000) {
    asyncTasks.delete(taskId);
  }
  ```

### WI-5.3: GeminiPty 복원력 강화
- **파일**: `packages/gateway/src/gemini-pty.ts`
- `startPty()` 초기화에 30초 타임아웃 추가 (Promise.race)
- 성공적 응답 후 `this.restartCount = 0` 리셋
- `MAX_RESTARTS` 도달 후 5분 후 1회 재시도 (recovery timer)

### WI-5.4: Codex Orchestrator 불필요 파일 확인
- `packages/codex/src/__tests__/` — stub 검증 테스트 업데이트
- stub 제거에 따른 테스트 수정

---

## 수정 파일 요약

| 파일 | Phase | 변경 내용 |
|------|-------|----------|
| `cli/src/commands/start.ts` | 0 | PTY init 타임아웃 (✅ 완료) |
| `cli/src/pty-worker.ts` | 0 | idle prompt 패턴 확장 (필요시) |
| `gateway/src/api.ts` | 1,2,5 | Codex 시스템 프롬프트 강화 + 템플릿 응답 + 워커 결과 필터 + asyncTasks 수정 |
| `gateway/src/gemini-advisor.ts` | 3,5 | detectAlerts 개선 + dead code 삭제 |
| `gateway/src/gemini-pty.ts` | 5 | 복원력 강화 |
| `gateway/src/codex-adapter.ts` | 1 | stub RPC 정리 + 실제 데이터 반환 |
| `codex/src/agent-brain.ts` | 1 | stub 삭제 |
| `codex/src/router.ts` | 1 | 미사용 필드 삭제 |
| `codex/src/session-manager.ts` | 1 | contextDbPath 삭제 |
| `codex/src/orchestrator.ts` | 1 | initialize 정리 |
| `telegram-bot/src/index.ts` | 2,3 | non-blocking 전환 + alert 핸들러 + 리뷰 이벤트 |
| `protocol/src/gemini-advisor.ts` | 5 | GeminiRootAnalysis 타입 삭제 |
| `web/src/hooks/useOlympus.ts` | 4 | 상태 확장 + 이벤트 핸들러 |
| `web/src/components/dashboard/WorkerLogPanel.tsx` | 4 | 신규 컴포넌트 |
| `web/src/App.tsx` | 4 | 레이아웃 통합 |

---

## 의존성 DAG + 실행 순서

```
Phase 0 (PTY Fix) ─────────────────────────────────┐
    │                                                │
    ▼                                                │
Phase 1 (Codex 강화 + Gemini 통합)                    │ 모든 Phase의 전제
    │                                                │
    ├──→ Phase 2 (텔레그램 응답 품질)                  │
    │        │                                       │
    │        └──→ Phase 3 (하이브리드 보고)            │
    │                                                │
    └──→ Phase 4 (대시보드 워커 로그)                  │
                                                     │
Phase 5 (Dead Code + 안정성) ←──── 독립, 언제든 실행 ──┘
```

**순차 실행 권장**: Phase 0 → 1 → 2+4 병렬 → 3 → 5

---

## 검증 방법

### 빌드 + 테스트
```bash
pnpm build          # 9개 패키지 빌드 성공
pnpm lint           # TypeScript 타입 체크
pnpm test           # 기존 테스트 회귀 없음
```

### Phase별 검증

| Phase | 검증 항목 |
|-------|----------|
| 0 | `olympus start-trust` → 30초 내 게이트웨이 등록 확인 (`/workers` 명령) |
| 1 | Codex chat에 "워커 상태 알려줘" → 실제 워커 상태 기반 브리핑 |
| 1 | `@worker task` → <1초 내 템플릿 응답 (CLI 미호출) |
| 2 | 텔레그램 명령 → DraftStream 실시간 스트리밍 (editMessageText 확인) |
| 2 | 워커 결과에 TUI 아티팩트/ANSI 코드 없음 |
| 3 | 워커 crash → 텔레그램 자동 알림 수신 |
| 3 | "특이사항 있어?" → Gemini 분석 기반 프로젝트별 브리핑 |
| 4 | 대시보드 워커 카드 클릭 → WorkerLogPanel 표시 |
| 4 | 작업 완료 → workerLogs 실시간 업데이트 |
| 5 | `pnpm build` + `pnpm test` 통과 (dead code 삭제 후) |

### E2E 시나리오

1. **서버 시작**: `olympus server start` → healthz OK
2. **워커 등록**: `olympus start-trust` × 4 → `/workers` 4개 표시
3. **텔레그램 명령**: `@apollo 코드 리뷰해줘` → 즉시 확인 응답 → DraftStream → 최종 결과
4. **Gemini 리뷰**: 작업 완료 후 Gemini 리뷰 배지 수신
5. **대시보드**: 워커 카드 클릭 → WorkerLogPanel에 작업 이력 표시
6. **보고**: "특이사항 있어?" → 프로젝트별 브리핑 응답
7. **알림**: 워커 강제 종료 → 텔레그램 자동 알림

---

## 이전 계획과의 차이

| 이전 계획 (crispy-noodling-hedgehog) | 본 계획 (v3.0) | 이유 |
|------|------|------|
| WI-1.1 좀비 감지 추가 | 삭제 (이미 구현) | startStaleCheck 확인 |
| WI-1.4 ConcurrencyLimiter 개선 | 삭제 (이미 구현) | 큐50+120s 확인 |
| WI-1.5 Task Map 정리 | 삭제 (이미 구현) | 200+1hr 확인 |
| WI-2.1 Pre/Post Review 비동기 | 삭제 (이미 구현) | fire-and-forget 확인 |
| WI-2.2 Streaming Monitor 삭제 | 축소 (rootCache만 삭제) | monitor 자체 없음 확인 |
| WI-4.1 command 추출 | 삭제 (이미 구현) | isAllowed 확인 |
| WI-4.2 isAdmin | 삭제 (이미 구현) | getChatMember 확인 |
| WI-4.5 HTTP catch-up | 삭제 (이미 구현) | catchUpMissedWorkerTasks 확인 |
| **신규**: PTY Worker 타임아웃 | Phase 0 추가 | CRITICAL: 워커 등록 불가 |
| **신규**: Codex→Gemini 통합 | Phase 1 핵심 | Gemini advisor 역할 실질화 |
| **신규**: Codex 워커 상태 인지 | Phase 1 추가 | 자율적 비서 역할 강화 |
| **강화**: forwardToCli non-blocking | Phase 2 강화 | 블로킹 핸들러 근본 해결 |
