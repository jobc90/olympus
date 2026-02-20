#Requires -Version 5.1
<#
.SYNOPSIS
    Olympus - Claude CLI Enhanced Platform Installer (Windows)
    Multi-AI Orchestration Protocol v5.3

.DESCRIPTION
    Windows용 Olympus 설치 스크립트.
    macOS/Linux는 ./install.sh 를 사용하세요.

.PARAMETER Mode
    설치 모드: "global" (기본) 또는 "local"

.PARAMETER WithClaudeMd
    ~/.claude/CLAUDE.md에 Olympus managed block 삽입

.EXAMPLE
    .\install.ps1
    .\install.ps1 -Mode global
    .\install.ps1 -Mode local
    .\install.ps1 -Mode global -WithClaudeMd
#>

param(
    [ValidateSet("global", "local")]
    [string]$Mode = "",
    [switch]$WithClaudeMd,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 헬퍼 함수
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function Write-Info    { param($msg) Write-Host "[INFO]    $msg" -ForegroundColor Blue }
function Write-Success { param($msg) Write-Host "[SUCCESS] $msg" -ForegroundColor Green }
function Write-Warn    { param($msg) Write-Host "[WARN]    $msg" -ForegroundColor Yellow }
function Write-Err     { param($msg) Write-Host "[ERROR]   $msg" -ForegroundColor Red }
function Write-Step    { param($msg) Write-Host "[STEP]    $msg" -ForegroundColor Cyan }
function Write-Phase   { param($msg) Write-Host "[PHASE]   $msg" -ForegroundColor Magenta }

if ($Help) {
    Write-Host @"

Usage: .\install.ps1 [-Mode global|local] [-WithClaudeMd] [-Help]

  -Mode global   전역 설치 (모든 프로젝트에서 /orchestration 사용 가능)
                 -> ~/.claude/에 MCP, commands, skills, plugins 설치

  -Mode local    로컬 설치 (이 프로젝트에서만 사용)
                 -> CLI만 글로벌, 나머지는 프로젝트 내 유지

  -WithClaudeMd  ~/.claude/CLAUDE.md에 Olympus managed block 삽입

  (인자 없음)    대화형으로 선택

"@
    exit 0
}

# 경로 변수
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$ClaudeDir = Join-Path $env:USERPROFILE ".claude"
$OrchestrationDir = Join-Path $ScriptDir "orchestration"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 로고
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Write-Host ""
Write-Host "================================================================" -ForegroundColor Magenta
Write-Host "        Olympus - Claude CLI Enhanced Platform v1.0.0" -ForegroundColor Magenta
Write-Host "        Multi-AI Orchestration Protocol v5.3 (Windows)" -ForegroundColor Magenta
Write-Host "================================================================" -ForegroundColor Magenta
Write-Host ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 설치 모드 선택
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if (-not $Mode) {
    Write-Host "설치 모드를 선택하세요:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  1) 전역 설치 (Global) - 모든 프로젝트에서 /orchestration 사용 가능" -ForegroundColor Green
    Write-Host "  2) 로컬 설치 (Local)  - 이 프로젝트에서만 사용" -ForegroundColor Yellow
    Write-Host ""
    $choice = Read-Host "선택 [1/2] (기본: 1)"
    if ($choice -eq "2") { $Mode = "local" } else { $Mode = "global" }
}

if ($Mode -eq "local") {
    Write-Host "로컬 설치 모드 - 프로젝트 디렉토리에서만 사용 가능" -ForegroundColor Yellow
} else {
    Write-Host "전역 설치 모드 - 모든 프로젝트에서 사용 가능" -ForegroundColor Green
}
Write-Host ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 0: 사전 요구사항 확인
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Phase "Phase 0: 사전 요구사항 확인"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""

# Node.js
if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVer = node --version
    Write-Success "Node.js 설치됨: $nodeVer"
} else {
    Write-Err "Node.js가 설치되어 있지 않습니다. https://nodejs.org/"
    exit 1
}

