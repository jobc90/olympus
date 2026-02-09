# oh-my-claudecode: Comprehensive Architecture Analysis

**Repository**: https://github.com/Yeachan-Heo/oh-my-claudecode
**Analysis Date**: 2026-02-09
**Purpose**: Extract orchestration patterns for Olympus Multi-AI Protocol upgrade

---

## Executive Summary

oh-my-claudecode (OMC) is a zero-config multi-agent orchestration framework for Claude Code featuring:
- **32 specialized agents** with clear role boundaries and delegation protocols
- **7 execution modes** (Autopilot, Ultrawork, Ralph, Ultrapilot, Ecomode, Swarm, Pipeline)
- **Smart model routing** across Haiku → Sonnet → Opus tiers
- **Cost optimization** claiming 30-50% token savings
- **Persistent execution** with verification enforcement
- **HUD status line** for real-time orchestration visibility

**Key Innovation**: Strict orchestrator-executor separation with explicit delegation patterns and tool-based coordination.

---

## I. Agent Architecture Patterns

### 1.1 Core Agent Design Philosophy

**Fundamental Principle**: "YOU ARE AN ORCHESTRATOR, NOT AN IMPLEMENTER"

Every agent definition explicitly separates three roles:
- **Orchestrators**: Read files, track progress, spawn agents, coordinate work
- **Executors**: Implement code changes, no spawning/delegation
- **Specialists**: Focused read-only analysis (architect, analyst, critic, reviewers)

**Quote from Autopilot**:
> "YOU ARE AN ORCHESTRATOR, NOT AN IMPLEMENTER. Direct code modifications forbidden; must delegate to executor agents. Permitted direct edits limited to `.omc/`, `.claude/`, config, and documentation files."

**Quote from Ralph**:
> "Orchestrator handles: file reading, progress tracking, agent spawning. Executors handle: all code modifications. Designers handle: UI work. Writers handle: documentation."

### 1.2 Agent Tier System (Smart Model Routing)

OMC uses a 3-tier model routing strategy based on task complexity:

| Tier | Model | Use Cases | Cost |
|------|-------|-----------|------|
| **LOW** | Haiku | Simple lookups, quick searches, status checks | Cheapest |
| **MEDIUM** | Sonnet | Standard implementations, feature additions | Moderate |
| **HIGH** | Opus | Complex analysis, multi-file refactoring, debugging | Expensive |

**Agent Variants**:
- `executor-low`, `executor` (Sonnet), `executor-high`
- `architect-low`, `architect-medium`, `architect` (Opus)
- `explore` (Haiku only), `planner` (Opus only)

**Critical Implementation Detail** (from Ultrawork):
> "Always explicitly pass the `model` parameter—the system won't auto-apply model assignments from agent definitions."

### 1.3 Agent Specialization Matrix

#### Investigation & Analysis Agents (Read-Only)

**explore** (Haiku)
- **Purpose**: Fast codebase search specialist
- **Capabilities**: Locate files, patterns, relationships
- **Tools**: Glob, Grep, ast_grep, LSP (parallel execution)
- **Success Criteria**: Absolute paths, comprehensive matches, explained relationships
- **Quote**: "Answer three primary question types: 'Where is X?', 'Which files contain Y?', 'How does Z connect to W?'"

**architect (Oracle)** (Opus)
- **Purpose**: Code analysis and debugging advisor
- **Capabilities**: Bug diagnosis, architectural guidance, root cause identification
- **Decision Pattern**: Evidence-based with file:line citations, trade-off analysis
- **Circuit Breaker**: "Questions architecture after 3+ failed fix attempts"
- **Handoff**: Analyst (requirements), Planner (plans), Critic (review), QA-Tester (verification)
- **Quote**: "Every claim must cite specific file:line references; vague recommendations are prohibited."

**analyst (Metis)** (Opus)
- **Purpose**: Requirements analysis consultant
- **Focus**: Identify gaps, assumptions, edge cases before planning
- **Output**: Testable acceptance criteria, concrete bounds
- **Quote**: "Converting product scope into testable acceptance criteria. Surfaces missing questions with justification."

**critic** (Opus)
- **Purpose**: Work plan review expert
- **Validation**: Clarity, completeness, actionability, logical connections
- **Workflow**: Read plan → verify file refs → simulate tasks → evaluate → verdict
- **Output**: "OKAY" or specific actionable improvements
- **Quote**: "Plans must be clear and unambiguous enough for executors to proceed without guessing."

#### Implementation Agents

**executor** (Sonnet/Haiku/Opus variants)
- **Purpose**: Precise code changes within assigned scope
- **Constraint**: "Work independently; task/agent spawning blocked"
- **Philosophy**: "Minimal viable diffs, no architectural decisions"
- **Success Criteria**: "Smallest viable diff" + LSP clean + fresh build/test
- **Critical Failure Modes**: Overengineering, scope creep, claiming completion without verification
- **Quote**: "Fix root causes in production code, not tests."

**build-fixer** (Sonnet)
- **Purpose**: Get failing builds green with minimal changes
- **Scope**: Type errors, compilation, imports, dependencies
- **Constraint**: "No refactoring, performance optimization, or architecture changes"
- **Success Metric**: "Build exits with code 0" + "Changes < 5% of affected files"
- **Quote**: "Apply minimal fixes (type annotations, imports, null checks)."

**designer** (Sonnet)
- **Purpose**: Production-grade UI/UX with distinctive visual design
- **Responsibilities**: Interaction design, framework-idiomatic implementation, visual polish
- **Success Metrics**: Framework idioms, intentional aesthetics, distinctive typography, cohesive palette
- **Anti-Pattern**: "Purple gradients on white" (generic AI design)
- **Quote**: "The difference between forgettable and memorable interface is intentionality in every detail."

**planner** (Opus)
- **Purpose**: Strategic planning through structured interviews
- **Process**: Interview users → research codebase → produce work plans
- **Output**: `.omc/plans/*.md` with 3-6 concrete steps + acceptance criteria
- **Constraint**: "Never write code files; output only to `.omc/plans/` or `.omc/drafts/`"
- **Handoff**: Uses explore agent for codebase facts, analyst for validation
- **Quote**: "Interprets requests like 'do X' as 'create a plan for X'—never implements code directly."

