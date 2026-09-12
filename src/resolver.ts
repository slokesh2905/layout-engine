/**
 * The constraint resolver: (AdSpec, SurfaceProfile) -> ResolvedLayout.
 *
 * Deliberately framework-agnostic (no DOM, no React) and deliberately
 * ignorant of any *specific* surface — it only ever reads numeric/boolean
 * facts off the SurfaceProfile it's given (width, height, safeArea,
 * minTapTarget, minTextSize, viewingDistance, touchOnly). That's what lets
 * the exact same code path handle a 5th, never-seen-before surface passed
 * in live: nothing here branches on a surface's name or identity.
 *
 * Algorithm, in four passes — see ARCHITECTURE.md for the full writeup:
 *   1. Group elements into "slots" by shared `priority` (spec-driven, not
 *      surface-driven — this is the only structural hint the spec gives).
 *   2. Pick a primary axis from the surface's aspect ratio.
 *   3. Degrade: drop whole slots, lowest-importance (highest priority
 *      number) first, until what's left can fit at minimum size.
 *   4. Distribute: size remaining slots along the main axis (and members
 *      within a slot along the cross axis) proportional to a role-based
 *      weight, shrinking or growing to exactly fill the available space.
 */
import type { AdElementSpec, AdSpec, ElementRole } from "./spec.js";
import type { SafeArea, SurfaceProfile } from "./surfaces.js";
import { resolveSafeArea } from "./surfaces.js";

export interface ResolvedElementLayout {
  readonly id: string;
  readonly type: AdElementSpec["type"];
  readonly role: ElementRole;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Only meaningful for "text" and "button" elements. */
  readonly fontSize: number;
  /** Paint order — ascending, slot by slot, matching `visible`'s own order. */
  readonly zIndex: number;
  /**
   * True when Pass 3/4's `distribute()` had to size this element (on its
   * main axis, its cross axis, or both) right down to the hard-constraint
   * floor computed by `elementMinMainSize`/`elementMinCrossSize`, rather
   * than its weight-proportional ideal share. A real, already-computed
   * fact about *this* resolution (not a per-surface guess) — surfaced so a
   * caller can show "this is as small as it's allowed to get" without
   * reimplementing the floor math.
   */
  readonly atFloor: boolean;
}

export interface DroppedElement {
  readonly id: string;
  readonly role: ElementRole;
  readonly priority: number;
  readonly reason: string;
}

/**
 * What kind of degradation was applied to reach a fitting layout:
 *   - "dropped": the element's whole slot was removed (Pass 2) — it isn't
 *     in `visible` at all.
 *   - "shrunk": a non-text element (image/button) is in `visible` but sized
 *     at its hard-constraint floor.
 *   - "truncated": same as "shrunk", but for a "text" element specifically
 *     — shrinking text down to its minimum readable size is functionally a
 *     truncation of how much of its intended presentation survived.
 */
export type DegradationAction = "dropped" | "shrunk" | "truncated";

export interface DegradationEntry {
  readonly elementId: string;
  readonly role: ElementRole;
  readonly priority: number;
  readonly action: DegradationAction;
  readonly reason: string;
}

export interface ResolvedLayoutDiagnostics {
  /** Wall-clock time spent inside resolveLayout(), measured with performance.now(). */
  readonly resolvedInMs: number;
  /** Pairwise bounding-box overlap count across `visible` — always re-checked, never assumed 0. */
  readonly overlapCount: number;
  /** Count of `visible` elements whose box extends outside the surface bounds — always re-checked. */
  readonly clippedCount: number;
  /** 100 minus a penalty per dropped element and per element pinned to its floor, floored at 0. */
  readonly fitScore: number;
  /** A short label derived from the resolved axis and whether any degradation occurred — never the surface's name/id. */
  readonly strategy: string;
}

export interface ResolvedLayout {
  readonly surfaceWidth: number;
  readonly surfaceHeight: number;
  readonly axis: "vertical" | "horizontal";
  readonly safeArea: SafeArea;
  readonly visible: readonly ResolvedElementLayout[];
  readonly dropped: readonly DroppedElement[];
  /** Superset of `dropped` plus any `visible` element pinned to a hard-constraint floor. */
  readonly degradation: readonly DegradationEntry[];
  readonly diagnostics: ResolvedLayoutDiagnostics;
}

// ---------------------------------------------------------------------------
// Role weight / minimum-size tables. These describe visual importance and
// are properties of a *role* (part of the spec's own vocabulary), not of
// any surface — the same table is consulted for every surface.
// ---------------------------------------------------------------------------

