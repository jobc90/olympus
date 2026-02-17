# Team Engineering Protocol v3.1 — Multi-Agent Collaboration Framework

**Version**: 3.1
**Status**: Active
**Last Updated**: 2026-02-13
**Location**: `orchestration/commands/team.md` (symlinked to `~/.claude/commands/team.md`)

---

## Overview

The Team Engineering Protocol v3.1 is Olympus's multi-agent orchestration framework for complex software development tasks. It coordinates 19 specialized AI agents (divide by role) across a structured 10-step workflow with DAG-based parallel execution, file ownership separation, and streaming reconciliation.

### Core Innovations

1. **DAG-Based Parallel Execution** — Work Items (WI) execute in parallel based on dependency graph, not waves
2. **Streaming Reconciliation (3-Tier)** — Per-WI validation → checkpoint builds → final reconciliation
3. **Shared File Zone** — SHARED files (types, config, index) managed by leader, preventing conflicts
4. **File Ownership Invariant** — At any moment, 1 file = max 1 teammate owner
5. **Dynamic Scaling** — 1 WI = 1 Teammate; same role spawned multiple times if needed
6. **Circuit Breaker** — Task metadata records `failCount` permanently; escalate to architect after 3 failures

### Activation

```bash
/team <task_description>
```

Unlocks all 16 On-Demand agents (beyond the Core 3).

---

## 19 Custom Agents

Olympus uses **19 custom agents** defined in `.claude/agents/` directory. Each has specialized role, tool restrictions, and instruction set.

### Core Agents (Always Available)
| Agent | Model | Write? | Role |
|-------|-------|:------:|------|
| `explore` | Haiku | ❌ | Fast codebase search — file/pattern/relationship exploration |
| `executor` | Sonnet | ✅ | Focused execution — direct implementation within scope |
| `writer` | Haiku | ✅ | Technical documentation — README, API docs, code comments |

### On-Demand Agents (Team Mode Required)
| Agent | Model | Write? | Role | Step | Usage |
|-------|-------|:------:|------|------|-------|
| `analyst` | Opus | ❌ | Requirements analysis → testable acceptance criteria | 1 | Task(subagent_type="analyst") |
| `planner` | Opus | ❌ | Strategic planning via structured interview → DAG design | 2 | Task(subagent_type="planner") |
| `architect` | Opus | ❌ | READ-ONLY architecture advisor (file:line citations) | 2,4,CB | Task(subagent_type="architect") |
| `researcher` | Sonnet | ❌ | Documentation & external API research | 2 | Task(subagent_type="researcher") |
| `designer` | Sonnet | ✅ | UI/UX design — components, pages, styles, interactions | 3-5 | Team Task with subagent_type="designer" |
| `test-engineer` | Sonnet | ✅ | Test creation — unit, integration, E2E via TDD | 3-5 | Team Task with subagent_type="test-engineer" |
| `build-fixer` | Sonnet | ✅ | Build/lint error diagnosis and fix | 3-5 | Team Task with subagent_type="build-fixer" |
| `git-master` | Sonnet | ✅ | Git operations — atomic commits, rebasing, conflict resolution | 3,9 | Team Task with subagent_type="git-master" |
| `code-reviewer` | Opus | ❌ | 2-Stage code review (Spec Compliance → Quality) | 6 | Task(subagent_type="code-reviewer") |
| `style-reviewer` | Haiku | ❌ | Code style review — naming, formatting, conventions | 6 | Task(subagent_type="style-reviewer") |
| `api-reviewer` | Sonnet | ❌ | API design review — contracts, versioning, error semantics | 6 | Task(subagent_type="api-reviewer") [conditional] |
| `security-reviewer` | Opus | ❌ | Security audit — OWASP Top 10, secrets, vulns | 6 | Task(subagent_type="security-reviewer") [conditional] |
| `performance-reviewer` | Sonnet | ❌ | Performance analysis — bottlenecks, complexity, optimization | 6 | Task(subagent_type="performance-reviewer") [conditional] |
| `vision` | Sonnet | ❌ | Visual analysis — screenshots, visual regression | 6 | Task(subagent_type="vision") [conditional] |
| `verifier` | Sonnet | ❌ | Implementation verification — evidence-based R# checking | 7 | Task(subagent_type="verifier") |
| `qa-tester` | Sonnet | ❌ | CLI testing via tmux-less evidence capture | 8 | Task(subagent_type="qa-tester") |

