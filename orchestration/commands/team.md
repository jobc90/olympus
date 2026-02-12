---
description: Team Engineering Protocol - Multi-AI team mode with automated workflow
---

[TEAM ENGINEERING PROTOCOL ACTIVATED]

$ARGUMENTS

## Overview

You are starting a **Team Engineering session**. This activates all On-Demand agents and the 5 core engineering mechanisms. Follow the steps below in order.

> **On-Demand agents are now UNLOCKED**: architect, analyst, planner, designer, researcher, code-reviewer, verifier, qa-tester, vision, test-engineer, build-fixer, git-master, api-reviewer, performance-reviewer, security-reviewer, style-reviewer

### Agent Roster (19 agents — all active)

Steps 1-2는 `Task` 도구로 개별 에이전트를 호출합니다 (팀 생성 전).
Step 3 이후부터는 `TeamCreate`로 생성된 팀 내에서 팀원으로 동작합니다.

| Agent | Model | Role | 호출 시점 |
|-------|-------|------|----------|
| **explore** | Haiku | 코드베이스 검색 | Step 1 (Task), Step 2 (Task) |
| **analyst** | Opus | 요구사항 분석 | Step 1 (Task) |
| **planner** | Opus | DAG 설계/실행 계획 | Step 2 (Task) |
| **architect** | Opus | 아키텍처 설계 (READ-ONLY) | Step 2 (Task), Step 4, Circuit Breaker |
| **researcher** | Sonnet | 외부 문서/API 조사 | Step 2 (Task/Team) |
| **designer** | Sonnet | UI/UX 설계 + 구현 | Step 3→5 (Team) |
| **executor** | Sonnet | 범용 구현 실행 | Step 3→5 (Team) |
| **test-engineer** | Sonnet | 테스트 전략/작성 | Step 3→5 (Team) |
| **build-fixer** | Sonnet | 빌드/컴파일 에러 해결 | Step 3→5 (Team) |
| **git-master** | Sonnet | Git 커밋/리베이스 | Step 3, Step 9 (Team) |
| **code-reviewer** | Opus | 코드 리뷰 (READ-ONLY) | Step 6 (Task) |
| **style-reviewer** | Haiku | 코드 스타일/컨벤션 검토 | Step 6 (Task) |
| **api-reviewer** | Sonnet | API 계약/호환성 검토 | Step 6 (Task, 조건부) |
| **security-reviewer** | Opus | 보안 취약점 검토 (READ-ONLY) | Step 6 (Task, 조건부) |
| **performance-reviewer** | Sonnet | 성능/복잡도 검토 | Step 6 (Task, 조건부) |
| **vision** | Sonnet | 시각적 검증 (READ-ONLY) | Step 6 (Task, 조건부) |
| **verifier** | Sonnet | 스펙 충족 검증 | Step 7 (Task) |
| **qa-tester** | Sonnet | CLI/서비스 테스트 | Step 8 (Task) |
| **writer** | Haiku | 문서화 | Step 9 (Task) |

### Circuit Breaker (모든 Step에서 적용)

> 이것은 순차 Step이 아닌 **모든 단계에서 적용되는 안전장치**입니다.

**어떤 Step에서든** 동일 이슈로 **3회 수정 실패** 시:

