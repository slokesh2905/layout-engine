/**
 * Static descriptors the adapter (./api.ts) serves. Nothing here computes
 * a layout — surface *profiles* come straight from ../surfaces.ts (the
 * same ones resolver.test.ts exercises) and ad *specs* straight from
 * ../demoSpec.ts; this file only adds the display metadata (names,
 * one-line descriptions, context labels) a UI needs but a pure resolver
 * function has no reason to know about.
 */
import {
  broadcastLowerThird,
  mobileLandscape,
  mobilePortrait,
  retailKiosk,
  tinyBadge,
} from "../surfaces.js";
import type { SurfaceDescriptor, SurfaceId } from "./types.js";

export const surfaceCatalog: readonly SurfaceDescriptor[] = [
  {
    id: "mobile-portrait",
    name: "Mobile Portrait",
    profile: mobilePortrait,
    contextLabel: "Touch",
    description: "Vertical stack for in-feed and story placements.",
  },
  {
    id: "mobile-landscape",
    name: "Mobile Landscape",
    profile: mobileLandscape,
    contextLabel: "Touch",
    description: "Horizontal split for landscape video companion units.",
  },
  {
    id: "broadcast-lower-third",
    name: "Broadcast Lower Third",
    profile: broadcastLowerThird,
    contextLabel: "Far viewing",
    description: "Wide, large-type composition readable from across a room.",
  },
  {
    id: "square-kiosk",
    name: "Square Kiosk",
    profile: retailKiosk,
    contextLabel: "Touch",
    description: "Balanced retail composition for a touch kiosk display.",
  },
  {
    id: "compact-badge",
    name: "Compact Badge",
    profile: tinyBadge,
    contextLabel: "Constrained",
    description: "Deliberately tight surface — forces the resolver to degrade.",
  },
];

export function findSurface(id: SurfaceId): SurfaceDescriptor {
  const found = surfaceCatalog.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown surface id "${id}".`);
  return found;
}

export const defaultSurfaceId: SurfaceId = "mobile-portrait";
