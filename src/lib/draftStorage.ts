/**
 * Phase D: sessionStorage auto-save of in-progress spec edits — a
 * refresh-survives-but-tab-close-clears safety net on top of everything
 * SpecInspector.tsx lets a user do to a spec locally (priority drags,
 * uploaded images, inline content edits, added/removed elements) plus the
 * custom-surface form. `sessionStorage` already has exactly the lifetime
 * this needs — per-tab, gone the moment the tab/window closes — so nothing
 * here manages expiry itself; it only reads and writes it defensively.
 *
 * Scoped per spec id, not per surface: an uploaded image or an edited
 * headline is a property of the ad, not of whichever surface happens to be
 * previewing it, so a draft survives switching surfaces the same way it
 * survives a refresh. It does NOT survive picking a *different* spec from
 * the picker — that's a deliberate "start over" action, not an accident to
 * protect against. LayoutStudioPage.tsx already resets every one of these
 * pieces of state to its empty default whenever the URL's spec/surface
 * params change; this file's `loadDraft()` is what lets that reset be
 * overridden by a saved draft for the spec being switched to.
 */
import { assertImportableElement } from "./specFile.js";
import type { AdElementSpec } from "../spec.js";
import type { CustomSurfaceForm } from "../components/studio/ResolutionPanel.js";

const STORAGE_PREFIX = "als-draft:";

export interface StudioDraft {
  readonly priorityOverrides: Readonly<Record<string, number>>;
  readonly orderOverrides: readonly string[];
  readonly imageOverrides: Readonly<Record<string, string>>;
  readonly contentOverrides: Readonly<Record<string, string>>;
  readonly weightOverrides: Readonly<Record<string, number>>;
  readonly addedElements: readonly AdElementSpec[];
  readonly removedElementIds: readonly string[];
  readonly customActive: boolean;
  readonly customForm: CustomSurfaceForm;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTypedRecord(value: unknown, valueType: "string" | "number"): value is Record<string, string | number> {
  if (!isRecord(value)) return false;
  return Object.values(value).every((v) => typeof v === valueType);
}

function isCustomSurfaceForm(value: unknown): value is CustomSurfaceForm {
  if (!isRecord(value)) return false;
  return (["width", "height", "safeArea", "minTapTarget", "minTextSize"] as const).every((key) => typeof value[key] === "number");
}

/**
 * Turns whatever `JSON.parse` handed back into a trustworthy `StudioDraft`
 * or nothing at all — sessionStorage content is same-origin but still
 * outside the type system (an older build's shape, or a value hand-edited
 * in devtools), so nothing here is assumed. Reuses `assertImportableElement`
 * from specFile.ts — the only other place this codebase turns untyped JSON
 * into `AdElementSpec`s — for `addedElements`, rather than re-deriving the
 * same field-by-field checks.
 */
function isValidDraft(value: unknown): value is StudioDraft {
  if (!isRecord(value)) return false;
  if (!isTypedRecord(value.priorityOverrides, "number")) return false;
  if (!Array.isArray(value.orderOverrides) || !value.orderOverrides.every((id) => typeof id === "string")) return false;
  if (!isTypedRecord(value.imageOverrides, "string")) return false;
  if (!isTypedRecord(value.contentOverrides, "string")) return false;
  if (!isTypedRecord(value.weightOverrides, "number")) return false;
  if (!Array.isArray(value.addedElements)) return false;
  if (!Array.isArray(value.removedElementIds) || !value.removedElementIds.every((id) => typeof id === "string")) return false;
  if (typeof value.customActive !== "boolean") return false;
  if (!isCustomSurfaceForm(value.customForm)) return false;
  try {
    value.addedElements.forEach((element, index) => assertImportableElement(element, index));
  } catch {
    return false;
  }
  return true;
}

function storageKey(specId: string): string {
  return `${STORAGE_PREFIX}${specId}`;
}

/**
 * Best-effort read — a missing entry, a `sessionStorage` that throws (private
 * browsing, disabled storage), corrupt JSON, or a value that fails
 * `isValidDraft()`'s shape check are all just "no draft", never thrown.
 */
export function loadDraft(specId: string): StudioDraft | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(specId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Best-effort write — `sessionStorage` being unavailable, or full (a few
 * large uploaded images can add up toward the per-origin quota), never
 * breaks the studio; it only means this refresh-safety-net doesn't apply
 * for that edit.
 */
export function saveDraft(specId: string, draft: StudioDraft): void {
  try {
    window.sessionStorage.setItem(storageKey(specId), JSON.stringify(draft));
  } catch {
    /* best-effort only */
  }
}

export function clearDraft(specId: string): void {
  try {
    window.sessionStorage.removeItem(storageKey(specId));
  } catch {
    /* best-effort only */
  }
}
