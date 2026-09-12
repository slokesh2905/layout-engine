/**
 * Phase F: the Figma-compatible "in" half — turns an SVG a user exported
 * from a Figma frame (File → Export → SVG, a stock Figma feature; nothing
 * custom needed on their end) into a starting `AdSpec`. Companion to
 * ./exportSvg.ts (Phase E), which produces the file this reads, and to
 * ./specFile.ts, which this deliberately mirrors in spirit: parse
 * defensively, reuse `defineAd()` for the real validation, fail with one
 * specific, readable message rather than a raw parser exception.
 *
 * The crucial simplification that makes this tractable at all: an
 * `AdElementSpec` carries no position (see spec.ts) — `role` and `priority`
 * are the only layout-relevant fields, and the resolver recomputes every
 * element's actual x/y/width/height from scratch. So this file never
 * touches an SVG element's geometry (`x`/`y`/`transform`, or the
 * `<pattern>`/`<defs>` indirection Figma often wraps an image fill in to
 * *place* it) — it only pulls out CONTENT: text strings and embedded image
 * data. Where that content sits in the original design, or how it was
 * positioned, is irrelevant to what gets imported.
 *
 * What this deliberately does NOT attempt, and why:
 *   - No text-outline recovery. Figma's SVG export can preserve real
 *     `<text>` elements (confirmed current behavior, both from the UI and
 *     via the API) rather than converting them to vector paths — that's
 *     the case this file supports. A file exported with text outlined to
 *     paths has no recoverable text content at all short of OCR, so it
 *     isn't attempted; such an export just yields no text elements here
 *     (still fine if it has images — see the "no content at all" error
 *     below for the case where it has neither).
 *   - No button detection. There's no reliable, ambiguity-free way to spot
 *     "this text sits on a capsule shape, therefore it's a button" from
 *     markup alone without real geometry math, and guessing wrong silently
 *     is worse than not guessing — every imported text element comes in as
 *     type "text"; turning one into a real button is a two-step "remove,
 *     then + Add element" in the roster editor (Phase C), the same as any
 *     other reclassification.
 *   - No paragraph reassembly. Figma sometimes exports one multi-line text
 *     layer as several sibling `<text>` elements (one per visual line)
 *     rather than one `<text>` with multiple `<tspan>`s. Guessing which
 *     siblings belong to the same original layer (e.g. by shared parent)
 *     is exactly as likely to *wrongly* merge two genuinely different text
 *     layers that happen to share a `<g>` for unrelated reasons (a shared
 *     clip path, a shared transform group) as it is to correctly merge
 *     line fragments — an incorrect merge (two headlines silently
 *     concatenated into one garbled string) is a worse, easier-to-miss
 *     failure than an over-eager split (a few extra one-line elements,
 *     which show up individually in the roster and are obvious to
 *     tidy up). So: one `<text>` element in, one text element out, always.
 *   - No role/priority preservation from Figma (Figma has no such concept
 *     to preserve in the first place). Both are assigned by a documented
 *     heuristic below and are expected to be adjusted afterward in the
 *     roster editor, same as any import needs a pass of cleanup.
 */
import { defineAd } from "../spec.js";
import type { AdElementSpec, AdSpec } from "../spec.js";

const XLINK_NS = "http://www.w3.org/1999/xlink";

interface TextCandidate {
  readonly content: string;
  readonly fontSize: number;
  readonly order: number;
}

interface ImageCandidate {
  readonly src: string;
  readonly order: number;
}

function getFontSize(el: Element): number {
  const attr = el.getAttribute("font-size");
  if (attr) {
    const parsed = parseFloat(attr);
    if (!Number.isNaN(parsed)) return parsed;
  }
  const style = el.getAttribute("style");
  if (style) {
    const match = /font-size:\s*([\d.]+)/.exec(style);
    if (match?.[1]) return parseFloat(match[1]);
  }
  return 16; // A reasonable, undramatic default when no size is stated at all — keeps ranking stable rather than throwing.
}

function getImageHref(el: Element): string | null {
  // SVG2's unprefixed `href` is what modern tooling (including our own
  // ./exportSvg.ts) writes; `xlink:href` is what older exports (and some
  // still-current Figma output) use instead. `getAttribute("xlink:href")`
  // is not reliable across parsers for a namespaced attribute — the
  // documented, portable way to read it is `getAttributeNS`.
  return el.getAttribute("href") ?? el.getAttributeNS(XLINK_NS, "href");
}

function extractTexts(doc: Document): TextCandidate[] {
  const candidates: TextCandidate[] = [];
  Array.from(doc.querySelectorAll("text")).forEach((el, order) => {
    // .textContent already concatenates every descendant text node
    // (including nested <tspan>s) in document order — no manual walking
    // needed. Collapse internal whitespace/newlines from the source markup
    // into single spaces; a raw SVG file's indentation is not the content.
    const content = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (content.length > 0) candidates.push({ content, fontSize: getFontSize(el), order });
  });
  return candidates;
}

