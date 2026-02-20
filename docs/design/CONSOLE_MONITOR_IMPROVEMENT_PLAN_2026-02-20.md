# Olympus Dashboard Console/Monitor 개선 계획 (2026-02-20)

> 범위: `packages/web/src/App.tsx`의 `console`/`monitor` 탭과 `useOlympus` 데이터 파이프라인  
> 참고: `docs/reports/OPENCLAW_VS_OLYMPUS_ANALYSIS.md`
> 실행 결과/후속 작업: `docs/tracks/console-monitor/` 문서 참조

---

## 1) 목표

1. Console 탭을 "상태 보기"에서 "운영 제어" 중심 화면으로 전환한다.
2. Monitor 탭을 시각화 전용에서 "운영 관측 + 즉시 액션" 가능한 화면으로 전환한다.
3. 워커 상태(`working/completed/idle`)가 채널(텔레그램/대시보드/PTY) 간 일관되게 보이도록 상태 모델을 단일화한다.

비목표:
- Olympus Mountain 렌더러 자체의 아트 리디자인
- 텔레그램 봇 UX 개편(별도 트랙)

---

## 2) 현재 구현 및 연결 기능 맵

## 2.1 Console 탭 구성

- 탭/레이아웃: `packages/web/src/App.tsx:421`, `packages/web/src/App.tsx:423`
- 섹션:
  - Usage: `UsageBar` (`packages/web/src/App.tsx:430`)
  - Overview: `SystemStats` (`packages/web/src/App.tsx:438`)
  - Olympian Command: `CodexAgentPanel`, `GeminiAdvisorPanel` (`packages/web/src/App.tsx:451`)
  - Active Workers: `WorkerGrid` (`packages/web/src/App.tsx:474`)
  - 작업 패널: `WorkerTaskBoard`, `LiveOutputPanel`, `AgentHistoryPanel`, `GatewayEventLog` (`packages/web/src/App.tsx:526`)
  - 우측 사이드: `MiniOlympusMountain`, `ActivityFeed`, `CliSessionsPanel` (`packages/web/src/App.tsx:538`, `packages/web/src/App.tsx:546`, `packages/web/src/App.tsx:549`)

## 2.2 Monitor 탭 구성

- 탭 렌더: `packages/web/src/App.tsx:559`
- 현재는 `OlympusMountainCanvas` 단일 컴포넌트만 표시 (`packages/web/src/App.tsx:561`)
- 실질적으로 "시각화-only" 상태 (운영 패널/컨트롤/드릴다운 없음)

## 2.3 데이터 연결(실시간/폴링)

### WebSocket 이벤트 기반 (`useOlympus`)

- 워커 이벤트:
  - `worker:task:assigned` -> 상태 `working`, 작업 보드/채팅 반영 (`packages/web/src/hooks/useOlympus.ts:484`)
  - `worker:task:completed` -> 상태 `completed`, 3초 후 `idle` 리셋 (`packages/web/src/hooks/useOlympus.ts:528`)
  - `worker:task:timeout`, `worker:task:final_after_timeout`, `worker:task:summary`, `worker:task:failed`
- 기타:
  - `cli:stream` (`packages/web/src/hooks/useOlympus.ts:799`)
  - `usage:update` (`packages/web/src/hooks/useOlympus.ts:815`)
  - `codex:greeting` (Zeus 브리핑)
  - `gemini:*` 상태/리뷰/알림

### 10초 폴링 기반 (`useOlympus`)

- `/api/workers` (`packages/web/src/hooks/useOlympus.ts:883`)
- `/api/gemini-advisor/status` (`packages/web/src/hooks/useOlympus.ts:1006`)
- `/api/usage` (`packages/web/src/hooks/useOlympus.ts:1032`)
- `/api/cli/sessions` (`packages/web/src/hooks/useOlympus.ts:1048`)
- `/api/workers/tasks` (`packages/web/src/hooks/useOlympus.ts:1062`)

---

## 3) 핵심 문제 진단 (근거 포함)

## 3.1 워커 상태 모델이 "합성값"이라 UI 신뢰도가 낮음

