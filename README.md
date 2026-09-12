# Adaptive Layout Studio

A constraint-based layout engine for ads that adapts across fundamentally different surfaces, a tall mobile interstitial, a wide broadcast lower third, a square retail kiosk, from a single declarative spec. No per-surface layouts are hardcoded anywhere.

**Live demo:** [layout-engine-peach.vercel.app](https://layout-engine-peach.vercel.app/)

---

## Setup

```bash
npm install
npm run dev        # starts the Adaptive Layout Studio at http://localhost:5173
npm test           # runs the resolver test suite (vitest)
```

## Running the demo

1. Run `npm run dev` and open the local URL (typically `http://localhost:5173`), or use the live demo link above.
2. The Layout Studio interface loads with a default ad spec and the "Mobile Portrait" surface.
3. Use the surface picker at the bottom center of the screen to switch between the five predefined surfaces: Mobile Portrait, Mobile Landscape, Broadcast Lower Third, Square Kiosk, and Compact Badge.
4. Watch the ad elements animate, re-flow, scale, and degrade in real time as the aspect ratio and hard constraints change.
5. Optionally, check the Validation tab in the left navigation for a matrix confirming that every spec resolves correctly across all surfaces, with no overlaps or constraint violations.

## How the layout algorithm works

The resolver (`src/resolver.ts`) is a pure, synchronous, framework-agnostic function. It computes a layout geometrically instead of relying on lookup tables or hardcoded CSS breakpoints.

### Constraint resolution, step by step

1. **Axis selection.** The primary axis (vertical or horizontal) is chosen purely from the surface's aspect ratio. A tall surface stacks elements top to bottom; a wide one flows them left to right.
2. **Grouping (pass 1).** Elements sharing the same `priority` number are grouped into slots.
3. **Degradation (pass 2).** The engine checks whether the combined minimum sizes of all slots fit along the main axis. If they don't, it drops the least important slot entirely and repeats until the rest fit.
4. **Main axis distribution (pass 3).** The available space is distributed among the surviving slots, proportional to a role-based weight, shrinking toward hard-constraint floors or growing to fill the space exactly.
5. **Cross axis and member sizing (pass 4).** Members within each slot are sized along the cross axis. Constraints like `minTapTarget` (touch surfaces) and `minTextSize` (far-viewing surfaces) act as absolute floors. Font sizes are scaled by a heuristic combining area, box height, and longest-word width, so text stays legible without overlapping its boundaries.

### Priority and degradation

Degradation is driven entirely by priority, never by which surface is active. When space runs short:

- Whole slots drop out, least important first (highest priority number).
- Priority-1 elements, such as the hero image or headline, are never dropped.
- Interactive elements (buttons) shrink down to their `minTapTarget` floor before a layout is considered invalid.
- Secondary text scales down until it hits the `minTextSize` floor, then truncates visually if it still doesn't fit.

## TypeScript design

The domain is modeled with strict, discriminated types, so invalid states can't be represented at all.

- `AdElementSpec` uses a discriminated union (`type: "text" | "image" | "button"`). Accessing `.text` on an element is a compile error until TypeScript has narrowed `type === "text"`.
- `ElementRole` is a closed union of exact strings, `"hero"`, `"primary"`, `"action"`, and so on. An undefined role or a typo is caught by the compiler, not at runtime.
- Surfaces require constraints like `minTapTarget` whenever `touchOnly: true` is set.
- `ResolvedLayout` guarantees a fully computed `x`, `y`, `width`, `height`, and `fontSize` for every visible element, leaving no math or layout guesswork for the renderer.

## Resolution flow

The architecture keeps a strict, one-way data flow that separates definition, resolution, and rendering:

```
Ad Spec + Surface Profile → Constraint Resolver → Resolved Layout → Renderer (DOM/Canvas)
     (demoSpec.ts)              (resolver.ts)                        (PreviewCanvas.tsx)
```

Switching surfaces in the UI just changes the `SurfaceProfile` fed into the resolver. The renderer never asks "what surface am I on?" It renders whatever `ResolvedLayout` boxes it's handed, without knowing or caring where they came from.

## Bonus features

- **A fifth, unseen surface.** The algorithm generalizes to any custom width, height, or safe area without code changes.
- **Text-measurement-aware layout.** `lib/textMeasure.ts` uses real canvas `measureText` calls to compute genuine word wrapping and truncation against the element's bounding box.
- **A canvas rendering backend.** `lib/exportPng.ts` proves the renderer is portable by drawing the same layout tree to an off-screen `<canvas>`.
- **Smooth animated transitions.** The renderer uses FLIP-style entry and exit animations, plus positional CSS transitions, so elements glide into their new layout when the surface switches.
- **Accessibility constraints.** Tap targets and legibility distances are first-class constraints in the algorithm itself, not an afterthought.

## Known limitations

- The element type set (text, image, button) and the five-role vocabulary are both fixed.
- A slot whose co-equal-priority members can't share the cross axis throws rather than silently dropping one of them; breaking that tie needs author intent.
- The Studio UI shows a drag handle on each element, but reordering is disabled, since placement is governed strictly by the algorithm's priority and role logic.

## Time spent

Four days, most of it going toward a resolver that's mathematically sound and thoroughly tested, plus a Studio presentation UI polished enough to actually demo.

## AI tool usage

Built with Anthropic's Claude. I used it as a coding partner throughout, iterating on the constraint algorithm, generating boilerplate for the React UI, and wiring up the test suites, all under my own explicit architectural direction.