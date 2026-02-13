---
description: Team Engineering Protocol v3 — AgentTeam parallel execution with file ownership
---

[TEAM ENGINEERING PROTOCOL v3 ACTIVATED]

$ARGUMENTS

## Overview

You are starting a **Team Engineering session v3**. This activates all On-Demand agents and applies the **Claude Code AgentTeam parallel execution architecture** — file ownership separation + wave-based dispatch.

> **On-Demand agents are now UNLOCKED**: architect, analyst, planner, designer, researcher, code-reviewer, verifier, qa-tester, vision, test-engineer, build-fixer, git-master, api-reviewer, performance-reviewer, security-reviewer, style-reviewer

### Core Architecture

| Component | Role |
|-----------|------|
| **Team Lead** | 작업 분배 & 조율 ONLY (코딩 금지), File Ownership 관리, Wave dispatch, Reconciliation |
| **Teammates** | 독립 인스턴스, 할당된 OWNED FILES만 수정, SendMessage로 리더와 소통 |
| **Task List** | Wave-based 실행, addBlockedBy → 자동 해제, 파일 소유권 per Work Item |

**핵심 원칙**: 자동 머지나 파일 잠금 대신, **작업 설계로 파일 충돌을 원천 차단**합니다.

### Agent Roster (19 custom agents in `.claude/agents/`)

> **반드시 커스텀 에이전트 이름을 `subagent_type`으로 사용하세요.** 이래야 각 에이전트의 모델, 도구 제한, 전문 지침이 적용됩니다.

Steps 1-2는 `Task(subagent_type="{agent-name}")` 으로 개별 호출 (팀 생성 전).
Step 3 이후는 `Task(subagent_type="{agent-name}", team_name=..., name="{agent-name}")` 으로 팀원 생성.

| Agent (= subagent_type) | Model | Write? | Role | 호출 시점 |
|--------------------------|-------|:------:|------|----------|
| **explore** | Haiku | ❌ | 코드베이스 검색 | Step 1-2 (Task) |
| **analyst** | Opus | ❌ | 요구사항 분석 | Step 1 (Task) |
| **planner** | Opus | ❌ | DAG 설계 | Step 2 (Task) |
| **architect** | Opus | ❌ | 아키텍처 설계 (READ-ONLY) | Step 2, 4, Circuit Breaker |
| **researcher** | Sonnet | ❌ | 외부 문서/API 조사 | Step 2 (Task/Team) |
| **designer** | Sonnet | ✅ | UI/UX 설계 + 구현 | Step 3→5 (Team) |
| **executor** | Sonnet | ✅ | 범용 구현 실행 | Step 3→5 (Team) |
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
| **writer** | Haiku | ✅ | 문서화 | Step 9 (Task) |

### Cross-cutting Mechanisms

