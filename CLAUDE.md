# Olympus — Claude CLI Enhanced Platform

**Multi-AI Orchestration + Gateway + Dashboard**

## Language

**항상 한국어(한글)로 응답하세요.** Always respond in Korean.

## Architecture

Olympus는 Claude CLI를 중심으로 한 Multi-AI 협업 개발 플랫폼이다.

```
protocol → core → gateway → cli
    │        │       ↑        ↑
    ├→ client → tui ─┤────────┤
    │        └→ web  │        │
    ├→ telegram-bot ─┘────────┘
    └→ codex (Codex Orchestrator)
```

### Core Pipeline (tmux-free)
1. **Gateway** (`packages/gateway/`) — HTTP API + WebSocket 서버
2. **CliRunner** (`gateway/src/cli-runner.ts`) — CLI 프로세스 spawn → JSON/JSONL → parse + stdout 실시간 스트리밍
3. **Dashboard** (`packages/web/`) — 실시간 대시보드 (LiveOutputPanel, AgentHistoryPanel, SessionCostTracker)
4. **Telegram Bot** (`packages/telegram-bot/`) — HTTP API 기반 동기/비동기 통신

### CLI 실행 방식
- **`olympus server start`** — Gateway + Dashboard + Telegram Bot 통합 실행
- **`olympus start`** — Claude CLI를 현재 터미널에서 foreground 실행 (`spawn + stdio: 'inherit'`)
- **`olympus start-trust`** — `--dangerously-skip-permissions` 모드

### API Endpoints
- `POST /api/cli/run` — 동기 CLI 실행
- `POST /api/cli/run/async` — 비동기 CLI 실행
- `GET /api/cli/run/:id/status` — 비동기 작업 상태 조회
- `GET /api/cli/sessions` — 세션 목록
- `DELETE /api/cli/sessions/:id` — 세션 삭제
- `POST /api/codex/chat` — Codex 대화 (chat 응답만, 워커 위임 기능 제거됨)
- `GET /api/workers` — 워커 목록

### Real-time Streaming
- `cli:stream` WebSocket 이벤트 — stdout 실시간 청크 브로드캐스트
- `cli:complete` WebSocket 이벤트 — CLI 실행 완료 결과

### Telegram Bot 워커 위임
- **직접 멘션 방식**: `@워커이름 작업` 형식으로 사용자가 워커에 직접 작업 지시
- **인라인 쿼리**: `@봇이름` 입력 시 워커 목록 표시 (세션 목록 대신)
- **Codex chat**: 워커 위임 기능 제거, chat 응답만 반환 (`delegate`, `no_workers` 타입 삭제)
- **`/workers` 명령어**: 워커 목록 조회

## Development

```bash
pnpm install && pnpm build    # 전체 빌드
pnpm test                     # 전체 테스트
pnpm lint                     # TypeScript 타입 체크
```

### CLI 백엔드 설정
- **Claude**: `-p --output-format json` → JSON 단일 객체
- **Codex**: `exec --json` → JSONL (thread/turn/item 이벤트)
- **skipPermissions**: Codex = `--dangerously-bypass-approvals-and-sandbox`

## Olympus Local Data

`~/.olympus/` 디렉토리:
- `sessions.json` — 세션 메타데이터
- `worker-logs/` — 워커 출력 로그
- `context.db` — Context OS workspace/project/task 데이터

## Key Conventions

- `tmux` 의존성 없음 (v0.4.0에서 완전 제거)
- Gateway `sessionTimeout <= 0` = 타임아웃 없음
- `bot.launch()` — NEVER await (fire-and-forget + `.catch()`)
- ESM 환경: `vi.spyOn(cp, 'spawn')` 불가, 순수 함수 테스트 집중
- `parseRoute`의 query는 `Record<string, string>` (Map 아님)
