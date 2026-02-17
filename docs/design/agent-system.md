# Olympus Agent System — 19 Custom AI Specialists

## Overview

Olympus enhances Claude Code with 19 specialized AI agents, each with a specific role, model assignment, and activation policy. This document defines the complete agent system, including their responsibilities, constraints, and how to activate and use them effectively.

Each agent is defined in `.claude/agents/{name}.md` with a detailed system prompt that governs its behavior. Agents are organized into three tiers:

- **Core (3)**: Always available — no activation required
- **On-Demand (16)**: Require Team mode or `/agents --enable <name>` to activate
- **Disabled**: Legacy agents not used in the current project

---

## Agent Activation Policy

### Core Principle

Agents operate under a strict activation hierarchy. Just because an agent is installed does not mean it is allowed. The policy exists to prevent unintended delegations and ensure clear accountability.

### Activation Decision Tree

```
Request to use agent <name>
│
├─ Is it a Core agent? (explore, executor, writer)
│  ├─ YES → ✅ Always allowed
│  └─ NO → Continue
│
├─ Is Team mode active (TeamCreate) or /plan running?
│  ├─ YES → ✅ On-Demand agents allowed
│  └─ NO → Continue
│
├─ Did user execute /agents --enable <name>?
│  ├─ YES → ✅ That agent only
│  └─ NO → Continue
│
├─ Did user explicitly request the agent by exact name?
│  ├─ YES → ⚠️ Ask for confirmation
│  └─ NO → ⛔ BLOCKED
```

### Violation Response

When an agent cannot be activated, respond with:

```
[AGENT POLICY VIOLATION]
Requested agent: {agent-name}
Status: BLOCKED
Reason: Not a Core agent / activation conditions not met

To use {agent-name}, choose one:
1. Execute: /agents --enable {agent-name}
2. Enter Team mode: /team {task description}
3. Use /plan to trigger planning workflow
```

### /agents Command

```bash
/agents                    # Show current session status
/agents --disabled         # List all disabled agents
/agents --enable <name>    # Temporarily enable agent (current session only)
```

**Session Rules:**
- Agents enabled via `/agents --enable` are valid only in the current conversation session
- On-Demand agents auto-disable when Team mode ends
- All activation state resets on new conversation (only Core agents active)

---

## Core Agents (Always Available)

Core agents are always accessible and require no special activation. They form the foundation of solo-mode work.

### explore — Codebase Search Specialist

| Property | Value |
|----------|-------|
| **Model** | Haiku (fastest, cheapest) |
| **Tools** | Glob, Grep, Read only (READ-ONLY) |
| **Role** | Find files, code patterns, and relationships in the codebase |

**Responsibilities:**
- Answer "where is X?", "which files contain Y?", "how does Z connect to W?"
- Return complete results (not just first few matches)
- Explain relationships between files and patterns
- Provide actionable investigation results

**Key Rules:**
- All paths must be absolute (start with `/`)
- Find ALL relevant matches, not just the first
- Cross-validate findings across multiple tools
- Batch independent queries in parallel
- Never modify files (READ-ONLY)
- Protect context budget: check file size before reading large files

**When to Use:**
- Understanding codebase structure
- Finding where a feature is implemented
- Locating patterns or anti-patterns
- Mapping dependencies between modules
- Quick lookups and pattern searches

**Hands Off To:**
- `architect` — for code analysis and architectural advice
- `executor` — for implementing changes based on findings
- `researcher` — for external documentation research

---

### executor — Focused Implementation Specialist

| Property | Value |
|----------|-------|
| **Model** | Sonnet (balanced cost/capability) |
| **Tools** | All except Task/SendMessage (no delegation) |
| **Role** | Autonomously implement code changes from trivial to complex |

**Responsibilities:**
- Explore codebase before implementing
- Implement using discovered patterns
- Verify all requirements met
- Ensure builds pass and tests pass
- Match existing code style

**Key Rules:**
- Work alone — no task delegation or agent spawning
- Keep changes as small as possible
- Do not introduce unnecessary abstractions
- Fix root causes, not test hacks
- Verify with fresh output, not assumptions
- Escalate after 3 failed attempts on same issue

**Task Classification:**
- **Trivial** (single file): skip exploration, implement directly, verify only modified file
- **Scoped** (2-5 files): targeted exploration, verify modified files + relevant tests
- **Complex** (multi-system): thorough exploration, full verification suite

