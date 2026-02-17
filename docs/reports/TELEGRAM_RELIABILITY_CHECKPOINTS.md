# Telegram 원격 제어 신뢰성 개선 체크포인트

- 작성일: 2026-02-07
- 대상: `olympus server start` 경로의 Telegram 연동 품질/안정성
- 범위: Telegram Bot + Gateway Session 출력 전달 + CLI 기동 시퀀스

## 1) 장애 요약 (Observed)

사용자 실행 로그 기준으로 다음 문제가 확인됨.

1. `Unhandled error while processing update` 발생
2. `Bot launch failed: TimeoutError: Promise timed out after 90000 milliseconds`
3. Telegram에서 Claude CLI 응답이 중간중간 누락/변형되어 전달됨
4. `/orchestration` 대형 프롬프트 전송 시 실패 체감이 큼

## 2) 핵심 원인 후보 (Code Evidence)

### A. 출력이 두 단계에서 과도하게 변형됨 (가장 큰 품질 이슈)

1. Gateway에서 이미 출력 필터링 수행
- `packages/gateway/src/session-manager.ts:737`
- 배너/상태바/spinner/명령 라인 등을 광범위 제거
- `findNewContent()`가 `Set` 기반 라인 차집합으로 diff (`packages/gateway/src/session-manager.ts:718`)

2. Telegram Bot에서 다시 요약/절단
- `summarizeOutput()`에서 코드블록 축약 + 패턴 필터 + head/tail 강제 절단
- `packages/telegram-bot/src/index.ts:631`

영향:
- 실제 Claude 응답 맥락이 사라짐
- 중간 추론/도구 출력이 “깨진 형태”로 보임
- 긴 답변은 tail/head만 남아 의미 왜곡 가능

### B. Bot 에러 핸들링 경계가 약함

1. 글로벌 에러 핸들러 부재 (`bot.catch(...)` 없음)
- `packages/telegram-bot/src/index.ts` 전체에서 미구현

2. Telegraf update 처리 오류가 바로 콘솔 `Unhandled error while processing`로 노출
- 사용자 로그와 증상 일치

영향:
- 실패 원인 분류가 어려움 (파싱 오류/네트워크 오류/429/409 충돌 등)
- 런타임 복구 정책이 문서화/코드화되지 않음

### C. `/orchestration` 메시지 포맷 및 전달 안정성 리스크

1. Telegram 명령 텍스트를 직접 조합하여 tmux 입력
- `packages/telegram-bot/src/index.ts:386`
- 전송 형태: ``/orchestration "${prompt}"``