1. **Escalate** → `architect` 에이전트에게 전달 (원본 요구사항 R# + 3회 실패 로그)
2. **Architect judges**:
   - "Change approach" → 해당 Work Item 재설계 (시도 카운터 리셋)
   - "Partial fix possible" → architect의 구체적 가이드 적용
   - "Fundamental limitation" → 사용자에게 옵션과 함께 보고
3. **절대** 같은 접근법을 3회 이상 반복하지 않음

---

## Step 0: Skill & Plugin Discovery

Before any work, discover relevant tools:

1. Run `find-skills` to search for skills matching the task domain
2. Check installed plugins: `postgres-best-practices`, `ui-ux-pro-max`, `vercel-react-best-practices`
3. Activate relevant skills for the session (e.g., `frontend-ui-ux` for UI work, `git-master` for multi-file changes)

**Output**: List of activated skills/plugins for this session.

---

## Step 1: Requirement Registry (MANDATORY — ZERO LOSS TOLERANCE)

> **⛔ 이 단계를 건너뛰거나 축약하면 PROTOCOL VIOLATION입니다.**
> **사용자의 모든 요구사항을 하나도 빠짐없이 추출해야 합니다.**

### 1-1. 원문 보존

사용자의 `$ARGUMENTS` 원문을 그대로 인용합니다. 요약하지 않습니다.

### 1-2. 요구사항 개별 추출

사용자 입력에서 **모든 개별 요구사항**을 하나씩 분리하여 번호를 부여합니다.

추출 규칙:
- **한 문장에 여러 요구가 있으면 각각 분리** (예: "A하고 B해라" → R1: A, R2: B)
- **암시적 요구도 추출** (예: "X를 Y처럼" → R1: X 구현, R2: Y와 동일한 방식)
- **수식어/조건도 별도 요구로 분리** (예: "큰 빨간 버튼" → R1: 버튼 추가, R2: 크기=큰, R3: 색상=빨간)
- **추출 단위**: 독립적으로 완료/미완료를 판정할 수 있는 최소 단위

형식:
```
| ID | 요구사항 (원문 그대로) | 출처 (원문 위치) |
|----|----------------------|----------------|
| R1 | ... | "..." 부분 |
| R2 | ... | "..." 부분 |
| R3 | ... | "..." 부분 |
```

### 1-3. `analyst` + `explore` — 병렬 심층 분석

다음 두 에이전트를 **동시에** `Task` 도구로 호출합니다:

**`analyst` (Task)** — 요구사항 심층 분석:
- **암시적 요구 발굴**: 사용자가 명시하지 않았지만 논리적으로 필요한 요구사항 (예: "삭제 버튼" → 확인 다이얼로그 필요?)
- **요구 간 충돌 감지**: R# 간 모순이나 상충 (예: "빠르게" vs "모든 데이터 로드")
- **범위 경계 명확화**: 어디까지가 이 작업의 범위인지 경계 식별

analyst가 발견한 암시적 요구는 `R#-implicit` 태그를 붙여 Registry에 추가하되, 사용자 확인 후 확정합니다.

**`explore` (Task)** — 관련 코드베이스 조사:
- 각 R#에 관련된 **기존 파일/함수/패턴** 목록 조사
- **수정 대상 파일** 사전 식별
- 기존 코드의 **컨벤션/패턴** 파악 (후속 구현에서 일관성 유지)

**Output**: 관련 파일 매핑 (`R1 → src/components/X.tsx:L42`, `R2 → src/hooks/Y.ts`)

### 1-4. 누락 검증

두 에이전트의 결과를 종합한 후 반드시 다음을 확인합니다:

```
[REQUIREMENT COVERAGE CHECK]
원문 총 문장 수: N
추출된 요구사항 수: M (명시 + analyst 발견 암시적)
누락 여부: ✅ 없음 / ⚠️ 재검토 필요

원문을 처음부터 끝까지 다시 읽으며 빠진 요구사항이 없는지 확인:
- 문장 1: "..." → R1, R2 ✓
- 문장 2: "..." → R3 ✓
- ...
```

**⚠️ M < (원문에서 식별 가능한 개별 요구 수) 이면 재추출 필수**

### 1-5. 사용자 확인

추출된 Requirement Registry를 사용자에게 보여주고, 빠진 것이 없는지 확인합니다.

**Output**: 번호가 매겨진 Requirement Registry 테이블 + 관련 파일 매핑. 이후 모든 단계에서 이 R# 번호로 요구사항을 참조합니다.

---

## Step 2: Work Decomposition (Traceable DAG)

> **모든 Work Item은 반드시 하나 이상의 R# 번호에 매핑되어야 합니다.**
> **어떤 R#에도 매핑되지 않은 Work Item = 불필요한 작업 (삭제).**
> **어떤 Work Item에도 매핑되지 않은 R# = 누락 (Work Item 추가 필수).**

### 2-1. `planner` 에이전트 (Task) — 작업 분해 설계

`planner` 에이전트에게 Requirement Registry + explore 결과를 전달하여:

- **Feature Sets 정의** (개수 제한 없음 — 요구사항에 맞게)
  - Name, description, acceptance criteria
  - **Traced Requirements**: 이 Feature Set이 충족하는 R# 목록
  - Priority (P0-P3), estimated complexity (S/M/L/XL)
- **Work Items by Layer** 분해

| Layer | Examples |
|-------|---------|
| **UI** | Components, pages, styles, interactions |
| **Domain** | Business logic, validation, data models |
| **Infra** | API endpoints, database, configuration |
| **Integration** | Cross-cutting, third-party, inter-module |

각 Work Item에 반드시 `Fulfills: R#, R#` 필드를 포함합니다.

### 2-2. `researcher` 에이전트 (Task) — 기술 조사 (필요 시)

외부 라이브러리, API 문서, 새로운 기술 스택이 필요한 Work Item이 있으면:
- `researcher` 에이전트에게 해당 기술의 공식 문서, 사용법, 제약 조건 조사 위임
- 조사 결과를 해당 Work Item에 첨부

**Skip if**: 기존 프로젝트 패턴으로 해결 가능한 경우.

### 2-3. Traceability Matrix (MANDATORY)

모든 R#이 빠짐없이 커버되는지 매트릭스로 검증합니다:

```
| R# | Work Item(s) | Status |
|----|-------------|--------|
| R1 | WI-1, WI-3  | ✅ Covered |
| R2 | WI-2        | ✅ Covered |
| R3 | (없음)       | ❌ MISSING → Work Item 추가 필수 |
```

**❌ MISSING이 하나라도 있으면 Work Item을 추가하여 해소한 후 다음 단계로 진행합니다.**

### 2-4. Dependency Analysis
- **Coupling Matrix**: Map dependencies between Work Items
- **Execution Order**: Sequence to minimize blocking, maximize parallelism

### 2-5. `architect` 에이전트 (Task) — Quality Gate

`architect` 에이전트에게 전체 DAG를 전달하여 리뷰:
- 아키텍처 적합성, 의존성 정확성, 리스크 식별
- CRITICAL/HIGH 이슈는 해소 후 진행

**Output**: TaskCreate for each Work Item with dependencies (addBlockedBy). 각 Task description에 `Fulfills: R#` 명시.

---

## Step 3: Team Creation & Execution Assignment

```
TeamCreate(team_name="{task-slug}", description="{task description}")
```

Spawn teammates based on Work Items:
- **UI Work Items** → `designer` agent
- **Domain/Infra Work Items** → `executor` agent
- **Research needed** → `researcher` agent
- **Complex architecture** → `architect` agent (READ-ONLY advisor)
- **Test creation** → `test-engineer` agent
- **Build/lint issues** → `build-fixer` agent
- **Git operations** → `git-master` agent

Assign tasks via TaskUpdate with `owner`.

**팀원에게 작업을 전달할 때, 해당 Work Item의 원문 요구사항(R#)을 그대로 포함하여 전달합니다. 요약본이 아닌 원문을 전달합니다.**

---

## Step 4: Consensus Protocol (if architectural decisions needed)

For significant design decisions, seek AI consensus:

1. **DRAFT**: Create initial proposal
2. **REVIEW**: `codex_analyze` MCP → Codex reviews
   - `[AGREE]` → Proceed
   - `[SUGGEST]` → Consider improvement (Claude decides)
   - `[DISAGREE]` → Must resolve
3. **RESOLVE**: Max 2 rounds of disagreement → user decides
4. **CONFIRM**: Log consensus decision

**Skip if**: Bug fixes, small features, well-understood patterns.

---

## Step 5: 2-Phase Development (Execution)

### Phase A — Proposal Collection
- `ai_team_patch` MCP → Collect proposals from Gemini (frontend) + Codex (backend)
- Provide context: what to build, existing patterns, constraints

### Phase B — Merge & Implement
- Review proposals, pick best parts from each
- Log design decisions: what was chosen, why, what was rejected
- Teammates implement via assigned tasks (`designer`, `executor`, `test-engineer`, `build-fixer`)
- Leader reviews results (no direct coding)

**Skip if**: Single-file changes, clear implementation path.

---

## Step 6: Multi-Reviewer Gate

> 단순히 `code-reviewer`만 돌리지 않습니다. 변경의 성격에 따라 복수 리뷰어를 **병렬** `Task` 호출합니다.

### 6-1. `code-reviewer` (Task) — 2-Stage Core Review (항상 실행)

- **Stage 1 — Spec Compliance**: Requirement Registry의 각 R#이 충족되었는지 확인
  - FAIL → **Step 5로 복귀** (Stage 2 생략)
- **Stage 2 — Code Quality**: Architecture, DRY, error handling, maintainability
  - Severity: CRITICAL / HIGH / MEDIUM / LOW
  - CRITICAL or HIGH → **Step 5로 복귀**하여 수정 후 Step 6 재실행

### 6-2. `style-reviewer` (Task) — 코드 스타일 검토 (항상 실행, 6-1과 병렬)

- 네이밍 컨벤션 (camelCase, PascalCase 등)
- 포매팅 일관성
- 프로젝트 기존 패턴과의 일관성
- lint/tsconfig 규칙 위반 여부

### 6-3. 조건부 전문 리뷰어 (해당 시 6-1/6-2와 병렬 Task 실행)

| 조건 | 리뷰어 | 검토 범위 |
|------|--------|----------|
| API 엔드포인트 변경 있음 | `api-reviewer` | 계약 호환성, 버저닝, 에러 시맨틱 |
| 보안 관련 코드 변경 있음 | `security-reviewer` | OWASP Top 10, secrets, unsafe patterns |
| 성능 민감 코드 변경 있음 | `performance-reviewer` | 복잡도, 메모리, 핫스팟 |
| UI 컴포넌트 변경 있음 | `vision` | 스크린샷 캡처 → 시각적 비교 검증 |

### 6-4. 리뷰 결과 종합

모든 리뷰어의 이슈를 통합하여 severity별 정리:
- **CRITICAL** → 즉시 수정 필수 → **Step 5로 복귀**
- **HIGH** → 수정 후 진행 → **Step 5로 복귀**
- **MEDIUM** → 가능하면 수정 (Step 7 진행 가능)
- **LOW** → 기록만 (후순위)

**복귀 흐름**: Step 6 FAIL → Step 5 (수정) → Step 6 (재리뷰). Circuit Breaker 적용 — 동일 이슈 3회 실패 시 architect에 escalate.

---

## Step 7: `verifier` (Task) — Spec Fulfillment Verification

> Code Review와 별도로, **요구사항 충족 여부**를 증거 기반으로 최종 검증합니다.

`verifier` 에이전트에게 다음을 전달합니다:
- Requirement Registry (전체 R# 목록)
- 구현 완료된 코드 diff
- Step 6 리뷰 결과

verifier는 각 R#에 대해:

```
| R# | 요구사항 | 충족 여부 | 증거 |
|----|---------|:--------:|------|
| R1 | ... | ✅ | {파일}:{라인} 에서 구현 확인 |
| R2 | ... | ❌ | {사유}: 구현 누락/불완전 |
| R3 | ... | ⚠️ | 부분 충족 — {설명} |
```

- **❌가 있으면** → **Step 5로 복귀**하여 해당 Work Item 수정 → Step 6 → Step 7 재실행
- **⚠️가 있으면** → 사용자에게 보고 후 판단 (진행/수정 결정)

---

## Step 8: Evidence-Based QA

Delegate to `qa-tester` (Task):

- **Rule**: Always `capture-pane` BEFORE making assertions
- **Forbidden**: "It should have passed" without evidence
- **Session naming**: `qa-{service}-{test}-{timestamp}`
- **Cleanup**: Always kill-session after test (even on failure)

QA 실패 시:
- 실패 증거(캡처 출력)를 첨부하여 **Step 5로 복귀** → 수정 → Step 6~8 재실행
- Circuit Breaker 적용 — 동일 테스트 3회 실패 시 architect에 escalate

---

## Step 9: Finalization

### 9-1. `writer` (Task) — 변경사항 문서화

구현 완료 후 `writer` 에이전트에게 위임:
- 변경된 파일/기능에 대한 **CHANGELOG 항목** 작성
- 새로운 API/컴포넌트가 추가된 경우 **관련 문서 업데이트**
- 필요 시 AGENTS.md, README 업데이트

**Skip if**: 문서화가 불필요한 소규모 변경.

### 9-2. `git-master` (Team) — 커밋 정리 (필요 시)

여러 팀원의 변경이 산발적으로 커밋된 경우:
- atomic commit으로 정리
- 커밋 메시지 스타일 통일
- 프로젝트의 기존 커밋 컨벤션 준수

**Skip if**: 이미 깔끔하게 커밋된 경우.

---

## Completion Checklist

Before declaring done, verify **Requirement Registry 기준으로** 완료 여부를 판정합니다:

```
[FINAL REQUIREMENT VERIFICATION]
| R# | 요구사항 | 구현 상태 | 검증 방법 |
|----|---------|----------|----------|
| R1 | ...     | ✅/❌    | verifier 검증 완료 |
| R2 | ...     | ✅/❌    | verifier 검증 완료 |
| ...| ...     | ...      | ...      |

전체: N/M 완료
```

추가 확인:
- [ ] All R# items: ✅ 구현 완료 (verifier 검증 통과)
- [ ] All TaskList items: COMPLETED
- [ ] Multi-Reviewer Gate: ALL PASSED
- [ ] Evidence-Based QA: All assertions with evidence
- [ ] No unresolved CRITICAL/HIGH issues
- [ ] Documentation updated (writer)
- [ ] `TeamDelete` called to clean up

**❌가 하나라도 있으면 CONTINUE WORKING.**

---

## Important Distinctions

### MCP ai-agents (Team Protocol tools) vs Olympus Codex/Gemini

| | MCP ai-agents | Olympus Project |
|---|---|---|
| **What** | `codex_analyze`, `gemini_analyze`, `ai_team_patch` | `packages/codex/`, `gateway/src/gemini-advisor.ts` |
| **Purpose** | Analysis, proposals, consensus | Actual CLI process management |
| **Invocation** | MCP tool calls in Claude session | Gateway API, WebSocket |
| **Context** | This Team Engineering session | Olympus infrastructure |

These are **completely separate systems**. Do not confuse them.
