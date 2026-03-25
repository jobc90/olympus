# Codex Control Plane Operations Checklist

## Service Overview

Use this checklist when booting the Codex control plane locally on macOS with tmux-backed Claude workers and verifying that the cutover path is healthy.

## Preflight

- `tmux` is installed and usable in the current shell.
- Claude CLI is installed and can open an interactive session.
- required workspace path is known.
- gateway API key is available from local config.
- no stale tmux session exists for the project being verified.

Verification:

- `tmux ls`
- if a stale project session exists: `tmux kill-session -t <session-name>`

## Startup Procedure

### 1. Build fresh artifacts

```bash
pnpm build
```

### 2. Start gateway + dashboard

```bash
pnpm --filter olympus-dev exec node dist/index.js server start \
  --gateway \
  --dashboard \
  -p 8200 \
  --web-port 8201 \
  --mode codex \
  --workspace /Users/jobc/dev/side-project
```

### 3. Start one or more workers

```bash
pnpm --filter olympus-dev exec node dist/index.js start-trust \
  -p /tmp/<project-dir> \
  -n <worker-name>
```

Repeat the worker command for each additional worker.

## Health Checks

- gateway health:

```bash
http GET http://127.0.0.1:8200/healthz
```

- registered workers:

```bash
http GET http://127.0.0.1:8200/api/workers "Authorization:Bearer <api-key>"
```

- project summaries:

```bash
http GET http://127.0.0.1:8200/api/projects/summaries "Authorization:Bearer <api-key>"
```

- worker projection:

```bash
http GET http://127.0.0.1:8200/api/workers/<worker-id>/projection "Authorization:Bearer <api-key>"
```

## Functional Checklist

### A. Basic task execution

- dispatch a simple task that returns a fixed token
- confirm worker task result in API
- confirm pane output in tmux

Success criteria:

- worker task `completed`
- authority task `completed`
- pane shows the expected token and prompt recovery

### B. Attach verification

- confirm native terminal opens the tmux session
- verify no `can't find session` error appears
- confirm the attached terminal shows the correct worker pane

### C. Preempt + resume verification

- dispatch a base task to worker A
- dispatch an urgent task to the same worker with preemption enabled
- resume the blocked base task onto worker B

Success criteria:

- urgent task completes on worker A
- resumed base task completes on worker B
- project summary converges to `blocked=0`, `failed=0`, `risky=0` for the scenario

### D. Queue verification

- dispatch more work than available workers
- confirm queued task is automatically assigned when a worker becomes idle

### E. Recovery verification

- kill one busy worker process
- wait for worker death/recovery handling
- confirm queued or resumed work is reassigned to another idle worker

## Monitoring Signals

Watch for these failure patterns:

- `duplicate session`
- `can't find session`
- `이미 작업 진행 중입니다`
- `Invalid task status transition`
- pane completed but API still `running`

If any appear, stop rollout and inspect the active worker, project summary, and tmux pane state before retrying.

## Incident Response

### Worker stuck or wrong pane state

1. capture pane:

```bash
tmux capture-pane -p -t <session>:<window>
```

2. inspect task state:

```bash
http GET http://127.0.0.1:8200/api/workers/tasks "Authorization:Bearer <api-key>"
```

3. if needed, reset the worker session from the runtime API or restart the worker process

### Gateway shutdown

Stop the server process with `Ctrl+C`.

Expected output includes:

- `Shutting down...`

### tmux cleanup

```bash
tmux kill-session -t <session-name>
tmux ls
```

Expected final state:

- `no server running`

## Rollback

Rollback is procedural, not migrational:

1. stop worker processes
2. stop gateway/dashboard process
3. kill project tmux sessions
4. confirm no stale workers remain registered on next startup

## Exit Criteria

A rollout pass is acceptable when all are true:

- build/test/lint are green
- gateway health is green
- attach works
- basic task completes
- preempt/resume completes
- queued dispatch completes
- worker death recovery completes
- cleanup returns tmux to an empty state