---

## The 10-Step Workflow

### Step 0: Session Setup

**Actions**:
1. Find related skills: `/find-skills` for extensions/plugins
2. Create state directory:
   ```bash
   mkdir -p .team && grep -qxF '.team/' .gitignore 2>/dev/null || echo '.team/' >> .gitignore
   ```
3. Initialize requirement registry and ownership matrix (created in later steps)

---

### Step 1: Requirement Registry (MANDATORY — ZERO LOSS)

**Principle**: Every requirement must be captured and mapped to a unique R# identifier. No requirement loss tolerance.

#### 1-0. Input Archival (FIRST ACTION)

Save original user input to `.team/user-input.md` for dispute resolution:

```bash
cat > .team/user-input.md << 'EOF'
{$ARGUMENTS full text}
EOF
```

#### 1-1. Input Classification & Interpretation

Transform user input into actionable requirements:

| Input Form | Method | Example |
|-----------|--------|---------|
| **Clear requirement list** | Direct mapping to R# | "Add A, modify B, delete C" → R1, R2, R3 |
| **Vague description** | Interpret intent → concrete requirement | "Make it faster" → R1: Reduce response time by 50% |
| **Error logs/stack traces** | Analyze logs → identify fixes | 500-line error log → R1: Fix auth.ts:42 null ref, R2: ... |
| **Screenshots/references** | Visual/contextual analysis → derive requirement | "Like this screen" → R1: Layout change, R2: Color scheme |
| **Mixed** | Combine above methods | Description + log → explicit R# + diagnostic R# |

**Core principle**: Each R# must be testable — "How do we know it's complete?"

#### 1-2. Individual Requirement Extraction

Create extraction table:

```
| R# | Requirement | Evidence | Type |
|----|------------|----------|------|
| R1 | Add real-time chart component to dashboard | Original: "add charts to" | explicit |
| R2 | Support 3 chart types (line, bar, pie) | Original: "at least 3 types" | explicit |
| R3 | Maintain backward compatibility with existing API | Original: "while keeping" | explicit |
| R4 | Create new /analytics endpoint | Original: "new endpoint" | explicit |
| R5 | Support dark mode theme | Original: "dark mode too" | explicit |
| R6 | Chart component respects dark mode | Derived from R1+R5 | implicit |
```

**Rules**:
- One sentence → multiple requirements = split each
- **Evidence column required** — trace to source
- Include implicit (derived) requirements
- **Extraction unit**: Smallest independently verifiable piece

#### 1-3. Parallel Deep Analysis (`analyst` + `explore`)

Call both agents **simultaneously** with `Task` tool:

```
Task(subagent_type="analyst")
  - Input: Original text + extracted R# list
  - Uncover missing requirements
  - Detect conflicts between R#s
  - Concretize vague R#s
  - Output: Additional implicit R#s (type=implicit)

Task(subagent_type="explore")
  - Input: Each R# number
  - Locate affected files/functions/patterns
  - Identify pre-modification targets
  - Document existing conventions
  - Output: File mapping per R#
```

#### 1-4. Coverage Check (Original Text vs R# List)

Single-pass validation — mark each requirement from source text:

```
[COVERAGE CHECK — Original vs R# List]
Original requirements in order:
- "Add real-time chart..." → R1 ✅
- "Support 3 chart types..." → R2 ✅
- "Maintain backward compatibility..." → R3 ✅
- "New /analytics endpoint..." → R4 ✅
- "Dark mode support..." → R5 ✅
Uncovered requirements: 0 ✅
```

**Failure rule**: If uncovered > 0, add WI and re-check. Cannot proceed to Step 1-5.

#### 1-5. User Confirmation (Definitive Signature)

Present R# list to user for approval:

```
[REQUIREMENT CONFIRMATION — Proceeding with these R#s]

| R# | Requirement | Type |
|----|------------|------|
| R1 | Add real-time chart component | explicit |
| R2 | Support 3 chart types | explicit |
...
| R6 | Chart respects dark mode | implicit |

Verify completeness and correctness. Reply "confirmed" to proceed.
```

**After confirmation**: Original input (`user-input.md`) becomes archived. All future steps reference only `.team/requirements.md`.

#### 1-6. Persist Confirmed Registry

```bash
cat > .team/requirements.md << 'EOF'
# Requirement Registry (Confirmed — Authoritative Reference)

| R# | Requirement | Evidence | Type | Affected Files |
|----|------------|----------|------|----------------|
| R1 | ... | ... | explicit | ... |
EOF
```

**Output**: `.team/requirements.md` (confirmed registry, single source of truth for all steps)

---

### Step 2: Work Decomposition (Traceable DAG)

**Core rule**: R# ↔ Work Item bidirectional mapping. Every R# has a WI; every WI satisfies R#s.

#### 2-1. Task Planner for DAG Design

Call `Task(subagent_type="planner")`:
- Input: `.team/requirements.md` + explore results
- Define **Feature Sets** (no size limit): Name, acceptance criteria, `Traced Requirements: R#, R#`, Priority (P0-P3), Complexity (S/M/L/XL)
- Decompose into **Work Items by Layer**: UI / Domain / Infra / Integration
- Each WI must include `Fulfills: R#, R#` field

#### 2-2. Optional Research (if needed)

If WI requires external library/API research:
```
Task(subagent_type="researcher")
  - Input: Each WI needing research
  - Output: Library options, docs, integration patterns
```

Skip if existing patterns can solve the problem.

#### 2-3. Traceability Matrix (MANDATORY)

Read `.team/requirements.md` and verify every R# maps to a WI:

```
| R# | Requirement | Work Items | Status |
|----|------------|-----------|--------|
| R1 | Add chart component | WI-1, WI-3 | ✅ Covered |
| R2 | Chart types | WI-1 | ✅ Covered |
| R5 | Dark mode support | (none) | ❌ MISSING → Add WI-5 |
```

**Failure rule**: Uncovered R# = add WI and recheck. Cannot proceed until 0 uncovered.

#### 2-4. File Ownership Analysis & Dependency Ordering

**A. File Ownership Matrix (MANDATORY)**

Create matrix showing which WI modifies which files:

```
| File | WI-1 | WI-2 | WI-3 | Owner |
|------|:----:|:----:|:----:|-------|
| src/api/auth.ts      | ✏️  |     |     | WI-1 |
| src/components/Login |     | ✏️  |     | WI-2 |
| src/models/user.ts   | ✏️  |     | ✏️  | ⚠️ CONFLICT |
```

**Rule**: At any moment, 1 file = max 1 owner. Conflicts must be resolved.

Save to `.team/ownership.json`:

```json
{
  "SHARED": ["src/types/index.ts", "src/config.ts"],
  "WI-1": ["src/api/auth.ts"],
  "WI-2": ["src/components/Login.tsx"],
  "WI-3": ["src/models/user.ts"]
}
```

**B. Shared File Zone**

When 2+ WIs modify the same file, reclassify as `"SHARED"` if it contains:
- Type definitions
- Configuration constants
- Barrel exports (index.ts)

**Shared file rules**:
- Teammates **cannot modify** directly
- Modification request → SendMessage to leader
- Leader applies changes or delegates to owner
- **Effect**: Serialization reduced dramatically

**C. Conflict Resolution**

Resolve all `⚠️ CONFLICT` entries:

| Solution | Condition | Method |
|----------|-----------|--------|
| **Serialize** | Modifications independent | Use `addBlockedBy` to enforce order |
| **Merge** | Modifications closely related | Combine WIs into single WI |
| **Split** | File can be refactored | Extract to separate files per WI |

**Failure rule**: Conflicts > 0 = cannot enter Step 3.

**D. Dependency DAG (WI-Level)**

After conflict resolution, build WI-level dependency graph (not waves):