#### Quality Assurance Agents

**code-reviewer** (Sonnet)
- **Purpose**: Severity-rated code review (read-only)
- **Process**: 2-stage (spec compliance → quality checks)
- **Severity Levels**: CRITICAL, HIGH, MEDIUM, LOW
- **Tools**: git diff, lsp_diagnostics, ast_grep_search
- **Rule**: "Never approve code containing CRITICAL or HIGH severity issues"
- **Quote**: "Verify specification compliance before assessing code quality."

**security-reviewer** (Opus)
- **Purpose**: OWASP Top 10 analysis, secrets detection, dependency audits
- **Prioritization**: "Severity × exploitability × blast radius"
- **Output**: Risk level + secure code examples
- **Quote**: "Identify and prioritize security vulnerabilities before production deployment."

**performance-reviewer** (Opus)
- **Purpose**: Data-driven performance optimization
- **Focus**: Algorithmic complexity, memory, I/O, caching, concurrency
- **Constraint**: "Only flag code with quantified complexity impact (e.g., O(n²) when n > 1000)"
- **Anti-Pattern**: "Avoid premature optimization of cold code"
- **Quote**: "Recommend profiling before optimizing unless algorithmically obvious."

**qa-tester** (Sonnet)
- **Purpose**: Interactive CLI testing via tmux sessions
- **Responsibilities**: Service lifecycle, command execution, behavior verification, cleanup
- **Session Naming**: `qa-{service}-{test}-{timestamp}` (unique per test)
- **Critical Rule**: "Always capture-pane before asserting" (evidence-based)
- **Cleanup**: "Unconditionally kill sessions even on test failure"
- **Quote**: "Verify application behavior through interactive CLI testing using tmux sessions."

**test-engineer** (Sonnet)
- **Purpose**: Test strategy design, TDD enforcement
- **Distribution**: "70% unit, 20% integration, 10% e2e"
- **TDD Cycle**: RED → GREEN → REFACTOR
- **Constraint**: "Tests written before features (TDD-first)"
- **Anti-Pattern**: "Masking flaky tests with retries instead of fixing root causes"

#### User Research Agents

**ux-researcher (Daedalus)** (Sonnet)
- **Purpose**: Evidence-based UX research
- **Framework**: Nielsen's 10 heuristics + CLI-specific + WCAG 2.1 AA
- **Output**: Findings matrices with severity/confidence ratings
- **Boundary**: "Own USER EVIDENCE—the problems, not the solutions"
- **Quote**: "Never speculate without evidence. Rate both severity AND confidence independently."

### 1.4 Agent Interaction Patterns

**Handoff Protocol** (from Architect agent):
```
- Hands off to Analyst: Requirements gaps
- Hands off to Planner: Plan creation
- Hands off to Critic: Plan review
- Hands off to QA-Tester: Runtime verification
```

**Delegation Matrix** (from Ralph):
```
Orchestrator → file reading, progress tracking, agent spawning
Executors → all code modifications
Designers → UI work
Writers → documentation
```

**Path Exception Rule** (universal):
> "Only direct file writes permitted to `.omc/`, `.claude/`, `CLAUDE.md`, `AGENTS.md`"

---

## II. Execution Mode Patterns

### 2.1 Autopilot: 5-Phase Workflow

**Command**: `/oh-my-claudecode:autopilot`

**Phase Structure**:
```
Phase 0: Expansion — Analyst + Architect → spec.md
Phase 1: Planning — Generate roadmap with architect validation
Phase 2: Execution — Parallel executor agents
Phase 3: QA — Build-lint-test cycles until pass
Phase 4: Validation — 3 parallel reviews (functionality, security, quality)
```

**Orchestration Enforcement**:
> "YOU ARE AN ORCHESTRATOR, NOT AN IMPLEMENTER. Direct code modifications forbidden; must delegate to executor agents."

**Completion**: Signal phase completion sequentially, then invoke `/oh-my-claudecode:cancel` for cleanup.

### 2.2 Ultrawork: Maximum Parallelism

**Command**: `/oh-my-claudecode:ultrawork`

**Core Principle**: "Orchestrator, not implementer. Read files, track progress, spawn agents—never execute code changes directly."

**Model Routing**:
- LOW (Haiku): Simple lookups, quick searches, status checks
- MEDIUM (Sonnet): Standard implementations, feature additions
- HIGH (Opus): Complex analysis, multi-file refactoring

**Critical Requirement**:
> "Always explicitly pass the `model` parameter—the system won't auto-apply model assignments."

**Background Execution**:
- Async: Package installs, builds, test suites, Docker ops
- Foreground: Status checks, file reads, diagnostics

**Completion Criteria**:
- Zero pending tasks in TODO list
- All features function properly
- Tests pass
- No unaddressed errors

### 2.3 Ralph: Persistent Orchestration Loop

**Command**: `/oh-my-claudecode:ralph`

**Core Constraint**: "YOU ARE AN ORCHESTRATOR, NOT AN IMPLEMENTER."

**Delegation Matrix**:
```
Orchestrator: file reading, progress tracking, agent spawning
Executors: all code modifications
Designers: UI work
Writers: documentation
```

**Path Exception**: Only write to `.omc/`, `.claude/`, `CLAUDE.md`, `AGENTS.md`

**Parallel Processing**: Fire independent agent calls simultaneously, use `run_in_background: true` for 10+ tasks or 10+ second operations.

**Smart Model Routing**:
- LOW (Haiku): architect-low, executor-low
- MEDIUM (Sonnet): executor, architect-medium
- HIGH (Opus): architect, executor-high, planner

**Completion Protocol**:
1. Verify all requirements met
2. Zero compilation/runtime errors
3. All tests pass
4. TODO list empty
5. **Mandatory**: Spawn architect verification (with explicit model param)
6. Exit via `/oh-my-claudecode:cancel` after approval

**Non-Negotiable**: "No scope reduction, partial completion, premature stopping, or test deletion."

### 2.4 Swarm: Coordinated Parallel Tasks

**Command**: `/oh-my-claudecode:swarm N:agent-type "task"`

**Modes**:
- Standard (1-5 agents): Normal coordination
- Aggressive (20-50+ agents): `maxBackgroundTasks` up to 50

