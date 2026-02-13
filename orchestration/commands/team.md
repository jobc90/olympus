---
description: Team Engineering Protocol v3.1 — DAG parallel execution + streaming reconciliation + shared file zone
---

[TEAM ENGINEERING PROTOCOL v3.1 ACTIVATED]

$ARGUMENTS

## Overview

You are starting a **Team Engineering session v3.1**. This activates all On-Demand agents and applies the **Claude Code AgentTeam parallel execution architecture** — file ownership separation + WI-level DAG parallel execution + streaming reconciliation.

> **On-Demand agents are now UNLOCKED**: architect, analyst, planner, designer, researcher, code-reviewer, verifier, qa-tester, vision, test-engineer, build-fixer, git-master, api-reviewer, performance-reviewer, security-reviewer, style-reviewer

### Core Architecture

| Component | Role |
|-----------|------|
| **Team Lead** | 작업 분배 & 조율 ONLY (코딩 금지), File Ownership 관리, Shared File 조율, Reconciliation |
| **Teammates** | 독립 인스턴스, 할당된 OWNED FILES만 수정, SHARED는 리더 경유, SendMessage 소통 |
| **Task List** | WI-level DAG 실행, addBlockedBy → 자동 해제, 파일 소유권 per Work Item |

**핵심 원칙**: 자동 머지나 파일 잠금 대신, **작업 설계로 파일 충돌을 원천 차단**합니다.

### Agent Roster (19 custom agents in `.claude/agents/`)

> **반드시 커스텀 에이전트 이름을 `subagent_type`으로 사용하세요.** 이래야 각 에이전트의 모델, 도구 제한, 전문 지침이 적용됩니다.

Steps 1-2는 `Task(subagent_type="{agent-name}")` 으로 개별 호출 (팀 생성 전).
Step 3 이후는 `Task(subagent_type="{agent-name}", team_name=..., name="{agent-name}-{N}")` 으로 팀원 생성 (동일 역할 복수 가능).

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

**File Ownership Invariant** — 동일 시점에 1파일 = 최대 1팀원. SHARED 파일은 리더/전담자만 수정. 충돌 해결법은 Step 2-4, 런타임 검증은 Step 5 Phase C (3-Tier) 참조.

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
> 사용자 입력은 깔끔한 요구사항 리스트일 수도 있고, 에러로그 500줄 + "고쳐줘"일 수도 있습니다.
> 어떤 형태든 **실행 가능한 요구사항 리스트로 해석**한 뒤, **1회 검증 → 사용자 확인 → 확정**합니다.
> 확정 후에는 요구사항 리스트만 참조합니다. 원문은 아카이브합니다.

### 1-0. 원문 아카이브 (FIRST ACTION)

`$ARGUMENTS` 전문을 `.team/user-input.md`에 저장합니다. 이 파일은 **아카이브**입니다 — 이후 단계에서 능동적으로 참조하지 않고, 분쟁이나 누락 의심 시에만 열람합니다.

```bash
cat > .team/user-input.md << 'ORIGINAL_EOF'
{$ARGUMENTS 전문}
ORIGINAL_EOF
```

### 1-1. 입력 분류 & 해석

사용자 입력의 형태를 판단하고, 그에 맞게 **실행 가능한 요구사항**으로 해석합니다:

| 입력 형태 | 해석 방법 | 예시 |
|-----------|----------|------|
| **명확한 요구 리스트** | 각 항목을 R#으로 직접 매핑 | "A 추가, B 수정, C 삭제" → R1, R2, R3 |
| **모호한 설명** | 의도를 파악하여 구체적 요구로 변환 | "더 빠르게" → R1: 응답시간 50% 단축 (근거: ...) |
| **에러로그/스택트레이스** | 로그 분석 → 수정 대상 도출 | 500줄 로그 → R1: auth.ts:42 TypeError 수정, R2: ... |
| **스크린샷/참조** | 시각적/맥락적 분석 → 요구 도출 | "이 화면처럼" → R1: 레이아웃 변경, R2: 색상 적용 |
| **혼합** | 위 방법을 조합 | 설명 + 로그 → 명시적 R# + 진단 R# |

