#!/bin/bash
#
# Olympus - Claude CLI Enhanced Platform Installer
# Multi-AI Orchestration Protocol v5.0 통합 버전
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
for arg in "$@"; do
    case $arg in
        --local)  INSTALL_MODE="local" ;;
        --global) INSTALL_MODE="global" ;;
        --help|-h)
            echo "Usage: ./install.sh [--local | --global]"
            echo ""
            echo "  --local   프로젝트 로컬 설치 (이 프로젝트에서만 사용)"
            echo "            • CLI 도구만 전역 설치 (claude, olympus)"
            echo "            • MCP 서버는 프로젝트 orchestration/mcps/에 npm install"
            echo "            • ~/.claude/ 디렉토리를 건드리지 않음"
            echo ""
            echo "  --global  전역 설치 (모든 프로젝트에서 사용)"
            echo "            • 모든 것을 ~/.claude/에 복사"
            echo "            • skills, commands, plugins 전역 설치"
            echo "            • 어디서든 /orchestration 사용 가능"
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
echo -e "${MAGENTA}║          Claude CLI Enhanced Platform + AIOS v5.0                 ║${NC}"
echo -e "${MAGENTA}║       \"Claude CLI의 개발 생산성을 위한 Multi-AI 협업 개발 도구\"            ║${NC}"
echo -e "${MAGENTA}╚════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# 설치 모드 선택 (인자 없을 때)
if [ -z "$INSTALL_MODE" ]; then
    echo ""
    echo -e "${CYAN}설치 모드를 선택하세요:${NC}"
    echo ""
    echo -e "  ${GREEN}1) 전역 설치 (Global)${NC} - 모든 프로젝트에서 /orchestration 사용 가능"
    echo "     → ~/.claude/에 MCP, commands, skills, plugins 모두 설치"
    echo ""
    echo -e "  ${YELLOW}2) 로컬 설치 (Local)${NC} - 이 프로젝트에서만 사용"
    echo "     → CLI 도구만 전역, 나머지는 프로젝트 내 유지"
    echo "     → ~/.claude/ 디렉토리를 건드리지 않음"
    echo ""
    read -p "선택 [1/2] (기본: 1): " mode_choice
    case $mode_choice in
        2|local|l) INSTALL_MODE="local" ;;
        *) INSTALL_MODE="global" ;;
    esac
fi

echo ""
if [ "$INSTALL_MODE" = "local" ]; then
    echo -e "${YELLOW}📦 로컬 설치 모드${NC} - 프로젝트 디렉토리에서만 사용 가능"
else
    echo -e "${GREEN}🌐 전역 설치 모드${NC} - 모든 프로젝트에서 사용 가능"
fi
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
    success "Node.js 설치됨: $NODE_VERSION"
else
    error "Node.js가 설치되어 있지 않습니다."
    echo "    설치: https://nodejs.org/"
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

# tmux 확인 (선택)
if command -v tmux &> /dev/null; then
    TMUX_VERSION=$(tmux -V)
    success "tmux 설치됨: $TMUX_VERSION"
else
    warn "tmux가 설치되어 있지 않습니다. 'olympus start' 명령어 사용 불가"
    echo "    macOS: brew install tmux"
    echo "    Ubuntu: sudo apt install tmux"
fi

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 1: CLI 도구 설치
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
phase "Phase 1: CLI 도구 설치"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Claude CLI 확인 (CEO/CTO)
echo -e "${CYAN}👑 Claude CLI (CEO/CTO):${NC}"
if command -v claude &> /dev/null; then
    success "Claude CLI 설치됨"
else
    warn "Claude CLI가 설치되어 있지 않습니다."
    step "Claude CLI 설치 중..."
    npm install -g @anthropic-ai/claude-code
    success "Claude CLI 설치 완료"
fi

# Olympus CLI 설치
echo -e "${CYAN}⚡ Olympus CLI:${NC}"
step "Olympus 패키지 빌드 및 설치 중..."
cd "$SCRIPT_DIR"
pnpm install
pnpm build
cd packages/cli
npm link 2>/dev/null || sudo npm link
success "Olympus CLI 설치 완료"
cd "$SCRIPT_DIR"

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

if [ "$INSTALL_MODE" = "local" ]; then
    # ── 로컬 모드: 프로젝트 orchestration/mcps/에 npm install ──
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
    info "이 프로젝트 디렉토리에서만 /orchestration이 작동합니다."