const ROLE_WEIGHT: Record<ElementRole, number> = {
  hero: 3,
  primary: 2,
  action: 1.2,
  secondary: 1,
  branding: 0.6,
};

const ROLE_MIN_MAIN_SIZE: Record<ElementRole, number> = {
  hero: 40,
  primary: 24,
  action: 32,
  secondary: 20,
  branding: 16,
};

const ABSOLUTE_MIN_CROSS_SIZE = 8;
const FONT_SIZE_TO_HEIGHT_RATIO = 0.55;

// Note: the box-size floors below key off `surface.minTextSize` alone, NOT
// `surface.viewingDistance === "far"` — even though `minTextSize` is
// documented as "set on far-viewing-distance surfaces" and every demo
// profile (and the demo app's custom-surface form) only ever sets the two
// together. The actual fontSize floor, right at the bottom of
// resolveLayout()'s Pass 4, is `Math.max(surface.minTextSize ?? 0, ...)` —
// unconditional on viewingDistance, AND applied to every element (so a
// button's label is floored by it too, not just "text" elements — see
// ResolvedElementView.tsx, which renders element.fontSize for both). So a caller of
// the resolver directly (bypassing the demo UI's coupling) who sets
// `minTextSize` without `viewingDistance: "far"`, or whose surface has
// interactive text (buttons), still gets fontSize forced up by that code;
// if these floors were narrower — gated on viewingDistance, or on
// element.type === "text" only — either gap would silently reproduce the
// exact "font taller than its own box" bug fixed here, just through a
// different door. Keying both floors off `minTextSize` alone, for both
// "text" and "button" elements, keeps them consistent with what the
// fontSize computation actually does.
function elementMinMainSize(element: AdElementSpec, surface: SurfaceProfile): number {
  let floor = ROLE_MIN_MAIN_SIZE[element.role];
  if (element.type === "button" && surface.touchOnly && surface.minTapTarget) {
    floor = Math.max(floor, surface.minTapTarget);
  }
  if ((element.type === "text" || element.type === "button") && surface.minTextSize) {
    floor = Math.max(floor, surface.minTextSize / FONT_SIZE_TO_HEIGHT_RATIO);
  }
  return floor;
}

function elementMinCrossSize(element: AdElementSpec, surface: SurfaceProfile): number {
  let floor = ABSOLUTE_MIN_CROSS_SIZE;
  if (element.type === "button" && surface.touchOnly && surface.minTapTarget) {
    floor = Math.max(floor, surface.minTapTarget);
  }
  // Mirrors elementMinMainSize()'s minTextSize branch above. fontSize is
  // always derived from whichever axis happens to determine an element's
  // height (roundedSlotMainSize when axis === "vertical",
  // roundedMemberCrossSize when axis === "horizontal" — see the Pass 4
  // comment in resolveLayout). These two floor functions are deliberately
  // axis-agnostic pure functions of (element, surface) alone, so rather
  // than threading the resolved axis through them, both apply the same
  // minTextSize-derived floor — whichever one ends up being the
  // font-determining dimension is then guaranteed to be large enough,
  // instead of only being guaranteed on vertical-axis surfaces (the bug
  // this fixes: on a horizontal-axis surface, a text/button element's box
  // height had only the generic 8px (or minTapTarget) floor, so its
  // enforced fontSize could end up taller than its own box and get
  // clipped by the renderer's overflow:hidden).
  if ((element.type === "text" || element.type === "button") && surface.minTextSize) {
    floor = Math.max(floor, surface.minTextSize / FONT_SIZE_TO_HEIGHT_RATIO);
  }
  return floor;
}

// ---------------------------------------------------------------------------
// Generic weighted distribution: given items with a weight and a hard
// minimum, split `available` space among them so it's filled exactly —
// shrinking proportionally to slack if the ideal split overflows, growing
// proportionally to weight if it underflows. Used for BOTH main-axis slot
// sizing and cross-axis member sizing (see resolve() below) — one
// algorithm, two call sites, rather than two bespoke ones.
// ---------------------------------------------------------------------------

interface DistributionItem {
  readonly weight: number;
  readonly min: number;
}

