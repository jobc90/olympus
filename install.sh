#!/bin/bash
#
# Olympus - Claude CLI Enhanced Platform Installer
# Multi-AI Orchestration Protocol v5.3 통합 버전
# macOS / Linux 용
#

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 설치 모드 결정: --local / --global / 대화형 선택
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSTALL_MODE=""
WITH_CLAUDE_MD=0
for arg in "$@"; do
    case $arg in
        --local)    INSTALL_MODE="local" ;;
        --commands) INSTALL_MODE="commands" ;;
        --global)   INSTALL_MODE="global" ;;
        --with-claude-md) WITH_CLAUDE_MD=1 ;;
        --help|-h)
            echo "Usage: ./install.sh [--local | --commands | --global] [--with-claude-md]"
            echo ""
            echo "  --local     프로젝트 로컬 설치 (이 프로젝트 디렉토리에서만 사용)"
            echo "              • ~/.claude/ 완전 비침범 — 기존 전역 설정 그대로 유지"
            echo "              • MCP 서버는 프로젝트 orchestration/mcps/에 npm install"
            echo "              • 에이전트/명령어는 프로젝트 .claude/ 내에서만 동작"
            echo ""
            echo "  --commands  명령어만 전역 등록 (권장 — 최소 침범)"
            echo "              • ~/.claude/commands/에만 symlink 연결 (agents/settings 비침범)"
            echo "              • /team, /agents 등 어디서든 사용 가능"
            echo "              • 기존 ~/.claude/agents/, settings.json 완전 보존"
            echo ""
            echo "  --global    전역 설치 (모든 프로젝트에서 에이전트까지 사용)"
            echo "              • ~/.claude/agents/에 19개 에이전트 symlink 연결"
            echo "              • ~/.claude/settings.json 생성/수정 (MCP 설정)"
            echo "              • skills, commands, plugins 전역 연결 (git pull 시 자동 최신화)"
            echo "              • ⚠️  기존 ~/.claude/ 설정에 영향을 줄 수 있습니다"
            echo ""
            echo "  --with-claude-md"
            echo "              • ~/.claude/CLAUDE.md에 Olympus managed block을 삽입/업데이트"
            echo "              • 기존 개인 설정은 유지 (마커 블록만 관리)"
            echo ""
            echo "  (인자 없음) 대화형으로 선택"
            exit 0
            ;;
    esac
done

# 로고
echo ""
echo -e "${MAGENTA}╔════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║                                                                    ║${NC}"
echo -e "${MAGENTA}║   ██████╗ ██╗  ██╗   ██╗███╗   ███╗██████╗ ██╗   ██╗███████╗      ║${NC}"
echo -e "${MAGENTA}║  ██╔═══██╗██║  ╚██╗ ██╔╝████╗ ████║██╔══██╗██║   ██║██╔════╝      ║${NC}"
echo -e "${MAGENTA}║  ██║   ██║██║   ╚████╔╝ ██╔████╔██║██████╔╝██║   ██║███████╗      ║${NC}"
echo -e "${MAGENTA}║  ██║   ██║██║    ╚██╔╝  ██║╚██╔╝██║██╔═══╝ ██║   ██║╚════██║      ║${NC}"
echo -e "${MAGENTA}║  ╚██████╔╝███████╗██║   ██║ ╚═╝ ██║██║     ╚██████╔╝███████║      ║${NC}"
echo -e "${MAGENTA}║   ╚═════╝ ╚══════╝╚═╝   ╚═╝     ╚═╝╚═╝      ╚═════╝ ╚══════╝      ║${NC}"
echo -e "${MAGENTA}║                                                                    ║${NC}"
echo -e "${MAGENTA}║        Claude CLI Enhanced Platform v1.0.0 + AIOS v5.3            ║${NC}"
echo -e "${MAGENTA}║       \"Claude CLI의 개발 생산성을 위한 Multi-AI 협업 개발 도구\"            ║${NC}"
echo -e "${MAGENTA}╚════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# 설치 모드 선택 (인자 없을 때)
if [ -z "$INSTALL_MODE" ]; then
    echo ""
    echo -e "${CYAN}설치 모드를 선택하세요:${NC}"
    echo ""
    echo -e "  ${GREEN}1) 명령어만 전역 등록 (Commands — 권장)${NC}"
    echo "     → /team, /agents 등 어디서든 사용 가능"
    echo "     → ~/.claude/commands/에만 symlink 연결"
    echo "     → 기존 ~/.claude/agents/, settings.json 완전 보존"
    echo ""
    echo -e "  ${MAGENTA}2) 전역 설치 (Global)${NC} - 에이전트까지 전역 등록"
    echo "     → ~/.claude/에 agents, MCP, commands, skills, plugins 모두 설치"
    echo "     → ⚠️  기존 ~/.claude/ 설정에 영향을 줄 수 있습니다"
    echo ""
    echo -e "  ${YELLOW}3) 로컬 설치 (Local)${NC} - 이 프로젝트에서만 사용"
    echo "     → CLI 도구만 전역, 나머지는 프로젝트 내 유지"
    echo "     → ~/.claude/ 디렉토리를 전혀 건드리지 않음"
    echo ""
    read -p "선택 [1/2/3] (기본: 1): " mode_choice
    case $mode_choice in
        2|global|g)  INSTALL_MODE="global" ;;
        3|local|l)   INSTALL_MODE="local" ;;
        *)           INSTALL_MODE="commands" ;;
    esac
fi

echo ""
case "$INSTALL_MODE" in
    commands)
        echo -e "${GREEN}🔗 명령어 전역 등록 모드${NC} - ~/.claude/commands/만 수정"
        ;;
    global)
        echo -e "${MAGENTA}🌐 전역 설치 모드${NC} - 모든 프로젝트에서 사용 가능"
        echo -e "${YELLOW}   ⚠️  ~/.claude/agents/, settings.json 등이 수정됩니다${NC}"
        ;;
    local)
        echo -e "${YELLOW}📦 로컬 설치 모드${NC} - 프로젝트 디렉토리에서만 사용 가능"
        ;;
esac
echo ""

# 함수: 상태 출력
info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

step() {
    echo -e "${CYAN}[STEP]${NC} $1"
}

phase() {
    echo -e "${MAGENTA}[PHASE]${NC} $1"
}

# 스크립트 디렉토리
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
ORCHESTRATION_DIR="$SCRIPT_DIR/orchestration"

# symlink 헬퍼: 기존 파일/디렉토리를 제거하고 symlink 생성
migrate_to_symlink() {
    local src="$1"
    local dest="$2"
    # 이미 올바른 symlink이면 스킵
    if [ -L "$dest" ] && [ "$(readlink "$dest")" = "$src" ]; then
        return 0
    fi
    # 기존 파일/디렉토리/symlink 제거
    if [ -e "$dest" ] || [ -L "$dest" ]; then
        rm -rf "$dest"
    fi
    ln -sf "$src" "$dest"
}

