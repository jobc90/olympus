---
description: Team Engineering Protocol - Multi-AI team mode with automated workflow
---

[TEAM ENGINEERING PROTOCOL ACTIVATED]

$ARGUMENTS

## Overview

You are starting a **Team Engineering session**. This activates all On-Demand agents and the 5 core engineering mechanisms. Follow the steps below in order.

> **On-Demand agents are now UNLOCKED**: architect, analyst, planner, designer, researcher, code-reviewer, verifier, qa-tester, vision, test-engineer, build-fixer, git-master, api-reviewer, performance-reviewer, security-reviewer, style-reviewer

---

## Step 0: Skill & Plugin Discovery

Before any work, discover relevant tools:

1. Run `find-skills` to search for skills matching the task domain
2. Check installed plugins: `postgres-best-practices`, `ui-ux-pro-max`, `vercel-react-best-practices`
3. Activate relevant skills for the session (e.g., `frontend-ui-ux` for UI work, `git-master` for multi-file changes)

**Output**: List of activated skills/plugins for this session.

---

## Step 1: Work Decomposition (Multi-Layer DAG)

Decompose the task into a structured work plan:

### 1-1. Feature Sets (max 4)
For each Feature Set, define:
- Name, description, acceptance criteria
- Priority (P0-P3), estimated complexity (S/M/L/XL)

### 1-2. Work Items by Layer
Break each Feature Set into Work Items:
| Layer | Examples |
|-------|---------|
| **UI** | Components, pages, styles, interactions |
| **Domain** | Business logic, validation, data models |
| **Infra** | API endpoints, database, configuration |
| **Integration** | Cross-cutting, third-party, inter-module |

### 1-3. Dependency Analysis
- **Coupling Matrix**: Map dependencies between Work Items
- **SPOF Identification**: Flag Single Points of Failure
- **Execution Order**: Sequence to minimize blocking, maximize parallelism

### 1-4. Quality Gate
- Request `architect` agent to review the decomposition
- Evaluate: completeness, dependency accuracy, risk identification
- Address all CRITICAL/HIGH issues before proceeding

**Output**: TaskCreate for each Work Item with dependencies (addBlockedBy).

---

## Step 2: Team Creation

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
- **API design review** → `api-reviewer` agent
- **Security audit** → `security-reviewer` agent
- **Performance analysis** → `performance-reviewer` agent

Assign tasks via TaskUpdate with `owner`.

---

## Step 3: Consensus Protocol (if architectural decisions needed)

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

## Step 4: 2-Phase Development (Execution)

### Phase A — Proposal Collection
- `ai_team_patch` MCP → Collect proposals from Gemini (frontend) + Codex (backend)
- Provide context: what to build, existing patterns, constraints

### Phase B — Merge & Implement
- Review proposals, pick best parts from each
- Log design decisions: what was chosen, why, what was rejected
- Teammates implement via assigned tasks
- Leader reviews results (no direct coding)

**Skip if**: Single-file changes, clear implementation path.

---

## Step 5: Two-Stage Review

Delegate to `code-reviewer` agent:

- **Stage 1 — Spec Compliance**: Did the implementation solve the stated problem?
  - FAIL → Return to fix (skip Stage 2)
- **Stage 2 — Code Quality**: Architecture, DRY, error handling, performance
  - Severity: CRITICAL / HIGH / MEDIUM / LOW
  - CRITICAL or HIGH → must fix before proceeding

---

## Step 6: Evidence-Based QA

Delegate to `qa-tester` agent:

- **Rule**: Always `capture-pane` BEFORE making assertions
- **Forbidden**: "It should have passed" without evidence
- **Session naming**: `qa-{service}-{test}-{timestamp}`
- **Cleanup**: Always kill-session after test (even on failure)

---

## Step 7: Circuit Breaker

If any step fails 3 times on the same issue:

1. **Escalate** to `architect` agent with full context
2. **Architect judges**:
   - "Change approach" → redesign from scratch
   - "Partial fix possible" → apply specific guidance
   - "Fundamental limitation" → report to user with options
3. **Never** iterate the same approach more than 3 times

---

## Completion Checklist

Before declaring done:

- [ ] All TaskList items: COMPLETED
- [ ] All Feature Sets: Acceptance criteria met
- [ ] Two-Stage Review: PASSED
- [ ] Evidence-Based QA: All assertions with evidence
- [ ] No unresolved CRITICAL/HIGH issues
- [ ] `TeamDelete` called to clean up

**If ANY checkbox is unchecked, CONTINUE WORKING.**

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