**핵심 원칙**: R# 설명은 **"완료 여부를 판정할 수 있는"** 문장이어야 합니다.
- ❌ `에러 고치기` (모호 — 뭘 고쳐야 완료인가?)
- ✅ `auth.ts:42의 null 참조 TypeError 수정` (검증 가능)

### 1-2. 요구사항 개별 추출

```
| R# | 요구사항 (해석된 실행 가능 설명) | 근거 | 유형 |
|----|-------------------------------|------|------|
| R1 | 대시보드에 실시간 차트 컴포넌트 추가 | 원문: "차트를 추가하고" | explicit |
| R2 | 차트 3종류 지원 (라인, 바, 파이) | 원문: "최소 3종류" | explicit |
| R3 | 기존 API 엔드포인트 하위 호환 유지 | 원문: "유지하면서" | explicit |
| R4 | /analytics 엔드포인트 신규 생성 | 원문: "만들어라" | explicit |
| R5 | 다크모드 테마 지원 | 원문: "다크모드도" | explicit |
| R6 | 차트 컴포넌트 다크모드 테마 반응 | R1+R5에서 파생 | implicit |
```

추출 규칙:
- 한 문장에 여러 요구 → 각각 분리
- **근거 칼럼 필수** — 원문의 어느 부분에서 이 요구를 도출했는지 기록
- implicit 요구도 추출하되 유형 구분
- **추출 단위**: 독립적으로 완료/미완료를 판정할 수 있는 최소 단위

### 1-3. `analyst` + `explore` — 병렬 심층 분석

두 에이전트를 **동시에** `Task` 도구로 호출:

- **`Task(subagent_type="analyst")`**: 원문 + 추출된 R# 리스트 전달. 누락된 요구 발굴, 요구 간 충돌 감지, 모호한 R# 구체화. 발견한 추가 요구는 `implicit` 유형으로 Registry에 추가
- **`Task(subagent_type="explore")`**: 각 R#의 관련 파일/함수/패턴 조사, 수정 대상 파일 사전 식별, 기존 컨벤션 파악

### 1-4. 원문 대조 검증 (1회, 이 Step에서만)

원문을 R# 리스트와 **1회** 대조하여 누락을 확인합니다:

```
[COVERAGE CHECK — 원문 vs R# 리스트]
원문의 요구/의도를 순서대로 확인:
- "대시보드에 실시간 차트를 추가하고" → R1 ✅
- "차트는 최소 3종류..." → R2 ✅
- "기존 API 엔드포인트는 유지하면서" → R3 ✅
- "새로운 /analytics 엔드포인트를 만들어라" → R4 ✅
- "다크모드도 지원해야 한다" → R5 ✅
미커버 요구: 0개 ✅
```

에러로그/스크린샷 입력의 경우:
```
[COVERAGE CHECK — 로그 분석 완전성]
로그에서 식별된 에러 3건:
- TypeError at auth.ts:42 → R1 ✅
- ConnectionError at db.ts:108 → R2 ✅
- Warning: deprecated API usage → R3 ✅ (implicit)
미분석 에러: 0건 ✅
```

**⛔ 미커버 요구 > 0 → R# 추가 후 재검증. Step 1-5 진입 불가.**

### 1-5. 사용자 확인 (확정 서명)

R# 리스트를 사용자에게 제시하고 **확정**을 받습니다:

```
[요구사항 확인 — 아래 리스트로 작업을 진행합니다]

| R# | 요구사항 | 유형 |
|----|---------|------|
| R1 | 대시보드에 실시간 차트 컴포넌트 추가 | explicit |
| R2 | 차트 3종류 지원 (라인, 바, 파이) | explicit |
| R3 | 기존 API 엔드포인트 하위 호환 유지 | explicit |
| R4 | /analytics 엔드포인트 신규 생성 | explicit |
| R5 | 다크모드 테마 지원 | explicit |
| R6 | 차트 컴포넌트 다크모드 테마 반응 | implicit |

빠지거나 잘못된 항목이 있으면 알려주세요.
```

