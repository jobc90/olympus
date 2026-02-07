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
  <b>Claude CLI Enhanced Platform</b> - Multi-AI Orchestration + Gateway + Dashboard
</p>

<p align="center">
  <i>"Claude CLI의 개발 생산성을 위한 Multi-AI 협업 개발 도구"</i>
</p>

## Table of Contents

- [What is Olympus?](#what-is-olympus)
- [Quick Start (60s)](#quick-start-60s)
- [Quick Install](#quick-install)
- [Platform Requirements](#platform-requirements)
- [Usage](#usage)
- [Model Configuration](#model-configuration)
- [Telegram Bot Commands](#telegram-bot-commands)
- [Multi-AI Orchestration (AIOS v5.1)](#multi-ai-orchestration-aios-v51)
- [Architecture](#architecture)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

## What is Olympus?

Olympus는 Claude CLI의 생산성을 극대화하는 **Multi-AI 협업 플랫폼**입니다:

1. **Multi-AI Orchestration (AIOS v5.1)**: Claude + Gemini + Codex Co-Leadership 기반 협업으로 복잡한 작업 자동화
2. **Context OS**: 계층적 컨텍스트 관리 (Workspace → Project → Task), 자동 상향 보고, 병합 워크플로우
3. **Claude CLI 래퍼**: `olympus` 실행 시 Claude CLI가 실행됩니다 (브랜딩만 Olympus)
4. **원격 접근**: Gateway를 통해 Telegram 봇으로 핸드폰에서 로컬 Claude CLI 사용
5. **대시보드**: 웹 UI로 작업 현황 + 컨텍스트 탐색기 모니터링

### 핵심 기능

| 기능 | 설명 |
|------|------|
| `/orchestration` v5.1 | Claude-Codex Co-Leadership, 10 Phase 합의 기반 워크플로우 |
| **Context OS** | 3계층 컨텍스트 (Workspace/Project/Task), SQLite 저장, 자동 상향 보고 |
| **Context Explorer** | 대시보드에서 트리뷰 + 편집 + 버전 이력 + 병합 요청 |
| MCP 서버 | ai-agents (Multi-AI), openapi (Swagger 연동) |
| Skills | frontend-ui-ux, git-master, agent-browser 등 |
| Plugins | claude-dashboard (상태줄, 사용량 표시) |
| **Telegram 봇** | 원격 Claude CLI 조작, Smart Digest 핵심 결과 전달, 비밀 마스킹 |
| **웹 대시보드** | 자동 연결(설정 불필요), 실시간 세션 출력, 컨텍스트 탐색기 |
| **tmux 세션 관리** | 안정적인 세션 유지 및 스크롤 지원 |
| **통합 CLI** | `olympus` 명령어로 모든 기능 접근 |

## Quick Start (60s)

```bash
git clone https://github.com/jobc90/olympus.git
cd olympus
./install.sh --global
olympus setup
olympus start
olympus server start
```

바로 사용:

```bash
olympus
# Claude CLI 내부에서
/orchestration "로그인 페이지 UI 개선"
```

```
┌─────────────────────────────────────────────────────────────────┐
│  로컬 컴퓨터                                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  olympus (Claude CLI 래퍼)                               │   │
│  │  • 기본 실행: Claude CLI 그대로                          │   │
│  │  • Gateway: 원격 접근 허브                                │   │
│  │  • Dashboard: 웹 UI                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                    Gateway (WebSocket)                          │
│                           │                                     │
└───────────────────────────┼─────────────────────────────────────┘
                            │
                     ┌──────▼──────┐
                     │  Telegram   │
                     │    Bot      │
                     └──────┬──────┘
                            │
                     ┌──────▼──────┐
                     │  핸드폰     │
                     │  (원격)     │
                     └─────────────┘
```

## Quick Install

```bash
git clone https://github.com/jobc90/olympus.git
cd olympus
./install.sh
```

### 설치 모드 선택

| 모드 | 설명 | 권장 대상 |
|------|------|----------|
| **전역 설치 (1번)** | `~/.claude/`에 모든 것 설치, 어디서든 `/orchestration` 사용 | 대부분의 사용자 |
| **로컬 설치 (2번)** | 프로젝트 내 `.claude/`에 설치, 이 디렉토리에서만 사용 | 테스트/격리 원할 때 |
| **선택 옵션** | `--with-claude-md` 사용 시에만 `~/.claude/CLAUDE.md`에 Olympus managed block 삽입/업데이트 | CLAUDE.md 지침도 함께 쓰고 싶은 사용자 |

```bash
# 전역 설치 (권장)
./install.sh --global

# 로컬 설치 (이 프로젝트에서만)
./install.sh --local

# 선택: CLAUDE.md에 Olympus managed block 반영
./install.sh --global --with-claude-md
```

> 기본 동작은 비침범입니다. `~/.claude/CLAUDE.md`는 수정하지 않습니다.

### 로컬 설치 후 사용법

```bash
# 반드시 olympus 디렉토리에서 실행
cd /path/to/olympus
claude                        # Claude CLI 시작
/orchestration "작업 설명"    # 바로 사용 가능!
```

> ⚠️ **로컬 설치 주의**: 반드시 olympus 프로젝트 디렉토리에서 `claude`를 실행해야 `/orchestration`이 인식됩니다.

### Prerequisites

- Node.js 18+
- Claude CLI (`npm i -g @anthropic-ai/claude-code`)
- tmux (선택, `olympus start` 사용 시): `brew install tmux`
- Gemini CLI (선택, Multi-AI용): `npm i -g @google/gemini-cli`
- Codex CLI (선택, Multi-AI용): `npm i -g @openai/codex`

## Platform Requirements

| 기능 | macOS | Linux | Windows |
|------|-------|-------|---------|
| `/orchestration` 프로토콜 | ✅ | ✅ | ✅ |
| Claude CLI 래퍼 (`olympus`) | ✅ | ✅ | ✅ |
| 웹 대시보드 | ✅ | ✅ | ✅ |
| MCP 서버 | ✅ | ✅ | ✅ |
| **tmux 세션 (`olympus start`)** | ✅ | ✅ | ❌ |
| **Telegram 봇 연동** | ✅ | ⚠️* | ❌ |

> ⚠️ **Linux**: tmux가 설치되어 있으면 Telegram 봇 연동 가능 (테스트되지 않음)
>
> ❌ **Windows**: tmux를 지원하지 않아 `olympus start` 및 Telegram 봇 연동 기능을 사용할 수 없습니다. `/orchestration` 프로토콜 및 MCP 서버는 정상 작동합니다.

### Telegram 봇 연동 가이드

Telegram 봇으로 원격에서 Claude CLI를 조작할 수 있습니다.

#### Step 1: Telegram 봇 생성 (핸드폰 또는 웹)

**핸드폰에서:**
1. Telegram 앱 설치 (iOS App Store / Google Play)
2. `@BotFather` 검색 후 대화 시작
3. `/newbot` 명령어 입력
4. 봇 이름 입력 (예: `My Claude Bot`)
5. 봇 사용자명 입력 (예: `my_claude_bot` - 반드시 `_bot`으로 끝나야 함)
6. **봇 토큰 저장** (예: `7123456789:AAHxxxxxx...`)

**웹에서 (권장 - 토큰 복사가 편함):**
1. https://webogram.org 또는 https://web.telegram.org 접속
2. 핸드폰 번호로 로그인
3. `@BotFather` 검색 후 위와 동일하게 진행
4. 토큰을 컴퓨터에서 바로 복사 가능

#### Step 2: 사용자 ID 확인

1. `@userinfobot` 검색 후 대화 시작
2. `/start` 입력
3. **User ID 저장** (숫자, 예: `123456789`)

#### Step 3: 환경 변수 설정

```bash
# ~/.zshrc 또는 ~/.bashrc에 추가
export TELEGRAM_BOT_TOKEN="7123456789:AAHxxxxxx..."
export ALLOWED_USERS="123456789"  # 여러 명이면 쉼표로 구분: "123,456,789"
```

설정 후 터미널 재시작 또는 `source ~/.zshrc`

#### Step 4: Olympus 서버 시작

```bash
# 1. tmux에서 Claude CLI 시작
olympus start

# 2. 새 터미널에서 Telegram 봇 시작
olympus server start --telegram

# 또는 한 번에 모두 시작
olympus quickstart
```

#### Step 5: 핸드폰에서 사용

1. Telegram 앱에서 생성한 봇 검색 (예: `@my_claude_bot`)
2. `/start` - 도움말 보기
3. `/sessions` - 연결 가능한 Claude 세션 목록
4. `/use olympus-myproject` - 세션 연결
5. 이제 메시지를 보내면 Claude가 응답!

```
💡 팁: /orchestration 장바구니 기능 추가
      → 핸드폰에서 복잡한 작업도 실행 가능
```

#### 요구사항

- **macOS** 필수 (tmux 기반 세션 관리)
- Node.js 18+
- tmux 설치됨 (`brew install tmux`)

## Usage

### 기본 사용 (Claude CLI 모드)

```bash
# Claude CLI 실행 (Olympus 브랜딩)
olympus
```

인자 없이 `olympus`를 실행하면 Claude CLI가 시작됩니다. Claude CLI의 모든 기능을 그대로 사용할 수 있습니다.

### Claude CLI 세션 시작 (tmux)

```bash
# 현재 디렉토리에서 Claude CLI를 tmux 세션으로 시작
olympus start

# 특정 프로젝트 경로 지정
olympus start -p /path/to/project

# 세션 이름 지정
olympus start -s my-session

# 백그라운드로 시작 (attach 안함)
olympus start --no-attach
```

`olympus start`는 Claude CLI를 tmux 세션에서 실행합니다. 세션 이름은 자동으로 `olympus-{폴더명}` 형식으로 생성됩니다.

### 서버 관리 (Gateway + Dashboard + Telegram)

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

> **Dashboard 자동 연결**: `olympus server start`로 시작하면 Gateway 주소와 API Key가 Dashboard HTML에 자동 주입됩니다. 별도의 설정 없이 브라우저에서 바로 사용할 수 있습니다.

### 설정

```bash
# 초기 설정 마법사 (Gateway + Telegram + 모델 설정)
olympus setup

# 빠른 설정 + 시작 (Telegram 설정 후 서버 시작)
olympus quickstart

# 설정 확인/수정
olympus config
olympus config get gateway.port
olympus config set gateway.port 18790
```

### 개별 서비스 실행

```bash
# Gateway만 시작 (포트 지정 가능)
olympus gateway -p 18790

# Telegram 봇만 시작
olympus telegram

# 웹 대시보드 열기
olympus dashboard

# 터미널 UI
olympus tui
```

## CLI Commands Reference

| 명령어 | 설명 |
|--------|------|
| `olympus` | Claude CLI 실행 (인자 없음) |
| `olympus start` | tmux 세션에서 Claude CLI 시작 |
| `olympus server start` | Gateway + Dashboard + Telegram 통합 시작 |
| `olympus server stop` | 서버 종료 |
| `olympus server status` | 서버 상태 확인 |
| `olympus setup` | 초기 설정 마법사(Gateway/Telegram/모델) |
| `olympus quickstart` | 빠른 설정 + 서버 시작 |
| `olympus config` | 설정 관리 |
| `olympus models` | 모델 설정/동기화(core + MCP) |
| `olympus gateway` | Gateway 서버만 실행 |
| `olympus telegram` | Telegram 봇만 실행 |
| `olympus dashboard` | 웹 대시보드 열기 |
| `olympus tui` | 터미널 UI 실행 |

## Model Configuration

Olympus는 모델명을 하드코딩하지 않고, **환경변수 + 사용자 설정**으로 런타임에 결정할 수 있습니다.

우선순위:
1. 명령/요청에서 직접 전달한 `model`
2. `~/.olympus/config.json`의 모델 설정
3. 환경변수(`OLYMPUS_*_MODEL`)
4. 내장 기본값

주요 환경변수:
- `OLYMPUS_GEMINI_MODEL`
- `OLYMPUS_GEMINI_PRO_MODEL`
- `OLYMPUS_GEMINI_FALLBACK_MODEL`
- `OLYMPUS_GEMINI_FALLBACK_PRO_MODEL`
- `OLYMPUS_CODEX_MODEL`
- `OLYMPUS_OPENAI_MODEL`
- `OLYMPUS_OPENAI_API_BASE_URL`

예시:
```bash
export OLYMPUS_GEMINI_MODEL=gemini-2.5-flash
export OLYMPUS_GEMINI_PRO_MODEL=gemini-2.5-pro
export OLYMPUS_CODEX_MODEL=gpt-4.1
```

동기화 명령:
```bash
# 현재 상태 확인
olympus models show

# 모델 지정 + core/MCP 동시 반영
olympus models set --gemini gemini-2.5-flash --gemini-pro gemini-2.5-pro --codex gpt-4.1

# core를 기준으로 MCP에 동기화
olympus models sync
```

## Telegram Bot Commands

핸드폰 Telegram에서 사용 가능한 명령어:

| 명령어 | 설명 |
|--------|------|
| `/start` | 도움말 표시 |
| `/sessions` | 연결 가능한 세션 목록 |
| `/use <이름>` | 세션 연결/전환 |
| `/close [이름]` | 세션 해제 |
| `/health` | 상태 확인 |
| `/mode raw\|digest` | 출력 모드 전환 (기본: digest) |
| `/raw` | 원문 모드 단축키 |
| `/last` | 마지막 출력 다시 보기 |
| `/orchestration <요청>` | Multi-AI 협업 모드 실행 |
| 일반 메시지 | 활성 세션의 Claude에게 전송 |
| `@이름 메시지` | 특정 세션에 메시지 전송 |

### Smart Digest 모드

Telegram 봇은 기본적으로 **digest 모드**로 동작합니다. 수백 줄의 CLI 출력에서 핵심 결과만 추출하여 800자 이내로 전달합니다.

| 기능 | 설명 |
|------|------|
| **6-카테고리 분류** | build, test, commit, error, phase, change |
| **노이즈 자동 제거** | Reading, Searching, Globbing, 스피너 등 |
| **비밀 마스킹** | API 키, Bearer 토큰, GitHub PAT 자동 마스킹 |
| **하이브리드 트리거** | 에러/완료 → 즉시 전달, 일반 → 5초 debounce |
| **우선순위 기반 예산** | 에러(5점) > 빌드/테스트(4점) > 커밋(3점) 순서로 800자 채움 |

## Multi-AI Orchestration (AIOS v5.1)

Olympus는 **Multi-AI Orchestration Protocol v5.1 (AIOS)**을 완벽하게 내장하고 있습니다. Claude + Codex Co-Leadership 기반으로 `/orchestration` 명령어를 사용하여 Gemini, Codex 등 여러 AI와 협업할 수 있습니다.

> 💡 **모든 플랫폼에서 사용 가능**: `/orchestration` 프로토콜은 macOS, Linux, Windows 모두에서 작동합니다.

### 사용 방법

```bash
# Claude CLI에서 실행
/orchestration "로그인 페이지 UI 개선"

# Telegram 봇에서 실행 (macOS만 지원)
/orchestration 장바구니 기능 추가
```

### AIOS 아키텍처

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           AI Operating System v5.1                               │
│                    (Claude + Codex Co-Leadership Model)                          │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
        ┌───────────────────┐ ┌───────────────┐ ┌──────────────────┐
        │   Phase -1~3      │ │   Phase 4~6   │ │   Phase 7~8      │
        │   (Planning)      │ │   (Execution) │ │   (Validation)   │
        └─────────┬─────────┘ └───────┬───────┘ └────────┬─────────┘
                  │                   │                   │
        ┌─────────▼─────────┐ ┌───────▼───────┐ ┌────────▼─────────┐
        │ prometheus (Plan) │ │ Gemini (Code) │ │ momus (Review)   │
        │ oracle (Arch)     │ │ Codex (Code)  │ │ qa-tester (Test) │
        │ explore (Search)  │ │ sisyphus-jr   │ │ document-writer  │
        └───────────────────┘ └───────────────┘ └──────────────────┘
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

### 복잡도 기반 모드 결정

| 점수 | 모드 | 동작 |
|------|------|------|
| 0-4 | Silent | Phase 건너뛰고 즉시 실행, Core agents만 |
| 5-8 | Fast | Phase 0 간소화, Phase 1 생략 |
| 9-14 | Suggested | 사용자에게 Full Mode 권장, 선택 가능 |
| 15-20 | Forced | Full Mode 필수, 전체 Phase 실행 |

### AI 역할 분담

| AI | 역할 | 담당 |
|----|------|------|
| **Claude** | Orchestrator (CEO/CTO) | Phase 3 승인, Phase 5 병합, Phase 7-8 테스트/판정 |
| **Gemini** | Architect/Frontend | Phase 0 설계, Phase 2 프론트 리뷰, Phase 4 UI 구현 |
| **Codex** | Implementer/Backend | Phase 2 백엔드 리뷰, Phase 4 API/Infra 구현 |

### Quality Gates (Phase 8)

```
🔴 HARD GATES (실패 시 LOOP):
  □ Build: 100% 성공
  □ Lint: 0 errors
  □ Type Check: 100% 성공
  □ Tests: 100% 통과

🟡 BEHAVIOR GATES (실패 시 LOOP):
  □ Core Scenario 1-3: Pass

🟢 SOFT GATES (경고만):
  □ Coverage ≥80%
  □ Bundle Size
  □ Complexity
```

### 주요 기능

- **Smart Intake**: 복잡도 평가 후 자동 모드 결정
- **Contract Document**: 모든 에이전트가 참조하는 Global Blackboard
- **Feature Map (DAG)**: UI/Domain/Infra/Integration 4계층 구조
- **2-Phase Development**: Coding Phase → TIME_TO_END → Debugging Phase
- **Shared Surface Detection**: 병렬 실행 전 파일 충돌 자동 감지
- **Learning Memory**: 실패 Root Cause → Prevention Rule 자동 기록 (`.sisyphus/learnings.json`)
- **Checkpoint & Rollback**: Phase 3/4/5 완료 시 Git 스냅샷, 3회 실패 시 롤백 옵션
- **Partial Success**: Feature Set별 성공/실패 분리, 성공분만 머지 가능

### MCP 서버 설정

**로컬 설치** (`--local`): 프로젝트 루트에 `.mcp.json`이 자동 생성됩니다 (Git 커밋 가능):

```json
{
  "mcpServers": {
    "ai-agents": {
      "command": "node",
      "args": ["${PWD}/orchestration/mcps/ai-agents/server.js"]
    },
    "openapi": {
      "command": "node",
      "args": ["${PWD}/orchestration/mcps/openapi/server.js"]
    }
  }
}
```

> `${PWD}`는 Claude Code가 자동으로 현재 프로젝트 경로로 치환합니다. 절대경로 없이 포터블하게 동작합니다.

**전역 설치** (`--global`): `~/.claude/settings.json`에 자동 추가됩니다.

### 인증 설정 (선택)

Gemini/Codex를 사용하려면 각각 인증이 필요합니다:

```bash
# Gemini 인증 (첫 실행 시 OAuth 인증)
gemini

# Codex 인증
codex login
```

### 포함된 리소스

```
orchestration/
├── commands/
│   └── orchestration.md    # /orchestration 슬래시 명령어 (1800+ lines)
├── mcps/
│   ├── ai-agents/          # Multi-AI MCP 서버 (Gemini+Codex 연동)
│   │   ├── server.js       # MCP 서버 구현
│   │   └── wisdom.json     # 축적된 지혜 (패턴, 교훈)
│   └── openapi/            # OpenAPI/Swagger MCP 서버
│       └── server.js       # Swagger 스펙 로드/호출
├── skills/
│   ├── frontend-ui-ux/     # 프론트엔드 UI/UX 스킬
│   ├── git-master/         # Git 관리 스킬 (atomic commits, rebasing)
│   └── agent-browser/      # 브라우저 자동화 스킬
└── plugins/
    └── claude-dashboard/   # 상태줄 플러그인
        ├── scripts/        # 위젯 시스템 (17개 위젯)
        └── dist/index.js   # 빌드된 플러그인
```

### 설치 후 필수 체크리스트

```
CLI 도구:
[ ] claude CLI 설치됨
[ ] gemini CLI 설치됨 + OAuth 인증
[ ] codex CLI 설치됨 + OAuth 인증

Plugin (Claude Code 내에서 실행):
[ ] /plugin marketplace add supabase/agent-skills
[ ] /plugin install postgres-best-practices@supabase-agent-skills

Skills (자동 설치됨):
[✔] vercel-react-best-practices
[✔] webapp-testing
[✔] frontend-ui-ux
[✔] git-master
[✔] agent-browser
[✔] find-skills
```

## Architecture

```
packages/
├── cli/          # CLI 진입점 + Claude 래퍼
├── core/         # 핵심 오케스트레이션 로직
├── gateway/      # WebSocket 서버 (원격 접근)
├── telegram-bot/ # Telegram 봇
├── web/          # React 웹 대시보드
├── tui/          # 터미널 UI (Ink)
├── client/       # WebSocket 클라이언트 라이브러리
└── protocol/     # 메시지 프로토콜 정의

orchestration/    # Multi-AI Orchestration 리소스
├── commands/     # Claude CLI 슬래시 명령어
├── mcps/         # MCP 서버
├── skills/       # 번들 스킬
└── plugins/      # 플러그인
```

### 패키지 역할

| 패키지 | 역할 |
|--------|------|
| `protocol` | WebSocket 메시지 타입, Task 구조 정의 |
| `core` | 멀티-AI 오케스트레이션, TaskStore (SQLite) |
| `gateway` | HTTP + WebSocket 서버, 세션 관리 |
| `client` | 클라이언트 라이브러리 (자동 재연결, 이벤트 구독) |
| `cli` | 메인 CLI, Claude CLI 래퍼 |
| `web` | React 대시보드 (Vite, Tailwind) |
| `telegram-bot` | Telegram 봇 (Telegraf) |
| `tui` | 터미널 UI (React + Ink) |

## Environment Variables

```bash
# Telegram Bot
TELEGRAM_BOT_TOKEN=your_token
ALLOWED_USERS=123456789,987654321

# Gateway
OLYMPUS_API_KEY=your_secret_key
GATEWAY_HOST=127.0.0.1
GATEWAY_PORT=18790
```

## Default Ports

| 서비스 | 포트 |
|--------|------|
| Gateway (HTTP + WebSocket) | 18790 |
| Dashboard (Web UI) | 18791 |

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run in development mode
pnpm dev

# Run CLI locally
cd packages/cli && pnpm build && node dist/index.js

# Install Olympus globally for development
./install.sh --local
```

### 설치 스크립트 옵션

```bash
./install.sh              # 대화형 선택
./install.sh --global     # 전역 설치 (commands/mcps/skills/plugins symlink)
./install.sh --local      # 로컬 설치 (프로젝트 내에서만)
./install.sh --global --with-claude-md  # CLAUDE.md managed block 포함
./install.sh --help       # 도움말
```

## Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Build**: pnpm + Turbo + tsup
- **Frontend**: React 18, Vite, Tailwind CSS
- **Terminal UI**: Ink 5 + React
- **WebSocket**: ws
- **Database**: SQLite (better-sqlite3)
- **CLI**: Commander
- **Telegram**: Telegraf

## Troubleshooting

### Dashboard에서 "Failed to fetch" 또는 "Cannot connect to Gateway" 오류

**원인**: Gateway의 CORS 설정에서 Dashboard 포트(18791)가 허용되지 않거나, API Key가 설정되지 않은 경우 발생합니다.

**해결**:

1. `olympus server start`로 서버를 시작하면 Dashboard에 Gateway 설정이 자동 주입됩니다 (수동 설정 불필요)
2. Vite dev 서버(포트 5173)로 개발 중이라면, CORS는 기본 허용됩니다
3. Gateway 설정 변경 후에는 반드시 **Gateway를 재시작**해야 합니다

### Telegram 봇에서 알림이 너무 많이 옴

**해결**: Telegram 봇은 기본 **digest 모드**로 동작합니다. 모든 출력은 Smart Digest 엔진을 거쳐 핵심 결과만 전달됩니다.

**Smart Digest 동작 원리**:
- **6-카테고리 분류**: build, test, commit, error, phase, change
- **노이즈 자동 제거**: Reading, Searching, Globbing, 스피너, 빈 줄 등
- **우선순위 기반 예산**: 에러(5점) > 빌드/테스트(4점) > 커밋/Phase(3점) 순서로 800자 채움
- **하이브리드 트리거**: 에러/완료 시 즉시 전달, 일반 출력은 5초 debounce
- **비밀 마스킹**: API 키, Bearer 토큰, GitHub PAT, 긴 hex 문자열 자동 마스킹

**모드 전환**: Telegram에서 `/mode raw`로 원문 모드 전환, `/mode digest`로 복귀

**추가 스팸 방지 (Gateway 레벨)**:
- 출력 안정화 대기: 2초 debounce
- 전송 간격 제한: 최소 3초 throttle
- 최소 변경량: 10자 미만 변경 무시
- 노이즈 필터: 프롬프트, 상태바, 스피너 자동 제거

> Gateway 코드를 변경한 경우 **반드시 Gateway를 재시작**해야 필터가 적용됩니다.

### tmux에서 마우스 휠 스크롤 문제

**문제**: `olympus start`로 Claude CLI를 tmux 세션에서 실행 시, 마우스 휠을 조작하면 이전 대화 내용을 볼 수 없고 명령어 히스토리가 입력됨

**원인**: tmux의 마우스 모드가 설정되지 않아 마우스 휠 이벤트가 터미널 애플리케이션에 그대로 전달됨

**해결**:

1. `~/.tmux.conf` 파일 생성 또는 수정:

```bash
# 마우스 지원 활성화
set -g mouse on

# 마우스 휠로 스크롤백 버퍼 탐색 (copy-mode 자동 진입)
bind -n WheelUpPane if-shell -F -t = "#{mouse_any_flag}" "send-keys -M" "if -Ft= '#{pane_in_mode}' 'send-keys -M' 'select-pane -t=; copy-mode -e; send-keys -M'"
bind -n WheelDownPane select-pane -t= \; send-keys -M

# 스크롤 속도 설정
bind -T copy-mode WheelUpPane send-keys -X scroll-up
bind -T copy-mode WheelDownPane send-keys -X scroll-down
bind -T copy-mode-vi WheelUpPane send-keys -X scroll-up
bind -T copy-mode-vi WheelDownPane send-keys -X scroll-down

# vi 스타일 복사 모드
setw -g mode-keys vi

# 히스토리 버퍼 크기 (50,000줄)
set -g history-limit 50000
```

2. 설정 적용:

```bash
# 현재 실행 중인 tmux 세션에서
tmux source-file ~/.tmux.conf

# 또는 새 세션 시작
tmux new-session
```

**사용법**:
- 마우스 휠 위/아래로 스크롤
- copy-mode 종료: `q` 키 또는 맨 아래로 스크롤
- 텍스트 선택: 마우스 드래그 (copy-mode에서)

> 💡 `./install.sh` 실행 시 tmux 설정을 자동으로 생성할 수 있습니다.

## Contributing

기여를 환영합니다! Pull Request를 보내기 전에:

1. Fork 후 새 브랜치에서 작업
2. `pnpm install && pnpm build` 확인
3. 변경 사항 테스트
4. PR 제출

## Related Projects

- [Claude CLI](https://github.com/anthropics/claude-code) - Anthropic 공식 CLI
- [Gemini CLI](https://github.com/google-gemini/gemini-cli) - Google Gemini CLI
- [Codex CLI](https://github.com/openai/codex) - OpenAI Codex CLI

## License

MIT

---

<p align="center">
  <b>Olympus</b> - Claude CLI의 개발 생산성을 위한 Multi-AI 협업 개발 도구
</p>