**Execution Model**:
1. Decompose work into micro-tasks (file/function/pattern level)
2. Initialize SQLite at `.omc/state/swarm.db` for atomic task claiming
3. Spawn agents in waves respecting concurrency limits
4. Poll every 5s for completions, spawn replacements
5. Continue until all complete or user cancels

**Atomic Task Claiming**:
> "SQLite transactions ensure only one agent can claim a task using immediate transaction locking."

**Heartbeat Monitoring**: Agents transmit status every 60s; unclaimed tasks for 5min auto-release.

**Cancellation**: `/oh-my-claudecode:cancel` stops monitoring, signals exit, preserves partial progress.

### 2.5 Pipeline: Sequential AI Chains

**Command**: `/oh-my-claudecode:pipeline [preset] <task>`

**Syntax**:
```bash
# Preset
/oh-my-claudecode:pipeline review "task"

# Custom chain
/oh-my-claudecode:pipeline agent1 -> agent2 -> agent3 "task"

# With model specification
/oh-my-claudecode:pipeline explore:haiku -> architect:opus -> executor:sonnet "task"
```

**Presets**:
| Preset | Stages | Purpose |
|--------|--------|---------|
| review | explore → architect → critic → executor | Comprehensive code evaluation |
| implement | planner → executor → tdd-guide | Feature development |
| debug | explore → architect → build-fixer | Issue resolution |
| research | [researcher, explore] → architect → writer | Technology investigation |
| refactor | explore → architect-medium → executor-high → qa-tester | Structural improvements |
| security | explore → security-reviewer → executor → security-reviewer-low | Vulnerability assessment |

**Key Features**:
- Sequential execution with context propagation
- Parallel stages: `[agent1, agent2] -> next`
- State persistence: `.omc/pipeline-state.json`
- Error handling: retry (max 3), fallback to higher tier, abort

### 2.6 Ecomode: Cost Optimization

**Command**: Prefix with "eco", "budget", or "efficient"

**Strategy**:
- Default to Haiku, fallback to Sonnet
- Ultrawork reverses (Sonnet default, Opus backup)
- Opus activation truly exceptional

**Task Categorization**:
> "Tasks don't require complex reasoning (no deep debugging, architecture design). Routine development—features, bug fixes, refactoring—operates efficiently at lower tiers."

**Core Principle**: "Match model capability to task complexity rather than applying maximum resources universally."

---

## III. Novel Orchestration Patterns

### 3.1 Strict Role Separation

**Pattern**: Hard boundary between orchestration and execution roles.

**Implementation**:
```markdown
# In every orchestration command
YOU ARE AN ORCHESTRATOR, NOT AN IMPLEMENTER.

Orchestrator MUST:
- Read files, track progress, spawn agents
- Never execute code changes directly

Exception: Only write to .omc/, .claude/, config, docs
```

**Benefit**: Prevents scope creep, enforces delegation, enables parallelism.

**Contrast with Olympus**: We allow Claude to do simple edits directly. OMC is more strict.

### 3.2 Explicit Model Parameter Passing

**Pattern**: Always pass `model` parameter to agents, never rely on defaults.

**Quote from Ultrawork**:
> "Critical requirement: Always explicitly pass the `model` parameter—the system won't auto-apply model assignments from agent definitions."

**Implementation**:
```typescript
// Always do this
Task({ agent: "executor", model: "sonnet", ... })

// Never rely on defaults
Task({ agent: "executor-high", ... })  // ❌ Won't auto-apply Opus
```

**Benefit**: Explicit cost control, predictable routing, no surprises.

### 3.3 Two-Stage Review Protocol

**Pattern**: Spec compliance check before quality assessment.

**Quote from code-reviewer**:
> "Stage 1 examines whether implementation meets requirements and solves the stated problem. Stage 2 applies code quality checks—but only proceeds after Stage 1 passes."

**Skip Condition**: "Skip Stage 1 only for trivial changes (typos, single-line fixes)."

**Benefit**: Prevents wasted effort on quality reviews for wrong implementations.

### 3.4 Circuit Breaker Pattern

**Pattern**: After N failed attempts, escalate to architectural review instead of iterating.

**Quote from architect**:
> "Questions architecture after 3+ failed fix attempts rather than iterating variations."

**Implementation**:
```markdown
If fix_attempts >= 3:
  Spawn architect agent with full context
  Question: "Is the approach fundamentally flawed?"
  Instead of: Try variation #4 of same approach
```

**Benefit**: Prevents infinite loops, catches design flaws early.

### 3.5 Evidence-Based Assertions (QA Pattern)

**Pattern**: Always capture output before making test assertions.

**Quote from qa-tester**:
> "Always capture-pane before asserting to prevent false passes based on assumed output."

**Implementation**:
```markdown
# Wrong
Start service → Wait 5s → Assert "should work"

# Right
Start service → Capture output → Parse output → Assert based on captured data
```

**Benefit**: Prevents false positives, provides debugging evidence.

### 3.6 Atomic Task Claiming (Swarm Pattern)

**Pattern**: SQLite-based transaction locking for parallel agent coordination.

**Quote from swarm**:
> "SQLite transactions ensure only one agent can claim a task using immediate transaction locking."

**Implementation**:
```sql
BEGIN IMMEDIATE;
UPDATE tasks SET status='claimed', agent_id=? WHERE id=? AND status='pending';
COMMIT;
```

**Benefit**: No duplicate work, clean coordination without message passing.

### 3.7 Minimal Viable Diff Philosophy

**Pattern**: Smallest possible change to achieve goal.

**Quote from executor**:
> "Execute specified tasks with minimal viable diffs, avoiding architectural decisions."

**Quote from build-fixer**:
> "Changes comprise less than 5% of affected files."

**Implementation**:
```markdown
Success Criteria:
- Requested change implemented ✓
- Smallest viable diff ✓
- No refactoring of adjacent code ✓
- No new abstractions for single-use ✓
```

**Benefit**: Reduces merge conflicts, easier code review, less risk.

### 3.8 Compaction-Resilient State

**Pattern**: Re-inject critical directives before context compaction.