- `workerStates`를 렌더 시점마다 새로 생성하면서 `lastActivity=Date.now()`, `totalTokens=0`, `totalTasks=0` 고정됨 (`packages/web/src/App.tsx:187`, `packages/web/src/App.tsx:199`)
- 결과:
  - 카드의 `Last`가 실제 활동시간이 아님
  - 채팅창의 토큰/태스크 정보가 운영 지표로 기능하지 못함

## 3.2 상태 판정 로직이 추정 기반이라 `working` 고착 위험

- `sessionKey.includes(workerId)` 같은 문자열 포함 매칭으로 active stream 여부를 판단 (`packages/web/src/hooks/useOlympus.ts:899`)
- `cliHistory` 기반 `recentComplete`도 동일 포함 매칭 (`packages/web/src/hooks/useOlympus.ts:913`)
- 이벤트/폴링 혼합 + heuristic 판정으로 경계 케이스에서 상태 역전/지연 가능

## 3.3 Console 탭에 기능은 많지만 "운영 플로우"가 분절됨

- 현재 패널은 정보가 분산되어 있어 운영자가 "지시 -> 진행 -> 완료 -> 후속조치"를 한 흐름으로 보기 어려움
- `App.tsx`에서 대량 상태를 한 컴포넌트에 직접 결합(`packages/web/src/App.tsx:120` 이하)해 변경 영향 범위가 큼

## 3.4 Monitor 탭이 시각화 외 기능이 없음

- Monitor 탭은 `OlympusMountainCanvas`만 렌더(`packages/web/src/App.tsx:559`)
- `OlympusMountainControls` 컴포넌트가 존재하지만 실제 연결되지 않음 (`packages/web/src/components/olympus-mountain/OlympusMountainControls.tsx`)
- 운영 관측에서 필요한 필터/선택/즉시 액션 부재

## 3.5 성능/안정성 관찰

- Canvas는 30fps 루프 유지 (`packages/web/src/components/olympus-mountain/OlympusMountainCanvas.tsx:147`)
- 폴링 실패가 모두 silent 처리되어 (`packages/web/src/hooks/useOlympus.ts:999`, `1025`, `1041`, `1055`, `1091`) 운영자가 데이터 결손을 인지하기 어렵다

---

## 4) 개선 방향 (OpenClaw 벤치마킹 반영)

핵심 원칙:
1. 상태 단일화: UI 상태를 "추정"이 아니라 서버 이벤트/명시적 필드 기반으로 계산
2. 이벤트 우선: 폴링은 보강/복구 용도로 축소
3. 운영 플로우 중심: Console/Monitor 모두 "명령 -> 실행 -> 검증 -> 회고" 흐름으로 재배치
4. 채널 일관성: 텔레그램/대시보드/PTY에서 동일 task lifecycle 용어와 상태 전이 사용

---

## 5) 단계별 실행 계획

## Phase 1. 상태 모델 정규화 (최우선)

목표: 카드 상태 꼬임과 working 고착 제거

작업:
1. `workerStates`를 렌더 합성값에서 `useOlympus`의 영속 상태로 이동
2. 상태 전이 FSM 정의:
   - `idle -> working -> completed -> idle`
   - `idle -> working -> failed -> idle`
   - `working -> timeout -> working/final_after_timeout`
3. `includes(workerId)` 매칭 제거, `workerId` 명시 매핑 테이블 도입
4. `lastActivity`, `totalTokens`, `totalTasks`를 이벤트 기반 누적값으로 관리

완료 기준:
- 동일 작업에서 대시보드 카드가 `working -> completed -> idle` 순서로 재현
- `Last`가 실제 활동 기준으로 변함

## Phase 2. Console 탭 운영 UX 재구성

목표: 운영자가 Console 탭만으로 지시/추적/검증 가능

작업:
1. 상단에 "Global Control Strip" 추가:
   - 연결 상태, 활성 작업 수, 실패 작업 수, 마지막 동기화 시각
2. Worker 카드 액션 통합:
   - `Chat`, `Logs`, `Retry`, `Assign` 단축 버튼
3. ActivityFeed 개선:
   - 이벤트 타입 확장(`assignment`, `completion`, `retry`, `route`)
   - 필터(Worker/Severity/Time) 추가
4. `CliSessionsPanel` 강화:
   - 삭제만 제공하는 구조에서 "열기/전환/재사용" 액션 추가

완료 기준:
- Console에서 워커 지시 후 완료 로그 확인까지 탭 이동 없이 가능

