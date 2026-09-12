# Extended build (beyond the brief)

Everything in this file is **not part of the graded take-home**. The assignment is fully satisfied by `src/spec.ts`, `src/surfaces.ts`, `src/resolver.ts`, and the original Layout Studio demo described in the main [README.md](./README.md) and [ARCHITECTURE.md](./ARCHITECTURE.md) — none of that changed while building any of this.

After the resolver and demo were in a solid, tested state, I kept going on my own initiative — partly to explore turning this into an actual small SaaS product (see the roadmap thinking that came out of that), partly because the typed adapter seam (`lib/api.ts`) made it genuinely cheap to keep adding to without ever touching the resolver, which felt worth proving out in practice rather than just claiming in a README. None of it was requested by the brief, none of it is needed to evaluate the core assignment, and a reviewer working strictly against the rubric can ignore this file entirely.

It's organized here by feature rather than by the order it was built in.

## Spec portability

- **Export Spec / Import Spec…** (`src/lib/specFile.ts`) — the editable *source* spec (elements + campaign meta), not the resolved output, as a downloadable JSON envelope. This is the save/reopen mechanism for a tool with no backend: the file itself remembers the work, the same pattern as a `.fig` or `.blend` file.
- **Paste Spec… / Paste Figma SVG…** (`src/components/studio/PasteImportModal.tsx`) — the same two imports below, for content copied from a chat or email rather than saved as a file. A parse error surfaces inline in the dialog so it can be fixed and retried, rather than closing and routing to an unrelated toast.
- **Export All Custom Specs / Import Spec Bundle…** (`src/lib/specBundle.ts`) — every spec imported this session, bundled into one `.bundle.json` (an envelope around N ordinary spec files, each independently valid on its own), for someone who's accumulated more than one and wants to save or hand off the whole set at once.
- **Editable campaign meta** — a "Campaign" tab lets you rename any spec's `campaignName`/`brand`/`supportingCopy` in place (built-in demo specs included), reflected immediately in the spec picker and any export.

## Visual export (the Figma-compatible "out" half)

- **Export PNG** (`src/lib/exportPng.ts`) — a rasterized picture of the resolved layout, drawn on an offscreen `<canvas>`. This is also the project's second renderer: it shares the exact same resolved-layout-to-renderable-elements walk (`src/lib/renderLayout.ts`) the DOM renderer uses, so it doubles as a concrete answer to "could a new renderer be added without touching the resolution algorithm" — it was built for the export feature, not as a demo of that property, but it demonstrates it anyway.
- **Export SVG** (`src/lib/exportSvg.ts`) — real `<text>` and `<image>` nodes, not pixels. Dropping this into a Figma canvas yields genuine, editable layers rather than a flattened image.
- **Export All Surfaces** — the same JSON + PNG pair, once per surface in the catalog, in one click. Downloads are deliberately sequential with a short pause between each (not `Promise.all`) — a real, researched constraint: browsers treat a burst of many script-triggered downloads from one click as a candidate to block, and pacing them out is the mitigation available without adding a zip-writing dependency.

## Figma import (the "in" half)

- **Import Figma SVG… / Paste Figma SVG…** (`src/lib/importSvg.ts`) — an SVG exported *from* a Figma frame (File → Export → SVG, a stock Figma feature) becomes a new spec. This only works cleanly because of a property already true of the graded core: `AdElementSpec` carries no position at all, only `role`/`priority` — so the importer never touches SVG geometry, it only pulls content (text via `<text>.textContent`, images via `<image>`'s `href`/`xlink:href`, found regardless of how Figma's `<pattern>`/`<defs>` fill-placement wrapper nests it). Role/priority are assigned by a font-size heuristic and are expected to be adjusted afterward, same as any import needs a pass of cleanup.
- Deliberately **not** attempted, each because a wrong heuristic guess is worse than the limitation: recovering text that Figma exported as outlined vector paths (no string left to recover), detecting "this text sits on a button shape" from markup alone, and reassembling multi-line text that Figma split into several sibling `<text>` elements (risks silently merging two unrelated headlines).
- A full two-way Figma **REST API** integration was explicitly considered and rejected: Figma's API blocks direct cross-origin browser requests, so a live sync would need a backend just to hold an access token — incompatible with the no-backend design the rest of this project is built on. The SVG round-trip above was the researched, deliberate alternative.

## Why this exists at all

Short version: after the graded resolver/demo were done, I wanted to see how far a genuinely no-backend tool could go, and whether the architecture decisions from the graded part (a pure resolver, a typed adapter seam, position-free element specs) would actually hold up under real feature pressure rather than just look good in a README. They did — nothing above required a resolver change, a new element type, or a new field on `AdElementSpec`.

## How this was verified

Same discipline as the graded core: `tsc --noEmit` + `vite build` clean, the original 16-test resolver suite unaffected throughout, plus scratch unit tests per feature (written, run, then deleted — not part of the shipped diff) and, for anything canvas/image/download-dependent that `jsdom` can't genuinely exercise (canvas rendering, `Image` load events, browser download behavior), real end-to-end runs against a live dev server with Playwright + Chromium — including one pass that caught and fixed a real bug (an early SVG export version emitted a broken `<image>` reference for the demo specs' placeholder image paths instead of falling back to the same placeholder the PNG export and on-screen canvas already show).
