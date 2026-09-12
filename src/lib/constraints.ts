/**
 * The one place that decides pass/fail for a resolved layout's hard
 * constraints — shared by <ConstraintChecklist> (one surface, in the
 * Resolution Panel) and the /validation page (every spec × surface
 * combination), so the two never drift into disagreeing about what
 * "passing" means. Every check reads real fields off `layout`/`surface`;
 * a constraint that doesn't apply to a given surface reports "n/a", never
 * a fabricated pass.
 */
import type { ResolvedLayout, SurfaceProfile } from "./types.js";

export type CheckResult = "pass" | "fail" | "n/a";

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

  return checks;
}