/**
 * Figma's own SVG export writes the source frame's name as a `<title>`
 * element right inside the root `<svg>` (a stock SVG accessibility feature,
 * not a Figma-specific extension) — reading it back gives a much better
 * default campaign name than a generic placeholder, when it's there. Only
 * the root's own direct `<title>` counts; a `<title>` nested inside some
 * group deeper in the tree describes that group, not the whole file.
 */
function extractSuggestedName(doc: Document): string | null {
  const title = doc.documentElement.querySelector(":scope > title");
  const text = title?.textContent?.trim();
  return text ? text : null;
}

function extractImages(doc: Document): ImageCandidate[] {
  const candidates: ImageCandidate[] = [];
  // querySelectorAll("image") finds every <image>, including ones tucked
  // inside <defs>/<pattern> for Figma's image-fill placement trick — exactly
  // where the real embedded data lives regardless of how it's positioned.
  Array.from(doc.querySelectorAll("image")).forEach((el, order) => {
    const src = getImageHref(el);
    if (src) candidates.push({ src, order });
  });
  return candidates;
}

/**
 * Turns ranked text/image candidates into a roughly sensible starting
 * roster. Priority 1 ("hero" role) goes to the single most prominent text
 * (by font-size — the closest signal to "this was the headline" available
 * without real geometry) and the first embedded image, sharing a slot —
 * mirroring the built-in demo specs' own headline+product-image pattern.
 * Everything past that just steps down one priority tier at a time; exact
 * role assignment past the top tier is intentionally coarse (see this
 * file's top doc comment on why finer heuristics aren't attempted).
 */
function assignRolesAndPriorities(texts: readonly TextCandidate[], images: readonly ImageCandidate[]): AdElementSpec[] {
  const sortedTexts = [...texts].sort((a, b) => b.fontSize - a.fontSize || a.order - b.order);
  const sortedImages = [...images].sort((a, b) => a.order - b.order);

  const elements: AdElementSpec[] = [];
  const importId = Date.now();
  let idCounter = 0;
  const nextId = () => `svg-import-${importId}-${idCounter++}`;
  let priority = 1;

  const [heroText, ...restTexts] = sortedTexts;
  const [heroImage, ...restImages] = sortedImages;

  if (heroText) elements.push({ id: nextId(), type: "text", role: "hero", priority, text: heroText.content });
  if (heroImage) elements.push({ id: nextId(), type: "image", role: "hero", priority, src: heroImage.src, alt: "Image" });
  if (heroText || heroImage) priority += 1;

  const [secondText, ...remainingTexts] = restTexts;
  if (secondText) {
    elements.push({ id: nextId(), type: "text", role: "primary", priority, text: secondText.content });
    priority += 1;
  }

  for (const text of remainingTexts) {
    elements.push({ id: nextId(), type: "text", role: "secondary", priority, text: text.content });
    priority += 1;
  }

  for (const image of restImages) {
    elements.push({ id: nextId(), type: "image", role: "branding", priority, src: image.src, alt: "Image" });
    priority += 1;
  }

  return elements;
}

/** Mirrors ./specFile.ts's `ParsedSpecFile` shape: the validated spec plus whatever meta could be recovered from the file itself. */
export interface ParsedFigmaSvg {
  readonly spec: AdSpec;
  /** The source Figma frame's name, if the file had a root `<title>` — null otherwise, for the caller to fall back on its own default. */
  readonly suggestedName: string | null;
}

/**
 * The only entry point for turning a user-picked SVG file's raw text into
 * an `AdSpec` the rest of the app can use — mirrors ./specFile.ts's
 * `parseSpecFile()` in shape: throws a single, human-readable `Error` on
 * any problem (not valid SVG, no importable content), and hands the final
 * business-rule validation (duplicate ids, positive priorities, non-empty
 * content) to the same `defineAd()` every other spec in this app goes
 * through. No shape-checking layer of its own is needed the way
 * `specFile.ts` has one: every field below is constructed here from values
 * this function already controls, not parsed out of arbitrary untyped
 * JSON, so there's nothing to defend `defineAd()` from before calling it.
 */
export function parseFigmaSvg(raw: string): ParsedFigmaSvg {
  const doc = new DOMParser().parseFromString(raw, "image/svg+xml");

  if (doc.querySelector("parsererror")) {
    throw new Error("That file isn't valid SVG.");
  }
  if (doc.documentElement.nodeName.toLowerCase() !== "svg") {
    throw new Error("That file isn't an SVG document.");
  }

  const texts = extractTexts(doc);
  const images = extractImages(doc);

  if (texts.length === 0 && images.length === 0) {
    throw new Error(
      "No text or image elements found in that SVG — nothing to import. If the Figma frame's text was exported as outlined shapes rather than real text, its content can't be recovered from the file.",
    );
  }

  const elements = assignRolesAndPriorities(texts, images);
  return { spec: defineAd({ elements }), suggestedName: extractSuggestedName(doc) };
}