**Quote from Implementation Summary**:
> "User says 'only look at symbol=perpetual' → compaction happens → AI forgets. Solution: PreCompact hook re-injects instructions into systemMessage."

**Implementation**:
```typescript
// PreCompact hook (10s budget)
export async function preCompact(context) {
  const memory = loadProjectMemory();
  const directives = extractHighPriorityDirectives(memory);
  return { systemMessageSuffix: directives };
}
```

**Benefit**: Preserves user intent across long sessions.

### 3.9 Smart Background Execution

**Pattern**: Categorize operations by duration/importance for async execution.

**Quote from Ultrawork**:
```markdown
Run asynchronously:
- Package/dependency installations
- Build processes and test suites
- Docker operations

Run in foreground:
- Status checks and file reads
- Simple diagnostic commands
```

**Benefit**: Faster orchestration, better resource utilization.

### 3.10 Tiered Verification Protocol

**Pattern**: Different verification depths by model tier.

**Quote from qa-tester**:
```markdown
- Default (Sonnet): Medium effort (happy path + key error scenarios)
- Comprehensive (Opus): Edge cases, security, performance, concurrent access
```

**Benefit**: Cost-appropriate testing, flexible quality gates.

---

## IV. Prompt Engineering Techniques

### 4.1 Role Identity Enforcement

**Pattern**: Strong identity declaration at agent definition start.

**Examples**:
```markdown
# Architect
"Architect (Oracle) is a READ-ONLY code analysis and debugging advisor"

# Executor
"Implementation specialist focused on precise code changes within assigned scope"

# Designer
"Create production-grade UI/UX implementations with distinctive visual design"

# Critic
"Work plan review expert who verifies clarity, completeness, and actionability"
```

**Structure**:
1. Agent name + alias (if any)
2. Core identity in one sentence
3. Model tier
4. Key constraint (read-only, no spawning, etc.)

### 4.2 Explicit Scope Boundaries

**Pattern**: List both what agent DOES and what it DOESN'T do.

**Example from designer**:
```markdown
## Core Responsibilities
- Interaction design and UI solution architecture
- Framework-idiomatic component implementation
- Visual polish (typography, color, motion, layout)

## Key Constraints
Explicitly avoids:
- Research evidence generation
- Information architecture governance
- Backend logic
- API design
```

**Benefit**: Prevents scope creep, enables clean handoffs.

### 4.3 Critical Failure Modes

**Pattern**: Document common failure patterns to avoid.

**Example from executor**:
```markdown
## Critical Failure Modes to Avoid
- Overengineering with unnecessary utilities
- Scope creep into "while I'm here" fixes
- Claiming completion without fresh verification
- Modifying tests instead of fixing production code
- Batch-marking multiple TodoWrite items
```

**Example from planner**:
```markdown
## Critical Failure Modes to Avoid
- Asking users codebase questions
- Over-planning (30 micro-steps)
- Under-planning (vague directives)
- Generating plans without explicit request
- Skipping user confirmation
- Proposing unnecessary rewrites
```

**Benefit**: Preempts common mistakes, improves reliability.

### 4.4 Success Criteria as Checklist

**Pattern**: Explicit, measurable success criteria.

**Example from architect**:
```markdown
## Success Criteria
- ✓ Citations with file:line specificity
- ✓ Identified root causes (not just symptoms)
- ✓ Implementable recommendations
- ✓ Acknowledged trade-offs
- ✓ Focused scope (no tangents)
```

**Example from build-fixer**:
```markdown
## Success Metrics
- ✓ Build command exits with code 0
- ✓ No new errors introduced
- ✓ Changes < 5% of affected files
- ✓ No architectural modifications
- ✓ Fresh build output confirms fix
```

**Benefit**: Clear completion signal, objective evaluation.

### 4.5 Investigation Protocol

**Pattern**: Step-by-step investigation workflow.

**Example from architect**:
```markdown
## Investigation Protocol
1. Gather context first (parallel Glob/Grep/Read)
2. Form hypotheses
3. Cross-reference against code
4. Identify root cause with file:line citations
5. Analyze trade-offs
6. Provide concrete recommendations
```

**Example from critic**:
```markdown
## Core Workflow
1. Read the work plan document
2. Verify all file references by examining actual files
3. Simulate 2-3 representative tasks step-by-step
4. Apply four evaluation criteria
5. Issue clear OKAY or REJECT verdict
```

**Benefit**: Consistent behavior, thorough analysis.

### 4.6 Tool Usage Constraints

**Pattern**: Explicitly enable/disable tools.

**Example from architect**:
```markdown
## Tool Usage
- Glob, Grep, Read (parallel exploration) ✓
- LSP diagnostics (type checking) ✓
- AST grep search (structural patterns) ✓
- Bash with git blame/log ✓
- Write, Edit tools ❌ BLOCKED
```

**Example from executor**:
```markdown
## Key Constraints
- Work independently
- Task/agent spawning ❌ BLOCKED
- No new abstractions for single-use logic
- No refactoring of adjacent code unless requested
```

**Benefit**: Enforces role boundaries, prevents misuse.

### 4.7 Handoff Protocol

**Pattern**: Explicit delegation rules for when to hand off to other agents.

**Example from architect**:
```markdown
## Agent Interactions
- Hands off to Analyst: Requirements gaps
- Hands off to Planner: Plan creation
- Hands off to Critic: Plan review
- Hands off to QA-Tester: Runtime verification
```

**Example from planner**:
```markdown
## Handoff Protocol
- Consult analyst (Metis) before finalizing plan
- Display summary and wait for explicit approval
- Hand off on user confirmation via /oh-my-claudecode:start-work
```

**Benefit**: Clear coordination, no orphaned work.

### 4.8 Quantified Thresholds

**Pattern**: Specific numeric thresholds instead of vague terms.

**Examples**:
```markdown
# Build-fixer
"Changes comprise less than 5% of affected files"

# Performance-reviewer
"Only flag code with quantified complexity impact (e.g., O(n²) when n > 1000)"

# Test-engineer
"70% unit, 20% integration, 10% e2e testing pyramid"

# QA-tester
"Heartbeat every 60s; tasks unclaimed for 5min auto-release"
```

**Benefit**: Objective criteria, no ambiguity.

### 4.9 Output Format Specification

