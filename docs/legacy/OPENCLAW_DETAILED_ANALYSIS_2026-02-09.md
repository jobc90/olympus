# OpenClaw 상세 분석 리포트

- 작성일: 2026-02-09
- 분석 대상:
  - https://openclaw.ai
  - https://github.com/openclaw/openclaw
- 코드 기준 커밋: `d85f0566a91cd6326a6d9f6691b50160e15cdee1` (main HEAD)

## 1. 요약

OpenClaw는 "멀티 채널 메신저 + 단일 게이트웨이 + 에이전트 런타임 + 웹/모바일 노드"를 한 제품으로 묶은 개인용 AI 운영 플랫폼이다. 핵심은 하나의 Gateway 프로세스가 WS/HTTP 제어면을 소유하고, 모든 클라이언트(CLI/Web/macOS/iOS/Android node)가 해당 제어면에 접속해 상호작용한다는 점이다.

## 2. 제품/서비스 구조

### 2.1 핵심 동작 모델

1. Gateway 단일 프로세스가 제어면(WebSocket + HTTP)을 제공
2. 채널 플러그인(WhatsApp/Telegram/Slack/Discord 등)이 Gateway에 장착
3. 클라이언트는 WS로 `connect` 핸드셰이크 후 RPC 호출
4. 에이전트 실행은 `ack(res)` + `stream(event)` + `final(res)` 형태
5. Control UI/WebChat/CLI/노드가 같은 제어면을 공유

### 2.2 포트/네트워크

- 기본 Gateway 포트: `18789`
- 해당 포트에서 WS + HTTP 멀티플렉스
- Canvas host 기본 포트: `18793`
- Remote 접속은 Tailscale/SSH 터널을 권장

참고:
- `docs/concepts/architecture.md`
- `docs/gateway/index.md`

## 3. 저장소 실체/규모

- 원격 브랜치 수: 320
- 원격 태그 수: 48
- `src` 파일 수: 약 2614
- 테스트 파일(`*.test.ts`) 수: 약 955
- docs 파일 수: 약 668
- extensions 디렉토리 수: 34
- skills 디렉토리 수: 52

이 수치는 실험 수준이 아니라 대형 실서비스형 코드베이스임을 의미한다.

## 4. 코드 아키텍처 (재현 핵심)

### 4.1 진입점/CLI

- `src/index.ts`
  - dotenv/env 정규화
  - 런타임 가드
  - CLI 프로그램 빌드/파싱
- `src/cli/program/build-program.ts`
- `src/cli/program/command-registry.ts`

CLI는 명령군 레지스트리 방식으로 구성되어 확장성이 높다.

### 4.2 온보딩/설정

- `src/cli/program/register.onboard.ts`
- `src/commands/onboard.ts`
- `src/wizard/onboarding.ts`

특징:
- interactive/non-interactive 분리
- non-interactive 시 risk acknowledge 강제
- gateway/channel/skills/daemon 설치 흐름 통합

### 4.3 Gateway 부트스트랩

- `src/gateway/server.impl.ts`

핵심 책임:
- config migration + validation
- plugin auto-enable
- 채널 매니저 시작
- discovery/bonjour/tailscale
- ws/http 런타임 상태 구성
- hot reload/restart 정책
- graceful close

### 4.4 WS 핸드셰이크/프레임 처리

- `src/gateway/server/ws-connection.ts`
- `src/gateway/server/ws-connection/message-handler.ts`

핵심 포인트:
- 서버가 `connect.challenge` nonce 이벤트 선발행
- 첫 프레임은 반드시 `connect` req
- 프로토콜 버전 협상(min/max)
- origin 검사(Control UI/WebChat)
- gateway auth(token/password/tailscale)
- device identity/pairing 검증

### 4.5 HTTP 서피스

- `src/gateway/server-http.ts`

라우팅 포함:
- hooks
- tools invoke
- Slack HTTP
- OpenAI chat completions endpoint
- OpenResponses endpoint
- Control UI 정적 서빙
- Canvas 관련 경로

### 4.6 메서드 표면

- `src/gateway/server-methods-list.ts`

대표 메서드:
- `health`, `status`, `send`, `agent`
- `sessions.*`, `cron.*`, `node.*`
- `config.*`, `wizard.*`, `skills.*`, `models.list`

### 4.7 플러그인 시스템

- `src/plugins/runtime.ts`
- `src/gateway/server-plugins.ts`
- `src/channels/plugins/index.ts`

런타임 활성 레지스트리에 채널/툴/핸들러를 주입해 메서드/채널을 확장하는 구조다.

### 4.8 메모리 시스템