# CLAUDE.md managed block 삽입/업데이트 (사용자 기존 내용 보존)
upsert_olympus_claude_md_block() {
    local template="$1"
    local dest="$2"
    local start="<!-- OLYMPUS:START (managed by install.sh) -->"
    local end="<!-- OLYMPUS:END -->"
    local block
    local tmp
    local resolved

    block="$(mktemp)"
    tmp="$(mktemp)"

    {
        echo "$start"
        cat "$template"
        echo "$end"
    } > "$block"

    # If dest is an old symlink (legacy install), convert to a regular file first.
    if [ -L "$dest" ]; then
        resolved="$(readlink "$dest")"
        rm -f "$dest"
        if [ -n "$resolved" ] && [ -f "$resolved" ]; then
            cp "$resolved" "$dest"
        fi
    fi

    if [ ! -f "$dest" ]; then
        cp "$block" "$dest"
        rm -f "$block" "$tmp"
        return 0
    fi

    awk -v s="$start" -v e="$end" -v b="$block" '
        BEGIN { in_block=0; replaced=0 }
        {
            if (index($0, s) > 0) {
                system("cat \"" b "\"")
                in_block=1
                replaced=1
                next
            }
            if (in_block && index($0, e) > 0) {
                in_block=0
                next
            }
            if (!in_block) print
        }
        END {
            if (!replaced) {
                if (NR > 0) print ""
                system("cat \"" b "\"")
            }
        }
    ' "$dest" > "$tmp"

    mv "$tmp" "$dest"
    rm -f "$block"
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 0: 사전 요구사항 확인
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
phase "Phase 0: 사전 요구사항 확인"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Node.js 확인
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
    if [ "$NODE_MAJOR" -lt 22 ] 2>/dev/null; then
        warn "Node.js $NODE_VERSION 감지 — Node.js 22 이상이 필요합니다."
        echo "    업그레이드: https://nodejs.org/ 또는 nvm use 22"
        echo "    현재 버전으로 계속 진행하면 빌드 오류가 발생할 수 있습니다."
    else
        success "Node.js 설치됨: $NODE_VERSION"
    fi
else
    error "Node.js가 설치되어 있지 않습니다."
    echo "    설치: https://nodejs.org/ (v22 LTS 권장)"
    exit 1
fi

# npm 확인
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    success "npm 설치됨: $NPM_VERSION"
else
    error "npm이 설치되어 있지 않습니다."
    exit 1
fi

# npx 확인
if command -v npx &> /dev/null; then
    success "npx 사용 가능"
else
    error "npx가 설치되어 있지 않습니다."
    exit 1
fi

# pnpm 확인
if command -v pnpm &> /dev/null; then
    PNPM_VERSION=$(pnpm --version)
    success "pnpm 설치됨: $PNPM_VERSION"
else
    warn "pnpm이 설치되어 있지 않습니다. 설치 중..."
    npm install -g pnpm
    success "pnpm 설치 완료"
fi

# Claude CLI 사전 확인 (핵심 의존성)
echo ""
echo -e "${CYAN}👑 Claude CLI (핵심 의존성):${NC}"
if command -v claude &> /dev/null; then
    CLAUDE_VERSION=$(claude --version 2>/dev/null | head -1 || echo "버전 확인 불가")
    success "Claude CLI 설치됨: $CLAUDE_VERSION"
else
    warn "Claude CLI가 설치되어 있지 않습니다."
    echo "    Phase 1에서 설치 안내를 제공합니다."
    echo "    공식 설치: https://claude.ai/download"
fi

# tmux는 더 이상 필요하지 않음 (v0.4.0에서 제거됨)
info "tmux 의존성 없음 — cross-platform 지원 (macOS, Linux, Windows)"

# node-pty 네이티브 빌드 도구 확인 (PTY Worker용)
echo ""
echo -e "${CYAN}🔧 네이티브 빌드 도구 (node-pty):${NC}"
if [[ "$OSTYPE" == "darwin"* ]]; then
    if xcode-select -p &> /dev/null; then
        success "Xcode Command Line Tools 설치됨"
    else
        warn "Xcode Command Line Tools 미설치 — node-pty 빌드에 필요합니다"
        echo "    설치: xcode-select --install"
    fi
elif [[ "$OSTYPE" == "linux"* ]]; then
    if command -v gcc &> /dev/null && command -v make &> /dev/null; then
        success "빌드 도구 (gcc, make) 설치됨"
    else
        warn "빌드 도구 미설치 — node-pty 빌드에 필요합니다"
        echo "    설치: sudo apt install build-essential python3"
    fi
fi

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 1: CLI 도구 설치
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
phase "Phase 1: CLI 도구 설치"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Claude CLI 확인 (핵심 의존성 — 없으면 Olympus 동작 불가)
echo -e "${CYAN}👑 Claude CLI (필수):${NC}"
if command -v claude &> /dev/null; then
    success "Claude CLI 설치됨"
else
    error "Claude CLI가 설치되어 있지 않습니다."
    echo ""
    echo "    Claude CLI는 Olympus의 핵심 의존성입니다."
    echo "    네이티브 인스톨러로 설치 후 재시도하세요:"
    echo "    → https://claude.ai/download"
    echo ""
    echo "    설치 후 'claude' 명령어가 PATH에 있는지 확인하세요:"
    echo "    → which claude"
    exit 1
fi

# Olympus CLI 설치
echo -e "${CYAN}⚡ Olympus CLI:${NC}"
step "Olympus 패키지 빌드 및 설치 중..."
cd "$SCRIPT_DIR"
pnpm install
pnpm build
CLI_BIN="$SCRIPT_DIR/packages/cli/dist/index.js"
NPM_BIN_DIR="$(npm prefix -g)/bin"
LOCAL_BIN="$HOME/.local/bin"
if [ -w "$NPM_BIN_DIR" ]; then
    ln -sf "$CLI_BIN" "$NPM_BIN_DIR/olympus"
elif [ -d "$LOCAL_BIN" ] || mkdir -p "$LOCAL_BIN"; then
    ln -sf "$CLI_BIN" "$LOCAL_BIN/olympus"
    warn "~/.local/bin에 설치됨. PATH에 추가 필요: export PATH=\"\$HOME/.local/bin:\$PATH\""
else
    warn "olympus symlink 생성 실패. 수동 설치 필요."
fi
success "Olympus CLI 설치 완료"

# Gemini CLI 확인 (Devil's Advocate - FE)
echo -e "${CYAN}😈 Gemini CLI (Devil's Advocate - Frontend):${NC}"
if command -v gemini &> /dev/null; then
    success "Gemini CLI 설치됨"
else
    warn "Gemini CLI가 설치되어 있지 않습니다."
    step "Gemini CLI 설치 중..."
    npm install -g @google/gemini-cli 2>/dev/null || warn "Gemini CLI 설치 실패 - 수동 설치 필요: npm install -g @google/gemini-cli"
fi

# Codex CLI 확인 (Devil's Advocate - BE)
echo -e "${CYAN}😈 Codex CLI (Devil's Advocate - Backend):${NC}"
if command -v codex &> /dev/null; then
    success "Codex CLI 설치됨"
else
    warn "Codex CLI가 설치되어 있지 않습니다."
    step "Codex CLI 설치 중..."
    npm install -g @openai/codex 2>/dev/null || warn "Codex CLI 설치 실패 - 수동 설치 필요: npm install -g @openai/codex"
fi

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 2: MCP 서버 의존성 설치
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
phase "Phase 2: MCP 서버 의존성 설치"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ "$INSTALL_MODE" = "local" ] || [ "$INSTALL_MODE" = "commands" ]; then
    # ── 로컬/commands 모드: 프로젝트 orchestration/mcps/에 npm install ──
    step "ai-agents MCP 의존성 설치 중 (프로젝트 로컬)..."
    cd "$ORCHESTRATION_DIR/mcps/ai-agents"
    npm install --silent
    success "ai-agents MCP 설치 완료 (프로젝트: orchestration/mcps/ai-agents/)"

    echo ""

    step "openapi MCP 의존성 설치 중 (프로젝트 로컬)..."
    cd "$ORCHESTRATION_DIR/mcps/openapi"
    npm install --silent
    success "openapi MCP 설치 완료 (프로젝트: orchestration/mcps/openapi/)"

    cd "$SCRIPT_DIR"
    info "로컬 모드: .claude/settings.json이 프로젝트 orchestration/mcps/를 참조합니다."
    info "이 프로젝트 디렉토리에서만 MCP/스킬이 작동합니다."
