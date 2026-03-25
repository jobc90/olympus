# Codex Control Plane Commit Plan
> Date: 2026-03-25

## Background

The current worktree mixes a repository reset, the Codex control-plane redesign, dashboard projection work, and follow-up soak fixes. A single squash commit would make review and rollback unnecessarily expensive. The safer path is to stage the redesign in reviewable, source-backed slices.

## Recommended Commit Units

| Order | Commit scope | Include | Exclude / separate if unrelated | Verification |
| --- | --- | --- | --- | --- |
| 1 | Repository reset baseline | `CLAUDE.md`, legacy `README*`, `install*`, removed legacy `docs/**` files, new `docs/superpowers/**` baseline | `.serena/project.yml`, personal/editor state | `git diff --stat`, `pnpm build` |
| 2 | Protocol + core task authority foundation | `packages/protocol/src/task-authority.ts`, `packages/protocol/src/task-artifacts.ts`, `packages/protocol/src/runtime-control.ts`, `packages/core/src/task-authority-store.ts`, `packages/core/src/task-artifact-store.ts`, related tests | dashboard/UI files | `pnpm --filter @olympus-dev/protocol test`, `pnpm --filter @olympus-dev/core test` |
| 3 | CLI runtime and worker host refactor | `packages/cli/src/worker-host/**`, `tmux-worker-runtime.ts`, `pty-worker-runtime.ts`, `pty-worker.ts`, `worker-runtime*.ts`, `worker-bootstrap*.ts`, `worker-gateway-session.ts`, related CLI tests | gateway/codex/web files | `pnpm --filter olympus-dev test`, `pnpm --filter olympus-dev build` |
| 4 | Gateway project runtime + runtime control | `packages/gateway/src/project-runtime/**`, `worker-runtime-client.ts`, `api.ts`, `server.ts`, `worker-registry.ts`, `worker-events.ts`, related gateway tests | web UI files | `pnpm --filter @olympus-dev/gateway test`, `pnpm --filter @olympus-dev/gateway build` |
| 5 | Codex planner + manual input interpretation | `packages/codex/src/task-planner.ts`, `manual-input.ts`, `router.ts`, `orchestrator.ts`, related tests | gateway/web files not required by codex | `pnpm --filter @olympus-dev/codex test` |
| 6 | Projection and reporting UI | `packages/gateway/src/terminal-projection-service.ts`, `packages/gateway/src/reporting/**`, `packages/web/src/App.tsx`, `packages/web/src/hooks/useOlympus.ts`, `packages/web/src/components/ProjectedTerminalPanel.tsx`, related tests | CLI/runtime internals | `pnpm --filter @olympus-dev/web build`, `pnpm --filter @olympus-dev/gateway test` |
| 7 | Soak-driven blocker fixes and cutover docs | `packages/cli/src/tmux-task-runner.ts`, `packages/cli/src/tmux-worker-runtime.ts`, `packages/gateway/src/project-runtime/project-runtime-adapter.ts`, updated tests, `tasks/todo.md`, `docs/superpowers/reports/**`, `docs/superpowers/runbooks/**` | unrelated claude-dashboard widget tweaks | `pnpm --filter olympus-dev test`, real soak replay |

## Files That Should Stay Separate Unless Intentional

- `.serena/project.yml`
- `orchestration/templates/CLAUDE.global.md`
- `packages/claude-dashboard/scripts/utils/api-client.ts`
- `packages/claude-dashboard/scripts/widgets/codex-usage.ts`
- `packages/claude-dashboard/scripts/widgets/gemini-usage.ts`

These files were dirty in the current worktree, but they are not required to explain or ship the control-plane redesign. If they are user-local or parallel work, keep them out of the redesign series.

## Staging Strategy

1. Stage each commit unit with `git add -p` or explicit path lists.
2. Run the verification command for that slice before creating the commit.
3. Keep the soak-fix commit last so it is easy to cherry-pick onto the redesign stack if needed.

## Concrete Staging Paths

These are the safest explicit path groups to start from in the current worktree. They are not meant to be blindly pasted without a final `git diff --cached`, but they are narrow enough to avoid most unrelated files.

### Commit 1. Repository reset baseline

```bash
git add \
  /Users/jobc/dev/side-project/olympus/CLAUDE.md \
  /Users/jobc/dev/side-project/olympus/CHANGELOG.md \
  /Users/jobc/dev/side-project/olympus/README.md \
  /Users/jobc/dev/side-project/olympus/README.en.md \
  /Users/jobc/dev/side-project/olympus/install.sh \
  /Users/jobc/dev/side-project/olympus/install.ps1 \
  /Users/jobc/dev/side-project/olympus/install-win.sh \
  /Users/jobc/dev/side-project/olympus/docs \
  /Users/jobc/dev/side-project/olympus/tasks
```

Important note:

- `docs/superpowers/**` and `tasks/**` are currently untracked baseline files.
- That means `git diff` on tracked files alone will under-report part of commit 1.
- Before creating commit 1, always verify both:

```bash
git diff --cached --stat
git status --short -- /Users/jobc/dev/side-project/olympus/docs/superpowers /Users/jobc/dev/side-project/olympus/tasks
```

Then unstage anything under `docs/superpowers/reports/2026-03-25-*` if you want those docs to land with the final cutover commit instead:

```bash
git restore --staged \
  /Users/jobc/dev/side-project/olympus/docs/superpowers/reports/2026-03-25-control-plane-commit-plan.md \
  /Users/jobc/dev/side-project/olympus/docs/superpowers/reports/2026-03-25-control-plane-cutover.md \
  /Users/jobc/dev/side-project/olympus/docs/superpowers/runbooks/2026-03-25-control-plane-operations-checklist.md
```

