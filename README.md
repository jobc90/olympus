<h1 align="center">Olympus</h1>

<p align="center">
  <a href="./README.md"><img src="https://img.shields.io/badge/Language-한국어-blue?style=for-the-badge" alt="Korean"/></a>
  <a href="./README.en.md"><img src="https://img.shields.io/badge/Language-English-lightgrey?style=for-the-badge" alt="English"/></a>
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"/></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-22%2B-green.svg" alt="Node.js"/></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.8-blue.svg" alt="TypeScript"/></a>
</p>

<p align="center">
  <b>Claude CLI Enhanced Platform v1.0.0</b> — Team Engineering + Gateway + Dashboard
</p>

<p align="center">
  <i>"Claude CLI 하나로는 부족했던 것들을 채워주는 Multi-AI 협업 개발 플랫폼"</i>
</p>

---

## 📖 Table of Contents

- [Why Olympus?](#-why-olympus)
- [Claude CLI vs Olympus](#-claude-cli-vs-olympus)
- [Quick Start](#-quick-start)
- [대시보드 스크린샷](#-대시보드-스크린샷)
- [핵심 기능](#-핵심-기능)
- [사용법](#-사용법)
- [Worker 시스템](#-worker-시스템)
- [Telegram 봇](#-telegram-봇)
- [Team Engineering Protocol](#-team-engineering-protocol)
- [Architecture](#-architecture)
- [Development](#-development)
- [Troubleshooting](#-troubleshooting)

---

## 🖼️ 대시보드 스크린샷

<p align="center">
  <img src="docs/image/dashboard.png" alt="Olympus Dashboard Console Tab" width="48%" />
  <img src="docs/image/monitor.png" alt="Olympus Dashboard Monitor Tab" width="48%" />
</p>

---

## 🏛️ Why Olympus?

Claude CLI는 강력합니다. 하지만 **혼자서** 개발하는 데에는 한계가 있습니다.

| 문제 | Claude CLI 단독 | Olympus가 해결하는 방법 |
|------|----------------|----------------------|
| **에이전트가 1명** | 하나의 Claude가 모든 걸 처리 | 19개 전문 에이전트가 역할을 나눠 협업 |
| **터미널 앞에 있어야 함** | 노트북 닫으면 끝 | Telegram 봇으로 침대에서도 코딩 지시 |
| **진행 상황이 보이지 않음** | 터미널 텍스트 스크롤 | 실시간 대시보드로 모든 에이전트 활동 시각화 |
| **컨텍스트가 휘발** | 세션 끝나면 다 잊어버림 | SQLite 영구 저장 + GeminiAdvisor 장기 기억 합성 |
| **한 번에 하나만** | 터미널 1개 = CLI 1개 | 최대 5개 CLI 동시 병렬 실행 |
| **Claude만 쓸 수 있음** | 다른 AI 활용 불가 | Claude + Gemini + Codex 협업 |

### Olympus가 제공하는 것

- 🤖 **19개 전문 에이전트** — architect, designer, qa-tester 등이 `/team` 한 번으로 자동 협업
- 📱 **Telegram 원격 조작** — 어디서든 `@worker-name 작업` 으로 워커에 직접 지시
- 📊 **OlympusMountain 대시보드** — 그리스 신화 테마의 실시간 에이전트 모니터링
- 🧠 **LocalContextStore** — 프로젝트/워커별 계층적 컨텍스트 자동 축적
- ⚡ **병렬 실행** — ConcurrencyLimiter로 최대 5개 CLI 동시 spawn
- 🔮 **GeminiAdvisor** — Gemini가 프로젝트 분석 + 전체 작업 이력(최대 50개) 합성하여 Codex 장기 기억 보강

---

## ⚔️ Claude CLI vs Olympus

| 기능 | Claude CLI 단독 | Olympus |
|------|----------------|---------|
| 에이전트 | 수동 Task 호출 | 19개 전문 에이전트 자동 협업 (`/team`) |
| 원격 조작 | 터미널 앞에 있어야 함 | Telegram 봇으로 어디서든 조작 |
| 모니터링 | 터미널 텍스트 | 실시간 대시보드 (OlympusMountain v3) |
| 컨텍스트 | 세션마다 초기화 | SQLite 기반 영구 저장 (LocalContextStore) |
| 병렬 실행 | 터미널 1개 = 1 CLI | ConcurrencyLimiter (최대 5개 동시) |
| 워커 시스템 | 없음 | PTY Worker 등록/관리/작업 할당 |
| Multi-AI | Claude만 | Claude + Gemini + Codex 협업 |
| 팀 프로토콜 | 없음 | 5대 메커니즘 (Consensus, 2-Phase, Review, QA, Circuit Breaker) |
| 비용 추적 | 세션별만 | SessionCostTracker (전체 누적) |

### Before / After 시나리오

#### 시나리오 1: 대규모 리팩토링

**Before — Claude CLI 단독:**
```
# 터미널에서 직접 지시
> "auth 모듈을 JWT에서 OAuth2로 마이그레이션해줘"

# Claude 혼자서 순차적으로:
# 1. 코드 분석 (10분)
# 2. 마이그레이션 코드 작성 (30분)
# 3. 테스트 수정 (15분)
# 4. 타입 에러 수정 (10분)
# 5. 빌드 확인 (5분)
# 총 70분, 코드 리뷰 없음, 보안 검증 없음
```

**After — Olympus `/team`:**
```
# Claude CLI에서 한 줄이면 끝
/team "auth 모듈을 JWT에서 OAuth2로 마이그레이션"

# Olympus가 자동으로:
# 1. analyst — 요구사항 분석 + 영향 범위 파악
# 2. architect — 마이그레이션 설계 + 의존성 DAG 생성
# 3. executor-1~3 — 병렬로 코드 수정 (파일 소유권 분리)
# 4. code-reviewer + security-reviewer — 코드 리뷰 + 보안 검증
# 5. qa-tester — 증거 기반 테스트
# 6. git-master — 원자적 커밋 정리
# 총 25분, 리뷰 완료, 보안 검증 완료
```

#### 시나리오 2: 외출 중 핫픽스

**Before — Claude CLI 단독:**
```
# 1. 급한 버그 발견 (Slack 알림)
# 2. 노트북 열기... 어? 집에 두고 왔다
# 3. 카페 가서 노트북 열기 (30분 낭비)
# 4. 터미널 열고 Claude CLI 시작
# 5. 컨텍스트 처음부터 다시 설명
```

**After — Olympus + Telegram:**
```
# 핸드폰에서 Telegram으로:

@backend-worker "결제 API에서 null pointer 에러 수정해줘.
에러 로그: PaymentService.processOrder() line 42"

# 워커가 즉시:
# 1. 코드 분석 + 원인 파악
# 2. 수정 + 테스트 통과 확인
# 3. 결과 Telegram으로 알림
# 소요 시간: 커피 한 잔 마시는 동안
```

---

## 🚀 Quick Start

### 사전 요구사항

| 항목 | 필수 | 확인 방법 |
|------|------|----------|
| **Node.js 22+** | ✅ 필수 | `node --version` |
| **pnpm** | ✅ 필수 | `npm i -g pnpm` |
| **Claude CLI** | ✅ 필수 | `npm i -g @anthropic-ai/claude-code` |
| **빌드 도구** | ✅ 필수 (node-pty) | macOS: `xcode-select --install` / Linux: `sudo apt install build-essential python3` |
| **Gemini CLI** | 선택 (Multi-AI) | `npm i -g @google/gemini-cli` |
| **Codex CLI** | 선택 (Multi-AI) | `npm i -g @openai/codex` |

---

### Step 1. 설치 (macOS / Linux)

```bash
git clone https://github.com/jobc90/olympus.git
cd olympus
./install.sh
```

> **설치 모드 선택 안내** (대화형 메뉴에서 선택):
> - **1) 명령어만 전역 등록 `--commands` (권장)** — `/team`, `/agents` 등 어디서든 사용 가능. 기존 `~/.claude/` 설정을 건드리지 않음
> - **2) 전역 설치 `--global`** — 에이전트, MCP, 스킬 모두 `~/.claude/`에 설치. ⚠️ 기존 설정에 영향 가능
> - **3) 로컬 설치 `--local`** — 이 프로젝트 디렉토리에서만 동작

### Step 1. 설치 (Windows)

```bash
# Git Bash / MINGW (권장)
git clone https://github.com/jobc90/olympus.git
cd olympus
./install-win.sh
```

```powershell
# PowerShell
git clone https://github.com/jobc90/olympus.git
cd olympus
.\install.ps1
```

> `install.sh`는 macOS/Linux 전용입니다. Windows에서는 `install-win.sh` (Git Bash) 또는 `install.ps1` (PowerShell)을 사용하세요.

---

### Step 2. 환경변수 설정 (Telegram 봇 사용 시)

```bash
# 예시 파일 복사
cp .env.example .env

# 값 편집 후 shell 설정에 추가
# ~/.zshrc 또는 ~/.bashrc에 아래 추가:
export TELEGRAM_BOT_TOKEN="7123456789:AAHxxxxxx..."
export ALLOWED_USERS="123456789"          # 내 Telegram User ID
```

> Telegram을 사용하지 않는다면 이 단계는 건너뜁니다. 환경변수 전체 목록은 `.env.example` 참조.

---

### Step 3. 서버 시작

```bash
# Gateway + Dashboard + Telegram 봇 한 번에 시작
olympus server start
```

브라우저에서 `http://localhost:8201` 접속 시 실시간 대시보드가 열립니다.

---

### Step 4. 워커 등록 (다른 터미널에서)

```bash
cd /path/to/your/project    # 작업할 프로젝트 디렉토리로 이동
olympus start               # Gateway에 워커로 등록 + Claude CLI 시작
```

---

### Step 5. Team 모드 사용

Claude CLI 세션 안에서:

```bash
/team "로그인 페이지 UI 개선"
```

또는 Telegram에서:

```
/team 결제 모듈 리팩토링
@backend-worker 에러 로그 분석해줘
```

---

### 수동 설치 (모든 OS 공통)

```bash
git clone https://github.com/jobc90/olympus.git
cd olympus
pnpm install && pnpm build
cd packages/cli && npm link    # olympus 글로벌 CLI 등록
```

---

## ✨ 핵심 기능

| 기능 | 설명 |
|------|------|
| **19 Custom Agents** | 3개 Core + 16개 On-Demand 전문 에이전트 (`.claude/agents/`) |
| **Team Engineering Protocol** | 5대 메커니즘 + DAG 기반 병렬 실행 + Streaming Reconciliation |
| **PTY Worker** | node-pty 기반 상주형 Claude CLI — TUI 표시 + 완료 감지 + 결과 추출 |
| **Worker Registry** | Gateway 인메모리 워커 등록 + 하트비트 + 작업 할당 |
| **stdout 스트리밍** | CLI 출력 실시간 WebSocket 브로드캐스트 (`cli:stream` 이벤트) |
| **병렬 CLI 실행** | ConcurrencyLimiter (최대 5개 동시 실행) |
| **Telegram 워커 위임** | `@멘션` 방식 워커 직접 지시 + `/team` 봇 명령어 |
| **LocalContextStore** | SQLite 기반 계층적 컨텍스트 저장소 (프로젝트/워커 레벨) |
| **GeminiAdvisor** | Gemini CLI 기반 프로젝트 분석 + 작업 이력 합성 — Codex 장기 기억 자동 보강 |
| **OlympusMountain v3** | 그리스 신화 테마 대시보드 (20 신 아바타, 10 구역, 실시간 시각화) |

---

## 🛠️ 사용법

### 1. Claude CLI 실행 (기본)

```bash
olympus
```

인자 없이 `olympus`를 실행하면 Claude CLI가 시작됩니다.

### 2. Worker 세션 시작 (PTY 모드)

```bash
# 현재 디렉토리를 워커로 등록
olympus start

# 특정 프로젝트 경로 + 워커 이름 지정
olympus start -p /path/to/project -n backend-worker

# 자동 승인 모드
olympus start-trust
```

`olympus start`는 PTY Worker를 Gateway에 등록하고 작업을 대기합니다. Claude CLI TUI가 즉시 표시되며, 워커 출력은 WebSocket으로 실시간 스트리밍됩니다.

### 3. 서버 관리

```bash
# 전체 서버 시작 (Gateway + Dashboard + Telegram)
olympus server start

# 개별 서비스만 시작
olympus server start --gateway
olympus server start --dashboard
olympus server start --telegram

# 서버 종료 / 상태 확인
olympus server stop
olympus server status
```

### 4. 초기 설정

```bash
# 초기 설정 마법사 (Gateway + Telegram + 모델 설정)
olympus setup

# 빠른 설정 + 시작
olympus quickstart
```

### 설치 모드 선택

| 모드 | 명령어 | `~/.claude/` 영향 | 추천 대상 |
|------|--------|------------------|----------|
| **명령어만 전역 (권장)** | `--commands` | `commands/`만 symlink | 기존 Claude 설정 보존하면서 `/team` 사용 |
| **전역 설치** | `--global` | `agents/` + `commands/` + `settings.json` | 새 사용자, 다른 프로젝트에서도 에이전트 사용 |
| **로컬 설치** | `--local` | 전혀 건드리지 않음 | Olympus 디렉토리 안에서만 사용 |

**macOS / Linux:**

```bash
# 권장 — 명령어만 전역 등록 (기존 ~/.claude/ 보존)
./install.sh --commands

# 전역 설치 — 에이전트까지 ~/.claude/에 설치
./install.sh --global

# 로컬 설치 — 이 프로젝트에서만 동작
./install.sh --local

# CLAUDE.md에 Olympus managed block 반영 (선택, 어느 모드와도 조합 가능)
./install.sh --commands --with-claude-md
```

**Windows (Git Bash / PowerShell):**

```bash
# Git Bash
./install-win.sh --commands
./install-win.sh --global
```

```powershell
# PowerShell
.\install.ps1 -Mode commands
.\install.ps1 -Mode global
.\install.ps1 -Mode local
.\install.ps1 -Mode commands -WithClaudeMd
```

> **기본 동작은 비침범**입니다. `~/.claude/CLAUDE.md`는 수정하지 않습니다. `--commands` 모드는 `~/.claude/agents/`, `settings.json` 등 기존 설정을 전혀 건드리지 않습니다.

---

## ⚙️ Worker 시스템

### PTY Worker

**PTY Worker**는 node-pty 기반으로 상주형 Claude CLI를 관리하는 핵심 모듈입니다.

- **TUI 표시**: Claude CLI의 Ink TUI를 그대로 표시
- **완료 감지**: 프롬프트 패턴(5초 settle) → 30초 무활동 → 60초 강제 완료
- **백그라운드 에이전트 감지**: 7개 패턴 + 30초 쿨다운
- **결과 추출**: ANSI 제거 + TUI 아티팩트 필터 → 8000자 제한
- **폴백**: PTY 모드 실패 시 spawn 모드로 자동 전환

### Worker Registry

Gateway에 인메모리로 워커를 등록하고 하트비트로 상태를 관리합니다.

| API | 설명 |
|-----|------|
| `POST /api/workers/register` | 워커 등록 (mode: `pty` \| `spawn`) |
| `DELETE /api/workers/:id` | 워커 삭제 |
| `POST /api/workers/:id/heartbeat` | 하트비트 (15초 체크, 60초 타임아웃) |
| `POST /api/workers/:id/task` | 작업 할당 |
| `POST /api/workers/tasks/:taskId/result` | 작업 결과 보고 |
| `GET /api/workers/tasks/:taskId` | 작업 상태 조회 |

---

## 📱 Telegram 봇

Telegram 봇으로 원격에서 Claude CLI를 조작할 수 있습니다.

### 설정 방법

**Step 1: 봇 생성 — @BotFather**

1. Telegram에서 [@BotFather](https://t.me/botfather) 검색 후 채팅 시작
2. `/newbot` 전송
3. 봇 이름 입력 (예: `My Olympus Bot`)
4. 봇 username 입력 — **반드시 `bot`으로 끝나야 함** (예: `my_olympus_bot`)
5. BotFather가 토큰을 발급해 줌: `7123456789:AAHxxxxxx...`

**Step 2: 내 User ID 확인 — @userinfobot**

1. Telegram에서 [@userinfobot](https://t.me/userinfobot) 검색 후 채팅 시작
2. `/start` 전송
3. 응답에서 `Id: 123456789` 형태로 User ID 확인

**Step 3: 환경 변수 설정**

```bash
# ~/.zshrc 또는 ~/.bashrc에 추가 후 source ~/.zshrc 실행
export TELEGRAM_BOT_TOKEN="7123456789:AAHxxxxxx..."   # Step 1에서 복사한 토큰
export ALLOWED_USERS="123456789"                      # Step 2에서 확인한 User ID
                                                      # 여러 명이면 쉼표로 구분: "111,222,333"
```

**Step 4: 서버 시작**

```bash
# Gateway가 먼저 실행 중이어야 합니다
olympus server start           # Gateway + Dashboard + Telegram 동시 시작
# 또는 Telegram 봇만: olympus server start --telegram
```

**Step 5: 봇 연결 확인**

Telegram에서 본인 봇에게 `/health` 전송 → `✅ Gateway 연결됨` 응답이 오면 정상입니다.

### 사용 방법

| 명령어 | 설명 |
|--------|------|
| `/start` | 도움말 표시 |
| `/health` | 상태 확인 |
| `/workers` | 워커 목록 표시 |
| `/team <요청>` | Team Engineering Protocol 실행 |
| 일반 메시지 | Claude CLI에 전송 |
| `@worker-name 작업` | 워커에 직접 작업 지시 |

**인라인 쿼리**: 아무 채팅에서 `@봇이름`을 입력하면 사용 가능한 워커 목록이 표시됩니다.

---

## 🏟️ Team Engineering Protocol

19개 전문 에이전트가 협업하는 팀 엔지니어링 체계입니다.

### 사용 방법

```bash
# Claude CLI에서
/team "로그인 페이지 UI 개선"

# Telegram 봇에서
/team 장바구니 기능 추가

# 워커에 Team 작업 위임
@backend-worker team API 성능 최적화
```

### 5대 핵심 메커니즘

| 메커니즘 | 설명 |
|---------|------|
| **Consensus Protocol** | 리더(Claude)가 팀원 의견을 수렴하여 주요 결정 |
| **2-Phase Development** | Coding Phase → Debugging Phase 분리 (테스트 수정으로 문제 마스킹 방지) |
| **Two-Stage Review** | Stage 1 (명세 준수) → Stage 2 (코드 품질), Stage 1 실패 시 Stage 2 생략 |
| **Evidence-Based QA** | 모든 assertion에 캡처 증거 필수, 가정 기반 판정 금지 |
| **Circuit Breaker** | 3회 실패 시 접근 방식 재평가, 무한 루프 방지 |

### Agent Activation Policy

**Core Agents (항상 사용 가능 — 3개)**:

| Agent | Model | 역할 |
|-------|-------|------|
| `explore` | Haiku | 빠른 코드베이스 검색 |
| `executor` | Opus | 집중 실행, 직접 구현 |
| `writer` | Sonnet | 문서 작성 |

**On-Demand Agents (Team 모드에서만 — 16개)**:

| Agent | Model | 역할 |
|-------|-------|------|
| `architect` | Opus | 아키텍처 설계 & 디버깅 |
| `analyst` | Opus | 요구사항 분석 |
| `planner` | Opus | 전략적 계획 수립 |
| `designer` | Sonnet | UI/UX 설계 |
| `researcher` | Sonnet | 문서 & 리서치 |
| `code-reviewer` | Opus | 코드 리뷰 (2단계) |
| `verifier` | Sonnet | 시각 분석 |
| `qa-tester` | Sonnet | 증거 기반 테스트 |
| `vision` | Sonnet | 스크린샷/다이어그램 분석 |
| `test-engineer` | Sonnet | 테스트 설계/구현 |
| `build-fixer` | Sonnet | 빌드/타입 에러 수정 |
| `git-master` | Sonnet | Git 워크플로우 |
| `api-reviewer` | Sonnet | API 설계 리뷰 |
| `performance-reviewer` | Sonnet | 성능 최적화 리뷰 |
| `security-reviewer` | Sonnet | 보안 취약점 리뷰 |
| `style-reviewer` | Haiku | 코드 스타일 리뷰 |

### 설치 확인

```bash
# 전역 설치 시
ls ~/.claude/agents/    # 19개 .md 파일

# 로컬 설치 시
ls .claude/agents/
```

---

## 🏗️ Architecture

### 패키지 구조 (10개)

```
protocol → core → gateway ──→ cli
    │        │        ↑         ↑
    ├→ client → tui ──┤─────────┤
    │        └→ web   │         │
    ├→ telegram-bot ──┘─────────┘
    └→ codex (Codex Orchestrator)
```

### Gateway 내부 아키텍처

```
┌──────────────────────── Gateway ─────────────────────────┐
│                                                           │
│  Claude CLI ◄── CliRunner ──────► stdout 실시간 스트리밍  │
│  Codex CLI  ◄── CodexAdapter ◄──► codex 패키지           │
│  Gemini CLI ◄── GeminiAdvisor ──► 컨텍스트 보강 (Athena) │
│                     │                                     │
│                     ├──► Codex 채팅 / Worker 작업에       │
│                     │    프로젝트 분석 결과 자동 주입     │
│                     └──► 전체 작업 이력(50개) 합성 →     │
│                          Codex 장기 기억 (workHistory)    │
│                                                           │
│  WorkerRegistry · MemoryStore · SessionStore              │
│  LocalContextStore (SQLite + FTS5 계층적 컨텍스트)        │
└───────────────────────────────────────────────────────────┘
```

| 패키지 | 역할 |
|--------|------|
| `protocol` | 메시지 타입, Agent 상태머신, Worker/Task/CliRunner 인터페이스 |
| `core` | 멀티-AI 오케스트레이션, TaskStore (SQLite), LocalContextStore |
| `gateway` | HTTP + WebSocket 서버, CliRunner, Worker Registry, Session Store |
| `client` | WebSocket 클라이언트 (자동 재연결, 이벤트 구독) |
| `cli` | 메인 CLI, Claude CLI 래퍼, PTY Worker |
| `web` | React 대시보드 (OlympusMountain v3, LiveOutputPanel) |
| `telegram-bot` | Telegram 봇 (워커 위임, `/team`, `/workers`) |
| `tui` | 터미널 UI (React + Ink) |
| `codex` | Codex Orchestrator (라우팅, 세션 관리) |

### 핵심 모듈

| 모듈 | 위치 | 설명 |
|------|------|------|
| **CliRunner** | `gateway/src/cli-runner.ts` | CLI spawn → JSON/JSONL parse + stdout 실시간 스트리밍 |
| **PTY Worker** | `cli/src/pty-worker.ts` | node-pty 상주 CLI — 완료 감지, 결과 추출 |
| **Worker Registry** | `gateway/src/worker-registry.ts` | 인메모리 워커 등록 + 하트비트 (15초/60초) |
| **Session Store** | `gateway/src/cli-session-store.ts` | SQLite 세션 저장 (토큰/비용 누적) |
| **LocalContextStore** | `core/src/local-context-store.ts` | SQLite 계층적 컨텍스트 (FTS5 전문 검색) |
| **GeminiAdvisor** | `gateway/src/gemini-advisor.ts` | Gemini CLI 프로젝트 분석 + 작업 이력 합성 (PTY + spawn 폴백) |

---

## 💻 Development

### Prerequisites

- **Node.js 22+** (권장)
- **pnpm** (`npm i -g pnpm`)
- **Claude CLI** (`npm i -g @anthropic-ai/claude-code`)
- **빌드 도구** (node-pty 네이티브 모듈):
  - macOS: `xcode-select --install`
  - Linux: `build-essential`, `python3`
  - Windows: Visual Studio Build Tools + Python 3
- **Gemini CLI** (선택): Multi-AI 협업 시 필요
- **Codex CLI** (선택): Multi-AI 협업 시 필요

### 빌드 + 테스트

```bash
pnpm install && pnpm build    # 전체 빌드
pnpm test                     # 전체 테스트
pnpm lint                     # TypeScript 타입 체크 (6 packages)
pnpm dev                      # 개발 모드
```

### 로컬 CLI 실행

```bash
cd packages/cli
pnpm build
node dist/index.js
```

---

## 🔧 Troubleshooting

### Dashboard에서 "Failed to fetch" 오류

**원인**: Gateway 미실행 또는 CORS 설정 문제

**해결**:
1. `olympus server start`로 서버 시작
2. Vite dev 서버(포트 5173) 개발 시 CORS는 기본 허용
3. Gateway 설정 변경 후 **반드시 재시작**

### CLI 출력이 대시보드에 표시되지 않음

**원인**: Gateway 미실행 또는 WebSocket 연결 끊김

**해결**:
1. `olympus server status`로 상태 확인
2. `olympus server start`로 재시작

### Windows에서 `olympus` 명령이 인식되지 않음

**해결**:
```bash
# Git Bash
./install-win.sh --global

# PowerShell
.\install.ps1 -Mode global

# 수동 (모든 쉘)
cd packages/cli && npm link
olympus --version
```

### Windows에서 Gemini Advisor가 "gemini CLI 미설치"로 표시됨

**원인**: Gateway의 Gemini CLI 감지 코드가 Unix 전용 `which` 명령어를 사용하여 Windows에서 항상 실패

**해결**: v1.0.1에서 수정됨. `process.platform`에 따라 `where` (Windows) / `which` (Unix) 분기 처리. 최신 버전으로 업데이트 후 서버 재시작:
```bash
pnpm build && olympus server start
```

### Dashboard Usage 섹션이 표시되지 않음

**원인**: `claude-dashboard` statusline 플러그인이 Claude Code 세션에서 실행되지 않거나, `~/.claude/settings.json`의 `statusLine.command` 경로가 올바르지 않음

**해결**:
1. `~/.claude/settings.json`의 `statusLine` 경로 확인:
```json
{
  "statusLine": {
    "type": "command",
    "command": "node <olympus-project-path>/packages/claude-dashboard/dist/index.js"
  }
}
```
2. `claude-dashboard` 빌드 확인: `cd packages/claude-dashboard && pnpm build`
3. Claude CLI 세션을 새로 시작 (statusline 플러그인은 세션 시작 시 로드됨)
4. `~/.olympus/statusline.json` 파일이 생성되는지 확인

### node-pty 빌드 실패

**해결**:
- **macOS**: `xcode-select --install`
- **Linux**: `sudo apt install build-essential python3`
- **Windows**: Visual Studio Build Tools + Python 3

### Telegram 봇 응답 없음

**해결**:
1. `TELEGRAM_BOT_TOKEN`, `ALLOWED_USERS` 환경 변수 확인
2. `olympus server start --telegram`
3. `/health` 명령어로 상태 확인

### `/team` 명령어가 인식되지 않음

**해결**:
1. `--commands` 또는 `--global` 모드로 설치 확인: `ls ~/.claude/commands/team.md`
2. 재설치: `./install.sh --commands`

### `--commands` 모드에서 `/team` 실행 시 MCP 도구 오류

**증상**: `codex_analyze`, `ai_team_patch` 등이 "tool not found"로 실패

**원인**: `--commands` 모드는 `~/.claude/settings.json`을 수정하지 않으므로 MCP가 전역 등록되지 않음. MCP는 olympus 디렉토리 안에서만 활성화됨.

**해결 방법 중 선택**:

```bash
# 방법 1: olympus 디렉토리에서 claude 실행 (MCP .mcp.json 자동 인식)
cd /path/to/olympus
claude

# 방법 2: 전역 MCP 등록 포함 전역 설치로 전환
./install.sh --global

# 방법 3: ~/.claude/settings.json에 MCP 수동 추가
# Troubleshooting > MCP 수동 설정 섹션 참조
```

---

## License

MIT

---

<p align="center">
  <b>Olympus v1.0.0</b> — Claude CLI의 개발 생산성을 위한 Multi-AI 협업 개발 플랫폼
</p>
