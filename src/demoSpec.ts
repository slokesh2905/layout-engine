import { defineAd } from "./spec.js";
import type { AdSpec } from "./spec.js";

/**
 * The one ad spec exercised by the resolver test suite (test/resolver.test.ts
 * imports `productAd` directly) and used as the default/active spec in the
 * Adaptive Layout Studio frontend (see src/lib, src/components/studio). A
 * realistic product-ad shape: headline + hero image tied for top priority,
 * CTA + price sharing the next tier, branding least important — matching
 * the priorities used in the assignment's own example.
 *
 * Content: the Aurora Hydration Launch campaign.
 */
export const productAd = defineAd({
  elements: [
    { id: "headline", type: "text", role: "primary", priority: 1, text: "Hydration that keeps up." },
    { id: "product-image", type: "image", role: "hero", priority: 1, src: "/aurora-bottle.png", alt: "Aurora Hydration bottle" },
    { id: "cta", type: "button", role: "action", priority: 2, label: "Shop now" },
    { id: "price", type: "text", role: "secondary", priority: 2, text: "$29.99" },
    { id: "logo", type: "image", role: "branding", priority: 3, src: "/aurora-logo.png", alt: "AURORA" },
  ],
});

/** Campaign-level metadata that isn't part of the resolved layout itself — spec.ts and resolver.ts never see this. */
export const productAdMeta = {
  campaignName: "Aurora Hydration Launch",
  brand: "AURORA",
  supportingCopy: "Clean electrolytes. Zero noise.",
} as const;

// ---------------------------------------------------------------------------
// Two more real, `defineAd()`-validated specs for the same AURORA brand, so
// /specs has more than one project tile to show and the studio can
// demonstrate the same generic resolver working across genuinely different
// element counts/priority shapes — not just genuinely different surfaces.
// ---------------------------------------------------------------------------

export const refillSubscriptionAd = defineAd({
  elements: [
    { id: "headline", type: "text", role: "primary", priority: 1, text: "Never run dry again." },
    { id: "product-image", type: "image", role: "hero", priority: 1, src: "/aurora-bottle.png", alt: "Aurora Hydration refill pack" },
    { id: "cta", type: "button", role: "action", priority: 2, label: "Start subscription" },
    { id: "logo", type: "image", role: "branding", priority: 3, src: "/aurora-logo.png", alt: "AURORA" },
  ],
});

export const refillSubscriptionAdMeta = {
  campaignName: "Aurora Refill Subscription",
  brand: "AURORA",
  supportingCopy: "Auto-delivered every 30 days.",
} as const;

export const retailCountdownAd = defineAd({
  elements: [
    { id: "headline", type: "text", role: "primary", priority: 1, text: "48 hours only." },
    { id: "product-image", type: "image", role: "hero", priority: 1, src: "/aurora-bottle.png", alt: "Aurora Hydration launch bundle" },
    { id: "price", type: "text", role: "secondary", priority: 2, text: "$29.99 → $19.99" },
    { id: "cta", type: "button", role: "action", priority: 2, label: "Shop the drop" },
    { id: "logo", type: "image", role: "branding", priority: 3, src: "/aurora-logo.png", alt: "AURORA" },
  ],
});

export const retailCountdownAdMeta = {
  campaignName: "Aurora Retail Countdown",
  brand: "AURORA",
  supportingCopy: "Limited launch pricing, in kiosk and app.",
} as const;

export interface AdSpecCatalogEntry {
  readonly id: string;
  readonly version: string;
  readonly status: "ready" | "needs-review";
  readonly spec: AdSpec;
  readonly meta: { readonly campaignName: string; readonly brand: string; readonly supportingCopy: string };
}

/** Every spec the Studio frontend knows about, keyed by the id used in routes/URLs. */
export const adSpecCatalog: readonly AdSpecCatalogEntry[] = [
  { id: "aurora-hydration-launch", version: "v12", status: "ready", spec: productAd, meta: productAdMeta },
  {
    id: "aurora-refill-subscription",
    version: "v3",
    status: "needs-review",
    spec: refillSubscriptionAd,
    meta: refillSubscriptionAdMeta,
  },
  { id: "aurora-retail-countdown", version: "v7", status: "ready", spec: retailCountdownAd, meta: retailCountdownAdMeta },
];

export const defaultSpecId: string = adSpecCatalog[0]!.id;