else
    # ── 전역 모드: ~/.claude/에 symlink 연결 후 npm install ──
    mkdir -p "$CLAUDE_DIR/mcps/ai-agents"
    mkdir -p "$CLAUDE_DIR/mcps/openapi"
    mkdir -p "$CLAUDE_DIR/commands"
    mkdir -p "$CLAUDE_DIR/skills"
    mkdir -p "$CLAUDE_DIR/plugins"
    success "디렉토리 생성 완료: $CLAUDE_DIR"

    # Learning Memory 디렉토리 안내
    info "Learning Memory 시스템은 Team 모드 실행 시 자동 활성화됩니다."

    echo ""

    # ai-agents MCP 설치 (symlink 기반 — git pull 시 자동 최신화)
    step "ai-agents MCP 설치 중 (전역, symlink)..."
    migrate_to_symlink "$ORCHESTRATION_DIR/mcps/ai-agents/server.js" "$CLAUDE_DIR/mcps/ai-agents/server.js"
    migrate_to_symlink "$ORCHESTRATION_DIR/mcps/ai-agents/package.json" "$CLAUDE_DIR/mcps/ai-agents/package.json"
    # wisdom.json은 런타임 데이터 → 기존 파일 보존, 없을 때만 복사
    if [ ! -f "$CLAUDE_DIR/mcps/ai-agents/wisdom.json" ]; then
        cp "$ORCHESTRATION_DIR/mcps/ai-agents/wisdom.json" "$CLAUDE_DIR/mcps/ai-agents/"
    fi
    cd "$CLAUDE_DIR/mcps/ai-agents"
    npm install --silent
    success "ai-agents MCP 설치 완료 (전역: ~/.claude/mcps/ai-agents/ → symlink)"

    echo ""

    # openapi MCP 설치 (symlink 기반)
    step "openapi MCP 설치 중 (전역, symlink)..."
    migrate_to_symlink "$ORCHESTRATION_DIR/mcps/openapi/server.js" "$CLAUDE_DIR/mcps/openapi/server.js"
    migrate_to_symlink "$ORCHESTRATION_DIR/mcps/openapi/package.json" "$CLAUDE_DIR/mcps/openapi/package.json"
    cd "$CLAUDE_DIR/mcps/openapi"
    npm install --silent
    success "openapi MCP 설치 완료 (전역: ~/.claude/mcps/openapi/ → symlink)"
fi

cd "$SCRIPT_DIR"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 3: 로컬 모드 - 프로젝트 내 .claude/ 설정
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if [ "$INSTALL_MODE" = "local" ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    phase "Phase 3: 프로젝트 로컬 설정 (.claude/)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    # 프로젝트 내 .claude 디렉토리 생성
    PROJECT_CLAUDE_DIR="$SCRIPT_DIR/.claude"
    mkdir -p "$PROJECT_CLAUDE_DIR/commands"
    mkdir -p "$PROJECT_CLAUDE_DIR/skills"
    success "프로젝트 .claude/ 디렉토리 생성 완료"

    # 번들 스킬 복사
    step "번들 스킬 복사 중..."
    BUNDLED_SKILLS=("frontend-ui-ux" "git-master" "agent-browser")
    for skill in "${BUNDLED_SKILLS[@]}"; do
        if [ -d "$ORCHESTRATION_DIR/skills/$skill" ]; then
            mkdir -p "$PROJECT_CLAUDE_DIR/skills/$skill"
            cp -r "$ORCHESTRATION_DIR/skills/$skill/"* "$PROJECT_CLAUDE_DIR/skills/$skill/" 2>/dev/null && \
                success "$skill 스킬 복사 완료" || \
                warn "$skill 스킬 복사 실패"
        fi
    done

    # .mcp.json 생성 (프로젝트 루트 - 포터블 MCP 설정)
    # ${PWD} 환경변수를 사용하여 절대경로 없이 어디서든 동작
    echo ""
    step ".mcp.json 생성 중 (포터블 MCP 설정)..."

    MCP_JSON_FILE="$SCRIPT_DIR/.mcp.json"

    cat > "$MCP_JSON_FILE" << 'EOF'
{
  "mcpServers": {
    "ai-agents": {
      "command": "node",
      "args": ["${PWD}/orchestration/mcps/ai-agents/server.js"],
      "env": {}
    },
    "openapi": {
      "command": "node",
      "args": ["${PWD}/orchestration/mcps/openapi/server.js"]
    },
    "stitch": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/stitch-mcp"]
    }
  }
}
EOF
    success ".mcp.json 생성 완료 (Git 커밋 가능, 포터블)"

    # .claude/settings.json 생성 (플러그인 설정 - 경로 없음)
    step ".claude/settings.json 생성 중 (플러그인 설정)..."

    SETTINGS_FILE="$PROJECT_CLAUDE_DIR/settings.json"

    cat > "$SETTINGS_FILE" << 'EOF'
{
  "enabledPlugins": {
    "postgres-best-practices@supabase-agent-skills": true,
    "vercel-react-best-practices": true,
    "ui-ux-pro-max@ui-ux-pro-max-skill": true
  }
}
EOF
    success ".claude/settings.json 생성 완료"

    # CLAUDE.md는 기본 비침범. 옵션 플래그로만 managed block 삽입.
    if [ "$WITH_CLAUDE_MD" -eq 1 ]; then
        echo ""
        step "CLAUDE.global.md managed block 설치 중..."
        CLAUDE_GLOBAL_TEMPLATE="$ORCHESTRATION_DIR/templates/CLAUDE.global.md"
        if [ -f "$CLAUDE_GLOBAL_TEMPLATE" ]; then
            mkdir -p "$CLAUDE_DIR"
            upsert_olympus_claude_md_block "$CLAUDE_GLOBAL_TEMPLATE" "$CLAUDE_DIR/CLAUDE.md"
            success "~/.claude/CLAUDE.md에 Olympus managed block 반영 완료"
        else
            warn "CLAUDE.global.md 템플릿 파일을 찾을 수 없습니다"
        fi
    else
        info "CLAUDE.md는 건드리지 않습니다. (--with-claude-md로 managed block 설치 가능)"
        if [ -L "$CLAUDE_DIR/CLAUDE.md" ]; then
            warn "기존 CLAUDE.md가 심볼릭 링크입니다."
            info "   → --with-claude-md 옵션을 추가하면 managed block으로 자동 전환됩니다:"
            info "      ./install.sh --commands --with-claude-md"
        fi
    fi

    echo ""
    info "📌 로컬 모드 설정 완료:"
    info "   • .mcp.json - MCP 서버 설정 (포터블, Git 커밋 가능)"
    info "   • .claude/settings.json - 플러그인 설정 (Git 커밋 가능)"
    info "   • .claude/skills/ - 번들 스킬"
    if [ "$WITH_CLAUDE_MD" -eq 1 ]; then
        info "   • ~/.claude/CLAUDE.md - Olympus managed block 반영"
    else
        info "   • ~/.claude/CLAUDE.md - 기존 사용자 설정 유지 (비수정)"
    fi
    echo ""
    warn "이 프로젝트 디렉토리에서 claude를 실행하면 MCP/스킬 사용 가능!"
    echo ""