```
WI-1 (auth) ──→ WI-3 (dashboard) [depends on auth.ts]
WI-2 (UI) ──────→ (no blocking, starts immediately)
WI-4 (config) ──→ WI-5 (integration) [depends on config.ts]

Timeline:
- t=0: Start WI-1, WI-2, WI-4 (no blockedBy)
- WI-1 completes: Unblock WI-3 immediately (WI-2, WI-4 completion NOT required)
- WI-2 completes: No blockers, already running or complete
- WI-4 completes: Unblock WI-5 immediately
```

Use `Task(addBlockedBy=[...])` for individual dependencies only.

#### 2-5. Architect Quality Gate

```
Task(subagent_type="architect")
  - Input: Full DAG + ownership.json + requirements.md
  - Review: Completeness, dependency correctness, risk identification
  - Output: CRITICAL/HIGH issues to fix
```

Fix CRITICAL/HIGH issues before proceeding to Step 3.

**Output**: TaskCreate for each WI with dependencies. Each Task includes `Fulfills: R#, R#` field.

---

### Step 3: Team Creation & Task Structure

#### 3-1. Create Team

```
TeamCreate(team_name="{task-slug}", description="{task description}")
```

#### 3-2. Teammate Spawning (1 WI = 1 Teammate)

**Dynamic Scaling**:
- **Initial spawn**: All WIs with `blockedBy: []` (no dependencies) spawn immediately
- Same role spawned multiple times if needed
- **Naming**: `{subagent_type}-{N}` (e.g., designer-1, designer-2, executor-1)

**Agent Selection by Domain**:

| WI Domain | subagent_type | Usage |
|-----------|---------------|-------|
| UI/Components | `designer` | Frontend, styling, interactions |
| Backend/Domain | `executor` | API, services, business logic |
| Testing | `test-engineer` | Unit, integration, E2E |
| Build/Config | `build-fixer` | Deps, configs, tooling |
| Documentation | `writer` | README, API docs, comments |
| Git/VCS | `git-master` | Commits, rebasing, cleanup |

**Scaling Rules**:

1. **Initial**: Spawn all unblocked WIs as parallel teammates
2. **Reuse**: WI completes → same role has waiting WI → SendMessage with next assignment
3. **Add**: Unblocked WI's role has no idle teammate → spawn new teammate
4. **Shutdown**: No remaining WIs → shutdown_request

#### 3-3. Task Description (4 Elements)

Every WI's Task MUST include:

1. **R# Original Text** (requirements this WI fulfills)
2. **OWNED FILES** (list of files teammate can modify)
3. **SHARED FILES** (read-only; SendMessage to modify)
4. **BOUNDARY** (explicit "do not touch" list)

**Example**:

```
[WI-1 — Login UI Implementation] Fulfills: R2, R5

Original Requirements:
R2: "Add social login buttons to login page"
R5: "Login form must validate inputs"

OWNED FILES:
- src/components/auth/LoginForm.tsx (new)
- src/components/auth/SocialButtons.tsx (new)

SHARED FILES (READ-ONLY):
- src/types/auth.ts — if type additions needed, SendMessage to leader

BOUNDARY:
⛔ Do not modify other auth files, API endpoints, or models.
   File changes restricted to OWNED list.
```

---

### Step 4: Consensus Protocol (Architecture Decisions)

**Only use for significant architectural decisions.**

**Process**:
1. **DRAFT** — Initial proposal
2. **REVIEW** — Use `codex_analyze` MCP:
   ```
   mcp__ai-agents__codex_analyze(
     prompt: "Review this architecture proposal. Respond [AGREE]/[SUGGEST]/[DISAGREE] with reasoning."
   )
   ```
3. **RESOLVE** — Address [DISAGREE] items (max 2 rounds); if unresolved, user decides
4. **CONFIRM** — Record final decision

**Skip if**: Bug fixes, small features within existing patterns, straightforward implementation path.

---

### Step 5: Parallel Execution

The core execution phase with streaming reconciliation.

#### Phase A: Proposal Collection (Optional)

If multiple implementation approaches exist:

```
ai_team_patch(
  prompt: "Propose implementation for [WI-1]. Consider both Gemini (frontend) and Codex (backend) approaches."
)
```

Returns proposals from both specialists. Skip if implementation path is clear.

