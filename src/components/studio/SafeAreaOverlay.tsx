/**
 * Draws the resolver's actual resolved safe-area inset (never a guessed or
 * hardcoded margin) as a dashed boundary over the stage, with the inset
 * distances labeled on the edges that have one.
 */
import type { SafeArea } from "../../lib/types.js";
import { formatPx } from "../../lib/formatters.js";

interface SafeAreaOverlayProps {
  readonly surfaceWidth: number;
  readonly surfaceHeight: number;
  readonly safeArea: SafeArea;
}

export function SafeAreaOverlay({ surfaceWidth, surfaceHeight, safeArea }: SafeAreaOverlayProps) {
  return (
    <div className="safe-area-overlay" style={{ width: surfaceWidth, height: surfaceHeight }} aria-hidden="true">
      <div
        className="safe-area-overlay__inset"
        style={{ top: safeArea.top, right: safeArea.right, bottom: safeArea.bottom, left: safeArea.left }}
      >
        {safeArea.top > 0 ? <span className="safe-area-overlay__label safe-area-overlay__label--top mono">{formatPx(safeArea.top)}</span> : null}
        {safeArea.left > 0 ? <span className="safe-area-overlay__label safe-area-overlay__label--left mono">{formatPx(safeArea.left)}</span> : null}
        {safeArea.right > 0 ? <span className="safe-area-overlay__label safe-area-overlay__label--right mono">{formatPx(safeArea.right)}</span> : null}
        {safeArea.bottom > 0 ? (
          <span className="safe-area-overlay__label safe-area-overlay__label--bottom mono">{formatPx(safeArea.bottom)}</span>
        ) : null}
      </div>
    </div>
  );
}
