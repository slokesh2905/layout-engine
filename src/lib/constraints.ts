/**
 * The one place that decides pass/fail for a resolved layout's hard
 * constraints — shared by <ConstraintChecklist> (one surface, in the
 * Resolution Panel) and the /validation page (every spec × surface
 * combination), so the two never drift into disagreeing about what
 * "passing" means. Every check reads real fields off `layout`/`surface`;
 * a constraint that doesn't apply to a given surface reports "n/a", never
 * a fabricated pass.
 */
import { AD_BOARD_COLORS, textColorFor } from "./renderLayout.js";
import { compositeOver, contrastRatio, parseColor, requiredContrastRatio } from "./contrast.js";
import type { ResolvedLayout, SurfaceProfile } from "./types.js";

export type CheckResult = "pass" | "fail" | "n/a";

interface ContrastViolation {
  readonly elementId: string;
  readonly ratio: number;
  readonly required: number;
}

/**
 * A real WCAG 2.1 contrast check against the ad board's actual fixed
 * palette (see ./contrast.ts and ./renderLayout.ts's own doc comments) —
 * not a fabricated pass. "Text" elements use `textColorFor(role)` on the
 * paper background (secondary role renders as translucent ink, so its
 * *effective* color — and therefore its ratio — depends on what it's
 * composited over); "button" elements use the paper-colored label on the
 * ink-filled pill. Each element's own resolved `fontSize` picks which of
 * the two WCAG thresholds applies, so a role/size combination that's fine
 * on a spacious surface can genuinely start failing once a constrained
 * surface shrinks it below 24px — this isn't a constant true/false, it's
 * measured per element, per resolution.
 */
function checkTextContrast(layout: ResolvedLayout): ContrastViolation[] {
  const paper = parseColor(AD_BOARD_COLORS.paper);
  const ink = parseColor(AD_BOARD_COLORS.ink);
  const violations: ContrastViolation[] = [];

  for (const el of layout.visible) {
    if (el.type === "text") {
      const fg = compositeOver(parseColor(textColorFor(el.role)), paper);
      const ratio = contrastRatio(fg, paper);
      const required = requiredContrastRatio(el.fontSize);
      if (ratio < required) violations.push({ elementId: el.id, ratio, required });
    } else if (el.type === "button") {
      // The label is always the opaque, un-translucent --paper color, so
      // compositing is a no-op here — going through the same
      // compositeOver()/contrastRatio() path anyway keeps this branch
      // structurally identical to the "text" one rather than special-cased.
      const fg = compositeOver(parseColor(AD_BOARD_COLORS.paper), ink);
      const ratio = contrastRatio(fg, ink);
      const required = requiredContrastRatio(el.fontSize);
      if (ratio < required) violations.push({ elementId: el.id, ratio, required });
    }
  }

  return violations;
}

export interface Check {
  readonly label: string;
  readonly detail: string;
  readonly result: CheckResult;
}

export function buildConstraintChecks(layout: ResolvedLayout, surface: SurfaceProfile): Check[] {
  const checks: Check[] = [];

  checks.push({
    label: "No element overlap",
    detail:
      layout.diagnostics.overlapCount === 0
        ? "All visible elements occupy distinct space."
        : `${layout.diagnostics.overlapCount} overlapping pair(s).`,
    result: layout.diagnostics.overlapCount === 0 ? "pass" : "fail",
  });

  checks.push({
    label: "No clipping outside surface",
    detail:
      layout.diagnostics.clippedCount === 0
        ? "Every element stays within surface bounds."
        : `${layout.diagnostics.clippedCount} element(s) extend past the edge.`,
    result: layout.diagnostics.clippedCount === 0 ? "pass" : "fail",
  });

  const safeAreaViolations = layout.visible.filter(
    (el) =>
      el.x < layout.safeArea.left ||
      el.y < layout.safeArea.top ||
      el.x + el.width > layout.surfaceWidth - layout.safeArea.right ||
      el.y + el.height > layout.surfaceHeight - layout.safeArea.bottom,
  );
  checks.push({
    label: "Safe area respected",
    detail:
      safeAreaViolations.length === 0
        ? "No element intrudes on the safe-area inset."
        : `${safeAreaViolations.length} element(s) inside the safe-area inset.`,
    result: safeAreaViolations.length === 0 ? "pass" : "fail",
  });

  if (surface.touchOnly && surface.minTapTarget) {
    const minTapTarget = surface.minTapTarget;
    const buttons = layout.visible.filter((el) => el.type === "button");
    const violations = buttons.filter((el) => el.width < minTapTarget || el.height < minTapTarget);
    checks.push({
      label: "Minimum tap target",
      detail:
        violations.length === 0
          ? `All buttons meet the ${minTapTarget}px tap target.`
          : `${violations.length} button(s) below ${minTapTarget}px.`,
      result: violations.length === 0 ? "pass" : "fail",
    });
  } else {
    checks.push({ label: "Minimum tap target", detail: "Surface isn't touch-only.", result: "n/a" });
  }

  if (surface.minTextSize) {
    const minTextSize = surface.minTextSize;
    const textLike = layout.visible.filter((el) => el.type === "text" || el.type === "button");
    const violations = textLike.filter((el) => el.fontSize < minTextSize);
    checks.push({
      label: "Minimum text size",
      detail:
        violations.length === 0 ? `All text meets the ${minTextSize}px floor.` : `${violations.length} element(s) below ${minTextSize}px.`,
      result: violations.length === 0 ? "pass" : "fail",
    });
  } else {
    checks.push({ label: "Minimum text size", detail: "Surface doesn't set a minimum text size.", result: "n/a" });
  }

  const textLikeVisible = layout.visible.filter((el) => el.type === "text" || el.type === "button");
  if (textLikeVisible.length === 0) {
    checks.push({ label: "Text contrast (WCAG)", detail: "No text or button elements in this layout.", result: "n/a" });
  } else {
    const violations = checkTextContrast(layout);
    checks.push({
      label: "Text contrast (WCAG)",
      detail:
        violations.length === 0
          ? "Every text/button element meets its WCAG 2.1 threshold (4.5:1, or 3:1 at 24px+)."
          : `${violations.length} element(s) below their required ratio (worst: ${Math.min(...violations.map((v) => v.ratio)).toFixed(2)}:1, needs ${Math.max(...violations.map((v) => v.required)).toFixed(1)}:1).`,
      result: violations.length === 0 ? "pass" : "fail",
    });
  }

  return checks;
}
