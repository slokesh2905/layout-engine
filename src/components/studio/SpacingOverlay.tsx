/**
 * Measurement lines between consecutive elements along the resolved main
 * axis, with the real gap in px — computed from the same resolved
 * coordinates the canvas renders, not a guessed grid. Toggled by the
 * Surface Toolbar's "Spacing" control.
 */
import type { ResolvedElementLayout } from "../../lib/types.js";
import { formatPx } from "../../lib/formatters.js";

interface SpacingOverlayProps {
  readonly elements: readonly ResolvedElementLayout[];
  readonly axis: "vertical" | "horizontal";
}

interface Gap {
  readonly key: string;
  readonly size: number;
  readonly mainStart: number;
  readonly crossCenter: number;
}

function computeGaps(elements: readonly ResolvedElementLayout[], axis: "vertical" | "horizontal"): Gap[] {
  const sorted = [...elements].sort((a, b) => (axis === "vertical" ? a.y - b.y : a.x - b.x));
  const gaps: Gap[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    const size = axis === "vertical" ? b.y - (a.y + a.height) : b.x - (a.x + a.width);
    if (size <= 0.5) continue;
    const mainStart = axis === "vertical" ? a.y + a.height : a.x + a.width;
    const aCross = axis === "vertical" ? a.x + a.width / 2 : a.y + a.height / 2;
    const bCross = axis === "vertical" ? b.x + b.width / 2 : b.y + b.height / 2;
    gaps.push({ key: `${a.id}-${b.id}`, size, mainStart, crossCenter: (aCross + bCross) / 2 });
  }
  return gaps;
}

export function SpacingOverlay({ elements, axis }: SpacingOverlayProps) {
  const gaps = computeGaps(elements, axis);
  if (gaps.length === 0) return null;

  return (
    <div className="spacing-overlay" aria-hidden="true">
      {gaps.map((gap) => (
        <div
          key={gap.key}
          className={`spacing-overlay__line spacing-overlay__line--${axis}`}
          style={
            axis === "vertical"
              ? { top: gap.mainStart, left: gap.crossCenter, height: gap.size }
              : { left: gap.mainStart, top: gap.crossCenter, width: gap.size }
          }
        >
          <span className="spacing-overlay__label mono">{formatPx(gap.size)}</span>
        </div>
      ))}
    </div>
  );
}
