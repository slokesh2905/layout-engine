/**
 * Phase H: "export/import everything" — a single file holding every custom
 * spec added this session (imported via a spec file, a Figma SVG, pasted
 * text, however it got there — see ../lib/api.ts's `customSpecs`), for
 * someone who's accumulated more than one and wants to save or hand off the
 * whole set at once, not one file at a time.
 *
 * Deliberately just an envelope around ./specFile.ts's existing format
 * rather than a new one: each entry in a bundle IS a complete, independently
 * valid `SpecFile` (its own `kind`/`formatVersion`/`meta`/`spec`), so this
 * file adds no validation of its own beyond "is this an array of them" —
 * every per-entry check (shape-safety, `defineAd()`'s business rules)
 * already lives in specFile.ts's `parseSpecFileObject()` and is reused
 * as-is. One bad entry doesn't sink the rest: each is validated
 * independently and reported by its own position in the file.
 */
import { parseSpecFileObject, serializeSpecFile } from "./specFile.js";
import type { ParsedSpecFile, SpecFile, SpecFileMeta } from "./specFile.js";
import type { AdSpec } from "../spec.js";

export const SPEC_BUNDLE_KIND = "adaptive-layout-studio-spec-bundle" as const;
export const SPEC_BUNDLE_FORMAT_VERSION = 1 as const;

export interface SpecBundleFile {
  readonly kind: typeof SPEC_BUNDLE_KIND;
  readonly formatVersion: typeof SPEC_BUNDLE_FORMAT_VERSION;
  readonly specs: readonly SpecFile[];
}

/** Builds the downloadable shape for every entry in `entries` — pure, same "caller triggers the actual download" split as ./specFile.ts's `serializeSpecFile`. */
export function serializeSpecBundle(entries: readonly { readonly meta: SpecFileMeta; readonly spec: AdSpec }[]): SpecBundleFile {
  return {
    kind: SPEC_BUNDLE_KIND,
    formatVersion: SPEC_BUNDLE_FORMAT_VERSION,
    specs: entries.map((entry) => serializeSpecFile(entry.meta, entry.spec)),
  };
}

export interface ParsedSpecBundle {
  readonly specs: readonly ParsedSpecFile[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Mirrors ./specFile.ts's `parseSpecFile()` in spirit: one specific,
 * readable `Error` for any problem with the envelope itself (not JSON, not
 * a bundle, wrong format version, empty), and — since a bundle is many
 * specs, not one — a per-entry error that names which position in the file
 * failed and why, from the exact same validation `parseSpecFile` already
 * does for a lone spec file.
 */
export function parseSpecBundle(raw: string): ParsedSpecBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }

  if (!isRecord(parsed) || parsed.kind !== SPEC_BUNDLE_KIND) {
    throw new Error('That file isn\'t an Adaptive Layout Studio spec bundle (missing or wrong "kind").');
  }
  if (parsed.formatVersion !== SPEC_BUNDLE_FORMAT_VERSION) {
    throw new Error(
      `This bundle's format (v${String(parsed.formatVersion)}) isn't supported by this build (expects v${SPEC_BUNDLE_FORMAT_VERSION}).`,
    );
  }
  const rawSpecs: unknown = parsed.specs;
  if (!Array.isArray(rawSpecs)) {
    throw new Error("That bundle has no specs array.");
  }
  if (rawSpecs.length === 0) {
    throw new Error("That bundle is empty — nothing to import.");
  }

  const specs = rawSpecs.map((entry, index) => {
    try {
      return parseSpecFileObject(entry);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Spec #${index + 1} of ${rawSpecs.length} in that bundle: ${message}`);
    }
  });

  return { specs };
}
