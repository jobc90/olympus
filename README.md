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
- [핵심 기능](#-핵심-기능)
- [사용법](#-사용법)
- [Worker 시스템](#-worker-시스템)
- [Telegram 봇](#-telegram-봇)
- [Team Engineering Protocol](#-team-engineering-protocol)
- [Architecture](#-architecture)
- [Development](#-development)
- [Troubleshooting](#-troubleshooting)

---

## 🏛️ Why Olympus?

Claude CLI는 강력합니다. 하지만 **혼자서** 개발하는 데에는 한계가 있습니다.

| 문제 | Claude CLI 단독 | Olympus가 해결하는 방법 |
|------|----------------|----------------------|
| **에이전트가 1명** | 하나의 Claude가 모든 걸 처리 | 19개 전문 에이전트가 역할을 나눠 협업 |
| **터미널 앞에 있어야 함** | 노트북 닫으면 끝 | Telegram 봇으로 침대에서도 코딩 지시 |
| **진행 상황이 보이지 않음** | 터미널 텍스트 스크롤 | 실시간 대시보드로 모든 에이전트 활동 시각화 |
| **컨텍스트가 휘발** | 세션 끝나면 다 잊어버림 | SQLite 기반 영구 컨텍스트 저장 |
| **한 번에 하나만** | 터미널 1개 = CLI 1개 | 최대 5개 CLI 동시 병렬 실행 |
| **Claude만 쓸 수 있음** | 다른 AI 활용 불가 | Claude + Gemini + Codex 협업 |

### Olympus가 제공하는 것

- 🤖 **19개 전문 에이전트** — architect, designer, qa-tester 등이 `/team` 한 번으로 자동 협업
- 📱 **Telegram 원격 조작** — 어디서든 `@worker-name 작업` 으로 워커에 직접 지시
- 📊 **OlympusMountain 대시보드** — 그리스 신화 테마의 실시간 에이전트 모니터링
- 🧠 **LocalContextStore** — 프로젝트/워커별 계층적 컨텍스트 자동 축적
- ⚡ **병렬 실행** — ConcurrencyLimiter로 최대 5개 CLI 동시 spawn
- 🔮 **GeminiAdvisor** — Gemini가 프로젝트를 분석하여 Claude/Codex에 컨텍스트 보강

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

> **Windows 참고**: `install.sh`는 macOS/Linux 전용입니다. Windows에서는 `install-win.sh` (Git Bash) 또는 `install.ps1` (PowerShell)을 사용하세요. `npm link`가 `.cmd` 래퍼를 생성하여 PowerShell/CMD/Git Bash 모두에서 `olympus` 명령이 작동합니다.

설치 후 Claude CLI 내부에서:
```bash
/team "로그인 페이지 UI 개선"
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
| **GeminiAdvisor** | Gemini CLI 기반 프로젝트 분석 — Codex 컨텍스트 자동 보강 |
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

**macOS / Linux:**

```bash
# 전역 설치 (권장) — ~/.claude/에 설치, 어디서든 /team 사용
./install.sh --global

# 로컬 설치 — 프로젝트 내 .claude/에 설치, 이 디렉토리에서만 사용
./install.sh --local

# CLAUDE.md에 Olympus managed block 반영 (선택)
./install.sh --global --with-claude-md
```

**Windows (Git Bash / PowerShell):**

```bash
# Git Bash
./install-win.sh --global
```

```powershell
# PowerShell
.\install.ps1 -Mode global
.\install.ps1 -Mode local
.\install.ps1 -Mode global -WithClaudeMd
```

> **기본 동작은 비침범**입니다. `~/.claude/CLAUDE.md`는 수정하지 않습니다.

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

**Step 1**: `@BotFather`에서 봇 생성 → 토큰 저장

**Step 2**: `@userinfobot`에서 User ID 확인

**Step 3**: 환경 변수 설정

```bash
# ~/.zshrc 또는 ~/.bashrc에 추가
export TELEGRAM_BOT_TOKEN="7123456789:AAHxxxxxx..."
export ALLOWED_USERS="123456789"  # 여러 명이면 쉼표로 구분
```

**Step 4**: 서버 시작

```bash
olympus server start
# 또는 Telegram 봇만: olympus server start --telegram
```

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
| `executor` | Sonnet | 집중 실행, 직접 구현 |
| `writer` | Haiku | 문서 작성 |

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

### 패키지 구조 (9개)

```
protocol → core → gateway → cli
    │        │       ↑        ↑
    ├→ client → tui ─┤────────┤
    │        └→ web  │        │
    ├→ telegram-bot ─┘────────┘
    └→ codex (Codex Orchestrator)
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
| **GeminiAdvisor** | `gateway/src/gemini-advisor.ts` | Gemini CLI 프로젝트 분석 (PTY + spawn 폴백) |

---

## 💻 Development

### Prerequisites

- **Node.js 18+** (CI: Node 20/22)
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
1. 전역 설치 확인: `ls ~/.claude/agents/` (19개 파일)
2. 재설치: `./install.sh --global`

---

## License

MIT

---

<p align="center">
  <b>Olympus v1.0.0</b> — Claude CLI의 개발 생산성을 위한 Multi-AI 협업 개발 플랫폼
</p>
