# Architecture

## Resolution flow

```
Ad Spec + Surface Profile → Constraint Resolver → Resolved Layout → Typed Adapter → Studio (React)
      (spec.ts)                 (resolver.ts)          |                (lib/api.ts)   (components/, pages/)
                                                          → describeDegradationOrder()
```

`resolver.ts` is pure — `(AdSpec, SurfaceProfile) -> ResolvedLayout`, no DOM, no React, no I/O. It's also the only file that knows nothing surface-specific: it never checks a surface's name or identity, only the numeric/boolean facts on `SurfaceProfile` (`width`, `height`, `safeArea`, `minTapTarget`, `minTextSize`, `viewingDistance`, `touchOnly`). That's what makes the exact same code path handle a never-seen-before 5th surface — proven by `test/resolver.test.ts`'s "generalizes to an unseen 5th surface" test and the 500-iteration randomized sweep, both unchanged by the Studio work below.

### Studio-facing additions to `ResolvedLayout` (additive, this round)

The original hiring-brief phase's `ResolvedLayout`/`ResolvedElementLayout` shapes are untouched — every field that existed before still means exactly what it meant before, and no previously-computed number changed (verified by the existing 16-test suite passing unmodified). What's new:

- `ResolvedElementLayout.zIndex: number` — paint order, ascending, matching `visible`'s own array order (slot by slot).
- `ResolvedElementLayout.atFloor: boolean` — true when Pass 4 sized this element (main axis, cross axis, or both) down to its hard-constraint floor rather than its weight-proportional ideal. A real fact already computed during Pass 4, just surfaced rather than thrown away.
- `ResolvedLayout.safeArea: SafeArea` — the already-resolved safe area (`resolveSafeArea(surface.safeArea)`), so a caller never has to re-resolve the surface's `Partial<SafeArea>` itself.
- `ResolvedLayout.degradation: readonly DegradationEntry[]` — a superset of `dropped`: every dropped element (`action: "dropped"`) *plus* every visible element pinned to its floor (`action: "shrunk"` for non-text, `"truncated"` for text), each with a `reason` string.
- `ResolvedLayout.diagnostics: ResolvedLayoutDiagnostics` — `resolvedInMs` (real `performance.now()` delta, not fabricated), `overlapCount`/`clippedCount` (genuine O(n²) pairwise checks re-run every call, never assumed zero), `fitScore` (100 minus a penalty per dropped/degraded element, floored at 0), and `strategy` (a label derived purely from the resolved axis and whether degradation occurred, e.g. `"horizontal-flow-degraded"` — never a surface's name or id).
- `describeDegradationOrder(spec: AdSpec): readonly string[]` — a new pure function (spec-driven, no `SurfaceProfile` parameter) that reuses `groupIntoSlots()` to produce the same "Preserve X / Truncate Y / Drop Z if required" narrative Pass 2/4 would actually follow, so the Studio's Degradation Order panel is read off the algorithm's own grouping rather than a hand-authored (and driftable) copy of it.

All of the above were verified against the exact examples this project's own brief and test suite already establish (e.g. the primary AURORA spec's degradation order on the `tinyBadge`/"Compact Badge" surface: logo dropped, CTA shrunk to its tap-target floor, price truncated — `fitScore: 75`, zero overlap, zero clipping) before being wired into the Studio.

## The algorithm

Four passes, in order:

### 1. Group into priority slots

Elements sharing the same `priority` number become one "slot," ordered most- to least-important. This is the *only* structural hint the resolver takes from the spec — deliberately, because it's spec-driven (the ad author's intent) rather than surface-driven, and it directly matches the assignment's own example spec (`headline`+`product-image` both priority 1, `cta`+`price` both priority 2, `logo` alone at priority 3).

### 2. Pick a primary axis

`axis = contentBox.height > contentBox.width ? "vertical" : "horizontal"` — a continuous function of the surface's own aspect ratio (after subtracting `safeArea`), never of its name or id. A portrait phone screen and an ultra-wide broadcast banner get fundamentally different flows (top-to-bottom vs. left-to-right) from the same rule; a square-ish surface (kiosk) ties to horizontal, which is an arbitrary but consistent tiebreak.

### 3. Degrade (drop whole slots, least important first)

Compute each slot's minimum main-axis size (the max of its members' hard-constraint floors — see below). While the *least* important remaining slot exists and the sum of all remaining slots' minimums still exceeds the available main-axis space, drop that slot entirely and record why. Priority-1 elements are structurally never droppable (there's always at least one slot left), and if even they can't fit, `resolveLayout()` throws a descriptive error rather than clipping.

