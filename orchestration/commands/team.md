---
description: Team Engineering Protocol v4.0 — AI Agent Teams 공식 인프라 + Git Worktree 격리 + MCP 3중 검증 + DAG 병렬 실행
---

[TEAM ENGINEERING PROTOCOL v4.0 ACTIVATED]

$ARGUMENTS

## Overview

Team Engineering Protocol v4.0은 Claude Code **AI Agent Teams** 공식 인프라와 **Git Worktree 격리**를 완전 통합합니다. 파일 소유권 분리 + WI-level DAG 병렬 실행 + 스트리밍 Reconciliation으로 충돌 없는 병렬 개발을 구현합니다.

> **On-Demand agents UNLOCKED**: architect, analyst, planner, designer, researcher, code-reviewer, verifier, qa-tester, vision, test-engineer, build-fixer, git-master, api-reviewer, performance-reviewer, security-reviewer, style-reviewer

### Core Architecture

| Component | Role |
|-----------|------|
| **Team Lead** | 지시·검토·책임·일관성·조율·정보취합 전담. **⛔ 파일 수정·git 상태 변경·직접 구현 절대 금지.** 허용: TaskCreate/Update/List, SendMessage, Read(파일 읽기), 빌드/테스트 출력 확인(검토 목적), 사용자 보고. |
| **Teammates** | **[DIRECTED 모드]** 1 WI = 1 팀원. 재사용 금지. WI 완료 보고 후 즉시 종료(shutdown). 다음 WI = 새 팀원 spawn. **[AUTO 모드]** 팀원이 TaskList에서 자율 클레임. WI 완료 후 다음 WI 자율 클레임 가능(재사용 허용). |
| **Task List** | `~/.claude/tasks/{team-name}/` — WI-level DAG, addBlockedBy → 자동 해제 |

**핵심 원칙**: 자동 머지나 파일 잠금 대신, **작업 설계로 파일 충돌을 원천 차단**합니다.

---

## Quick Reference

| 단계 | 핵심 행동 | 금지 |
|------|---------|------|
| **Step 0** | 환경변수 확인 → 규모 평가 → Micro면 즉시 종료 | TeamCreate 전 Micro 작업 처리 |
| **Step 1** | 요구사항 추출 → analyst+explore 병렬 → .team/requirements.md | 확인 없이 모호한 R# 진행 |
| **Step 2** | planner DAG → File Ownership Matrix → ownership.json | CONFLICT 해소 전 Step 3 진입 |
| **Step 3** | TeamCreate → TaskCreate(전체) → Lean Task Description (`.team/` 파일 참조) → [AUTO] 자율 클레임 / [DIRECTED] 직접 spawn | Task Description에 codebase 컨텍스트 인라인 삽입 |
| **Step 5** | WI 완료 수신 → C-1 검증 → [AUTO] 다음 클레임 허용 / [DIRECTED] shutdown→새spawn → worktree WI는 git-master 백그라운드 머지 자동 트리거 | 리더가 파일/git 직접 수정 |
| **Step 6** | code-reviewer + style-reviewer 병렬 → 조건부 전문 리뷰어 | vision 없이 dogfood 중복 실행 |
| **Step 8** | 웹앱→dogfood 스킬, CLI→qa-tester Task | 증거 없이 PASS 판정 |
| **Step 9** | writer → git-master → 팀원 shutdown 확인 → TeamDelete | TeamDelete 전 팀원 미종료 |

**team-slug 명명 규칙**: 소문자 + 하이픈만 사용, 최대 32자. 예: `auth-login-fix`, `dashboard-ui-v2`

---

## A. Official Infrastructure (Claude Code AI Agent Teams)

> **팀 작업의 실제 동작 방식. 이를 이해해야 올바른 팀 설계가 가능합니다.**

### 스폰 메커니즘

팀메이트는 `Task` 도구에 `name`과 `team_name`을 추가하는 것으로 일반 서브에이전트와 구분됩니다:

```
# 일반 서브에이전트 (팀 외)
Task(subagent_type="executor", prompt="...")

# 팀메이트 (팀 소속) — 반드시 name + team_name 필수
Task(subagent_type="executor", name="executor-1", team_name="my-project", prompt="...")
```

**⚠️ 스폰은 순차적 (~6-7초/팀원)**. **1 WI = 1 팀원 원칙** — 팀원 재사용 절대 금지. WI 완료 → 해당 팀원 즉시 종료 → 다음 WI = 새 팀원 spawn.

| 백엔드 | 조건 | 특징 |
|--------|------|------|
| in-process | tmux 없을 때 (기본값) | 동일 터미널, Shift+Down으로 전환 |
| tmux | $TMUX 환경변수 감지 시 | 별도 split pane |
| iterm2 | it2 CLI 설치 시 | iTerm2 split pane |

### 파일시스템 스토리지 (공유 표면)

```
~/.claude/
├── teams/{team-name}/
│   ├── config.json           ← 팀 구성 (members 배열)
│   └── inboxes/
│       ├── {agent-name}.json ← 수신함 (메시지 저장)
│       └── ...
└── tasks/{team-name}/
    ├── {task-id}.json        ← 개별 태스크 파일
    └── ...
```

**태스크 파일 스키마**:
```json
{
  "id": "task-001",
  "subject": "Implement auth",
  "status": "pending",
  "owner": "executor-1",
  "blockedBy": ["task-000"],
  "activeForm": "Implementing auth"
}
```

**Claude Code 공식 인프라 기본 동작** (참고 — 원래 설계):
```
팀원 시작 → TaskList() → 미소유·미차단 태스크 클레임 → TaskUpdate(owner=self) → 작업
        → 완료 후 TaskUpdate(status="completed") → TaskList() → 다음 태스크 클레임
```

> **/team 프로토콜 실제 동작 (공식 동작 재정의)**: 자율 클레임 금지. 팀원은 스폰 시 프롬프트로 전달된 **단일 WI만** 수행. 완료 보고 → 리더 C-1 검증 → (수정 요청 가능) → shutdown_response 순으로 종료. `TaskList()` 자율 호출 및 다음 WI 클레임 **절대 금지**.

### 메시지 전달 (이벤트 드리븐)

메시지는 파일에 저장 후 XML 태그로 수신자 컨텍스트에 자동 주입됩니다:
```xml
<teammate-message teammate_id="executor-1">
  auth.ts 42번째 줄에서 버그 발견했습니다.
</teammate-message>
```

리드가 mid-turn이면 큐 대기 → 턴 끝날 때 자동 전달. **폴링 불필요**.

| 타입 | 용도 | 비용 |
|------|------|------|
| `message` | 특정 팀메이트 DM | 낮음 |
| `broadcast` | 전체 전송 | **높음** (N개 메시지 — 최소화) |
| `shutdown_request` | 종료 요청 (requestId 포함) | 낮음 |
| `shutdown_response` | 승인/거부 (approve: true/false) | 낮음 |
| `plan_approval_request/response` | plan_mode 팀메이트 구현 승인 | 낮음 |

### TeammateIdle Hook (선택적 연속성 보장)

팀메이트가 idle 진입 직전 실행. **미완료 태스크가 있을 때 idle을 차단**하는 용도:

```json
{
  "hook_event_name": "TeammateIdle",
  "teammate_name": "executor-1",
  "team_name": "my-project",
  "session_id": "abc123"
}
```

| exit code | 동작 |
|-----------|------|
| 0 | idle 허용 (정상) |
| 2 | idle 차단 → stderr 내용이 팀메이트 피드백으로 전달 |

### 공식 제한사항

```
⛔ in-process 팀메이트 /resume 불가
⛔ 중첩 팀 불가 (팀메이트가 TeamCreate 호출 불가)
⛔ 1 세션 = 1 팀
⚠️ 태스크 completed 표시 지연 가능 → SendMessage 완료 보고를 우선 신뢰
⚠️ 실험적 기능: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 환경변수 필요
```

---

## B. Git Worktree 격리 전략

> 파일 소유권 설계로 충돌이 해소되지 않는 WI에 대한 대안이자, 고위험 변경을 위한 안전장치입니다.

### 두 가지 실행 모드

**Mode A — Direct Edit** (기본):
- 팀원이 메인 레포에 직접 수정
- File Ownership Matrix로 충돌 방지
- 오버헤드 낮음, 대부분 WI에 적합

**Mode B — Worktree Isolation** (고위험 WI):
```
Task(
  subagent_type="build-fixer",
  name="build-fixer-1",
  team_name="{task-slug}",
  isolation="worktree",      # 격리된 git worktree에서 실행
  prompt="..."
)
```
- 팀원이 `~/.claude-worktrees/{name}` 브랜치에서 독립 작업
- 변경사항 없으면 자동 삭제, 있으면 브랜치로 보존
- 완료 후 리더가 브랜치를 메인에 머지

### 워크트리 격리 사용 기준

| 사용 O | 사용 X |
|--------|--------|
| 대규모 리팩토링 (10+ 파일 변경) | 소규모 수정 (1-3 파일) |
| 실험적 빌드/컴파일 수정 | File Ownership으로 격리된 WI |
| 파일 충돌 해소 불가능한 경우 | 단순 기능 추가 |
| 파괴적 변경 (파일 삭제/이동) | 빠른 피드백이 중요한 경우 |

### 워크트리 격리 라이프사이클