**Pattern**: Prescribe exact output structure.

**Example from security-reviewer**:
```markdown
## Output Requirements
- Risk level designation (HIGH/MEDIUM/LOW)
- Per-issue details: location, category, severity, exploitability, blast radius
- Secure code examples matching source language
- Security checklist completion
```

**Example from analyst**:
```markdown
## Success Metrics
- All unasked questions identified with reasoning
- Guardrails defined with suggested bounds
- Scope creep areas flagged with prevention tactics
- Assumptions validated through specific methods
- Acceptance criteria are measurable (pass/fail only)
```

**Benefit**: Consistent output, easy parsing, clear expectations.

### 4.10 Anti-Pattern Documentation

**Pattern**: Document what NOT to do with examples.

**Example from designer**:
```markdown
## Critical Failure Modes to Avoid
- Generic design using standard fonts and spacing
- "Purple gradients on white" (dismissed as "AI slop")
- Framework mismatches in implementation
- Ignoring existing codebase patterns
- Unverified implementations
```

**Example from performance-reviewer**:
```markdown
## Critical Constraints
- Avoid premature optimization of cold code
- Avoid optimizing startup-only code
- Avoid reporting microsecond differences in non-critical paths
```

**Benefit**: Prevents known bad behaviors, quality improvement.

---

## V. Context & Memory Patterns

### 5.1 Project Memory System

**Architecture** (from Implementation Summary):
```
SessionStart Hook → Detect project type, hot paths
PostToolUse Hook → Learn from tool usage (Bash, I/O, search, messages)
PreCompact Hook → Re-inject directives before compaction
```

**Storage**: `.omc/project-memory.json` with 24h cache expiry + session deduplication

**Detection**: 60+ directory type signatures + package manifest parsing

**Data Enrichment**:
- Hot path tracking (file access frequency, 7-day decay)
- Directory purpose mapping (2-level deep scan)
- Directive classification (explicit vs inferred, high vs normal priority)

**Compaction Resilience**:
> "User says 'only look at symbol=perpetual' → compaction happens → AI forgets. Solution: PreCompact hook re-injects into systemMessage."

### 5.2 State Persistence Strategy

**Swarm Mode**: `.omc/state/swarm.db` (SQLite) for atomic task claiming

**Pipeline Mode**: `.omc/pipeline-state.json` for stage outputs

**Plans**: `.omc/plans/*.md` for work plans

**Drafts**: `.omc/drafts/` for intermediate artifacts

**Memory**: `.omc/project-memory.json` for learned patterns

**HUD Config**: `~/.claude/.omc/hud-config.json` for display preferences

### 5.3 Multi-Source Learning

**Learning Sources** (from Implementation Summary):
1. **Bash commands**: Frequent operations, build commands
2. **File I/O**: Hot paths, access patterns
3. **Text search**: Common queries, patterns
4. **User messages**: Explicit directives

**Learning Loop**: Tool usage → pattern extraction → memory storage → context injection

### 5.4 Structured Data Passing (Pipeline)

**Pattern**: Each pipeline stage receives structured context.

**Structure**:
```typescript
{
  stage: number,
  totalStages: number,
  previousOutputs: Array<{ agent: string, findings: string }>,
  fileReferences: string[],
  originalTask: string
}
```

**Benefit**: Cumulative knowledge, no information loss.

---

## VI. HUD & Progress Visibility

### 6.1 HUD Display Presets

**Three Modes**:
1. **Minimal**: Essentials only (basic status)
2. **Focused** (default): Comprehensive (context, agent count)
3. **Full**: Everything including multi-line agent details + hierarchy

### 6.2 Monitoring Elements

**Tracked Dimensions**:
- Loop iterations (Ralph counter: current/max)
- Story tracking (active PRD identifier)
- Context awareness (window usage % with color thresholds: 70% yellow, 85% red)
- Agent management (running count + background task slots)
- Task completion (TODO progress)

### 6.3 Visual Feedback System

**Color Coding**:
- Green: Normal operations
- Yellow: Warnings (elevated context/loop count)
- Red: Critical conditions

**Agent Hierarchy Display**:
```
├─ executor:haiku [45s] "Implementing user auth"
├─ designer:sonnet [1m 23s] "Creating login component"
└─ build-fixer:sonnet [12s] "Fixing type errors"
```

**Format**: Tree-style markers, agent type codes, duration timers, activity (45 char limit)

### 6.4 Configuration

**Storage**: `~/.claude/.omc/hud-config.json`

**Granular Control**: Enable/disable individual elements while maintaining defaults

---

## VII. Comparison: OMC vs Olympus

### 7.1 Similarities

| Aspect | OMC | Olympus |
|--------|-----|---------|
| Multi-AI | Haiku/Sonnet/Opus tiers | Gemini/Codex/Claude |
| Agent Specialization | 32 specialized agents | Core + On-Demand agents |
| Persistent Execution | Ralph loop + TODO tracking | Sisyphus loop + Task tools |
| Cost Optimization | Ecomode (30-50% savings) | Core agents default (Haiku) |
| Progress Visibility | HUD statusline | Dashboard + Telegram bot |
| Planning | Planner + Analyst + Critic | Prometheus + Momus + Metis |

### 7.2 Key Differences

#### Orchestrator-Executor Separation

**OMC**:
- Hard boundary: "YOU ARE AN ORCHESTRATOR, NOT AN IMPLEMENTER"
- Orchestrators NEVER write code (except `.omc/`, `.claude/`, configs)
- ALL code changes via executor agents

**Olympus**:
- Softer boundary: Claude can do simple edits directly
- Delegation for complex/specialized work
- More flexible, less strict

**Recommendation**: Consider adopting OMC's strict separation for `/orchestration` mode.

#### Model Parameter Passing

**OMC**:
- Always explicit: `Task({ agent: "executor", model: "sonnet", ... })`
- Never rely on agent definition defaults
- Critical for cost control

**Olympus**:
- Implicit routing based on agent definition
- `oracle` → Opus, `explore` → Haiku, etc.
- Simpler but less explicit

**Recommendation**: Add explicit model parameter to agent invocations for transparency.

#### Two-Stage Review

