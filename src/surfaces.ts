/**
 * Surface profiles: real constraints, not just width/height. The resolver
 * (resolver.ts) never imports this file and never checks a surface's
 * identity — every profile below is just data the resolver consumes
 * through the same generic path an unseen 5th surface would use.
 */
export interface SafeArea {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface SurfaceProfile {
  readonly width: number;
  readonly height: number;
  /** Inset from the surface edges nothing should be placed inside. Defaults to zero on all sides. */
  readonly safeArea?: Partial<SafeArea>;
  /** Minimum tappable width/height for interactive elements (buttons), in px. */
  readonly minTapTarget?: number;
  /** Minimum font size for text, in px — set on far-viewing-distance surfaces (broadcast, billboards). */
  readonly minTextSize?: number;
  readonly viewingDistance?: "near" | "far";
  readonly touchOnly?: boolean;
}

export function resolveSafeArea(safeArea: SurfaceProfile["safeArea"]): SafeArea {
  return {
    top: safeArea?.top ?? 0,
    right: safeArea?.right ?? 0,
    bottom: safeArea?.bottom ?? 0,
    left: safeArea?.left ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Example profiles used by the demo app's surface picker.
// ---------------------------------------------------------------------------

export const mobilePortrait: SurfaceProfile = {
  width: 320,
  height: 480,
  safeArea: { top: 16, right: 12, bottom: 16, left: 12 },
  minTapTarget: 44,
  touchOnly: true,
};

export const mobileLandscape: SurfaceProfile = {
  width: 480,
  height: 320,
  safeArea: { top: 12, right: 16, bottom: 12, left: 16 },
  minTapTarget: 44,
  touchOnly: true,
};

export const broadcastLowerThird: SurfaceProfile = {
  width: 1920,
  height: 250,
  safeArea: { top: 8, right: 48, bottom: 8, left: 48 },
  viewingDistance: "far",
  minTextSize: 32,
};

export const retailKiosk: SurfaceProfile = {
  width: 1080,
  height: 1080,
  safeArea: { top: 24, right: 24, bottom: 24, left: 24 },
  minTapTarget: 60,
  touchOnly: true,
};

/**
 * Deliberately too little space for every element at full priority — this
 * is the profile the brief asks the demo to include, to show priority
 * degradation (branding drops) rather than overlap/clipping.
 */
export const tinyBadge: SurfaceProfile = {
  width: 80,
  height: 50,
};

export const demoSurfaces: Record<string, SurfaceProfile> = {
  "Mobile portrait": mobilePortrait,
  "Mobile landscape": mobileLandscape,
  "Broadcast lower-third": broadcastLowerThird,
  "Retail kiosk (square)": retailKiosk,
  "Tiny badge (forces degradation)": tinyBadge,
};
