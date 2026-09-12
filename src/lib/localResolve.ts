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
 */
import { adSpecCatalog } from "../demoSpec.js";
import { elementContent } from "../spec.js";
import type { AdSpec } from "../spec.js";
import { describeDegradationOrder, resolveLayout as runResolver } from "../resolver.js";
import type { SurfaceProfile } from "../surfaces.js";
import type { StudioElement, StudioResolution, SurfaceDescriptor, SurfaceId } from "./types.js";

function findEntry(specId: string) {
  const entry = adSpecCatalog.find((e) => e.id === specId);
  if (!entry) throw new Error(`Unknown ad spec id "${specId}".`);
  return entry;
}

function applyPriorityOverrides(spec: AdSpec, overrides: Readonly<Record<string, number>>): AdSpec {
  if (Object.keys(overrides).length === 0) return spec;
  return {
    ...spec,
    elements: spec.elements.map((el) => (overrides[el.id] !== undefined ? { ...el, priority: overrides[el.id]! } : el)),
  };
}

function toStudioElements(spec: AdSpec): StudioElement[] {
  return spec.elements.map((el) => ({ id: el.id, type: el.type, role: el.role, priority: el.priority, content: elementContent(el) }));
}

export const CUSTOM_SURFACE_DESCRIPTION = "Typed live — the resolver has never seen this surface, same code path, no id lookup.";

/**
 * Re-resolves `base`'s spec against overridden element priorities, a custom
 * surface profile, or both. This is a local "what if" recompute — unlike
 * api.ts's resolveLayout(), it never touches connection status or the
 * recent-resolutions list, since it isn't a new resolution event so much as
 * a live view onto the one already loaded.
 */
export function reresolve(
  base: StudioResolution,
  options: { readonly priorityOverrides?: Readonly<Record<string, number>>; readonly customSurface?: SurfaceProfile },
): StudioResolution {
  const entry = findEntry(base.spec.id);
  const effectiveSpec = applyPriorityOverrides(entry.spec, options.priorityOverrides ?? {});
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
  };
}