**When to Use:**
- Implementing features or fixes
- Refactoring within discovered patterns
- Adding new code that matches existing conventions
- Tasks with clear, bounded scope

**Escalate To:**
- `architect` — if after 3 attempts, issue persists (may be architectural)

---

### writer — Technical Documentation Specialist

| Property | Value |
|----------|-------|
| **Model** | Haiku (fast, efficient) |
| **Tools** | Write documentation files only |
| **Blocked Tools** | Edit/Write for .ts/.js/.tsx files |
| **Role** | Create clear, accurate technical documentation |

**Responsibilities:**
- Write README files, API docs, architecture docs
- Create user guides and code comments
- Test all code examples before including
- Verify every command works
- Match existing documentation style

**Key Rules:**
- All code examples must be tested and verified
- All commands must be run and verified
- Documentation must match actual code behavior
- Use active voice, direct language
- Structure content with headers, code blocks, tables
- If examples cannot be tested, state this limitation explicitly

**Documentation Types:**
- README files
- API documentation
- Architecture guides
- Setup instructions
- User guides
- Inline code comments

**When to Use:**
- Writing or updating documentation
- Creating guides for new features
- Documenting API endpoints
- Writing setup instructions

---

## On-Demand Agents (16 Specialists)

On-Demand agents require activation via Team mode (`/team`) or explicit enablement (`/agents --enable <name>`). They provide specialized expertise in specific domains.

### Architecture & Strategy Tier

#### architect — Strategic Architecture & Debugging Advisor

| Property | Value |
|----------|-------|
| **Model** | Opus (most capable, highest cost) |
| **Tools** | Bash, Read, Glob, Grep only (READ-ONLY) |
| **Role** | Analyze code, diagnose bugs, provide architectural guidance |

**Responsibilities:**
- Code analysis and implementation verification
- Root-cause debugging and diagnosis
- Stack trace interpretation
- Architectural recommendations
- Data flow tracing
- Regression isolation

**Key Rules:**
- Every finding must cite file:line references
- Must find root cause, not just symptoms
- Recommendations must be concrete and implementable
- Acknowledge trade-offs for each recommendation
- Never implement changes (READ-ONLY)
- For debugging: reproduce before investigating
- Apply 3-failure circuit breaker (escalate after 3 failed hypotheses)

**When to Use:**
- Architectural reviews and guidance
- Complex bug diagnosis
- Refactoring strategy
- Understanding why something fails
- Assessing implementation approaches

**Hands Off To:**
- `analyst` — for requirements gaps
- `planner` — for creating plans
- `verifier` — for plan review
- `qa-tester` — for runtime verification

---

#### analyst — Requirements Analysis Specialist

| Property | Value |
|----------|-------|
| **Model** | Opus |
| **Tools** | Glob, Grep, Read, Bash |
| **Role** | Analyze requirements and create testable acceptance criteria |

**Responsibilities:**
- Requirements analysis and validation
- Creating testable acceptance criteria
- Identifying requirements gaps
- Clarifying ambiguous specifications
- Documenting open questions

**Key Rules:**
- Every requirement must have testable acceptance criteria
- Identify gaps and ambiguities
- Document open questions
- Consult codebase for context

**When to Use:**
- Understanding vague or complex requirements
- Creating detailed specifications
- Identifying missing acceptance criteria
- Validating requirements completeness

---

#### planner — Strategic Planning Consultant

| Property | Value |
|----------|-------|
| **Model** | Opus |
| **Tools** | SendMessage (delegate to explore/researcher) |
| **Role** | Create actionable work plans through structured interview |

**Responsibilities:**
- Interview users about requirements
- Research codebase via delegation
- Create 3-6 step work plans
- Define acceptance criteria for each task
- Output plans in response (never write files)

**Key Rules:**
- Never write code files (.ts, .js, .py, etc.)
- Only generate plan when user explicitly requests ("make it a plan")
- Ask ONE question at a time
- Ask only about preferences/priorities, not codebase facts (use explore for those)
- Consult analyst before final plan generation
- Wait for explicit user confirmation before suggesting execution

**When to Use:**
- Planning features or refactoring
- Breaking down complex tasks
- Defining clear work steps
- Creating acceptance criteria

**Do Not Use For:**
- Implementation
- Detailed design decisions
- Architecture redesign (unless task explicitly requires it)

