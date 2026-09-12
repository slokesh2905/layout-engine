/**
 * Client-side re-resolution for the two things the async studio adapter
 * (./api.ts) doesn't cover: a live custom-surface profile typed into the
 * Layout Studio's Surface tab, and drag-to-reprioritise in the Elements
 * tab. Both still call the exact same, unmodified `resolveLayout()` from
 * ../resolver.ts — this file only assembles the (AdSpec, SurfaceProfile)
 * pair the resolver takes, mirroring what api.ts already does internally
 * for the catalog path. It never computes a position, size, fontSize or
 * check result itself, and it never touches resolver.ts, spec.ts,
 * surfaces.ts, demoSpec.ts or api.ts.
 *
 * Reads the spec to re-resolve straight off `base.rawSpec` rather than
 * looking it up again by id in the built-in catalog — that lookup would
 * only ever find demoSpec.ts's three built-ins, so it would throw for any
 * spec added at runtime via "Import Spec" (see ../lib/specFile.ts and
 * api.ts's `importSpec()`). `rawSpec` already carries the exact real
 * `AdSpec` `base` was resolved from, built-in or imported alike.
 */
import { elementContent, elementSrc } from "../spec.js";
import type { AdElementSpec, AdSpec } from "../spec.js";
import { describeDegradationOrder, resolveLayout as runResolver } from "../resolver.js";
import type { SurfaceProfile } from "../surfaces.js";
import type { StudioElement, StudioResolution, SurfaceDescriptor, SurfaceId } from "./types.js";

function applyPriorityOverrides(spec: AdSpec, overrides: Readonly<Record<string, number>>): AdSpec {
  if (Object.keys(overrides).length === 0) return spec;
  return {
    ...spec,
    elements: spec.elements.map((el) => (overrides[el.id] !== undefined ? { ...el, priority: overrides[el.id]! } : el)),
  };
}

/**
 * Reorders elements according to an explicit list of ids (e.g. from a drag
 * and drop operation in the UI). Any elements not in the list are pushed to
 * the end.
 */
function applyOrderOverrides(spec: AdSpec, order: readonly string[]): AdSpec {
  if (order.length === 0) return spec;
  const orderMap = new Map(order.map((id, index) => [id, index]));
  return {
    ...spec,
    elements: [...spec.elements].sort((a, b) => {
      const indexA = orderMap.has(a.id) ? orderMap.get(a.id)! : 999;
      const indexB = orderMap.has(b.id) ? orderMap.get(b.id)! : 999;
      return indexA - indexB;
    }),
  };
}

/**
 * Applies a locally-uploaded image (see SpecInspector.tsx's "Upload
 * image…" control) on top of a spec — only ever touches an `image`
 * element's own `src`, keyed by element id, exactly parallel to how
 * `applyPriorityOverrides` above only ever touches `priority`.
 */
function applyImageOverrides(spec: AdSpec, overrides: Readonly<Record<string, string>>): AdSpec {
  if (Object.keys(overrides).length === 0) return spec;
  return {
    ...spec,
    elements: spec.elements.map((el) =>
      el.type === "image" && overrides[el.id] !== undefined ? { ...el, src: overrides[el.id]! } : el,
    ),
  };
}

/**
 * Applies inline content edits (see SpecInspector.tsx's per-row editable
 * field) on top of a spec. Content is one field per `elementContent()`'s
 * own mapping — `text` for "text", `label` for "button", `alt` for
 * "image" — so this is the write-side mirror of that read-side function,
 * kept here rather than in spec.ts since it's a studio-only concept (the
 * resolver and spec.ts never edit a spec, only read one).
 */
function applyContentOverrides(spec: AdSpec, overrides: Readonly<Record<string, string>>): AdSpec {
  if (Object.keys(overrides).length === 0) return spec;
  return {
    ...spec,
    elements: spec.elements.map((el) => {
      const value = overrides[el.id];
      if (value === undefined) return el;
      switch (el.type) {
        case "text":
          return { ...el, text: value };
        case "button":
          return { ...el, label: value };
        case "image":
          return { ...el, alt: value };
      }
    }),
  };
}

/**
 * Applies per-element `weight` overrides (backlog item 9 — see
 * ../resolver.ts's `elementWeight()`) on top of a spec — only ever touches
 * an element's own `weight` field, keyed by element id, exactly parallel
 * to `applyPriorityOverrides` above. An id absent from `overrides` keeps
 * whatever `weight` the base spec already set (usually none, i.e. "use
 * this role's resolver.ts default") — clearing a local override is just
 * removing its key from the override record before it ever reaches here.
 */
function applyWeightOverrides(spec: AdSpec, overrides: Readonly<Record<string, number>>): AdSpec {
  if (Object.keys(overrides).length === 0) return spec;
  return {
    ...spec,
    elements: spec.elements.map((el) => (overrides[el.id] !== undefined ? { ...el, weight: overrides[el.id]! } : el)),
  };
}

/**
 * Removes and/or appends elements (see SpecInspector.tsx's "Remove" button
 * and "+ Add element" form). Removal wins over addition for the same id —
 * not that it can currently happen, since added elements get freshly
 * generated ids, but it keeps the two lists' precedence unambiguous.
 */
