/**
 * Phase E (half 2/2): renders a resolved layout to real SVG markup — the
 * actual Figma-compatible export. Figma imports a dropped/pasted `.svg` as
 * native, editable layers (real text nodes, real image fills), not a
 * flattened picture, so this is a genuinely different artifact from
 * ./exportPng.ts's raster — same geometry, walked once via
 * ./renderLayout.ts's `layoutToRenderableElements()`, emitted as markup
 * instead of pixels.
 *
 * Deliberate departure from the PNG renderer: text content is emitted in
 * full, never ellipsis-truncated. `<clipPath>` is what keeps the *visual*
 * result matching what's on screen right now (long text still appears cut
 * off at the element's box, exactly like the resolved layout shows it) —
 * but the underlying text node a Figma user gets is the complete string,
 * not a truncated one, which matters the moment they resize that layer or
 * just want to read/reuse the copy. A rasterized PNG has no such
 * distinction to make; an editable format does.
 *
 * Async, on purpose, even though building SVG markup itself needs no
 * awaiting: every image `src` is verified with the same `loadImage()`
 * ./exportPng.ts uses before it's trusted enough to embed as an `<image>`.
 * Without this check, the built-in demo specs' placeholder paths (e.g.
 * "/aurora-bottle.png" — never real files, see spec.ts's `elementSrc()`
 * doc comment) would round-trip into a *broken* image reference in the
 * exported file instead of the same placeholder tile the PNG export (and
 * the on-screen canvas) already fall back to — a real fidelity mismatch
 * between the two exporters that a synchronous version can't detect.
 */
import {
  AD_BOARD_COLORS,
  AD_BOARD_FONT_FAMILY,
  DEFAULT_IMAGE_LOAD_TIMEOUT_MS,
  IMAGE_CORNER_RADIUS,
  layoutToRenderableElements,
  loadImage,
  textColorFor,
  textWeightFor,
} from "./renderLayout.js";
import { LINE_HEIGHT_RATIO, createCanvasMeasurer, wrapAtFontSize, wrapTextToFit } from "./textMeasure.js";
import type { StudioResolution } from "./types.js";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function imagePlaceholderMarkup(el: { x: number; y: number; width: number; height: number; content: string }, clipId: string): string[] {
  return [
    `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="${IMAGE_CORNER_RADIUS}" ` +
      `fill="${AD_BOARD_COLORS.paperDim}" stroke="${AD_BOARD_COLORS.paperLine}" />`,
    `<text x="${el.x + el.width / 2}" y="${el.y + el.height / 2}" font-family="${AD_BOARD_FONT_FAMILY}" font-size="10" ` +
      `font-weight="500" fill="${AD_BOARD_COLORS.inkDim}" dominant-baseline="middle" text-anchor="middle" ` +
      `clip-path="url(#${clipId})">${escapeXml(el.content)}</text>`,
  ];
}

/**
 * Renders `resolution`'s current layout to a standalone SVG document string
 * — sized to the surface's own pixel dimensions
 * (`layout.surfaceWidth/Height`), matching ./exportPng.ts.
 *
 * `imageLoadTimeoutMs` (default: `renderLayout.ts`'s own default) exists
 * mainly so tests can shorten it — every image element's `src` is checked
 * concurrently via `Promise.all`, not one at a time, so real exports never
 * pay more than the single slowest image's load time regardless of how
 * many images the spec has.
 */
