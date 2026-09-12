# Adaptive Layout Studio

A constraint-based layout engine for ads that need to run across fundamentally different surfaces — a tall mobile interstitial, a wide broadcast lower-third, a square retail kiosk — from a single declarative spec, without per-surface hardcoded layouts. The engine is fronted by the **Adaptive Layout Studio**: a control-room-style UI that renders the resolver's actual output and explains *why* it made each placement/degradation decision, rather than a conventional analytics dashboard.

Built for a hiring take-home (see the original brief), on my own timeline rather than the brief's 3–5 day window.

## Setup instructions

```bash
npm install
npm run dev        # starts the Adaptive Layout Studio (Vite) at http://localhost:5173
npm test           # runs the resolver test suite (vitest, no browser needed)
npm run build      # type-checks + builds a static bundle to dist/ (deployable anywhere)
```

No database, no backend, no environment variables. The resolver is a pure, synchronous, client-side function — for this assignment it *is* "the backend" — and the Studio talks to it exclusively through a typed async adapter (`src/lib/api.ts`) that simulates real network latency, so the UI's loading/error states are genuine, not skipped.

## The Studio

`npm run dev`, open the printed local URL. It lands on **Layout Studio** (`/layout-studio`), a three-column workspace:

- **Left nav** — Flam wordmark, the four real routes (Layout Studio / Ad Specs / Surface Profiles / Validation), a live "recent resolutions" list, and connection status — all sourced from the adapter, none hardcoded.
- **Center** — a **Surface Toolbar** (surface picker, Fit/100% zoom, Safe Area/Element Bounds/Spacing/Priority overlay toggles, Compare, Export Layout) above the **Preview Canvas**, which renders the actual `ResolvedLayout` at the surface's true aspect ratio and pixel size — the canvas is scaled as a whole via one CSS `transform: scale()`, never by rescaling individual element coordinates, and never by branching on a surface's id or a `@media` breakpoint (see "Important implementation constraint" below).
- **Right panel** — Resolution Status (fit score, resolve time, overlap/clip counts), a Hard Constraints checklist (every row computed live, see `lib/constraints.ts`), a clickable Degradation Log, and Layout Strategy metadata — all read straight off `ResolvedLayout.diagnostics`/`.degradation`/`.safeArea`, never re-derived or hardcoded per surface.
- **Bottom bar** — the resolved surface size/axis, and the selected element's real coordinates.

The other three routes: **Ad Specs** (`/specs`) is editorial tiles over the real AURORA campaign catalog (`src/demoSpec.ts`) with an "Open in Studio" link per spec; **Surface Profiles** (`/surfaces`) is visual cards with true-aspect-ratio mini previews over the real surface catalog; **Validation** (`/validation`) resolves *every* spec × surface combination and runs the same hard-constraint checklist across all of them in a matrix, so you can see the whole catalog's health at a glance rather than one pair at a time.

**Demo content**: three real, `defineAd()`-validated AURORA Hydration campaigns (Aurora Hydration Launch, Aurora Refill Subscription, Aurora Retail Countdown) — no lorem ipsum. The "Compact Badge" surface (80×50, from the original `tinyBadge` profile) is deliberately too tight for any of them at full size, so switching to it is the fastest way to see real degradation: for the primary launch spec, the logo drops, the CTA shrinks to its tap-target floor, and the price truncates — headline/hero image/CTA all stay valid, and there is still zero overlap or clipping (confirmed by both the resolver's own diagnostics and the Validation matrix).

**Note on scope vs. the earlier demo:** the previous version of this app's demo shell had a live "custom surface" input form (type in any width/height/safeArea/etc. and see it resolve). The Studio rebuild replaced that shell entirely per a later, much more specific brief, whose toolbar is scoped to the fixed 5-surface catalog with no custom-input control. The *resolver* still generalizes to an arbitrary unseen surface with zero code changes (unchanged, still covered by `test/resolver.test.ts`'s "generalizes to an unseen 5th surface" test and the 500-iteration randomized sweep) — only the UI's live custom-surface form was retired, not the underlying capability.

## Layout algorithm

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for the full writeup. Short version: elements sharing a `priority` number become one "slot"; the primary axis (vertical/horizontal) comes from the surface's own aspect ratio; slots are sized proportional to a role-based weight with hard-constraint floors (`minTapTarget`, `minTextSize`); if everything doesn't fit, whole slots drop — least important first, priority-1 never — until it does, or the resolver throws rather than silently clipping.

### How priority/degradation is decided

1. Group elements into slots by shared priority, ordered most- to least-important.
2. While the combined minimum size of all remaining slots exceeds the available main-axis space, drop the *least* important slot entirely.
3. Once what's left fits at minimum size, distribute the actual available space proportional to each slot's role-based weight (shrinking toward floors or growing to fill exactly, never overlapping).

## TypeScript design

