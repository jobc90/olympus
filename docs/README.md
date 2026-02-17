# Olympus Documentation

> **Olympus v1.0** — Claude CLI Enhanced Platform with Multi-AI Orchestration, Gateway, and Real-Time Dashboard.
>
> This directory contains the complete handover documentation for the Olympus project.
> Start with the **Recommended Reading Order** below, then dive into specific areas as needed.

---

## Recommended Reading Order

| # | Document | Purpose | Time |
|---|----------|---------|------|
| 1 | [System Overview](architecture/system-overview.md) | Architecture, package dependencies, data flow, design decisions | 15 min |
| 2 | [Package Guide](architecture/package-guide.md) | All 10 packages: purpose, key files, exports, dependencies | 25 min |
| 3 | [Gateway Internals](architecture/gateway-internals.md) | CliRunner, WorkerRegistry, GeminiAdvisor, API routes, WebSocket | 20 min |
| 4 | [Agent System](design/agent-system.md) | 19 Custom Agents, activation policy, agent roles and rules | 15 min |
| 5 | [Team Protocol](design/team-protocol.md) | Team Engineering Protocol v3.1, DAG execution, file ownership | 15 min |
| 6 | [WebSocket Protocol](spec/websocket-protocol.md) | Protocol v0.2.0, events, RPC methods, message format | 10 min |
| 7 | [Setup Guide](operations/setup-guide.md) | Installation, build pipeline, CLI commands, troubleshooting | 10 min |
| 8 | [Telegram Bot Guide](operations/telegram-bot-guide.md) | Bot commands, worker delegation, deployment | 10 min |

---

## Directory Structure

```
docs/
├── README.md                  ← You are here (master index)
│
├── architecture/              ← System architecture & package structure
│   ├── system-overview.md     ← Start here: high-level architecture
│   ├── package-guide.md       ← All 10 packages in detail
│   ├── gateway-internals.md   ← Gateway deep dive (core runtime)
│   ├── V2_ARCHITECTURE.md     ← V2 architecture decisions (historical)
│   └── OLYMPUS_V2_TRANSFORMATION.md  ← V2 transformation record
│
├── design/                    ← Design decisions & agent system
│   ├── agent-system.md        ← 19 Custom Agents & activation policy
│   ├── team-protocol.md       ← Team Engineering Protocol v3.1
│   ├── CODEX_ORCHESTRATOR_DEVELOPMENT_PLAN.md  ← Codex orchestrator design
│   └── DASHBOARD_REFACTORING_PLAN.md  ← Dashboard refactoring plan
│
├── spec/                      ← Technical specifications & contracts
│   ├── websocket-protocol.md  ← WebSocket protocol v0.2.0
│   ├── V2_CONTRACT.md         ← V2 type contracts & interfaces
│   └── V2_API_REFERENCE.md    ← V2 API reference
│
├── operations/                ← Setup, deployment & operations
│   ├── setup-guide.md         ← Installation & build pipeline
│   ├── telegram-bot-guide.md  ← Telegram bot operations
│   └── REMOTE_ACCESS_REPORT.md  ← Remote access configuration
│
├── reports/                   ← Audit reports & release verification
│   ├── AUDIT_REPORT_20260207.md
│   ├── IMPLEMENTATION_EXECUTION_REPORT.md
│   ├── IMPLEMENTATION_VERIFICATION_REPORT.md
│   ├── RELEASE_READINESS_REPORT.md
│   ├── RELEASE_VERIFICATION_v5.1.md
│   ├── TELEGRAM_BOT_QA_AUDIT.md
│   └── TELEGRAM_RELIABILITY_CHECKPOINTS.md
│
└── legacy/                    ← Historical plans (completed/superseded)
    ├── OLYMPUS_IMPROVEMENT_PLAN.md  ← OpenClaw improvement plan v2.0
    ├── OLYMPUS_V2_PHASE5_ROADMAP.md ← Phase 5 roadmap (completed)
    └── OPENCLAW_DETAILED_ANALYSIS_2026-02-09.md  ← Initial analysis
```

---

## By Role

### New Developer (Onboarding)
1. [System Overview](architecture/system-overview.md) — Understand the big picture
2. [Setup Guide](operations/setup-guide.md) — Get the project running
3. [Package Guide](architecture/package-guide.md) — Learn each package's responsibility

### Backend / Gateway Developer
1. [Gateway Internals](architecture/gateway-internals.md) — CliRunner, API routes, WebSocket server
2. [WebSocket Protocol](spec/websocket-protocol.md) — Client-server communication spec
3. [Package Guide](architecture/package-guide.md) — Focus on `protocol`, `core`, `gateway` sections

### Dashboard / Frontend Developer
1. [Package Guide](architecture/package-guide.md) — Focus on `web`, `client`, `tui` sections
2. [WebSocket Protocol](spec/websocket-protocol.md) — Events consumed by the dashboard
3. [Gateway Internals](architecture/gateway-internals.md) — API endpoints for data

### Agent System Developer
1. [Agent System](design/agent-system.md) — Agent types, activation policy, rules
2. [Team Protocol](design/team-protocol.md) — Team orchestration workflow
3. [Gateway Internals](architecture/gateway-internals.md) — WorkerRegistry, task assignment

### DevOps / Operations
1. [Setup Guide](operations/setup-guide.md) — Build pipeline, environment variables
2. [Telegram Bot Guide](operations/telegram-bot-guide.md) — Bot deployment and monitoring
3. [operations/REMOTE_ACCESS_REPORT.md](operations/REMOTE_ACCESS_REPORT.md) — Remote access setup

---

## Quick Reference

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22+, TypeScript 5.7, ESM |
| Build | pnpm 10, tsup, Vite 6 |
| Backend | Custom HTTP server (no Express) |
| Frontend | React 19, TailwindCSS 4 |
| Database | SQLite (better-sqlite3) + FTS5 |
| Testing | Vitest 3 |
| External CLIs | Claude CLI, Codex CLI, Gemini CLI |

### Package Map (10 packages)
```
protocol → core → gateway → cli
    │        │       ↑        ↑
    ├→ client → tui ─┤────────┤
    │        └→ web  │        │
    ├→ telegram-bot ─┘────────┘
    └→ codex ────────┘
```

### Key Commands
```bash
pnpm install && pnpm build    # Full build (all 10 packages)
pnpm test                     # Full test suite
pnpm lint                     # TypeScript type check
olympus server start           # Start Gateway + Dashboard + Bot
olympus start-trust            # Run Claude CLI (skip permissions)
```

---

## Document Conventions

- **New handover documents** (2026-02-16): `system-overview.md`, `package-guide.md`, `gateway-internals.md`, `agent-system.md`, `team-protocol.md`, `setup-guide.md`, `telegram-bot-guide.md`, `websocket-protocol.md`
- **Historical documents** (pre-existing): Uppercase filenames (e.g., `V2_ARCHITECTURE.md`, `AUDIT_REPORT_20260207.md`) — preserved as-is for reference
- **Legacy documents**: Plans and roadmaps that have been completed or superseded — moved to `legacy/`