export async function renderLayoutToSvgString(
  resolution: StudioResolution,
  imageLoadTimeoutMs: number = DEFAULT_IMAGE_LOAD_TIMEOUT_MS,
): Promise<string> {
  const { surfaceWidth, surfaceHeight } = resolution.layout;
  const width = Math.max(1, Math.round(surfaceWidth));
  const height = Math.max(1, Math.round(surfaceHeight));

  const elements = layoutToRenderableElements(resolution);
  const imageLoadOk = await Promise.all(
    elements.map((el) => (el.type === "image" && el.src ? loadImage(el.src, imageLoadTimeoutMs).then(() => true, () => false) : Promise.resolve(false))),
  );

  const defs: string[] = [];
  const body: string[] = [];

  elements.forEach((el, index) => {
    // Synthetic, index-based ids — an element's own spec id (el.id) isn't
    // guaranteed to be a valid SVG/XML identifier (spaces, punctuation,
    // leading digits are all legal AdElementSpec ids but not legal here).
    const clipId = `clip-${index}`;
    const clipRadius = el.type === "image" ? IMAGE_CORNER_RADIUS : 0;
    defs.push(`<clipPath id="${clipId}"><rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="${clipRadius}" /></clipPath>`);

    if (el.type === "text") {
      // Same real, measured wrap ResolvedElementView.tsx/exportPng.ts use —
      // emitted as sibling <tspan>s inside one <text> node rather than a
      // single line. Preserves this file's own "never truncate content"
      // principle: in the ordinary case these tspans' text nodes concatenate
      // back to the exact original string (just split at word boundaries),
      // and even in wrapTextToFit's rare vertical-overflow case, `lines`
      // below re-derives every wrapped line at the settled font size (see
      // wrapAtFontSize's doc comment in textMeasure.ts) instead of keeping
      // wrapTextToFit's own truncated subset — so no text content is ever
      // dropped from the exported node, only visually cropped by the
      // existing <clipPath>, exactly as before for horizontal overflow.
      const weight = textWeightFor(el.role);
      const measure = createCanvasMeasurer(weight, AD_BOARD_FONT_FAMILY);
      const wrapped = wrapTextToFit(el.content, el.width - 4, el.height, el.fontSize, measure);
      const lines = wrapped.truncated ? wrapAtFontSize(el.content, el.width - 4, wrapped.fontSize, measure) : wrapped.lines;
      const lineHeight = wrapped.fontSize * LINE_HEIGHT_RATIO;
      const blockHeight = lines.length * lineHeight;
      const startY = el.y + el.height / 2 - blockHeight / 2 + lineHeight / 2;
      const tspans = lines
        .map((line, i) => `<tspan x="${el.x + 2}" y="${startY + i * lineHeight}" dominant-baseline="middle">${escapeXml(line)}</tspan>`)
        .join("");
      body.push(
        `<text font-family="${AD_BOARD_FONT_FAMILY}" font-size="${wrapped.fontSize}" ` +
          `font-weight="${weight}" fill="${textColorFor(el.role)}" text-anchor="start" ` +
          `clip-path="url(#${clipId})">${tspans}</text>`,
      );
    } else if (el.type === "button") {
      const capsuleRadius = el.height / 2;
      body.push(
        `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="${capsuleRadius}" ry="${capsuleRadius}" fill="${AD_BOARD_COLORS.ink}" />`,
      );
      body.push(
        `<text x="${el.x + el.width / 2}" y="${el.y + el.height / 2}" font-family="${AD_BOARD_FONT_FAMILY}" font-size="${el.fontSize}" ` +
          `font-weight="600" fill="${AD_BOARD_COLORS.paper}" dominant-baseline="middle" text-anchor="middle" ` +
          `clip-path="url(#${clipId})">${escapeXml(el.content)}</text>`,
      );
    } else if (el.src && imageLoadOk[index]) {
      // Both `href` and `xlink:href` are written: modern renderers read the
      // former, Figma's SVG importer (and some older tooling) still expects
      // the latter — costs nothing to include both.
      body.push(
        `<image href="${escapeXml(el.src)}" xlink:href="${escapeXml(el.src)}" x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" ` +
          `preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" />`,
      );
    } else {
      // No src, or it failed/timed-out loading — same flat placeholder +
      // alt text ./exportPng.ts falls back to.
      body.push(...imagePlaceholderMarkup(el, clipId));
    }
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="${AD_BOARD_COLORS.paper}" />`,
    defs.length > 0 ? `<defs>${defs.join("")}</defs>` : "",
    ...body,
    `</svg>`,
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}