fi

if [ "$INSTALL_MODE" = "global" ] || [ "$INSTALL_MODE" = "commands" ]; then

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 3: Commands 설치 (global + commands 모드)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
phase "Phase 3: Commands 설치 (~/.claude/commands/)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
mkdir -p "$CLAUDE_DIR/commands"

# /team 커맨드 설치 (symlink 기반)
migrate_to_symlink "$ORCHESTRATION_DIR/commands/team.md" "$CLAUDE_DIR/commands/team.md"
success "/team 명령어 설치 완료 (symlink)"

# /agents 커맨드 설치 (symlink 기반)
migrate_to_symlink "$ORCHESTRATION_DIR/commands/agents.md" "$CLAUDE_DIR/commands/agents.md"
success "/agents 명령어 설치 완료 (symlink)"

echo ""

fi  # ── commands/global 공통 블록 끝 ──

if [ "$INSTALL_MODE" = "global" ]; then

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 3.5: Custom Agents 설치 (전역 모드만 — symlink)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
phase "Phase 3.5: Custom Agents 설치 (19개, symlink)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

AGENTS_SRC_DIR="$SCRIPT_DIR/.claude/agents"
AGENTS_DST_DIR="$CLAUDE_DIR/agents"
mkdir -p "$AGENTS_DST_DIR"

