#!/bin/bash
#
# Olympus - Claude CLI Enhanced Platform Installer (Windows / Git Bash / MINGW)
# macOS/Linux는 ./install.sh, PowerShell은 install.ps1 사용
#

set -e

# 색상
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()     { echo -e "${RED}[ERROR]${NC} $1"; }
step()    { echo -e "${CYAN}[STEP]${NC} $1"; }
phase()   { echo -e "${MAGENTA}[PHASE]${NC} $1"; }

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 인자 파싱
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSTALL_MODE=""
for arg in "$@"; do
    case $arg in
        --local)  INSTALL_MODE="local" ;;
        --global) INSTALL_MODE="global" ;;
        --help|-h)
            echo "Usage: ./install-win.sh [--local | --global]"
            echo ""
            echo "  --global  전역 설치 (기본) — ~/.claude/에 설치"
            echo "  --local   로컬 설치 — 프로젝트 내에서만 사용"
            exit 0
            ;;
    esac
done

# 로고
echo ""
echo -e "${MAGENTA}================================================================${NC}"
echo -e "${MAGENTA}  Olympus v1.0.0 + AIOS v5.3 — Windows Installer${NC}"
echo -e "${MAGENTA}================================================================${NC}"
echo ""

# 모드 선택
if [ -z "$INSTALL_MODE" ]; then
    echo -e "${CYAN}설치 모드를 선택하세요:${NC}"
    echo "  1) 전역 설치 (Global) — 모든 프로젝트에서 사용"
    echo "  2) 로컬 설치 (Local)  — 이 프로젝트에서만 사용"
    read -p "선택 [1/2] (기본: 1): " choice
    case $choice in
        2|local|l) INSTALL_MODE="local" ;;
        *) INSTALL_MODE="global" ;;
    esac
fi

echo ""
if [ "$INSTALL_MODE" = "local" ]; then
    echo -e "${YELLOW}로컬 설치 모드${NC}"
else
    echo -e "${GREEN}전역 설치 모드${NC}"
fi
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$USERPROFILE/.claude"
ORCHESTRATION_DIR="$SCRIPT_DIR/orchestration"

# Windows 경로 변환 헬퍼 (C:\path → C:/path)
winpath() { echo "$1" | sed 's|\\|/|g'; }

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 0: 사전 요구사항
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
phase "Phase 0: 사전 요구사항 확인"
echo ""

command -v node &>/dev/null && success "Node.js $(node --version)" || { err "Node.js 미설치"; exit 1; }
command -v pnpm &>/dev/null && success "pnpm $(pnpm --version)" || { warn "pnpm 설치 중..."; npm install -g pnpm; }
command -v claude &>/dev/null && success "Claude CLI 설치됨" || warn "Claude CLI 미설치: npm i -g @anthropic-ai/claude-code"
command -v gemini &>/dev/null && success "Gemini CLI 설치됨" || info "Gemini CLI 미설치 (선택)"
command -v codex &>/dev/null && success "Codex CLI 설치됨" || info "Codex CLI 미설치 (선택)"

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 1: 빌드 + CLI 글로벌 등록
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
phase "Phase 1: 빌드 + Olympus CLI 글로벌 등록"
echo ""

step "pnpm install..."
cd "$SCRIPT_DIR"
pnpm install

step "pnpm build..."
pnpm build
success "전체 빌드 완료"

# ★ Windows 핵심: npm link로 글로벌 CLI 등록
# bash symlink(ln -sf)는 PowerShell/CMD에서 인식 불가
# npm link는 .cmd 래퍼를 생성하여 모든 Windows 쉘에서 작동
step "Olympus CLI 글로벌 등록 (npm link)..."
cd "$SCRIPT_DIR/packages/cli"
npm link 2>/dev/null
cd "$SCRIPT_DIR"

if command -v olympus &>/dev/null; then
    success "olympus CLI 등록 완료 ($(olympus --version))"
else
    warn "olympus가 PATH에 없습니다."
    warn "PowerShell을 열고 다음 명령을 실행하세요:"
    echo "    cd packages\\cli && npm link"
