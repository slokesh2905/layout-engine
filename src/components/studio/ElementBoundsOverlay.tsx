/**
 * A dedicated layer that outlines every resolved element's bounding box at
 * once (id + true resolved dimensions), independent of hover/selection —
 * that's what ResolvedElementView's own hover/selected outline already
 * covers. Toggled by the Surface Toolbar's "Element Bounds" control.
 */
import type { ResolvedElementLayout } from "../../lib/types.js";
import { formatDimensions } from "../../lib/formatters.js";

interface ElementBoundsOverlayProps {
  readonly elements: readonly ResolvedElementLayout[];
}

export function ElementBoundsOverlay({ elements }: ElementBoundsOverlayProps) {
  return (
    <div className="element-bounds-overlay" aria-hidden="true">
      {elements.map((element) => (
        <div
          key={element.id}
          className="element-bounds-overlay__box"
          style={{ left: element.x, top: element.y, width: element.width, height: element.height }}
        >
          <span className="element-bounds-overlay__label mono">
            {element.id} · {formatDimensions(element.width, element.height)}
          </span>
        </div>
      ))}
    </div>
  );
}
