/**
 * Studio-facing types. These wrap the real resolver types (from
 * ../resolver.ts, ../spec.ts, ../surfaces.ts) rather than duplicating
 * them — a `StudioResolution` always carries the actual `ResolvedLayout`
 * the resolver produced, untouched. Nothing in this file computes a
 * layout; it only describes the shapes the UI reads and the adapter
 * (./api.ts) produces.
 */
import type { AdElementSpec, AdSpec, ElementRole } from "../spec.js";
import type { ResolvedLayout } from "../resolver.js";
import type { SurfaceProfile } from "../surfaces.js";
export type { SafeArea, SurfaceProfile } from "../surfaces.js";

export type { ElementRole } from "../spec.js";
export type {
  ResolvedLayout,
  ResolvedElementLayout,
  DroppedElement,
  DegradationEntry,
  DegradationAction,
  ResolvedLayoutDiagnostics,
} from "../resolver.js";

/**
 * The four surfaces the assignment names explicitly, plus "compact-badge"
 * — the deliberately tight profile (see ../surfaces.ts's `tinyBadge`) used
 * as the "one surface must intentionally be constrained enough to trigger
 * degradation" case, rather than fabricating a fifth surface's numbers.
 */
export type SurfaceId = "mobile-portrait" | "mobile-landscape" | "broadcast-lower-third" | "square-kiosk" | "compact-badge";

export interface SurfaceDescriptor {
  readonly id: SurfaceId;
  readonly name: string;
  readonly profile: SurfaceProfile;
  /** Short context label shown under the dimensions on the surface picker, e.g. "Touch", "Broadcast". */
  readonly contextLabel: string;
  /** One-line description for the /surfaces card view. */
  readonly description: string;
}

export type SpecStatus = "ready" | "needs-review";

export interface AdSpecSummary {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly brand: string;
  readonly supportingCopy: string;
  readonly elementCount: number;
  /** Elements at priority 1 — never droppable by the resolver. */
  readonly requiredCount: number;
  /** Elements at priority > 1 — may be shrunk, truncated, or dropped. */
  readonly degradableCount: number;
  readonly lastResolvedAt: string | null;
  readonly status: SpecStatus;
}

/** A spec-level element (before resolution) — used for the full roster the inspector shows, including anything a given surface ends up dropping. */
export interface StudioElement {
  readonly id: string;
  readonly type: AdElementSpec["type"];
  readonly role: ElementRole;
  readonly priority: number;
  /** Resolved from the spec's own text/label/alt field — never invented. */
  readonly content: string;
}

export interface RecentResolution {
  readonly id: string;
  readonly specId: string;
  readonly specName: string;
  readonly surfaceId: SurfaceId;
  readonly surfaceName: string;
  readonly resolvedAt: string;
  readonly fitScore: number;
  readonly strategy: string;
}

/** Everything the Layout Studio screen needs for one (spec, surface) pair. */
export interface StudioResolution {
  readonly spec: AdSpecSummary;
  readonly elements: readonly StudioElement[];
  readonly surface: SurfaceDescriptor;
  /** The real, unmodified resolver output. */
  readonly layout: ResolvedLayout;
  /** Resolver-derived, spec-driven — see resolver.ts's describeDegradationOrder(). */
  readonly degradationOrder: readonly string[];
}

export interface StudioAdSpec {
  readonly summary: AdSpecSummary;
  readonly spec: AdSpec;
  readonly elements: readonly StudioElement[];
}

export type ConnectionStatus = "connected" | "connecting" | "offline";

/** Canvas zoom: "fit" scales the surface to the available viewport; "100" renders it at its true pixel size. */
export type ZoomMode = "fit" | "100";

/** The four view toggles the Surface Toolbar exposes, per the brief's "Safe Area / Element Bounds / Spacing / Priority" row. */
export interface CanvasToggles {
  readonly safeArea: boolean;
  readonly elementBounds: boolean;
  readonly spacing: boolean;
  readonly priority: boolean;
}

export const DEFAULT_CANVAS_TOGGLES: CanvasToggles = {
  safeArea: false,
  elementBounds: true,
  spacing: false,
  priority: false,
};
