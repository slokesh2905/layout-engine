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
import type { AdSpecCatalogEntry } from "../demoSpec.js";
import { elementContent, elementSrc } from "../spec.js";
import type { AdSpec } from "../spec.js";
import { describeDegradationOrder, resolveLayout as runResolver } from "../resolver.js";
import { defaultSurfaceId, findSurface, surfaceCatalog } from "./mock-data.js";
import { loadCustomSpecs, loadMetaOverrides, saveCustomSpecs, saveMetaOverrides } from "./customSpecStorage.js";
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

// Specs added via "Import Spec" (see ../lib/specFile.ts) for the rest of
// this session — session-only, matching the app's no-backend/no-persistence
// design; gone on tab *close*, but — as of Phase I — no longer gone on a
// plain refresh: loadCustomSpecs() (../lib/customSpecStorage.ts) rehydrates
// whatever sessionStorage last saved, so a spec someone spent ten minutes
// building doesn't vanish to an accidental reload. Every reader below goes
// through allCatalogEntries() rather than adSpecCatalog directly, so an
// imported spec behaves identically to a built-in one everywhere — the
// Specs page, the Studio's spec picker, and the Validation matrix all need
// zero changes to pick it up (or to pick up a restored one).
const customSpecs: AdSpecCatalogEntry[] = loadCustomSpecs();
let customSpecCounter = 0;

// Phase H: campaign-meta edits made from the Studio's "Campaign" tab,
// keyed by spec id — kept separate from `customSpecs`/`adSpecCatalog`
// rather than mutated in place, since `adSpecCatalog`'s entries are
// `readonly` (see ../demoSpec.ts) and a built-in spec's meta needs to stay
// editable too, not just an imported one. `toSummary()` below is the one
// place that reads this back in, so every consumer (the Specs page, the
// Studio's spec picker, Export Spec, a bundle export) sees an edited name
// without needing its own special case. Phase I: also rehydrated from
// sessionStorage on load, same refresh-survives contract as `customSpecs`
// above — a renamed built-in demo or a renamed import both stay renamed
// across a refresh now, not just for the rest of the in-memory session.
const metaOverrides = new Map<string, ImportSpecMeta>(loadMetaOverrides());

function allCatalogEntries(): readonly AdSpecCatalogEntry[] {
  return [...adSpecCatalog, ...customSpecs];
}

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
  const entry = allCatalogEntries().find((e) => e.id === specId);
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
    src: elementSrc(el),
    weight: el.weight,
  }));
}

function toSummary(entry: (typeof adSpecCatalog)[number]): AdSpecSummary {
  const meta = metaOverrides.get(entry.id) ?? entry.meta;
  const requiredCount = entry.spec.elements.filter((e) => e.priority === 1).length;
  return {
    id: entry.id,
    name: meta.campaignName,
    version: entry.version,
    brand: meta.brand,
    supportingCopy: meta.supportingCopy,
    elementCount: entry.spec.elements.length,
    requiredCount,
    degradableCount: entry.spec.elements.length - requiredCount,
    lastResolvedAt: lastResolvedAt.get(entry.id) ?? null,
    status: entry.status,
    // True for anything added via Import/Paste/New this session, false for
    // the 3 built-in demo specs — this is exactly `deleteSpec()`'s eligibility
    // check below, surfaced so the UI (StudioTopBar.tsx's delete button) can
    // gate on it without re-deriving "is this id in customSpecs" itself.
    isCustom: customSpecs.some((custom) => custom.id === entry.id),
  };
}

// ---------------------------------------------------------------------------
// Public adapter surface
// ---------------------------------------------------------------------------

export async function getAdSpecs(): Promise<AdSpecSummary[]> {
  await simulateLatency(60, 140);
  return allCatalogEntries().map(toSummary);
}

export interface ImportSpecMeta {
  readonly campaignName: string;
  readonly brand: string;
  readonly supportingCopy: string;
}

/**
 * Adds a spec parsed from an imported "spec file" (../lib/specFile.ts does
 * the parsing/validation — this function trusts its input is already a
 * valid `AdSpec`) to the catalog for the rest of this session. Mirrors how
 * `resolveLayout()` already tracks `recentResolutions` as module state:
 * there's no backend to persist to, so "the catalog" just grows in memory.
 */
export async function importSpec(meta: ImportSpecMeta, spec: AdSpec): Promise<AdSpecSummary> {
  await simulateLatency(40, 100);
  customSpecCounter += 1;
  const entry: AdSpecCatalogEntry = {
    id: `imported-${Date.now()}-${customSpecCounter}`,
    version: "imported",
    status: "ready",
    spec,
    meta,
  };
  customSpecs.push(entry);
  saveCustomSpecs(customSpecs);
  return toSummary(entry);
}

/**
 * Phase H: renames a spec's campaign details from the Studio's "Campaign"
 * tab — works identically for a built-in spec or one imported this session,
 * since both go through the same `metaOverrides` map rather than mutating
 * either `adSpecCatalog` (readonly by design) or a `customSpecs` entry in
 * place. Throws the same "unknown ad spec id" `findCatalogEntry` already
 * throws everywhere else if `specId` doesn't exist.
 */
export async function updateSpecMeta(specId: string, meta: ImportSpecMeta): Promise<AdSpecSummary> {
  await simulateLatency(30, 80);
  const entry = findCatalogEntry(specId);
  metaOverrides.set(specId, meta);
  saveMetaOverrides(metaOverrides);
  return toSummary(entry);
}

/**
 * Deletes a spec added this session (Import/Paste/New) from the catalog for
 * good. Built-in demo specs are structurally protected: `adSpecCatalog` is
 * never touched here, only `customSpecs`, so there is no code path that can
 * delete one — this throws rather than silently no-op'ing if asked to,
 * matching this file's habit of surfacing a clear error over papering one
 * over (see findCatalogEntry's own "Unknown ad spec id"). Also drops any
 * `metaOverrides`/`lastResolvedAt` entry for the id and re-persists both
 * `customSpecs` and `metaOverrides` to sessionStorage (../lib/customSpecStorage.ts)
 * — without that last step a deleted spec would silently reappear after the
 * next refresh, since Phase I's persistence would still be holding the
 * pre-delete snapshot.
 */
export async function deleteSpec(specId: string): Promise<void> {
  await simulateLatency(30, 80);
  const index = customSpecs.findIndex((entry) => entry.id === specId);
  if (index === -1) {
    const isBuiltIn = adSpecCatalog.some((entry) => entry.id === specId);
    throw new Error(isBuiltIn ? `Built-in spec "${specId}" cannot be deleted.` : `Unknown ad spec id "${specId}".`);
  }
  customSpecs.splice(index, 1);
  metaOverrides.delete(specId);
  lastResolvedAt.delete(specId);
  saveCustomSpecs(customSpecs);
  saveMetaOverrides(metaOverrides);
}

export interface SpecBundleEntry {
  readonly meta: ImportSpecMeta;
  readonly spec: AdSpec;
}

/**
 * Phase H: every spec imported this session (never a built-in one — see
 * ../lib/specBundle.ts's doc comment on why a bundle is scoped to just
 * these), meta-override applied, ready to hand to `serializeSpecBundle()`.
 */
export async function getCustomSpecs(): Promise<SpecBundleEntry[]> {
  await simulateLatency(20, 60);
  return customSpecs.map((entry) => ({ meta: metaOverrides.get(entry.id) ?? entry.meta, spec: entry.spec }));
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
      rawSpec: entry.spec,
    };
  } catch (err) {
    setConnectionStatus("connected"); // the resolver refused the layout; the adapter/API itself is still up
    throw err;
  }
}