else
    # ── 전역 모드: ~/.claude/에 복사 후 npm install ──
    mkdir -p "$CLAUDE_DIR/mcps/ai-agents"
    mkdir -p "$CLAUDE_DIR/mcps/openapi"
    mkdir -p "$CLAUDE_DIR/commands"
    mkdir -p "$CLAUDE_DIR/skills"
    mkdir -p "$CLAUDE_DIR/plugins"
    success "디렉토리 생성 완료: $CLAUDE_DIR"

    # Learning Memory 디렉토리 안내
    info "Learning Memory 시스템은 /orchestration 실행 시 .sisyphus/ 디렉토리에 자동 생성됩니다."

    echo ""

    # ai-agents MCP 설치
    step "ai-agents MCP 설치 중 (전역)..."
    cp "$ORCHESTRATION_DIR/mcps/ai-agents/server.js" "$CLAUDE_DIR/mcps/ai-agents/"
    cp "$ORCHESTRATION_DIR/mcps/ai-agents/package.json" "$CLAUDE_DIR/mcps/ai-agents/"
    cp "$ORCHESTRATION_DIR/mcps/ai-agents/wisdom.json" "$CLAUDE_DIR/mcps/ai-agents/"
    cd "$CLAUDE_DIR/mcps/ai-agents"
    npm install --silent
    success "ai-agents MCP 설치 완료 (전역: ~/.claude/mcps/ai-agents/)"

    echo ""

    # openapi MCP 설치
    step "openapi MCP 설치 중 (전역)..."
    cp "$ORCHESTRATION_DIR/mcps/openapi/server.js" "$CLAUDE_DIR/mcps/openapi/"
    cp "$ORCHESTRATION_DIR/mcps/openapi/package.json" "$CLAUDE_DIR/mcps/openapi/"
    cd "$CLAUDE_DIR/mcps/openapi"
    npm install --silent
    success "openapi MCP 설치 완료 (전역: ~/.claude/mcps/openapi/)"
fi