**사용자 확인 = 확정 서명.** 이 시점 이후, 원문(`user-input.md`)은 아카이브 상태로 전환됩니다.

### 1-6. 확정 Registry 파일 저장

```bash
cat > .team/requirements.md << 'EOF'
# Requirement Registry (확정됨 — 이후 모든 단계의 유일한 기준)

| R# | 요구사항 | 근거 | 유형 | 관련 파일 |
|----|---------|------|------|----------|
| R1 | ... | ... | explicit | ... |
EOF
```

**이후 모든 단계는 오직 `.team/requirements.md`만 참조합니다.**
원문(`user-input.md`)은 아카이브 — 누락 의심 시에만 열람.

**Output**: `.team/requirements.md` (확정 Registry, 유일한 기준). 이후 모든 단계에서 R# 번호로 참조.

---

## Step 2: Work Decomposition (Traceable DAG)

> **R#에 매핑되지 않은 Work Item = 삭제. Work Item에 매핑되지 않은 R# = WI 추가 필수.**

### 2-1. `Task(subagent_type="planner")` — 작업 분해

**`.team/requirements.md`** (R# Registry) + explore 결과를 전달하여:

- **Feature Sets 정의** (개수 제한 없음): Name, acceptance criteria, `Traced Requirements: R#`, Priority (P0-P3), Complexity (S/M/L/XL)
- **Work Items by Layer** 분해: UI / Domain / Infra / Integration
- 각 Work Item에 `Fulfills: R#, R#` 필드 필수

### 2-2. `Task(subagent_type="researcher")` — 기술 조사 (필요 시)

외부 라이브러리/API가 필요한 WI가 있으면 조사 위임. **Skip if**: 기존 패턴으로 해결 가능.

### 2-3. Traceability Matrix (MANDATORY)

**`.team/requirements.md`를 Read하여** 모든 R#이 WI에 매핑되는지 확인:

```
| R# | 요구사항 | Work Item(s) | Status |
|----|---------|-------------|--------|
| R1 | 대시보드에 실시간 차트 컴포넌트 추가 | WI-1, WI-3 | ✅ Covered |
| R5 | 다크모드 테마 지원 | (없음) | ❌ MISSING → WI 추가 필수 |
```

**⛔ ❌ MISSING이 하나라도 있으면 WI를 추가하여 해소 후 진행.**

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
  "SHARED": ["src/types/index.ts", "src/config.ts"],
  "WI-1": ["src/api/auth.ts"],
  "WI-2": ["src/components/Login.tsx"],
  "WI-3": ["src/models/user.ts"]
}
```

#### B. Shared File Zone

2+ WI가 수정하는 파일 중 **타입 정의, 공통 설정, barrel export**는 `"SHARED"`로 분류:

- SHARED 파일은 팀원이 **직접 수정 금지** — 수정 필요 시 SendMessage로 변경 내용을 리더에게 전달
- 리더가 직접 적용하거나, 전담 팀원(`executor`)에게 순차 위임
- **효과**: SHARED 분류 후 나머지 CONFLICT만 해결 → 직렬화 대상 대폭 감소

#### C. Conflict Resolution

동일 파일을 2+ WI가 수정하면 **반드시** 해결:

| 해결법 | 조건 | 방법 |
|--------|------|------|
| **직렬화** | 수정 범위 독립적 | `addBlockedBy`로 순서 강제 |
| **병합** | 수정 범위 밀접 | 두 WI를 하나로 통합 |
| **분할** | 파일 분리 가능 | 리팩토링으로 각 WI가 다른 파일 담당 |

**⚠️ CONFLICT가 0이 될 때까지 Step 3 진입 불가.**

#### D. Dependency DAG

CONFLICT 해소 후, **파일 의존성 기반 WI-level DAG**를 구성합니다 (Wave 그룹화 없음):

```
WI-1 ──→ WI-3 (auth.ts 의존)
WI-2 ──→ (없음, 즉시 시작)
WI-4 ──→ WI-5 (config.ts 의존)
→ t=0: WI-1, WI-2, WI-4 동시 시작
→ WI-1 완료 즉시 WI-3 시작 (WI-2, WI-4 완료 불필요)
```

`addBlockedBy`로 개별 WI 간 의존성만 설정. **비충돌 WI는 전부 즉시 시작**.

### 2-5. `Task(subagent_type="architect")` — Quality Gate

전체 DAG + File Ownership Matrix를 `architect`에게 전달하여 리뷰. CRITICAL/HIGH 이슈는 해소 후 진행.

**Output**: TaskCreate for each WI with dependencies (addBlockedBy). 각 Task에 `Fulfills: R#` 명시.

