# Codex Control Plane Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

## Status Update (2026-03-25)

- Implementation status: code path complete for the control-plane redesign described in this plan.
- Verification status: package build/test/lint and real macOS + tmux smoke/soak verification have been run against the implemented path.
- Cutover note: see [2026-03-25-control-plane-cutover.md](/Users/jobc/dev/side-project/olympus/docs/superpowers/reports/2026-03-25-control-plane-cutover.md).
- Commit slicing note: see [2026-03-25-control-plane-commit-plan.md](/Users/jobc/dev/side-project/olympus/docs/superpowers/reports/2026-03-25-control-plane-commit-plan.md).
- Operations checklist: see [2026-03-25-control-plane-operations-checklist.md](/Users/jobc/dev/side-project/olympus/docs/superpowers/runbooks/2026-03-25-control-plane-operations-checklist.md).

Current rollout recommendation: proceed with a controlled cutover, not an unbounded broad rollout. The remaining observed risk is low-severity operational polish, not a known P0/P1 blocker.

**Goal:** Rebuild Olympus around a Codex-centered control plane on macOS where Claude CLI workers execute project-scoped instruction artifacts inside tmux, parallel workers remain visible in terminal panes/windows, and terminal output no longer defines system truth.

**Architecture:** The redesign splits the system into a control plane and per-project runtime plane. Control logic, task state, and artifacts move into explicit stores and contracts, while tmux-backed Claude workers run behind a Worker Host adapter and feed structured acknowledgements/results back into the system.

**Tech Stack:** TypeScript, Node.js, SQLite, WebSocket, filesystem artifacts, tmux, Unix domain sockets, Claude CLI, macOS terminal attach helpers.

---

## Chunk 1: Control Plane Contracts

### Task 1: Introduce Task Authority schema and artifact contract

**Files:**
- Create: `packages/protocol/src/task-authority.ts`
- Create: `packages/protocol/src/task-artifacts.ts`
- Modify: `packages/protocol/src/index.ts`
- Test: `packages/protocol/src/__tests__/task-authority.test.ts`

- [ ] **Step 1: Define parent/project task types and state machine**

Include:
- parent task vs project task
- statuses: `draft`, `ready`, `assigned`, `in_progress`, `blocked`, `completed`, `failed`, `cancelled`
- task IDs, display labels, project IDs, dependency edges

- [ ] **Step 2: Define instruction/start-ack/final-report artifact schemas**

Include:
- instruction metadata
- `start-ack.json` schema
- `final-report.json` schema
- file location metadata for central and project-local mirrors

- [ ] **Step 3: Add protocol exports**

Run: `pnpm --filter @olympus-dev/protocol build`
Expected: build succeeds

- [ ] **Step 4: Add protocol tests for valid and invalid transitions**

Run: `pnpm --filter @olympus-dev/protocol test`
Expected: transition and schema tests pass

### Task 2: Add SQLite-backed Task Authority service

**Files:**
- Create: `packages/core/src/task-authority-store.ts`
- Create: `packages/core/src/task-artifact-store.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/__tests__/task-authority-store.test.ts`

- [ ] **Step 1: Create SQLite schema for tasks, dependencies, queue items, locks, preemption events**

- [ ] **Step 2: Implement CRUD + transition guards**

- [ ] **Step 3: Implement artifact registration and mirror path resolution**

- [ ] **Step 4: Add tests for transitions, queue assignment, and blocked preemption records**

Run: `pnpm --filter @olympus-dev/core test`
Expected: new store tests pass

## Chunk 2: Worker Runtime

### Task 3: Replace PTY-heavy worker core with tmux-backed Worker Host abstraction

**Files:**
- Create: `packages/cli/src/worker-host.ts`
- Create: `packages/cli/src/worker-host/tmux-session-adapter.ts`
- Create: `packages/cli/src/worker-host/tmux-layout-manager.ts`
- Modify: `packages/cli/src/worker-host/native-terminal-launcher.ts`
- Modify: `packages/cli/src/commands/start.ts`
- Modify: `packages/cli/src/pty-worker.ts`
- Test: `packages/cli/src/__tests__/worker-host.test.ts`

- [ ] **Step 1: Define tmux Worker Host responsibilities**

The host must:
- start or reconnect a Claude CLI session inside tmux
- send launcher prompt + instruction file path
- accept local and remote input
- emit structured start and final artifacts
- map task/worker identity to tmux pane metadata