2. Gateway 입력 전처리에서 일부 문자 제거
- `sanitizeInput()`이 `[;|&$`]` 제거
- `packages/gateway/src/session-manager.ts:560`

영향:
- 프롬프트 원문 보존성이 떨어질 수 있음
- 코드/쉘/마크다운 기반 프롬프트에서 의도치 않은 의미 변형 가능

### D. 시작 시퀀스와 봇 생명주기 관측성 부족

1. CLI는 봇을 import 후 2초만 기다리고 성공으로 간주
- `packages/cli/src/commands/server.ts:404`

2. Telegram bot 내부 `start()`는 `launch()` 실패 시 로그만 남김
- `packages/telegram-bot/src/index.ts:991`
- 실패가 상위 상태와 강결합되지 않음

영향:
- 사용자 입장에서 "연결됨" 로그 후 실제 동작 실패 가능
- 장애 시점/원인 추적이 어려움

## 3) 우선순위

1. P0: Telegram 응답 무결성 회복 (출력 변형 최소화)
2. P0: Unhandled 에러 구조화 및 복구 가능 상태 확보
3. P1: `/orchestration` 대형 메시지 전달 안정화
4. P1: startup health/ready 판정 정확화
5. P2: 회귀 테스트/운영 관측성 자동화

## 4) 개선 체크포인트 (실행 항목)

## 4.1 P0 체크포인트 - 출력 무결성

- [ ] Gateway `filterOutput()` 규칙을 `noise-only`로 축소 (과도한 라인 제거 금지)
- [ ] `findNewContent()`의 `Set` 기반 라인 diff를 순서 보존 방식으로 교체
- [ ] Telegram `summarizeOutput()` 기본 비활성화 (옵션화)
- [ ] Telegram에서 원문 전달 모드(`raw`)와 요약 모드(`summary`) 분리
- [ ] 긴 메시지는 "요약본 + 원문 전체 조회 명령" 패턴 제공 (`/last`, `/raw`) 

완료 기준:
- 동일 입력에 대해 Dashboard 출력과 Telegram 출력 의미가 동일
- 코드블록/명령문이 중간 생략 없이 전달됨

## 4.2 P0 체크포인트 - 에러 처리

- [ ] `bot.catch((err, ctx) => ...)` 추가
- [ ] 에러 유형별 분류 로그 추가 (Telegram API 400/401/409/429, timeout, network)
- [ ] 명령 핸들러별 `ctx.reply/editMessage` 실패 보호 (fallback plain-text)
- [ ] `Unhandled error while processing` 재발 시 에러코드/원인/업데이트 ID를 구조화 로그로 남김

완료 기준:
- 런타임에서 unhandled stack이 사라지고, 모든 실패가 분류 로그로 수집됨

## 4.3 P1 체크포인트 - `/orchestration` 전달 안정화

- [ ] 대형 프롬프트 전송 시 이스케이프/인코딩 전략 명시 (quote wrapping 최소화)
- [ ] 세션 입력 API에 멀티라인 안전 전송 테스트 추가
- [ ] `sanitizeInput()` 정책 재검토: 보안과 원문 보존의 균형 재설계
- [ ] Telegram 명령 사용 시 최대 길이/권장 포맷 안내 메시지 추가

완료 기준:
- 사용자 입력 원문과 tmux 전달 문자열이 기능적으로 동일
- 대형 한글+영문 혼합 프롬프트에서 전송 실패율 0%

## 4.4 P1 체크포인트 - 기동/헬스 상태

- [ ] `server start`에서 Telegram Ready 신호를 실제 핸드셰이크 기반으로 판단
- [ ] 2초 고정 대기(`setTimeout`) 제거
- [ ] `olympus server status`에 Telegram polling 상태/최근 에러/최근 업데이트 시간 노출
- [ ] 시작 실패 시 "부분 성공"(Gateway만 정상) 상태를 명확히 표시

완료 기준:
- "연결됨" 로그가 실제 사용 가능 상태와 1:1로 대응

## 4.5 P2 체크포인트 - 테스트/운영성

- [ ] `packages/telegram-bot` 단위 테스트 추가 (명령 파싱, 긴 메시지 분할, 에러 핸들링)
- [ ] Gateway `session-manager` diff/filter 회귀 테스트 추가
- [ ] 통합 시나리오 스모크 테스트: `start -> /use -> /orchestration -> output` 자동화
- [ ] 운영 로그 규격화: `component`, `chatId`, `sessionId`, `updateId`, `errorCode`, `latencyMs`

완료 기준:
- 릴리즈 전 자동 검증으로 주요 회귀를 사전 차단

## 5) 즉시 재현/점검 시나리오

1. 기본 연결
- [ ] `olympus server start` 실행
- [ ] Telegram `/health` 정상
- [ ] `/sessions`, `/use main` 정상

2. 대형 프롬프트
- [ ] `/orchestration` + 2,000자 이상 멀티라인 입력
- [ ] 전송 성공/실패 메시지 정확성 확인
- [ ] Dashboard vs Telegram 출력 비교

3. 특수문자 프롬프트
- [ ] 백틱, 달러표시, 파이프, 세미콜론 포함 입력
- [ ] 의도치 않은 제거/변형 여부 확인

4. 에러 복원력
- [ ] Gateway 재시작 후 Telegram 자동 재연결 확인
- [ ] 네트워크 단절 30초 후 복구 확인
- [ ] 오류 발생 시 unhandled 로그 없는지 확인

## 6) 권장 구현 순서 (짧은 스프린트 기준)

1. Day 1: P0 에러 핸들러 + 로그 구조화
2. Day 2: 출력 변형 최소화 (Gateway 필터 축소 + Telegram 요약 옵션화)
3. Day 3: `/orchestration` 전송 경로 보강 + sanitize 정책 정리
4. Day 4: startup ready 판정 개선 + status 확장
5. Day 5: 회귀 테스트/문서 업데이트

## 7) Definition of Done

- [ ] Telegram에서 Claude 응답이 의미 손실 없이 전달됨
- [ ] `Unhandled error while processing` 미발생
- [ ] `Bot launch failed: TimeoutError` 재현 불가 또는 원인 분류 가능
- [ ] `/orchestration` 대형 입력이 안정적으로 처리됨
- [ ] 문서 기반 점검표로 누구나 동일 품질 검증 가능

## 8) 참고 파일

- `packages/telegram-bot/src/index.ts`
- `packages/gateway/src/session-manager.ts`
- `packages/cli/src/commands/server.ts`
- `packages/gateway/src/api.ts`
- `packages/gateway/src/server.ts`