# pnpm
if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    $pnpmVer = pnpm --version
    Write-Success "pnpm 설치됨: $pnpmVer"
} else {
    Write-Warn "pnpm이 없습니다. 설치 중..."
    npm install -g pnpm
    Write-Success "pnpm 설치 완료"
}

# Claude CLI
if (Get-Command claude -ErrorAction SilentlyContinue) {
    Write-Success "Claude CLI 설치됨"
} else {
    Write-Warn "Claude CLI가 없습니다. 설치 중..."
    npm install -g @anthropic-ai/claude-code
    Write-Success "Claude CLI 설치 완료"
}

# Gemini CLI (선택)
if (Get-Command gemini -ErrorAction SilentlyContinue) {
    Write-Success "Gemini CLI 설치됨"
} else {
    Write-Info "Gemini CLI 미설치 (선택): npm i -g @google/gemini-cli"
}

# Codex CLI (선택)
if (Get-Command codex -ErrorAction SilentlyContinue) {
    Write-Success "Codex CLI 설치됨"
} else {
    Write-Info "Codex CLI 미설치 (선택): npm i -g @openai/codex"
}

Write-Host ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 1: 빌드 + Olympus CLI 글로벌 등록
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Phase "Phase 1: 빌드 + Olympus CLI 글로벌 등록"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""

Write-Step "pnpm install..."
Push-Location $ScriptDir
pnpm install
if ($LASTEXITCODE -ne 0) { Write-Err "pnpm install 실패"; exit 1 }

Write-Step "pnpm build..."
pnpm build
if ($LASTEXITCODE -ne 0) { Write-Err "pnpm build 실패"; exit 1 }
Write-Success "전체 빌드 완료"

Write-Step "Olympus CLI 글로벌 등록 (npm link)..."
Push-Location (Join-Path $ScriptDir "packages\cli")
npm link 2>&1 | Out-Null
Pop-Location
Pop-Location

# 등록 확인
if (Get-Command olympus -ErrorAction SilentlyContinue) {
    $olympusVer = olympus --version
    Write-Success "olympus CLI 등록 완료 (v$olympusVer)"
} else {
    Write-Warn "olympus가 PATH에 없습니다. 아래 명령으로 수동 등록하세요:"
    Write-Host "    cd packages\cli && npm link" -ForegroundColor Yellow
}

Write-Host ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 2: MCP 서버 의존성 설치
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Phase "Phase 2: MCP 서버 의존성 설치"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""

$mcpAgents = Join-Path $OrchestrationDir "mcps\ai-agents"
$mcpOpenapi = Join-Path $OrchestrationDir "mcps\openapi"

Write-Step "ai-agents MCP 의존성 설치..."
Push-Location $mcpAgents; npm install --silent 2>&1 | Out-Null; Pop-Location
Write-Success "ai-agents MCP 설치 완료"

Write-Step "openapi MCP 의존성 설치..."
Push-Location $mcpOpenapi; npm install --silent 2>&1 | Out-Null; Pop-Location
Write-Success "openapi MCP 설치 완료"

Write-Host ""

