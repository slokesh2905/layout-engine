/**
 * Phase E (half 1/2): rasterizes a resolved layout to an actual PNG,
 * client-side, no dependency — an offscreen `<canvas>` and the platform's
 * own 2D drawing API are enough, the same "the browser already does this,
 * don't add a library" stance this codebase already takes elsewhere (see
 * ui/Icon.tsx's hand-drawn SVGs instead of an icon package).
 *
 * Every element's box, in resolved surface pixels, comes straight from
 * ./renderLayout.ts's `layoutToRenderableElements()` — nothing here decides
 * a position or size. This file only decides how to *paint* each kind of
 * box, matching what PreviewCanvas.css already does on screen as closely as
 * a static raster reasonably can:
 *   - "text": left-aligned, vertically centered, ellipsis-truncated to fit
 *     its box (mirrors CSS `text-overflow: ellipsis` on `.resolved-element__text`).
 *   - "button": a filled capsule (border-radius: 999px, i.e. height/2) with
 *     a centered, hard-clipped label (no ellipsis — matches
 *     `.resolved-element__button-label`, which has no `text-overflow` of
 *     its own, just its ancestor's `overflow: hidden`).
 *   - "image": drawn with the same crop math CSS `object-fit: cover` uses,
 *     inside a 4px-rounded box; a missing/failed image falls back to the
 *     same flat placeholder + alt text `ResolvedElementView.tsx` shows on
 *     screen (not the diagonal-stripe pattern — a flat tile is enough
 *     fidelity for an exported file and isn't worth the extra drawing code).
 */
import { AD_BOARD_COLORS, AD_BOARD_FONT_FAMILY, IMAGE_CORNER_RADIUS, layoutToRenderableElements, loadImage, textColorFor, textWeightFor } from "./renderLayout.js";
import type { RenderableElement } from "./renderLayout.js";
import { LINE_HEIGHT_RATIO, measurerFromContext, wrapTextToFit } from "./textMeasure.js";
import type { StudioResolution } from "./types.js";

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/** Binary-searches the longest prefix (plus "…") of `text` that fits `maxWidth` — mirrors CSS `text-overflow: ellipsis`. */
function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (maxWidth <= 0 || ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = "…";
  if (ctx.measureText(ellipsis).width > maxWidth) return "";
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = text.slice(0, mid) + ellipsis;
    if (ctx.measureText(candidate).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 ? ellipsis : text.slice(0, lo) + ellipsis;
}

/**
 * Mirrors ResolvedElementView.tsx's on-screen wrapping exactly: same
 * `wrapTextToFit()`, same box (minus the 2px each-side padding), same
 * genuine `ctx.measureText()`-backed measurer — just drawn as filled text
 * instead of DOM spans. Multi-line now; single-line-with-ellipsis was the
 * old behavior when the resolver's box only ever fit one line anyway, so
 * short text still renders identically to before.
 */
function drawTextElement(ctx: CanvasRenderingContext2D, el: RenderableElement): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(el.x, el.y, el.width, el.height);
  ctx.clip();
  const weight = textWeightFor(el.role);
  ctx.fillStyle = textColorFor(el.role);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const paddingX = 2; // matches `.resolved-element--text { padding: 0 2px; }`
  const measure = measurerFromContext(ctx, weight, AD_BOARD_FONT_FAMILY);
  const wrapped = wrapTextToFit(el.content, el.width - paddingX * 2, el.height, el.fontSize, measure);
  ctx.font = `${weight} ${wrapped.fontSize}px ${AD_BOARD_FONT_FAMILY}`;
  const lineHeight = wrapped.fontSize * LINE_HEIGHT_RATIO;
  const blockHeight = wrapped.lines.length * lineHeight;
  let y = el.y + el.height / 2 - blockHeight / 2 + lineHeight / 2;
  wrapped.lines.forEach((line, i) => {
    const isLast = i === wrapped.lines.length - 1;
    // Last kept line of a genuinely-truncated block gets the same
    // binary-searched "…" treatment the old single-line renderer always
    // used, rather than a possibly-too-wide `line + "…"` concatenation.
    const label = isLast && wrapped.truncated ? truncateToWidth(ctx, `${line}…`, el.width - paddingX * 2) : line;
    ctx.fillText(label, el.x + paddingX, y);
    y += lineHeight;
  });
  ctx.restore();
}

