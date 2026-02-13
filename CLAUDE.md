# Olympus v1.0 — Claude CLI Enhanced Platform

**Team Engineering Protocol + Gateway + Dashboard**

## Language Policy

**User-facing output (CLI terminal, Telegram chat) → Korean (한국어)**
**All internal operations → English**: inter-agent communication, subagent task prompts, context storage (LocalContextStore), system prompts, reasoning, logs.

사용자에게 직접 보여지는 응답만 한국어로 작성하고, 나머지 모든 내부 작업은 영어로 진행합니다.

## Architecture

Olympus는 Claude CLI를 중심으로 한 Multi-AI 협업 개발 플랫폼이다. v1.0부터 19개 Custom Agent + Team Engineering Protocol을 내장한다.

### Package Dependencies (Build-time)
```
protocol → core → gateway
    │        │       ↑
    ├→ client ─→ tui ┤
    │   └──────→ web │ (standalone build)
    ├→ telegram-bot  │
    └→ codex ─→ core │
                     │
cli (depends on all: protocol, core, gateway, client, tui, codex, telegram-bot)
```

### Runtime Communication
```
web ←──WebSocket──→ gateway (served by cli `olympus server start`)
tui ←──WebSocket──→ gateway (served by cli `olympus server start`)
telegram-bot ←──HTTP──→ gateway (served by cli `olympus server start`)
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

#### Health & Auth
- `GET /healthz` — 헬스체크 (인증 불필요)
- `POST /api/auth` — API Key 검증
- `POST /api/chat` — 경량 Gemini 채팅 (빠른 응답)

#### CLI Runner
- `POST /api/cli/run` — 동기 CLI 실행
- `POST /api/cli/run/async` — 비동기 CLI 실행 (즉시 taskId 반환)
- `GET /api/cli/run/:id/status` — 비동기 작업 상태 조회
- `GET /api/cli/sessions` — 저장된 CLI 세션 목록
- `DELETE /api/cli/sessions/:id` — CLI 세션 삭제

#### Workers
- `POST /api/workers/register` — 워커 등록
- `GET /api/workers` — 워커 목록
- `DELETE /api/workers/:id` — 워커 삭제
- `POST /api/workers/:id/heartbeat` — 워커 하트비트
- `POST /api/workers/:id/task` — 워커에 작업 할당
- `POST /api/workers/tasks/:taskId/result` — 워커 작업 결과 보고
- `GET /api/workers/tasks/:taskId` — 워커 작업 상태 조회

#### Codex
- `POST /api/codex/chat` — Codex 대화 (@멘션 시 워커 위임)
- `POST /api/codex/route` — Codex Orchestrator 라우팅
- `POST /api/codex/summarize` — 경량 텍스트 요약

#### Runs (Orchestration)
- `POST /api/runs` — 새 실행 생성
- `GET /api/runs` — 전체 실행 목록
- `GET /api/runs/:id` — 실행 상태 조회
- `DELETE /api/runs/:id` — 실행 취소

#### Sessions
- `POST /api/sessions` — 세션 생성
- `GET /api/sessions` — 활성 세션 목록
- `GET /api/sessions/:id` — 세션 조회
- `GET /api/sessions/:id/context` — 세션 + 연결된 컨텍스트 조회
- `DELETE /api/sessions/:id` — 세션 종료
- `POST /api/sessions/:id/input` — *deprecated* (POST /api/cli/run 사용)
- `GET /api/sessions/:id/output` — *deprecated* (CLI streaming 사용)

#### Tasks (Context OS)
- `GET /api/tasks` — 루트 태스크 목록 (?format=tree로 트리 조회)
- `POST /api/tasks` — 태스크 생성
- `GET /api/tasks/:id` — 태스크 조회
- `PATCH /api/tasks/:id` — 태스크 수정
- `DELETE /api/tasks/:id` — 태스크 삭제 (soft)
- `GET /api/tasks/:id/children` — 하위 태스크 목록
- `GET /api/tasks/:id/context` — 태스크 + 해결된 컨텍스트
- `GET /api/tasks/:id/history` — 컨텍스트 변경 이력
- `GET /api/tasks/search` — 태스크 검색 (?q=)
- `GET /api/tasks/stats` — 태스크 통계

#### Contexts (Context OS)
- `GET /api/contexts` — 컨텍스트 목록 (?scope=, ?format=tree)
- `POST /api/contexts` — 컨텍스트 생성
- `GET /api/contexts/:id` — 컨텍스트 조회
- `PATCH /api/contexts/:id` — 컨텍스트 수정 (낙관적 잠금, expectedVersion 필수)
- `DELETE /api/contexts/:id` — 컨텍스트 삭제 (soft)
- `GET /api/contexts/:id/versions` — 버전 이력
- `GET /api/contexts/:id/children` — 하위 컨텍스트
- `POST /api/contexts/:id/merge` — 병합 요청 (비동기 202)
- `POST /api/contexts/:id/report-upstream` — 상위 컨텍스트에 보고 (비동기 202)

#### Operations
- `GET /api/operations/:id` — 비동기 작업 상태 조회

#### Local Context
- `GET /api/local-context/projects` — 루트 전체 프로젝트 컨텍스트
- `GET /api/local-context/:encodedPath/summary` — 프로젝트 통합 컨텍스트
- `GET /api/local-context/:encodedPath/workers` — 워커 컨텍스트 목록
- `GET /api/local-context/:encodedPath/injection` — 주입용 컨텍스트

#### Gemini Advisor
- `GET /api/gemini-advisor/status` — Gemini Advisor 상태
- `GET /api/gemini-advisor/projects` — 캐시된 프로젝트 분석 목록
- `GET /api/gemini-advisor/projects/:encodedPath` — 특정 프로젝트 분석
- `POST /api/gemini-advisor/refresh` — 수동 전체 갱신
- `POST /api/gemini-advisor/analyze/:encodedPath` — 특정 프로젝트 즉시 분석

### WebSocket Events

WebSocket 연결은 `GATEWAY_PATH` 경로로 수립되며, `connect` 메시지로 인증 후 이벤트를 수신한다.

#### Client → Server
- `connect` — API Key 인증 + 클라이언트 등록
- `subscribe` — 특정 Run/Session 구독
- `unsubscribe` — 구독 해제
- `cancel` — Run 취소
- `ping` — 하트비트
- `rpc` — RPC 메서드 호출

#### Server → Client (Broadcast)
- `connected` — 인증 성공 응답
- `runs:list` — 전체 실행 목록 (초기 스냅샷 + 변경 시)
- `sessions:list` — 활성 세션 목록 (초기 스냅샷 + 변경 시)
- `cli:stream` — CLI stdout 실시간 청크
- `cli:complete` — CLI 실행 완료 결과
- `gemini:status` — Gemini Advisor 상태 (초기 스냅샷 + 변경 시)
- `gemini:analysis` — Gemini 분석 완료

#### Server → Client (Worker Events)
- `worker:task:assigned` — 워커에 작업 할당됨
- `worker:task:completed` — 워커 작업 완료
- `worker:task:timeout` — 워커 작업 타임아웃 (부분 결과)
- `worker:task:final_after_timeout` — 타임아웃 후 최종 완료

#### Server → Client (Agent Events, legacy/hybrid mode)
- `agent:progress` — 에이전트 진행 상황
- `agent:result` — 에이전트 결과
- `agent:error` — 에이전트 오류
- `agent:approval` — 에이전트 승인 요청
- `worker:started` — 레거시 워커 시작
- `worker:output` — 레거시 워커 출력
- `worker:done` — 레거시 워커 완료

#### Server → Client (Session Events, subscribed clients only)
- `session:screen` — 세션 화면 출력
- `session:error` — 세션 오류
- `session:closed` — 세션 종료

#### Server → Client (Context Events)
- `context:created` — 컨텍스트 생성됨
- `context:updated` — 컨텍스트 수정됨
- `context:merge_requested` — 병합 요청됨
- `context:merged` — 병합 완료
- `context:conflict_detected` — 병합 충돌 감지
- `context:reported_upstream` — 상위 보고 완료

### Telegram Bot 워커 위임
- **직접 멘션 방식**: `@워커이름 작업` 형식으로 사용자가 워커에 직접 작업 지시
- **Team 모드**: `/team 작업` 봇 커맨드 또는 `@워커 team 작업` 접두어로 Team Engineering Protocol 활성화
- **인라인 쿼리**: `@봇이름` 입력 시 워커 목록 표시
- **`/workers` 명령어**: 워커 목록 조회

### 19 Custom Agents (`.claude/agents/`)
- **Core 3**: explore (Haiku), executor (Sonnet), writer (Haiku)
- **On-Demand 16**: architect, analyst, planner, designer, researcher, code-reviewer, verifier, qa-tester, vision, test-engineer, build-fixer, git-master, api-reviewer, performance-reviewer, security-reviewer, style-reviewer

### Team Engineering Protocol v3.1 (`/team` command — AgentTeam Benchmark)
- **Step 0**: Session Setup (`.team/` 상태 디렉토리 생성)
- **Step 1**: Requirement Registry (ZERO LOSS — analyst + explore 병렬, `.team/requirements.md` 영속 저장)
- **Step 2**: Work Decomposition + **File Ownership Analysis** (planner DAG, **Shared File Zone**, **File Ownership Matrix** → `.team/ownership.json`, **Dependency DAG** — WI-level blockedBy, architect Quality Gate)
- **Step 3**: Team Creation (**1 WI = 1 Teammate** dynamic scaling, `{subagent_type}-{N}` naming, **OWNED + SHARED FILES + BOUNDARY** per WI)
- **Step 4**: Consensus Protocol (codex_analyze MCP)
- **Step 5**: **DAG-Based Parallel Execution** (ai_team_patch MCP, **blockedBy 없는 WI 전부 즉시 시작**, **Streaming Reconciliation 3-Tier** — C-1 Per-WI 경량검증 + C-2 Checkpoint 빌드 + C-3 Final)
- **Step 6**: Multi-Reviewer Gate (code-reviewer + style-reviewer 항상, api/security/performance/vision 조건부 병렬)
- **Step 7**: Spec Verification (verifier — `.team/requirements.md` 기반 R# 증거 검증)
- **Step 8**: Evidence-Based QA (qa-tester)
- **Step 9**: Finalization (writer 문서화 + git-master 커밋 정리 + `.team/` 삭제)
- **Circuit Breaker**: Task metadata `failCount` 영구 기록, 3회 실패 시 architect escalate
- **File Ownership Invariant**: 동일 시점 1파일 = 최대 1팀원, SHARED 파일은 리더/전담자 관리
- **Crash Recovery**: 팀원 무응답 30초→재시도, 60초→재spawn + WI 재할당

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