```
Task(isolation="worktree") 호출
    │
    ▼
git worktree add ~/.claude-worktrees/{name} -b worktree-{name}
    │
    ▼
[팀원 격리 환경에서 작업 + 커밋]
    │
    ▼
SendMessage → 리더에게 브랜치명 + 변경 요약 보고
    │
    ├─ 변경 없음 → 자동 삭제 (worktree + branch)
    └─ 변경 있음 → 브랜치 보존
                   → 리더가 `git-master` 비팀원 Task에 머지 위임
```

**머지 처리 → `git-master` 비팀원 Task로 위임** (리더는 git 상태 변경 금지):
```
Task(
  subagent_type="git-master",
  # team_name 없음 — 팀원 아닌 독립 Task
  prompt="[Worktree Merge] 브랜치: worktree-{name}
1. git diff main...worktree-{name}  # 변경 내용 확인 후 요약 보고
2. git merge worktree-{name} --no-ff -m 'feat: WI-N merged from worktree'
3. git worktree remove ~/.claude-worktrees/{name}
4. git branch -d worktree-{name}
완료 후 머지 결과(충돌 여부, 변경 파일 목록) 보고."
)
```

**동시 워크트리 머지 충돌 처리**:
여러 워크트리 팀원이 동시에 완료 보고 시, 리더는 **순차 머지**를 적용합니다:
```
1. 완료 보고 순서대로 머지 큐 관리 (먼저 보고한 WI 우선)
2. 첫 번째 워크트리 머지 → 성공 확인
3. 두 번째 워크트리 머지 시 충돌 발생:
   → git status로 충돌 파일 확인
   → 충돌 파일이 두 WI의 OWNED FILES 모두에 속하면
      → WI 설계 오류 (Step 2-3C Conflict Resolution 누락)
      → git merge --abort + 해당 팀원에게 충돌 해소 지시
   → 충돌 파일이 SHARED에 속하면
      → git-master Task에 충돌 해소 위임:
        "worktree-{A}와 worktree-{B} 머지 중 {file} 충돌. SHARED 파일이므로
         양쪽 변경을 병합하여 충돌 해소 후 git add && git merge --continue 실행."
4. 워크트리별 순차 완료 후 cleanup
```

> **예방**: Step 2-3C Conflict Resolution이 완전하다면 워크트리 간 충돌은 발생하지 않아야 합니다. 충돌 발생 자체가 Step 2 설계 오류의 신호입니다.

