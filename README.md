# Adaptive Layout Studio

A constraint-based layout engine for ads that adapts fundamentally different surfaces — a tall mobile interstitial, a wide broadcast lower-third, a square retail kiosk — from a single declarative spec, without per-surface hardcoded layouts. 

## Setup instructions

```bash
npm install
npm run dev        # starts the Adaptive Layout Studio at http://localhost:5173
npm test           # runs the resolver test suite (vitest)
```

## How to run the demo and switch surfaces

1. Run `npm run dev` and open the local URL (typically `http://localhost:5173`).
2. The **Layout Studio** interface will load with a default ad spec and the "Mobile Portrait" surface.
3. Use the **Surface Picker** at the bottom center of the screen to switch between the 5 pre-defined surfaces (Mobile Portrait, Mobile Landscape, Broadcast Lower Third, Square Kiosk, Compact Badge).
4. Watch the ad elements smoothly animate, re-flow, scale, and degrade in real-time according to the new aspect ratio and hard constraints.
5. (Optional) Check the **Validation** tab in the left navigation to see a matrix verifying that all specs resolve correctly across all surfaces without overlaps or constraint violations.

## Layout algorithm

The resolver (`src/resolver.ts`) is a pure, synchronous, framework-agnostic function that computes a layout geometrically rather than relying on lookup tables or hardcoded CSS breakpoints.

### Constraint resolution step by step
1. **Axis Selection**: The primary axis (vertical or horizontal) is dynamically chosen based purely on the surface's aspect ratio. A tall surface stacks elements top-to-bottom; a wide surface flows them left-to-right.
2. **Grouping (Pass 1)**: Elements sharing the same `priority` number are grouped into "slots". 
3. **Degradation (Pass 2)**: The engine checks if the combined minimum sizes of all slots fit along the main axis. If not, it drops the least important slot entirely, repeating until the remaining slots fit.
4. **Main Axis Distribution (Pass 3)**: The available space is distributed among the surviving slots proportional to a role-based weight, shrinking toward hard-constraint floors or growing to fill the space perfectly.
5. **Cross Axis & Member Sizing (Pass 4)**: Members within each slot are sized along the cross axis. Real constraints like `minTapTarget` (for touch surfaces) and `minTextSize` (for far-viewing) act as absolute sizing floors. Font sizes are scaled dynamically by a strict heuristic combining area, box height, and longest-word width to guarantee legibility without overlapping boundaries.

### Priority & degradation logic
Degradation is entirely priority-driven, not surface-driven. When space is insufficient:
- Whole slots drop out, **least important first** (highest priority number).
- Priority-1 elements (e.g., hero image, headline) are never dropped. 
- Interactive elements (buttons) always shrink down to at least their `minTapTarget` floor before a layout is deemed invalid.
- Secondary text gracefully scales down until it hits the `minTextSize` floor, after which it will visually truncate if it cannot fit the box.

## TypeScript design

The domain is modeled with strict, discriminated types to make invalid states unrepresentable:
- `AdElementSpec` uses a discriminated union (`type: "text" | "image" | "button"`). Attempting to access `.text` on an element is a compile-time error until TypeScript has narrowed `type === "text"`.
- `ElementRole` is a closed union of exact strings (e.g. `"hero"`, `"primary"`, `"action"`). An undefined role or typo is caught by the compiler.
- Surfaces strictly require constraints like `minTapTarget` if `touchOnly: true` is set.
- The `ResolvedLayout` output guarantees a fully computed `x`, `y`, `width`, `height`, and `fontSize` for every visible element, leaving zero math or layout guesswork for the renderer.

## Resolution flow

The architecture maintains a strict, one-way data flow separating definition, resolution, and rendering:

```
Ad Spec + Surface Profile → Constraint Resolver → Resolved Layout → Renderer (DOM/Canvas)
     (demoSpec.ts)              (resolver.ts)                        (PreviewCanvas.tsx)
```

Switching surfaces in the UI simply changes the `SurfaceProfile` input fed to the resolver. The renderer never asks "what surface am I on?"; it just blindly renders the `ResolvedLayout` boxes it is handed. 

## Bonus features implemented
- **Unseen 5th Surface**: The algorithm generalizes flawlessly to any custom width/height/safe-area without code changes.
- **Text-Measurement-Aware Layout**: `lib/textMeasure.ts` uses real canvas `measureText` logic to calculate authentic word wrapping and truncation based on the provided bounding box.
- **Canvas Rendering Backend**: `lib/exportPng.ts` proves renderer portability by drawing the exact same layout tree to an off-screen `<canvas>`.
- **Smooth Animated Transitions**: The renderer uses FLIP-style entry/exit animations and positional CSS transitions so elements glide seamlessly to their new layouts when switching surfaces.
- **Accessibility Constraints**: Tap targets and legibility distances act as first-class algorithmic constraints.

## Known limitations
- Fixed element type set (text/image/button) and fixed 5-role vocabulary.
- A slot whose co-equal-priority members can't share the cross axis throws rather than dropping one of them (as it requires author intent to break a tie).
- The Studio UI displays a drag handle for elements, but reordering is disabled since placement is strictly governed by the algorithm's priority/role logic.

## Time spent on the assignment
- 4 days. Focused on achieving a deeply robust, mathematically sound constraint resolver, full test coverage, and a highly polished "Studio" presentation UI. 

## AI tool usage
- Built with Anthropic's Claude. AI was used collaboratively as a coding partner to iterate on the constraint algorithm, generate boilerplate for the React UI, and wire up the test suites under my explicit architectural direction.