#### Phase B: DAG-Based Parallel Execution

**Timeline**:

```
1. All WIs with blockedBy: [] start immediately (parallel)
2. Teammates work on assigned WIs
3. WI completes → Phase C-1 validation
   - If ✅ PASS: Unblock dependent WIs, assign immediately
   - If ❌ FAIL: Teammate fixes, re-validate
4. Leader: Validate complete WIs, manage SHARED files, answer questions
5. All WIs complete → Phase C-3 final reconciliation
```

**Leader role during execution** (NO CODING):
- Validate completed WIs (Phase C-1)
- Manage SHARED file changes (collect from teammates → apply or delegate)
- Answer teammate questions via SendMessage
- Coordinate blockedBy releases

**SHARED File Request flow**:
- Teammate needs to modify SHARED file → SendMessage to leader with change proposal
- Leader applies changes or delegates to designated owner
- No direct SHARED modification by non-owner teammates

#### Phase C: Streaming Reconciliation (3-Tier)

**C-1: Per-WI Lightweight Validation (Immediately after each WI completion)**

```bash
# Ownership check
git diff --name-only {prev-commit}
# Cross-reference against ownership.json[WI-X]

# Type check
pnpm tsc --noEmit

# If conflicts exist
git checkout -- {non-owned-files}
# Notify teammate of ownership violation → reassign to owner
```

Actions:
- ✅ PASS: Unblock dependent WIs, proceed immediately
- ❌ Ownership violation: Revert, re-assign to owner
- ❌ Type error: Notify teammate, request fix

**C-2: Checkpoint Build (Every 3 WI completions, background)**

```bash
pnpm build && pnpm test  # run_in_background: true
```