**⚠️ 알려진 버그** (GitHub #26725): 비정상 종료 시 워크트리 잔류. 수동 정리:
```bash
git worktree list
git worktree remove ~/.claude-worktrees/{name} --force
```

---

## Agent Roster (19 custom agents in `.claude/agents/`)

> **반드시 커스텀 에이전트 이름을 `subagent_type`으로 사용하세요.** 모델, 도구 제한, 전문 지침이 적용됩니다.

Steps 1-2: `Task(subagent_type="{agent-name}")` — 팀 생성 전, 개별 Task 호출.
Step 3~: `Task(subagent_type="{agent-name}", team_name=..., name="{agent-name}-{N}")` — 팀원 생성.

| Agent (= subagent_type) | Model | Write? | Role | 호출 시점 | 사용 스킬/플러그인 |
|--------------------------|-------|:------:|------|----------|--------------------|
| **explore** | Haiku | ❌ | 코드베이스 검색 | Step 1-2 (Task) | — |
| **analyst** | Opus | ❌ | 요구사항 분석 | Step 1 (Task) | — |
| **planner** | Opus | ❌ | DAG 설계 | Step 2 (Task) | — |
| **architect** | Opus | ❌ | 아키텍처 설계 (READ-ONLY) | Step 2, 4, Circuit Breaker | — |
| **researcher** | Sonnet | ❌ | 외부 문서/API 조사 | Step 2 (Task/Team) | — |
| **designer** | Sonnet | ✅ | UI/UX 설계 + 구현 | Step 3→5 (Team) | **`frontend-design`** 스킬 (미적 방향) |
| **executor** | Opus | ✅ | 범용 구현 실행 | Step 3→5 (Team) | — |
| **test-engineer** | Sonnet | ✅ | 테스트 작성 (TDD) | Step 3→5 (Team) | — |
| **build-fixer** | Sonnet | ✅ | 빌드/컴파일 에러 해결 | Step 3→5 (Team) | — |
| **git-master** | Sonnet | ✅ | Git 커밋/리베이스 | Step 3, 9 (Team) | — |
| **code-reviewer** | Opus | ❌ | 2-Stage 코드 리뷰 | Step 6 (Task) | — |
| **style-reviewer** | Haiku | ❌ | 코드 스타일/컨벤션 | Step 6 (Task) | — |
| **api-reviewer** | Sonnet | ❌ | API 계약/호환성 | Step 6 (Task, 조건부) | — |
| **security-reviewer** | Opus | ❌ | 보안 취약점 (OWASP) | Step 6 (Task, 조건부) | — |
| **performance-reviewer** | Sonnet | ❌ | 성능/복잡도 | Step 6 (Task, 조건부) | — |
| **vision** | Sonnet | ❌ | 시각적 검증 | Step 6 (Task, 조건부) | `agent-browser` 스크린샷 |
| **verifier** | Sonnet | ❌ | 스펙 충족 검증 | Step 7 (Task) | — |
| **qa-tester** | Sonnet | ❌ | 웹앱/CLI/서비스 테스트 | Step 8 (Task) | **`dogfood`** 스킬 (웹앱), CLI 캡처 (서비스) |
| **writer** | Sonnet | ✅ | 문서화 | Step 9 (Task) | — |

### Cross-cutting Mechanisms

**Circuit Breaker** — 어떤 Step에서든 동일 이슈 수정 실패 시:
- 실패마다 `TaskUpdate(taskId, metadata: { "failCount": N, "lastError": "..." })` 영구 기록
- **failCount ≥ 3** → `architect` escalate (R# 원문 + 실패 로그 3건)
- Architect 판단: 접근법 변경 / 부분 수정 / 근본 한계 → 사용자 보고
- 같은 접근법 3회 이상 반복 금지

**File Ownership Invariant** — 동일 시점에 1파일 = 최대 1팀원. SHARED 파일은 전담 팀원(ownership.json의 "SHARED" 항목 담당자)만 수정. **리더는 직접 수정 금지.** 충돌 해소 불가 시 → `isolation="worktree"`.

> ⚠️ **소유권 강제는 기술적이 아닌 프롬프트 기반(honor system)**입니다. 팀원이 OWNED 외 파일을 수정해도 시스템이 막지 않으며, Phase C-1 검증에서 사후 감지됩니다. 소유권 위반이 발견되면 `git checkout -- {file}`로 해당 파일을 되돌리고 작업이 손실됩니다. **WI 설계 단계에서 파일 충돌을 완전히 해소하는 것이 가장 중요한 예방책**입니다.

**Teammate Crash Recovery** — 팀원 무응답 시:
1. 30초 무응답 → `SendMessage` 재시도
2. 60초 무응답 → 새 팀원 spawn (동일 subagent_type) + 동일 WI 재할당
3. 이전 팀원의 부분 수정 정리: **교체 팀원 Task Description에 포함** (리더는 git 금지)

> **교체 팀원 Task Description — RECOVERY CONTEXT 필수 포함**:
> ```
> ━━━ RECOVERY CONTEXT ━━━
> 이 WI는 이전 팀원 비정상 종료로 재할당되었습니다.
> failCount: {TaskGet(taskId).metadata.failCount}
> failCount ≥ 3이면 구현하지 말고 즉시 SendMessage("lead", "Circuit Breaker 발동") 후 대기.
>
> [첫 번째 작업] 이전 팀원의 부분 변경 초기화:
> git checkout -- {OWNED_FILES 목록}
> git clean -fd {OWNED_DIRS} (신규 파일 있는 경우)
> 초기화 확인 후 WI 작업 시작.
> ```

**Task Status Reliability** — `completed` 표시 지연 가능:
- SendMessage 완료 보고 수신 시 → 리더가 `TaskUpdate(status="completed")` 명시적 처리
- TaskList 결과 ≠ SendMessage 메시지 → SendMessage 내용 우선

---

## Step 0: Session Setup & Skill Discovery

### 0-0. 진입 조건 확인 (FIRST — 실패 시 즉시 중단)

```bash
# TeamCreate는 실험적 기능 — 환경변수 없으면 동작하지 않음
echo "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS}"
```

- **값이 `1`** → 계속 진행
- **값이 비어있거나 없음** → 사용자에게 보고 후 중단:

```
❌ Team Engineering Protocol 시작 불가

TeamCreate는 실험적 기능입니다. 아래 환경변수를 설정하세요:

  export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

설정 후 다시 /team 명령어를 실행해 주세요.
```

### 0-0.5. Task Scale Evaluation (Micro → 즉시 종료)

**TeamCreate 전** 작업 규모를 평가합니다. Micro 작업은 /team이 과도합니다.

| 규모 | 기준 | 처리 |
|------|------|------|
| **Micro** | 파일 1-2개, 요구 1-2개, 명확한 버그 수정/변수명 수정 | **⛔ /team 중단 → 직접 구현** |
| **Small** | WI 3개 이하, 단일 레이어 변경 | /team 진행 (Fast-Path) |
| **Medium+** | WI 4개 이상, 다중 레이어, 신규 기능 | /team 전체 프로토콜 |

**Micro 판정 시**: TeamCreate/spawn 없이 바로 구현 후 사용자 보고:
```
이 작업은 Micro 규모입니다 (파일 1개, 변경 1줄).
/team 프로토콜 없이 직접 구현합니다 — LLM 호출 20+회 절약.
```

**실행 모드 결정** (Small+ 작업):

| 모드 | 조건 | 팀원 동작 | 장점 |
|------|------|---------|------|
| **AUTO** | WI ≤ 3 + 파일 충돌(CONFLICT) 없음 + worktree WI 없음 | TaskList 자율 클레임. WI 완료 후 다음 WI 자율 클레임(재사용 허용). 자율 종료 가능. | spawn 오버헤드 최소화. 공식 Claude Code 설계 활용. |
| **DIRECTED** | WI ≥ 4 또는 CONFLICT 있음 또는 worktree WI 존재 | 리더가 직접 spawn + WI 할당. 1 WI = 1 팀원. 재사용 금지. | 세밀한 소유권 통제. 고위험 변경 안전 격리. |

> 모드는 Step 2-3A (File Ownership Matrix) 완료 후 확정. 이후 모든 Step은 해당 모드 규칙을 따름.
> 모드 표기: 이후 지침에서 `[AUTO]` / `[DIRECTED]` 표기로 분기.

**MCP/도구 의존성 사전 확인** (Small+ 작업):
```bash
# ai-agents MCP 활성 확인 (Step 1-4 B/C에 필요)
# settings.json 또는 settings.local.json에서 확인
(cat ~/.claude/settings.json ~/.claude/settings.local.json 2>/dev/null) | grep -q '"ai-agents"' && echo "ai-agents MCP: ✅" || echo "ai-agents MCP: ❌ (Step 1-4 B/C 생략, Coverage Check만)"

# dogfood 스킬 확인 (Step 8 웹앱 QA에 필요)
ls ~/.claude/skills/ 2>/dev/null | grep -q dogfood && echo "dogfood: ✅" || echo "dogfood: ❌ (Step 8에서 webapp-testing으로 대체)"

# agent-browser 스킬 확인 (Step 6-3 vision 에이전트 스크린샷에 필요)
ls ~/.claude/skills/ 2>/dev/null | grep -q agent-browser && echo "agent-browser: ✅" || echo "agent-browser: ❌ (Step 6-3 vision 건너뜀)"
```

미설치 도구가 있어도 중단하지 않습니다 — 해당 단계에서 대체 방법으로 처리합니다.

### 0-1. Proactive Skill & Plugin Discovery (Small+ 작업)

```
Skill("find-skills", args="{사용자 요구사항의 핵심 도메인 키워드}")
```

> **find-skills 미설치 시**: Skill() 호출 실패해도 중단하지 않습니다. 아래 도메인 신호 표를 직접 참조하여 활성화할 스킬/에이전트를 판단 후 계속 진행합니다.

| 도메인 신호 | 활성화 대상 |
|------------|------------|
| React/Next.js/UI | `frontend-ui-ux` 스킬, `vercel-react-best-practices`, `ui-ux-pro-max`, `designer` |
| CSS/디자인/컴포넌트 | **`frontend-design` 스킬** (bold aesthetic), `ui-ux-pro-max`, `designer` |
| DB/PostgreSQL | `postgres-best-practices` |
| API/REST/GraphQL | `codex_analyze` MCP, `api-reviewer` |
| 테스트/단위 | `webapp-testing` 스킬, `test-engineer` |
| **웹앱 QA/버그 탐색** | **`dogfood` 스킬** (브라우저 탐색+재현 증거), `agent-browser`, `qa-tester` |
| Git/커밋 | `git-master` 스킬/에이전트 |
| 브라우저 자동화 | `agent-browser` 스킬 |
| 문서 작성 | `doc-coauthoring` 스킬, `writer` |
| 성능/보안 | `performance-reviewer`, `security-reviewer` |

### 0-2. 상태 디렉토리 생성

```bash
mkdir -p .team && grep -qxF '.team/' .gitignore 2>/dev/null || echo '.team/' >> .gitignore
```

### 0-3. 비용 추정 + 사전 동의

규모를 알면 예상 비용과 소요 시간을 계산합니다. **사용자에게 보고 후 '진행해줘' 응답을 받고 시작합니다.**

**에이전트별 단가 기준** (참고값 — 실제 입력 길이에 따라 변동):

| 에이전트 | 모델 | 단가 기준 |
|---------|------|---------|
| analyst, architect, code-reviewer, security-reviewer | Opus | ~$0.08~0.15/호출 |
| planner | Opus | ~$0.10~0.20/호출 |
| 팀원(executor/designer/test-engineer) | Opus/Sonnet | ~$0.10~0.40/WI |
| explore, style-reviewer | Haiku | ~$0.01/호출 |
| MCP (ai_team_analyze 등) | 외부 | ~$0 (별도 과금) |

**규모별 예상 비용 + 시간**:

| 규모 | WI 수 | 예상 비용 | 예상 시간 |
|------|-------|---------|---------|
| Small (AUTO) | 2~3 | $0.30~0.60 | 15~30분 |
| Medium (DIRECTED) | 4~6 | $0.80~1.50 | 40~70분 |
| Large (DIRECTED) | 7+ | $1.50~3.00+ | 90분+ |

**사용자 보고 형식**:
```
[{team-slug}] 비용 추정
━━━━━━━━━━━━━━━━━━━━━━━
모드: {AUTO / DIRECTED}
WI: {N}개 / 팀원: {N}명
━━━━━━━━━━━━━━━━━━━━━━━
준비 단계  analyst+explore+planner  ~$0.30
실행 단계  팀원 {N}명               ~$0.40~0.80
검증 단계  code-reviewer+verifier   ~$0.25
QA 단계    dogfood/qa-tester        ~$0.05
━━━━━━━━━━━━━━━━━━━━━━━
예상 총비용: $0.80~1.20
예상 소요:   40~60분
━━━━━━━━━━━━━━━━━━━━━━━
계속하려면 '진행해줘'로 알려주세요.
```

> **Large 작업**: 비용이 $2.00를 넘을 것으로 예상되면 반드시 사용자 확인 후 진행.
> **Small/AUTO**: 비용 추정 생략 가능 — "$0.50 미만 예상, 바로 시작합니다" 한 줄 보고 후 진행.

**스폰 시간**: 계획 팀원 수 × 7초. **스폰 중 다른 작업 불가** — `Task` 도구 호출은 블로킹.

> **Early Spawn 전략**: 모든 WI 설계가 끝날 때까지 기다리지 않습니다. DAG에서 독립 WI (blockedBy 없음) 설계가 완료되는 즉시 spawn을 시작합니다.
> ```
> [일반 방식] 준비 30분 완료 → spawn 시작 → 팀원 작업
> [Early Spawn] WI-1 설계 완료 → WI-1 spawn → WI-2 설계 완료 → WI-2 spawn → ... (병렬)
> ```
> **전제**: WI의 OWNED FILES, Task Description이 완성된 경우에만 Early Spawn 가능. MCP 제안(Step 2-5)은 해당 WI spawn 전에 반드시 완료해야 함.

---

## Step 1: Requirement Registry (MANDATORY — ZERO LOSS TOLERANCE)

> **작업 규모에 따른 Fast-Path 적용**:
>
> | 규모 | 기준 | 검증 방식 |
> |------|------|----------|
> | **Micro** | 파일 1-2개, 요구 1-2개, 명확한 버그 수정 | Coverage Check만 (1-2, 1-3, 1-4 B·C 생략 가능) |
> | **Small** | WI 3개 이하, 단일 레이어 | 1-3 (analyst+explore) + 1-4 A (Coverage) |
> | **Medium+** | WI 4개 이상, 다중 레이어, 신규 기능 | 전체 3중 검증 필수 |
>
> 사용자에게 확인을 묻지 않습니다. 검증 결과로 자동 확정합니다.

### 1-0. 원문 아카이브 (FIRST ACTION)

```bash
cat > .team/user-input.md << 'ORIGINAL_EOF'
{$ARGUMENTS 전문}
ORIGINAL_EOF
```

### 1-1. 입력 분류 & 해석

| 입력 형태 | 해석 방법 |
|-----------|----------|
| 명확한 요구 리스트 | 각 항목을 R#으로 직접 매핑 |
| 모호한 설명 | 의도 파악 → 구체적 요구로 변환 |
| 에러로그/스택트레이스 | 로그 분석 → 수정 대상 도출 |
| 스크린샷/참조 | 시각적/맥락적 분석 → 요구 도출 |

**R# 설명 기준**: 완료 여부를 판정할 수 있는 문장.
- ❌ `에러 고치기` (모호)
- ✅ `auth.ts:42의 null 참조 TypeError 수정` (검증 가능)

### 1-2. 요구사항 개별 추출

```
| R# | 요구사항 | 근거 | 유형 |
|----|---------|------|------|
| R1 | ...     | 원문: "..." | explicit |
| R6 | ...     | R1+R5에서 파생 | implicit |
```

### 1-3. `analyst` + `explore` — 병렬 심층 분석

> `/team` 명령어로 진입한 경우 **On-Demand agents(analyst, explore, planner 등 16개)가 이미 UNLOCKED** 상태입니다. `/agents --enable` 없이 바로 호출 가능합니다.

동시에 Task 호출:
- **`Task(subagent_type="analyst")`**: 누락 요구 발굴, 충돌 감지, 모호한 R# 구체화
- **`Task(subagent_type="explore")`**: 관련 파일/함수/패턴 조사, 수정 대상 파일 사전 식별

### 1-4. MCP 3중 검증 (자동 — 사용자 확인 대체)

#### A. Coverage Check
원문 vs R# 리스트 대조. 미커버 요구 > 0 → R# 추가 후 재검증.

#### B. `ai_team_analyze` MCP — 양면 검증
```
ai_team_analyze(
  prompt: "요구사항 리스트 검증: 누락/충돌/실현불가/과도한 해석 → [OK]/[WARN]/[ADD] 판정",
  context: "원문 + R# 테이블 + analyst/explore 결과"
)
```
- `[ADD]` → implicit로 추가
- `[WARN]` → R# 설명 구체화
- `[OK]` → 확정

#### C. `delegate_task` MCP — 도메인별 교차 검증 (조건부)
- UI R# → `gemini_analyze`
- API/인프라 R# → `codex_analyze`

#### D. 사용자 확인 트리거 (자동 확정 예외)

아래 조건 중 하나라도 해당하면 자동 확정 **금지** — 사용자에게 R# 목록 제시 후 승인 대기:

| 트리거 | 기준 |
|--------|------|
| `[ADD]` implicit R# > 2개 | 원문에 없는 요구가 3개 이상 추론됨 → 의도 확인 필요 |
| `[WARN]` R# 비율 > 30% | R# 중 30% 이상이 불명확 → 오해 위험 |
| implicit R# 비율 > 40% | 전체 R# 중 40% 이상이 추론 기반 |
| 원문 자체가 모호 (1-1 분류: "모호한 설명") | 의도 파악 자체가 불확실 |

```
# 사용자 확인 보고 형식
현재 추출된 요구사항:
| R# | 요구사항 | 유형 |
위 R# 목록이 의도와 맞으면 '진행해줘'로 알려주세요.
수정이 필요하면 구체적으로 알려주세요.
```

> 단순 명확 요청(Micro/Small Fast-Path)에서는 트리거 조건을 만족해도 생략 가능.

### 1-5. 확정 Registry 저장

```bash
cat > .team/requirements.md << 'EOF'
# Requirement Registry (확정됨 — 이후 모든 단계의 유일한 기준)
| R# | 요구사항 | 근거 | 유형 | 관련 파일 |
|----|---------|------|------|----------|
EOF
```

**이후 모든 단계는 오직 `.team/requirements.md`만 참조합니다.**

---

## Step 2: Work Decomposition (Traceable DAG)

> **R#에 매핑되지 않은 Work Item = 삭제. Work Item에 매핑되지 않은 R# = WI 추가 필수.**

### 2-1. `Task(subagent_type="planner")` — 작업 분해

> **Step 1 explore/analyst 결과를 `.team/codebase-context.md`에 저장합니다.** 팀원은 startup 시 이 파일을 직접 읽습니다 — Task Description에 인라인 삽입 금지.
> ```bash
> cat > .team/codebase-context.md << 'EOF'
> # Codebase Context (Step 1 explore 결과)
> ## 관련 파일
> {explore 결과 — 파일 경로 + 역할}
> ## 기존 패턴
> {naming, error handling, import style, test pattern}
> ## 주의사항
> {수정 시 주의할 의존성, 기존 로직}
> EOF
> ```

`.team/requirements.md` + explore 결과 전달:
- **Feature Sets**: Name, acceptance criteria, `Traced Requirements: R#`, Priority (P0-P3), Complexity (S/M/L/XL)
- **Work Items by Layer**: UI / Domain / Infra / Integration
- 각 Work Item에 `Fulfills: R#, R#` 필드 필수
- **Early Spawn 대상 표기**: planner에게 "blockedBy 없는 WI는 `[EARLY]` 태그 표기"를 요청. `[EARLY]` WI는 Step 2-3 완료 즉시 spawn 가능.

```
[planner 출력 예시]
WI-1 [EARLY] — 소셜 로그인 UI (designer)  ← blockedBy 없음 → 설계 완료 즉시 spawn
WI-2 [EARLY] — OAuth 백엔드 (executor)    ← blockedBy 없음 → 설계 완료 즉시 spawn
WI-3         — 연동 (executor)             ← blockedBy: WI-1, WI-2 → WI-1+2 완료 후 spawn
```

### 2-2. Traceability Matrix (MANDATORY)

```
| R# | 요구사항 | Work Item(s) | Status |
|----|---------|-------------|--------|
| R1 | ...     | WI-1, WI-3  | ✅ Covered |
| R5 | ...     | (없음)       | ❌ MISSING → WI 추가 필수 |
```

❌ MISSING이 하나라도 있으면 WI 추가 후 진행.

### 2-3. File Ownership Analysis

#### A. File Ownership Matrix (MANDATORY)

```
| 파일                   | WI-1 | WI-2 | WI-3 | Owner |
|------------------------|:----:|:----:|:----:|-------|
| src/api/auth.ts        | ✏️  |      |      | WI-1  |
| src/models/user.ts     | ✏️  |      | ✏️  | ⚠️ CONFLICT |
```

**`.team/ownership.json`이 유일한 소유권 기준입니다.** Task Description의 OWNED/SHARED 목록은 이 파일에서 자동 생성됩니다 (Step 3-4 참조):
```json
{
  "SHARED": ["src/types/index.ts"],
  "WI-1": ["src/api/auth.ts"],
  "WI-2": ["src/components/Login.tsx"]
}
```

> ⚠️ Task Description에 OWNED/SHARED를 수동으로 입력하지 마세요. 반드시 ownership.json의 해당 WI 항목을 읽어서 채웁니다. 수동 입력 시 불일치가 발생하면 C-1 소유권 검증이 잘못된 기준으로 실행됩니다.

#### B. Shared File Zone

2+ WI가 수정하는 타입 정의/공통 설정/barrel export → `"SHARED"` 분류.

**SHARED 파일 전담 WI 지정 (MANDATORY)**:
```
1. SHARED 파일이 발생하면 → "WI-SHARED" Work Item을 별도 생성
2. WI-SHARED는 SHARED 파일 전담 수정 담당
3. 타이밍 선택 기준 (둘 중 하나 선택):

   [Option A — WI-SHARED 먼저] SHARED 파일이 다른 WI들의 타입/인터페이스 의존성인 경우
   → WI-1, WI-2 등이 blockedBy WI-SHARED로 설정
   → planner가 WI-SHARED Task Description에 예상 타입 목록 미리 포함

   [Option B — WI-SHARED 나중] SHARED 파일이 취합/통합(배럴 export, 설정 통합 등)인 경우
   → WI-SHARED가 blockedBy WI-1, WI-2 등으로 설정
   → WI-1, WI-2 완료 후 필요한 변경 내용을 수집하여 WI-SHARED가 통합

```
ownership.json 반영:
```json
{
  "SHARED": ["src/types/index.ts"],
  "SHARED_OWNER": "WI-SHARED",
  "WI-1": ["src/api/auth.ts"],
  "WI-2": ["src/components/Login.tsx"],
  "WI-SHARED": ["src/types/index.ts"]
}
```

**SHARED 수정 요청 흐름**:
```
팀원(WI-N) → SHARED 수정 필요 발견
  → SendMessage("lead", "WI-SHARED에게 {파일}의 {변경내용} 요청 전달 바람")
  → 리더가 WI-SHARED 팀원 spawn 시 Task Description에 포함 (또는 이미 실행 중이면 SendMessage 전달)
```

**동시 SHARED 요청 처리** (여러 팀원이 동시에 SHARED 수정 요청 시):
```
리더가 수신한 요청들을 큐에 취합:
  [WI-1 요청] src/types/index.ts: AuthUser에 role 필드 추가
  [WI-2 요청] src/types/index.ts: LoginPayload에 rememberMe 추가
  → 두 변경을 하나의 커밋으로 묶어 WI-SHARED 팀원 Task Description에 포함:
    "SHARED 변경 취합: AuthUser.role 추가 + LoginPayload.rememberMe 추가
     모두 구현 후 WI-1, WI-2 팀원에게 SendMessage('완료') 알림"
  → WI-SHARED 완료 → WI-1, WI-2 팀원들 작업 재개
```

팀원이 SHARED 파일을 직접 수정하면 소유권 위반 → C-1에서 감지됨.

#### C. Conflict Resolution

| 해결법 | 조건 | 방법 |
|--------|------|------|
| 직렬화 | 수정 범위 독립적 | `addBlockedBy`로 순서 강제 |
| 병합 | 수정 범위 밀접 | 두 WI를 하나로 통합 |
| 분할 | 파일 분리 가능 | 리팩토링 후 각 WI가 다른 파일 담당 |
| **워크트리 격리** | 충돌 해소 불가 | `isolation="worktree"` 적용 (섹션 B 참조) |

**⚠️ CONFLICT가 0이 될 때까지 Step 3 진입 불가.**

#### D. Dependency DAG

```
WI-1 ──→ WI-3 (auth.ts 의존)
WI-2 ──→ (없음, 즉시 시작)
→ t=0: WI-1, WI-2 동시 시작
→ WI-1 완료 즉시 WI-3 시작 (WI-2 완료 불필요)
```

비충돌 WI는 전부 즉시 시작. `addBlockedBy`로 개별 WI 간 의존성만 설정.

### 2-4. `Task(subagent_type="architect")` — Quality Gate

**Skip 기준**: 아래 모두 해당 시 생략 가능
- WI 3개 이하 (Small)
- 파일 충돌(CONFLICT) 없음
- worktree isolation WI 없음
- 아키텍처 신규 결정 없음 (기존 패턴 내 변경)

그 외(Medium+, CONFLICT 있음, worktree 포함, 신규 아키텍처) → MANDATORY.

DAG + File Ownership Matrix → CRITICAL/HIGH 이슈 해소 후 진행.

**architect CRITICAL 이슈 해소 절차**:
- **접근법 변경 필요** (WI 재설계) → planner Task 재호출 (Step 2-1로 복귀)
- **Task Description 수정만으로 해소** → 팀리드가 직접 Task Description 조정 (파일 수정 아님 — OK)
- **근본 한계** → 사용자에게 보고 후 판단 요청

### 2-5. MCP Pre-Implementation Proposals (스폰 전 필수 — Skip if Micro/Small)

> **⚠️ 팀원 spawn 전에 실행해야 합니다.** 결과를 `.team/mcp-proposals.md`에 저장 — 팀원이 startup 시 직접 읽습니다.

WI별로 해당 도메인 MCP 도구를 호출하여 구현 제안을 수집합니다:

| WI 도메인 | MCP/스킬 도구 |
|----------|-------------|
| 프론트엔드 | `gemini_patch` MCP |
| 백엔드 | `codex_patch` MCP |
| 프론트+백엔드 혼합 | `ai_team_patch` MCP |
| DB | `postgres-best-practices` Plugin |
| React/Next.js | `vercel-react-best-practices` Plugin |
| UI/UX | `ui-ux-pro-max` Plugin |
| **UI 디자인/컴포넌트** | **`frontend-design` 스킬** — 미적 방향 가이드라인 추출 후 `.team/mcp-proposals.md`에 포함 |

```bash
# 제안 저장 (WI별로 분리)
cat > .team/mcp-proposals.md << 'EOF'
# MCP Implementation Proposals

## WI-1 (프론트엔드) — Gemini 제안
{gemini_patch 결과}

## WI-2 (백엔드) — Codex 제안
{codex_patch 결과}
EOF
```

결과는 `.team/mcp-proposals.md`에 저장됩니다. 팀원이 startup 시 직접 읽으므로 Task Description에 재삽입 불요.

> MCP 제안은 **참고용**. 팀원이 기존 패턴과 맞지 않으면 기각 가능. 기각 시 완료 보고에 이유 명시.

---

## Step 3: Team Creation & Teammate Spawning

### 3-1. Team Creation

```
TeamCreate(team_name="{task-slug}", description="{task description}")
```

**team-slug 명명 규칙**: 소문자 + 하이픈만, 최대 32자, 현재 세션에서 유일.
- ✅ `auth-login-fix`, `dashboard-ui-v2`, `api-refactor-2026`
- ❌ `AuthFix`, `my fix`, `task_001`, `a-very-long-slug-name-that-exceeds-the-limit-here`

이 시점부터 `~/.claude/teams/{task-slug}/config.json`과 `~/.claude/tasks/{task-slug}/`가 생성됩니다.

### 3-1.5. TeammateIdle Hook 설정 (권장)

> Claude Code 공식 기능 — 팀원이 완료 보고 없이 idle 진입 시 자동으로 감지합니다.

**설정 방법** (일회성 — 프로젝트 루트에서 실행):
```bash
# .claude/settings.json에 hook 추가 (없으면 생성)
node -e "
const fs = require('fs');
const path = '.claude/settings.json';
const s = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path)) : {};
s.hooks = s.hooks || {};
s.hooks.TeammateIdle = s.hooks.TeammateIdle || [];
if (!s.hooks.TeammateIdle.find(h => h.command && h.command.includes('team-idle-guard'))) {
  s.hooks.TeammateIdle.push({ command: 'bash ~/.claude/team-idle-guard.sh' });
}
fs.mkdirSync('.claude', { recursive: true });
fs.writeFileSync(path, JSON.stringify(s, null, 2));
console.log('Hook 설정 완료');
"

# 가드 스크립트 생성
cat > ~/.claude/team-idle-guard.sh << 'GUARD_EOF'
#!/usr/bin/env bash
# TeammateIdle Hook — 완료 보고 없이 idle 진입 시 차단
# 환경변수: CLAUDE_TEAMMATE_NAME, CLAUDE_TEAM_NAME
TASK_DIR="$HOME/.claude/tasks/${CLAUDE_TEAM_NAME}"
if [ -z "$TASK_DIR" ] || [ ! -d "$TASK_DIR" ]; then exit 0; fi

# 해당 팀원이 소유한 in_progress 태스크가 있으면 idle 차단
OWNED=$(grep -rl "\"owner\":.*\"${CLAUDE_TEAMMATE_NAME}\"" "$TASK_DIR" 2>/dev/null | xargs grep -l '"status":"in_progress"' 2>/dev/null)
if [ -n "$OWNED" ]; then
  echo "⚠️  ${CLAUDE_TEAMMATE_NAME}: in_progress 태스크가 있습니다. 완료 보고(SendMessage) 또는 TaskUpdate(status=completed) 후 종료하세요." >&2
  exit 2  # idle 차단
fi
exit 0  # idle 허용
GUARD_EOF
chmod +x ~/.claude/team-idle-guard.sh
```

> **hook이 없어도 /team은 정상 동작**합니다. hook은 팀원이 작업 도중 자연 종료될 때의 안전망입니다.
> **[AUTO 모드]**: 자율 클레임 팀원은 완료 후 자발적으로 다음 WI를 찾으므로 hook이 특히 유용합니다.

### 3-2. Task 사전 등록 (스폰 전)

**팀원 스폰 전에 모든 WI를 TaskCreate로 등록합니다.** 태스크 등록은 진행 상황 추적 및 DAG blockedBy 설정 목적입니다. 자율 클레임 금지 — 리더가 spawn 시 Task Description으로 직접 할당합니다:

```
# 전체 WI TaskCreate
TaskCreate(
  subject="[WI-1] 로그인 UI 구현",
  description="Fulfills: R2, R5\nOWNED: src/components/auth/LoginForm.tsx",
  activeForm="Implementing login UI"
)

# 의존성 설정
TaskUpdate(taskId="task-002", addBlockedBy=["task-001"])
```

**WI 시작 직전 — startSha 기록 (C-1 소유권 검증 기준점)**:
```
# Step 1: Bash 도구로 현재 SHA 확인
git rev-parse HEAD
# 예시 출력: a1b2c3d4e5f6...

# Step 2: 출력값을 그대로 TaskUpdate에 입력 (bash 변수 사용 불가 — 도구 호출은 독립 컨텍스트)
TaskUpdate(taskId="{wi-task-id}", metadata: { "startSha": "a1b2c3d4e5f6..." })
```
> ⚠️ `$(git rev-parse HEAD)` 형태로 TaskUpdate 안에 쓰지 마세요. Bash 도구와 TaskUpdate 도구는 별개 호출입니다. 반드시 2단계(실행 → 복사)로 처리합니다.

### 3-3. Teammate Spawning

**스폰 원칙**:

**[DIRECTED 모드]**:
1. 1 WI = 1 팀원. 재사용 절대 금지. WI 완료 → 즉시 shutdown → 다음 WI = 새 팀원 spawn.
2. **Early Spawn**: `[EARLY]` 태그 WI (Step 2-1 참조)는 Step 3-2 TaskCreate 직후 즉시 spawn 시작. blockedBy 있는 WI는 해당 WI 완료 후 spawn.
3. 순차적 스폰 (~6-7초/팀원) — 블로킹. spawn 완료까지 다른 Task 도구 호출 불가.

**[AUTO 모드]**:
1. 초기 팀원 spawn: `[EARLY]` WI 수만큼 동시 spawn.
2. 팀원이 완료 후 TaskList에서 다음 unblocked WI를 자율 클레임. 리더 재spawn 불필요.
3. 팀원 재사용 허용 (같은 팀원이 다음 WI 클레임 가능).

**기본 스폰 구문**:
```
Task(
  subagent_type="executor",      # 커스텀 에이전트 이름 (subagent_type)
  name="executor-1",             # SendMessage recipient 이름 (팀 내 유일)
  team_name="{task-slug}",       # TeamCreate에서 생성된 팀 이름
  prompt="[WI 설명 전문]"
)
```

**워크트리 격리 스폰** (고위험 WI):
```
Task(
  subagent_type="build-fixer",
  name="build-fixer-1",
  team_name="{task-slug}",
  isolation="worktree",          # 격리된 git worktree에서 실행
  prompt="..."
)
```

#### subagent_type 선택 기준

| WI 도메인 | subagent_type | isolation | 스킬/플러그인 |
|-----------|---------------|-----------|--------------|
| UI/컴포넌트 | `designer` | — | **`frontend-design`** 스킬 — Task Description에 aesthetic direction 포함 |
| 백엔드/도메인/인프라 | `executor` | — | — |
| 테스트 | `test-engineer` | — | — |
| **웹앱 QA** | `qa-tester` | — | **`dogfood`** 스킬 — URL만 있으면 브라우저 탐색 + 재현 증거 리포트 |
| 빌드/설정 (실험적) | `build-fixer` | `"worktree"` | — |
| 대규모 리팩토링 | `executor` | `"worktree"` | — |
| Git 정리 | `git-master` | `"worktree"` | — |
| 문서 | `writer` | — | — |

#### 스케일링 규칙

**[AUTO 모드]** (WI ≤ 3, 충돌 없음, worktree 없음):
```
1. TaskCreate 전체 WI 등록 (blockedBy 포함)
2. 초기 팀원 spawn: blockedBy 없는 WI 수만큼 동시 spawn
3. 팀원이 WI 완료 후 → TaskUpdate(status="completed") → TaskList에서 다음 unblocked WI 자율 클레임
4. 리더: WI 완료 SendMessage 수신 시 C-1 검증 → PASS면 다음 WI로 진행 허용
5. 모든 WI completed → shutdown_request 전송 (Step 9-3 기준)
```
> **AUTO 모드에서도 C-1 검증은 필수** — 팀원이 자율 클레임해도 소유권 위반 여부를 리더가 확인.
> AUTO 모드에서는 리더가 `shutdown_request`를 WI 완료마다 보내지 않음 — 팀원이 자율적으로 다음 WI를 찾아서 처리. 모든 WI 완료 후 일괄 shutdown.

**[DIRECTED 모드]** (WI ≥ 4 또는 CONFLICT 또는 worktree):
```
1. 초기 spawn: blockedBy 없는 WI 수만큼 동시 spawn (순차적 ~7초/팀원)
2. WI 완료 시: 즉시 shutdown_request → shutdown_response(approve: true) → 팀원 종료
3. unblocked WI 발생 시: 새 팀원 spawn (이전 팀원 종료 완료 후)
4. 절대 금지: 완료된 팀원에게 다음 WI 전달, 같은 인스턴스 재활용
```

### 3-4. Task Description (Lean Format, MANDATORY)

> **팀원은 독립 인스턴스입니다. 컨텍스트는 `.team/` 파일을 읽어 자체 조달합니다.**
> **Task Description에는 WI 범위 + 파일 소유권 + COMPLETION PROTOCOL만 포함합니다** — 코드베이스 컨텍스트를 직접 삽입하지 않습니다. (→ 토큰 절감 60~70%)
>
> **OWNED/SHARED 파일 목록은 `.team/ownership.json`의 해당 WI 항목에서 읽어서 채웁니다.** 절대 수동 작성 금지 — ownership.json이 단일 소스.

```
[WI-1 — 로그인 UI 구현] Fulfills: R2, R5

━━━ STARTUP: READ THESE FILES FIRST ━━━
1. cat .team/requirements.md      ← R# 전체 목록 (내 WI 관련 R# 확인)
2. cat .team/codebase-context.md  ← 코드베이스 구조 + 패턴 (반드시 읽고 기존 패턴 준수)
3. cat .team/mcp-proposals.md     ← Gemini/Codex 제안 (참고용, 기존 패턴과 맞지 않으면 기각 가능)
4. cat .team/ownership.json       ← 파일 소유권 매트릭스 (내 WI의 OWNED/SHARED 목록 확인)

━━━ MY SCOPE ━━━
Fulfills: R2 ("로그인 페이지에 소셜 로그인 버튼 추가"), R5 ("로그인 폼 유효성 검사")
{WI 작업 내용 1~3줄 요약}

━━━ FILE OWNERSHIP ━━━
OWNED FILES (수정 가능):
- src/components/auth/LoginForm.tsx (신규 생성)
- src/components/auth/SocialLoginButtons.tsx (신규 생성)

SHARED FILES (READ-ONLY — 수정 필요 시 리더에게 SendMessage):
- src/types/auth.ts

⛔ BOUNDARY: OWNED 파일만 수정. SHARED 수정은 리더에게 요청.

━━━ COMPLETION PROTOCOL ━━━
완료 시 반드시:
1. TaskUpdate(taskId="{task-id}", status="completed")
2. SendMessage(type="message", recipient="lead",
   content="WI-1 완료. 수정 파일: [...]. 빌드/타입 체크: PASS",
   summary="WI-1 완료 보고")

   ※ worktree isolation WI인 경우 — 브랜치명 반드시 포함:
   content="WI-1 완료. 브랜치: worktree-{팀원이름} (예: worktree-executor-1). 수정 파일: [...]. 빌드: PASS"

3. 리더의 C-1 검증 결과 대기:
   - 리더가 수정 요청 SendMessage를 보낼 수 있음 → 수정 후 재보고 (단계 2로 돌아감)
   - 리더가 shutdown_request를 보내면 → approve: true로 응답하여 종료

⛔ shutdown_request 수신 전 자발적 종료 금지.
⛔ 다른 태스크 자율 클레임 금지.
```

---

## Step 4: Consensus Protocol (아키텍처 결정 필요 시)

1. **DRAFT**: 초기 제안
2. **REVIEW**: `codex_analyze` MCP → [AGREE]/[SUGGEST]/[DISAGREE]
3. **RESOLVE**: 최대 2라운드 → 합의 불가 시 사용자 결정
4. **CONFIRM**: 합의 결정 기록

**Skip if**: 버그 수정, 소규모 기능, 기존 패턴 내 작업.

---

## Step 5: Parallel Execution

### Phase A — MCP Proposals

> **⚠️ MCP 제안은 Step 2-5에서 팀원 spawn 전에 완료됩니다.** Task Description에 이미 포함된 상태로 팀원이 spawn됩니다. 이 단계에서 MCP를 다시 호출하지 않습니다.
>
> → Step 2-5 결과 (`.team/mcp-proposals.md`) 확인 후 실행 진행.

구현 후 검증이 필요한 경우: `review_implementation` MCP 사용.

### Phase B — DAG-Based Parallel Execution

> **병렬성의 실제 구조**:
> - **팀원 스폰**: 순차 (~6-7초/팀원) — 이 시간 동안 다른 작업 불가
> - **팀원 작업**: 스폰 완료 후 각 팀원이 독립 인스턴스로 실제 병렬 실행 ✅
> - **blockedBy 해제 → 다음 WI**: C-1 PASS → shutdown 완료 → 새 팀원 spawn

**태스크 할당 방식**:
```
1 WI = 1 팀원. 팀리드가 spawn 시 Task Description으로 WI를 직접 할당.
자율 클레임 없음. 팀원은 받은 WI만 수행 후 shutdown 대기.
```

**실제 실행 흐름** (1 WI = 1 팀원, 재사용 금지):
```
[t=0]  팀리드: executor-1 spawn(WI-1) → 7초 대기 → designer-1 spawn(WI-2)
[t=14s] spawn 완료 → executor-1, designer-1 병렬 작업 시작

[executor-1 WI-1 완료]
  → SendMessage("lead", "WI-1 완료. 수정파일: [...]. 빌드: PASS")
  → 팀리드: C-1 검증 (git diff 읽기, 소유권 확인)
    ├─ PASS → shutdown_request(executor-1)
    │          executor-1: shutdown_response(approve: true) → 종료 ✓
    │          WI-3 unblocked → executor-2 spawn (새 팀원) ← ⛔ executor-1 재사용 금지
    │
    └─ FAIL (팀원 아직 종료 전 — shutdown 전이므로 수정 가능)
         소유권 위반: SendMessage("executor-1", "{파일} 소유권 위반. git checkout -- {파일} 실행 후 재보고")
         타입 에러:   SendMessage("executor-1", "타입 에러 {Y} 수정 후 재보고")
         → 팀원 수정 → 재보고 → C-1 재실행 → PASS → shutdown

[designer-1 WI-2 완료]
  → SendMessage("lead", "WI-2 완료")
  → 팀리드: C-1 검증 → PASS → shutdown_request(designer-1) → 종료 ✓

[전체 WI 완료] → Phase C-3 Final Reconciliation
```

**워크트리 팀원 완료 처리 — 자동 머지 트리거** (리더는 git 상태 변경 금지):

완료 보고에서 브랜치명 추출 → C-1 PASS 직후 git-master Task 백그라운드 실행:
```
팀원 완료 보고: "WI-1 완료. 브랜치: worktree-executor-1. 수정 파일: [...]. 빌드: PASS"
                                    └── 브랜치명 추출 → C-1 PASS 후 git-master Task 즉시 생성
```

**git-master Task 템플릿** (C-1 PASS + shutdown 직후 즉시 호출):
```
Task(
  subagent_type="git-master",
  run_in_background=True,    # ← 백그라운드 — 리더는 다음 WI 처리 병렬 진행
  prompt="""[Worktree Merge] WI-{N} 브랜치: worktree-{name}

1. git log main..worktree-{name} --oneline   # 변경 커밋 확인
2. git checkout main
3. git merge worktree-{name} --no-ff -m "feat: WI-{N} 머지 (worktree-{name})"
4. 충돌 발생 시:
   - git merge --abort 실행
   - 결과에 "CONFLICT: {충돌파일목록}" 명시 후 종료 (자동 해소 금지)
5. 머지 성공 시:
   - git branch -d worktree-{name}    # 브랜치 정리
   - 결과에 "MERGED: {커밋SHA} ({변경파일수}개 파일)" 명시"""
)
```

**자동화 흐름**:
```
[WI-N 완료 보고 수신 + 브랜치명 확인]
  → C-1 검증
    ├─ FAIL → SendMessage 수정 요청 (브랜치 그대로 보존)
    └─ PASS → shutdown_request(팀원)
              → 즉시 git-master Task 백그라운드 실행
              → 리더: 다음 WI C-1 처리 병렬 계속

[git-master 백그라운드 완료 알림 수신]
  "CONFLICT: {파일}" → 사용자에게 충돌 파일 보고 + 수동 해소 요청
  "MERGED: {SHA}"    → 진행 상황 리포트에 머지 SHA 기록 후 계속
```

> **머지 순서**: DAG blockedBy 순서로 순차 머지. 동시 머지 금지 (충돌 확률 증가).
> **예방**: Step 2-3C Conflict Resolution이 완전하면 충돌 없음. 충돌 발생 = Step 2 설계 오류 신호.

**리더 역할** (엄격히 준수):
- ✅ 허용: WI 완료 보고 수신, C-1 검증(출력 읽기), 팀원 질문 응답, shutdown 진행, 새 팀원 spawn 지시, 빌드/테스트 출력 읽기(검토 목적), **진행 상황 사용자 보고**
- ⛔ 금지: 파일 Edit/Write, `git checkout/merge/commit` 등 git 상태 변경, SHARED 파일 직접 수정, 기능 구현 코딩

> SHARED 파일 수정이 필요하면 → 해당 WI 전담 팀원에게 위임(Task Description에 SHARED 파일 포함). 워크트리 머지가 필요하면 → `git-master` 비팀원 Task로 위임.

**진행 상황 리포트** (C-1 완료마다 사용자에게 보고):
```
[{team-slug} 진행 상황 — {경과 시간}]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
완료: {N}/{TOTAL} WI ({PERCENT}%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{WI별 상태 — TaskList 결과 기반}
✅ WI-SHARED (타입 정의)   — 3분
✅ WI-1     (로그인 UI)    — 12분
🔄 WI-2     (OAuth 백엔드) — 진행중 (15분 경과)
⏳ WI-3     (통합)        — blockedBy WI-2
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
다음: WI-2 완료 대기 → C-1 검증 → WI-3 spawn
```
> **보고 시점**: 각 WI C-1 PASS 직후. WI가 많을 경우(5개+) 3개 완료마다 보고해도 됩니다.

### Phase C — Streaming Reconciliation (3-Tier)

#### C-1. Per-WI 경량 검증 (WI 완료 즉시)

> **전제**: WI 시작 직전 Bash로 `git rev-parse HEAD` 실행 → 출력값을 TaskUpdate에 직접 입력:
> ```
> # Bash: git rev-parse HEAD  →  출력: a1b2c3d
> TaskUpdate(taskId="{wi-task-id}", metadata: { "startSha": "a1b2c3d" })
> ```
> (Step 3-2 참조 — 반드시 2단계로 처리)

**[Mode A — Direct Edit WI]** (기본):
```bash
# 1. WI 시작 SHA부터 현재까지 변경된 파일 목록
git diff --name-only {startSha}..HEAD

# (팀원이 아직 커밋 안 한 경우 — staged + unstaged 모두 포함)
git status --short

# 2. ownership.json의 해당 WI OWNED FILES와 대조
# OWNED 외 파일이 변경 목록에 있으면 → 소유권 위반

# 3. 타입 체크 (tsconfig.json이 있는 경우에만)
[ -f tsconfig.json ] && pnpm tsc --noEmit || true
```

**[Mode B — Worktree Isolation WI]** (worktree 팀원의 C-1은 다름):
> ⚠️ Worktree WI는 별도 브랜치에 커밋하므로, 메인 브랜치에서 `git diff {startSha}..HEAD`를 실행하면 **빈 결과** 반환 — git diff 검증 불가.
> 대신 팀원의 **자기 보고 파일 목록**과 ownership.json을 대조:
```
# 팀원 SendMessage 완료 보고에서 수정 파일 목록 추출
# "수정 파일: [src/renderer/WebGLRenderer.ts, src/renderer/types.ts]"
# → ownership.json의 WI-N OWNED FILES와 대조
# → OWNED 외 파일 있으면 → SendMessage("팀원이름", "소유권 위반 파일: {X}. worktree 브랜치에서 git checkout -- {X} 실행 후 재보고")
# → 타입 체크: git-master Task로 worktree 브랜치에서 실행 위임
```
> Worktree C-1은 git-master 머지 **전에** 실행 — 소유권 문제 발견 시 머지 전 수정 가능.

**C-1은 shutdown_request 전에 실행** — 팀원이 아직 살아있으므로 수정 지시 가능:

- **소유권 위반 감지** → `SendMessage(teammate, "OWNED 외 파일 {X} 변경 감지. git checkout -- {X} 실행 후 재보고")` — 팀원이 직접 자신의 침범 변경을 되돌림
- **타입 에러** → `SendMessage(teammate, "타입 에러 {Y}. 수정 후 재보고")`
- **재보고 수신** → C-1 재실행 (최대 2회 — 그 이상은 Circuit Breaker)
- ✅ PASS → `shutdown_request` → blockedBy 해제 → 다음 WI 새 팀원 spawn

#### C-2. Checkpoint 빌드 (조건부 트리거, background)

**트리거 기준**: 아래 중 하나 해당 시 실행:
- 누적 완료 WI가 3의 배수가 될 때 (팀리드가 카운터 유지)
- 또는 blockedBy 있는 WI가 unblock되는 시점 (의존 WI 시작 전 안전 확인)

```bash
# 팀리드 완료 카운터 관리
COMPLETED_WI_COUNT=$((COMPLETED_WI_COUNT + 1))
if [ $((COMPLETED_WI_COUNT % 3)) -eq 0 ]; then
  # run_in_background: true 로 실행 → task_id 반환
  # 잠시 후 TaskOutput(task_id="...", block=false) 로 결과 확인
  pnpm build && pnpm test
fi
```

> **background 빌드 결과 확인**: `Bash(run_in_background: true)` 호출 시 반환되는 task_id를 메모해두고, 다음 WI 완료 보고를 처리하는 사이 `TaskOutput(task_id="...", block=false)`로 완료 여부 확인. 실패 결과가 있으면 즉시 fix 팀원 spawn.

- 빌드 실패 → 원인 WI 파악 (git log로 최근 커밋 확인) → **새 fix 팀원 spawn**:
  ```
  Task(subagent_type="executor", name="executor-fix-{N}", team_name="{task-slug}",
       prompt="[빌드 수정] C-2 체크포인트 빌드 실패. 원인: WI-N의 {파일}. 수정 후 재보고.")
  ```
  (C-2 시점에 해당 WI 팀원은 이미 shutdown 완료 → 새 팀원으로 수정)
- **다음 WI 할당 중단 없이 계속** (background 빌드이므로)
- **중요**: Checkpoint 실패가 2회 연속이면 → 모든 신규 WI 할당 중단 후 원인 해결 우선

#### C-3. Final Reconciliation (전체 WI 완료 후)
```bash
pnpm build && pnpm lint && pnpm test
```

> **외부 서비스(Redis, DB, 메시지큐 등) 의존 테스트**: 외부 서비스 없이 테스트 실패 시 → 코드 버그가 아닌 환경 문제. 처리 순서:
> 1. `pnpm test -- --skip-integration` 또는 유닛 테스트만 분리 실행
> 2. 통합 테스트가 필요하면: docker-compose / 로컬 서비스 실행 후 재시도
> 3. 환경 구성 자체가 불가하면: 유닛 테스트 PASS + "통합 테스트는 CI 환경에서 실행 필요" 사용자 보고 후 진행

**C-3 실패 시 복구 절차**:
```
1. git log --oneline -10  # 어느 WI의 커밋이 원인인지 파악
2. 실패 원인이 된 WI 파악 후 → 새 fix 팀원 spawn (해당 WI 팀원은 이미 shutdown 완료)
   Task(subagent_type="executor", name="executor-fix-{N}", team_name="{task-slug}",
        prompt="[C-3 복구] Final Reconciliation 실패.
                원인: {git log 상 WI-N 커밋} — {에러 메시지}
                OWNED FILES: {ownership.json의 해당 WI 파일 목록}
                수정 후 pnpm build && pnpm test 재실행하여 통과 확인.")
3. fix 팀원 완료 보고 → C-3 재실행
4. 동일 원인으로 2회 이상 실패 → Circuit Breaker: architect escalate
```

---

## Step 6: Multi-Reviewer Gate

복수 리뷰어를 **병렬** `Task` 호출.

### 6-1. `code-reviewer` (항상 실행)
- **Stage 1 — Spec Compliance**: R# 충족 확인. FAIL → Step 5 복귀 (Stage 2 생략)
- **Stage 2 — Code Quality**: Architecture, DRY, error handling. CRITICAL/HIGH → Step 5 복귀

### 6-2. `style-reviewer` (항상 실행, 6-1과 병렬)
네이밍, 포매팅, 프로젝트 컨벤션, lint 규칙.

### 6-3. 조건부 전문 리뷰어 (병렬 Task 호출)

| 조건 | subagent_type | 전제 조건 |
|------|---------------|----------|
| API 변경 | `api-reviewer` | — |
| 보안 관련 | `security-reviewer` | — |
| 성능 민감 | `performance-reviewer` | — |
| UI 변경 | `vision` | **스크린샷 필수** — 아래 참조 |

**vision 에이전트 사용 시 — 스크린샷 획득 절차**:
```bash
# 0. agent-browser 스킬 가용성 확인 (Step 0-0.5에서 이미 확인했다면 생략)
ls ~/.claude/skills/ 2>/dev/null | grep -q agent-browser && echo "✅" || echo "❌ → vision 건너뜀"

# 1. agent-browser 스킬로 스크린샷 획득 (dev server 실행 중이어야 함)
# {port}: package.json dev 스크립트 또는 vite.config.ts에서 확인
Skill("agent-browser", args="screenshot http://localhost:{port}/{page-path}")
→ 스크린샷 파일 경로 반환

# 2. vision 에이전트에게 스크린샷 + 기대 디자인 전달
Task(subagent_type="vision",
     prompt="첨부 스크린샷과 기대 디자인을 비교하여 UI 품질 검증: {스크린샷경로}")
```
> agent-browser 미설치 / dev server 없음 / 스크린샷 획득 불가 시 → vision 에이전트 건너뛰고 code-reviewer Stage 2에서 코드 레벨 UI 검토로 대체.

### 6-4. 결과 종합
- **CRITICAL/HIGH** → Step 5 복귀
- **MEDIUM** → 가능하면 수정 (Step 7 진행 가능)
- **LOW** → 기록만

Circuit Breaker 적용 — 동일 이슈 3회 실패 시 architect escalate.

---

## Step 7: `verifier` — Spec Fulfillment Verification

> Code Review와 별도로, R# 충족을 증거 기반으로 최종 검증합니다.

`Task(subagent_type="verifier")` 에게 전달: `.team/requirements.md` + 코드 diff + Step 6 결과.

```
| R# | 요구사항 | 충족 | 증거 |
|----|---------|:----:|------|
| R1 | ...     | ✅  | src/Chart.tsx:15 구현 확인 |
| R2 | ...     | ❌  | 라인차트만 구현, 바/파이 누락 |
```

- ❌ → Step 5 복귀 → Step 6 → Step 7 재실행
- ⚠️ → 사용자에게 보고 후 판단

---

## Step 8: Evidence-Based QA

**QA 방식 선택 (자동 분기)**:

| 애플리케이션 유형 | QA 방식 | 도구 |
|-----------------|---------|------|
| **웹앱/브라우저 UI** | **`dogfood` 스킬 (1순위)** | agent-browser 기반 탐색, 재현 증거 리포트 |
| CLI/서비스/API | `qa-tester` Task | Bash 출력 캡처 |
| 유닛/통합 테스트 | 직접 실행 | pnpm test |

### 웹앱 — `dogfood` 스킬 우선 사용

**dogfood 스킬 가용성 확인** (실행 전 필수):
```bash
# 설치 확인 (둘 중 하나라도 있으면 OK)
ls ~/.claude/skills/ 2>/dev/null | grep -q dogfood && echo "✅ dogfood 설치됨" || echo "❌ dogfood 미설치"
```

- ✅ **dogfood 설치됨** → 아래 절차 진행
- ❌ **dogfood 미설치** → `webapp-testing` 스킬 또는 `qa-tester` Task로 대체:
  ```
  Skill("webapp-testing", args="http://localhost:{port}")
  # 또는
  Task(subagent_type="qa-tester", prompt="웹앱 QA: http://localhost:{port}")
  ```

```
Skill("dogfood", args="http://localhost:{port}")
```

- **`{port}` 확인**: `package.json`의 dev 스크립트 또는 `vite.config.ts` / `next.config.ts`에서 포트 확인. 기본값: Vite=5173, Next.js=3000, CRA=3000.
- dev server 미실행 시 → 먼저 `pnpm dev &` 실행 후 port 대기 (30초 내 응답 대기):
  ```bash
  pnpm dev > /tmp/dev-server.log 2>&1 &
  DEV_PID=$!
  timeout 30 bash -c 'until curl -s http://localhost:{port} > /dev/null; do sleep 1; done' && echo "서버 준비 완료 (PID: $DEV_PID)"
  echo "QA 완료 후: kill $DEV_PID"
  ```
- 출력: `dogfood-output/report.md` (자동 생성)
  - 인터랙티브 버그: 재현 영상(`.webm`) + 단계별 스크린샷
  - 정적 버그 (오타/레이아웃): 단일 annotated 스크린샷
- 리포트 보존: `cp -r dogfood-output .team/qa-evidence`
- CRITICAL/HIGH 이슈 발견 시 → Step 5 복귀

> **dogfood 스킬**은 사용자처럼 실제 브라우저를 탐색하며 버그를 찾습니다. 앱 소스코드는 읽지 않고, 브라우저에서 관찰된 것만 기준으로 판정합니다.

### CLI/서비스 — `qa-tester` Task

`Task(subagent_type="qa-tester")`:

**실행 환경 감지** (Bash로 먼저 실행):

```bash
_os=$(uname -s 2>/dev/null)
case "$_os" in
  MINGW*|MSYS*|CYGWIN*|"")
    echo "NO_TMUX"  # Windows native — tmux 미지원
    ;;
  *)
    command -v tmux >/dev/null 2>&1 && [ -n "$TMUX" ] && echo "TMUX_ACTIVE" || echo "NO_TMUX"
    ;;
esac
```

| 환경 | 감지 결과 | QA 방식 |
|------|-----------|---------|
| Windows (PowerShell/CMD/Git Bash) | `NO_TMUX` (자동) | Bash 출력 직접 캡처 |
| macOS/Linux/WSL — tmux 없음 또는 세션 외 | `NO_TMUX` | Bash 출력 직접 캡처 |
| macOS/Linux/WSL — tmux 세션 내 실행 중 | `TMUX_ACTIVE` | capture-pane 기반 QA · Session naming: `qa-{service}-{test}-{timestamp}` · Always kill-session |

**NO_TMUX 방식** (기본/대체):
- `pnpm test 2>&1 | tee .team/qa-evidence.txt`
- 또는 agent-browser 스킬로 브라우저 동작 검증
- `.team/qa-evidence.txt`는 Step 9까지 보존

**dev server 필요 시 시작 + 준비 대기**:
```bash
pnpm dev > /tmp/dev-server.log 2>&1 &
DEV_PID=$!
# 최대 30초 대기
for i in $(seq 1 30); do curl -s http://localhost:{port} > /dev/null && break; sleep 1; done
echo "dev server PID: $DEV_PID (QA 완료 후 kill $DEV_PID 실행)"
```

> **Windows 사용자**: tmux 없이도 완전한 QA 가능. Bash 출력 캡처 방식이 동일한 증거 기준을 충족합니다.

**증거 기준**: 어떤 환경이든 **실행 출력 캡처 없이 "통과"/"실패" 판정 금지**.

실패 시: 캡처 증거 첨부 → Step 5 복귀. Circuit Breaker 적용.

---

## Step 9: Finalization

### 9-1. `writer` — 문서화 (필요 시)

```
Task(subagent_type="writer", prompt="...")  # team_name 없음 — 일반 Task 호출
```

CHANGELOG, API 문서, AGENTS.md/README 업데이트.

### 9-2. `git-master` — 커밋 정리 (필요 시, 팀원 아님)

```
Task(subagent_type="git-master", prompt="...")  # team_name 없음 — 일반 Task 호출
```

여러 팀원의 산발적 커밋 → atomic commit, 메시지 통일, 기존 컨벤션 준수.

### 9-3. TeamDelete (팀원 종료 확인 후)

> **Step 5에서 각 WI 완료 시 즉시 shutdown_request/response를 처리했다면, 이 시점에 생존 중인 팀원은 없어야 합니다.**

```
1. config.json 읽기 → 생존 중인 팀원 목록 확인 (예외 상황 체크)
   Read("~/.claude/teams/{team-name}/config.json")

2. 생존 팀원이 있는 경우에만: 순차 shutdown_request 전송
   SendMessage(type="shutdown_request", recipient="{teammate-name}",
               content="모든 WI 완료. 수고하셨습니다. 팀을 해산합니다.")
   - approve: true  → 종료 확인
   - approve: false → 완료 후 재요청
   - 60초 내 무응답 → 비정상 종료로 간주, 건너뛰고 진행

3. 생존 팀원 없음 (정상) → 바로 TeamDelete 호출

4. TeamDelete()  ← 모든 팀원 종료 확인 후에만
```

> **⚠️ broadcast로 일괄 종료 금지** — N개 메시지 비용 발생 + requestId 관리 불가. 생존 팀원이 있다면 개별 shutdown_request 필수.
> **⚠️ Step 9에서 spawn한 writer/git-master는 team_name 없는 일반 Task** — TeamDelete 영향 없음. 완료 대기 후 TeamDelete 호출.

---

## Completion Checklist

**`.team/requirements.md` (확정 Registry) 기준으로** 최종 판정:

```
[FINAL REQUIREMENT VERIFICATION]
| R# | 요구사항 | 구현 상태 | 검증 |
전체: N/M 완료
```

- [ ] All R# items: ✅ (verifier 통과) `[M: Coverage Check만]`
- [ ] All TaskList items: COMPLETED
- [ ] Final Reconciliation: PASS (C-3) `[M: 생략 가능]`
- [ ] Multi-Reviewer Gate: ALL PASSED `[M: 생략 가능]`
- [ ] Evidence-Based QA: 증거 기반 통과 (웹앱: `dogfood-output/report.md` 존재 확인, CLI: `.team/qa-evidence.txt` 확인) `[M: 직접 테스트 결과로 대체]`
- [ ] No CRITICAL/HIGH issues

> `[M]` 표시 항목: Micro/Small Fast-Path에서 생략 가능. 단, 생략 이유를 사용자에게 명시.
- [ ] Worktree 브랜치 전부 머지/정리 완료
- [ ] Documentation updated
- [ ] QA 증거 보존: `cp -r .team/qa-evidence .qa-evidence-{team-slug} 2>/dev/null || true`
- [ ] `.team/` 디렉토리 삭제: `rm -rf .team`
- [ ] config.json 확인 → 생존 팀원 있으면 shutdown_request 완료, 없으면 바로 다음 단계
- [ ] `TeamDelete()` called ← **반드시 모든 팀원 종료 후** (Step 9-3 참조)

**❌가 하나라도 있으면 CONTINUE WORKING.**

---

## Important Distinctions

### MCP ai-agents vs Olympus Project

| | MCP ai-agents | Olympus Project |
|---|---|---|
| **What** | `codex_analyze`, `ai_team_patch` 등 | `packages/codex/`, `gateway/src/gemini-advisor.ts` |
| **Purpose** | Analysis, proposals, consensus (이 팀 세션용) | Actual CLI process management (인프라) |

These are **completely separate systems**.