fi

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 2: MCP 서버 의존성
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
phase "Phase 2: MCP 서버 의존성 설치"
echo ""

step "ai-agents MCP..."
cd "$ORCHESTRATION_DIR/mcps/ai-agents" && npm install --silent
success "ai-agents MCP 설치 완료"

step "openapi MCP..."
cd "$ORCHESTRATION_DIR/mcps/openapi" && npm install --silent
success "openapi MCP 설치 완료"

cd "$SCRIPT_DIR"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 3: 글로벌/로컬 설정 배포
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if [ "$INSTALL_MODE" = "global" ]; then
    phase "Phase 3: 글로벌 설정 배포 (~/.claude/)"
    echo ""

    # 디렉토리 생성
    mkdir -p "$CLAUDE_DIR/mcps/ai-agents"
    mkdir -p "$CLAUDE_DIR/mcps/openapi"
    mkdir -p "$CLAUDE_DIR/commands"
    mkdir -p "$CLAUDE_DIR/skills"
    mkdir -p "$CLAUDE_DIR/plugins"

    # MCP 파일 복사 (Windows는 symlink 대신 copy)
    step "MCP 서버 파일 복사..."
    cp "$ORCHESTRATION_DIR/mcps/ai-agents/server.js" "$CLAUDE_DIR/mcps/ai-agents/"
    cp "$ORCHESTRATION_DIR/mcps/ai-agents/package.json" "$CLAUDE_DIR/mcps/ai-agents/"
    [ ! -f "$CLAUDE_DIR/mcps/ai-agents/wisdom.json" ] && \
        cp "$ORCHESTRATION_DIR/mcps/ai-agents/wisdom.json" "$CLAUDE_DIR/mcps/ai-agents/"
    cp "$ORCHESTRATION_DIR/mcps/openapi/server.js" "$CLAUDE_DIR/mcps/openapi/"
    cp "$ORCHESTRATION_DIR/mcps/openapi/package.json" "$CLAUDE_DIR/mcps/openapi/"

    cd "$CLAUDE_DIR/mcps/ai-agents" && npm install --silent
    cd "$CLAUDE_DIR/mcps/openapi" && npm install --silent
    cd "$SCRIPT_DIR"
    success "MCP 서버 글로벌 설치 완료"

    # Commands
    step "/orchestration 커맨드..."
    cp "$ORCHESTRATION_DIR/commands/orchestration.md" "$CLAUDE_DIR/commands/"
    success "/orchestration v5.3 설치 완료"

    # Skills (copy, not symlink)
    step "번들 스킬 복사..."
    for skill in frontend-ui-ux git-master agent-browser; do
        if [ -d "$ORCHESTRATION_DIR/skills/$skill" ]; then
            mkdir -p "$CLAUDE_DIR/skills/$skill"
            cp -r "$ORCHESTRATION_DIR/skills/$skill/"* "$CLAUDE_DIR/skills/$skill/" 2>/dev/null
            success "$skill 스킬 복사 완료"
        fi
    done

    # Plugins
    step "claude-dashboard 플러그인..."
    DASHBOARD_SRC="$SCRIPT_DIR/packages/claude-dashboard"
    if [ -d "$DASHBOARD_SRC" ]; then
        mkdir -p "$CLAUDE_DIR/plugins"
        cp -r "$DASHBOARD_SRC" "$CLAUDE_DIR/plugins/claude-dashboard"
        success "claude-dashboard 복사 완료"
    fi

    # settings.json (신규 생성만, 기존 파일 보존)
    if [ ! -f "$CLAUDE_DIR/settings.json" ]; then
        step "settings.json 생성..."
        CLAUDE_DIR_UNIX=$(winpath "$CLAUDE_DIR")
        cat > "$CLAUDE_DIR/settings.json" << EOF
{
  "mcpServers": {
    "ai-agents": {
      "command": "node",
      "args": ["$CLAUDE_DIR_UNIX/mcps/ai-agents/server.js"],
      "env": {}
    },
    "openapi": {
      "command": "node",
      "args": ["$CLAUDE_DIR_UNIX/mcps/openapi/server.js"]
    },
    "stitch": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/stitch-mcp"]
    }
  },
  "enabledPlugins": {
    "postgres-best-practices@supabase-agent-skills": true,
    "vercel-react-best-practices": true,
    "ui-ux-pro-max@ui-ux-pro-max-skill": true
  }
}
EOF
        success "settings.json 생성 완료"
    else
        info "settings.json 이미 존재 — 기존 설정 유지"
    fi

    echo ""

    # Codex / Gemini 글로벌 설정
    phase "Phase 4: Codex/Gemini 글로벌 설정"
    echo ""

    CODEX_DIR="$USERPROFILE/.codex"
    GEMINI_DIR="$USERPROFILE/.gemini"

    if [ -d "$CODEX_DIR" ] && [ -f "$ORCHESTRATION_DIR/templates/CODEX.global.md" ]; then
        cp "$ORCHESTRATION_DIR/templates/CODEX.global.md" "$CODEX_DIR/AGENTS.md"
        success "Codex 글로벌 설정 배포 (~/.codex/AGENTS.md)"
    else
        info "~/.codex/ 미존재 — codex CLI를 먼저 실행하세요"
    fi

    if [ -d "$GEMINI_DIR" ] && [ -f "$ORCHESTRATION_DIR/templates/GEMINI.global.md" ]; then
        cp "$ORCHESTRATION_DIR/templates/GEMINI.global.md" "$GEMINI_DIR/GEMINI.md"
        success "Gemini 글로벌 설정 배포 (~/.gemini/GEMINI.md)"
    else
        info "~/.gemini/ 미존재 — gemini CLI를 먼저 실행하세요"
    fi