## Phase 3. Monitor 탭 운영화

목표: Monitor를 실시간 관측과 즉시 제어 화면으로 승격

작업:
1. Monitor 레이아웃을 2단으로 확장:
   - 상단: Olympus Mountain canvas
   - 하단/우측: 선택 워커 상세 패널(현재 task, 최근 로그, 최근 결과)
2. Canvas 인터랙션 추가:
   - 워커 클릭 -> 상세패널 동기화
   - 상태별 하이라이트/필터(working/error만 보기)
3. `OlympusMountainControls` 실제 연결:
   - 디버그 토글 + 운영 모드에서 허용 가능한 액션만 노출

완료 기준:
- Monitor에서 워커 선택 후 즉시 상태/로그/채팅 진입 가능

## Phase 4. 관측성/회귀 방지

목표: 재발 방지와 운영 신뢰성 확보

작업:
1. 상태 전이 테스트 추가(웹 훅 + WS 이벤트 시뮬레이션)
2. E2E 시나리오 추가:
   - Telegram 명령 -> 워커 실행 -> Dashboard 카드 전이 확인
3. 폴링 실패/데이터 지연 감지 배지 추가
4. 탭별 성능 계측(FPS, 이벤트 지연, 렌더 횟수) 추가

완료 기준:
- CI에서 상태 전이 회귀 테스트 통과
- 폴링/WS 장애 시 UI에 "정상/지연/끊김" 명확 노출

---

## 6) 권장 API/이벤트 보강

1. `worker:status` 이벤트 신설
- payload: `{ workerId, behavior, lastActivityAt, activeTaskId, activeTaskPrompt }`

2. `worker:metrics` 이벤트 신설
- payload: `{ workerId, totalTokens, totalTasks, successCount, failureCount }`

3. `activity:event` 통합 이벤트
- Console/Monitor/Telegram이 동일 이벤트 스키마를 구독하도록 통일

---

## 7) 우선순위

P0:
1. Phase 1 상태 모델 정규화
2. 카드 상태 전이 회귀 테스트

P1:
1. Phase 2 Console 운영 UX
2. Phase 3 Monitor 운영화(클릭 드릴다운)

P2:
1. Phase 4 관측성/성능 계측
2. 고급 필터/리플레이 기능

---

## 8) 즉시 실행 권고 (다음 스프린트)

1. `useOlympus`에서 워커별 상태/메트릭 source-of-truth 구조 먼저 확정
2. `App.tsx`의 합성 `workerStates` 제거
3. Monitor 탭에 워커 상세 사이드패널 MVP 추가
4. "텔레그램 명령 -> Dashboard 카드 전이" 통합 테스트 1개부터 구축

---

## 9) 구현 진행 현황 (2026-02-20 업데이트)

- Phase 1: 대부분 완료
  - `workerDashboardStates`를 `useOlympus` source-of-truth로 전환
  - `working -> completed -> idle` 자동 전이 반영
  - `lastActivity / totalTokens / totalTasks` 이벤트 기반 누적 반영
- Phase 2: 대부분 완료
  - Console `Global Control Strip` 추가
  - Worker 카드 `Chat/Logs` 단축 액션 추가
  - `ActivityFeed` 타입/검색 필터 추가
  - `CliSessionsPanel` 재사용/키 복사 액션 추가
- Phase 3: 완료
  - Monitor 2단 운영 레이아웃(캔버스 + 상세 패널) 적용
  - 캔버스 워커 클릭 드릴다운/컨트롤 연결 완료
- Phase 4: 진행 중
  - 폴링 실패/지연 감지 배지 추가 완료
  - Gateway 표준 이벤트(`worker:status`, `activity:event`) 발행 추가
  - 이벤트 파생 로직 단위 테스트(`packages/gateway/src/__tests__/worker-events.test.ts`) 추가
  - Telegram→Dashboard 카드 전이 E2E 시나리오 추가 (`packages/gateway/src/__tests__/telegram-dashboard-sync.e2e.test.ts`)
  - Monitor 성능 지표 노출(FPS, frame time, WS lag, poll lag, tab render count)
  - 남은 항목: 웹 훅 단위 테스트 인프라(vitest/jsdom) 도입 후 상태 전이 시뮬레이션 케이스 보강
