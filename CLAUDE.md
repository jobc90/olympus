# Olympus

## Status

This repository is in active architecture reset.

The previous documentation set, installation scripts, and legacy guidance were intentionally removed. Do not reconstruct them from memory unless the new architecture requires them.

## Core Model

- Codex is the control plane.
- Claude CLI workers are execution agents.
- Users interact with Codex, not directly with worker orchestration logic.
- Project tasks, instruction artifacts, and structured reports define system truth.

## Current Priorities

1. Implement the Codex control plane redesign.
2. Introduce task authority and artifact contracts.
3. Add tmux-backed Worker Host and project runtime adapters.
4. Replace PTY-driven status inference with structured state/reporting and tmux-backed visibility.

## Required References

Before making architectural or workflow changes, read:

- `docs/superpowers/specs/2026-03-24-codex-control-plane-redesign-design.md`
- `docs/superpowers/plans/2026-03-24-codex-control-plane-redesign.md`

## Constraints

- Claude execution must continue to use Claude CLI, not Claude API.
- Target operating system is macOS only for the current redesign.
- tmux is a required runtime dependency for worker session management and parallel visibility.
- Native terminal interaction remains a first-class requirement through tmux attach flows.
- Web console accuracy should be readable and useful, but does not need to be a perfect mirror.

## Command And Skill Source Of Truth

- Do not maintain repo-local workflow skills under `orchestration/skills/`.
- For Claude slash commands, use `https://github.com/jobc90/claudex-power-commands` as the source of truth.
- For Codex skills, use the same repository's `codex-skills/` as the source of truth.
- Keep `/check`, `/cowork`, `/super`, `/docs`, `/design` aligned across Claude and Codex.
- Use `scripts/sync-claudex-power-commands.sh` to sync the current upstream files into `~/.claude` and `${CODEX_HOME:-$HOME/.codex}`.
