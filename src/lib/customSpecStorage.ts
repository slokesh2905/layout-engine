/**
 * Phase I: sessionStorage persistence for the spec catalog's session-only
 * additions — `customSpecs` (Import Spec / Paste Spec / Import Figma SVG /
 * New Spec) and `metaOverrides` (the Campaign tab's renames, built-in specs
 * included). Without this, api.ts's module state — literally everything a
 * user has imported or created this session — is wiped by a plain page
 * refresh: the next `resolveLayout()`/`getAdSpec()` call for that spec's id
 * throws `Unknown ad spec id "imported-…"` the moment the Studio tries to
 * re-resolve whatever the URL pointed at, since the entry backing that id no
 * longer exists in `customSpecs` at all — not "edits lost," the whole spec
 * is gone.
 *
 * This follows exactly the same "survives a refresh, gone when the tab
 * closes" contract ./draftStorage.ts already established for local edit
 * overrides: same `sessionStorage`, same defensive best-effort read/write
 * (a quota error or disabled storage never breaks the app, it just means
 * this safety net doesn't apply), same reuse of `assertImportableElement()`
 * — the one place this codebase already trusts to turn untyped JSON into an
 * `AdElementSpec` — rather than re-deriving that shape-check a third time.
 *
 * Declares its own `PersistedSpecMeta` (identical in shape to api.ts's
 * `ImportSpecMeta`) instead of importing that type from api.ts, matching
 * this codebase's existing convention at this exact boundary — specFile.ts's
 * `SpecFileMeta` already duplicates the same three fields rather than
 * cross-importing — so this module has no dependency on api.ts at all; only
 * api.ts depends on this one. Reuses specFile.ts's `assertImportableElement`
 * for the same per-element shape guarantee (its own doc comment already
 * calls out draftStorage.ts as the other reuser, for the same reason: this
 * codebase has one place that turns untyped JSON into an `AdElementSpec`,
 * not three copies of the same checks).
 */
import { defineAd } from "../spec.js";
import type { AdElementSpec } from "../spec.js";
import type { AdSpecCatalogEntry } from "../demoSpec.js";
import { assertImportableElement } from "./specFile.js";

const CUSTOM_SPECS_KEY = "als-custom-specs";
const META_OVERRIDES_KEY = "als-meta-overrides";

export interface PersistedSpecMeta {
  readonly campaignName: string;
  readonly brand: string;
  readonly supportingCopy: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPersistedSpecMeta(value: unknown): value is PersistedSpecMeta {
  return (
    isRecord(value) &&
    typeof value.campaignName === "string" &&
    typeof value.brand === "string" &&
    typeof value.supportingCopy === "string"
  );
}

/**
 * Turns whatever `JSON.parse` handed back into a trustworthy
 * `AdSpecCatalogEntry` or nothing at all — same posture as
 * draftStorage.ts's `isValidDraft`: sessionStorage content is same-origin
 * but still outside the type system (an older build's shape, a value
 * hand-edited in devtools), so nothing here is assumed. Reconstructs the
 * spec through `defineAd()` rather than trusting the stored `elements`
 * array as already-valid, so a corrupted or hand-edited entry is dropped
 * outright instead of silently reintroducing a spec `defineAd()` itself
 * would have rejected.
 */
function toCatalogEntry(value: unknown): AdSpecCatalogEntry | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || value.id.length === 0) return null;
  if (typeof value.version !== "string") return null;
  if (value.status !== "ready" && value.status !== "needs-review") return null;
  if (!isPersistedSpecMeta(value.meta)) return null;
  if (!isRecord(value.spec) || !Array.isArray(value.spec.elements)) return null;

  try {
    value.spec.elements.forEach((element, index) => assertImportableElement(element, index));
    const spec = defineAd({ elements: value.spec.elements as AdElementSpec[] });
    return { id: value.id, version: value.version, status: value.status, spec, meta: value.meta };
  } catch {
    return null;
  }
}

/**
 * Best-effort read, called once at module load in api.ts. A missing entry,
 * a `sessionStorage` that throws (private browsing, disabled storage),
 * corrupt JSON, or any entry that fails validation is simply dropped —
 * never thrown — so a partially-corrupted stash still restores whatever in
 * it is still good, rather than losing everything to one bad entry.
 */
export function loadCustomSpecs(): AdSpecCatalogEntry[] {
  try {
    const raw = window.sessionStorage.getItem(CUSTOM_SPECS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(toCatalogEntry).filter((entry): entry is AdSpecCatalogEntry => entry !== null);
  } catch {
    return [];
  }
}

/**
 * Best-effort write of the *entire* current catalog addition list — called
 * after every mutation (see api.ts's `importSpec()`). This data set is
 * small (a session's worth of imported/created specs, not a database), so
 * rewriting it whole each time matches draftStorage.ts's own approach
 * rather than adding incremental-patch complexity for no real benefit.
 */
export function saveCustomSpecs(entries: readonly AdSpecCatalogEntry[]): void {
  try {
    window.sessionStorage.setItem(CUSTOM_SPECS_KEY, JSON.stringify(entries));
  } catch {
    /* best-effort only — a full quota or disabled storage just means this
       refresh-safety-net doesn't apply for this session */
  }
}

/**
 * Best-effort read of the Campaign tab's renames (see api.ts's
 * `updateSpecMeta()`) — works identically for a built-in spec's override or
 * an imported one's, matching `metaOverrides`'s own design.
 */
export function loadMetaOverrides(): Map<string, PersistedSpecMeta> {
  const result = new Map<string, PersistedSpecMeta>();
  try {
    const raw = window.sessionStorage.getItem(META_OVERRIDES_KEY);
    if (!raw) return result;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return result;
    for (const [specId, meta] of Object.entries(parsed)) {
      if (isPersistedSpecMeta(meta)) result.set(specId, meta);
    }
    return result;
  } catch {
    return result;
  }
}

export function saveMetaOverrides(overrides: ReadonlyMap<string, PersistedSpecMeta>): void {
  try {
    window.sessionStorage.setItem(META_OVERRIDES_KEY, JSON.stringify(Object.fromEntries(overrides)));
  } catch {
    /* best-effort only */
  }
}