function drawButtonElement(ctx: CanvasRenderingContext2D, el: RenderableElement): void {
  roundedRectPath(ctx, el.x, el.y, el.width, el.height, el.height / 2);
  ctx.fillStyle = AD_BOARD_COLORS.ink;
  ctx.fill();

  ctx.save();
  ctx.clip(); // reuses the capsule path above — hard-clips the label, no ellipsis, matching the CSS
  ctx.font = `600 ${el.fontSize}px ${AD_BOARD_FONT_FAMILY}`;
  ctx.fillStyle = AD_BOARD_COLORS.paper;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(el.content, el.x + el.width / 2, el.y + el.height / 2);
  ctx.restore();
}

function drawImagePlaceholder(ctx: CanvasRenderingContext2D, el: RenderableElement): void {
  roundedRectPath(ctx, el.x, el.y, el.width, el.height, IMAGE_CORNER_RADIUS);
  ctx.fillStyle = AD_BOARD_COLORS.paperDim;
  ctx.fill();
  ctx.strokeStyle = AD_BOARD_COLORS.paperLine;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.save();
  ctx.clip();
  ctx.font = `500 10px ${AD_BOARD_FONT_FAMILY}`;
  ctx.fillStyle = AD_BOARD_COLORS.inkDim;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  const label = truncateToWidth(ctx, el.content, el.width - 8);
  ctx.fillText(label, el.x + el.width / 2, el.y + el.height / 2);
  ctx.restore();
}

/** Same crop math as CSS `object-fit: cover`: scale to fill the box on the larger axis, then center-crop the overflow. */
function coverCrop(naturalWidth: number, naturalHeight: number, boxWidth: number, boxHeight: number) {
  const scale = Math.max(boxWidth / naturalWidth, boxHeight / naturalHeight);
  const sWidth = boxWidth / scale;
  const sHeight = boxHeight / scale;
  return { sx: (naturalWidth - sWidth) / 2, sy: (naturalHeight - sHeight) / 2, sWidth, sHeight };
}

async function drawImageElement(ctx: CanvasRenderingContext2D, el: RenderableElement): Promise<void> {
  if (!el.src) {
    drawImagePlaceholder(ctx, el);
    return;
  }
  let img: HTMLImageElement;
  try {
    img = await loadImage(el.src);
  } catch {
    drawImagePlaceholder(ctx, el);
    return;
  }
  const { sx, sy, sWidth, sHeight } = coverCrop(img.naturalWidth, img.naturalHeight, el.width, el.height);
  ctx.save();
  roundedRectPath(ctx, el.x, el.y, el.width, el.height, IMAGE_CORNER_RADIUS);
  ctx.clip();
  ctx.drawImage(img, sx, sy, sWidth, sHeight, el.x, el.y, el.width, el.height);
  ctx.restore();
}

/**
 * Renders `resolution`'s current layout to a PNG `Blob`, sized exactly to
 * the surface's own pixel dimensions (`layout.surfaceWidth/Height` — the
 * same numbers the resolver placed every element against, not the
 * on-screen zoomed/fit preview size). Rejects only if the canvas itself
 * can't produce a blob (e.g. a canvas-hostile browser policy) — a failed
 * individual image load degrades to the placeholder tile rather than
 * failing the whole export.
 */
export async function renderLayoutToPngBlob(resolution: StudioResolution): Promise<Blob> {
  const { surfaceWidth, surfaceHeight } = resolution.layout;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(surfaceWidth));
  canvas.height = Math.max(1, Math.round(surfaceHeight));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("renderLayoutToPngBlob(): this browser couldn't provide a 2D canvas context.");

  ctx.fillStyle = AD_BOARD_COLORS.paper;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const el of layoutToRenderableElements(resolution)) {
    if (el.type === "image") {
      await drawImageElement(ctx, el);
    } else if (el.type === "button") {
      drawButtonElement(ctx, el);
    } else {
      drawTextElement(ctx, el);
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("renderLayoutToPngBlob(): canvas.toBlob() returned null."));
    }, "image/png");
  });
}
