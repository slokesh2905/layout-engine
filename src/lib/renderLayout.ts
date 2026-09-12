/**
 * Shared geometry + palette for turning a resolved layout into an actual
 * picture — used by both ./exportPng.ts (rasterized) and ./exportSvg.ts
 * (vector, Figma-importable). Neither exporter recomputes a position, size,
 * or fontSize; both walk the exact same `ResolvedElementLayout[]` the
 * resolver already produced, joined with the matching `StudioElement` for
 * the parts the resolver doesn't carry (content, image `src`) — the same
 * join `ResolvedElementView.tsx` already does per-element for the on-screen
 * canvas, just done once up front here for a whole layout.
 *
 * The color/font constants below are deliberately NOT read from the app's
 * CSS custom properties (`--paper`, `--ink`, etc., in styles/tokens.css) —
 * those are only reachable from a live, mounted DOM node via
 * `getComputedStyle()`, and export needs to work even before that dance.
 * They're hand-copied here instead, matching the doc comment already on
 * those tokens: "the ad board is always paper, independent of the app
 * theme" — export honors the exact same invariant on purpose, so a PNG or
 * SVG looks the same regardless of whether the studio itself is currently
 * in dark or light mode.
 */
import type { AdElementSpec, ElementRole } from "../spec.js";
import type { StudioResolution } from "./types.js";

export const AD_BOARD_COLORS = {
  paper: "#eceae4",
  paperDim: "#e2ded4",
  paperLine: "#d3cebd",
  ink: "#17171a",
  inkDim: "rgba(23, 23, 26, 0.55)",
} as const;

export const AD_BOARD_FONT_FAMILY = "Inter, system-ui, sans-serif";

/** Matches `.resolved-element--image`'s `border-radius: var(--radius-sm)` (4px) in PreviewCanvas.css. */
export const IMAGE_CORNER_RADIUS = 4;

export interface RenderableElement {
  readonly id: string;
  readonly type: AdElementSpec["type"];
  readonly role: ElementRole;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fontSize: number;
  readonly content: string;
  readonly src: string | undefined;
}

/**
 * `resolution.layout.visible` already carries paint order (ascending
 * `zIndex`, "slot by slot" per resolver.ts's own doc comment) — iterating
 * it in array order is enough to paint back-to-front correctly, no sort
 * needed.
 */
export function layoutToRenderableElements(resolution: StudioResolution): readonly RenderableElement[] {
  const byId = new Map(resolution.elements.map((el) => [el.id, el] as const));
  return resolution.layout.visible.map((visible) => {
    const source = byId.get(visible.id);
    return {
      id: visible.id,
      type: visible.type,
      role: visible.role,
      x: visible.x,
      y: visible.y,
      width: visible.width,
      height: visible.height,
      fontSize: visible.fontSize,
      content: source?.content ?? "",
      src: source?.src,
    };
  });
}

/** Text color for a "text" element — mirrors `.resolved-element--role-secondary .resolved-element__text` in PreviewCanvas.css. */
export function textColorFor(role: ElementRole): string {
  return role === "secondary" ? AD_BOARD_COLORS.inkDim : AD_BOARD_COLORS.ink;
}

/** Text weight for a "text" element — same secondary-role distinction as `textColorFor`. */
export function textWeightFor(role: ElementRole): number {
  return role === "secondary" ? 500 : 600;
}

export const DEFAULT_IMAGE_LOAD_TIMEOUT_MS = 8000;

/**
 * Loads `src` as an `HTMLImageElement`, or rejects — used by both
 * ./exportPng.ts (to actually draw the pixels) and ./exportSvg.ts (to
 * decide whether a `src` is real enough to embed as an `<image>`, or should
 * fall back to the same placeholder tile `ResolvedElementView.tsx` already
 * shows on screen for a `src` that doesn't resolve, e.g. the built-in demo
 * specs' `/aurora-bottle.png`-style paths — see spec.ts's `elementSrc()`).
 *
 * Guarded with a timeout: `onload`/`onerror` are guaranteed to fire
 * eventually for a `data:` URI (any user-uploaded image, per Phase B — no
 * network involved at all), but a `src` pointing at a real, slow, or
 * unresponsive external URL could otherwise hang an export indefinitely
 * with no way out. A never-resolving load is treated exactly like a failed
 * one — this is what the export was already going to do for it anyway.
 */
export function loadImage(src: string, timeoutMs = DEFAULT_IMAGE_LOAD_TIMEOUT_MS): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error(`Timed out loading image after ${timeoutMs}ms: ${src.slice(0, 64)}`)), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`Couldn't load image: ${src.slice(0, 64)}`));
    };
    img.src = src;
  });
}
