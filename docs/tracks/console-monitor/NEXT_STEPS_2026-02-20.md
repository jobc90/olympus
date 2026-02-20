# Console/Monitor 후속 작업 백로그 (2026-02-20)

## 우선순위 P0

1. 웹 훅 단위 테스트 인프라 추가
- 목표: `useOlympus` 상태 전이 회귀를 자동 검증
- 작업:
  - `@olympus-dev/web`에 `vitest` + `jsdom` 테스트 환경 도입
  - WebSocket 이벤트 mock 유틸 추가
  - 핵심 상태 전이 케이스 작성
    - `assigned -> completed -> idle`
    - `assigned -> timeout -> final_after_timeout -> idle`
    - out-of-order 이벤트 무시(이전 timestamp 방어)
- 완료 기준:
  - PR에서 상태 전이 테스트가 자동 실행되고 회귀를 잡아냄

2. Telegram E2E를 서버 경로까지 확장
- 목표: 현재 로직 시뮬레이션 테스트를 API 경유 통합 테스트로 강화
- 작업:
  - `POST /api/codex/chat` (`@worker` 명령)
  - `POST /api/workers/tasks/:id` (worker result)
  - Gateway broadcast 수신 검증
- 완료 기준:
  - 실제 API 흐름에서 Dashboard 전이에 필요한 이벤트가 모두 발생함

## 우선순위 P1

1. 표/코드블록 전달 품질 개선
- 배경: Telegram/카드 채팅에서 테이블 가독성 저하
- 작업:
  - 공통 메시지 formatter 추가 (table -> bullet/markdown fallback)
  - ChatWindow/Telegram 동일 formatter 사용
  - 길이 초과 시 section-preserving truncate
- 완료 기준:
  - 표 기반 응답이 모바일/웹 모두에서 구조 깨짐 없이 표시

2. `worker:metrics` 이벤트 추가
- 목표: 토큰/성공률/실패율을 폴링 없이 실시간 제공
- payload 제안:
  - `{ workerId, totalTokens, totalTasks, successCount, failureCount }`
- 완료 기준:
  - Console/Monitor 통계가 metrics 이벤트 우선으로 반영

3. Activity 이벤트 taxonomy 정리
- 목표: 채널 간 이벤트 용어 통일
- 작업:
  - type 집합 고정 (`assignment`, `completion`, `failure`, `timeout`, `summary`, `route`)
  - severity 정책 고정 (`info`, `warn`, `error`)
  - Gateway/Telegram/Web 모두 같은 enum 사용

## 우선순위 P2

1. Monitor 성능 지표 고도화
- fps/frame-time 외 이벤트 지연 분포(p50/p95), dropped-frame 카운트 추가

2. 운영 리플레이(최근 5~10분)
- `activity:event`/`worker:status`를 버퍼링하고 시점별 재생 기능 제공

3. 문서/릴리즈 정리
- 변경 세트별 릴리즈 노트 분리
- 운영 가이드에 트러블슈팅(상태 고착/동기화 지연) 섹션 추가

## 운영 체크리스트

- 배포 전:
  - `pnpm -F @olympus-dev/gateway test`
  - `pnpm -F @olympus-dev/web lint && pnpm -F @olympus-dev/web build`
- 실환경 점검:
  - Telegram `@worker` 명령 1회 실행
  - Dashboard 카드 전이(`working -> completed -> idle`) 확인
  - Monitor 성능 패널 지표 갱신 확인