This is the "priority-ordered greedy placement pass" the assignment's FAQ explicitly says is sufficient — no linear-programming solver, just a deterministic, explainable, testable loop.

### 4. Distribute (size what's left, exactly filling the space)

A single generic function, `distribute(items, available)`, is used at **both** call sites: sizing slots along the main axis, and sizing members within a slot along the cross axis. Given weighted items with hard minimums:

- Ideal size ∝ weight share of `available`, clamped to each item's minimum.
- If the ideal sizes overflow `available`, shrink items above their floor proportional to their slack, iterating (since clamping one item at its floor changes how much the rest must absorb) until it fits exactly.
- If the ideal sizes underflow `available`, grow every item proportional to weight until the leftover space is used exactly.

Reusing one function for both axes (rather than writing bespoke main-axis and cross-axis sizing code) is the "clean separation of concerns" the assignment asks about explicitly ("could a new renderer be added without touching the resolver" — yes, and by the same token, a new *axis behavior* doesn't need new sizing logic either).

### Two hard-constraint floors, not one

- **Main-axis floor** (`elementMinMainSize`): role-based baseline (`ROLE_MIN_MAIN_SIZE`), raised to `minTapTarget` for buttons on touch surfaces, or to `minTextSize`-derived height for text *and* button elements (button labels get a `fontSize` too — see the renderer) whenever `surface.minTextSize` is set.
- **Cross-axis floor** (`elementMinCrossSize`): same idea, perpendicular, and deliberately raised by the *same* two conditions as the main-axis floor rather than just the generic 8px baseline. That symmetry matters: `fontSize` is always rendered against whichever axis is an element's "height" for the *resolved* axis (main size when `axis === "vertical"`, cross size when `axis === "horizontal"` — see Pass 4 below), so a floor that only lived on the main axis left the cross axis's font-determining case unguarded on horizontal-axis surfaces.

  This was a real bug with two overlapping causes, both caught by the randomized sweep plus a dedicated repro:
  1. The cross-axis floor didn't account for `minTextSize` at all, so on a horizontal-axis surface (e.g. a 2000×60 `minTextSize:32` surface, which resolves to the horizontal axis) a text element could get a box only ~24px tall while `fontSize` was still forced to 32 — visibly taller than its own box, silently clipped by the renderer's `overflow: hidden`.
  2. Both floors originally required `surface.viewingDistance === "far"` before honoring `minTextSize` at all, but the actual `fontSize` computation at the bottom of Pass 4 (`Math.max(surface.minTextSize ?? 0, ...)`) has no such requirement — and applies to every element, not just `type === "text"`. So `minTextSize` set without `viewingDistance: "far"` (impossible through the demo app's own form, which always couples them, but perfectly legal on the underlying `SurfaceProfile` type), or a `minTextSize` surface with a *button* in the tight slot, reproduced the same box/font mismatch through a different door.

  The fix keys both floors off `surface.minTextSize` alone — no `viewingDistance` requirement — for both `"text"` and `"button"` elements, matching what the fontSize computation actually does. Whichever axis ends up font-determining is now guaranteed tall enough, or the layout refuses outright, for every combination `minTextSize` can be set in. Members sharing a slot have no further priority to degrade by — they're co-equal — so if their combined cross-axis floors don't fit (also true for the 60px `minTapTarget`-in-a-50px-banner case the sweep originally found), the resolver throws a clear error instead of letting `distribute()` silently return sizes that overflow the surface. This mirrors the main-axis "can't fit priority-1" error and keeps the "never overlaps or clips" guarantee absolute rather than best-effort.

## Rounding: why boundaries, not widths, get rounded

Every internal computation stays in floating point; only the final `ResolvedElementLayout` needs integer pixels. Rounding each element's `x`/`y`/`width`/`height` independently is a real bug, not a cosmetic one — it was caught by this project's own test suite (see below): a slot spanning `[891.79, 1275.38]` rounds cleanly as a pair of boundaries, but rounding its *height* (`383.59 → 384`) and its *start* (`891.79 → 892`) separately produces a displayed bottom edge of `1276`, one pixel past the next slot's rounded top of `1275` — an overlap. The fix (in `resolver.ts`'s Pass 4) rounds the cumulative cursor position at each boundary and derives each size as the difference between two consecutive rounded boundaries, so touching elements' rounded edges always agree exactly.

## Type system

`AdElementSpec` is a discriminated union on `type` (`"text" | "image" | "button"`), so `element.text` is only accessible when TypeScript has already narrowed `element.type === "text"` — referencing the wrong field for a type is a compile error. `role: ElementRole` is a closed union of the five roles the resolver's weight table understands (`"hero" | "primary" | "secondary" | "action" | "branding"`); an undefined role is a compile-time error, satisfying the assignment's own requirement almost verbatim. `defineAd()` adds the runtime checks TypeScript structurally can't: duplicate ids, non-positive priorities, empty required content per element type.

## Frontend: Adaptive Layout Studio

The demo shell from the original hiring-brief phase (`App.tsx` + `render-dom.ts`, an imperative "paint these rects to the DOM" step plus a thin React wrapper) was retired and replaced with a proper Studio UI, per a later, much more detailed brief. The resolver above is completely unaffected — this section is strictly about `src/app/`, `src/components/`, `src/pages/`, `src/lib/`, `src/styles/`.

### Layering

```
src/lib/api.ts          — the one place that calls resolveLayout()/describeDegradationOrder(); every
                            export is async (simulated latency + connection status), even though the
                            resolver itself is synchronous, so loading/error states are real
src/lib/types.ts         — Studio-facing types, wrapping (never duplicating) resolver/spec/surface types
src/lib/mock-data.ts     — surface display metadata (name, context label, description) over the real
                            surfaces.ts profiles
src/lib/constraints.ts   — buildConstraintChecks(layout, surface): the one place hard-constraint
                            pass/fail is decided, shared by <ConstraintChecklist> and the /validation
                            matrix so the two can never disagree
src/lib/formatters.ts    — px/ms/relative-time/etc. display formatting, no logic
src/components/ui/       — Icon (hand-drawn inline SVG set, no icon library), Badge/PriorityBadge, StatusDot
src/components/navigation/AppSidebar.tsx — global nav, recent resolutions, connection status (all adapter-fed)
src/components/studio/   — StudioShell (chrome), StudioHeader, SurfaceToolbar, PreviewCanvas +
                            SafeAreaOverlay/ElementBoundsOverlay/SpacingOverlay/ResolvedElementView,
                            SpecInspector, ResolutionPanel + ResolutionSummary/ConstraintChecklist/
                            DegradationLog/StrategySummary, StudioFooter, and LayoutStudioPage (the
                            stateful container that owns the active spec/surface, calls resolveLayout(),
                            and wires every other studio/ component together)
src/pages/                — SpecsPage, SurfacesPage, ValidationPage (the three non-primary routes)
src/app/routes.tsx        — a ~90-line dependency-free router (history API + Context), not react-router:
                            there are exactly 4 routes, so a full path-matching library would be the
                            "unnecessary abstraction" the brief warns against. No new npm dependency was
                            introduced anywhere in this phase.
src/app/App.tsx           — RouterProvider + StudioShell + a plain switch on pathname
```

### Rendering the resolved ad: scale the stage, never the coordinates

`PreviewCanvas` renders `layout.visible` by giving each `ResolvedElementView` a style of exactly `{ left: element.x, top: element.y, width: element.width, height: element.height, zIndex: element.zIndex }` — the same numbers `resolver.ts` computed, unmodified. The "stage" div is sized to the surface's true pixel dimensions (`layout.surfaceWidth`/`surfaceHeight`) and the *only* scaling applied is a single `transform: scale(factor)` on that whole stage, where `factor` comes from fitting the stage into the available viewport (`Fit`) or `1` (`100%`). This is deliberate: scaling the stage as a unit preserves the exact aspect ratio and every element's position/size relationship; scaling individual coordinates would not. Nowhere in `PreviewCanvas.tsx`, `ResolvedElementView.tsx`, or any overlay is there a branch on a surface's id/name — every visual difference between surfaces comes from the resolver having placed elements differently, never from the renderer reacting to which surface it is.

`ResolvedElementView` renders content type-appropriately: `"text"`/`"button"` elements render their real spec content (`elementContent()`, upstream) at `element.fontSize`; `"image"` elements render a labeled placeholder tile showing their `alt` text rather than a broken `<img>`, since — as `spec.ts`'s own doc comment for `elementContent()` says — "there's no rendered pixel content for a placeholder image, so its alt text is the closest thing it has to displayable content." An element pinned to its hard-constraint floor (`atFloor`) gets a small amber marker directly on the canvas, so degradation is visible without opening the Resolution Panel.

### Overlays

`SafeAreaOverlay`, `ElementBoundsOverlay`, and `SpacingOverlay` are separate absolutely-positioned layers toggled by the Surface Toolbar, each computed from the same resolved data the canvas renders (safe-area insets, element bounding boxes, and real gaps between consecutive elements along the resolved axis, respectively) — none of them are decorative or precomputed per surface.

### Diagnostics panels: read, never re-derive

`ResolutionSummary`, `ConstraintChecklist`, `DegradationLog`, and `StrategySummary` (composing `ResolutionPanel`) all read directly off `layout.diagnostics`/`.degradation`/`.safeArea`/`.axis`. `StrategySummary`'s "Composition" line is literally `diagnostics.strategy` — the exact string `resolveLayout()` derived — and "Content density"/"Overflow" are computed from `layout.visible`'s real areas/bounds, not looked up by surface id. `SpecInspector`'s "Degradation Order" section renders `describeDegradationOrder(spec)` verbatim.

### Validation sweep

`/validation` calls `resolveLayout()` for every (spec × surface) combination in the catalog (15 with the current 3 specs × 5 surfaces) and runs `buildConstraintChecks()` on each result, rendering a pass/fail matrix; a combination the resolver can't fit at all surfaces as a genuine error cell (caught per-combination, never silently swallowed) rather than being skipped.

### Compare mode and export

"Compare" resolves the *same* spec against a second, independently-selectable surface and renders both canvases side by side, read-only; because both sides share one spec, element ids match across them, so selecting an element on one side highlights it on both. "Export Layout" serializes the active `{ spec, surface, layout, degradationOrder }` to formatted JSON and triggers a real browser download (`Blob` + object URL + a transient `<a download>`) — no network call, purely client-side.

## Testing strategy

- Per-demo-surface tests assert axis choice, hard-constraint compliance (`minTapTarget`, `minTextSize`), and the no-overlap/no-out-of-bounds invariant.
- Two dedicated degradation tests assert the *exact* drop order under increasingly tight surfaces (branding first, then action+secondary, priority-1 never).
- One test asserts `resolveLayout()` throws rather than clips when even priority-1 elements can't fit.
- One test asserts the same for the cross-axis-infeasible case.
- One test resolves a surface that resembles none of the 4 demo profiles, proving generalization.
- **A 500-iteration deterministic sweep** across randomized width/height/safeArea/touchOnly/minTapTarget/viewingDistance/minTextSize combinations asserts, for every surface, either a valid (no-overlap, in-bounds) layout or one of the two documented refusal errors — nothing else. This is what actually caught both real bugs during development (the rounding-seam overlap and the unhandled cross-axis infeasibility); it's a stronger guarantee than the 4 fixed demo surfaces alone could give.

This suite exercises `resolver.ts`/`spec.ts` only, and every Studio-facing addition to `resolver.ts` was designed to leave it passing unmodified (it does). The Studio layer (`lib/`, `components/`, `pages/`, `app/`) has no automated test file in this repo — see README's Testing section for how it was verified instead (strict typecheck + an end-to-end runtime sweep of the adapter/resolver/constraints modules across every spec × surface combination).

## Limitations

- **Fixed element type set** (`text` / `image` / `button`) and **fixed role set** (five roles) — extending either means editing `spec.ts`'s union and `resolver.ts`'s weight/floor tables, not just data.
- **No text-measurement-aware wrapping.** Font size is estimated from resolved box height (`height * 0.55`, clamped to `minTextSize`); it doesn't measure actual rendered text width, so a very long headline in a narrow slot may visually overflow its box even though the *box itself* never overlaps a neighbor. Listed as a bonus in the brief, intentionally out of scope here.
- **Uniform role-weight table**, not per-ad customizable. Two elements with the same role always compete for space identically regardless of their specific content.
- **No animated transition** between surfaces (also listed as a bonus) — the Studio does animate its own chrome (page-load reveal, staggered list rows, a "Resolving…" pill during a fetch), but does not crossfade/tween the ad's own element positions between two different resolved layouts.
- **Axis tie-break is fixed** (square → horizontal) rather than configurable.
- **Cross-axis members within a slot never degrade individually** — only whole slots drop (see "cross-axis floor" above); a slot that's cross-infeasible throws rather than trying to drop one of its co-equal-priority members, since choosing *which* one would require author intent the spec doesn't currently express.
- **The Studio's element roster shows a drag handle but doesn't support reordering** — the resolver places elements purely from `priority`/`role`, and this build doesn't let the UI mutate a spec.
- **No custom-surface input in the UI** (see README's "Note on scope" for why) — the Surface Toolbar is scoped to the fixed 5-surface catalog; the resolver itself is unaffected and still generalizes to any unseen `SurfaceProfile`.
- **No component-level UI tests shipped** — verified via `tsc --noEmit` against the project's real strict `tsconfig.json` plus an end-to-end runtime sweep of the adapter/resolver/constraints layer (every spec × surface combination, asserted to resolve and produce a zero-violation checklist); not verified against actual browser/DOM rendering in this environment (see README's Testing section).