function distribute(items: readonly DistributionItem[], available: number): number[] {
  if (items.length === 0) return [];

  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
  const sizes = items.map((i) => Math.max(i.min, available * (i.weight / totalWeight)));

  let excess = sizes.reduce((a, b) => a + b, 0) - available;

  if (excess > 0.01) {
    // Shrink pass: reduce items above their floor, proportional to their
    // slack, iterating because clamping one item at its floor changes how
    // much slack the rest need to absorb.
    let flexible = items.map((_, i) => i);
    let guard = 0;
    while (excess > 0.01 && flexible.length > 0 && guard < 30) {
      const slackSum = flexible.reduce((s, i) => s + (sizes[i]! - items[i]!.min), 0);
      if (slackSum <= 0.01) break;
      const stillFlexible: number[] = [];
      for (const i of flexible) {
        const slack = sizes[i]! - items[i]!.min;
        const reduction = excess * (slack / slackSum);
        const next = sizes[i]! - reduction;
        if (next <= items[i]!.min + 0.01) {
          sizes[i] = items[i]!.min;
        } else {
          sizes[i] = next;
          stillFlexible.push(i);
        }
      }
      excess = sizes.reduce((a, b) => a + b, 0) - available;
      flexible = stillFlexible;
      guard++;
    }
  } else if (excess < -0.01) {
    // Grow pass: hand out leftover space proportional to weight.
    const leftover = -excess;
    for (let i = 0; i < sizes.length; i++) {
      sizes[i] = sizes[i]! + leftover * (items[i]!.weight / totalWeight);
    }
  }

  return sizes;
}

// ---------------------------------------------------------------------------
// Resolve
// ---------------------------------------------------------------------------

interface Slot {
  readonly priority: number;
  readonly members: AdElementSpec[];
}

function groupIntoSlots(elements: readonly AdElementSpec[]): Slot[] {
  const byPriority = new Map<number, AdElementSpec[]>();
  for (const element of elements) {
    const group = byPriority.get(element.priority);
    if (group) group.push(element);
    else byPriority.set(element.priority, [element]);
  }
  return [...byPriority.entries()]
    .sort(([a], [b]) => a - b)
    .map(([priority, members]) => ({ priority, members }));
}

function slotWeight(slot: Slot): number {
  return slot.members.reduce((sum, m) => sum + ROLE_WEIGHT[m.role], 0);
}

function slotMinMainSize(slot: Slot, surface: SurfaceProfile): number {
  return Math.max(...slot.members.map((m) => elementMinMainSize(m, surface)));
}

const ROLE_DEGRADATION_LABEL: Record<ElementRole, string> = {
  hero: "hero media",
  primary: "primary content",
  action: "action target",
  secondary: "secondary copy",
  branding: "branding",
};

/**
 * Produces a human-readable, ordered explanation of how `resolveLayout()`
 * would degrade *this spec* if it ever ran short of space — e.g. for a
 * "Degradation Order" panel in a UI. Deliberately spec-driven, not
 * surface-driven (it never takes a `SurfaceProfile`): it groups elements
 * into the same priority slots `resolveLayout()` itself uses
 * (`groupIntoSlots`), in the same order Pass 2 would consider dropping
 * them (least important last), so a caller never has to hand-author or
 * duplicate this narrative — it's read straight off the algorithm's own
 * grouping and verb rules:
 *   - Buttons are always "Preserve"d — a button sized down to its tap
 *     target floor is still fully functional, never truncated or reduced.
 *   - Priority-1 elements are always "Preserve"d — Pass 2 structurally
 *     never drops the last remaining slot.
 *   - Everything else is "Truncate"d if it's text (shrinking text below
 *     its ideal size loses legible content) or "Reduce"d if it's an image.
 *   - The single least-important slot additionally gets a trailing
 *     "Drop ... if required" step, describing Pass 2's actual fallback.
 */
export function describeDegradationOrder(spec: AdSpec): readonly string[] {
  const slots = groupIntoSlots(spec.elements);
  const steps: string[] = [];

  slots.forEach((slot, slotIndex) => {
    const isLeastImportantSlot = slotIndex === slots.length - 1;

    for (const member of slot.members) {
      const label = ROLE_DEGRADATION_LABEL[member.role];
      if (slot.priority === 1 || member.type === "button") {
        steps.push(`Preserve ${label}`);
      } else if (member.type === "text") {
        steps.push(`Truncate ${label}`);
      } else {
        steps.push(`Reduce ${label}`);
      }
    }

    if (isLeastImportantSlot && slot.priority > 1) {
      const labels = [...new Set(slot.members.map((m) => ROLE_DEGRADATION_LABEL[m.role]))].join(" / ");
      steps.push(`Drop ${labels} if required`);
    }
  });

  return steps;
}