**OMC**:
- Stage 1: Spec compliance (did it solve the problem?)
- Stage 2: Code quality (only if Stage 1 passes)
- Skip Stage 1 only for trivial changes

**Olympus**:
- Combined review in single pass
- Momus reviews plan, not implementation

**Recommendation**: Adopt two-stage review for code changes in Phase 5.

#### Circuit Breaker

**OMC**:
- After 3 failed attempts, escalate to architect
- Question approach instead of iterating variations

**Olympus**:
- Max 3 loops (Phase 6→7→8)
- 3 failures → rollback options

**Recommendation**: Add architect escalation before rollback in Phase 8.

#### Evidence-Based Assertions

**OMC**:
- QA-tester: "Always capture-pane before asserting"
- Prevents false positives

**Olympus**:
- qa-tester agent uses tmux but less explicit

**Recommendation**: Add "capture before assert" rule to qa-tester agent.

#### Atomic Task Claiming

**OMC**:
- SQLite transactions for swarm coordination
- No message passing needed

**Olympus**:
- Task tools with status updates
- Shared task list in memory

**Recommendation**: Consider SQLite for high-parallelism scenarios (30+ agents).

#### Minimal Viable Diff

**OMC**:
- Explicit philosophy: smallest possible change
- Build-fixer: "Changes < 5% of affected files"

**Olympus**:
- Not explicitly enforced
- Search-substitute strategy is similar

**Recommendation**: Add "minimal diff" criterion to Phase 5 merge review.

#### Compaction Resilience

**OMC**:
- PreCompact hook re-injects high-priority directives
- Preserves user intent across long sessions

**Olympus**:
- Contract Document in Phase 0 serves similar purpose
- But not re-injected on compaction

**Recommendation**: Implement PreCompact hook for Contract Document.

---

## VIII. Actionable Recommendations for Olympus v5.2

### 8.1 High Priority (Immediate Implementation)

#### 1. Strict Orchestrator-Executor Separation (Phase 4)

**Current**: Claude can do simple edits in `/orchestration`.

**Proposed**: Hard boundary like OMC.

```markdown
## Phase 4: Code Execution

⚠️ CRITICAL ORCHESTRATION RULE:
YOU ARE AN ORCHESTRATOR, NOT AN IMPLEMENTER.

You MUST delegate ALL code changes:
- Frontend changes → `gemini_patch` or `delegate_task(force_agent='gemini')`
- Backend changes → `codex_patch` or `delegate_task(force_agent='codex')`
- Documentation → document-writer agent
- Tests → qa-tester agent

ONLY you may write directly to:
- `.sisyphus/` (Contract, Plan, State)
- `.claude/` (Config)
- `CLAUDE.md`, `AGENTS.md` (Documentation)

NEVER execute code changes yourself, even for "quick fixes."
```

**Benefit**: Consistent delegation, better parallelism, clearer role boundaries.

#### 2. Two-Stage Review Protocol (Phase 5)

**Current**: Single-pass merge review.

**Proposed**: Two-stage like OMC code-reviewer.

```markdown
## Phase 5: Merge & Review

### Stage 1: Specification Compliance
- Did patches solve the stated problem?
- Are Contract requirements met?
- Do tests pass?
- ⚠️ Skip Stage 2 if Stage 1 fails

### Stage 2: Code Quality (only if Stage 1 passes)
- Invoke momus agent for code review
- Check for security issues, performance concerns
- Verify minimal diff philosophy (< 5% of files)
- /agent-browser for UI verification
```

**Benefit**: Avoids wasting time reviewing wrong implementations.

#### 3. Circuit Breaker Pattern (Phase 8)

**Current**: 3 loops → rollback options.

**Proposed**: Escalate to oracle before rollback.

```markdown
## Phase 8: Judgment

### Failure Handling
If Phase 7 fails:
1. Increment loop_count
2. If loop_count >= 3:
   a. BEFORE rollback, invoke oracle agent:
      - "Is the fundamental approach flawed?"
      - "Should we change strategy instead of iterating?"
   b. If oracle suggests new approach:
      - Create new Feature Set in Phase 1
      - Reset loop_count
      - Continue
   c. If oracle confirms approach is sound:
      - Proceed to rollback options
```

**Benefit**: Catches design flaws before wasting more tokens.

#### 4. Explicit Model Parameter Passing

**Current**: `delegate_task()` → auto-detects domain → routes to Gemini/Codex.

**Proposed**: Always explicit.

```markdown
## Phase 2: Plan Review

# Current
ai_team_analyze(prompt="Review PLAN.md", context=plan_content)

# Proposed
ai_team_analyze(
  prompt="Review PLAN.md",
  context=plan_content,
  gemini_model="gemini-3-flash-preview",  # Explicit
  codex_model="gpt-4o"                     # Explicit
)
```

**Benefit**: Transparency, cost predictability, easier debugging.

#### 5. Evidence-Based Assertions (qa-tester)

**Current**: qa-tester agent uses tmux, but no explicit rule.

**Proposed**: Add to agent definition.

```markdown
## qa-tester Agent (Update)

### Critical Rule: Evidence-Based Assertions
⚠️ ALWAYS capture output BEFORE making assertions.

# Wrong
tmux send-keys "npm test" Enter
sleep 5
assert "Tests should pass"  # Based on assumption

# Right
tmux send-keys "npm test" Enter
sleep 5
output = tmux capture-pane -p
assert "All tests passed" in output  # Based on evidence
```

**Benefit**: Prevents false positives, provides debugging data.

### 8.2 Medium Priority (Next Release)

#### 6. Minimal Viable Diff Philosophy

**Proposed**: Add to Phase 5 merge criteria.

```markdown
## Phase 5: Merge & Review

### Minimal Diff Checklist
Before merging patches:
- [ ] No unnecessary refactoring of adjacent code
- [ ] No new abstractions for single-use logic
- [ ] No "while I'm here" scope creep
- [ ] Changes affect < 5% of each file (build-fixer level)
- [ ] No style-only changes mixed with logic changes
```

#### 7. Compaction-Resilient Contract Document

**Proposed**: Re-inject Contract before compaction.