---

## Step 3: Team Creation & Task Structure

### 3-1. Team Creation

```
TeamCreate(team_name="{task-slug}", description="{task description}")
```

### 3-2. Teammate Spawning (WI-Based Dynamic Scaling)

**1 WI = 1 Teammate** — blockedBy 없는 WI마다 전담 팀원을 spawn하여 병렬성을 극대화합니다.

#### subagent_type 선택 기준

WI의 도메인에 따라 커스텀 에이전트를 선택:

| WI 도메인 | subagent_type | 에이전트 정의 |
|-----------|---------------|--------------|
| UI/컴포넌트 | `designer` | `.claude/agents/designer.md` — UI/UX, Sonnet |
| 백엔드/도메인/인프라 | `executor` | `.claude/agents/executor.md` — 범용 구현, Sonnet |
| 테스트 | `test-engineer` | `.claude/agents/test-engineer.md` — TDD, Sonnet |
| 빌드/설정 | `build-fixer` | `.claude/agents/build-fixer.md` — 최소 diff, Sonnet |
| 문서 | `writer` | `.claude/agents/writer.md` — 기술 문서, Haiku |
| 조사/분석 | `researcher` | `.claude/agents/researcher.md` — 외부 API/문서, Sonnet |
| Git | `git-master` | `.claude/agents/git-master.md` — atomic commit, Sonnet |

#### 네이밍: `{subagent_type}-{N}`

```
# 예: WI-1(UI) + WI-2(UI) + WI-3(백엔드) + WI-4(백엔드) + WI-5(테스트)
# → 5명 동시 spawn (같은 역할도 복수 생성)
Task(subagent_type="designer",      team_name="{team}", name="designer-1",      prompt="[WI-1]...")
Task(subagent_type="designer",      team_name="{team}", name="designer-2",      prompt="[WI-2]...")
Task(subagent_type="executor",      team_name="{team}", name="executor-1",      prompt="[WI-3]...")
Task(subagent_type="executor",      team_name="{team}", name="executor-2",      prompt="[WI-4]...")
Task(subagent_type="test-engineer", team_name="{team}", name="test-engineer-1", prompt="[WI-5]...")
```

#### 스케일링 규칙

1. **초기 spawn**: blockedBy 없는 WI 수 = 동시 팀원 수 (전부 즉시 생성)
2. **팀원 재사용**: WI 완료 후 같은 역할의 대기 WI가 있으면 `SendMessage`로 다음 WI 할당 (새 spawn 불필요)
3. **추가 spawn**: unblock된 WI의 역할과 일치하는 idle 팀원이 없으면 새 팀원 spawn
4. **Shutdown**: 남은 WI가 없는 팀원은 `shutdown_request`로 종료

### 3-3. Task Description with File Ownership

**각 WI의 Task description에 반드시 포함하는 4가지**:

1. **R# 원문** (요약본 아닌 원문)
2. **OWNED FILES** (수정 허용 파일 목록)
3. **SHARED FILES** (읽기 전용 — 수정 필요 시 리더에게 SendMessage)
4. **BOUNDARY** (OWNED/SHARED 외 파일 접근 금지)

