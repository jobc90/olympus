# Console/Monitor 개선 구현 완료 보고서 (2026-02-23)

## 범위

- 대시보드 Worker 카드/터미널 UX 재구성
- PTY 스트리밍/입력/리사이즈 경로 안정화
- Telegram 노이즈 필터링 및 브리핑 정리
- LocalContextStore 컨텍스트 추출 품질 개선

## 완료 항목

### 1) Worker Terminal UX 개선

- Worker 카드 `Logs` 액션을 `Terminal`로 명확화
- 우측 패널형 로그를 모달형 전체 터미널 뷰로 전환
- xterm 기반 PTY 렌더러 추가 (`@xterm/addon-fit`, `xterm`)
- 터미널 출력 델타/오버랩 반영 로직으로 깜빡임 완화

주요 파일:
- `packages/web/src/components/dashboard/WorkerCard.tsx`
- `packages/web/src/components/dashboard/WorkerLogPanel.tsx`
- `packages/web/src/components/dashboard/PtyTerminal.tsx`
- `packages/web/package.json`

### 2) 새로고침 내구성/상태 동기화 개선

- 워커 로그/PTY 출력을 `localStorage`에 저장해 새로고침 후 복원
- 워커 상태 산출 시 `registry` 상태를 우선하여 `working` 고착 완화
- 대시보드에서 워커 PTY 입력/리사이즈 API 연동

주요 파일:
- `packages/web/src/hooks/useOlympus.ts`
- `packages/web/src/App.tsx`

### 3) PTY 워커 입출력 경로 보강

- CLI 워커 stdout 청크를 Gateway `/api/workers/:id/stream`으로 릴레이
- WS 이벤트 기반으로 `worker:input`, `worker:resize` 수신 시 PTY로 반영
- 종료 UX 단순화: `Ctrl+C` 또는 `Ctrl+]`로 워커 종료
- `SIGHUP`/`SIGQUIT` 종료 처리 추가

주요 파일:
- `packages/cli/src/commands/start.ts`
- `packages/cli/src/pty-worker.ts`
- `packages/gateway/src/api.ts`

### 4) Telegram 노이즈 필터링 강화

- `Forming…thinking`, `Processing…` 등 CLI/TUI 아티팩트 패턴 추가 필터링
- 시작 브리핑 송신 시 Telegram 필터 적용 텍스트만 노출

주요 파일:
- `packages/gateway/src/response-filter.ts`
- `packages/telegram-bot/src/index.ts`
- `packages/gateway/src/server.ts`

### 5) LocalContextStore 추출 품질 개선

- 정규식 기반 추출 대신 LLM(JSON) 추출기 추가
- 실패 시 기존 추출 로직으로 폴백
- 관련 단위 테스트 추가

주요 파일:
- `packages/gateway/src/llm-context-extractor.ts`
- `packages/gateway/src/__tests__/llm-context-extractor.test.ts`
- `packages/gateway/src/api.ts`

## 검증 결과

- `pnpm --filter @olympus-dev/web lint` 통과
- `pnpm --filter @olympus-dev/web build` 통과
- `pnpm --filter @olympus-dev/gateway lint` 통과
- `pnpm --filter @olympus-dev/gateway test` 통과 (431 tests)
- `pnpm --filter @olympus-dev/gateway build` 통과
- `pnpm --filter olympus-dev lint` 통과
- `pnpm --filter olympus-dev test` 통과 (130 tests)
- `pnpm --filter olympus-dev build` 통과
- `pnpm --filter @olympus-dev/telegram-bot test` 통과 (94 tests)
- `pnpm --filter @olympus-dev/telegram-bot lint` 스크립트 없음

## 비고

- GeminiAdvisor 로그의 `Prompt queue returned null (timeout or offline)`는 현재 구현상 폴백 경로이며,
  프로젝트 분석 캐시는 fallback 값으로 유지된다.

## 추가 반영 (2026-02-23 오후)

### 6) Monitor 캐릭터 동작/좌표 안정화

- 워커 이동 동기화 분산 강화:
  - workerId 해시 기반 seed로 이동 주기/배회 타겟 분리
  - 이동 cadence를 워커별 `2..5 tick`으로 분산
- 스폰/재배치 안전성 강화:
  - 초기 배치/동적 등록 시 walkable 안전 좌표 보정
  - non-walkable 좌표 감지 시 인접 free 타일로 rescue
- 좌측 하단 코너 끼임 방지:
  - `propylaea` zone을 극좌측 코너 제외하도록 조정
  - 코너 오브젝트 배치 조정으로 입구 동선 확보

주요 파일:
- `packages/web/src/hooks/useOlympusMountain.ts`
- `packages/web/src/olympus-mountain/layout.ts`
- `packages/web/src/olympus-mountain/zones.ts`

### 7) Monitor Zeus 카드 정보행 정합성

- Zeus 카드 우측 정보행을 Hera와 동일한 4줄 구조로 맞춤
- `Last analyzed ...` 라인 추가 (activity 기반 최신 Codex 이벤트 시각 사용)

주요 파일:
- `packages/web/src/components/monitor/OlympusTempleMonitor.tsx`
