# Console/Monitor Design Freeze (2026-02-23)

## Purpose

This document locks the current Console/Monitor design system as the baseline.
Any visual or layout changes must be intentional and reviewed against this baseline.

---

## Freeze Scope

### 1. Typography System (Fixed)

- Base UI font: `Space Grotesk`
- Functional/terminal font: `JetBrains Mono`
- Keep 2-font system only for Console/Monitor
- Small body text scale bump is fixed:
  - `.text-xs`
  - `.text-[10px]`
  - `.text-[11px]`

### 2. Console Layout (Fixed)

- Grid: `3/4 + 1/4` (`xl:grid-cols-4`, left spans 3, right spans 1)
- Left column:
  - `Olympian Command`: fixed card height `h-[248px]`
  - `Active Workers`: card grid, max 3 cards per row
  - `Worker Tasks`: `min-h-[420px] h-[clamp(420px,52vh,620px)]`
- Right column:
  - Top card: `Olympus Live Preview + Overview` in one visual container
  - `Live Preview` canvas section: `h-[196px] xl:h-[208px]`
  - Bottom: `Activity Feed` fills remaining height (`flex-1`)

### 3. Card Identity (Fixed)

- Zeus card: role label is `Orchestrator / Codex`
- Hera card: role label is `Advisor / Gemini`
- Zeus/Hera card height: `h-[172px]`
- Worker card height: `h-[206px]`

### 4. Section Title Styling (Fixed)

- Core section title style:
  - `text-lg font-semibold tracking-tight`
- Applied to:
  - `Model Usage`
  - `Active Workers`
  - `Activity Feed`
  - Card headers in Console/Monitor context

### 5. Activity Feed Controls (Fixed)

- Filter controls stay on one line (`flex-nowrap`)
- Search input fixed width (`w-32`) to prevent line-break under normal layout

---

## Freeze Enforcement

- Automated guard script:
  - `packages/web/scripts/check-design-freeze.mjs`
- Run command:
  - `pnpm --filter @olympus-dev/web design:freeze:check`

If this check fails, design baseline was changed and must be explicitly reviewed.

---

## Change Policy

If a design change is required:

1. Update this freeze document.
2. Update the freeze check script patterns.
3. Mention the freeze update in PR description.

Without all three steps, design changes are considered out-of-policy.