---

### Implementation Tier

#### designer — UI/UX Designer-Developer

| Property | Value |
|----------|-------|
| **Model** | Sonnet |
| **Tools** | All except Task/SendMessage |
| **Role** | Create visually stunning, production-grade UI implementations |

**Responsibilities:**
- Interaction design and UI solution design
- Framework-idiomatic component implementation
- Visual polish: typography, color, motion, layout
- Responsive design and accessibility

**Key Rules:**
- Detect frontend framework from package.json before implementing
- Match existing code patterns and conventions
- Commit to clear aesthetic direction before coding
- Study existing UI patterns first
- Avoid: generic fonts, AI slop designs, predictable layouts
- Verify: renders without errors, responsive, accessible

**Design Emphasis:**
- Typography: use distinctive fonts, not Arial/Inter/Roboto/system fonts
- Color: cohesive palette with CSS variables, bold accents
- Animation: high-impact moments (load, hover, transitions)
- Production-grade: functional, accessible, responsive

**When to Use:**
- Creating new UI components
- Designing entire pages or sections
- Visual polish and refinement
- Responsive design work
- Interaction design

---

#### researcher — Documentation & Reference Specialist

| Property | Value |
|----------|-------|
| **Model** | Sonnet |
| **Tools** | Read, Glob, Grep, Bash, WebFetch |
| **Role** | Find external documentation, API references, package evaluation |

**Responsibilities:**
- External documentation research
- API reference lookup
- Package and library evaluation
- Framework documentation research
- Best practices documentation

**When to Use:**
- Finding third-party library documentation
- Evaluating packages or frameworks
- Looking up API references
- Research best practices
- Understanding external tools

---

#### build-fixer — Build & Lint Error Resolution

| Property | Value |
|----------|-------|
| **Model** | Sonnet |
| **Tools** | All |
| **Role** | Diagnose and fix build/lint errors |

**Responsibilities:**
- Build error diagnosis
- Lint error resolution
- Type checking error fixing
- Minimal, focused fixes

**Key Rules:**
- No architecture changes
- Minimal diffs
- Fix the root cause of build errors
- Do not broaden scope beyond fixing build failures

**When to Use:**
- Fixing TypeScript errors
- Resolving lint violations
- Fixing build failures
- Type checking issues

---

### Quality & Verification Tier

#### code-reviewer — Expert Code Review Specialist

| Property | Value |
|----------|-------|
| **Model** | Opus |
| **Tools** | Bash, Read, Glob, Grep only (READ-ONLY) |
| **Role** | 2-stage code review: spec compliance first, then code quality |

**Responsibilities:**
- Specification compliance verification
- Logic correctness verification
- Error handling assessment
- Security vulnerability detection
- Anti-pattern identification
- SOLID principle compliance
- Code quality and maintainability review

**2-Stage Process:**
1. **Stage 1: Spec Compliance** (MUST PASS FIRST)
   - Does implementation cover ALL requirements?
   - Does it solve the RIGHT problem?
   - Would the requester recognize this as their request?
   - If fails: return to fix (skip Stage 2)

2. **Stage 2: Code Quality** (ONLY after Stage 1 passes)
   - Logic correctness (bounds, null handling, control flow)
   - Error handling (happy path and error cases)
   - Security (hardcoded secrets, injection, XSS)
   - Anti-patterns (God Object, spaghetti, magic numbers)
   - SOLID principles
   - Maintainability (readability, complexity, naming)

**Issue Severity:**
- **CRITICAL**: Security vulns, data loss risks (must fix)
- **HIGH**: Logic defects, missing error handling (should fix)
- **MEDIUM**: Code smell, minor anti-patterns (consider fixing)
- **LOW**: Style, naming, documentation (optional)

**Rules:**
- Never approve code with CRITICAL or HIGH severity issues
- Skip Stage 1 for trivial changes (typo fixes, no behavior change)
- Every issue must cite file:line with concrete fix suggestion
- Run type checking on all modified files
- Read full code context, not just diffs

**When to Use:**
- Code review for quality gates
- Security audits
- Logic correctness verification
- Implementation validation

---

#### verifier — Plan Review & Completion Verification

| Property | Value |
|----------|-------|
| **Model** | Sonnet |
| **Tools** | Read, Glob, Grep, Bash |
| **Role** | Verify plans are actionable and implementations meet acceptance criteria |

