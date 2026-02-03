# Olympus

Claude CLI Enhanced Platform - 로컬 Claude CLI를 원격에서도 사용할 수 있게 해주는 플랫폼

## What is Olympus?

Olympus는 Claude CLI를 더 편하게 사용할 수 있게 만든 플랫폼입니다:

1. **Claude CLI 래퍼**: `olympus` 실행 시 Claude CLI가 실행됩니다 (브랜딩만 Olympus)
2. **원격 접근**: Gateway를 통해 Telegram 봇으로 핸드폰에서 로컬 Claude CLI 사용
3. **대시보드**: 웹 UI로 작업 현황 모니터링

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
npm i -g olympus-dev
```

**Prerequisites:**
- Node.js 18+
- Claude CLI (`npm i -g @anthropic-ai/claude-code`)

## Usage

### 기본 사용 (Claude CLI 모드)

```bash
# Claude CLI 실행 (Olympus 브랜딩)
olympus
```

인자 없이 `olympus`를 실행하면 Claude CLI가 시작됩니다. Claude CLI의 모든 기능을 그대로 사용할 수 있습니다.

### Gateway + Telegram 모드

```bash
# Gateway + Telegram 봇 시작
olympus start
```

이 모드에서는:
- Gateway 서버가 시작되어 원격 접근 허용
- Telegram 봇이 연동되어 핸드폰에서 Claude CLI 사용 가능
- 웹 대시보드로 작업 현황 모니터링

### 개별 서비스 실행

```bash
# Gateway만 시작
olympus gateway

# Telegram 봇만 시작
olympus telegram

# 웹 대시보드 열기
olympus dashboard
```

### 설정

```bash
# 초기 설정 마법사
olympus setup

# 빠른 설정 + 시작
olympus quickstart

# 설정 확인/수정
olympus config
```

## Model Configuration

| 모드 | 모델 | 설명 |
|------|------|------|
| 기본 | Claude Sonnet 4.5 | 일반 작업에 적합 |
| /orchestration | Claude Opus 4.5 + Gemini + Codex | 복잡한 멀티-AI 협업 |

## Telegram Bot Commands

핸드폰 Telegram에서 사용 가능한 명령어:

- `/olympus <prompt>` - Claude에게 작업 요청
- `/status` - 현재 작업 상태 확인
- `/cancel` - 진행 중인 작업 취소

## Architecture

```
packages/
├── cli/          # CLI 진입점 + Claude 래퍼
├── core/         # 핵심 오케스트레이션 로직
├── gateway/      # WebSocket 서버 (원격 접근)
├── telegram-bot/ # Telegram 봇
├── web/          # React 웹 대시보드
├── tui/          # 터미널 UI
├── client/       # 프로그래매틱 클라이언트
└── protocol/     # 메시지 프로토콜
```

## Environment Variables

```bash
# Telegram Bot
TELEGRAM_BOT_TOKEN=your_token
ALLOWED_USERS=123456789,987654321

# Gateway
OLYMPUS_API_KEY=your_secret_key
GATEWAY_PORT=18790
```

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run CLI in development
pnpm olympus
```

## License

MIT
