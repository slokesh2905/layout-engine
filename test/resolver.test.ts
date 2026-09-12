import { describe, expect, it } from "vitest";
import { defineAd } from "../src/spec.js";
import { productAd } from "../src/demoSpec.js";
import { resolveLayout } from "../src/resolver.js";
import type { ResolvedLayout } from "../src/resolver.js";
import { broadcastLowerThird, mobileLandscape, mobilePortrait, resolveSafeArea, retailKiosk } from "../src/surfaces.js";
import type { SurfaceProfile } from "../src/surfaces.js";

/**
 * The one invariant the brief treats as non-negotiable at every weight
 * tier ("Never overlaps elements or clips content outside the visible
 * surface bounds"). Checked with zero tolerance — see resolver.ts's
 * boundary-rounding comment for why this is safe to assert exactly.
 */
function expectNoOverlapOrOutOfBounds(layout: ResolvedLayout) {
  for (const el of layout.visible) {
    expect(el.x, `${el.id} x < 0`).toBeGreaterThanOrEqual(0);
    expect(el.y, `${el.id} y < 0`).toBeGreaterThanOrEqual(0);
    expect(el.x + el.width, `${el.id} overflows right edge`).toBeLessThanOrEqual(layout.surfaceWidth);
    expect(el.y + el.height, `${el.id} overflows bottom edge`).toBeLessThanOrEqual(layout.surfaceHeight);

    // A text/button element's fontSize is derived from `heightForFont` in
    // resolver.ts's Pass 4, which — for BOTH axes — ends up mapped to the
    // element's own rendered `height` (vertical axis: heightForFont is the
    // slot's main-axis size, which is the rect's `height`; horizontal
    // axis: heightForFont is the member's cross-axis size, which is *also*
    // the rect's `height` — main/cross swap which axis they measure, but
    // the rect field they land in is always `height`). A fontSize taller
    // than el.height gets clipped by the renderer's overflow:hidden even
    // though the box itself never overlaps or clips at the surface level
    // — exactly the class of bug this assertion catches (see
    // ARCHITECTURE.md's minTextSize cross-axis section).
    if (el.type === "text" || el.type === "button") {
      expect(
        el.fontSize <= el.height,
        `${el.id} fontSize (${el.fontSize}) exceeds its own box height (${el.height})`,
      ).toBe(true);
    }
  }
  for (let i = 0; i < layout.visible.length; i++) {
    for (let j = i + 1; j < layout.visible.length; j++) {
      const a = layout.visible[i]!;
      const b = layout.visible[j]!;
      const overlapsX = a.x < b.x + b.width && b.x < a.x + a.width;
      const overlapsY = a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlapsX && overlapsY, `${a.id} overlaps ${b.id}`).toBe(false);
    }
  }
}