`AdElementSpec` is a discriminated union (`type: "text" | "image" | "button"`), so accessing `.text` on an element isn't legal until TypeScript has narrowed `type === "text"`. `role: ElementRole` is a closed 5-value union — an undefined role is a compile-time error, not a runtime surprise. `defineAd()` adds the runtime checks the type system can't (duplicate ids, non-positive priority, empty required content).

## Resolution flow

```
Ad Spec + Surface Profile → Constraint Resolver → Resolved Layout → Typed Adapter → Studio (React)
     (demoSpec.ts)              (resolver.ts)                          (lib/api.ts)      (components/, pages/)
```

`resolver.ts` stays exactly what it always was — pure, synchronous, framework-agnostic — with one addition this round: `ResolvedLayout` now also carries `safeArea`, `degradation` (a superset of `dropped` plus anything shrunk/truncated to its floor), and `diagnostics` (`resolvedInMs`, `overlapCount`, `clippedCount`, `fitScore`, `strategy`), and each `ResolvedElementLayout` carries `zIndex`/`atFloor`. All additive — every prior field, every existing test, and every previously-computed number is untouched (see ARCHITECTURE.md for exactly what changed and how it was verified). A new pure function, `describeDegradationOrder(spec)`, derives a human-readable degradation narrative from the same slot-grouping logic `resolveLayout()` itself uses, so the Studio's "Degradation Order" panel is never hand-authored strings that could drift from what the algorithm actually does.

### Important implementation constraint (frontend)

The Preview Canvas renders `resolvedLayout.elements` by mapping each one to `{ left, top, width, height, zIndex }` taken directly from the resolver's output. There is no `if (surfaceId === "mobile-portrait") return mobileLayout` branch anywhere in the rendering layer, and no `@media` breakpoint chooses a different ad composition — a CSS media query is only ever allowed to touch the *dashboard chrome* around the canvas, never the ad itself. Switching surfaces changes what surface data is *fed into the resolver*, not which code path the renderer takes.

## Limitations

- Fixed element type set (text/image/button) and fixed 5-role vocabulary
- No text-measurement-aware wrapping — font size is a height-based estimate, not measured from actual rendered text
- No animated transition between surfaces
- A slot whose co-equal-priority members can't share the cross axis throws rather than dropping one of them (no way to know which one the author would prefer)
- The Studio's element roster has a visual drag-handle affordance but reordering isn't wired up — the resolver's placement is driven entirely by `priority`/`role`, which aren't mutable from the UI in this build
- "Compare" mode resolves the same spec against a second surface and renders both canvases read-only side by side (selection is shared by element id, since both sides share the same spec); it isn't a full diff view

Full list with rationale in ARCHITECTURE.md.

## AI tool usage

_(Not filled in yet — will document which tools were used and for what before this is submitted anywhere.)_

## Time spent

Not tracked against the brief's 3–5 day window, since this was built on its own timeline by design.

## Testing

`npm test` runs:

- Per-surface correctness and hard-constraint tests (all 4 demo profiles)
- Two exact-drop-order degradation tests under increasingly tight surfaces
- Two "throws rather than clips" tests (main-axis and cross-axis infeasibility)
- A dedicated regression test for a `minTextSize` box/font mismatch on horizontal-axis surfaces (see ARCHITECTURE.md's "hard-constraint floors" section)
- A generalization test against a surface resembling none of the demo profiles
- A 500-iteration deterministic randomized sweep asserting no-overlap/no-out-of-bounds *and* fontSize-fits-its-own-box (or an explicit, documented refusal) across a wide spread of synthetic surfaces — this is what caught the rounding-seam and cross-axis-infeasibility bugs outright, and (once its invariant was extended to also check fontSize-vs-box) confirmed the minTextSize box/font mismatch found by direct code audit and independently reproduced both remaining variants of it (see ARCHITECTURE.md's rounding and hard-constraint-floors sections)

All 16 tests above cover `resolver.ts`/`spec.ts` and are unaffected by the Studio work — every studio-facing addition to `resolver.ts` (`safeArea`, `degradation`, `diagnostics`, `zIndex`/`atFloor`, `describeDegradationOrder()`) is additive, and this suite passing unmodified is part of how that was verified.

The Studio itself (`src/lib/`, `src/components/`, `src/pages/`, `src/app/`) doesn't have an automated test file in this repo yet — `npm install` wasn't available in the sandbox this was built in, so it was verified by (1) a strict `tsc --noEmit` pass across every file against the project's real `tsconfig.json` settings, and (2) an end-to-end runtime sweep that imports the real adapter/resolver/constraints modules and resolves every spec × surface combination, asserting each one succeeds, exercising `describeDegradationOrder()`, and confirming the constraint checklist finds zero violations anywhere in the catalog. It has not been verified against real DOM rendering in a browser — run `npm run dev` to see the actual UI, and `npm run build` to confirm the production bundle compiles.
