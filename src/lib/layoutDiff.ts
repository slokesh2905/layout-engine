/**
 * A real element-by-element diff between two resolutions of the *same*
 * effective spec — same local edits, same roster — against two different
 * surfaces. Built for Compare mode (see LayoutStudioPage.tsx, which gets
 * both resolutions from ../lib/localResolve.ts's `resolveAcrossSurfaces()`,
 * already exactly this: one effective spec resolved against a list of real
 * surfaces, sharing one `elements` roster so ids line up perfectly between
 * the two sides being diffed).
 *
 * Deliberately its own file rather than living in ./localResolve.ts: that
 * file's own doc comment scopes it to producing a `StudioResolution` by
 * re-resolving through the real resolver — it never inspects two already-
 * resolved layouts against each other. Diffing is a distinct, read-only
 * concern layered on top, and never calls the resolver itself.
 */
import type { ElementRole } from "../spec.js";
import type { ResolvedLayout, StudioElement } from "./types.js";

export type ElementDiffStatus = "same" | "changed" | "dropped-in-a" | "dropped-in-b" | "dropped-in-both";

export interface ElementDiffEntry {
  readonly elementId: string;
  readonly role: ElementRole;
  readonly content: string;
  /**
   * "dropped-in-a" means this element is visible in B but was dropped in
   * A — i.e. it's "only in B". "dropped-in-b" is the mirror: visible in A,
   * dropped in B, "only in A". (Named after which side lost the element,
   * not which side kept it — read the summary counts below for the
   * human-facing framing.)
   */
  readonly status: ElementDiffStatus;
  readonly widthA: number | null;
  readonly heightA: number | null;
  readonly fontSizeA: number | null;
  readonly widthB: number | null;
  readonly heightB: number | null;
  readonly fontSizeB: number | null;
  /** b - a, only when the element is visible in both. */
  readonly widthDelta: number | null;
  readonly heightDelta: number | null;
  readonly fontSizeDelta: number | null;
}

export interface LayoutDiffSummary {
  /** Visible in B, dropped in A — i.e. present only in B. */
  readonly onlyInB: number;
  /** Visible in A, dropped in B — i.e. present only in A. */
  readonly onlyInA: number;
  readonly droppedInBoth: number;
  readonly changed: number;
  readonly same: number;
  /** layoutB.diagnostics.fitScore - layoutA.diagnostics.fitScore. */
  readonly fitScoreDelta: number;
}

export interface LayoutDiff {
  readonly entries: readonly ElementDiffEntry[];
  readonly summary: LayoutDiffSummary;
}

// Below this, a width/height/fontSize difference is float noise from the
// resolver's proportional-distribution math (Pass 4), not a real visual
// change worth flagging as "changed".
const SIZE_EPSILON = 0.5;

export function diffResolutions(elements: readonly StudioElement[], layoutA: ResolvedLayout, layoutB: ResolvedLayout): LayoutDiff {
  const visibleA = new Map(layoutA.visible.map((el) => [el.id, el] as const));
  const visibleB = new Map(layoutB.visible.map((el) => [el.id, el] as const));

  const entries: ElementDiffEntry[] = elements.map((element) => {
    const a = visibleA.get(element.id);
    const b = visibleB.get(element.id);

    if (!a && !b) {
      return {
        elementId: element.id,
        role: element.role,
        content: element.content,
        status: "dropped-in-both",
        widthA: null,
        heightA: null,
        fontSizeA: null,
        widthB: null,
        heightB: null,
        fontSizeB: null,
        widthDelta: null,
        heightDelta: null,
        fontSizeDelta: null,
      };
    }
    if (!a) {
      return {
        elementId: element.id,
        role: element.role,
        content: element.content,
        status: "dropped-in-a",
        widthA: null,
        heightA: null,
        fontSizeA: null,
        widthB: b!.width,
        heightB: b!.height,
        fontSizeB: b!.fontSize,
        widthDelta: null,
        heightDelta: null,
        fontSizeDelta: null,
      };
    }
    if (!b) {
      return {
        elementId: element.id,
        role: element.role,
        content: element.content,
        status: "dropped-in-b",
        widthA: a.width,
        heightA: a.height,
        fontSizeA: a.fontSize,
        widthB: null,
        heightB: null,
        fontSizeB: null,
        widthDelta: null,
        heightDelta: null,
        fontSizeDelta: null,
      };
    }

    const widthDelta = b.width - a.width;
    const heightDelta = b.height - a.height;
    const fontSizeDelta = b.fontSize - a.fontSize;
    const changed = Math.abs(widthDelta) > SIZE_EPSILON || Math.abs(heightDelta) > SIZE_EPSILON || Math.abs(fontSizeDelta) > SIZE_EPSILON;

    return {
      elementId: element.id,
      role: element.role,
      content: element.content,
      status: changed ? "changed" : "same",
      widthA: a.width,
      heightA: a.height,
      fontSizeA: a.fontSize,
      widthB: b.width,
      heightB: b.height,
      fontSizeB: b.fontSize,
      widthDelta,
      heightDelta,
      fontSizeDelta,
    };
  });

  const summary: LayoutDiffSummary = {
    onlyInB: entries.filter((e) => e.status === "dropped-in-a").length,
    onlyInA: entries.filter((e) => e.status === "dropped-in-b").length,
    droppedInBoth: entries.filter((e) => e.status === "dropped-in-both").length,
    changed: entries.filter((e) => e.status === "changed").length,
    same: entries.filter((e) => e.status === "same").length,
    fitScoreDelta: layoutB.diagnostics.fitScore - layoutA.diagnostics.fitScore,
  };

  return { entries, summary };
}