describe("resolveLayout", () => {
  it("mobile portrait resolves to the vertical axis with every element visible", () => {
    const layout = resolveLayout(productAd, mobilePortrait);
    expect(layout.axis).toBe("vertical");
    expect(layout.visible).toHaveLength(5);
    expect(layout.dropped).toHaveLength(0);
    expectNoOverlapOrOutOfBounds(layout);
  });

  it("mobile landscape resolves to the horizontal axis", () => {
    const layout = resolveLayout(productAd, mobileLandscape);
    expect(layout.axis).toBe("horizontal");
    expectNoOverlapOrOutOfBounds(layout);
  });

  it("broadcast lower-third respects minTextSize on text elements", () => {
    const layout = resolveLayout(productAd, broadcastLowerThird);
    expect(layout.axis).toBe("horizontal");
    const headline = layout.visible.find((e) => e.id === "headline")!;
    expect(headline.fontSize).toBeGreaterThanOrEqual(broadcastLowerThird.minTextSize!);
    expectNoOverlapOrOutOfBounds(layout);
  });

  it("retail kiosk keeps the CTA at or above minTapTarget in both dimensions", () => {
    const layout = resolveLayout(productAd, retailKiosk);
    const cta = layout.visible.find((e) => e.id === "cta")!;
    expect(cta.width).toBeGreaterThanOrEqual(retailKiosk.minTapTarget!);
    expect(cta.height).toBeGreaterThanOrEqual(retailKiosk.minTapTarget!);
    expectNoOverlapOrOutOfBounds(layout);
  });

  it("drops the least-important slot (branding) first under a tight vertical surface", () => {
    // width < height -> vertical axis, mainSize ~= 80. Role-floor sum for
    // all 3 slots is 40+32+16=88 > 80, so exactly branding (priority 3)
    // should drop; the rest still fits (72 <= 80).
    const layout = resolveLayout(productAd, { width: 60, height: 80 });
    expect(layout.dropped.map((d) => d.id)).toEqual(["logo"]);
    for (const id of ["headline", "product-image", "cta", "price"]) {
      expect(layout.visible.map((v) => v.id)).toContain(id);
    }
    expectNoOverlapOrOutOfBounds(layout);
  });

  it("degrades strictly by priority, one whole slot at a time", () => {
    // Tighter still (mainSize ~= 60): drops branding (16), then also
    // action+secondary (32), leaving only the priority-1 slot (40 <= 60).
    const layout = resolveLayout(productAd, { width: 50, height: 60 });

    expect(layout.dropped.map((d) => d.id).sort()).toEqual(["cta", "logo", "price"]);
    expect(layout.visible.map((v) => v.id).sort()).toEqual(["headline", "product-image"]);

    const maxVisiblePriority = Math.max(
      ...layout.visible.map((v) => productAd.elements.find((e) => e.id === v.id)!.priority),
    );
    for (const d of layout.dropped) {
      expect(d.priority).toBeGreaterThanOrEqual(maxVisiblePriority);
    }
    expectNoOverlapOrOutOfBounds(layout);
  });

  it("throws a clear error when even priority-1 elements cannot fit", () => {
    expect(() => resolveLayout(productAd, { width: 10, height: 10 })).toThrow(
      /cannot fit even the highest-priority element/,
    );
  });

  it("throws a clear error when a hard constraint can't fit the cross axis", () => {
    // A 60px minTapTarget button inside a ~30px-tall banner is physically
    // impossible, not something to silently overflow.
    expect(() =>
      resolveLayout(productAd, { width: 1900, height: 50, touchOnly: true, minTapTarget: 60 }),
    ).toThrow(/need at least .* combined on the cross axis/);
  });

  it("keeps fontSize within its own box on far-viewing-distance HORIZONTAL surfaces too", () => {
    // Regression test: elementMinCrossSize() used to ignore
    // viewingDistance/minTextSize entirely, so on a horizontal-axis
    // surface (where box *height* comes from the cross axis, not the
    // main axis) a "far" text element's box had no minTextSize-aware
    // floor. The enforced fontSize (still floored correctly) could end up
    // taller than the box it was rendered into and get invisibly clipped
    // by the renderer — technically satisfying the box-level
    // no-overlap/no-out-of-bounds invariant while violating the whole
    // point of minTextSize (legibility at a distance). A surface this
    // shape should now either produce boxes tall enough for their
    // enforced font size, or explicitly refuse.
    const wideAndShort: SurfaceProfile = { width: 2000, height: 60, viewingDistance: "far", minTextSize: 32 };
    try {
      const layout = resolveLayout(productAd, wideAndShort);
      expect(layout.axis).toBe("horizontal");
      expectNoOverlapOrOutOfBounds(layout);
    } catch (err) {
      expect((err as Error).message).toMatch(/need at least .* combined on the cross axis/);
    }
  });

  it("generalizes to an unseen 5th surface with no code changes", () => {
    const unknown5th: SurfaceProfile = { width: 200, height: 1400, safeArea: { top: 20, right: 10, bottom: 20, left: 10 } };
    const layout = resolveLayout(productAd, unknown5th);
    expect(layout.axis).toBe("vertical");
    expectNoOverlapOrOutOfBounds(layout);
  });

  it("never overlaps or clips across a wide, deterministic sweep of synthetic surfaces", () => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    for (let i = 0; i < 500; i++) {
      const width = Math.round(40 + rand() * 2000);
      const height = Math.round(40 + rand() * 2000);
      const touchOnly = rand() > 0.5;
      const surface: SurfaceProfile = {
        width,
        height,
        safeArea: {
          top: Math.round(rand() * 30),
          right: Math.round(rand() * 30),
          bottom: Math.round(rand() * 30),
          left: Math.round(rand() * 30),
        },
        touchOnly,
        minTapTarget: touchOnly ? 40 + Math.round(rand() * 30) : undefined,
        viewingDistance: rand() > 0.7 ? "far" : undefined,
        minTextSize: rand() > 0.7 ? 20 + Math.round(rand() * 20) : undefined,
      };

      try {
        expectNoOverlapOrOutOfBounds(resolveLayout(productAd, surface));
      } catch (err) {
        // The only acceptable failure mode is an explicit refusal.
        expect((err as Error).message).toMatch(
          /cannot fit even the highest-priority element|need at least .* combined on the cross axis/,
        );
      }
    }
  });
});

describe("defineAd", () => {
  it("rejects an empty element list", () => {
    expect(() => defineAd({ elements: [] })).toThrow(/at least one element/);
  });

  it("rejects duplicate ids", () => {
    expect(() =>
      defineAd({
        elements: [
          { id: "a", type: "text", role: "primary", priority: 1, text: "x" },
          { id: "a", type: "text", role: "secondary", priority: 2, text: "y" },
        ],
      }),
    ).toThrow(/duplicate element id/);
  });

  it("rejects a non-positive priority", () => {
    expect(() => defineAd({ elements: [{ id: "a", type: "text", role: "primary", priority: 0, text: "x" }] })).toThrow(
      /invalid priority/,
    );
  });

  it("rejects empty required content per element type", () => {
    expect(() =>
      defineAd({ elements: [{ id: "a", type: "text", role: "primary", priority: 1, text: "   " }] }),
    ).toThrow(/empty `text`/);
  });
});

describe("resolveSafeArea", () => {
  it("defaults missing sides to 0", () => {
    expect(resolveSafeArea({ top: 5 })).toEqual({ top: 5, right: 0, bottom: 0, left: 0 });
  });
});
