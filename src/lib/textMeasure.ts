/**
 * Real text-measurement-aware wrapping, layered entirely on top of the
 * resolver's output — never inside it. ../resolver.ts is deliberately
 * framework-agnostic (no DOM at all, per its own doc comment) and its
 * `fontSize` is a coarse, pure function of box height
 * (`heightForFont * FONT_SIZE_TO_HEIGHT_RATIO`) that both the 16-test
 * baseline and constraints.ts's "Minimum text size" hard-constraint check
 * depend on staying exactly as-is — nothing here changes that value or
 * reaches back into the resolver.
 *
 * What this DOES do: given the resolver's own box + fontSize, use real
 * measured text widths (a live `CanvasRenderingContext2D.measureText()`,
 * not a formula) to word-wrap the actual content into as many lines as
 * genuinely fit the box, shrinking the *display* fontSize only as a last
 * resort when even wrapping can't make it fit — replacing what used to be
 * an unconditional single line clipped with an ellipsis the instant it
 * overflowed. Every function below takes measurement as an injected
 * callback rather than owning a canvas itself, so this stays pure and
 * unit-testable (no real browser needed) — see the two real measurers at
 * the bottom for the browser-side callers (ResolvedElementView.tsx,
 * exportPng.ts) that actually provide one.
 */

export type MeasureWidth = (text: string, fontSizePx: number) => number;

export interface WrapResult {
  readonly fontSize: number;
  readonly lines: readonly string[];
  /** True if even the smallest attempted fontSize couldn't fit every wrapped line within the box's height. */
  readonly truncated: boolean;
}

// Mirrors `.resolved-element__text { line-height: 1.1 }` in
// PreviewCanvas.css — kept in sync there, not read from computed styles,
// same "ad board is always paper, independent of app theme" reasoning
// renderLayout.ts's own doc comment already gives for hand-copying colors.
// Exported so exportPng.ts/exportSvg.ts can position lines identically
// instead of re-guessing the ratio.
export const LINE_HEIGHT_RATIO = 1.1;

// Never shrink the display fontSize below this, no matter how little of
// the content that would let fit — a font this small is illegible on any
// surface, so past this point wrapping stops shrinking and starts
// truncating whole lines instead (see the `truncated` branch below).
const MIN_FONT_SIZE = 8;

const FONT_SIZE_STEP = 1;

/**
 * Exported (beyond wrapTextToFit's own internal use) for exportSvg.ts:
 * that renderer's explicit design principle is to never drop text content
 * from the exported node — only wrapTextToFit's *own* vertical-overflow
 * truncation (the rare case where even MIN_FONT_SIZE can't fit every line
 * in the box) would do that, so exportSvg.ts re-wraps at the settled
 * fontSize with no line cap in that one case, to keep the full string in
 * the SVG regardless of vertical overflow (its `<clipPath>` already crops
 * the visual result, exactly as it always has for horizontal overflow).
 */
export function wrapAtFontSize(text: string, boxWidth: number, fontSizePx: number, measureWidth: MeasureWidth): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = words[0]!;
  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (measureWidth(candidate, fontSizePx) <= boxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i]!;
    }
  }
  lines.push(current);
  return lines;
}

/**
 * Finds the largest fontSize at or below `startFontSize` (stepping down by
 * 1px) whose real, measured word-wrap of `text` fits within
 * (boxWidth, boxHeight) — genuinely re-measuring and re-wrapping at every
 * candidate size, never a formula. `startFontSize` — the resolver's own
 * box-height-driven estimate — is always the ceiling: this only ever
 * refines it *down* for content that estimate didn't account for (a long
 * headline in a narrow box), never second-guesses it upward.
 */
export function wrapTextToFit(text: string, boxWidth: number, boxHeight: number, startFontSize: number, measureWidth: MeasureWidth): WrapResult {
  const startRounded = Math.max(1, Math.round(startFontSize));
  const floor = Math.min(MIN_FONT_SIZE, startRounded);

  let fontSize = startRounded;
  let lines = wrapAtFontSize(text, boxWidth, fontSize, measureWidth);

  while (lines.length * fontSize * LINE_HEIGHT_RATIO > boxHeight && fontSize > floor) {
    fontSize -= FONT_SIZE_STEP;
    lines = wrapAtFontSize(text, boxWidth, fontSize, measureWidth);
  }

  if (lines.length * fontSize * LINE_HEIGHT_RATIO <= boxHeight + 0.5) {
    return { fontSize, lines, truncated: false };
  }

  // Even at the floor, the wrapped block is taller than the box — keep as
  // many whole lines as actually fit and mark the rest truncated (an
  // ellipsis on the last kept line is the caller's job, same as the old
  // single-line behavior, just now only after genuinely trying to wrap
  // first rather than truncating on line one).
  const maxLines = Math.max(1, Math.floor(boxHeight / (fontSize * LINE_HEIGHT_RATIO)));
  return { fontSize, lines: lines.slice(0, maxLines), truncated: lines.length > maxLines };
}

// ---------------------------------------------------------------------------
// Real browser-side measurers — the only two places that actually own a
// canvas. Everything above this line runs identically in a test as it does
// in a real browser; everything below it only makes sense in one.
// ---------------------------------------------------------------------------

let sharedCanvas: HTMLCanvasElement | null = null;
let sharedCtx: CanvasRenderingContext2D | null = null;

/**
 * A `MeasureWidth` backed by a single reused offscreen `<canvas>` — for
 * ResolvedElementView.tsx (the on-screen preview), which doesn't otherwise
 * have a canvas lying around the way exportPng.ts does. Returns a
 * conservative average-character-width estimate instead of throwing if no
 * canvas is available at all (e.g. a non-browser test runner) — real
 * measurement always wins when it can run; this is just a floor for when
 * it genuinely can't.
 */
export function createCanvasMeasurer(fontWeight: number, fontFamily: string): MeasureWidth {
  return (text, fontSizePx) => {
    if (!sharedCtx) {
      if (typeof document === "undefined") return text.length * fontSizePx * 0.55;
      sharedCanvas = document.createElement("canvas");
      sharedCtx = sharedCanvas.getContext("2d");
      if (!sharedCtx) return text.length * fontSizePx * 0.55;
    }
    sharedCtx.font = `${fontWeight} ${fontSizePx}px ${fontFamily}`;
    return sharedCtx.measureText(text).width;
  };
}

/** A `MeasureWidth` backed by a caller-supplied context that already has real content on it (exportPng.ts) — avoids spinning up a second canvas just to measure. */
export function measurerFromContext(ctx: CanvasRenderingContext2D, fontWeight: number, fontFamily: string): MeasureWidth {
  return (text, fontSizePx) => {
    ctx.font = `${fontWeight} ${fontSizePx}px ${fontFamily}`;
    return ctx.measureText(text).width;
  };
}
