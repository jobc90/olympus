# Codex Control Plane Cutover
> Date: 2026-03-25

## Background

Olympus was rebuilt around a Codex-centered control plane where Claude CLI workers execute project-scoped tasks inside tmux and terminal output is no longer the source of truth. This note records the implemented surface, the verification evidence, and the current rollout recommendation.

## Current State

- Control-plane contracts and stores are in place in `packages/protocol` and `packages/core`.
- CLI workers run behind tmux-backed and pty-backed runtime facades in `packages/cli`.
- Gateway dispatch now flows through project-level scheduling/runtime adapters in `packages/gateway`.
- Codex routing and planning paths were updated to prefer project tasks over worker-name-first dispatch.
- Dashboard state now has projection and summary services instead of relying only on raw console heuristics.

## Cutover Scope

The cutover covers these runtime behaviors:

- project-level task dispatch
- runtime socket control (`assign`, `send_input`, `lock`, `unlock`, `reset`, `soft_preempt`, snapshot/state queries)
- tmux-backed attach visibility
- dashboard projection and project summaries
- authority-based completion, cancel, resume, preempt, queued recovery

## Verification Evidence

### Package verification

- `pnpm --filter @olympus-dev/codex test`
- `pnpm --filter @olympus-dev/gateway test`
- `pnpm --filter olympus-dev test`
- `pnpm --filter @olympus-dev/web build`
- `pnpm lint`
- `pnpm build`

Observed result during the final verification pass:

- Codex tests passing
- Gateway tests passing
- CLI tests passing
- Web build passing
- workspace lint/build passing

### Real macOS + tmux smoke

Verified behaviors:

- `server start --gateway --dashboard` boot succeeds
- `start-trust` tmux workers register successfully
- Terminal attach opens the correct tmux session target
- a fresh worker can execute `SMOKE_OK` end to end
- attach flow can execute `ATTACH_OK` end to end

### Multi-worker soak

Verified behaviors:

- same-project multi-worker startup without `duplicate session` failure
- queued auto-dispatch to the next idle worker
- worker death recovery to another idle worker
- preempt base task + urgent replacement + blocked task resume

Latest verified preempt scenario:

- project: `olympus-preempt-e0ih22`
- urgent task result: `PREEMPT_URGENT_OK`
- resumed base result: `PREEMPT_BASE_OK`
- authority summary counts after convergence: `blocked=0`, `failed=0`, `risky=0`, `completed=2`

## Fixes Closed During Cutover Validation

- tmux attach target bug caused by tmux-unsafe session naming
- false-positive completion on stale/welcome pane content
- same-project worker startup race around tmux session creation
- queued auto-dispatch duplicate `in_progress -> in_progress` transition
- preempt handoff race where `isStarting` was not treated as busy and urgent tasks could fail with `이미 작업 진행 중입니다`

## Remaining Risks

- Terminal attach is currently validated against Terminal.app. iTerm2-specific attach behavior is not part of the verified cutover.
- Project summary prose can still be less precise than the underlying counts/history when preempted worker-task records remain in history. This is operational polish, not a control-plane truth issue.
- PTY compatibility heuristics still exist as fallback in a few paths; authority artifacts and runtime-control are the intended source of truth.

## Rollout Recommendation

Proceed with a controlled cutover.

Recommended rollout shape:

1. keep the new path enabled for local/staging operators first
2. replay the operations checklist on a fresh workspace
3. watch project summaries, worker recovery, and projection feeds during the first live run
4. keep rollback simple by stopping workers, stopping the gateway, and cleaning the tmux session

Current decision: **ready for controlled real-world use, not blocked by a known P0/P1 issue**.

## References

- [2026-03-24-codex-control-plane-redesign.md](/Users/jobc/dev/side-project/olympus/docs/superpowers/plans/2026-03-24-codex-control-plane-redesign.md)
- [2026-03-24-codex-control-plane-redesign-design.md](/Users/jobc/dev/side-project/olympus/docs/superpowers/specs/2026-03-24-codex-control-plane-redesign-design.md)
- [2026-03-25-control-plane-operations-checklist.md](/Users/jobc/dev/side-project/olympus/docs/superpowers/runbooks/2026-03-25-control-plane-operations-checklist.md)