else
    # 로컬 모드
    phase "Phase 3: 프로젝트 로컬 설정 (.claude/)"
    echo ""

    PROJECT_CLAUDE="$SCRIPT_DIR/.claude"
    mkdir -p "$PROJECT_CLAUDE/commands"
    mkdir -p "$PROJECT_CLAUDE/skills"

    cp "$ORCHESTRATION_DIR/commands/orchestration.md" "$PROJECT_CLAUDE/commands/"
    success "/orchestration 커맨드 설치 완료"

    for skill in frontend-ui-ux git-master agent-browser; do
        if [ -d "$ORCHESTRATION_DIR/skills/$skill" ]; then
            mkdir -p "$PROJECT_CLAUDE/skills/$skill"
            cp -r "$ORCHESTRATION_DIR/skills/$skill/"* "$PROJECT_CLAUDE/skills/$skill/" 2>/dev/null
            success "$skill 스킬 복사 완료"
        fi
    done

    info "로컬 모드: 이 프로젝트 디렉토리에서만 /orchestration 사용 가능"
fi

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 5: 설치 확인
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
phase "Phase 5: 설치 확인"
echo ""

echo -e "${CYAN}CLI 도구:${NC}"
command -v olympus &>/dev/null && success "olympus $(olympus --version 2>/dev/null)" || warn "olympus 미등록"
command -v claude &>/dev/null && success "claude" || warn "claude 미설치"
command -v gemini &>/dev/null && success "gemini" || info "gemini (선택)"
command -v codex &>/dev/null && success "codex" || info "codex (선택)"

echo ""
echo -e "${MAGENTA}================================================================${NC}"
echo -e "${GREEN}  Olympus + AIOS v5.3 설치 완료!${NC}"
echo -e "${MAGENTA}================================================================${NC}"
echo ""
echo -e "${GREEN}사용 방법:${NC}"
echo "  olympus                         # Claude CLI 실행"
echo "  olympus server start            # Gateway + Dashboard + Telegram"
echo "  /orchestration \"작업 설명\"      # Multi-AI 10 Phase 프로토콜"
echo ""
echo -e "${YELLOW}⚠ olympus 명령이 안 되면:${NC}"
echo "  cd packages/cli && npm link"
echo ""