if ($Mode -eq "global") {

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Phase 3: 글로벌 설정 배포 (~/.claude/)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
    Write-Phase "Phase 3: 글로벌 설정 배포 (~/.claude/)"
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
    Write-Host ""

    # 디렉토리 생성
    $dirs = @(
        (Join-Path $ClaudeDir "mcps\ai-agents"),
        (Join-Path $ClaudeDir "mcps\openapi"),
        (Join-Path $ClaudeDir "commands"),
        (Join-Path $ClaudeDir "skills"),
        (Join-Path $ClaudeDir "plugins")
    )
    foreach ($d in $dirs) {
        if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
    }
    Write-Success "디렉토리 생성 완료: $ClaudeDir"

    # MCP 파일 복사
    Write-Step "MCP 서버 파일 복사..."
    Copy-Item (Join-Path $mcpAgents "server.js")    (Join-Path $ClaudeDir "mcps\ai-agents\server.js")    -Force
    Copy-Item (Join-Path $mcpAgents "package.json")  (Join-Path $ClaudeDir "mcps\ai-agents\package.json") -Force
    $wisdomDest = Join-Path $ClaudeDir "mcps\ai-agents\wisdom.json"
    if (-not (Test-Path $wisdomDest)) {
        Copy-Item (Join-Path $mcpAgents "wisdom.json") $wisdomDest -Force
    }
    Copy-Item (Join-Path $mcpOpenapi "server.js")    (Join-Path $ClaudeDir "mcps\openapi\server.js")    -Force
    Copy-Item (Join-Path $mcpOpenapi "package.json")  (Join-Path $ClaudeDir "mcps\openapi\package.json") -Force

    # MCP 글로벌 의존성
    Push-Location (Join-Path $ClaudeDir "mcps\ai-agents"); npm install --silent 2>&1 | Out-Null; Pop-Location
    Push-Location (Join-Path $ClaudeDir "mcps\openapi");   npm install --silent 2>&1 | Out-Null; Pop-Location
    Write-Success "MCP 서버 글로벌 설치 완료"

    # Commands
    Write-Step "/orchestration 커맨드 설치..."
    Copy-Item (Join-Path $OrchestrationDir "commands\orchestration.md") (Join-Path $ClaudeDir "commands\orchestration.md") -Force
    Write-Success "/orchestration v5.3 설치 완료"

    # Skills (번들)
    Write-Step "번들 스킬 복사..."
    $bundledSkills = @("frontend-ui-ux", "git-master", "agent-browser")
    foreach ($skill in $bundledSkills) {
        $src = Join-Path $OrchestrationDir "skills\$skill"
        $dest = Join-Path $ClaudeDir "skills\$skill"
        if (Test-Path $src) {
            if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest -Force | Out-Null }
            Copy-Item "$src\*" $dest -Recurse -Force 2>$null
            Write-Success "$skill 스킬 복사 완료"
        }
    }

    # Plugins
    Write-Step "claude-dashboard 플러그인 복사..."
    $dashboardSrc = Join-Path $ScriptDir "packages\claude-dashboard"
    if (Test-Path $dashboardSrc) {
        Copy-Item $dashboardSrc (Join-Path $ClaudeDir "plugins\claude-dashboard") -Recurse -Force
        Write-Success "claude-dashboard 복사 완료"
    }

    # settings.json
    Write-Step "settings.json 확인..."
    $settingsFile = Join-Path $ClaudeDir "settings.json"
    if (Test-Path $settingsFile) {
        Write-Info "settings.json이 이미 존재합니다. MCP 서버 설정을 확인하세요."
    } else {
        $claudeDirUnix = $ClaudeDir -replace '\\', '/'
        $settingsContent = @"
{
  "mcpServers": {
    "ai-agents": {
      "command": "node",
      "args": ["$claudeDirUnix/mcps/ai-agents/server.js"],
      "env": {}
    },
    "openapi": {
      "command": "node",
      "args": ["$claudeDirUnix/mcps/openapi/server.js"]
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
"@
        Set-Content -Path $settingsFile -Value $settingsContent -Encoding UTF8
        Write-Success "settings.json 생성 완료"
    }

    Write-Host ""

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Phase 4: Codex/Gemini 글로벌 설정
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
    Write-Phase "Phase 4: Codex/Gemini 글로벌 설정"
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
    Write-Host ""

    $codexDir  = Join-Path $env:USERPROFILE ".codex"
    $geminiDir = Join-Path $env:USERPROFILE ".gemini"

    $codexTemplate  = Join-Path $OrchestrationDir "templates\CODEX.global.md"
    $geminiTemplate = Join-Path $OrchestrationDir "templates\GEMINI.global.md"

    if ((Test-Path $codexDir) -and (Test-Path $codexTemplate)) {
        Copy-Item $codexTemplate (Join-Path $codexDir "AGENTS.md") -Force
        Write-Success "Codex 글로벌 설정 배포 완료 (~/.codex/AGENTS.md)"
    } else {
        Write-Info "~/.codex/ 미존재 또는 템플릿 없음. codex CLI 먼저 실행 필요."
    }

    if ((Test-Path $geminiDir) -and (Test-Path $geminiTemplate)) {
        Copy-Item $geminiTemplate (Join-Path $geminiDir "GEMINI.md") -Force
        Write-Success "Gemini 글로벌 설정 배포 완료 (~/.gemini/GEMINI.md)"
    } else {
        Write-Info "~/.gemini/ 미존재 또는 템플릿 없음. gemini CLI 먼저 실행 필요."
    }

} else {
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 로컬 모드: 프로젝트 .claude/ 설정
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
    Write-Phase "Phase 3: 프로젝트 로컬 설정 (.claude/)"
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
    Write-Host ""

    $projectClaude = Join-Path $ScriptDir ".claude"
    New-Item -ItemType Directory -Path (Join-Path $projectClaude "commands") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $projectClaude "skills")   -Force | Out-Null

    Copy-Item (Join-Path $OrchestrationDir "commands\orchestration.md") (Join-Path $projectClaude "commands\orchestration.md") -Force
    Write-Success "/orchestration 커맨드 설치 완료"

    foreach ($skill in @("frontend-ui-ux", "git-master", "agent-browser")) {
        $src = Join-Path $OrchestrationDir "skills\$skill"
        $dest = Join-Path $projectClaude "skills\$skill"
        if (Test-Path $src) {
            if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest -Force | Out-Null }
            Copy-Item "$src\*" $dest -Recurse -Force 2>$null
            Write-Success "$skill 스킬 복사 완료"
        }
    }

    Write-Info "로컬 모드: 이 프로젝트 디렉토리에서만 /orchestration 사용 가능"
}

