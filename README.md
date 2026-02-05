<p align="center">
  <img src="assets/mascot.png" alt="Olympus Mascot" width="200"/>
</p>

<h1 align="center">Olympus</h1>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"/></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-18%2B-green.svg" alt="Node.js"/></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.8-blue.svg" alt="TypeScript"/></a>
</p>

<p align="center">
  <b>Claude CLI Enhanced Platform</b> - Multi-AI Orchestration + Gateway + Dashboard
</p>

<p align="center">
  <i>"1인 개발자가 CTO급 퍼포먼스를 내는 AI 운영체제"</i>
</p>

## What is Olympus?

Olympus는 [Multi-AI Orchestration Protocol v5.0](https://github.com/dear-well/multi-ai-orchestration)의 **완벽한 상위 호환**이자, Claude CLI를 더 강력하게 확장한 플랫폼입니다:

1. **Multi-AI Orchestration**: Claude + Gemini + Codex 협업으로 복잡한 작업 자동화
2. **Claude CLI 래퍼**: `olympus` 실행 시 Claude CLI가 실행됩니다 (브랜딩만 Olympus)
3. **원격 접근**: Gateway를 통해 Telegram 봇으로 핸드폰에서 로컬 Claude CLI 사용
4. **대시보드**: 웹 UI로 작업 현황 모니터링

### Olympus = Multi-AI Orchestration + Gateway + Dashboard

| 기능 | Multi-AI Orchestration | Olympus |
|------|----------------------|---------|
| `/orchestration` 프로토콜 | ✅ | ✅ |
| MCP 서버 (ai-agents, openapi) | ✅ | ✅ |
| Skills (frontend-ui-ux, git-master 등) | ✅ | ✅ |
| Plugins (claude-dashboard) | ✅ | ✅ |
| **Telegram 봇 원격 접근** | ❌ | ✅ |
| **웹 대시보드** | ❌ | ✅ |
| **tmux 세션 관리** | ❌ | ✅ |
| **통합 CLI** | ❌ | ✅ |

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

### 방법 1: Git Clone (권장)

```bash
git clone https://github.com/jobc/olympus.git
cd olympus
./install.sh
```

설치 스크립트는 두 가지 모드를 지원합니다:
- **전역 설치 (Global)**: 모든 프로젝트에서 `/orchestration` 사용 가능
- **로컬 설치 (Local)**: 이 프로젝트에서만 사용

### 방법 2: npm

```bash
npm i -g olympus-dev
```

**Prerequisites:**
- Node.js 18+
- Claude CLI (`npm i -g @anthropic-ai/claude-code`)
- tmux (선택사항, `olympus start` 사용 시 필요)
- Gemini CLI (선택, Multi-AI Orchestration용): `npm i -g @google/gemini-cli`
- Codex CLI (선택, Multi-AI Orchestration용): `npm i -g @openai/codex`

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

### Telegram 봇 연동 요구사항

Telegram 봇으로 원격에서 Claude CLI를 조작하려면:

1. **macOS** 사용 필수 (tmux 기반 세션 관리)
2. `olympus start`로 Claude CLI 세션 시작
3. `olympus server start --telegram`으로 Telegram 봇 활성화

```bash
# macOS에서 Telegram 연동 전체 과정
olympus start                    # tmux에서 Claude CLI 시작
olympus server start --telegram  # Telegram 봇 시작
```

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

### 설정

```bash
# 초기 설정 마법사
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
| `olympus setup` | 초기 설정 마법사 |
| `olympus quickstart` | 빠른 설정 + 서버 시작 |
| `olympus config` | 설정 관리 |
| `olympus gateway` | Gateway 서버만 실행 |
| `olympus telegram` | Telegram 봇만 실행 |
| `olympus dashboard` | 웹 대시보드 열기 |
| `olympus tui` | 터미널 UI 실행 |

## Telegram Bot Commands

핸드폰 Telegram에서 사용 가능한 명령어:

| 명령어 | 설명 |
|--------|------|
| `/start` | 도움말 표시 |
| `/sessions` | 연결 가능한 세션 목록 |
| `/use <이름>` | 세션 연결/전환 |
| `/close [이름]` | 세션 해제 |
| `/health` | 상태 확인 |
| `/orchestration <요청>` | Multi-AI 협업 모드 실행 |
| 일반 메시지 | 활성 세션의 Claude에게 전송 |
| `@이름 메시지` | 특정 세션에 메시지 전송 |

## Multi-AI Orchestration (AIOS v5.0)

Olympus는 **Multi-AI Orchestration Protocol v5.0**을 완벽하게 내장하고 있습니다. Claude CLI에서 `/orchestration` 명령어를 사용하여 Gemini, Codex 등 여러 AI와 협업할 수 있습니다.

> 💡 **모든 플랫폼에서 사용 가능**: `/orchestration` 프로토콜은 macOS, Linux, Windows 모두에서 작동합니다.

### 사용 방법

```bash
# Claude CLI에서 실행
/orchestration "로그인 페이지 UI 개선"

# Telegram 봇에서 실행 (macOS만 지원)
/orchestration 장바구니 기능 추가
```

### 10 Phase 워크플로우

```
Phase -1: Smart Intake (복잡도 평가 + 모드 결정)
Phase 0:  Contract-First Design (계약 + 전체 설계)
Phase 1:  Multi-Layer DAG (기능 맵 + Work Items)
Phase 2:  Plan Review (AI팀 검토 + Devil's Advocate)
Phase 3:  Plan Lock + Checkpoint (사용자 승인)
Phase 4:  Code Execution (2-Phase Dev + Shared Surface)
Phase 5:  Merge & Review (momus + UI 검증)
Phase 6:  Improvements (수정 + Learning Memory)
Phase 7:  Final Test (빌드/린트/타입/테스트)
Phase 8:  Judgment (Quality Gates + 최종 판정)
```

### AI 역할 분담

| AI | 역할 | 담당 Phase |
|----|------|-----------|
| **Claude** | CEO/CTO/Orchestrator | 전체 조율, 병합, 최종 판정 |
| **Gemini** | Architect/Frontend | 설계, 리뷰, UI 구현 |
| **Codex** | Implementer/Backend | API, 인프라, 테스트 |

### 주요 기능

- **Smart Intake**: 복잡도 평가 후 자동 모드 결정 (Silent/Fast/Suggested/Forced)
- **Contract Document**: 모든 에이전트가 참조하는 Global Blackboard
- **Multi-Layer DAG**: UI/Domain/Infra/Integration 4계층 구조
- **Shared Surface Detection**: 병렬 실행 전 파일 충돌 자동 감지
- **Learning Memory**: 실패 Root Cause → Prevention Rule 자동 기록
- **Checkpoint & Rollback**: Phase별 Git 스냅샷, 3회 실패 시 롤백 옵션

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
│   └── orchestration.md    # /orchestration 슬래시 명령어
├── mcps/
│   ├── ai-agents/          # Multi-AI MCP 서버 (Gemini+Codex 연동)
│   └── openapi/            # OpenAPI/Swagger MCP 서버
├── skills/
│   ├── frontend-ui-ux/     # 프론트엔드 UI/UX 스킬
│   ├── git-master/         # Git 관리 스킬
│   └── agent-browser/      # 브라우저 자동화 스킬
└── plugins/
    └── claude-dashboard/   # 상태줄 플러그인 (Gemini/Codex 사용량 표시)
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
./install.sh --global     # 전역 설치 (~/.claude/에 복사)
./install.sh --local      # 로컬 설치 (프로젝트 내에서만)
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

- [Multi-AI Orchestration](https://github.com/dear-well/multi-ai-orchestration) - 원본 프로토콜
- [Claude CLI](https://github.com/anthropics/claude-code) - Anthropic 공식 CLI

## License

MIT

---

<p align="center">
  <b>Olympus</b> - 1인 개발자가 CTO급 퍼포먼스를 내는 AI 운영체제
</p>