Actions:
- ❌ FAIL: Identify causal WI, notify teammate
- ✅ PASS: Continue assigning next WIs (don't block)

**C-3: Final Reconciliation (After all WIs complete)**

```bash
# Full ownership validation
cat .team/ownership.json | validate against git diff

# Full build + type + test
pnpm build && pnpm lint && pnpm test
```

Decision:
- ✅ PASS: Proceed to Step 6
- ❌ FAIL: Identify causal WI, apply Circuit Breaker, fix, retry C-3

---

### Step 6: Multi-Reviewer Gate

Parallel code review from multiple specialists.

#### 6-1. Core Review (Always Run)

```
Task(subagent_type="code-reviewer")
  - Stage 1: Spec Compliance — Does code fulfill R#s in requirements.md?
    - FAIL → Return to Step 5 for fixes (skip Stage 2)
  - Stage 2: Code Quality — Architecture, DRY, error handling, patterns
    - CRITICAL/HIGH → Return to Step 5 for fixes
    - MEDIUM/LOW → Document for Step 9
```

#### 6-2. Style Review (Always Run, Parallel)

```
Task(subagent_type="style-reviewer")
  - Naming conventions
  - Formatting consistency
  - Project patterns adherence
  - Lint rule violations
```

#### 6-3. Conditional Specialist Reviews (Parallel)

| Condition | Agent | Focus |
|-----------|-------|-------|
| API changes | `api-reviewer` | Contract compatibility, versioning, error semantics |
| Security-related | `security-reviewer` | OWASP Top 10, secrets, vulnerability patterns |
| Performance-sensitive | `performance-reviewer` | Complexity analysis, memory, hotspots |
| UI changes | `vision` | Screenshot comparison, visual regression |

#### 6-4. Result Synthesis

```
Results from all reviewers (parallel):
- CRITICAL/HIGH (any reviewer) → Return to Step 5
- MEDIUM (code-reviewer) → Attempt fixes; ok to proceed if documented
- MEDIUM (others) → Document
- LOW → Record only
```

**Apply Circuit Breaker**: Same issue fails 3 times → escalate to architect.

---

### Step 7: Spec Fulfillment Verification

Evidence-based verification against `.team/requirements.md`.

```
Task(subagent_type="verifier")
  - Input: requirements.md + code diff + Step 6 review results
  - For each R#: Document evidence of fulfillment (file:line citation)
  - Output:
    | R# | Requirement | Fulfilled? | Evidence |
    |----|------------|:----------:|----------|
    | R1 | ... | ✅ | src/Chart.tsx:15 implementation verified |
    | R2 | ... | ❌ | Missing pie chart implementation |
```

Actions:
- ❌ FAIL for any R# → Return to Step 5
- ✅ PASS all → Proceed to Step 8

---

### Step 8: Evidence-Based QA

Functional testing without assumptions.

```
Task(subagent_type="qa-tester")
  - CRITICAL: capture-pane BEFORE every assertion (no assumptions)
  - Session naming: qa-{service}-{test}-{timestamp}
  - Always kill-session after completion (even on failure)
  - Provide screenshot evidence with every test result
```

Test execution:
- ✅ PASS: Proceed to Step 9
- ❌ FAIL with evidence: Return to Step 5 with failure logs
- Apply Circuit Breaker: 3 failures → escalate to architect

---

### Step 9: Finalization

#### 9-1. Documentation

```
Task(subagent_type="writer")
  - Update CHANGELOG
  - Update API documentation
  - Update AGENTS.md / README if needed
  - Add code comments where complex
```

#### 9-2. Commit Cleanup

```
Task(subagent_type="git-master", team_name=..., name="git-master-1")
  - Consolidate scattered commits from multiple teammates
  - Squash/rebase to atomic commits per feature
  - Unify commit message style (follow project convention)
```

#### 9-3. Team Cleanup

```bash
rm -rf .team           # Delete state directory
TeamDelete             # Shut down all teammates
```

---

## Cross-Cutting Mechanisms

### Circuit Breaker

Prevents infinite retry loops for intractable issues.

**Tracking**:
- Every fix attempt: `TaskUpdate(taskId, metadata: { "failCount": N, "lastError": "..." })`
- `failCount` is permanent record in task metadata

**Trigger** (failCount ≥ 3):
```
Escalate to architect:
  - R# original text
  - Current code state
  - 3 failure logs + context
  - Request: Change approach / Apply partial fix / Declare limitation
```

**Architect Response**:
- "Change approach" → Redesign from scratch (reset failCount)
- "Partial fix" → Apply architect's guidance to current approach
- "Fundamental limitation" → Report to user with options

### File Ownership Invariant

**Core rule**: At any moment, maximum 1 teammate owns any given file.

**Enforcement**:
- C-1 validation checks ownership per WI
- SHARED files never modified by non-owner teammates
- Conflict resolution in Step 2 ensures no simultaneous modifiers

**Recovery**:
- If teammate modifies wrong file: `git checkout -- {file}` + reassign to owner
- If SHARED file modified without approval: Leader reverts + SendMessage request

### Teammate Crash Recovery

Automatic failover for unresponsive teammates.

**Timeline**:
1. 30s unresponsive → Retry via SendMessage
2. 60s unresponsive → Spawn new teammate (same subagent_type) + reassign WI
3. Check for partial work:
   - If committed: Use as-is + reassigned teammate continues
   - If uncommitted: `git checkout -- {OWNED_FILES}` → clean state → reassign

---

## Leader Rules (Mandatory)

Team Lead is the conductor, not a developer.

1. **NO DIRECT CODING** — Leader only coordinates, reviews, and makes decisions
   - Exception: Quick 1-line fixes in SHARED files, but document in task metadata
2. **MAINTAIN CONTEXT** — Always understand full project state
   - Read requirements.md regularly
   - Track WI progress
   - Monitor ownership.json conflicts
3. **PROVIDE CLEAR DIRECTION** — No ambiguity in task assignments
   - Include R# original text in every WI task
   - Specify owned + shared + boundary files explicitly
   - Answer teammate questions promptly
4. **VALIDATE THOROUGHLY** — Verify deliverables match user intent
   - Check each WI against assigned R#s
   - Verify no unintended scope changes
   - Ensure file ownership respected

---

## MCP Tools for Team Engineering

### AI Team Collaboration

| Tool | Purpose | When |
|------|---------|------|
| `codex_analyze` | Backend specialist analysis | Step 4 consensus protocol |
| `gemini_analyze` | Frontend specialist analysis | Step 4 consensus protocol |
| `ai_team_patch` | Dual-specialist patch proposals | Step 5 Phase A |
| `ai_team_analyze` | Parallel expert analysis | Step 6 reviews |
| `review_implementation` | Quality review synthesis | Step 6 |
| `verify_patches` | Conflict detection between proposals | Step 5 Phase A |
| `delegate_task` | Domain-specific expert advice | Any step |

### Context Management

| Tool | Purpose |
|------|---------|
| `LocalContextStore` | Project-level context extraction + FTS5 storage |
| `GeminiAdvisor` | Codex long-term memory synthesis (workHistory field) |

---

## State Persistence

Team state survives agent restarts and session interruptions.

### `.team/` Directory Contents

| File | Purpose | Format | Usage |
|------|---------|--------|-------|
| `.team/user-input.md` | Original user input (archived) | Raw text | Dispute resolution only |
| `.team/requirements.md` | Confirmed R# Registry (authoritative) | Markdown table | Reference for all steps |
| `.team/ownership.json` | File Ownership Matrix + SHARED files | JSON | C-1/C-3 validation |
| `.team/task-metadata.json` | WI status, failCount, progress | JSON | Circuit Breaker tracking |

### Lifecycle

```
Session 1: Steps 0-3 (planning), Step 3-5 (execution starts)
  → save requirements.md, ownership.json

Interruption / Agent restart:
  → Load from .team/ directory
  → Resume from last WI

Session N: Complete Steps 5-9
  → rm -rf .team
```

---

## Comparison with Other Frameworks

### vs. Traditional Agile Sprints
- **Team Protocol**: Single task, parallel work items with dependencies
- **Agile**: Multiple backlog items, sprint cycles, stand-ups
- **Advantage**: Full parallelization without serialization overhead

### vs. Pair Programming
- **Team Protocol**: 6-16 teammates working independently
- **Pair Programming**: 2 developers, synchronous collaboration
- **Advantage**: Scale without communication bottlenecks

### vs. Code Review-First
- **Team Protocol**: Continuous validation (C-1/C-2/C-3)
- **Code Review-First**: Batch review after all coding done
- **Advantage**: Early error detection, reduced rework

---

## Troubleshooting

### Common Issues

#### "CONFLICT in ownership.json"
- Two WIs modifying same file
- **Fix**: Use Step 2 conflict resolution — serialize, merge, or split

#### "Teammate unresponsive 60s+"
- Check teammate's task context (did WI become un-assignable?)
- **Action**: Spawn replacement teammate, reassign WI
- **Check logs**: Teammate may have hit unexpected error

#### "Circuit Breaker triggered (failCount=3)"
- Same issue failed 3+ times
- **Action**: Architect reviews full context, recommends approach change
- **Decision**: Keep trying / Redesign / Partial solution

#### "C-3 Final Reconciliation FAIL"
- Build/test failure after all WIs complete
- **Cause**: Usually missing ownership check in C-1/C-2
- **Fix**: Run `git diff` per ownership.json, identify violating WI, notify owner

### Debugging Commands

```bash
# View requirement registry
cat .team/requirements.md

# View ownership matrix
cat .team/ownership.json | jq .

# Check WI failure history
cat .team/task-metadata.json | jq '.tasks[] | select(.failCount > 0)'

# Verify current diff against ownership
git diff --name-only HEAD~10 | while read f; do
  grep -q "$f" .team/ownership.json || echo "WARNING: $f not in ownership matrix"
done
```

---

## Example: Completing a Feature with Team Protocol v3.1

### Setup: User Request
```
Add real-time dashboard with dark mode support.
- Include line/bar/pie charts
- Keep backward compatibility
- Update documentation
```

### Step 1: Requirements Registry
```
R1: Add chart component to dashboard (explicit)
R2: Support 3 chart types (line, bar, pie) (explicit)
R3: Maintain API backward compatibility (explicit)
R4: Create /analytics endpoint (explicit)
R5: Support dark mode (explicit)
R6: Charts respect dark mode (implicit, from R1+R5)
```

### Step 2: Work Decomposition
```
Feature Set 1: Frontend (P0)
  - WI-1 (Designer): Chart component UI
  - WI-2 (Designer): Dark mode theming

Feature Set 2: Backend (P0)
  - WI-3 (Executor): /analytics endpoint
  - WI-4 (Executor): Data aggregation

Feature Set 3: Testing (P1)
  - WI-5 (Test-Engineer): Chart test suite
  - WI-6 (Test-Engineer): API tests

Dependency DAG:
  WI-1 → WI-2 (styling depends on component)
  WI-3 → WI-4 (endpoint depends on aggregation)
  All → WI-5, WI-6 (test after implementation)
```

### Step 3: Team Creation & Execution
```
Initial spawn (blockedBy: []):
  - designer-1 (WI-1)
  - executor-1 (WI-3)

t=0: Start parallel
  - designer-1 works on WI-1 (Chart component)
  - executor-1 works on WI-3 (Analytics endpoint)

WI-1 completes:
  - C-1 validation PASS
  - Unblock WI-2
  - designer-1: SendMessage "WI-2 assigned (dark mode theming)"

WI-3 completes:
  - C-1 validation PASS
  - Unblock WI-4
  - executor-1: SendMessage "WI-4 assigned (data aggregation)"

t=T: All implementation WIs complete
  - C-3 Final Reconciliation PASS
  - Proceed to Step 6

Step 6: Multi-Reviewer Gate
  - code-reviewer: Spec compliance PASS
  - style-reviewer: Naming conventions PASS
  - api-reviewer: Endpoint contract PASS

Step 7: Verifier
  - R1: ✅ Chart component in src/Chart.tsx:15
  - R2: ✅ 3 types supported (line/bar/pie)
  - R3: ✅ Old API untouched
  - R4: ✅ Endpoint at /analytics
  - R5: ✅ Dark mode in theme.ts
  - R6: ✅ Chart uses theme provider

Step 8: QA-Tester
  - Test chart rendering
  - Test dark mode toggle
  - Test API response
  - All PASS with evidence

Step 9: Finalization
  - writer: Update CHANGELOG, API docs
  - git-master: Squash commits, unify messages
  - rm -rf .team; TeamDelete
```

**Result**: 6 WIs, ~4 hours parallel execution, 100% R# fulfillment, 0 conflicts.

---

## Key Differences from v3.0

| Aspect | v3.0 | v3.1 |
|--------|------|------|
| **Parallel Execution** | Wave-based (W1, W2, W3) | DAG-based (WI-level blockedBy) |
| **Shared Files** | All conflicts require serialization | SHARED zone → reduces conflicts |
| **Reconciliation** | Single final validation | 3-Tier streaming (C-1/C-2/C-3) |
| **Dynamic Scaling** | Fixed teammate count | 1 WI = 1 Teammate, spawn on-demand |
| **File Ownership** | Implicit | Explicit matrix (ownership.json) |
| **Memory Management** | workHistory = last 5 tasks | workHistory = last 50 tasks (synthesis) |

---

## References

- **Command Implementation**: `orchestration/commands/team.md` (~555 lines)
- **Agent Definitions**: `.claude/agents/*.md` (19 files, role-specific)
- **Related Docs**:
  - `CLAUDE.md` — Project conventions
  - `docs/design/CODEX_ORCHESTRATOR_DEVELOPMENT_PLAN.md` — Infrastructure
  - `docs/architecture/V2_ARCHITECTURE.md` — System overview

---

## Document Conventions

- **R#**: Requirement identifier (R1, R2, ... Rn)
- **WI**: Work Item (WI-1, WI-2, ... WI-m)
- **✅ PASS / ❌ FAIL**: Status indicators
- **subagent_type**: Custom agent role name from `.claude/agents/`
- **Task()**: Invoke single agent outside team (Steps 1-2, 6-8)
- **Team Task**: Invoke teammate within team (Steps 3-5)
- **SendMessage**: Async communication between teammates
- **OWNED FILES**: Files teammate exclusively modifies
- **SHARED FILES**: Read-only; modifications require leader approval
- **BOUNDARY**: Explicit restriction on file modifications

---

**Last Reviewed**: 2026-02-13
**Status**: Active, Team Mode Required
**Activation**: `/team <task_description>`
