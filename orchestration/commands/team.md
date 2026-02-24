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
| **Teammates** | **1 WI = 1 팀원. 재사용 금지.** WI 완료 보고 후 즉시 종료(shutdown). 다음 WI = 새 팀원 spawn. |
| **Task List** | `~/.claude/tasks/{team-name}/` — WI-level DAG, addBlockedBy → 자동 해제 |

**핵심 원칙**: 자동 머지나 파일 잠금 대신, **작업 설계로 파일 충돌을 원천 차단**합니다.

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

| Agent (= subagent_type) | Model | Write? | Role | 호출 시점 |
|--------------------------|-------|:------:|------|----------|
| **explore** | Haiku | ❌ | 코드베이스 검색 | Step 1-2 (Task) |
| **analyst** | Opus | ❌ | 요구사항 분석 | Step 1 (Task) |
| **planner** | Opus | ❌ | DAG 설계 | Step 2 (Task) |
| **architect** | Opus | ❌ | 아키텍처 설계 (READ-ONLY) | Step 2, 4, Circuit Breaker |
| **researcher** | Sonnet | ❌ | 외부 문서/API 조사 | Step 2 (Task/Team) |
| **designer** | Sonnet | ✅ | UI/UX 설계 + 구현 | Step 3→5 (Team) |
| **executor** | Opus | ✅ | 범용 구현 실행 | Step 3→5 (Team) |
| **test-engineer** | Sonnet | ✅ | 테스트 작성 (TDD) | Step 3→5 (Team) |
| **build-fixer** | Sonnet | ✅ | 빌드/컴파일 에러 해결 | Step 3→5 (Team) |
| **git-master** | Sonnet | ✅ | Git 커밋/리베이스 | Step 3, 9 (Team) |
| **code-reviewer** | Opus | ❌ | 2-Stage 코드 리뷰 | Step 6 (Task) |
| **style-reviewer** | Haiku | ❌ | 코드 스타일/컨벤션 | Step 6 (Task) |
| **api-reviewer** | Sonnet | ❌ | API 계약/호환성 | Step 6 (Task, 조건부) |
| **security-reviewer** | Opus | ❌ | 보안 취약점 (OWASP) | Step 6 (Task, 조건부) |
| **performance-reviewer** | Sonnet | ❌ | 성능/복잡도 | Step 6 (Task, 조건부) |
| **vision** | Sonnet | ❌ | 시각적 검증 | Step 6 (Task, 조건부) |
| **verifier** | Sonnet | ❌ | 스펙 충족 검증 | Step 7 (Task) |
| **qa-tester** | Sonnet | ❌ | CLI/서비스 테스트 | Step 8 (Task) |
| **writer** | Sonnet | ✅ | 문서화 | Step 9 (Task) |

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

### 0-1. Proactive Skill & Plugin Discovery (MANDATORY)

```
Skill("find-skills", args="{사용자 요구사항의 핵심 도메인 키워드}")
```

| 도메인 신호 | 활성화 대상 |
|------------|------------|
| React/Next.js/UI | `frontend-ui-ux` 스킬, `vercel-react-best-practices`, `ui-ux-pro-max`, `designer` |
| CSS/디자인 | `frontend-design` 스킬, `designer` |
| DB/PostgreSQL | `postgres-best-practices` |
| API/REST/GraphQL | `codex_analyze` MCP, `api-reviewer` |
| 테스트 | `webapp-testing` 스킬, `test-engineer` |
| Git/커밋 | `git-master` 스킬/에이전트 |
| 브라우저 자동화 | `agent-browser` 스킬 |
| 문서 작성 | `doc-coauthoring` 스킬, `writer` |
| 성능/보안 | `performance-reviewer`, `security-reviewer` |

### 0-2. 상태 디렉토리 생성

```bash
mkdir -p .team && grep -qxF '.team/' .gitignore 2>/dev/null || echo '.team/' >> .gitignore
```

### 0-3. 스폰 비용 추정

계획 팀원 수 × 7초 = 예상 스폰 시간. **스폰 중 다른 작업 불가** — `Task` 도구 호출은 블로킹이므로, 스폰이 완료될 때까지 리드는 대기합니다. **모든 준비(DAG, Task Description, MCP 제안)를 스폰 전에 완료해야 합니다.**

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
위 요구사항으로 작업을 진행합니다. 계속할까요? 수정이 필요하면 알려주세요.
(10초 내 응답 없으면 자동 진행)
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

> **Step 1 explore/analyst 결과를 `.team/codebase-context.md`에 저장합니다.** Step 3 팀원 프롬프트에 직접 삽입되는 단일 소스입니다.
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
3. SHARED 수정이 필요한 모든 WI → WI-SHARED를 blockedBy로 설정
   (또는 WI-SHARED를 마지막에 실행하여 모든 요구사항을 취합)

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

DAG + File Ownership Matrix → CRITICAL/HIGH 이슈 해소 후 진행.

