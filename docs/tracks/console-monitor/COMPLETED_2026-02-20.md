# Console/Monitor 개선 구현 완료 보고서 (2026-02-20)

## 범위

- Dashboard `console`/`monitor` 탭 개선
- Worker 상태 전이 안정화 (`working -> completed -> idle`)
- Telegram/PTY/Dashboard 상태 동기화 정확도 개선

## 완료 항목

### 1) 상태 모델 정규화 (Phase 1)

- `useOlympus`를 워커 상태 source-of-truth로 전환
- 렌더 시 합성 상태 제거, 이벤트/폴링 누적 상태로 정리
- `workerDashboardStates`, `syncStatus` 도입
- `lastActivity`, `totalTokens`, `totalTasks`를 워커 기준으로 누적 관리

주요 파일:
- `packages/web/src/hooks/useOlympus.ts`
- `packages/web/src/App.tsx`

### 2) Console 운영 UX 재구성 (Phase 2)

- 상단 Global Control Strip 추가
  - Gateway 연결 상태
  - Active/Failed task 수
  - Last sync / Poll failures / WS lag
- Worker 카드 단축 액션 정리 (`Chat`, `Logs`)
- ActivityFeed 필터/검색 추가
- CLI 세션 재사용 액션 추가 (`Reuse`, `Copy Key`)

주요 파일:
- `packages/web/src/App.tsx`
- `packages/web/src/components/dashboard/ActivityFeed.tsx`
- `packages/web/src/components/dashboard/CliSessionsPanel.tsx`
- `packages/web/src/components/dashboard/WorkerCard.tsx`

### 3) Monitor 운영화 (Phase 3)

- Monitor를 2단 운영 레이아웃으로 확장
  - 좌측: Canvas + Controls
  - 우측: Worker 리스트 + 선택 워커 상세
- Canvas 클릭으로 워커 드릴다운 연동
- 상태 override/reset 운영 컨트롤 연결

주요 파일:
- `packages/web/src/App.tsx`
- `packages/web/src/components/olympus-mountain/OlympusMountainCanvas.tsx`

### 4) 관측성/회귀 방지 일부 완료 (Phase 4)

- Gateway 표준 파생 이벤트 추가
  - `worker:status`
  - `activity:event`
- 표준 이벤트를 웹 훅에서 우선 반영하도록 연결
- Telegram→Worker→Dashboard 상태 전이 E2E 테스트 추가
- Monitor 성능 지표 노출
  - Canvas FPS
  - Frame Time
  - WS Lag
  - Poll Lag
  - Render count

주요 파일:
- `packages/gateway/src/worker-events.ts`
- `packages/gateway/src/server.ts`
- `packages/web/src/hooks/useOlympus.ts`
- `packages/gateway/src/__tests__/worker-events.test.ts`
- `packages/gateway/src/__tests__/telegram-dashboard-sync.e2e.test.ts`
- `packages/web/src/components/olympus-mountain/OlympusMountainCanvas.tsx`
- `packages/web/src/App.tsx`

## 검증 결과

- `pnpm -F @olympus-dev/gateway test -- worker-events telegram-dashboard-sync` 통과
- `pnpm -F @olympus-dev/gateway lint` 통과
- `pnpm -F @olympus-dev/gateway build` 통과
- `pnpm -F @olympus-dev/web lint` 통과
- `pnpm -F @olympus-dev/web build` 통과

## 사용자 이슈 기준 반영 상태

- 카드 상태 `working` 고착 현상: 개선됨
- Telegram/Monitor 상태 불일치: 이벤트 단일화로 개선됨
- 운영자가 지연/결손을 인지하기 어려운 문제: Sync/Perf 지표로 개선됨

## 비고

- 기존 작업 트리에 다른 변경사항이 다수 존재하므로, 릴리즈 전 변경 범위 분리(커밋 스코프 정리) 권장.

## 메모리 업데이트 (2026-02-20, CI 안정화)

- GitHub Actions CI 실패 원인(`@olympus-dev/claude-dashboard` 타입/테스트 드리프트) 수정 완료.
- `Config` 타입에서 제거된 `displayMode` 레거시 참조 정리.
- `Translations` fixture 누락 키(`1m`, `days`, `burnRate/cache/toLimit`) 반영.
- `todo-progress` 반환 타입 불일치(`current: null`) 제거.
- 변경된 실제 위젯 렌더 정책(코스트 표기, context 표시, gemini 모델 fallback)에 맞춰 테스트 기대값 정렬.
- 검증 결과:
  - `pnpm run lint` 통과
  - `pnpm run build` 통과
  - `pnpm run test` 통과