Write-Host ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 5: 설치 확인
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Phase "Phase 5: 설치 확인"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""

Write-Host "설치된 CLI 도구:" -ForegroundColor Cyan
if (Get-Command olympus -ErrorAction SilentlyContinue) { Write-Success "olympus"  } else { Write-Warn "olympus 미등록" }
if (Get-Command claude  -ErrorAction SilentlyContinue) { Write-Success "claude"   } else { Write-Warn "claude 미설치" }
if (Get-Command gemini  -ErrorAction SilentlyContinue) { Write-Success "gemini"   } else { Write-Info "gemini (선택)" }
if (Get-Command codex   -ErrorAction SilentlyContinue) { Write-Success "codex"    } else { Write-Info "codex (선택)" }

Write-Host ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 완료
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Write-Host ""
Write-Host "================================================================" -ForegroundColor Magenta
if ($Mode -eq "local") {
    Write-Host "    Olympus + AIOS v5.3 로컬 설치 완료!" -ForegroundColor Green
} else {
    Write-Host "    Olympus + AIOS v5.3 전역 설치 완료!" -ForegroundColor Green
}
Write-Host "================================================================" -ForegroundColor Magenta
Write-Host ""

Write-Host "사용 방법:" -ForegroundColor Green
Write-Host ""
Write-Host "   olympus                        # Claude CLI 실행"
Write-Host "   olympus server start            # Gateway + Dashboard + Telegram"
Write-Host "   /orchestration `"작업 설명`"     # Multi-AI 10 Phase 프로토콜"
Write-Host ""

Write-Host "문제 발생 시:" -ForegroundColor Yellow
Write-Host "   olympus 명령이 인식되지 않으면:" -ForegroundColor Yellow
Write-Host "   cd packages\cli && npm link" -ForegroundColor White
Write-Host ""