### 2-5. MCP Pre-Implementation Proposals (스폰 전 필수 — Skip if Micro/Small)

> **⚠️ 팀원 spawn 전에 실행해야 합니다.** MCP 제안은 Task Description에 포함되어야 하며, spawn 이후에는 주입 불가능합니다.

WI별로 해당 도메인 MCP 도구를 호출하여 구현 제안을 수집합니다:

| WI 도메인 | MCP 도구 |
|----------|---------|
| 프론트엔드 | `gemini_patch` MCP |
| 백엔드 | `codex_patch` MCP |
| 프론트+백엔드 혼합 | `ai_team_patch` MCP |
| DB | `postgres-best-practices` Plugin |
| React/Next.js | `vercel-react-best-practices` Plugin |
| UI/UX | `ui-ux-pro-max` Plugin |

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

결과는 Step 3-4 Task Description의 `━━━ MCP PROPOSALS ━━━` 섹션에 WI별로 삽입됩니다.

> MCP 제안은 **참고용**. 팀원이 기존 패턴과 맞지 않으면 기각 가능. 기각 시 완료 보고에 이유 명시.

---

## Step 3: Team Creation & Teammate Spawning

### 3-1. Team Creation

```
TeamCreate(team_name="{task-slug}", description="{task description}")
```

이 시점부터 `~/.claude/teams/{task-slug}/config.json`과 `~/.claude/tasks/{task-slug}/`가 생성됩니다.

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
```bash
# 각 WI 팀원 스폰 직전 실행
START_SHA=$(git rev-parse HEAD)
TaskUpdate(taskId="{wi-task-id}", metadata: { "startSha": "$START_SHA" })
```

### 3-3. Teammate Spawning

**스폰 원칙**:
1. **1 WI = 1 팀원. 재사용 절대 금지.** WI 완료 → 즉시 shutdown → 다음 WI = 새 팀원 spawn.
2. **초기 동시 스폰**: blockedBy 없는 WI 수만큼 동시에 spawn (순차적으로 차례차례 spawn)
3. **순차적 스폰** (~6-7초/팀원) → 전체 계획 파악 후 일괄 요청

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

| WI 도메인 | subagent_type | isolation |
|-----------|---------------|-----------|
| UI/컴포넌트 | `designer` | — |
| 백엔드/도메인/인프라 | `executor` | — |
| 테스트 | `test-engineer` | — |
| 빌드/설정 (실험적) | `build-fixer` | `"worktree"` |
| 대규모 리팩토링 | `executor` | `"worktree"` |
| Git 정리 | `git-master` | `"worktree"` |
| 문서 | `writer` | — |

#### 스케일링 규칙 (1 WI = 1 팀원, 재사용 금지)

1. **초기 spawn**: blockedBy 없는 WI 수만큼 동시 spawn (순차적으로 차례로 실행)
2. **WI 완료 시**: 즉시 `shutdown_request` → `shutdown_response(approve: true)` 확인 → 팀원 종료
3. **unblocked WI 발생 시**: 새 팀원 spawn (이전 팀원이 종료 완료된 후여야 함)
4. **절대 금지**: 완료된 팀원에게 다음 WI 전달, 같은 인스턴스 재활용

### 3-4. Task Description (6-part format, MANDATORY)

> **Step 1-2에서 수집한 컨텍스트를 반드시 포함합니다.** 팀원은 독립 인스턴스이므로 이 프롬프트가 유일한 컨텍스트 소스입니다.
>
> **OWNED/SHARED 파일 목록은 `.team/ownership.json`의 해당 WI 항목에서 읽어서 채웁니다.** 절대 수동 작성 금지 — ownership.json이 단일 소스.

```
[WI-1 — 로그인 UI 구현] Fulfills: R2, R5

━━━ REQUIREMENTS ━━━
R2: "로그인 페이지에 소셜 로그인 버튼 추가" (원문)
R5: "로그인 폼 유효성 검사" (원문)

━━━ CODEBASE CONTEXT (Step 1 explore 결과) ━━━
관련 파일:
- src/components/auth/ — 기존 auth 컴포넌트 디렉토리
- src/types/auth.ts — AuthUser, LoginPayload 타입 정의
- src/hooks/useAuth.ts — 인증 상태 관리 훅

기존 패턴:
- 컴포넌트: React FC + Tailwind, named export
- 폼: react-hook-form + zod validation
- 스타일: cn() 유틸리티 사용
- 에러: toast() 패턴 (sonner)

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

**워크트리 팀원 완료 처리 → `git-master` Task 위임** (리더는 git 상태 변경 금지):
```
팀원 완료 보고 수신 → C-1 검증 → PASS → shutdown → git-master Task 호출
Task(subagent_type="git-master", prompt="worktree-{name} 브랜치 머지 후 cleanup")
```

**리더 역할** (엄격히 준수):
- ✅ 허용: WI 완료 보고 수신, C-1 검증(출력 읽기), 팀원 질문 응답, shutdown 진행, 새 팀원 spawn 지시, 빌드/테스트 출력 읽기(검토 목적), 사용자 보고
- ⛔ 금지: 파일 Edit/Write, `git checkout/merge/commit` 등 git 상태 변경, SHARED 파일 직접 수정, 기능 구현 코딩

> SHARED 파일 수정이 필요하면 → 해당 WI 전담 팀원에게 위임(Task Description에 SHARED 파일 포함). 워크트리 머지가 필요하면 → `git-master` 비팀원 Task로 위임.

### Phase C — Streaming Reconciliation (3-Tier)

#### C-1. Per-WI 경량 검증 (WI 완료 즉시)

> **전제**: WI 시작 시 팀리드가 현재 HEAD SHA를 task metadata에 기록:
> ```
> TaskUpdate(taskId="{wi-task-id}", metadata: { "startSha": $(git rev-parse HEAD) })
> ```

```bash
# 1. WI 시작 SHA부터 현재까지 변경된 파일 목록
git diff --name-only {startSha}..HEAD