- [ ] **Step 2: Move artifact emission out of PTY parsing and onto tmux-backed session control**

tmux pane output may still be captured for display, but must no longer determine authoritative completion.

- [ ] **Step 3: Add macOS tmux attach launcher abstraction**

Support:
- `tmux new-session` / `new-window` / `split-window`
- Terminal.app or iTerm attach helper
- pane/window policy for parallel workers

- [ ] **Step 4: Preserve manual start compatibility**

Run: `pnpm --filter olympus-dev test`
Expected: worker host tests and existing CLI tests pass or are updated

### Task 4: Add project-local runtime control channel

**Files:**
- Create: `packages/cli/src/worker-host/runtime-socket.ts`
- Create: `packages/protocol/src/runtime-control.ts`
- Modify: `packages/protocol/src/index.ts`
- Test: `packages/cli/src/__tests__/runtime-socket.test.ts`

- [ ] **Step 1: Define local control channel protocol**

Include commands for:
- assign instruction
- soft preempt
- lock input
- unlock input
- reset session
- request terminal projection snapshot

- [ ] **Step 2: Implement macOS Unix socket transport abstraction**

- [ ] **Step 3: Add tests for message framing and lifecycle**

Run: `pnpm --filter olympus-dev test`
Expected: runtime channel tests pass

## Chunk 3: Project Runtime Plane

### Task 5: Introduce Project Scheduler and Runtime Adapter

**Files:**
- Create: `packages/gateway/src/project-runtime/project-scheduler.ts`
- Create: `packages/gateway/src/project-runtime/project-runtime-adapter.ts`
- Create: `packages/gateway/src/project-runtime/worktree-manager.ts`
- Modify: `packages/gateway/src/server.ts`
- Modify: `packages/gateway/src/api.ts`
- Test: `packages/gateway/src/__tests__/project-scheduler.test.ts`
- Test: `packages/gateway/src/__tests__/project-runtime-adapter.test.ts`

- [ ] **Step 1: Implement project-scoped worker pool model**

Rules:
- one default resident worker per project
- optional ephemeral workers
- worker selection priority: context continuity > role/skills > idle
- parallel workers must remain visible as tmux panes/windows

- [ ] **Step 2: Implement soft preemption**

Transition:
- existing task -> `blocked`
- new urgent task -> `assigned` / `in_progress`

- [ ] **Step 3: Implement worktree lifecycle for ephemeral workers**

Rules:
- default worker uses main workspace
- ephemeral worker uses per-task worktree
- merge automatically on success when conflict-free
- ephemeral worker pane/window is cleaned up after merge or failure

- [ ] **Step 4: Stop assigning tasks directly through WorkerRegistry APIs**

Replace direct worker-level dispatch with project-level dispatch entrypoints.

- [ ] **Step 5: Add tests for scheduling, queueing, preemption, and automatic merge path**

Run: `pnpm --filter @olympus-dev/gateway test`
Expected: scheduler/runtime tests pass

### Task 6: Rework Codex orchestration around project tasks and DAGs

**Files:**
- Modify: `packages/gateway/src/api.ts`
- Modify: `packages/gateway/src/codex-adapter.ts`
- Modify: `packages/codex/src/router.ts`
- Create: `packages/codex/src/task-planner.ts`
- Test: `packages/codex/src/__tests__/task-planner.test.ts`

- [ ] **Step 1: Change Codex dispatch flow**

Required pipeline:
- parse user request
- validate explicit project targets
- inspect current task tree
- detect conflicts
- generate parent task + project tasks

- [ ] **Step 2: Add multi-project DAG support**

Rules:
- user may request multiple projects
- execution must be decomposed into single-project child tasks
- Codex owns dependency ordering

- [ ] **Step 3: Remove worker-name-first delegation from primary execution path**

Keep worker-level addressing only as a low-level/manual control path if still needed.

- [ ] **Step 4: Add tests for project-required dispatch and ambiguous cancellation flow**

Run: `pnpm --filter @olympus-dev/codex test`
Expected: planner and routing tests pass

## Chunk 4: Dashboard Projection and Reporting

### Task 7: Replace dashboard truth model with Task Authority + projection views