export function resolveLayout(spec: AdSpec, surface: SurfaceProfile): ResolvedLayout {
  const startTime = performance.now();
  const safeArea = resolveSafeArea(surface.safeArea);
  const contentBox = {
    x: safeArea.left,
    y: safeArea.top,
    width: Math.max(0, surface.width - safeArea.left - safeArea.right),
    height: Math.max(0, surface.height - safeArea.top - safeArea.bottom),
  };

  // Axis: portrait-or-taller surfaces stack top-to-bottom; anything at
  // least as wide as it is tall flows left-to-right. A tie (square) goes
  // horizontal — an arbitrary but consistent, geometry-only choice.
  const axis: "vertical" | "horizontal" = contentBox.height > contentBox.width ? "vertical" : "horizontal";
  const mainSize = axis === "vertical" ? contentBox.height : contentBox.width;
  const crossSize = axis === "vertical" ? contentBox.width : contentBox.height;

  // --- Pass 1: group into priority slots, ordered most- to least-important.
  let slots = groupIntoSlots(spec.elements);

  // --- Pass 2: degrade. Drop whole slots (least important first) until
  // what remains can, at minimum size, fit along the main axis.
  const dropped: DroppedElement[] = [];
  while (slots.length > 1 && slots.reduce((sum, s) => sum + slotMinMainSize(s, surface), 0) > mainSize) {
    const leastImportant = slots[slots.length - 1]!;
    for (const member of leastImportant.members) {
      dropped.push({
        id: member.id,
        role: member.role,
        priority: member.priority,
        reason: `Dropped to fit: remaining elements' minimum sizes exceeded the ${mainSize.toFixed(0)}px available on the ${axis} axis.`,
      });
    }
    slots = slots.slice(0, -1);
  }

  const remainingMin = slots.reduce((sum, s) => sum + slotMinMainSize(s, surface), 0);
  if (remainingMin > mainSize) {
    const ids = slots.flatMap((s) => s.members.map((m) => m.id)).join(", ");
    throw new Error(
      `resolveLayout(): cannot fit even the highest-priority element(s) [${ids}] — their combined minimum size ` +
        `(${remainingMin.toFixed(0)}px) exceeds the ${mainSize.toFixed(0)}px available on the ${axis} axis for a ` +
        `${surface.width}x${surface.height} surface. Increase the surface size, raise its priority-1 element count, ` +
        `or relax minTapTarget/minTextSize.`,
    );
  }

  // --- Pass 3: size slots along the main axis.
  const slotSizes = distribute(
    slots.map((s) => ({ weight: slotWeight(s), min: slotMinMainSize(s, surface) })),
    mainSize,
  );

  // --- Pass 4: size members within each slot along the cross axis, and
  // convert everything to absolute (x, y, width, height).
  //
  // Rounding note: rounding each element's width/height independently
  // would let adjacent elements' rounded edges disagree by up to 1px —
  // e.g. a slot spanning [891.79, 1275.38] rounds fine as a pair, but
  // round(891.79)=892 and round(383.59)=384 (its naively-rounded height)
  // sum to a bottom edge of 1276, one pixel past round(1275.38)=1275,
  // overlapping whatever starts there. So we round *boundaries*
  // (cumulative cursor positions) and derive each size as the difference
  // between two consecutive rounded boundaries — that guarantees
  // touching elements' rounded edges always match exactly. The cursors
  // themselves stay float-precise and only get rounded at the moment
  // they're used, so error never accumulates across slots.
  const visible: ResolvedElementLayout[] = [];
  const degradation: DegradationEntry[] = dropped.map((d) => ({
    elementId: d.id,
    role: d.role,
    priority: d.priority,
    action: "dropped",
    reason: d.reason,
  }));
  let mainCursor = axis === "vertical" ? contentBox.y : contentBox.x;

  slots.forEach((slot, slotIndex) => {
    const slotMainSize = slotSizes[slotIndex]!;
    const mainStart = Math.round(mainCursor);
    const mainEnd = Math.round(mainCursor + slotMainSize);
    const roundedSlotMainSize = mainEnd - mainStart;

    // Used below (in addition to the rounded pixels every consumer sees)
    // to tell whether the slot's main-axis size is pinned at its floor —
    // shared by every member of the slot, since they all span the same
    // main-axis band.
    const slotFloor = slotMinMainSize(slot, surface);
    const mainAxisAtFloor = slotMainSize - slotFloor < 0.5;

    // Cross-axis feasibility: members sharing a slot have no further
    // priority to degrade by (they're co-equal), so if their combined
    // hard-constraint floor doesn't fit the cross dimension, that's a
    // genuine spec/surface mismatch (e.g. a 60px minTapTarget button in a
    // 50px-tall banner) — report it clearly rather than let `distribute()`
    // silently return sizes that overflow the surface.
    const crossMinSum = slot.members.reduce((sum, m) => sum + elementMinCrossSize(m, surface), 0);
    if (crossMinSum > crossSize + 0.5) {
      throw new Error(
        `resolveLayout(): element(s) sharing priority ${slot.priority} [${slot.members.map((m) => m.id).join(", ")}] ` +
          `need at least ${crossMinSum.toFixed(0)}px combined on the cross axis, but only ${crossSize.toFixed(0)}px ` +
          `is available on a ${surface.width}x${surface.height} surface` +
          `${surface.touchOnly ? ` (minTapTarget=${surface.minTapTarget})` : ""}. Give them different priorities so ` +
          `they don't have to share space, enlarge the surface, or relax the constraint.`,
      );
    }

    const memberCrossSizes = distribute(
      slot.members.map((m) => ({ weight: ROLE_WEIGHT[m.role], min: elementMinCrossSize(m, surface) })),
      crossSize,
    );

    let crossCursor = axis === "vertical" ? contentBox.x : contentBox.y;

    slot.members.forEach((member, memberIndex) => {
      const memberCrossSize = memberCrossSizes[memberIndex]!;
      const crossStart = Math.round(crossCursor);
      const crossEnd = Math.round(crossCursor + memberCrossSize);
      const roundedMemberCrossSize = crossEnd - crossStart;

      const rect =
        axis === "vertical"
          ? { x: crossStart, y: mainStart, width: roundedMemberCrossSize, height: roundedSlotMainSize }
          : { x: mainStart, y: crossStart, width: roundedSlotMainSize, height: roundedMemberCrossSize };

      const heightForFont = axis === "vertical" ? roundedSlotMainSize : roundedMemberCrossSize;
      const minTextFloor = surface.minTextSize ?? 0;
      const fontSize = Math.max(minTextFloor, Math.round(heightForFont * FONT_SIZE_TO_HEIGHT_RATIO));

      const crossFloor = elementMinCrossSize(member, surface);
      const crossAxisAtFloor = memberCrossSize - crossFloor < 0.5;
      const atFloor = mainAxisAtFloor || crossAxisAtFloor;

      visible.push({
        id: member.id,
        type: member.type,
        role: member.role,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        fontSize,
        zIndex: visible.length,
        atFloor,
      });

      if (atFloor) {
        const axisDescription = mainAxisAtFloor && crossAxisAtFloor ? "both axes" : mainAxisAtFloor ? "its main axis" : "its cross axis";
        degradation.push({
          elementId: member.id,
          role: member.role,
          priority: member.priority,
          action: member.type === "text" ? "truncated" : "shrunk",
          reason: `Sized at its minimum hard-constraint floor on ${axisDescription} to fit the available space — this is as small as it's allowed to get before being dropped instead.`,
        });
      }

      crossCursor += memberCrossSize;
    });

    mainCursor += slotMainSize;
  });

  let overlapCount = 0;
  let clippedCount = 0;
  for (const el of visible) {
    if (el.x < 0 || el.y < 0 || el.x + el.width > surface.width || el.y + el.height > surface.height) {
      clippedCount++;
    }
  }
  for (let i = 0; i < visible.length; i++) {
    for (let j = i + 1; j < visible.length; j++) {
      const a = visible[i]!;
      const b = visible[j]!;
      const overlapsX = a.x < b.x + b.width && b.x < a.x + a.width;
      const overlapsY = a.y < b.y + b.height && b.y < a.y + a.height;
      if (overlapsX && overlapsY) overlapCount++;
    }
  }

  const degradedVisibleCount = degradation.length - dropped.length;
  const fitScore = Math.max(0, Math.min(100, Math.round(100 - dropped.length * 15 - degradedVisibleCount * 5)));
  const strategy = `${axis === "vertical" ? "vertical-stack" : "horizontal-flow"}${dropped.length > 0 ? "-degraded" : ""}`;

  return {
    surfaceWidth: surface.width,
    surfaceHeight: surface.height,
    axis,
    safeArea,
    visible,
    dropped,
    degradation,
    diagnostics: {
      resolvedInMs: performance.now() - startTime,
      overlapCount,
      clippedCount,
      fitScore,
      strategy,
    },
  };
}