```typescript
// PreCompact hook
export async function preCompact(context) {
  const contractPath = '.sisyphus/CONTRACT.md';
  if (fs.existsSync(contractPath)) {
    const contract = fs.readFileSync(contractPath, 'utf-8');
    return {
      systemMessageSuffix: `\n\n## Active Contract Document\n${contract}`
    };
  }
  return {};
}
```

#### 8. Quantified Thresholds

**Proposed**: Add specific numbers throughout protocol.

```markdown
# Current (vague)
"Complexity Heuristic 기반 자동 모드 결정"

# Proposed (specific)
"Complexity Score 계산:
- Impact (0-5): 변경 파일 수 × 0.5 + 신규 파일 수 × 1.0
- Context (0-5): 외부 의존성 수 × 0.3 + DB 스키마 변경 여부 × 2.0
- Logic (0-5): 알고리즘 복잡도 (1=CRUD, 3=비즈니스 로직, 5=동시성/보안)

총합 0-4: Silent Mode
총합 5-8: Fast Mode
총합 9-14: Proposal Mode
총합 15+: Orchestration 강제"
```

#### 9. Anti-Pattern Documentation

**Proposed**: Add to each Phase.

```markdown
## Phase 4: Code Execution

### Critical Failure Modes to Avoid
- ❌ Orchestrator writing code directly (except `.sisyphus/`, `.claude/`)
- ❌ Skipping ai_team_patch even for "simple" changes
- ❌ Mixing frontend and backend changes in single patch
- ❌ Not checking Shared Surface conflicts before parallel execution
- ❌ Proceeding without Codex consensus on architecture
```

### 8.3 Low Priority (Future Research)

#### 10. SQLite-Based Task Coordination

**Proposed**: For high-parallelism scenarios (30+ agents).

```markdown
## Swarm Mode (New Mode)

When Feature Set contains 30+ Work Items:
1. Initialize `.sisyphus/swarm.db` (SQLite)
2. Decompose Work Items into micro-tasks
3. Spawn 30-50 agents with atomic task claiming:
   BEGIN IMMEDIATE;
   UPDATE tasks SET status='claimed', agent_id=? WHERE id=? AND status='pending';
   COMMIT;
4. Heartbeat every 60s, auto-release stale tasks (5min)
5. Poll every 5s for completions, spawn replacements
```

**Benefit**: Extreme parallelism without coordination overhead.

---

## IX. Specific Prompt Patterns to Adopt

### Pattern 1: Role Identity Declaration

```markdown
# Add to each agent definition (explore, oracle, sisyphus-junior, etc.)

**Name**: {agent-name}
**Model**: {haiku|sonnet|opus}
**Core Identity**: {one-sentence description}

## Primary Responsibilities
- {responsibility 1}
- {responsibility 2}
- {responsibility 3}

## Out of Scope
- {what this agent does NOT do}
- {clear boundaries}

## Key Constraints
- {tool restrictions}
- {delegation rules}
- {must/must not directives}
```

### Pattern 2: Critical Failure Modes

```markdown
# Add to each Phase and Agent

## Critical Failure Modes to Avoid
- ❌ {anti-pattern 1} (e.g., "Orchestrator writing code")
- ❌ {anti-pattern 2} (e.g., "Skipping evidence capture")
- ❌ {anti-pattern 3} (e.g., "Over-planning with 30 micro-steps")
- ❌ {anti-pattern 4}
- ❌ {anti-pattern 5}
```

### Pattern 3: Success Criteria Checklist

```markdown
# Add to each Phase

## Success Criteria
- [ ] {criterion 1 with metric}
- [ ] {criterion 2 with metric}
- [ ] {criterion 3 with metric}
- [ ] {criterion 4 with metric}
- [ ] {criterion 5 with metric}

⚠️ ALL must be checked before proceeding to next Phase.
```

### Pattern 4: Investigation Protocol

```markdown
# Add to each analysis Phase (0, 1, 2)

## Investigation Protocol
1. {Step 1 with specific actions}
2. {Step 2 with specific actions}
3. {Step 3 with specific actions}
4. {Step 4 with specific actions}
5. {Step 5 with specific actions}

Follow this order. Do not skip steps.
```

### Pattern 5: Quantified Thresholds

```markdown
# Replace vague terms with numbers

# Before
"복잡도가 높으면"

# After
"Complexity Score >= 15"

# Before
"충분한 테스트"

# After
"Test Coverage >= 80% (Hard Gate)"

# Before
"약간의 변경"

# After
"Changes < 5% of affected files"
```

### Pattern 6: Explicit Handoff Protocol

```markdown
# Add to each agent definition

## Agent Interactions
When to delegate:
- {Condition 1} → {target agent} (e.g., "Requirements gaps → analyst")
- {Condition 2} → {target agent} (e.g., "Plan creation → planner")
- {Condition 3} → {target agent} (e.g., "Runtime verification → qa-tester")

How to delegate:
- Use {tool name} with parameters: {example}
- Pass context: {what to include}
- Wait for: {completion signal}
```

### Pattern 7: Tool Usage Constraints

```markdown
# Add to each agent definition

## Tool Usage
Allowed:
- ✓ {tool 1} ({purpose})
- ✓ {tool 2} ({purpose})
- ✓ {tool 3} ({purpose})

Blocked:
- ❌ {tool 4} ({reason})
- ❌ {tool 5} ({reason})

Special Rules:
- {tool 6}: Only for {specific purpose}
- {tool 7}: Only in {specific phase}
```

### Pattern 8: Output Format Specification

```markdown
# Add to each agent definition

## Output Requirements
Your output MUST include:

1. **{Section 1 Name}**: {what to include}
   - {detail 1}
   - {detail 2}

2. **{Section 2 Name}**: {what to include}
   - {detail 1}
   - {detail 2}

3. **{Section 3 Name}**: {what to include}
   Format: {example}

4. **Verdict**: {APPROVE | REQUEST CHANGES | REJECT}

