/**
 * Composition metadata — every value here is read off `layout`/`diagnostics`
 * (the resolver's own output), never a string keyed on a surface id. The
 * "composition" line is literally `diagnostics.strategy`, the exact label
 * `resolveLayout()` derived from the resolved axis and whether it degraded.
 */
import { formatPx, toTitleCase } from "../../lib/formatters.js";
import type { ResolvedLayout } from "../../lib/types.js";

interface StrategySummaryProps {
  readonly layout: ResolvedLayout;
}

function contentDensity(layout: ResolvedLayout): number {
  const contentArea = layout.visible.reduce((sum, el) => sum + el.width * el.height, 0);
  const surfaceArea = layout.surfaceWidth * layout.surfaceHeight;
  if (surfaceArea <= 0) return 0;
  return Math.round((contentArea / surfaceArea) * 100);
}

function safeAreaLabel(layout: ResolvedLayout): string {
  const { top, right, bottom, left } = layout.safeArea;
  if (top === 0 && right === 0 && bottom === 0 && left === 0) return "None";
  return `T${top} R${right} B${bottom} L${left}`;
}

export function StrategySummary({ layout }: StrategySummaryProps) {
  const rows: readonly [string, string][] = [
    ["Composition", toTitleCase(layout.diagnostics.strategy)],
    ["Primary axis", toTitleCase(layout.axis)],
    ["Content density", `${contentDensity(layout)}%`],
    ["Safe area inset", safeAreaLabel(layout)],
    ["Overflow", layout.diagnostics.clippedCount > 0 ? `${layout.diagnostics.clippedCount} clipped` : "None"],
    ["Surface size", `${formatPx(layout.surfaceWidth)} × ${formatPx(layout.surfaceHeight)}`],
  ];

  return (
    <dl className="strategy-summary mono">
      {rows.map(([label, value]) => (
        <div className="strategy-summary__row" key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