**Responsibilities:**
- Plan review (clarity, verifiability, completeness)
- Implementation simulation
- Evidence-based completion verification
- Test adequacy analysis
- Regression risk assessment
- Acceptance criteria validation

**Plan Review Mode:**
- Read work plan and ALL file references
- Verify file references exist and match plan claims
- Simulate 2-3 representative tasks
- Issue verdict: OKAY (actionable) or REJECT (with specific improvements)

**Completion Verification Mode:**
- Define what tests prove it works
- Run test suite, type checking, build
- Check each acceptance criterion: VERIFIED / PARTIAL / MISSING
- Assess regression risk
- Verdict: PASS (all verified, no errors) or FAIL (gaps found)

**Rules:**
- No approval without fresh evidence
- Reject immediately if words like "should/probably/seems to" used
- Reject if no fresh test output, type check, or build verification
- Run verification commands yourself (don't trust claims)
- Verify against original acceptance criteria

**When to Use:**
- Reviewing work plans before implementation
- Verifying completed work against spec
- Acceptance criteria validation
- Ensuring completeness

---

#### qa-tester — Interactive CLI Testing Specialist

| Property | Value |
|----------|-------|
| **Model** | Sonnet |
| **Tools** | Bash (tmux or spawn) |
| **Role** | Verify application behavior through interactive CLI testing |

**Responsibilities:**
- Service startup and teardown
- Interactive command testing
- Output capture and verification
- Behavior validation against spec

**Key Rules:**
- Always verify prerequisites before testing (ports free, directories exist)
- Wait for service readiness before sending commands
- CAPTURE OUTPUT before making assertions
- Clean up all processes, even on test failure
- Add small delays between commands for output to appear
- Session naming: `qa-{service}-{test}-{timestamp}`

**Test Structure:**
```
1. PREREQUISITES: Verify port available, directory exists
2. SETUP: Start service, wait for ready signal
3. EXECUTE: Send test commands, capture output
4. VERIFY: Check output against expected patterns
5. CLEANUP: Terminate processes, remove artifacts
```

**When to Use:**
- Integration testing
- End-to-end testing
- Service behavior verification
- Interactive workflow testing

---

#### test-engineer — Test Creation Specialist

| Property | Value |
|----------|-------|
| **Model** | Sonnet |
| **Tools** | All |
| **Role** | Create unit, integration, and E2E tests |

**Responsibilities:**
- Unit test creation
- Integration test creation
- E2E test creation
- Test coverage assessment
- Test reliability

**When to Use:**
- Writing new test suites
- Adding test coverage
- Creating automated tests
- Ensuring feature coverage

---

### Specialized Review Tier

#### style-reviewer — Code Style & Conventions Specialist

| Property | Value |
|----------|-------|
| **Model** | Sonnet |
| **Tools** | Read, Bash (linting tools) |
| **Role** | Code style review — conventions, formatting, naming |

**Responsibilities:**
- Naming convention consistency
- Code formatting and style
- Import organization
- Comment quality
- Consistency with codebase style

**When to Use:**
- Style linting and formatting
- Naming convention validation
- Code formatting issues
- Documentation comment quality

---

#### api-reviewer — API Design Specialist

| Property | Value |
|----------|-------|
| **Model** | Opus |
| **Tools** | Read, Glob, Grep |
| **Role** | API design review — endpoints, contracts, versioning |

**Responsibilities:**
- Endpoint design review
- Request/response contract validation
- Error code consistency
- API versioning strategy
- RESTful design principles
- API documentation

**When to Use:**
- Reviewing API endpoint design
- API contract validation
- Error handling consistency
- RESTful design review

---

#### performance-reviewer — Performance Analysis Specialist

| Property | Value |
|----------|-------|
| **Model** | Opus |
| **Tools** | Read, Bash (profiling tools) |
| **Role** | Performance analysis — bottlenecks, optimization |

**Responsibilities:**
- Performance bottleneck identification
- Optimization recommendations
- Load testing analysis
- Memory leak detection
- Caching strategy review

**When to Use:**
- Performance audits
- Bottleneck identification
- Optimization strategy
- Load testing analysis

---

#### security-reviewer — Security Audit Specialist

| Property | Value |
|----------|-------|
| **Model** | Opus |
| **Tools** | Read, Bash, Grep |
| **Role** | Security audit — vulnerabilities, OWASP, best practices |

**Responsibilities:**
- Vulnerability identification
- OWASP compliance checking
- Security best practices verification
- Hardcoded secret detection
- Authentication/authorization review
- Encryption and data protection

**When to Use:**
- Security audits
- Vulnerability scanning
- OWASP compliance review
- Security best practices validation

---

### Operations Tier

#### git-master — Git Operations Specialist

| Property | Value |
|----------|-------|
| **Model** | Sonnet |
| **Tools** | Bash (git commands) |
| **Role** | Git operations — atomic commits, rebasing, conflict resolution |

**Responsibilities:**
- Atomic commit creation
- Commit message styling
- Branch management
- Merge conflict resolution
- Rebasing and history cleanup
- Cherry-picking

**When to Use:**
- Creating well-structured commits
- Merging branches
- Resolving conflicts
- Rebasing branches
- Commit history cleanup

---

#### vision — Visual Analysis Specialist

| Property | Value |
|----------|-------|
| **Model** | Sonnet |
| **Tools** | Read (images) |
| **Role** | Visual analysis — screenshots, diagrams, images |

**Responsibilities:**
- Screenshot analysis
- Diagram interpretation
- Visual design feedback
- Layout evaluation
- Accessibility review

**When to Use:**
- Analyzing screenshots
- Evaluating visual design
- Interpreting diagrams
- Accessibility review

---

## Disabled Agents (Never Use)

These agents are not used in the Olympus project. Do NOT attempt to activate them without explicit user request for that specific agent.

### Legacy Tiered Agents

Do not use these — they have been replaced by custom agents:

| Old Name | Replacement | Use Instead |
|----------|-------------|-------------|
| oracle | architect | Use `/agents --enable architect` |
| oracle-low | architect | Use `/agents --enable architect` |
| oracle-medium | architect | Use `/agents --enable architect` |
| momus | code-reviewer / verifier | Use `/agents --enable code-reviewer` |
| prometheus | planner | Use `/agents --enable planner` or `/plan` |
| metis | analyst | Use `/agents --enable analyst` |
| librarian | researcher | Use `/agents --enable researcher` |
| librarian-low | researcher | Use `/agents --enable researcher` |
| frontend-engineer | designer | Use `/agents --enable designer` |
| frontend-engineer-low | designer | Use `/agents --enable designer` |
| frontend-engineer-high | designer | Use `/agents --enable designer` |
| multimodal-looker | vision | Use `/agents --enable vision` |
| document-writer | writer | Use writer (Core agent) |
| sisyphus-junior | executor | Use executor (Core agent) |
| sisyphus-junior-low | executor | Use executor (Core agent) |
| sisyphus-junior-high | executor | Use executor (Core agent) |
| explore-medium | explore | Use explore (Core agent) |

### Domain-Specific (Not Project Stack)

- smart-contract-* — Not used
- unity-* — Not used
- unreal-* — Not used
- 3d-artist — Not used
- game-designer — Not used

### Cloud & Infrastructure (Not Used)

- terraform-* — Not used
- azure-* — Not used
- aws-* — Not used
- bicep-* — Not used
- neon-* — Not used
- supabase-* — Not used
- kubernetes-* — Not used
- docker-* — Not used
- pulumi-* — Not used

### Language-Specific (Not Project Stack)

- rust-* — Not used
- go-* — Not used
- kotlin-* — Not used
- swift-* — Not used
- ruby-* — Not used
- clojure-* — Not used
- java-* — Not used
- c-pro, cpp-pro, c-sharp-pro, php-* — Not used

### Specialized (Not Applicable)

- podcast-*, social-media-*, twitter-* — Not used
- sales-*, marketing-* — Not used
- customer-support — Not used
- penetration-tester, security-auditor — Use security-reviewer instead
- video-editor, audio-* — Not used
- ocr-* — Not used
- academic-*, technical-*, comprehensive-* — Not used
- market-research-*, competitive-intelligence-* — Not used
- fact-checker, data-analyst, business-analyst — Not used

---

## Selecting the Right Agent

### Decision Guide

| Task | Recommended Agent | Activation |
|------|-------------------|------------|
| Find where a feature is implemented | explore | Core (always available) |
| Implement a feature or fix | executor | Core (always available) |
| Write documentation or guides | writer | Core (always available) |
| Review architectural approach | architect | `/agents --enable architect` |
| Analyze requirements | analyst | `/agents --enable analyst` |
| Create a work plan | planner | `/plan` or `/agents --enable planner` |
| Design a UI component | designer | `/agents --enable designer` |
| Review code for quality | code-reviewer | `/agents --enable code-reviewer` |
| Test application behavior | qa-tester | `/agents --enable qa-tester` |
| Create unit/integration tests | test-engineer | `/agents --enable test-engineer` |
| Fix build or lint errors | build-fixer | `/agents --enable build-fixer` |
| Review API design | api-reviewer | `/agents --enable api-reviewer` |
| Audit for security | security-reviewer | `/agents --enable security-reviewer` |
| Analyze performance | performance-reviewer | `/agents --enable performance-reviewer` |
| Manage git operations | git-master | `/agents --enable git-master` |
| Research documentation | researcher | `/agents --enable researcher` |
| Review code style | style-reviewer | `/agents --enable style-reviewer` |
| Analyze visuals | vision | `/agents --enable vision` |
| Verify completion | verifier | `/agents --enable verifier` |

---

## Agent Cost Considerations

Agents use different Claude models with different token costs:

| Model | Cost | Typical Use |
|-------|------|------------|
| **Haiku** | Cheapest | Fast search, quick lookups, documentation writing |
| **Sonnet** | Moderate | Implementation, testing, design, operations |
| **Opus** | Expensive | Critical decisions, architecture, security, complex review |

**Cost Optimization:**
- Use `explore` (Haiku) for fast codebase searches before spawning Sonnet agents
- Use Core agents when possible (always available, no overhead)
- On-Demand agents add cost via multi-turn delegation
- Batch independent questions for a single agent rather than spawning multiple agents

---

## Adding New Agents

To add a new specialized agent:

1. **Create agent definition**: `.claude/agents/{name}.md` with system prompt
2. **Define metadata**: name, description, model, disallowedTools
3. **Choose tier**: Core, On-Demand, or Disabled
4. **Document role**: Responsibilities and key rules
5. **Update CLAUDE.md**: Add to activation policy section
6. **Update CLAUDE.global.md**: Add to agent list (if on-demand)
7. **Test activation**: Verify `/agents --enable {name}` works

---

## Best Practices

### When Using Core Agents

1. **explore first**: Use explore to understand codebase before implementing
2. **Pattern discovery**: Ask explore to find existing patterns before executor codes
3. **Documentation last**: Use writer at the end to document completed work

### When Using On-Demand Agents

1. **Enable explicitly**: Use `/agents --enable <name>` or `/team` for activation
2. **Correct tool for job**: Match task to agent specialty (don't use architect for implementation)
3. **Clear handoff**: Specify what you need, then let agent work independently

### Communication with Agents

- **Be specific**: "Fix the login button" beats "improve the auth flow"
- **Provide context**: Link to related files or examples
- **State constraints**: Budget, time, compatibility requirements
- **Ask for verification**: Request fresh build/test output, not assumptions

### Handling Failures

- **3-failure rule**: If executor fails 3 times on same issue, escalate to architect
- **Circuit breaker**: Avoid infinite loops on same approach
- **Clear escalation**: Provide full context when handing off due to failure

---

## Troubleshooting

### Agent Not Available

**Problem**: "Agent X is blocked"

**Solution**:
```bash
# Check activation policy
/agents

# Enable agent temporarily
/agents --enable {agent-name}

# Or use Team mode for on-demand agents
/team {task description}
```

### Wrong Agent for Task

**Problem**: Task takes too long or produces wrong results

**Solution**:
- Review [Selecting the Right Agent](#selecting-the-right-agent) section
- Verify agent is the right specialty for your task
- If wrong agent, disable and activate correct one

### Agent Fails Repeatedly

**Problem**: Same agent fails 3+ times on same issue

**Solution**:
- Check if this is architectural (escalate to architect)
- Simplify task scope (complex issues need architect review first)
- Provide more context or examples

---

## Related Documentation

- **Agent System Prompts**: `.claude/agents/*.md` — Detailed prompts for each agent
- **Activation Policy**: `/CLAUDE.global.md` — Complete activation rules
- **Team Mode**: `/team` command or `orchestration/commands/team.md` — Multi-agent coordination
- **Quick Reference**: Use `/agents --help` in Claude Code for command reference