function applyStructuralEdits(spec: AdSpec, removedIds: readonly string[], addedElements: readonly AdElementSpec[]): AdSpec {
  if (removedIds.length === 0 && addedElements.length === 0) return spec;
  const removed = new Set(removedIds);
  return {
    ...spec,
    elements: [...spec.elements.filter((el) => !removed.has(el.id)), ...addedElements.filter((el) => !removed.has(el.id))],
  };
}

function toStudioElements(spec: AdSpec): StudioElement[] {
  return spec.elements.map((el) => ({
    id: el.id,
    type: el.type,
    role: el.role,
    priority: el.priority,
    content: elementContent(el),
    src: elementSrc(el),
    weight: el.weight,
  }));
}

export const CUSTOM_SURFACE_DESCRIPTION = "Typed live — the resolver has never seen this surface, same code path, no id lookup.";

/**
 * The content-affecting local edits both `reresolve()` and (Phase G)
 * `resolveAcrossSurfaces()` apply on top of a base spec — every override
 * that changes *what* the ad says, as opposed to *where* it's previewed.
 * Pulled out on its own so both functions build the exact same effective
 * spec from the exact same inputs; only what they do with a *surface*
 * differs.
 */
export interface LocalEditOptions {
  readonly priorityOverrides?: Readonly<Record<string, number>>;
  readonly orderOverrides?: readonly string[];
  readonly imageOverrides?: Readonly<Record<string, string>>;
  readonly contentOverrides?: Readonly<Record<string, string>>;
  readonly weightOverrides?: Readonly<Record<string, number>>;
  readonly addedElements?: readonly AdElementSpec[];
  readonly removedElementIds?: readonly string[];
}

function computeEffectiveSpec(base: StudioResolution, options: LocalEditOptions): AdSpec {
  const structural = applyStructuralEdits(base.rawSpec, options.removedElementIds ?? [], options.addedElements ?? []);
  const withPriority = applyPriorityOverrides(structural, options.priorityOverrides ?? {});
  const withOrder = applyOrderOverrides(withPriority, options.orderOverrides ?? []);
  const withImages = applyImageOverrides(withOrder, options.imageOverrides ?? {});
  const withContent = applyContentOverrides(withImages, options.contentOverrides ?? {});
  return applyWeightOverrides(withContent, options.weightOverrides ?? {});
}

/**
 * Re-resolves `base`'s spec against overridden element priorities, locally
 * uploaded images, a custom surface profile, or any combination. This is a
 * local "what if" recompute — unlike api.ts's resolveLayout(), it never
 * touches connection status or the recent-resolutions list, since it isn't
 * a new resolution event so much as a live view onto the one already
 * loaded.
 */
export function reresolve(base: StudioResolution, options: LocalEditOptions & { readonly customSurface?: SurfaceProfile }): StudioResolution {
  const effectiveSpec = computeEffectiveSpec(base, options);
  const surface: SurfaceDescriptor = options.customSurface
    ? {
        // "custom" isn't a real catalog SurfaceId — the resolver never sees
        // ids at all, and the UI only ever compares this descriptor's id
        // against a real SurfaceId behind an explicit `customActive` flag
        // (see SurfaceToolbar/LayoutStudioPage), never relies on it being one.
        id: "custom" as SurfaceId,
        name: "Custom surface",
        profile: options.customSurface,
        contextLabel: "Custom",
        description: CUSTOM_SURFACE_DESCRIPTION,
      }
    : base.surface;
  const layout = runResolver(effectiveSpec, surface.profile);
  return {
    spec: base.spec,
    elements: toStudioElements(effectiveSpec),
    surface,
    layout,
    degradationOrder: describeDegradationOrder(effectiveSpec),
    // Reflects every content-affecting override (priority, image, inline
    // content edits, added/removed elements — so "Export Spec" while
    // previewing any of those exports what's actually on screen), but a
    // custom surface never changes the spec's own elements — only which
    // surface it's being previewed against.
    rawSpec: effectiveSpec,
  };
}

/**
 * Phase G: re-resolves `base`'s spec (with the same local edits `reresolve`
 * would apply) against every surface in `surfaces` in one pass, for "Export
 * All Surfaces" — the effective spec is computed exactly once and reused,
 * since content-affecting edits don't vary by surface; only `runResolver`'s
 * second argument (and therefore `layout`) changes per entry. Real catalog
 * `SurfaceDescriptor`s are used as-is (unlike `reresolve`'s synthetic
 * "custom" one) since every surface here is a genuine, named, id-bearing
 * profile the caller already has — nothing to synthesize.
 */
export function resolveAcrossSurfaces(base: StudioResolution, surfaces: readonly SurfaceDescriptor[], options: LocalEditOptions): readonly StudioResolution[] {
  const effectiveSpec = computeEffectiveSpec(base, options);
  const elements = toStudioElements(effectiveSpec);
  const degradationOrder = describeDegradationOrder(effectiveSpec);
  return surfaces.map((surface) => ({
    spec: base.spec,
    elements,
    surface,
    layout: runResolver(effectiveSpec, surface.profile),
    degradationOrder,
    rawSpec: effectiveSpec,
  }));
}
