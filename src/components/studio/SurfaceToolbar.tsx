/**
 * The floating dock over the stage — what used to be a full-width toolbar
 * row is now one dismissable strip: a true-aspect glyph + name/dims per
 * surface (so the shape of the target is visible before you switch), a
 * "Custom" chip that jumps to the Surface tab, then safe-area / element
 * bounds / zoom. Selecting a surface here only changes which
 * `SurfaceProfile` gets passed into `resolveLayout()` upstream — every
 * visual difference in the canvas still comes back out of the resolver,
 * never out of this component.
 */
import { Icon } from "../ui/Icon.js";
import { formatDimensions } from "../../lib/formatters.js";
import type { SurfaceDescriptor, SurfaceId, ZoomMode } from "../../lib/types.js";
import "./SurfaceToolbar.css";

interface SurfaceToolbarProps {
  readonly surfaces: readonly SurfaceDescriptor[];
  readonly activeSurfaceId: SurfaceId | null;
  readonly onSurfaceChange: (id: SurfaceId) => void;
  readonly customActive: boolean;
  readonly customDims: string;
  readonly onPickCustom: () => void;
  readonly safeArea: boolean;
  readonly onToggleSafeArea: () => void;
  readonly elementBounds: boolean;
  readonly onToggleElementBounds: () => void;
  readonly zoom: ZoomMode;
  readonly onToggleZoom: () => void;
}

function AspectGlyph({ width, height, active }: { readonly width: number; readonly height: number; readonly active: boolean }) {
  const ratio = width / height;
  const w = ratio >= 1 ? 16 : Math.max(4, 16 * ratio);
  const h = ratio >= 1 ? Math.max(3, 16 / ratio) : 16;
  return (
    <span className="surface-toolbar__glyph-outer">
      <span className={`surface-toolbar__glyph${active ? " surface-toolbar__glyph--active" : ""}`} style={{ width: w, height: h }} />
    </span>
  );
}

export function SurfaceToolbar({
  surfaces,
  activeSurfaceId,
  onSurfaceChange,
  customActive,
  customDims,
  onPickCustom,
  safeArea,
  onToggleSafeArea,
  elementBounds,
  onToggleElementBounds,
  zoom,
  onToggleZoom,
}: SurfaceToolbarProps) {
  return (
    <div className="surface-toolbar">
      <div className="surface-toolbar__chips" role="radiogroup" aria-label="Surface">
        {surfaces.map((surface) => {
          const active = !customActive && surface.id === activeSurfaceId;
          return (
            <button
              key={surface.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`surface-toolbar__chip${active ? " surface-toolbar__chip--active" : ""}`}
              onClick={() => onSurfaceChange(surface.id as SurfaceId)}
              title={surface.description}
            >
              <AspectGlyph width={surface.profile.width} height={surface.profile.height} active={active} />
              <span className="surface-toolbar__chip-text">
                <span className="surface-toolbar__chip-name">{surface.name}</span>
                <span className="surface-toolbar__chip-dims mono">{formatDimensions(surface.profile.width, surface.profile.height)}</span>
              </span>
            </button>
          );
        })}

        <button
          type="button"
          role="radio"
          aria-checked={customActive}
          className={`surface-toolbar__chip${customActive ? " surface-toolbar__chip--active" : ""}`}
          onClick={onPickCustom}
          title="Type any constraints in the Surface tab"
        >
          <span className="surface-toolbar__glyph-outer">
            <span className={`surface-toolbar__glyph surface-toolbar__glyph--dashed${customActive ? " surface-toolbar__glyph--active" : ""}`} />
          </span>
          <span className="surface-toolbar__chip-text">
            <span className="surface-toolbar__chip-name">Custom</span>
            <span className="surface-toolbar__chip-dims mono">{customActive ? customDims : "type it"}</span>
          </span>
        </button>
      </div>

      <div className="surface-toolbar__divider" aria-hidden="true" />

      <button
        type="button"
        className={`surface-toolbar__toggle${safeArea ? " surface-toolbar__toggle--on" : ""}`}
        onClick={onToggleSafeArea}
        title="Safe area overlay"
        aria-pressed={safeArea}
      >
        <Icon name="corners" size={15} />
      </button>
      <button
        type="button"
        className={`surface-toolbar__toggle${elementBounds ? " surface-toolbar__toggle--on" : ""}`}
        onClick={onToggleElementBounds}
        title="Element bounds"
        aria-pressed={elementBounds}
      >
        <Icon name="bounding-box" size={15} />
      </button>
      <button
        type="button"
        className={`surface-toolbar__toggle surface-toolbar__toggle--zoom${zoom === "100" ? " surface-toolbar__toggle--on" : ""}`}
        onClick={onToggleZoom}
        title="Zoom"
      >
        <span className="mono">{zoom === "fit" ? "FIT" : "1:1"}</span>
      </button>
    </div>
  );
}
