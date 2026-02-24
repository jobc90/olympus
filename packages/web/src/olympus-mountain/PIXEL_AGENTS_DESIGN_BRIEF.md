# Pixel Agents Design Brief (for Mount Olympus Rebuild)

Reference project: `https://github.com/pablodelucca/pixel-agents`

## 1) Core Visual System (extracted)

- Tile base size: `16x16`
  - Source: `/Users/jobc/dev/olympus/.cache_refs/pixel-agents/webview-ui/src/constants.ts`
- Character sprite base size: `16x24`
  - Source: `/Users/jobc/dev/olympus/.cache_refs/pixel-agents/webview-ui/src/office/sprites/spriteData.ts`
- Character animation set is template-driven:
  - Walk: 3 frames (+ mirrored hold frame for 4-step loop)
  - Typing: 2 frames
  - Reading/idle seated: 2 frames
  - Directions: down/up/right (+ left from horizontal flip)
  - Source: `/Users/jobc/dev/olympus/.cache_refs/pixel-agents/webview-ui/src/office/sprites/spriteData.ts`
- Rendering uses strict pixel style:
  - Cached sprite raster (`getCachedSprite`)
  - No smoothing workflow
  - Source: `/Users/jobc/dev/olympus/.cache_refs/pixel-agents/webview-ui/src/office/engine/renderer.ts`
- Depth sorting rule:
  - Characters and furniture sorted by lower Y (`zY`) so foreground overlap is stable
  - Source: `/Users/jobc/dev/olympus/.cache_refs/pixel-agents/webview-ui/src/office/engine/renderer.ts`

## 2) Floor / Zone Readability Principles

- Floor uses pattern + color variation, not flat single tile.
- Zone information is readable by tone families (warm/cool/neutral) and boundary contrast.
- Minimal overlays; avoid large opaque panels that hide map detail.
- Sources:
  - `/Users/jobc/dev/olympus/.cache_refs/pixel-agents/webview-ui/src/office/floorTiles.ts`
  - `/Users/jobc/dev/olympus/.cache_refs/pixel-agents/webview-ui/src/office/engine/renderer.ts`

## 3) Character Identity Rules

- One base skeleton, per-agent palette + accessory differentiation.
- Face/hair/cloth palette swap is primary identity channel.
- Small iconography overlays should be compact and non-occluding.
- Source:
  - `/Users/jobc/dev/olympus/.cache_refs/pixel-agents/webview-ui/src/office/sprites/spriteData.ts`

## 4) Applied to Olympus (implementation target)

- Keep Olympus concept:
  - Zeus = Codex, Hera = Gemini fixed
  - 20 unique worker avatars
  - Olympus temple world and divine symbols
- Rebuild direction:
  - Character renderer rebuilt around compact pixel body and palette/accessory layering
  - Object renderer rebuilt into grouped pixel object families
  - Floor/zone separation rebuilt with stronger tone contrast and explicit zone boundaries
  - Remove/avoid broad overlay blocks that reduce legibility
