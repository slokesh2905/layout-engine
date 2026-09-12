/**
 * Portable "spec file" format — the editable *source* of an ad (elements +
 * campaign meta), not the resolved output (that's what the Studio's
 * "Export Layout" button already downloads, see LayoutStudioPage.tsx). This
 * is the Figma-.fig-style save/reopen mechanism for a tool with no backend:
 * the file itself, not a server, is what remembers a user's work, and it
 * can be emailed or dropped in a chat just as easily as reopened locally.
 *
 * No new asset type is needed for "images inlined as base64" — an
 * `ImageElementSpec.src` (../spec.js) is already just a string, and a
 * `data:image/...;base64,...` URI is just a string too. This file only adds
 * the envelope (`kind`/`formatVersion`) so a bad or unrelated file can be
 * rejected with a clear message, plus enough shape-checking that the
 * existing `defineAd()` — reused as-is, not re-implemented — never sees a
 * field it isn't prepared for.
 */
import { defineAd } from "../spec.js";
import type { AdElementSpec, AdSpec, ElementRole } from "../spec.js";

export const SPEC_FILE_KIND = "adaptive-layout-studio-spec" as const;
export const SPEC_FILE_FORMAT_VERSION = 1 as const;

export interface SpecFileMeta {
  readonly campaignName: string;
  readonly brand: string;
  readonly supportingCopy: string;
}

export interface SpecFile {
  readonly kind: typeof SPEC_FILE_KIND;
  readonly formatVersion: typeof SPEC_FILE_FORMAT_VERSION;
  readonly meta: SpecFileMeta;
  readonly spec: { readonly elements: readonly AdElementSpec[] };
}

/** Builds the downloadable shape for a spec + its campaign meta. Pure — the caller still owns triggering the actual file download (see LayoutStudioPage.tsx's `downloadJson`). */
export function serializeSpecFile(meta: SpecFileMeta, spec: AdSpec): SpecFile {
  return {
    kind: SPEC_FILE_KIND,
    formatVersion: SPEC_FILE_FORMAT_VERSION,
    meta,
    spec: { elements: spec.elements },
  };
}

export interface ParsedSpecFile {
  readonly meta: SpecFileMeta;
  readonly spec: AdSpec;
}

// Kept in sync with spec.ts's `AdElementSpec["type"]` / `ElementRole` unions
// by hand — the same kind of runtime mirror of a compile-time union already
// used elsewhere in this codebase (e.g. SpecInspector.tsx's `TYPE_ICON`).
// Necessary here specifically because this is the one boundary where
// external, untyped JSON becomes an `AdElementSpec` — every other producer
// of one is TypeScript-checked at compile time.
const VALID_TYPES = new Set<AdElementSpec["type"]>(["text", "image", "button"]);
const VALID_ROLES = new Set<ElementRole>(["hero", "primary", "secondary", "action", "branding"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Guarantees every field `defineAd()` itself dereferences (`.trim()` on
 * `text`/`label`, presence of `src`/`alt`) exists with the right primitive
 * type, so a malformed import fails here with one readable message instead
 * of a raw `TypeError` out of `defineAd()`. Business-rule validation
 * (non-empty strings, positive integer priority, duplicate ids) stays
 * exactly where it already lives, in `defineAd()` — this function only
 * covers the shape-safety a compiler would normally give an internally
 * authored spec.
 *
 * Exported so ./draftStorage.ts (Phase D's sessionStorage auto-save) can
 * reuse it too — that's the only other place in the app where untyped JSON
 * becomes an `AdElementSpec`, and it shouldn't re-derive these same checks.
 */
export function assertImportableElement(value: unknown, index: number): asserts value is AdElementSpec {
  if (!isRecord(value)) {
    throw new Error(`Element #${index + 1} in that spec file isn't a valid object.`);
  }

  const id = typeof value.id === "string" && value.id.length > 0 ? value.id : `#${index + 1}`;

  if (typeof value.type !== "string" || !VALID_TYPES.has(value.type as AdElementSpec["type"])) {
    throw new Error(`Element "${id}" has an unrecognized type "${String(value.type)}" (expected text, image, or button).`);
  }
  if (typeof value.role !== "string" || !VALID_ROLES.has(value.role as ElementRole)) {
    throw new Error(`Element "${id}" has an unrecognized role "${String(value.role)}".`);
  }
  if (typeof value.priority !== "number") {
    throw new Error(`Element "${id}" is missing a numeric "priority".`);
  }
  if (value.weight !== undefined && typeof value.weight !== "number") {
    throw new Error(`Element "${id}" has a non-numeric "weight".`);
  }
  if (value.type === "text" && typeof value.text !== "string") {
    throw new Error(`Text element "${id}" is missing its "text" field.`);
  }
  if (value.type === "button" && typeof value.label !== "string") {
    throw new Error(`Button element "${id}" is missing its "label" field.`);
  }
  if (value.type === "image" && (typeof value.src !== "string" || typeof value.alt !== "string")) {
    throw new Error(`Image element "${id}" is missing its "src" or "alt" field.`);
  }
}

/**
 * Everything `parseSpecFile()` does *after* turning raw text into a parsed
 * JSON value — split out so ./specBundle.ts (Phase H) can validate one
 * bundle entry it already parsed as part of a larger JSON document, without
 * re-serializing it back to a string just to hand it to `JSON.parse` again.
 * Throws the exact same, human-readable `Error`s `parseSpecFile` always has.
 */
export function parseSpecFileObject(parsed: unknown): ParsedSpecFile {
  if (!isRecord(parsed) || parsed.kind !== SPEC_FILE_KIND) {
    throw new Error('That file isn\'t an Adaptive Layout Studio spec file (missing or wrong "kind").');
  }
  if (parsed.formatVersion !== SPEC_FILE_FORMAT_VERSION) {
    throw new Error(
      `This spec file's format (v${String(parsed.formatVersion)}) isn't supported by this build (expects v${SPEC_FILE_FORMAT_VERSION}).`,
    );
  }
  if (
    !isRecord(parsed.meta) ||
    typeof parsed.meta.campaignName !== "string" ||
    typeof parsed.meta.brand !== "string" ||
    typeof parsed.meta.supportingCopy !== "string"
  ) {
    throw new Error("That spec file is missing its campaign details (campaignName/brand/supportingCopy).");
  }
  if (!isRecord(parsed.spec) || !Array.isArray(parsed.spec.elements)) {
    throw new Error("That spec file has no elements to import.");
  }

  parsed.spec.elements.forEach((element, index) => assertImportableElement(element, index));

  // Every field defineAd() touches is now guaranteed present with the right
  // primitive type — its own checks (non-empty text, positive integer
  // priority, duplicate ids) are reused as-is, not re-implemented here.
  const spec = defineAd({ elements: parsed.spec.elements as AdElementSpec[] });

  const meta: SpecFileMeta = {
    campaignName: parsed.meta.campaignName,
    brand: parsed.meta.brand,
    supportingCopy: parsed.meta.supportingCopy,
  };

  return { meta, spec };
}

/**
 * The only entry point for turning a user-picked file's raw text into a
 * spec the rest of the app can use. Throws a single, human-readable
 * `Error` on any problem — an unrelated JSON file, a future/unknown format
 * version, a malformed element, or a `defineAd()`-rejected spec (duplicate
 * ids, non-positive priority, empty required content) — so callers can
 * show it directly, the same way the resolver's own errors already are.
 */
export function parseSpecFile(raw: string): ParsedSpecFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  return parseSpecFileObject(parsed);
}