# (팀원이 아직 커밋 안 한 경우 — staged + unstaged 모두 포함)
git status --short

# 2. ownership.json의 해당 WI OWNED FILES와 대조
# OWNED 외 파일이 변경 목록에 있으면 → 소유권 위반

# 3. 타입 체크
pnpm tsc --noEmit
```

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
  pnpm build && pnpm test  # run_in_background: true
fi
```

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
```
# 1. agent-browser 스킬로 스크린샷 획득 (dev server 실행 중이어야 함)
Skill("agent-browser", args="screenshot http://localhost:{port}/{page-path}")
→ 스크린샷 파일 경로 반환

# 2. vision 에이전트에게 스크린샷 + 기대 디자인 전달
Task(subagent_type="vision",
     prompt="첨부 스크린샷과 기대 디자인을 비교하여 UI 품질 검증: {스크린샷경로}")
```
> dev server가 없거나 스크린샷 획득 불가 시 → vision 에이전트 건너뛰고 code-reviewer Stage 2에서 코드 레벨 UI 검토로 대체.

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

### 9-3. Teammate Shutdown Sequence (MANDATORY — TeamDelete 전 필수)

**TeamDelete 전에 반드시 모든 팀원을 종료해야 합니다.**

```
1. config.json 읽기 → 생존 중인 팀원 목록 확인
   Read("~/.claude/teams/{team-name}/config.json")

2. 각 팀원에게 순차 shutdown_request 전송:
   SendMessage(type="shutdown_request", recipient="{teammate-name}",
               content="모든 WI 완료. 수고하셨습니다. 팀을 해산합니다.")

3. 각 팀원의 shutdown_response 수신 대기 (**타임아웃 60초**):
   - approve: true  → 팀원 종료 확인
   - approve: false → 팀원이 아직 작업 중 → 완료 후 재요청
   - 60초 내 무응답 → 비정상 종료로 간주, 해당 팀원 건너뛰고 다음 진행

4. 모든 팀원 종료 확인 후 TeamDelete 호출
```

> **⚠️ SendMessage(type="broadcast")로 일괄 종료 요청 금지** — N개 메시지 비용 발생 + requestId 관리 불가. 팀원별로 개별 shutdown_request 필수.

---

## Completion Checklist

**`.team/requirements.md` (확정 Registry) 기준으로** 최종 판정:

```
[FINAL REQUIREMENT VERIFICATION]
| R# | 요구사항 | 구현 상태 | 검증 |
전체: N/M 완료
```

- [ ] All R# items: ✅ (verifier 통과)
- [ ] All TaskList items: COMPLETED
- [ ] Final Reconciliation: PASS (C-3)
- [ ] Multi-Reviewer Gate: ALL PASSED
- [ ] Evidence-Based QA: 증거 기반 통과
- [ ] No CRITICAL/HIGH issues
- [ ] Worktree 브랜치 전부 머지/정리 완료
- [ ] Documentation updated
- [ ] `.team/` 디렉토리 삭제 (`rm -rf .team`)
- [ ] 모든 팀원에게 shutdown_request 전송 완료
- [ ] 모든 shutdown_response(approve: true) 수신 확인
- [ ] `TeamDelete` called (팀원 전원 종료 후에만)

**❌가 하나라도 있으면 CONTINUE WORKING.**

---

## Important Distinctions

### MCP ai-agents vs Olympus Project

| | MCP ai-agents | Olympus Project |
|---|---|---|
| **What** | `codex_analyze`, `ai_team_patch` 등 | `packages/codex/`, `gateway/src/gemini-advisor.ts` |
| **Purpose** | Analysis, proposals, consensus (이 팀 세션용) | Actual CLI process management (인프라) |

These are **completely separate systems**.
