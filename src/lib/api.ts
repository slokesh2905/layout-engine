/**
 * The one place the Studio frontend talks to "the backend". There isn't a
 * network service behind this app — the resolver (../resolver.ts) runs
 * client-side, which for this assignment *is* the backend — but every
 * component still goes through this adapter rather than importing
 * resolveLayout()/demoSpec.ts/surfaces.ts directly. That's what the
 * "typed adapter" box in the architecture diagram is for: if a real
 * `/api/resolve` endpoint replaced the in-browser resolver tomorrow, only
 * this file would change.
 *
 * Every export here is async and can reject, even though today's
 * implementation is synchronous underneath — so the UI's loading/error
 * states are exercised for real, not skipped because "it's just a mock".
 */
import { adSpecCatalog, defaultSpecId } from "../demoSpec.js";
import { elementContent } from "../spec.js";
import type { AdSpec } from "../spec.js";
import { describeDegradationOrder, resolveLayout as runResolver } from "../resolver.js";
import { defaultSurfaceId, findSurface, surfaceCatalog } from "./mock-data.js";
import type {
  AdSpecSummary,
  ConnectionStatus,
  RecentResolution,
  StudioAdSpec,
  StudioElement,
  StudioResolution,
  SurfaceDescriptor,
  SurfaceId,
} from "./types.js";

// ---------------------------------------------------------------------------
// Mutable in-memory state the adapter owns. A real API would keep this
// server-side; here it's module state, which is exactly what makes it easy
// to swap out later without touching a single component.
// ---------------------------------------------------------------------------

const lastResolvedAt = new Map<string, string>();
const recentResolutions: RecentResolution[] = seedRecentResolutions();

function seedRecentResolutions(): RecentResolution[] {
  const now = Date.now();
  return [
    {
      id: "seed-1",
      specId: "aurora-hydration-launch",
      specName: "Aurora Hydration Launch",
      surfaceId: "broadcast-lower-third",
      surfaceName: "Broadcast Lower Third",
      resolvedAt: new Date(now - 6 * 60 * 1000).toISOString(),
      fitScore: 100,
      strategy: "horizontal-flow",
    },
    {
      id: "seed-2",
      specId: "aurora-retail-countdown",
      specName: "Aurora Retail Countdown",
      surfaceId: "compact-badge",
      surfaceName: "Compact Badge",
      resolvedAt: new Date(now - 41 * 60 * 1000).toISOString(),
      fitScore: 75,
      strategy: "horizontal-flow-degraded",
    },
  ];
}

let connectionStatus: ConnectionStatus = "connected";
const connectionListeners = new Set<(status: ConnectionStatus) => void>();

function setConnectionStatus(status: ConnectionStatus) {
  connectionStatus = status;
  for (const listener of connectionListeners) listener(status);
}

export function onConnectionStatusChange(listener: (status: ConnectionStatus) => void): () => void {
  connectionListeners.add(listener);
  return () => connectionListeners.delete(listener);
}

export function getConnectionStatus(): ConnectionStatus {
  return connectionStatus;
}

// A small, randomized delay so loading states are genuine rather than
// instant-and-invisible — bounded tightly enough not to feel sluggish for
// an operation the resolver itself finishes in well under a millisecond.
function simulateLatency(minMs = 90, maxMs = 220): Promise<void> {
  const delay = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function findCatalogEntry(specId: string) {
  const entry = adSpecCatalog.find((e) => e.id === specId);
  if (!entry) throw new Error(`Unknown ad spec id "${specId}".`);
  return entry;
}

function toStudioElements(spec: AdSpec): StudioElement[] {
  return spec.elements.map((el) => ({
    id: el.id,
    type: el.type,
    role: el.role,
    priority: el.priority,
    content: elementContent(el),
  }));
}

function toSummary(entry: (typeof adSpecCatalog)[number]): AdSpecSummary {
  const requiredCount = entry.spec.elements.filter((e) => e.priority === 1).length;
  return {
    id: entry.id,
    name: entry.meta.campaignName,
    version: entry.version,
    brand: entry.meta.brand,
    supportingCopy: entry.meta.supportingCopy,
    elementCount: entry.spec.elements.length,
    requiredCount,
    degradableCount: entry.spec.elements.length - requiredCount,
    lastResolvedAt: lastResolvedAt.get(entry.id) ?? null,
    status: entry.status,
  };
}

// ---------------------------------------------------------------------------
// Public adapter surface
// ---------------------------------------------------------------------------

export async function getAdSpecs(): Promise<AdSpecSummary[]> {
  await simulateLatency(60, 140);
  return adSpecCatalog.map(toSummary);
}

export async function getAdSpec(specId: string): Promise<StudioAdSpec> {
  await simulateLatency(60, 140);
  const entry = findCatalogEntry(specId);
  return { summary: toSummary(entry), spec: entry.spec, elements: toStudioElements(entry.spec) };
}

export async function getSurfaceProfiles(): Promise<SurfaceDescriptor[]> {
  await simulateLatency(40, 100);
  return [...surfaceCatalog];
}

export async function getRecentResolutions(): Promise<RecentResolution[]> {
  await simulateLatency(40, 100);
  return [...recentResolutions].sort((a, b) => (a.resolvedAt < b.resolvedAt ? 1 : -1));
}

export interface ResolveLayoutOptions {
  readonly specId?: string;
  readonly surfaceId?: SurfaceId;
}

/**
 * The one call that actually runs the resolver. specId/surfaceId default
 * to the primary campaign and its first surface so callers can resolve
 * without needing to know the catalog shape up front.
 */
export async function resolveLayout(options: ResolveLayoutOptions = {}): Promise<StudioResolution> {
  const specId = options.specId ?? defaultSpecId;
  const surfaceId = options.surfaceId ?? defaultSurfaceId;

  setConnectionStatus("connecting");
  try {
    await simulateLatency();
    const entry = findCatalogEntry(specId);
    const surface = findSurface(surfaceId);

    // The resolver itself can throw (a genuinely infeasible spec/surface
    // combination) — that's a real error state the UI must show, not
    // something the adapter should paper over.
    const layout = runResolver(entry.spec, surface.profile);

    const resolvedAt = new Date().toISOString();
    lastResolvedAt.set(specId, resolvedAt);
    recentResolutions.unshift({
      id: `${specId}:${surfaceId}:${resolvedAt}`,
      specId,
      specName: entry.meta.campaignName,
      surfaceId,
      surfaceName: surface.name,
      resolvedAt,
      fitScore: layout.diagnostics.fitScore,
      strategy: layout.diagnostics.strategy,
    });
    if (recentResolutions.length > 8) recentResolutions.length = 8;

    setConnectionStatus("connected");
    return {
      spec: toSummary(entry),
      elements: toStudioElements(entry.spec),
      surface,
      layout,
      degradationOrder: describeDegradationOrder(entry.spec),
    };
  } catch (err) {
    setConnectionStatus("connected"); // the resolver refused the layout; the adapter/API itself is still up
    throw err;
  }
}
