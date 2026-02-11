<p align="center">
  <img src="assets/mascot.png" alt="Olympus Mascot" width="200"/>
</p>

<h1 align="center">Olympus</h1>

<p align="center">
  <a href="./README.md"><img src="https://img.shields.io/badge/Language-한국어-blue?style=for-the-badge" alt="Korean"/></a>
  <a href="./README.en.md"><img src="https://img.shields.io/badge/Language-English-lightgrey?style=for-the-badge" alt="English"/></a>
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"/></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-18%2B-green.svg" alt="Node.js"/></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.8-blue.svg" alt="TypeScript"/></a>
</p>

<p align="center">
  <b>Claude CLI Enhanced Platform v0.5.1</b> - Multi-AI Orchestration + Gateway + Dashboard
</p>

<p align="center">
  <i>"Claude CLI의 개발 생산성을 위한 Multi-AI 협업 개발 도구"</i>
</p>

## Table of Contents

- [What is Olympus?](#what-is-olympus)
- [Quick Start](#quick-start)
- [핵심 기능](#핵심-기능)
- [설치 가이드](#설치-가이드)
- [사용법](#사용법)
- [Worker 시스템](#worker-시스템)
- [Telegram 봇 가이드](#telegram-봇-가이드)
- [Multi-AI Orchestration](#multi-ai-orchestration)
- [Architecture](#architecture)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

## What is Olympus?

Olympus는 Claude CLI의 생산성을 극대화하는 **Multi-AI 협업 플랫폼**입니다.

Claude CLI를 중심으로 Gateway, Dashboard, Telegram Bot을 통합하여 로컬/원격 개발 환경을 통합 관리하고, Multi-AI Orchestration (AIOS v5.3)을 통해 Claude + Gemini + Codex가 협업하여 복잡한 작업을 자동화합니다.

```
Claude CLI ──┬─→ PTY Worker (상주형 CLI)
             ├─→ Gateway (HTTP API + WebSocket)
             ├─→ Dashboard (실시간 모니터링)
             └─→ Telegram Bot (원격 조작)
```

## Quick Start

```bash
# 저장소 클론 + 빌드
git clone https://github.com/jobc90/olympus.git
cd olympus
pnpm install && pnpm build

# 전역 설치 (권장)
./install.sh --global

# Claude CLI 실행
olympus

# Claude CLI 내부에서
/orchestration "로그인 페이지 UI 개선"
```

## 핵심 기능

| 기능 | 설명 |
|------|------|
| **PTY Worker** | node-pty 기반 상주형 Claude CLI + TUI 표시 + 명령 입력 + 완료 감지 |
| **Worker Registry** | Gateway에 워커 등록/하트비트/작업 할당 시스템 (인메모리 레지스트리) |
| **stdout 스트리밍** | CLI 출력 실시간 WebSocket 브로드캐스트 (`cli:stream` 이벤트) |
| **병렬 CLI 실행** | ConcurrencyLimiter (최대 5개 동시 실행) |
| **Telegram 워커 위임** | @멘션 방식으로 워커에 직접 작업 지시 + 인라인 쿼리 워커 목록 |
| **Multi-AI Orchestration** | AIOS v5.3 — Claude + Codex Co-Leadership, 10 Phase 워크플로우 |
| **Dashboard** | LiveOutputPanel (실시간 출력) + AgentHistoryPanel + SessionCostTracker |

## 설치 가이드

### Prerequisites

- **Node.js 18+** (CI: Node 20/22)
- **pnpm** (`npm i -g pnpm`)
- **Claude CLI** (`npm i -g @anthropic-ai/claude-code`)
- **빌드 도구** (node-pty 네이티브 모듈 빌드 위해 필요):
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Linux: `build-essential`, `python3`
  - Windows: Visual Studio Build Tools + Python 3

### 설치 모드 선택

```bash
# 전역 설치 (권장) — ~/.claude/에 모든 것 설치, 어디서든 /orchestration 사용
./install.sh --global

# 로컬 설치 — 프로젝트 내 .claude/에 설치, 이 디렉토리에서만 사용
./install.sh --local

# CLAUDE.md에 Olympus managed block 반영 (선택)
./install.sh --global --with-claude-md
```

> **기본 동작은 비침범**입니다. `~/.claude/CLAUDE.md`는 수정하지 않습니다.

### 로컬 설치 주의사항

```bash
# 반드시 olympus 프로젝트 디렉토리에서 실행
cd /path/to/olympus
claude                        # Claude CLI 시작
/orchestration "작업 설명"    # 바로 사용 가능!
```

> ⚠️ **로컬 설치**: olympus 디렉토리에서만 `/orchestration`이 인식됩니다.

## 사용법

### 1. Claude CLI 실행 (기본)

```bash
olympus
```

인자 없이 `olympus`를 실행하면 Claude CLI가 시작됩니다. Claude CLI의 모든 기능을 그대로 사용할 수 있습니다.

### 2. Worker 세션 시작 (PTY 모드)

```bash
# 현재 디렉토리를 워커로 등록 (PTY 모드 — 기본)
olympus start

# 특정 프로젝트 경로 지정
olympus start -p /path/to/project

# 워커 이름 지정 (기본: 디렉토리명)
olympus start -n backend-worker

# 자동 승인 모드 (trust)
olympus start-trust
```

`olympus start`는 **PTY Worker**를 Gateway에 등록하고 작업을 대기합니다. Claude CLI TUI가 즉시 표시되며, 워커 출력은 WebSocket으로 실시간 스트리밍됩니다.

### 3. 서버 관리

```bash
# 전체 서버 시작 (Gateway + Dashboard + Telegram)
olympus server start

# 개별 서비스만 시작
olympus server start --gateway      # Gateway만
olympus server start --dashboard    # Dashboard만
olympus server start --telegram     # Telegram 봇만

# 서버 종료
olympus server stop

# 서버 상태 확인
olympus server status
```

### 4. 초기 설정

```bash
# 초기 설정 마법사 (Gateway + Telegram + 모델 설정)
olympus setup

# 빠른 설정 + 시작
olympus quickstart
```

## Worker 시스템

### PTY Worker (v0.5.1)

**PTY Worker**는 node-pty 기반으로 상주형 Claude CLI를 관리하는 핵심 모듈입니다.

**핵심 기능**:
- **TUI 표시**: Claude CLI의 Ink TUI를 그대로 표시
- **명령 입력**: 프롬프트 제출 + Enter 키 자동 처리
- **완료 감지**: 프롬프트 패턴 (3초 settle) → 20초 무활동 → 60초 강제 완료
- **결과 추출**: ⏺ 마커 기반 추출 → ANSI 제거 → TUI 아티팩트 필터
- **더블 Ctrl+C**: 1초 내 Ctrl+C 두 번으로 종료

**TUI 아티팩트 필터**:
- 스피너 (✢✳✶✻✽·), "(thinking)", "Flowing...", 상태바, 구분선 자동 제거
- 실제 응답만 추출하여 8000자 제한

**폴백 모드**:
- PTY 모드 실패 시 spawn 모드로 자동 전환
- spawn 모드: `stdio: 'inherit'`로 포그라운드 실행

### Worker Registry

Gateway에 인메모리로 워커를 등록하고 하트비트로 상태를 관리합니다.

**Worker API**:
- `POST /api/workers/register` — 워커 등록 (mode: 'pty' | 'spawn')
- `DELETE /api/workers/:id` — 워커 삭제
- `POST /api/workers/:id/heartbeat` — 하트비트 (15초 체크, 60초 타임아웃)
- `POST /api/workers/:id/task` — 작업 할당
- `POST /api/workers/:id/task/result` — 작업 결과 보고
- `GET /api/workers/:id/task/status` — 작업 상태 폴링

**워커 타입**:
```typescript
interface RegisteredWorker {
  id: string;
  name: string;
  projectPath: string;
  mode?: 'pty' | 'spawn';
  status: 'idle' | 'busy';
  lastHeartbeat: Date;
  currentTask?: {
    id: string;
    prompt: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    result?: string;
    error?: string;
  };
}
```

## Telegram 봇 가이드

Telegram 봇으로 원격에서 Claude CLI를 조작할 수 있습니다.

### 설정 방법

#### Step 1: Telegram 봇 생성

1. Telegram에서 `@BotFather` 검색 후 대화 시작
2. `/newbot` 입력 후 봇 이름/사용자명 설정
3. 봇 토큰 저장 (예: `7123456789:AAHxxxxxx...`)

#### Step 2: 사용자 ID 확인

1. `@userinfobot` 검색 후 대화 시작
2. `/start` 입력
3. User ID 저장 (예: `123456789`)

#### Step 3: 환경 변수 설정

```bash
# ~/.zshrc 또는 ~/.bashrc에 추가
export TELEGRAM_BOT_TOKEN="7123456789:AAHxxxxxx..."
export ALLOWED_USERS="123456789"  # 여러 명이면 쉼표로 구분
```

설정 후 터미널 재시작 또는 `source ~/.zshrc`

#### Step 4: 서버 시작

```bash
# Gateway + Telegram 봇 시작
olympus server start

# 또는 Telegram 봇만
olympus server start --telegram
```

### 사용 방법

#### 기본 명령어

| 명령어 | 설명 |
|--------|------|
| `/start` | 도움말 표시 |
| `/health` | 상태 확인 |
| `/workers` | 워커 목록 표시 |
| 일반 메시지 | Claude CLI에 전송 |

#### 워커 위임 (@멘션 방식)

```
@worker-name 작업 내용
```

예시:
```
@backend-worker API 엔드포인트 /api/users 추가
```

Telegram에서 `@워커이름 작업` 형식으로 입력하면:
1. Gateway `POST /api/workers/:id/task`로 작업 할당
2. 워커가 `GET /api/workers/:id/task/status`로 폴링
3. 워커가 작업 완료 후 `POST /api/workers/:id/task/result`로 결과 보고
4. 결과를 Telegram으로 전송

#### 인라인 쿼리 (워커 목록)

아무 채팅에서 `@봇이름`을 입력하면 사용 가능한 워커 목록이 표시됩니다. 워커를 선택하면 `@워커이름 ` 형태로 메시지가 입력되고, 이어서 작업 내용을 입력하면 됩니다.

## Multi-AI Orchestration

Olympus는 **Multi-AI Orchestration Protocol v5.3 (AIOS)**을 완벽하게 내장하고 있습니다.

### 사용 방법

```bash
# Claude CLI에서 실행 (Auto 모드 — 전자동)
/orchestration "로그인 페이지 UI 개선"

# Approval 모드 (Phase 3, 8에서 사용자 확인)
/orchestration --plan "장바구니 기능 추가"

# Strict 모드 (모든 Phase 전환 시 승인)
/orchestration --strict "결제 시스템 리팩토링"

# Telegram 봇에서 실행
/orchestration 장바구니 기능 추가
```

### 10 Phase 워크플로우

| Phase | 이름 | 설명 |
|-------|------|------|
| -1 | Smart Intake | 복잡도 평가 (IMPACT + CONTEXT + LOGIC) → 모드 결정 |
| 0 | Contract-First Design | /find-skills + prometheus 전략 + Contract Document |
| 1 | Multi-Layer DAG | Feature Sets (max 4) + Work Items (4 layers) |
| 2 | Plan Review | ai_team_analyze + Devil's Advocate + Best Practices |
| 3 | Plan Lock | 사용자 승인 + Git Checkpoint |
| 4 | Code Execution | 2-Phase Dev (Coding → TIME_TO_END → Debugging) |
| 5 | Merge & Review | momus 리뷰 + /agent-browser UI 검증 |
| 6 | Improvements | Fix Request + Learning Memory 주입 |
| 7 | Final Test | Build/Lint/Type/Test + Core Scenarios |
| 8 | Judgment | Quality Gates (Hard/Behavior/Soft) → ACCEPT or LOOP |

### Co-Leadership (Claude + Codex)

| AI | 역할 | 담당 |
|----|------|------|
| **Claude** | Orchestrator (CEO/CTO) | Phase 3 승인, Phase 5 병합, Phase 7-8 테스트/판정 |
| **Gemini** | Architect/Frontend | Phase 0 설계, Phase 2 프론트 리뷰, Phase 4 UI 구현 |
| **Codex** | Implementer/Backend | Phase 2 백엔드 리뷰, Phase 4 API/Infra 구현 |

### 인증 설정 (선택)

```bash
# Gemini 인증 (첫 실행 시 OAuth)
gemini

# Codex 인증
codex login
```

## Architecture

### 패키지 구조 (9개)

```
protocol → core → gateway → cli
    │        │       ↑        ↑
    ├→ client → tui ─┤────────┤
    │        └→ web  │        │
    ├→ telegram-bot ─┘────────┘
    └→ codex (Codex Orchestrator)
```

**패키지 역할**:

| 패키지 | 역할 |
|--------|------|
| `protocol` | 메시지 타입, Agent 상태머신, Worker/Task/CliRunner 인터페이스 |
| `core` | 멀티-AI 오케스트레이션, TaskStore (SQLite) |
| `gateway` | HTTP + WebSocket 서버, CliRunner, Worker Registry, Session Store |
| `client` | WebSocket 클라이언트 (자동 재연결, 이벤트 구독) |
| `cli` | 메인 CLI, Claude CLI 래퍼, PTY Worker |
| `web` | React 대시보드 (LiveOutputPanel, AgentHistoryPanel, SessionCostTracker) |
| `telegram-bot` | Telegram 봇 (워커 위임, /workers 명령어) |
| `tui` | 터미널 UI (React + Ink) |
| `codex` | Codex Orchestrator (라우팅, 세션 관리, 컨텍스트 DB) |

### 핵심 모듈

#### CliRunner (Gateway)

CLI 프로세스 spawn → JSON/JSONL parse + stdout 실시간 스트리밍

- **구현**: `gateway/src/cli-runner.ts`
- **타입**: `protocol/src/cli-runner.ts` (12개 타입 + AgentEvent + CliStreamChunk)
- **병렬 실행**: `ConcurrencyLimiter(5)` — 최대 5개 동시 CLI spawn
- **stdout 스트리밍**: `spawnCli`의 `onStdout` → `runCli`의 `params.onStream` → server `cli:stream` 브로드캐스트

#### PTY Worker (CLI)

node-pty 기반 상주형 Claude CLI 관리

- **구현**: `cli/src/pty-worker.ts`
- **strip-ansi**: `cli/src/utils/strip-ansi.ts` (ANSI+OSC+제어문자 제거)
- **완료 감지**: 프롬프트 패턴 (3초) → 20초 무활동 → 60초 강제 완료
- **결과 추출**: ⏺ 마커 기반 → stripAnsi → isTuiArtifactLine 필터 → 8000자 제한

#### Worker Registry (Gateway)

인메모리 워커 등록 + 하트비트 + 작업 할당

- **구현**: `gateway/src/worker-registry.ts`
- **하트비트**: 15초 체크, 60초 타임아웃
- **타입**: `protocol/src/worker.ts` (RegisteredWorker, WorkerRegistration, WorkerTaskRecord)

#### Session Store (Gateway)

SQLite 기반 CLI 세션 저장소 (토큰/비용 누적)

- **구현**: `gateway/src/cli-session-store.ts`
- **API**: `GET /api/cli/sessions`, `DELETE /api/cli/sessions/:id`

## Development

### 빌드 + 테스트

```bash
# 전체 빌드
pnpm install && pnpm build

# 테스트 (576 tests)
pnpm test
# - gateway: 372
# - codex: 82
# - telegram-bot: 57
# - cli: 54
# - core: 24

# TypeScript 타입 체크 (6 packages)
pnpm lint

# 개발 모드
pnpm dev
```

### 로컬 CLI 실행

```bash
cd packages/cli
pnpm build
node dist/index.js
```

### 전역 설치 (개발용)

```bash
./install.sh --local
```

## Troubleshooting

### Dashboard에서 "Failed to fetch" 오류

**원인**: Gateway가 실행되지 않았거나 CORS 설정 문제

**해결**:
1. `olympus server start`로 서버 시작 (Dashboard에 Gateway 설정 자동 주입)
2. Vite dev 서버(포트 5173)로 개발 중이라면 CORS는 기본 허용됨
3. Gateway 설정 변경 후 **반드시 Gateway 재시작**

### CLI 출력이 대시보드에 표시되지 않음

**원인**: Gateway 서버가 실행되지 않았거나 WebSocket 연결 끊김

**해결**:
1. Gateway 서버 실행 확인: `olympus server status`
2. 서버 재시작: `olympus server start`
3. LiveOutputPanel이 실시간 stdout 출력을 표시합니다

### node-pty 빌드 실패

**원인**: 네이티브 모듈 빌드 도구 미설치

**해결**:
- **macOS**: `xcode-select --install`
- **Linux**: `sudo apt install build-essential python3`
- **Windows**: Visual Studio Build Tools + Python 3 설치

### Telegram 봇 응답 없음

**원인**: 환경 변수 미설정 또는 Gateway 미실행

**해결**:
1. `TELEGRAM_BOT_TOKEN`, `ALLOWED_USERS` 환경 변수 확인
2. `olympus server start --telegram` 또는 `olympus server start`
3. `/health` 명령어로 상태 확인

## License

MIT

---

<p align="center">
  <b>Olympus v0.5.1</b> - Claude CLI의 개발 생산성을 위한 Multi-AI 협업 개발 도구
</p>