**Circuit Breaker** — 어떤 Step에서든 동일 이슈 수정 실패 시:
- 실패마다 `TaskUpdate(taskId, metadata: { "failCount": N, "lastError": "..." })` 로 카운트 **영구 기록**
- **failCount ≥ 3** → `architect`에게 escalate (R# 원문 + metadata의 실패 로그 3건)
- Architect 판단: 접근법 변경 / 부분 수정 / 근본 한계 → 사용자 보고
- 같은 접근법 3회 이상 반복 금지

**File Ownership Invariant** — 동일 시점에 1파일 = 최대 1팀원. 위반 시 Last Write Wins로 데이터 손실. 충돌 해결법은 Step 2-4, 런타임 검증은 Step 5 Phase C 참조.

**Teammate Crash Recovery** — 팀원 무응답 시:
1. 30초 무응답 → `SendMessage` 재시도
2. 60초 무응답 → 새 팀원 spawn (동일 subagent_type) + 동일 WI 재할당
3. 부분 수정 존재 시 → `git checkout -- {OWNED_FILES}` 후 clean state에서 재시작

---

## Step 0: Session Setup

1. `find-skills`로 관련 스킬 검색 + 설치된 플러그인 확인
2. **`.team/` 상태 디렉토리 생성** — 컨텍스트 압축에도 R# Registry, Ownership Matrix 등 핵심 상태를 보존:
   ```bash
   mkdir -p .team && grep -qxF '.team/' .gitignore 2>/dev/null || echo '.team/' >> .gitignore
   ```

---

## Step 1: Requirement Registry (MANDATORY — ZERO LOSS TOLERANCE)

> **⛔ 이 단계를 건너뛰거나 축약하면 PROTOCOL VIOLATION입니다.**

### 1-1. 원문 보존

사용자의 `$ARGUMENTS` 원문을 그대로 인용합니다. 요약하지 않습니다.

### 1-2. 요구사항 개별 추출

사용자 입력에서 **모든 개별 요구사항**을 분리하여 R# 번호를 부여합니다.

추출 규칙:
- 한 문장에 여러 요구 → 각각 분리 (예: "A하고 B해라" → R1: A, R2: B)
- 암시적 요구도 추출 (예: "X를 Y처럼" → R1: X 구현, R2: Y와 동일한 방식)
- **추출 단위**: 독립적으로 완료/미완료를 판정할 수 있는 최소 단위

```
| ID | 요구사항 (원문 그대로) | 출처 (원문 위치) |
|----|----------------------|----------------|
| R1 | ... | "..." 부분 |
```

### 1-3. `analyst` + `explore` — 병렬 심층 분석

두 에이전트를 **동시에** `Task` 도구로 호출:

- **`Task(subagent_type="analyst")`**: 암시적 요구 발굴, 요구 간 충돌 감지, 범위 경계 명확화. 발견한 암시적 요구는 `R#-implicit` 태그로 Registry에 추가 (사용자 확인 후 확정)
- **`Task(subagent_type="explore")`**: 각 R#의 관련 파일/함수/패턴 조사, 수정 대상 파일 사전 식별, 기존 컨벤션 파악

### 1-4. 누락 검증

```
[REQUIREMENT COVERAGE CHECK]
원문 총 문장 수: N / 추출된 요구사항 수: M / 누락: ✅/⚠️
원문을 처음부터 끝까지 재확인:
- 문장 1: "..." → R1, R2 ✓
- ...
```

**M < (식별 가능한 개별 요구 수) 이면 재추출 필수**

### 1-5. 사용자 확인

Requirement Registry를 사용자에게 보여주고 빠진 것이 없는지 확인합니다.

### 1-6. Registry 파일 저장

확정된 R# Registry를 `.team/requirements.md`에 저장:

```bash
cat > .team/requirements.md << 'EOF'
| R# | 요구사항 (원문) | 출처 | 관련 파일 |
|----|----------------|------|----------|
| R1 | ... | ... | ... |
EOF
```

**이후 R# 참조 시 이 파일을 `Read`하여 원문 확인.** 컨텍스트 압축 후에도 원문 유실을 방지합니다.

**Output**: `.team/requirements.md` 파일. 이후 모든 단계에서 R# 번호로 참조.

---

## Step 2: Work Decomposition (Traceable DAG)

> **R#에 매핑되지 않은 Work Item = 삭제. Work Item에 매핑되지 않은 R# = WI 추가 필수.**

### 2-1. `Task(subagent_type="planner")` — 작업 분해

Requirement Registry + explore 결과를 전달하여:

- **Feature Sets 정의** (개수 제한 없음): Name, acceptance criteria, `Traced Requirements: R#`, Priority (P0-P3), Complexity (S/M/L/XL)
- **Work Items by Layer** 분해: UI / Domain / Infra / Integration
- 각 Work Item에 `Fulfills: R#, R#` 필드 필수

### 2-2. `Task(subagent_type="researcher")` — 기술 조사 (필요 시)

외부 라이브러리/API가 필요한 WI가 있으면 조사 위임. **Skip if**: 기존 패턴으로 해결 가능.

### 2-3. Traceability Matrix (MANDATORY)

```
| R# | Work Item(s) | Status |
|----|-------------|--------|
| R1 | WI-1, WI-3  | ✅ Covered |
| R3 | (없음)       | ❌ MISSING → WI 추가 필수 |
```

**❌ MISSING이 하나라도 있으면 WI를 추가하여 해소 후 진행.**

### 2-4. File Ownership Analysis & Dependency Ordering

#### A. File Ownership Matrix (MANDATORY)

explore가 수집한 파일 매핑으로, 각 WI가 수정할 파일을 매트릭스로 작성:

```
| 파일 | WI-1 | WI-2 | WI-3 | Owner |
|------|:----:|:----:|:----:|-------|
| src/api/auth.ts      | ✏️ |    |    | WI-1 |
| src/components/Login  |    | ✏️ |    | WI-2 |
| src/models/user.ts   | ✏️ |    | ✏️ | ⚠️ CONFLICT |
```

Matrix를 `.team/ownership.json`에 저장 (Phase C Reconciliation 자동 검증용):

```json
{
  "WI-1": ["src/api/auth.ts"],
  "WI-2": ["src/components/Login.tsx"],
  "WI-3": ["src/models/user.ts"]
}
```

#### B. Conflict Resolution

동일 파일을 2+ WI가 수정하면 **반드시** 해결:

| 해결법 | 조건 | 방법 |
|--------|------|------|
| **직렬화** | 수정 범위 독립적 | `addBlockedBy`로 순서 강제 |
| **병합** | 수정 범위 밀접 | 두 WI를 하나로 통합 |
| **분할** | 파일 분리 가능 | 리팩토링으로 각 WI가 다른 파일 담당 |

**⚠️ CONFLICT가 0이 될 때까지 Step 3 진입 불가.**

#### C. Execution Waves

CONFLICT 해소 후, 파일 겹침 없는 WI를 Wave로 그룹화:

```
Wave 1: [WI-1, WI-2, WI-4] ← 병렬 (파일 겹침 없음)
Wave 2: [WI-3]              ← Wave 1 완료 후 (blockedBy)
```

### 2-5. `Task(subagent_type="architect")` — Quality Gate

전체 DAG + File Ownership Matrix를 `architect`에게 전달하여 리뷰. CRITICAL/HIGH 이슈는 해소 후 진행.

**Output**: TaskCreate for each WI with dependencies (addBlockedBy). 각 Task에 `Fulfills: R#` 명시.

---

## Step 3: Team Creation & Task Structure

### 3-1. Team Creation

```
TeamCreate(team_name="{task-slug}", description="{task description}")
```

### 3-2. Teammate Spawning

WI 레이어에 따라 **필요한 역할만** 생성. **반드시 커스텀 에이전트 이름을 subagent_type으로 사용**:

| Layer | subagent_type | 커스텀 에이전트 정의 |
|-------|---------------|---------------------|
| UI | `designer` | `.claude/agents/designer.md` — UI/UX 전문, Sonnet |
| Domain/Infra | `executor` | `.claude/agents/executor.md` — 범용 구현, Sonnet |
| Research | `researcher` | `.claude/agents/researcher.md` — 문서/API 조사, Sonnet |
| Test | `test-engineer` | `.claude/agents/test-engineer.md` — TDD/피라미드, Sonnet |
| Build | `build-fixer` | `.claude/agents/build-fixer.md` — 최소 diff, Sonnet |
| Git | `git-master` | `.claude/agents/git-master.md` — atomic commit, Sonnet |

```
Task(subagent_type="designer", team_name="{team}", name="designer", prompt="...")
Task(subagent_type="executor", team_name="{team}", name="executor", prompt="...")
```

### 3-3. Task Description with File Ownership

**각 WI의 Task description에 반드시 포함하는 3가지**:

1. **R# 원문** (요약본 아닌 원문)
2. **OWNED FILES** (수정 허용 파일 목록)
3. **BOUNDARY** (소유 파일 외 수정 금지, 필요 시 리더에게 SendMessage)

```
[WI-1 — 로그인 UI 구현] Fulfills: R2, R5

R2: "로그인 페이지에 소셜 로그인 버튼 추가" (원문)
R5: "로그인 폼 유효성 검사" (원문)

OWNED FILES:
- src/components/auth/LoginForm.tsx (신규)
- src/components/auth/SocialLoginButtons.tsx (신규)

⛔ BOUNDARY: 위 파일 외 수정 금지. 공유 타입 필요 시 리더에게 SendMessage.
```

---

## Step 4: Consensus Protocol (아키텍처 결정 필요 시)

1. **DRAFT**: 초기 제안 작성
2. **REVIEW**: `codex_analyze` MCP → Codex 리뷰 ([AGREE]/[SUGGEST]/[DISAGREE])
3. **RESOLVE**: 최대 2라운드 → 합의 불가 시 사용자 결정
4. **CONFIRM**: 합의 결정 기록

**Skip if**: 버그 수정, 소규모 기능, 기존 패턴 내 작업.

---

## Step 5: Parallel Execution

### Phase A — Proposal Collection (MCP)

`ai_team_patch` MCP → Gemini (프론트) + Codex (백엔드) 제안 수집. **Skip if**: 단일 파일, 명확한 구현 경로.

### Phase B — Wave-Based Team Execution

Step 2-4의 Wave 순서대로 팀원에게 할당하고, Wave 단위로 실행 + 검증:

```
for each Wave:
  1. Wave 내 모든 WI를 담당 팀원에게 동시 할당 (TaskUpdate → in_progress)
  2. 팀원들 병렬 작업
  3. 완료 시 SendMessage 수신 → 결과 검증
  4. Wave 전체 완료 확인
  5. Leader Reconciliation (Phase C)
  6. 다음 Wave 진행
```

**리더 역할** (실행 중): 팀원 질문 응답, Shared File Request 처리, 결과 검증. ⛔ 직접 코딩 금지.

**Shared File Request**: 팀원이 OWNED FILES 외 수정 필요 시 리더에게 SendMessage → 리더가 해당 파일 소유 팀원에게 위임 또는 소유권 재배정.

### Phase C — Leader Reconciliation (매 Wave 완료 후)

`.team/ownership.json`과 `git diff`를 대조하여 검증:

```bash
# 1. 파일 소유권 위반 검증 — ownership.json의 WI별 파일 목록과 실제 변경 파일 대조
CHANGED=$(git diff --name-only HEAD~1)
# → 해당 Wave에 할당된 WI의 OWNED FILES에 없는 파일이 변경되었으면 ⚠️ VIOLATION

# 2~4. 빌드/타입/테스트
pnpm build && pnpm lint && pnpm test
```

결과 판정:
- 소유권 위반 → `git checkout -- {file}` 후 소유 팀원에게 재위임
- 빌드 실패 → `build-fixer` 위임
- 타입/테스트 실패 → 관련 팀원 수정 지시
- **→ ✅ PASS / ❌ FAIL** (FAIL 시 Wave 재실행, Circuit Breaker 적용)

---

## Step 6: Multi-Reviewer Gate

복수 리뷰어를 **병렬** `Task` 호출합니다.

### 6-1. `Task(subagent_type="code-reviewer")` — 2-Stage Core Review (항상 실행)

- **Stage 1 — Spec Compliance**: R# 충족 확인. FAIL → **Step 5로 복귀** (Stage 2 생략)
- **Stage 2 — Code Quality**: Architecture, DRY, error handling. CRITICAL/HIGH → **Step 5로 복귀**

### 6-2. `Task(subagent_type="style-reviewer")` (항상 실행, 6-1과 병렬)

네이밍 컨벤션, 포매팅 일관성, 프로젝트 패턴, lint 규칙 검토.

### 6-3. 조건부 전문 리뷰어 (6-1/6-2와 병렬 Task 호출)

| 조건 | subagent_type | 검토 범위 |
|------|---------------|----------|
| API 변경 | `api-reviewer` | 계약 호환성, 버저닝, 에러 시맨틱 |
| 보안 관련 | `security-reviewer` | OWASP Top 10, secrets |
| 성능 민감 | `performance-reviewer` | 복잡도, 메모리, 핫스팟 |
| UI 변경 | `vision` | 스크린샷 → 시각적 비교 |

### 6-4. 결과 종합

- **CRITICAL/HIGH** → **Step 5로 복귀** (수정 후 Step 6 재실행)
- **MEDIUM** → 가능하면 수정 (Step 7 진행 가능)
- **LOW** → 기록만

Circuit Breaker 적용 — 동일 이슈 3회 실패 시 architect escalate.

---

## Step 7: `Task(subagent_type="verifier")` — Spec Fulfillment Verification

> Code Review와 별도로, R# 충족을 증거 기반으로 최종 검증합니다.

`verifier`에게 전달: `.team/requirements.md` (R# Registry 원본) + 코드 diff + Step 6 리뷰 결과.

```
| R# | 요구사항 | 충족 | 증거 |
|----|---------|:----:|------|
| R1 | ... | ✅ | {파일}:{라인} 구현 확인 |
| R2 | ... | ❌ | 구현 누락 |
| R3 | ... | ⚠️ | 부분 충족 — {설명} |
```

- **❌** → **Step 5로 복귀** → Step 6 → Step 7 재실행
- **⚠️** → 사용자에게 보고 후 판단

---

## Step 8: Evidence-Based QA

`Task(subagent_type="qa-tester")`에게 위임:

- Always `capture-pane` BEFORE asserting (가정 기반 판정 금지)
- Session naming: `qa-{service}-{test}-{timestamp}`
- Cleanup: Always kill-session (실패 시에도)

실패 시: 캡처 증거 첨부 → **Step 5로 복귀**. Circuit Breaker 적용.

---

## Step 9: Finalization

### 9-1. `Task(subagent_type="writer")` — 문서화 (필요 시)
CHANGELOG, API 문서, AGENTS.md/README 업데이트.

### 9-2. `git-master` (Team) — 커밋 정리 (필요 시)
여러 팀원의 산발적 커밋 → atomic commit, 메시지 통일, 기존 컨벤션 준수.

---

## Completion Checklist

**Requirement Registry 기준으로** 최종 판정:

```
[FINAL REQUIREMENT VERIFICATION]
| R# | 요구사항 | 구현 상태 | 검증 |
|----|---------|:--------:|------|
| R1 | ...     | ✅/❌    | verifier 통과 |
전체: N/M 완료
```

- [ ] All R# items: ✅ (verifier 통과)
- [ ] All TaskList items: COMPLETED
- [ ] All Wave Reconciliation: PASS
- [ ] Multi-Reviewer Gate: ALL PASSED
- [ ] Evidence-Based QA: 증거 기반 통과
- [ ] No CRITICAL/HIGH issues
- [ ] Documentation updated
- [ ] `.team/` 디렉토리 삭제 (`rm -rf .team`)
- [ ] `TeamDelete` called

**❌가 하나라도 있으면 CONTINUE WORKING.**

---

## Important Distinctions

### MCP ai-agents vs Olympus Codex/Gemini

| | MCP ai-agents | Olympus Project |
|---|---|---|
| **What** | `codex_analyze`, `ai_team_patch` 등 | `packages/codex/`, `gateway/src/gemini-advisor.ts` |
| **Purpose** | Analysis, proposals, consensus | Actual CLI process management |
| **Context** | This Team Engineering session | Olympus infrastructure |

These are **completely separate systems**.
