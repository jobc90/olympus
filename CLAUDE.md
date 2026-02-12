# Olympus v1.0 — Claude CLI Enhanced Platform

**Team Engineering Protocol + Gateway + Dashboard**

## Language Policy

**User-facing output (CLI terminal, Telegram chat) → Korean (한국어)**
**All internal operations → English**: inter-agent communication, subagent task prompts, context storage (LocalContextStore), system prompts, reasoning, logs.

사용자에게 직접 보여지는 응답만 한국어로 작성하고, 나머지 모든 내부 작업은 영어로 진행합니다.

## Architecture

Olympus는 Claude CLI를 중심으로 한 Multi-AI 협업 개발 플랫폼이다. v1.0부터 19개 Custom Agent + Team Engineering Protocol을 내장한다.

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
- **Team 모드**: `/team 작업` 봇 커맨드 또는 `@워커 team 작업` 접두어로 Team Engineering Protocol 활성화
- **인라인 쿼리**: `@봇이름` 입력 시 워커 목록 표시
- **`/workers` 명령어**: 워커 목록 조회

### 19 Custom Agents (`.claude/agents/`)
- **Core 3**: explore (Haiku), executor (Sonnet), writer (Haiku)
- **On-Demand 16**: architect, analyst, planner, designer, researcher, code-reviewer, verifier, qa-tester, vision, test-engineer, build-fixer, git-master, api-reviewer, performance-reviewer, security-reviewer, style-reviewer

### Team Engineering Protocol (`/team` command)
- **Step 0**: Skill & Plugin Discovery
- **Step 1**: Requirement Registry (ZERO LOSS — analyst + explore 병렬 분석, Traceability 검증)
- **Step 2**: Work Decomposition (planner DAG 설계, researcher 기술조사, architect Quality Gate)
- **Step 3**: Team Creation (designer, executor, test-engineer, build-fixer, git-master 등)
- **Step 4**: Consensus Protocol (codex_analyze MCP)
- **Step 5**: 2-Phase Development (ai_team_patch MCP + Team 구현)
- **Step 6**: Multi-Reviewer Gate (code-reviewer + style-reviewer 항상, api/security/performance/vision 조건부 병렬)
- **Step 7**: Spec Verification (verifier — R# 증거 기반 충족 검증)
- **Step 8**: Evidence-Based QA (qa-tester)
- **Step 9**: Finalization (writer 문서화 + git-master 커밋 정리)
- **Circuit Breaker**: 모든 Step에서 3회 실패 시 architect escalate (순차 Step 아님)

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