### Commit 2. Protocol + core task authority foundation

```bash
git add \
  /Users/jobc/dev/side-project/olympus/packages/protocol \
  /Users/jobc/dev/side-project/olympus/packages/core
```

Review cached diff and unstage unrelated protocol changes if they are not part of the redesign:

```bash
git diff --cached -- /Users/jobc/dev/side-project/olympus/packages/protocol
git diff --cached -- /Users/jobc/dev/side-project/olympus/packages/core
```

### Commit 3. CLI runtime and worker host refactor

```bash
git add \
  /Users/jobc/dev/side-project/olympus/packages/cli/src \
  /Users/jobc/dev/side-project/olympus/packages/cli/src/__tests__
```

If needed, narrow the cached diff to exclude purely historical PTY test churn that you do not want in this slice:

```bash
git diff --cached -- /Users/jobc/dev/side-project/olympus/packages/cli/src
```

### Commit 4. Gateway project runtime + runtime control

```bash
git add \
  /Users/jobc/dev/side-project/olympus/packages/gateway/src \
  /Users/jobc/dev/side-project/olympus/packages/gateway/src/__tests__
```

### Commit 5. Codex planner + manual input interpretation

```bash
git add \
  /Users/jobc/dev/side-project/olympus/packages/codex/src \
  /Users/jobc/dev/side-project/olympus/packages/codex/src/__tests__
```

### Commit 6. Projection and reporting UI

```bash
git add \
  /Users/jobc/dev/side-project/olympus/packages/web/src/App.tsx \
  /Users/jobc/dev/side-project/olympus/packages/web/src/hooks/useOlympus.ts \
  /Users/jobc/dev/side-project/olympus/packages/web/src/components/ProjectedTerminalPanel.tsx \
  /Users/jobc/dev/side-project/olympus/packages/gateway/src/terminal-projection-service.ts \
  /Users/jobc/dev/side-project/olympus/packages/gateway/src/reporting \
  /Users/jobc/dev/side-project/olympus/packages/gateway/src/__tests__/terminal-projection-service.test.ts \
  /Users/jobc/dev/side-project/olympus/packages/gateway/src/__tests__/task-summary-service.test.ts \
  /Users/jobc/dev/side-project/olympus/packages/gateway/src/__tests__/api-projection-summary.test.ts
```

### Commit 7. Soak-driven blocker fixes and cutover docs

```bash
git add \
  /Users/jobc/dev/side-project/olympus/packages/cli/src/tmux-task-runner.ts \
  /Users/jobc/dev/side-project/olympus/packages/cli/src/tmux-worker-runtime.ts \
  /Users/jobc/dev/side-project/olympus/packages/cli/src/__tests__/tmux-task-runner.test.ts \
  /Users/jobc/dev/side-project/olympus/packages/cli/src/__tests__/tmux-worker-runtime.test.ts \
  /Users/jobc/dev/side-project/olympus/packages/cli/src/__tests__/worker-task-orchestrator.test.ts \
  /Users/jobc/dev/side-project/olympus/packages/gateway/src/project-runtime/project-runtime-adapter.ts \
  /Users/jobc/dev/side-project/olympus/packages/gateway/src/__tests__/project-runtime-adapter.test.ts \
  /Users/jobc/dev/side-project/olympus/tasks/todo.md \
  /Users/jobc/dev/side-project/olympus/docs/superpowers/reports/2026-03-25-control-plane-commit-plan.md \
  /Users/jobc/dev/side-project/olympus/docs/superpowers/reports/2026-03-25-control-plane-cutover.md \
  /Users/jobc/dev/side-project/olympus/docs/superpowers/runbooks/2026-03-25-control-plane-operations-checklist.md \
  /Users/jobc/dev/side-project/olympus/docs/superpowers/plans/2026-03-24-codex-control-plane-redesign.md
```

## Pre-Commit Review Checklist Per Slice

Before each actual commit:

1. `git diff --cached --stat`
2. `git diff --cached`
3. run the slice verification command from the table above
4. confirm no file from this exclusion list is staged unless intentional:
   - `.serena/project.yml`
   - `orchestration/templates/CLAUDE.global.md`
   - `packages/claude-dashboard/scripts/utils/api-client.ts`
   - `packages/claude-dashboard/scripts/widgets/codex-usage.ts`
   - `packages/claude-dashboard/scripts/widgets/gemini-usage.ts`

## Suggested Commit Titles

1. `reset repo guidance around codex control plane`
2. `add task authority and artifact contracts`
3. `refactor cli worker runtimes around tmux host control`
4. `route gateway dispatch through project runtime adapter`
5. `add codex task planner and manual input interpretation`
6. `add projection views and task summary reporting`
7. `fix preempt handoff races and document cutover`

## Ready-to-Run Commit Commands

When the branch is ready for actual git actions, use these commands after each slice's staging and verification steps:

```bash
git commit -m "refactor: reset repo guidance around codex control plane"
git commit -m "feat: add task authority and artifact contracts"
git commit -m "refactor: reorganize cli runtimes around tmux worker host"
git commit -m "feat: route gateway dispatch through project runtime adapter"
git commit -m "feat: add codex task planner and manual input interpretation"
git commit -m "feat: add projection views and task summary reporting"
git commit -m "fix: close preempt handoff races and document cutover"
```

If the team prefers stricter separation between the repository reset and the new docs baseline, split commit 1 into:

```bash
git commit -m "docs: remove legacy repo guidance and install docs"
git commit -m "docs: add codex control plane baseline docs"
```

## Notes

- This document is a commit slicing recommendation, not a record of actual commits.
- If the branch is intended to land as a single large merge for schedule reasons, keep this file as rollback/reference guidance anyway.