cd "$SCRIPT_DIR"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 3~6: 전역 모드에서만 실행
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if [ "$INSTALL_MODE" = "local" ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    phase "Phase 3~6: 건너뜀 (로컬 모드)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    info "로컬 모드에서는 commands, skills를"
    info "프로젝트 내 orchestration/ 디렉토리에서 직접 사용합니다."
    info "전역 ~/.claude/ 디렉토리는 변경되지 않습니다."
    echo ""
fi

if [ "$INSTALL_MODE" = "global" ]; then

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 3: Commands 설치 (전역 모드만)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
phase "Phase 3: Commands 설치"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# /orchestration 커맨드 설치
cp "$ORCHESTRATION_DIR/commands/orchestration.md" "$CLAUDE_DIR/commands/"
success "/orchestration v5.0 명령어 설치 완료"

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

info "Supabase Agent Skills는 Claude Code 내에서 설치해야 합니다."
echo ""
echo -e "${YELLOW}Claude Code 실행 후 다음 명령어를 입력하세요:${NC}"
echo ""
echo -e "${CYAN}  /plugin marketplace add supabase/agent-skills${NC}"
echo -e "${CYAN}  /plugin install postgres-best-practices@supabase-agent-skills${NC}"
echo ""
warn "이 스킬은 /orchestration v5.0 실행의 필수 조건입니다!"

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
phase "Phase 4.7: 프로젝트 번들 스킬 복사"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 프로젝트에 포함된 스킬들 복사
BUNDLED_SKILLS=("frontend-ui-ux" "git-master" "agent-browser")

for skill in "${BUNDLED_SKILLS[@]}"; do
    if [ -d "$ORCHESTRATION_DIR/skills/$skill" ]; then
        mkdir -p "$CLAUDE_DIR/skills/$skill"
        cp -r "$ORCHESTRATION_DIR/skills/$skill/"* "$CLAUDE_DIR/skills/$skill/" 2>/dev/null && \
            success "$skill 스킬 복사 완료" || \
            warn "$skill 스킬 복사 실패"
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
DASHBOARD_SRC="$ORCHESTRATION_DIR/plugins/claude-dashboard"
if [ -d "$DASHBOARD_SRC" ]; then
    if [ -d "$DASHBOARD_DIR" ]; then
        step "claude-dashboard 업데이트 중..."
        cp -r "$DASHBOARD_SRC"/* "$DASHBOARD_DIR"/ 2>/dev/null && \
            success "claude-dashboard 업데이트 완료" || \
            warn "claude-dashboard 업데이트 실패"
    else
        step "claude-dashboard 설치 중..."
        mkdir -p "$CLAUDE_DIR/plugins"
        cp -r "$DASHBOARD_SRC" "$DASHBOARD_DIR" && \
            success "claude-dashboard 설치 완료" || \
            warn "claude-dashboard 설치 실패"
    fi
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
# Phase 6: settings.json 설정
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
phase "Phase 6: Claude 설정 (settings.json)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

SETTINGS_FILE="$CLAUDE_DIR/settings.json"

if [ -f "$SETTINGS_FILE" ]; then
    warn "settings.json이 이미 존재합니다."
    echo ""
    echo "    다음 내용을 mcpServers에 추가하세요:"
    echo ""
    echo -e "${YELLOW}    \"ai-agents\": {"
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
    echo -e "    }${NC}"
    echo ""
    echo "    그리고 enabledPlugins를 추가하세요:"
    echo ""
    echo -e "${YELLOW}  \"enabledPlugins\": {"
    echo "    \"postgres-best-practices@supabase-agent-skills\": true,"
    echo "    \"vercel-react-best-practices\": true"
    echo -e "  }${NC}"
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
    "vercel-react-best-practices": true
  }
}
EOF
    success "settings.json 생성 완료"
fi

echo ""

fi  # ── 전역 모드 if 블록 끝 ──

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 6.5: tmux 마우스 스크롤 설정 (선택)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
phase "Phase 6.5: tmux 마우스 스크롤 설정 (olympus start 사용 시 권장)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

TMUX_CONF="$HOME/.tmux.conf"

if [ -f "$TMUX_CONF" ]; then
    # 이미 mouse on 설정이 있는지 확인
    if grep -q "set.*mouse.*on" "$TMUX_CONF" 2>/dev/null; then
        success "tmux 마우스 설정이 이미 존재합니다"
    else
        warn "~/.tmux.conf가 존재하지만 마우스 설정이 없습니다"
        echo ""
        echo "    tmux에서 마우스 휠 스크롤을 사용하려면 다음을 추가하세요:"
        echo ""
        echo -e "    ${YELLOW}set -g mouse on${NC}"
        echo ""
    fi
else
    echo ""
    read -p "tmux 마우스 스크롤 설정을 추가하시겠습니까? [Y/n]: " tmux_choice
    case $tmux_choice in
        n|N|no|No)
            info "tmux 설정을 건너뜁니다"
            ;;
        *)
            cat > "$TMUX_CONF" << 'TMUXEOF'
# Olympus tmux 설정 - Claude CLI 호환
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

# 터미널 색상 지원
set -g default-terminal "screen-256color"
set -ga terminal-overrides ",xterm-256color:Tc"
TMUXEOF
            success "tmux 설정 파일 생성 완료 (~/.tmux.conf)"
            echo ""
            info "이미 tmux 세션이 실행 중이라면 다음 명령어로 적용하세요:"
            echo "    tmux source-file ~/.tmux.conf"
            ;;
    esac
fi

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

if [ "$INSTALL_MODE" = "global" ]; then
    echo -e "${CYAN}설치된 파일:${NC}"
    [ -f "$CLAUDE_DIR/commands/orchestration.md" ] && success "/orchestration 명령어" || warn "/orchestration 명령어 없음"
    [ -d "$CLAUDE_DIR/mcps/ai-agents" ] && success "ai-agents MCP" || warn "ai-agents MCP 없음"
    [ -d "$CLAUDE_DIR/mcps/openapi" ] && success "openapi MCP" || warn "openapi MCP 없음"
    [ -d "$CLAUDE_DIR/skills/frontend-ui-ux" ] && success "frontend-ui-ux 스킬" || warn "frontend-ui-ux 스킬 없음"
    [ -d "$CLAUDE_DIR/skills/git-master" ] && success "git-master 스킬" || warn "git-master 스킬 없음"
    [ -d "$CLAUDE_DIR/plugins/claude-dashboard" ] && success "claude-dashboard 플러그인" || warn "claude-dashboard 플러그인 없음"
    [ -f "$CLAUDE_DIR/settings.json" ] && success "settings.json" || warn "settings.json 없음"
fi

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 완료 메시지
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ""
echo -e "${MAGENTA}╔════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║                                                                    ║${NC}"
if [ "$INSTALL_MODE" = "local" ]; then
echo -e "${MAGENTA}║         ✅ Olympus + AIOS v5.0 로컬 설치 완료!                    ║${NC}"
else
echo -e "${MAGENTA}║         ✅ Olympus + AIOS v5.0 전역 설치 완료!                    ║${NC}"
fi
echo -e "${MAGENTA}║                                                                    ║${NC}"
echo -e "${MAGENTA}╚════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${CYAN}🆕 v5.0 새로운 기능:${NC}"
echo ""
echo "   🧠 Phase -1: Smart Intake"
echo "      • Complexity Heuristic 기반 자동 모드 결정"
echo ""
echo "   📋 Contract Document (Phase 0)"
echo "      • Global Blackboard - 모든 에이전트가 참조하는 진실의 원천"
echo ""
echo "   🔀 Multi-Layer DAG (Phase 1)"
echo "      • UI/Domain/Infra/Integration 레이어"
echo ""
echo "   ⚡ Shared Surface 충돌 감지 (Phase 4)"
echo "      • 병렬 실행 전 파일 겹침 자동 검출"
echo ""
echo "   📊 정량화된 Quality Gate (Phase 8)"
echo "      • Hard/Behavior/Soft 3단계 Gate"
echo ""
echo "   🧠 Learning Memory"
echo "      • 실패 Root Cause → Prevention Rule 자동 기록"
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
echo -e "${CYAN}🔌 MCP 서버 (프로젝트 로컬):${NC}"
echo "   [✔] ai-agents MCP (orchestration/mcps/ai-agents/ - npm install 완료)"
echo "   [✔] openapi MCP (orchestration/mcps/openapi/ - npm install 완료)"
echo "   [~] stitch → 필요 시 .claude/settings.local.json에 추가"
echo ""
echo -e "${YELLOW}📌 로컬 모드 주의사항:${NC}"
echo "   • 이 프로젝트 디렉토리에서만 /orchestration 사용 가능"
echo "   • skills/plugins는 전역 설치 필요 시 ./install.sh --global 재실행"
echo "   • ~/.claude/ 디렉토리는 변경되지 않았습니다"
else
echo -e "${CYAN}🔌 MCP 서버 (전역):${NC}"
echo "   [✔] ai-agents MCP (Gemini + Codex 협업)"
echo "   [✔] openapi MCP (Swagger/OpenAPI 스펙 활용)"
echo "   [✔] stitch MCP (프론트엔드 컴포넌트 생성)"
echo ""
echo -e "${CYAN}🔌 Plugin (Claude Code 내에서 실행 필요):${NC}"
echo "   [ ] /plugin marketplace add supabase/agent-skills"
echo "   [ ] /plugin install postgres-best-practices@supabase-agent-skills"
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
fi

echo ""
echo -e "${YELLOW}📋 인증 상태 확인:${NC}"
echo "   claude 실행 후 > check_auth_status"
echo ""
echo -e "${GREEN}🚀 사용 방법:${NC}"
echo ""
echo "   # Olympus CLI"
echo "   olympus                    # Claude CLI 실행"
echo "   olympus start              # tmux 세션에서 Claude CLI 시작"
echo "   olympus server start       # Gateway + Dashboard + Telegram 시작"
echo ""
echo "   # Multi-AI Orchestration"
echo "   /orchestration \"작업 설명\"    # 10 Phase 프로토콜 시작"
echo ""
echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${MAGENTA}v5.0 핵심 원칙:${NC}"
echo ""
echo -e "   👑 ${CYAN}Claude = Orchestrator${NC}: 프로세스 조율, 병합, 사용자 소통"
echo -e "   🎨 ${CYAN}Gemini = Architect${NC}: 계획, 리뷰, 리스크 분석"
echo -e "   ⚙️ ${CYAN}Codex = Implementer${NC}: 코드 패치, 테스트, 타입"
echo -e "   🧠 ${CYAN}find-skills 필수${NC}: 모든 작업에서 스킬 검색 필수"
echo -e "   📊 ${CYAN}Dashboard${NC}: Gemini/Codex 사용량 실시간 표시"
echo ""
echo -e "   ${YELLOW}🎯 목표: Claude CLI의 개발 생산성을 위한 Multi-AI 협업 개발 도구${NC}"
echo ""
echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
