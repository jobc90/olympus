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
  <b>Claude CLI Enhanced Platform v1.0.0</b> - Team Engineering + Gateway + Dashboard
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
- [Team Engineering Protocol](#team-engineering-protocol)
- [Custom Agents (19개)](#custom-agents-19개)
- [Architecture](#architecture)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

## What is Olympus?

Olympus는 Claude CLI의 생산성을 극대화하는 **Multi-AI 협업 플랫폼**입니다.

Claude CLI를 중심으로 Gateway, Dashboard, Telegram Bot을 통합하여 로컬/원격 개발 환경을 통합 관리하고, Team Engineering Protocol을 통해 19개 전문 에이전트가 협업하여 복잡한 작업을 자동화합니다.

```
Claude CLI ──┬─→ PTY Worker (상주형 CLI)
             ├─→ Gateway (HTTP API + WebSocket)
             ├─→ Dashboard (실시간 모니터링)
             ├─→ Telegram Bot (원격 조작)
             └─→ 19 Custom Agents (Team Engineering)
```

## Quick Start

### macOS / Linux

```bash
git clone https://github.com/jobc90/olympus.git
cd olympus
./install.sh --global
olympus
```

### Windows

```bash
git clone https://github.com/jobc90/olympus.git
cd olympus

# Git Bash / MINGW (권장)
./install-win.sh --global

# PowerShell
.\install.ps1 -Mode global
```

### 수동 설치 (모든 OS 공통)

```bash
git clone https://github.com/jobc90/olympus.git
cd olympus
pnpm install && pnpm build
cd packages/cli && npm link    # olympus 글로벌 CLI 등록
```

> **Windows 참고**: `install.sh`는 macOS/Linux 전용 (symlink 사용)입니다. Windows에서는 `install-win.sh` (Git Bash) 또는 `install.ps1` (PowerShell)을 사용하세요. 핵심 차이는 **`npm link`**로 CLI를 등록하는 것이며, 이것이 `.cmd` 래퍼를 생성하여 PowerShell/CMD/Git Bash 모두에서 `olympus` 명령이 작동합니다.

설치 후 Claude CLI 내부에서:
```bash
/team "로그인 페이지 UI 개선"
```

## 핵심 기능

| 기능 | 설명 |
|------|------|
| **19 Custom Agents** | 3개 Core + 16개 On-Demand 전문 에이전트 (`.claude/agents/`) |
| **Team Engineering Protocol** | 5대 메커니즘 (Consensus, 2-Phase Dev, Two-Stage Review, Evidence QA, Circuit Breaker) |
| **PTY Worker** | node-pty 기반 상주형 Claude CLI + TUI 표시 + 명령 입력 + 완료 감지 |
| **Worker Registry** | Gateway에 워커 등록/하트비트/작업 할당 시스템 (인메모리 레지스트리) |
| **stdout 스트리밍** | CLI 출력 실시간 WebSocket 브로드캐스트 (`cli:stream` 이벤트) |
| **병렬 CLI 실행** | ConcurrencyLimiter (최대 5개 동시 실행) |
| **Telegram 워커 위임** | @멘션 방식으로 워커에 직접 작업 지시 + `/team` 봇 명령어 |
| **LocalContextStore** | SQLite 기반 계층적 컨텍스트 저장소 (프로젝트/워커 레벨) |
| **GeminiAdvisor** | Gemini CLI 기반 프로젝트 분석 (Codex 컨텍스트 보강) |
| **OlympusMountain v3** | 그리스 신화 테마 대시보드 (20 신 워커 아바타, 10 구역) |

## 설치 가이드

### Prerequisites

- **Node.js 18+** (CI: Node 20/22)
- **pnpm** (`npm i -g pnpm`)
- **Claude CLI** (`npm i -g @anthropic-ai/claude-code`)
- **빌드 도구** (node-pty 네이티브 모듈 빌드 위해 필요):
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Linux: `build-essential`, `python3`
  - Windows: Visual Studio Build Tools + Python 3
- **Gemini CLI** (선택): Multi-AI 협업 시 필요
- **Codex CLI** (선택): Multi-AI 협업 시 필요

### 설치 모드 선택

**macOS / Linux:**

```bash
# 전역 설치 (권장) — ~/.claude/에 모든 것 설치, 어디서든 /team 사용
./install.sh --global

# 로컬 설치 — 프로젝트 내 .claude/에 설치, 이 디렉토리에서만 사용
./install.sh --local

# CLAUDE.md에 Olympus managed block 반영 (선택)
./install.sh --global --with-claude-md
```

**Windows (Git Bash / PowerShell):**

```bash
# Git Bash (권장)
./install-win.sh --global
./install-win.sh --local
```

```powershell
# PowerShell
.\install.ps1 -Mode global
.\install.ps1 -Mode local
.\install.ps1 -Mode global -WithClaudeMd
```

> **기본 동작은 비침범**입니다. `~/.claude/CLAUDE.md`는 수정하지 않습니다.

### 로컬 설치 주의사항

```bash
# 반드시 olympus 프로젝트 디렉토리에서 실행
cd /path/to/olympus
claude                     # Claude CLI 시작
/team "작업 설명"          # 바로 사용 가능!
```

> ⚠️ **로컬 설치**: olympus 디렉토리에서만 `/team`이 인식됩니다.

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

### PTY Worker (v1.0.0)

**PTY Worker**는 node-pty 기반으로 상주형 Claude CLI를 관리하는 핵심 모듈입니다.

**핵심 기능**:
- **TUI 표시**: Claude CLI의 Ink TUI를 그대로 표시
- **명령 입력**: 프롬프트 제출 + Enter 키 자동 처리
- **완료 감지**: 프롬프트 패턴 (5초 settle) → 30초 무활동 → 60초 강제 완료
- **백그라운드 에이전트 감지**: 7개 패턴 (Task completed, Conversation compacted 등) + 30초 쿨다운
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
| `/team <요청>` | Team Engineering Protocol 실행 |
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

#### Team Engineering Protocol (Telegram)

```
/team 장바구니 기능 추가
```

또는 워커 멘션과 함께:
```
@backend-worker team API 성능 최적화
```

#### 인라인 쿼리 (워커 목록)

아무 채팅에서 `@봇이름`을 입력하면 사용 가능한 워커 목록이 표시됩니다. 워커를 선택하면 `@워커이름 ` 형태로 메시지가 입력되고, 이어서 작업 내용을 입력하면 됩니다.

## Team Engineering Protocol

Olympus v1.0.0은 **Team Engineering Protocol**을 도입하여 19개 전문 에이전트가 협업하는 체계를 제공합니다.

### 사용 방법

```bash
# Claude CLI에서 실행
/team "로그인 페이지 UI 개선"

# Telegram 봇에서 실행
/team 장바구니 기능 추가

# 워커에 Team 작업 위임
@backend-worker team API 성능 최적화
```

### 5대 핵심 메커니즘

| 메커니즘 | 설명 |
|---------|------|
| **Consensus Protocol** | 리더(Claude)가 팀원 의견을 수렴하여 주요 결정 (아키텍처, 기술 선택) |
| **2-Phase Development** | Coding Phase → Debugging Phase 분리 (테스트 수정으로 문제 마스킹 방지) |
| **Two-Stage Review** | Stage 1 (명세 준수) → Stage 2 (코드 품질), Stage 1 실패 시 Stage 2 생략 |
| **Evidence-Based QA** | 모든 assertion에 캡처 증거 필수, 가정 기반 판정 금지 |
| **Circuit Breaker** | 3회 실패 시 접근 방식 재평가, 무한 루프 방지 |

### Agent Activation Policy

**Core Agents (항상 사용 가능 — 3개)**:
- `explore` (Haiku) — 빠른 코드베이스 검색
- `executor` (Sonnet) — 집중 실행, 직접 구현
- `writer` (Haiku) — 문서 작성

**On-Demand Agents (Team 모드에서만 — 16개)**:
- `architect` (Opus) — 아키텍처 설계 & 디버깅
- `analyst` (Opus) — 요구사항 분석
- `planner` (Opus) — 전략적 계획 수립
- `designer` (Sonnet) — UI/UX 설계
- `researcher` (Sonnet) — 문서 & 리서치
- `code-reviewer` (Opus) — 코드 리뷰 (2단계)
- `verifier` (Sonnet) — 시각 분석 (스크린샷/다이어그램)
- `qa-tester` (Sonnet) — CLI/서비스 테스트
- `vision` (Sonnet) — 시각 분석
- `test-engineer` (Sonnet) — 테스트 설계/구현
- `build-fixer` (Sonnet) — 빌드/타입 에러 수정
- `git-master` (Sonnet) — Git 워크플로우
- `api-reviewer` (Sonnet) — API 설계 리뷰
- `performance-reviewer` (Sonnet) — 성능 최적화 리뷰
- `security-reviewer` (Sonnet) — 보안 취약점 리뷰
- `style-reviewer` (Haiku) — 코드 스타일 리뷰

**Disabled Agents (명시적 요청 없이 사용 금지)**:
- 중복 기능 (tiered 에이전트: `*-low`, `*-medium`, `*-high`)
- 특수 도메인 (`smart-contract-*`, `unity-*`, `web3-*` 등)
- 클라우드/인프라 (`terraform-*`, `aws-*`, `kubernetes-*` 등)
- 언어 특화 (`rust-*`, `go-*`, `kotlin-*` 등)

### 설치 확인

```bash
# 전역 설치 시
ls ~/.claude/agents/

# 로컬 설치 시
ls .claude/agents/
```

19개 에이전트 파일 (`*.md`)이 설치되어 있어야 합니다.

## Custom Agents (19개)

v1.0.0부터 Olympus는 19개의 Custom Agents를 `.claude/agents/`에 설치합니다. 이 에이전트들은 Claude CLI의 `/team` 명령어를 통해 협업합니다.

### Agent 역할 정의

#### Core Agents (3개 — 항상 사용 가능)

**`explore`** — 코드베이스 검색 전문가
- **Model**: Haiku (비용 효율)
- **허용 도구**: Glob, Grep, Read (병렬 실행)
- **금지 도구**: Write, Edit, Task (코드 수정·위임 불가)
- **성공 기준**: 절대 경로 반환, 포괄적 매칭, 관계 설명

**`executor`** — 집중 실행자
- **Model**: Sonnet (균형)
- **허용 도구**: 모든 도구 (Read, Write, Edit, Bash, Glob, Grep)
- **금지**: 에이전트 위임, 아키텍처 결정
- **성공 기준**: 최소 변경, LSP 클린, 빌드/테스트 통과

**`writer`** — 기술 문서 작성자
- **Model**: Haiku (빠른 생성)
- **허용 도구**: Read, Glob, Grep, Write (문서 파일만)
- **금지**: 코드 파일 수정

#### On-Demand Agents (16개 — Team 모드에서만)

**`architect`** — 아키텍처 & 디버깅 어드바이저
- **Model**: Opus (복잡한 추론)
- **허용 도구**: Glob, Grep, Read, Bash(git blame/log만)
- **금지**: Write, Edit (코드 수정 불가)
- **Circuit Breaker**: 3회 수정 실패 후 접근 방식 재평가

**`analyst`** — 요구사항 분석 컨설턴트
- **Model**: Opus (분석적 사고)
- **성공 기준**: 누락된 질문 식별, 가드레일 정의, 범위 확장 방지

**`planner`** — 전략적 계획 수립가
- **Model**: Opus (전략적 사고)
- **프로세스**: 사용자 인터뷰 → 코드베이스 조사 → 작업 계획 생성
- **성공 기준**: 3-6개 구체적 단계 + 수락 기준

**`designer`** — UI/UX 설계 전문가
- **Model**: Sonnet
- **허용 도구**: Read, Glob, Grep, Write (UI/스타일 파일)

**`researcher`** — 문서 & 리서치 전문가
- **Model**: Sonnet
- **허용 도구**: Read, Glob, Grep

**`code-reviewer`** — 코드 리뷰 & 비평 전문가
- **Model**: Opus (깊은 분석)
- **2-Stage Review Protocol**:
  - Stage 1: 명세 준수 확인
  - Stage 2: 코드 품질 검토 (Stage 1 통과 시에만)
- **Severity 등급**: CRITICAL / HIGH / MEDIUM / LOW

**`verifier`** — 시각 분석 전문가
- **Model**: Sonnet
- **허용 도구**: Read, Glob, Grep

**`qa-tester`** — 증거 기반 테스트 전문가
- **Model**: Sonnet (실행 + 분석)
- **Critical Rule**: "Always capture-pane BEFORE asserting"
- **세션 명명**: `qa-{service}-{test}-{timestamp}`

**`vision`** — 시각 분석 전문가
- **Model**: Sonnet
- **허용 도구**: 스크린샷/다이어그램 분석

**`test-engineer`** — 테스트 설계/구현 전문가
- **Model**: Sonnet
- **허용 도구**: Read, Write, Bash

**`build-fixer`** — 빌드/타입 에러 수정 전문가
- **Model**: Sonnet
- **허용 도구**: Read, Edit, Bash

**`git-master`** — Git 워크플로우 전문가
- **Model**: Sonnet
- **허용 도구**: Bash(git), Read, Edit

**`api-reviewer`** — API 설계 리뷰 전문가
- **Model**: Sonnet
- **허용 도구**: Read, Grep, Glob

**`performance-reviewer`** — 성능 최적화 리뷰 전문가
- **Model**: Sonnet
- **허용 도구**: Read, Grep, Bash

**`security-reviewer`** — 보안 취약점 리뷰 전문가
- **Model**: Sonnet
- **허용 도구**: Read, Grep, Bash

**`style-reviewer`** — 코드 스타일 리뷰 전문가
- **Model**: Haiku (빠른 체크)
- **허용 도구**: Read, Grep, Bash

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
| `core` | 멀티-AI 오케스트레이션, TaskStore (SQLite), LocalContextStore |
| `gateway` | HTTP + WebSocket 서버, CliRunner, Worker Registry, Session Store |
| `client` | WebSocket 클라이언트 (자동 재연결, 이벤트 구독) |
| `cli` | 메인 CLI, Claude CLI 래퍼, PTY Worker |
| `web` | React 대시보드 (OlympusMountain v3, LiveOutputPanel, SessionCostTracker) |
| `telegram-bot` | Telegram 봇 (워커 위임, /team 명령어, /workers) |
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
- **완료 감지**: 프롬프트 패턴 (5초) → 30초 무활동 → 60초 강제 완료
- **백그라운드 에이전트 감지**: 7개 패턴 + 30초 쿨다운
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

#### LocalContextStore (Core)

SQLite 기반 계층적 컨텍스트 저장소

- **구현**: `core/src/local-context-store.ts`
- **프로젝트 DB**: `{project}/.olympus/context.db`
- **루트 DB**: `{root}/.olympus/context.db`
- **FTS5**: 전문 검색 지원

#### GeminiAdvisor (Gateway)

Gemini CLI 기반 프로젝트 분석

- **구현**: `gateway/src/gemini-advisor.ts`
- **GeminiPty**: `gateway/src/gemini-pty.ts` (PTY + spawn 폴백)
- **API**: GET /api/gemini-advisor/status, /projects, /projects/:path, POST /refresh, /analyze/:path

## Development

### 빌드 + 테스트

```bash
# 전체 빌드
pnpm install && pnpm build

# 테스트 (105 tests)
pnpm test

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

### 전역 CLI 등록 (개발용)

```bash
# macOS / Linux
./install.sh --local

# Windows (PowerShell) — 아래 중 택 1
.\install.ps1 -Mode local
# 또는 수동:
cd packages\cli && npm link
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

### Windows에서 `olympus` 명령이 인식되지 않음

**원인**: `install.sh`는 macOS/Linux용 symlink를 생성하므로 Windows에서 작동하지 않음. Windows는 `npm link`로 `.cmd` 래퍼가 필요.

**해결**:
```bash
# 방법 1: Windows 전용 bash 설치 스크립트 (Git Bash / MINGW)
./install-win.sh --global

# 방법 2: PowerShell 설치 스크립트
.\install.ps1 -Mode global

# 방법 3: 수동 npm link (모든 쉘에서 작동)
cd packages/cli
npm link

# 확인
olympus --version
```

> `npm link`는 npm 글로벌 bin 디렉토리에 `.cmd` 래퍼를 생성하여 PowerShell, CMD, Git Bash 모두에서 작동합니다.

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

### `/team` 명령어가 인식되지 않음

**원인**: 에이전트 파일이 설치되지 않음

**해결**:
1. 전역 설치 확인: `ls ~/.claude/agents/` (19개 파일)
2. 로컬 설치 확인: `ls .claude/agents/` (19개 파일)
3. 재설치: `./install.sh --global` 또는 `./install-win.sh --global`

## License

MIT

---

<p align="center">
  <b>Olympus v1.0.0</b> - Claude CLI의 개발 생산성을 위한 Multi-AI 협업 개발 도구
</p>