- `src/memory/manager.ts`

특징:
- SQLite + sqlite-vec + FTS 하이브리드
- provider embedding(OpenAI/Gemini/Voyage/local)
- watcher/interval sync/batch 처리
- QMD 백엔드(실험) 문서화

## 5. 설치/운영 모델

### 5.1 런타임/패키징

- Node >= 22.12.0 요구
- npm 패키지 버전: `2026.2.6-3` (분석 시점 package.json)
- pnpm workspace + tsdown 빌드 파이프라인

### 5.2 설치 스크립트

- `https://openclaw.ai/install.sh`
- `https://openclaw.ai/install-cli.sh`
- `https://openclaw.ai/install.ps1`

문서 기준 동작:
- Node/Git 사전 조건 보장
- npm 또는 git 설치
- 필요시 doctor/onboard 실행

참고: `docs/install/installer.md`

### 5.3 서비스 운영

- foreground: `openclaw gateway`
- supervised: launchd/systemd user service
- status/health/logs CLI 내장

참고: `docs/gateway/index.md`

## 6. 보안 모델 (핵심)

### 6.1 접근 제어 기본축

1. DM pairing(모르는 발신자 차단/승인)
2. Device pairing(노드 디바이스 승인)
3. allowlist/group policy
4. gateway auth(token/password)
5. sandbox(선택)

### 6.2 프록시/원격 보안

- `gateway.trustedProxies` 없으면 프록시 헤더를 로컬 신뢰로 취급하지 않음
- Control UI insecure auth 옵션은 강한 downgrade로 명시적 경고
- Tailscale Serve/Funnel 조건 검증 존재

### 6.3 운영 점검

- `openclaw security audit`
- `openclaw security audit --deep`
- `openclaw security audit --fix`

참고:
- `docs/gateway/security/index.md`
- `docs/channels/pairing.md`
- `docs/gateway/sandboxing.md`

## 7. OpenClaw를 따라 만들기 위한 재현 청사진

### Phase 1 (MVP)

목표: 단일 Gateway + 1채널 + 1에이전트

필수 구현:
- WS 서버 + `connect` 핸드셰이크
- 기본 RPC: `health`, `send`, `agent`
- token auth
- 세션 저장(JSONL/SQLite 중 택1)
- 최소 웹 콘솔

### Phase 2 (확장)

- 플러그인 레지스트리
- 채널 어댑터 다중화
- pairing/allowlist
- idempotency key dedupe
- config schema + validation

### Phase 3 (운영)

- daemon install/관리
- hot reload + 재시작 정책
- security audit/doctor
- sandbox 모드
- node pairing + node.invoke

### Phase 4 (제품화)

- macOS/iOS/Android 노드 앱
- OpenAI-compatible HTTP endpoints
- cron/hooks
- CI 매트릭스/릴리스 자동화

## 8. 트레이드오프 (복제 전략)

### 옵션 A: 단일 모놀리식 리포
- 장점: 초기 속도 빠름
- 단점: 결합도 상승, 팀 확장 시 경계 모호

### 옵션 B: gateway/channels/apps 분리 리포
- 장점: 경계 명확, 조직 확장 유리
- 단점: 릴리스/버전 조율 비용 증가

### 옵션 C: protocol-first
- 장점: 장기 안정성/호환성 최고
- 단점: 초기 설계 공수 큼

권장: 초기엔 A로 빠르게 만들고, 플러그인/프로토콜 경계가 안정되면 B 또는 C로 진화.

## 9. 구현 시 즉시 참고 파일

- `src/index.ts`
- `src/cli/program/build-program.ts`
- `src/cli/program/command-registry.ts`
- `src/cli/program/register.onboard.ts`
- `src/commands/onboard.ts`
- `src/wizard/onboarding.ts`
- `src/gateway/server.impl.ts`
- `src/gateway/server-http.ts`
- `src/gateway/server/ws-connection.ts`
- `src/gateway/server/ws-connection/message-handler.ts`
- `src/gateway/server-methods-list.ts`
- `src/config/types.gateway.ts`
- `src/plugins/runtime.ts`
- `src/gateway/server-plugins.ts`
- `src/channels/plugins/index.ts`
- `src/memory/manager.ts`

## 10. 공식 레퍼런스 링크

- https://openclaw.ai
- https://github.com/openclaw/openclaw
- https://github.com/openclaw/openclaw/blob/main/README.md
- https://docs.openclaw.ai/concepts/architecture
- https://docs.openclaw.ai/gateway
- https://docs.openclaw.ai/gateway/protocol
- https://docs.openclaw.ai/gateway/security
- https://docs.openclaw.ai/install/installer