Never output: {what to avoid}
```

---

## X. Key Quotes for Reference

### On Orchestration

> "YOU ARE AN ORCHESTRATOR, NOT AN IMPLEMENTER. Direct code modifications forbidden; must delegate to executor agents." — Autopilot

> "Orchestrator handles: file reading, progress tracking, agent spawning. Executors handle: all code modifications. Designers handle: UI work. Writers handle: documentation." — Ralph

> "Always explicitly pass the `model` parameter—the system won't auto-apply model assignments from agent definitions." — Ultrawork

### On Execution Philosophy

> "Execute specified tasks with minimal viable diffs, avoiding architectural decisions, root cause debugging, or quality reviews." — Executor

> "Get a failing build green with the smallest possible changes. Changes comprise less than 5% of affected files." — Build-fixer

> "The difference between a forgettable and a memorable interface is intentionality in every detail." — Designer

### On Quality & Verification

> "Always capture-pane before asserting to prevent false passes based on assumed output." — QA-Tester

> "Stage 1 examines whether implementation meets requirements. Stage 2 applies code quality checks—but only proceeds after Stage 1 passes." — Code-Reviewer

> "Every claim must cite specific file:line references; vague recommendations are prohibited." — Architect

> "Questions architecture after 3+ failed fix attempts rather than iterating variations." — Architect (Circuit Breaker)

### On Planning & Analysis

> "Converting product scope into testable acceptance criteria. Surfaces missing questions with justification." — Analyst

> "Plans must be clear and unambiguous enough for executors to proceed without guessing." — Critic

> "Interprets requests like 'do X' as 'create a plan for X'—never implements code directly." — Planner

### On Specialization

> "Own USER EVIDENCE—the problems, not the solutions." — UX-Researcher

> "Only flag code with quantified complexity impact (e.g., O(n²) when n > 1000)." — Performance-Reviewer

> "Identify and prioritize security vulnerabilities by severity × exploitability × blast radius." — Security-Reviewer

### On Cost Optimization

> "Match model capability to task complexity rather than applying maximum resources universally." — Ecomode

> "Tasks don't require complex reasoning (no deep debugging, architecture design). Routine development operates efficiently at lower tiers." — Ecomode

### On Context Preservation

> "User says 'only look at symbol=perpetual' → compaction happens → AI forgets. Solution: PreCompact hook re-injects into systemMessage." — Implementation Summary

> "SQLite transactions ensure only one agent can claim a task using immediate transaction locking." — Swarm

---

## XI. Conclusion

**oh-my-claudecode** demonstrates mature multi-agent orchestration through:

1. **Strict Role Separation**: Hard boundaries between orchestrators and executors
2. **Explicit Model Routing**: Always specify model tier for cost control
3. **Comprehensive Agent Specialization**: 32 agents with clear responsibilities
4. **Novel Coordination Patterns**: Circuit breakers, two-stage reviews, atomic task claiming
5. **Robust State Management**: Compaction-resilient memory, SQLite coordination
6. **Cost Optimization**: 30-50% token savings via smart tiering
7. **Progress Visibility**: HUD statusline with real-time agent tracking

**Key Insight**: The system's power comes from **explicit constraints** rather than implicit trust. Every agent knows exactly what it can/cannot do, when to delegate, and how to verify success.

**For Olympus v5.2**, the most valuable adoptions are:

1. **Strict orchestrator-executor separation** in Phase 4
2. **Two-stage review protocol** in Phase 5
3. **Circuit breaker pattern** before rollback in Phase 8
4. **Explicit model parameters** in all MCP calls
5. **Evidence-based assertions** in qa-tester
6. **Critical failure modes** documentation in every Phase
7. **Minimal viable diff** philosophy in merge review
8. **Compaction-resilient Contract** re-injection

These changes would elevate Olympus from "good multi-AI orchestration" to "production-grade multi-agent system" with clear boundaries, predictable behavior, and systematic quality gates.

---

## XII. Appendix: Agent Quick Reference

### Investigation Agents (Read-Only)

| Agent | Model | Purpose | Key Constraint |
|-------|-------|---------|----------------|
| explore | Haiku | Fast codebase search | Read-only, no Write/Edit |
| architect | Opus | Bug diagnosis, architectural guidance | Read-only, evidence-based |
| analyst | Opus | Requirements analysis, gap identification | Read-only, testability focus |
| critic | Opus | Work plan review, actionability verification | Read-only, rejects YAML |

### Implementation Agents

| Agent | Model | Purpose | Key Constraint |
|-------|-------|---------|----------------|
| executor-low | Haiku | Simple implementations | No spawning, minimal diff |
| executor | Sonnet | Standard features | No spawning, minimal diff |
| executor-high | Opus | Complex refactoring | No spawning, minimal diff |
| build-fixer | Sonnet | Get builds green | < 5% file changes |
| designer | Sonnet | UI/UX with visual polish | No backend, intentional design |
| planner | Opus | Strategic planning via interviews | No code, only `.omc/plans/` |

### Quality Assurance Agents

| Agent | Model | Purpose | Key Constraint |
|-------|-------|---------|----------------|
| code-reviewer | Sonnet | 2-stage code review | Read-only, severity-rated |
| security-reviewer | Opus | OWASP Top 10, secrets detection | Read-only, risk prioritization |
| performance-reviewer | Opus | Algorithmic complexity, hotspots | Read-only, quantified impact |
| qa-tester | Sonnet | Interactive CLI testing (tmux) | Evidence-based assertions |
| test-engineer | Sonnet | Test strategy, TDD enforcement | 70/20/10 pyramid |

### Research Agents

| Agent | Model | Purpose | Key Constraint |
|-------|-------|---------|----------------|
| ux-researcher | Sonnet | Evidence-based UX research | Problems, not solutions |

### Execution Modes

| Mode | Command | Purpose | Key Feature |
|------|---------|---------|-------------|
| Autopilot | `/oh-my-claudecode:autopilot` | 5-phase feature development | Analyst → Plan → Execute → QA → Validate |
| Ultrawork | `/oh-my-claudecode:ultrawork` | Maximum parallelism | Explicit model routing |
| Ralph | `/oh-my-claudecode:ralph` | Persistent loop | Non-negotiable completion |
| Swarm | `/oh-my-claudecode:swarm N:agent "task"` | Coordinated parallel tasks | SQLite atomic claiming |
| Pipeline | `/oh-my-claudecode:pipeline preset "task"` | Sequential AI chains | 6 presets, context propagation |
| Ecomode | Prefix: "eco", "budget" | Cost optimization | Haiku default, 30-50% savings |

---

**End of Analysis**