```
[WI-1 — 로그인 UI 구현] Fulfills: R2, R5

R2: "로그인 페이지에 소셜 로그인 버튼 추가" (원문)
R5: "로그인 폼 유효성 검사" (원문)

OWNED FILES:
- src/components/auth/LoginForm.tsx (신규)
- src/components/auth/SocialLoginButtons.tsx (신규)

SHARED FILES (READ-ONLY):
- src/types/auth.ts — 타입 추가 필요 시 리더에게 SendMessage

⛔ BOUNDARY: OWNED 파일만 수정 가능. SHARED 수정은 리더에게 요청.
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

### Phase B — DAG-Based Parallel Execution

Step 2-4의 Dependency DAG에 따라, **blockedBy가 없는 WI를 모두 동시 시작**합니다:

```
1. blockedBy 없는 모든 WI를 담당 팀원에게 동시 할당 (TaskUpdate → in_progress)
2. 팀원들 병렬 작업
3. WI 완료 시 → 경량 검증 (Phase C-1) → blockedBy 해제 → 의존 WI 즉시 시작
4. 리더는 대기하지 않고, 완료된 WI부터 순차 검증 + 다음 WI 할당
5. 전체 완료 후 → 최종 Reconciliation (Phase C-3)
```

**리더 역할** (실행 중): WI 완료 즉시 경량 검증, SHARED 파일 변경 일괄 적용, 팀원 질문 응답. ⛔ 직접 코딩 금지.

**Shared File Request**: 팀원이 SHARED 파일 수정 필요 시 SendMessage로 변경 내용 전달 → 리더가 일괄 적용하거나 전담 팀원에게 위임. OWNED 외 비-SHARED 파일 필요 시 → 소유 팀원에게 위임.

### Phase C — Streaming Reconciliation (3-Tier)

#### C-1. Per-WI 경량 검증 (WI 완료 즉시)

```bash
# 소유권 대조 — ownership.json의 해당 WI OWNED FILES와 실제 변경 파일 대조
git diff --name-only HEAD~1
# 타입 체크
pnpm tsc --noEmit
```

- 소유권 위반 → `git checkout -- {file}` + 소유 팀원에게 재위임
- 타입 에러 → 해당 팀원에게 수정 지시
- ✅ PASS → blockedBy 해제, 의존 WI 즉시 시작

#### C-2. Checkpoint 빌드 (3개 WI 완료마다, background)

```bash
pnpm build && pnpm test  # run_in_background: true
```

- 실패 시 → 최근 완료 WI 중 원인 파악 → 해당 팀원 수정
- **다음 WI 할당은 중단하지 않음** (background 검증이므로 병렬 진행)

#### C-3. Final Reconciliation (전체 WI 완료 후)

```bash
# ownership.json 전체 대조 + 전체 빌드/타입/테스트
pnpm build && pnpm lint && pnpm test
```

- **→ ✅ PASS / ❌ FAIL** (FAIL 시 원인 WI 수정, Circuit Breaker 적용)

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

`verifier`에게 전달: `.team/requirements.md` (확정 Registry) + 코드 diff + Step 6 리뷰 결과.

verifier는 **requirements.md의 모든 R#이 구현되었는지** 증거 기반으로 검증합니다:

```
| R# | 요구사항 | 충족 | 증거 |
|----|---------|:----:|------|
| R1 | 대시보드에 실시간 차트 컴포넌트 추가 | ✅ | src/Chart.tsx:15 구현 확인 |
| R2 | 차트 3종류 지원 (라인, 바, 파이) | ❌ | 라인차트만 구현, 바/파이 누락 |
| R5 | 다크모드 테마 지원 | ⚠️ | 차트 제외 다크모드 적용 |
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

**`.team/requirements.md` (확정 Registry) 기준으로** 최종 판정:

```
[FINAL REQUIREMENT VERIFICATION]
| R# | 요구사항 | 구현 상태 | 검증 |
|----|---------|:--------:|------|
| R1 | ...     | ✅/❌    | verifier 통과 |
전체: N/M 완료
```

- [ ] All R# items: ✅ (verifier 통과)
- [ ] All TaskList items: COMPLETED
- [ ] Final Reconciliation: PASS (C-3)
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