**Files:**
- Create: `packages/gateway/src/terminal-projection-service.ts`
- Modify: `packages/web/src/hooks/useOlympus.ts`
- Modify: `packages/web/src/components/LiveOutputPanel.tsx`
- Create: `packages/web/src/components/ProjectedTerminalPanel.tsx`
- Modify: `packages/web/src/App.tsx`
- Test: `packages/gateway/src/__tests__/terminal-projection-service.test.ts`

- [ ] **Step 1: Add projection service outputs**

Expose:
- tmux pane capture feed
- projected snapshot feed
- input lock state
- active tmux pane/window metadata

- [ ] **Step 2: Rebuild dashboard state around official task/project status**

Reduce reliance on:
- raw `cli:stream`
- worker polling heuristics
- output-derived completion guesses

- [ ] **Step 3: Add dual console tabs**

Required UI:
- Live Console
- Projected View

- [ ] **Step 4: Preserve command box + raw input modes**

Run: `pnpm --filter @olympus-dev/web build`
Expected: dashboard compiles with new projection components

### Task 8: Add structured reporting and user-facing summaries

**Files:**
- Create: `packages/gateway/src/reporting/task-summary-service.ts`
- Modify: `packages/gateway/src/api.ts`
- Modify: `packages/web/src/hooks/useOlympus.ts`
- Test: `packages/gateway/src/__tests__/task-summary-service.test.ts`

- [ ] **Step 1: Ingest start/final artifact files into Task Authority**

- [ ] **Step 2: Generate short project-centric summaries for Codex**

Default reporting should:
- prioritize risk and blocked tasks
- summarize by project
- allow drill-down into final report details

- [ ] **Step 3: Add tests for summary generation from artifact payloads**

Run: `pnpm --filter @olympus-dev/gateway test`
Expected: summary service tests pass

## Chunk 5: Cleanup and Cutover

### Task 9: Decommission PTY-driven status heuristics

**Files:**
- Modify: `packages/cli/src/pty-worker.ts`
- Modify: `packages/web/src/hooks/useOlympus.ts`
- Modify: `packages/gateway/src/api.ts`
- Modify: `packages/gateway/src/server.ts`
- Test: `packages/cli/src/__tests__/pty-worker.test.ts`
- Test: `packages/gateway/src/__tests__/worker-registry.test.ts`

- [ ] **Step 1: Remove authoritative completion logic from PTY parsing**

- [ ] **Step 2: Downgrade PTY output to compatibility fallback only**

- [ ] **Step 3: Promote tmux pane capture/send-keys to the primary runtime integration path**

- [ ] **Step 4: Remove or narrow legacy WorkerRegistry direct-dispatch paths**

- [ ] **Step 5: Update tests to reflect artifact-based truth model and tmux-backed visibility**

Run: `pnpm test`
Expected: full suite passes or failures are documented and addressed

### Task 10: Final verification and documentation cutover

**Files:**
- Create: `docs/README.md`
- Create: `docs/architecture.md`
- Create: `docs/api-reference.md`
- Create: `docs/RUNBOOK.md`
- Create: `docs/architecture/codex-control-plane.md`

Implementation note: the repository reset intentionally removed the old broad docs set, so the concrete cutover deliverables for this task are currently tracked under `docs/superpowers/reports/**` and `docs/superpowers/runbooks/**` instead of recreating the legacy docs root wholesale.

- [ ] **Step 1: Document new control plane and runtime plane**

- [ ] **Step 2: Document worker host startup and terminal launcher behavior**

- [ ] **Step 3: Document official task artifact paths and schemas**

- [ ] **Step 4: Run end-to-end verification**

Run:
- `pnpm build`
- `pnpm test`
- `pnpm lint`

Expected:
- build passes
- test suite passes
- lint passes

- [ ] **Step 5: Record rollout notes and remaining risks**

## Risks

- tmux pane/window lifecycle and naming discipline must stay deterministic or the control plane will drift from visible sessions.
- Worker Host cutover will temporarily coexist with the current PTY worker path; avoid dual truth models lasting too long.
- Dashboard migration must happen after Task Authority and artifact ingestion exist, otherwise UI regressions will be hard to diagnose.

## Verification Strategy

- Protocol and store tests validate the new truth model before runtime migration.
- Worker Host tests validate tmux session control, start acknowledgement, and final report generation independent of dashboard concerns.
- Scheduler tests validate preemption, worker selection, and worktree merge policy.
- Dashboard tests validate that projected views consume tmux pane captures without inferring authoritative task status from console text.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-03-24-codex-control-plane-redesign.md`. Ready to execute?