AGENT_COUNT=0
if [ -d "$AGENTS_SRC_DIR" ]; then
    for agent_file in "$AGENTS_SRC_DIR"/*.md; do
        if [ -f "$agent_file" ]; then
            agent_name=$(basename "$agent_file")
            migrate_to_symlink "$agent_file" "$AGENTS_DST_DIR/$agent_name"
            AGENT_COUNT=$((AGENT_COUNT + 1))
        fi
    done
    success "Custom Agents $AGENT_COUNT개 설치 완료 (~/.claude/agents/ → symlink, git pull 시 자동 최신화)"
else
    warn "Custom Agents 소스 디렉토리가 없습니다: $AGENTS_SRC_DIR"
fi

echo ""

if [ "$WITH_CLAUDE_MD" -eq 1 ]; then
    step "CLAUDE.global.md managed block 설치 중..."
    CLAUDE_GLOBAL_TEMPLATE="$ORCHESTRATION_DIR/templates/CLAUDE.global.md"
    if [ -f "$CLAUDE_GLOBAL_TEMPLATE" ]; then
        upsert_olympus_claude_md_block "$CLAUDE_GLOBAL_TEMPLATE" "$CLAUDE_DIR/CLAUDE.md"
        success "~/.claude/CLAUDE.md에 Olympus managed block 반영 완료"
    else
        warn "CLAUDE.global.md 템플릿 파일을 찾을 수 없습니다: $CLAUDE_GLOBAL_TEMPLATE"
    fi
else
    info "CLAUDE.md는 건드리지 않습니다. (--with-claude-md로 managed block 설치 가능)"
    if [ -L "$CLAUDE_DIR/CLAUDE.md" ]; then
        warn "기존 CLAUDE.md symlink가 감지되었습니다. 필요 시 수동으로 개인 설정 파일로 전환하세요."
    fi
fi

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 4: Skills 설치
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
phase "Phase 4: Skills 설치"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Phase 4.1: Stitch Skills (프론트엔드 필수) ──
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
phase "Phase 4.1: Stitch Skills 설치 (프론트엔드 필수)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

step "design-md 스킬 설치 중..."
npx add-skill google-labs-code/stitch-skills --skill design-md --global 2>/dev/null && \
    success "/design-md 스킬 설치 완료" || \
    warn "/design-md 스킬 설치 실패 - 수동 설치 필요"

step "react:components 스킬 설치 중..."
npx add-skill google-labs-code/stitch-skills --skill "react:components" --global 2>/dev/null && \
    success "/react:components 스킬 설치 완료" || \
    warn "/react:components 스킬 설치 실패 - 수동 설치 필요"

echo ""

# ── Phase 4.2: Supabase Agent Skills (DB 최적화) ──
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
phase "Phase 4.2: Supabase Agent Skills (DB 최적화)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if command -v claude &> /dev/null; then
    step "Supabase Agent Skills 마켓플레이스 등록 중..."
    claude plugin marketplace add supabase/agent-skills 2>/dev/null && \
        success "supabase-agent-skills 마켓플레이스 등록 완료" || \
        info "supabase-agent-skills 마켓플레이스 이미 등록됨"

    step "postgres-best-practices 플러그인 설치 중..."
    claude plugin install postgres-best-practices@supabase-agent-skills 2>/dev/null && \
        success "postgres-best-practices 플러그인 설치 완료" || \
        warn "postgres-best-practices 설치 실패 - Claude Code 내에서 수동 설치 필요"
else
    warn "Claude CLI 미설치 - Supabase plugin 수동 설치 필요:"
    echo -e "${CYAN}  claude plugin marketplace add supabase/agent-skills${NC}"
    echo -e "${CYAN}  claude plugin install postgres-best-practices@supabase-agent-skills${NC}"
fi

echo ""

# ── Phase 4.2.1: ui-ux-pro-max (UI/UX Design Intelligence) ──
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
phase "Phase 4.2.1: ui-ux-pro-max (UI/UX Design Intelligence)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if command -v claude &> /dev/null; then
    step "ui-ux-pro-max 마켓플레이스 등록 중..."
    claude plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill 2>/dev/null && \
        success "ui-ux-pro-max-skill 마켓플레이스 등록 완료" || \
        info "ui-ux-pro-max-skill 마켓플레이스 이미 등록됨"

    step "ui-ux-pro-max 플러그인 설치 중..."
    claude plugin install ui-ux-pro-max@ui-ux-pro-max-skill 2>/dev/null && \
        success "ui-ux-pro-max 플러그인 설치 완료" || \
        warn "ui-ux-pro-max 설치 실패 - Claude Code 내에서 수동 설치 필요"
else
    warn "Claude CLI 미설치 - ui-ux-pro-max 수동 설치 필요:"
    echo -e "${CYAN}  claude plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill${NC}"
    echo -e "${CYAN}  claude plugin install ui-ux-pro-max@ui-ux-pro-max-skill${NC}"
fi

echo ""

# ── Phase 4.3: Vercel React Best Practices (React/Next.js 최적화) ──
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
phase "Phase 4.3: Vercel React Best Practices (React/Next.js 최적화)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

step "vercel-react-best-practices 스킬 설치 중..."
npx skills add vercel-labs/agent-skills --skill vercel-react-best-practices --global --yes 2>/dev/null && \
    success "vercel-react-best-practices 스킬 설치 완료" || \
    warn "vercel-react-best-practices 스킬 설치 실패 - 수동 설치 필요"

echo ""

# ── Phase 4.4: Anthropic 공식 스킬 (webapp-testing) ──
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
phase "Phase 4.4: Anthropic 공식 스킬 (Playwright 테스트)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

step "webapp-testing 스킬 설치 중..."
npx add-skill anthropics/skills --skill webapp-testing --global 2>/dev/null && \
    success "webapp-testing 스킬 설치 완료" || \
    warn "webapp-testing 스킬 설치 실패 - 수동 설치 필요"

echo ""

# ── Phase 4.5: agent-browser CLI (브라우저 자동화) ──
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
phase "Phase 4.5: agent-browser CLI (브라우저 자동화)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if command -v agent-browser &> /dev/null; then
    success "agent-browser CLI 이미 설치됨"
else
    step "agent-browser CLI 설치 중..."
    npm install -g agent-browser 2>/dev/null && \
        success "agent-browser CLI 설치 완료" || \
        warn "agent-browser CLI 설치 실패 - 수동 설치 필요: npm install -g agent-browser"
fi

echo ""

# ── Phase 4.6: find-skills 스킬 설치 (필수) ──
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
phase "Phase 4.6: find-skills 스킬 설치 (필수)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

step "find-skills 스킬 설치 중..."
npx skills add vercel-labs/skills --skill find-skills --global --yes 2>/dev/null && \
    success "find-skills 스킬 설치 완료" || \
    warn "find-skills 스킬 설치 실패 - 수동 설치 필요"

echo ""

# ── Phase 4.7: 프로젝트 번들 스킬 복사 ──
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
phase "Phase 4.7: 프로젝트 번들 스킬 연결 (symlink)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 프로젝트에 포함된 스킬들 symlink 연결 (git pull 시 자동 최신화)
BUNDLED_SKILLS=("frontend-ui-ux" "git-master" "agent-browser")

for skill in "${BUNDLED_SKILLS[@]}"; do
    if [ -d "$ORCHESTRATION_DIR/skills/$skill" ]; then
        migrate_to_symlink "$ORCHESTRATION_DIR/skills/$skill" "$CLAUDE_DIR/skills/$skill"
        success "$skill 스킬 연결 완료 (symlink)"
    else
        warn "$skill 스킬이 프로젝트에 없습니다"
    fi
done

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 5: Plugins 설치
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
phase "Phase 5: Plugins 설치 (claude-dashboard)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

DASHBOARD_DIR="$CLAUDE_DIR/plugins/claude-dashboard"
DASHBOARD_SRC="$SCRIPT_DIR/packages/claude-dashboard"
if [ -d "$DASHBOARD_SRC" ]; then
    mkdir -p "$CLAUDE_DIR/plugins"
    migrate_to_symlink "$DASHBOARD_SRC" "$DASHBOARD_DIR"
    success "claude-dashboard 연결 완료 (symlink)"
fi

# claude-dashboard 설정 파일 생성
if [ ! -f "$CLAUDE_DIR/claude-dashboard.local.json" ]; then
    cat > "$CLAUDE_DIR/claude-dashboard.local.json" << DASHEOF
{
  "language": "auto",
  "plan": "max",
  "cache": {
    "ttlSeconds": 60
  }
}
DASHEOF
    success "claude-dashboard 설정 파일 생성 완료"
fi

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 5.5: Gemini CLI 설정 (Auto Gemini 3)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
phase "Phase 5.5: Gemini CLI 설정 (Gemini 3 Preview)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

GEMINI_SETTINGS="$HOME/.gemini/settings.json"
if [ -f "$GEMINI_SETTINGS" ]; then
    if command -v jq &> /dev/null; then
        jq '.general.previewFeatures = true | .model = {"name": "gemini-3-flash-preview"}' "$GEMINI_SETTINGS" > "$GEMINI_SETTINGS.tmp" && \
            mv "$GEMINI_SETTINGS.tmp" "$GEMINI_SETTINGS" && \
            success "Gemini 3 설정 완료: previewFeatures=true, model=gemini-3-flash-preview" || \
            warn "Gemini 설정 업데이트 실패 - 수동으로 설정하세요"
    else
        warn "jq가 없어 Gemini 설정을 자동 업데이트할 수 없습니다"
        echo "    수동 설정 방법:"
        echo "    1. gemini CLI 실행 → /settings → Preview features → true"
        echo "    2. /model → Auto (Gemini 3) 선택"
        echo ""
        echo "    또는 ~/.gemini/settings.json에 다음을 추가:"
        echo '    "general": { "previewFeatures": true },'
        echo '    "model": { "name": "gemini-3-flash-preview" }'
    fi
else
    warn "~/.gemini/settings.json이 없습니다. gemini CLI를 먼저 실행하세요."
    echo "    실행 후 /settings에서 Preview features를 활성화하세요."
fi

info "Gemini 3 모델: Flash(기본, 빠른 작업) / Pro(복잡한 분석/리뷰 시 자동 사용)"

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 5.6: Codex/Gemini 글로벌 설정 배포
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
phase "Phase 5.6: Codex/Gemini 글로벌 설정 배포"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Codex 글로벌 설정 배포 (~/.codex/AGENTS.md)
CODEX_DIR="$HOME/.codex"
CODEX_GLOBAL_TEMPLATE="$ORCHESTRATION_DIR/templates/CODEX.global.md"
if [ -f "$CODEX_GLOBAL_TEMPLATE" ]; then
    if [ -d "$CODEX_DIR" ]; then
        if [ -f "$CODEX_DIR/AGENTS.md" ]; then
            cp "$CODEX_DIR/AGENTS.md" "$CODEX_DIR/AGENTS.md.backup.$(date +%Y%m%d)" 2>/dev/null
        fi
        cp "$CODEX_GLOBAL_TEMPLATE" "$CODEX_DIR/AGENTS.md"
        success "Codex 글로벌 설정 배포 완료 (~/.codex/AGENTS.md)"
    else
        warn "~/.codex/ 디렉토리가 없습니다. codex CLI를 먼저 실행하세요."
    fi
else
    warn "CODEX.global.md 템플릿을 찾을 수 없습니다"
fi

# Gemini 글로벌 설정 배포 (~/.gemini/GEMINI.md)
GEMINI_DIR="$HOME/.gemini"
GEMINI_GLOBAL_TEMPLATE="$ORCHESTRATION_DIR/templates/GEMINI.global.md"
if [ -f "$GEMINI_GLOBAL_TEMPLATE" ]; then
    if [ -d "$GEMINI_DIR" ]; then
        if [ -f "$GEMINI_DIR/GEMINI.md" ]; then
            cp "$GEMINI_DIR/GEMINI.md" "$GEMINI_DIR/GEMINI.md.backup.$(date +%Y%m%d)" 2>/dev/null
        fi
        cp "$GEMINI_GLOBAL_TEMPLATE" "$GEMINI_DIR/GEMINI.md"
        success "Gemini 글로벌 설정 배포 완료 (~/.gemini/GEMINI.md)"
    else
        warn "~/.gemini/ 디렉토리가 없습니다. gemini CLI를 먼저 실행하세요."
    fi
else
    warn "GEMINI.global.md 템플릿을 찾을 수 없습니다"
fi

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 6: settings.json 설정
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
phase "Phase 6: Claude 설정 (settings.json)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

SETTINGS_FILE="$CLAUDE_DIR/settings.json"

DASHBOARD_CMD="node $SCRIPT_DIR/packages/claude-dashboard/dist/index.js"

if [ -f "$SETTINGS_FILE" ]; then
    warn "settings.json이 이미 존재합니다."
    # jq가 있으면 자동 병합 시도
    if command -v jq &> /dev/null; then
        step "jq로 settings.json 자동 병합 중..."
        BACKUP_FILE="${SETTINGS_FILE}.backup.$(date +%Y%m%d%H%M%S)"
        cp "$SETTINGS_FILE" "$BACKUP_FILE"
        jq --arg ai_agents_path "$CLAUDE_DIR/mcps/ai-agents/server.js" \
           --arg openapi_path "$CLAUDE_DIR/mcps/openapi/server.js" \
           --arg dashboard_cmd "$DASHBOARD_CMD" \
        '
          .mcpServers["ai-agents"] = {"command": "node", "args": [$ai_agents_path], "env": {}} |
          .mcpServers["openapi"]   = {"command": "node", "args": [$openapi_path]} |
          .mcpServers["stitch"]    = {"command": "npx",  "args": ["-y", "@anthropic-ai/stitch-mcp"]} |
          .enabledPlugins["postgres-best-practices@supabase-agent-skills"] = true |
          .enabledPlugins["vercel-react-best-practices"] = true |
          .enabledPlugins["ui-ux-pro-max@ui-ux-pro-max-skill"] = true |
          .statusLine = {"type": "command", "command": $dashboard_cmd}
        ' "$SETTINGS_FILE" > "${SETTINGS_FILE}.tmp" && mv "${SETTINGS_FILE}.tmp" "$SETTINGS_FILE"
        success "settings.json 병합 완료 (백업: $BACKUP_FILE)"
    else
        echo ""
        echo "    jq가 없어 수동으로 추가해야 합니다. ~/.claude/settings.json에 아래 내용을 병합하세요:"
        echo ""
        echo -e "${YELLOW}  \"mcpServers\": {"
        echo "    \"ai-agents\": {"
        echo "      \"command\": \"node\","
        echo "      \"args\": [\"$CLAUDE_DIR/mcps/ai-agents/server.js\"],"
        echo "      \"env\": {}"
        echo "    },"
        echo "    \"openapi\": {"
        echo "      \"command\": \"node\","
        echo "      \"args\": [\"$CLAUDE_DIR/mcps/openapi/server.js\"]"
        echo "    },"
        echo "    \"stitch\": {"
        echo "      \"command\": \"npx\","
        echo "      \"args\": [\"-y\", \"@anthropic-ai/stitch-mcp\"]"
        echo "    }"
        echo "  },"
        echo "  \"enabledPlugins\": {"
        echo "    \"postgres-best-practices@supabase-agent-skills\": true,"
        echo "    \"vercel-react-best-practices\": true,"
        echo "    \"ui-ux-pro-max@ui-ux-pro-max-skill\": true"
        echo "  },"
        echo "  \"statusLine\": {"
        echo "    \"type\": \"command\","
        echo "    \"command\": \"$DASHBOARD_CMD\""
        echo -e "  }${NC}"
        echo ""
        info "jq 설치 후 재실행하면 자동 병합됩니다: brew install jq"
    fi
else
    cat > "$SETTINGS_FILE" << EOF
{
  "mcpServers": {
    "ai-agents": {
      "command": "node",
      "args": ["$CLAUDE_DIR/mcps/ai-agents/server.js"],
      "env": {}
    },
    "openapi": {
      "command": "node",
      "args": ["$CLAUDE_DIR/mcps/openapi/server.js"]
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
  },
  "statusLine": {
    "type": "command",
    "command": "$DASHBOARD_CMD"
  }
}
EOF
    success "settings.json 생성 완료 (statusLine 포함)"
fi

echo ""

fi  # ── 전역 모드 if 블록 끝 ──

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 6.9: /team 명령어 필수 환경변수 자동 설정
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
phase "Phase 6.9: /team 필수 환경변수 — CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

ENV_VAR_LINE='export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1'
ENV_VAR_COMMENT='# Olympus /team: Claude Code AI Agent Teams 실험적 기능 활성화 (필수)'

# 현재 세션에 즉시 적용
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
success "현재 세션: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 즉시 적용"

# 쉘 프로파일 자동 감지 + 영속 설정
SHELL_PROFILES=()
if [ -f "$HOME/.zshrc" ]; then
    SHELL_PROFILES+=("$HOME/.zshrc")
fi
if [ -f "$HOME/.bashrc" ]; then
    SHELL_PROFILES+=("$HOME/.bashrc")
fi
if [ -f "$HOME/.bash_profile" ] && [ ! -f "$HOME/.bashrc" ]; then
    SHELL_PROFILES+=("$HOME/.bash_profile")
fi
if [ ${#SHELL_PROFILES[@]} -eq 0 ]; then
    # 프로파일이 없으면 현재 쉘에 맞게 생성
    if [ "$(basename "$SHELL")" = "zsh" ]; then
        SHELL_PROFILES+=("$HOME/.zshrc")
    else
        SHELL_PROFILES+=("$HOME/.bashrc")
    fi
fi

for profile in "${SHELL_PROFILES[@]}"; do
    if grep -qF 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS' "$profile" 2>/dev/null; then
        info "이미 설정됨: $profile (건너뜀)"
    else
        echo "" >> "$profile"
        echo "$ENV_VAR_COMMENT" >> "$profile"
        echo "$ENV_VAR_LINE" >> "$profile"
        success "영속 설정 완료: $profile"
    fi
done

echo ""
echo -e "    ${YELLOW}⚠️  새 터미널에서 적용 확인:${NC} echo \$CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS"
echo -e "    ${YELLOW}   현재 세션은 이미 적용됨.${NC}"
echo ""

# Phase 6.5: tmux 설정은 더 이상 필요하지 않음 (v0.4.0에서 tmux 의존성 완전 제거)

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 7: 설치 확인
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
phase "Phase 7: 설치 확인"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo -e "${CYAN}설치된 CLI 도구:${NC}"
command -v olympus &> /dev/null && success "olympus" || warn "olympus 미설치"
command -v claude &> /dev/null && success "claude" || warn "claude 미설치"
command -v gemini &> /dev/null && success "gemini" || info "gemini 미설치 (선택)"
command -v codex &> /dev/null && success "codex" || info "codex 미설치 (선택)"
command -v agent-browser &> /dev/null && success "agent-browser" || info "agent-browser 미설치 (선택)"

echo ""

echo -e "${CYAN}설치된 플러그인:${NC}"
if command -v claude &> /dev/null; then
    claude plugin list 2>/dev/null | grep -q "postgres-best-practices" && \
        success "postgres-best-practices (Supabase DB)" || \
        warn "postgres-best-practices 미설치"
    claude plugin list 2>/dev/null | grep -q "ui-ux-pro-max" && \
        success "ui-ux-pro-max (UI/UX Design Intelligence)" || \
        warn "ui-ux-pro-max 미설치"
else
    warn "Claude CLI 미설치 - 플러그인 확인 불가"
fi

echo ""

if [ "$INSTALL_MODE" = "commands" ]; then
    echo -e "${CYAN}설치된 파일 (~/.claude/commands/ 만):${NC}"
    [ -L "$CLAUDE_DIR/commands/team.md" ] && success "/team 명령어 (symlink)" || warn "/team 없음"
    [ -L "$CLAUDE_DIR/commands/agents.md" ] && success "/agents 명령어 (symlink)" || warn "/agents 없음"
    info "~/.claude/agents/, settings.json — 기존 사용자 설정 보존"
fi

if [ "$INSTALL_MODE" = "global" ]; then
    echo -e "${CYAN}설치된 파일:${NC}"
    [ -d "$CLAUDE_DIR/mcps/ai-agents" ] && success "ai-agents MCP" || warn "ai-agents MCP 없음"
    [ -d "$CLAUDE_DIR/mcps/openapi" ] && success "openapi MCP" || warn "openapi MCP 없음"
    [ -d "$CLAUDE_DIR/skills/frontend-ui-ux" ] && success "frontend-ui-ux 스킬" || warn "frontend-ui-ux 스킬 없음"
    [ -d "$CLAUDE_DIR/skills/git-master" ] && success "git-master 스킬" || warn "git-master 스킬 없음"
    [ -d "$CLAUDE_DIR/plugins/claude-dashboard" ] && success "claude-dashboard 플러그인" || warn "claude-dashboard 플러그인 없음"
    [ -f "$CLAUDE_DIR/settings.json" ] && success "settings.json" || warn "settings.json 없음"
    AGENT_SYMLINK_COUNT=$(find "$CLAUDE_DIR/agents" -maxdepth 1 -type l 2>/dev/null | wc -l | tr -d ' ')
    [ "$AGENT_SYMLINK_COUNT" -gt 0 ] && success "Custom Agents ${AGENT_SYMLINK_COUNT}개 (symlink)" || warn "Custom Agents 없음"
    if [ "$WITH_CLAUDE_MD" -eq 1 ]; then
        [ -f "$CLAUDE_DIR/CLAUDE.md" ] && success "CLAUDE.md (Olympus managed block 반영)" || warn "CLAUDE.md 없음"
    else
        info "CLAUDE.md는 사용자 파일 유지 (기본 비수정)"
    fi
fi

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 완료 메시지
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ""
echo -e "${MAGENTA}╔════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║                                                                    ║${NC}"
case "$INSTALL_MODE" in
    commands) echo -e "${MAGENTA}║      ✅ Olympus + AIOS v5.3 명령어 전역 등록 완료!                ║${NC}" ;;
    global)   echo -e "${MAGENTA}║         ✅ Olympus + AIOS v5.3 전역 설치 완료!                    ║${NC}" ;;
    local)    echo -e "${MAGENTA}║         ✅ Olympus + AIOS v5.3 로컬 설치 완료!                    ║${NC}" ;;
esac
echo -e "${MAGENTA}║                                                                    ║${NC}"
echo -e "${MAGENTA}╚════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${CYAN}🆕 v1.0.0 핵심 기능:${NC}"
echo ""
echo "   ⚡ PTY Worker (v1.0.0)"
echo "      • node-pty 기반 상주형 Claude CLI + TUI 표시"
echo "      • 명령 입력 + 완료 감지 + 결과 추출 (TUI 아티팩트 필터)"
echo "      • 더블 Ctrl+C 종료, spawn 모드 자동 폴백"
echo ""
echo "   🔗 Worker Registry"
echo "      • Gateway 인메모리 워커 등록/하트비트/작업 할당"
echo "      • Telegram @멘션으로 워커에 직접 작업 위임"
echo ""
echo "   📡 실시간 스트리밍"
echo "      • stdout 기반 WebSocket 브로드캐스트 (cli:stream)"
echo "      • 병렬 CLI 실행 — ConcurrencyLimiter (최대 5개)"
echo ""
echo "   🤝 Claude-Codex Co-Leadership (AIOS v5.3)"
echo "      • 10 Phase 워크플로우, Deep Engineering Protocol"
echo "      • 3x 확장 산출물, 4-Section Deep Review"
echo ""

echo -e "${RED}⚠️ 필수 체크리스트:${NC}"
echo ""
echo -e "${CYAN}👑 CLI 도구:${NC}"
echo "   [ ] claude CLI 설치됨"
echo "   [ ] gemini CLI 설치됨 + OAuth (터미널에서 'gemini' 실행)"
echo "   [ ] Gemini 3 활성화 (/settings → Preview features → true)"
echo "   [ ] codex CLI 설치됨 + OAuth (터미널에서 'codex login' 실행)"
echo ""

if [ "$INSTALL_MODE" = "local" ]; then
echo -e "${CYAN}📁 프로젝트 로컬 설정:${NC}"
echo "   [✔] .mcp.json - MCP 서버 설정 (포터블, Git 커밋 가능)"
echo "   [✔] .claude/settings.json - 플러그인 설정 (Git 커밋 가능)"
echo "   [✔] .claude/skills/ - 번들 스킬 (frontend-ui-ux, git-master, agent-browser)"
echo ""
echo -e "${CYAN}🔌 MCP 서버 (프로젝트 로컬 - \${PWD} 기반):${NC}"
echo "   [✔] ai-agents MCP (orchestration/mcps/ai-agents/)"
echo "   [✔] openapi MCP (orchestration/mcps/openapi/)"
echo "   [✔] stitch MCP (npx로 자동 실행)"
echo ""
echo -e "${GREEN}✅ 로컬 모드 사용법:${NC}"
echo "   cd $SCRIPT_DIR"
echo "   claude                        # 이 디렉토리에서 claude 실행"
echo ""
echo -e "${YELLOW}📌 주의사항:${NC}"
echo "   • 반드시 이 프로젝트 디렉토리에서 claude를 실행해야 합니다"
if [ "$WITH_CLAUDE_MD" -eq 1 ]; then
echo "   • ~/.claude/CLAUDE.md에 Olympus managed block이 반영되었습니다"
else
echo "   • ~/.claude/CLAUDE.md는 기본적으로 수정하지 않습니다"
fi
echo "   • 어디서든 /team 명령어 사용: ./install.sh --commands"
echo "   • 전체 전역 설치 (에이전트 포함): ./install.sh --global"
elif [ "$INSTALL_MODE" = "commands" ]; then
echo -e "${CYAN}🔗 등록된 명령어 (~/.claude/commands/):${NC}"
echo "   [✔] /team   — Team Engineering Protocol"
echo "   [✔] /agents — Agent Activation State Management"
echo ""
echo -e "${GREEN}✅ 사용법:${NC}"
echo "   claude                        # 어떤 프로젝트에서든 /team, /agents 사용 가능"
echo ""
echo -e "${YELLOW}📌 에이전트 사용 범위:${NC}"
echo "   • olympus 디렉토리 내 : 프로젝트 .claude/agents/ (항상 최신)"
echo "   • 다른 프로젝트       : ~/.claude/agents/ 사용 (없으면 에이전트 미동작)"
echo "   • 에이전트까지 전역   : ./install.sh --global"
echo ""
echo -e "${YELLOW}⚠️  MCP 제한 사항:${NC}"
echo "   이 모드에서는 ~/.claude/settings.json을 수정하지 않으므로"
echo "   다른 프로젝트에서 /team 실행 시 MCP 도구(codex_analyze 등)가 비활성화됩니다."
echo "   olympus 디렉토리에서 claude를 실행하면 .mcp.json으로 자동 활성화됩니다."
echo "   → MCP까지 전역 활성화: ./install.sh --global"
if [ "$WITH_CLAUDE_MD" -eq 1 ]; then
echo "   • ~/.claude/CLAUDE.md에 Olympus managed block이 반영되었습니다"
else
echo "   • ~/.claude/CLAUDE.md는 수정하지 않습니다 (원하면 --with-claude-md)"
fi
else
echo -e "${CYAN}🔌 MCP 서버 (전역):${NC}"
echo "   [✔] ai-agents MCP (Gemini + Codex 협업)"
echo "   [✔] openapi MCP (Swagger/OpenAPI 스펙 활용)"
echo "   [✔] stitch MCP (프론트엔드 컴포넌트 생성)"
echo ""
echo -e "${CYAN}🔌 Plugin (자동 설치 시도됨 - 실패 시 아래 명령어 실행):${NC}"
echo "   [✔] postgres-best-practices (Supabase DB 최적화)"
echo "   [✔] ui-ux-pro-max (UI/UX Design Intelligence)"
echo ""
echo -e "${YELLOW}   설치 실패 시 Claude Code 내에서:${NC}"
echo "   claude plugin marketplace add supabase/agent-skills"
echo "   claude plugin install postgres-best-practices@supabase-agent-skills"
echo "   claude plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill"
echo "   claude plugin install ui-ux-pro-max@ui-ux-pro-max-skill"
echo ""
echo -e "${CYAN}📦 Skills:${NC}"
echo "   [✔] vercel-react-best-practices (React/Next.js 최적화)"
echo "   [✔] design-md (디자인 시스템)"
echo "   [✔] react:components (컴포넌트 생성)"
echo "   [✔] webapp-testing (Playwright 테스트)"
echo "   [✔] frontend-ui-ux (UI/UX 가이드)"
echo "   [✔] git-master (Git 워크플로우)"
echo "   [✔] agent-browser (브라우저 자동화)"
echo "   [✔] find-skills (스킬 검색 - 필수)"
echo ""
echo -e "${CYAN}📊 Dashboard:${NC}"
echo "   [✔] claude-dashboard (상태줄 플러그인 - Codex/Gemini 사용량 표시)"
echo ""
echo -e "${GREEN}🔗 Symlink 기반 설치:${NC}"
echo "   • git pull만으로 모든 전역 파일이 자동 최신화됩니다"
echo "   • MCP 서버, 스킬, 플러그인은 symlink"
if [ "$WITH_CLAUDE_MD" -eq 1 ]; then
echo "   • CLAUDE.md는 managed block 방식으로 업데이트됩니다 (재실행 필요)"
else
echo "   • CLAUDE.md는 사용자 파일 유지 (원하면 --with-claude-md)"
fi
echo -e "   ${YELLOW}⚠️  olympus 저장소를 이동한 경우 install.sh를 다시 실행하세요${NC}"
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🎯 다음 단계 (설치 직후 할 일):${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${CYAN}Step 1. Telegram 봇 설정 (선택, 원격 조작 원할 경우)${NC}"
echo "   1) Telegram에서 @BotFather → /newbot → 토큰 발급"
echo "   2) Telegram에서 @userinfobot → /start → User ID 확인"
echo "   3) ~/.zshrc 또는 ~/.bashrc에 추가:"
echo "      export TELEGRAM_BOT_TOKEN=\"<토큰>\""
echo "      export ALLOWED_USERS=\"<User ID>\""
echo "   4) source ~/.zshrc"
echo ""
echo -e "${CYAN}Step 2. Gemini / Codex 인증 (Multi-AI 기능 원할 경우)${NC}"
echo "   gemini    # 처음 실행 시 OAuth 인증 → Preview 활성화 권장"
echo "   codex login"
echo ""
echo -e "${CYAN}Step 3. 서버 시작${NC}"
echo "   olympus server start"
echo "   # 브라우저: http://localhost:8201 (대시보드)"
echo ""
echo -e "${CYAN}Step 4. 작업할 프로젝트에서 워커 시작 (별도 터미널)${NC}"
echo "   cd /path/to/your/project"
echo "   olympus start-trust   # 권장: Claude 권한 자동 승인 (--dangerously-skip-permissions)"
echo "   # 또는: olympus start  # 매번 Claude가 권한 확인 요청 (인터랙티브)"
echo ""
echo -e "${CYAN}Step 5. /team 환경변수 확인${NC}"
echo "   echo \$CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS  # '1'이면 정상"
echo "   # 미설정 시: source ~/.zshrc  (또는 새 터미널 열기)"
echo ""
echo -e "${CYAN}Step 6. Team 모드 첫 사용${NC}"
echo "   # Claude CLI 세션 안에서:"
echo "   /team \"로그인 페이지 UI 개선\""
echo ""
echo -e "${YELLOW}📋 설치 검증:${NC}"
echo "   command -v olympus && echo '✅ olympus' || echo '❌ olympus (PATH 미설정)'"
echo "   command -v claude  && echo '✅ claude'  || echo '❌ claude'"
if [ "$INSTALL_MODE" = "global" ] || [ "$INSTALL_MODE" = "commands" ]; then
echo "   ls ~/.claude/commands/team.md  && echo '✅ /team 명령어' || echo '❌ /team 없음'"
fi
if [ "$INSTALL_MODE" = "global" ]; then
echo "   ls ~/.claude/agents/ | wc -l   # 19개이면 정상"
fi
echo ""
echo -e "${YELLOW}   ❌ olympus 표시 시 — PATH 미설정:${NC}"
echo "   echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.zshrc && source ~/.zshrc"
echo ""
echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${MAGENTA}v1.0.0 핵심:${NC}"
echo ""
echo -e "   ⚡ ${CYAN}PTY Worker${NC}: node-pty 기반 상주형 Claude CLI (TUI + 자동 완료 감지)"
echo -e "   🔗 ${CYAN}Worker Registry${NC}: Gateway 워커 등록/하트비트/작업 할당"
echo -e "   📡 ${CYAN}실시간 스트리밍${NC}: stdout WebSocket 브로드캐스트 (cli:stream)"
echo -e "   🤝 ${CYAN}AIOS v5.3${NC}: Claude + Codex + Gemini Co-Leadership"
echo -e "   📊 ${CYAN}11 Packages${NC}: protocol, core, gateway, cli, client, web, tui, telegram-bot, codex, claude-dashboard, mcp"
echo -e "   🧪 ${CYAN}483+ Tests${NC}: gateway(483) + codex(63) + cli(130)"
echo ""
echo -e "   ${YELLOW}🎯 목표: Claude CLI의 개발 생산성을 위한 Multi-AI 협업 개발 도구${NC}"
echo ""
echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
