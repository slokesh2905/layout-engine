/**
 * The center stage. Renders the actual `ResolvedLayout` the resolver
 * produced — every element's box comes straight from `layout.visible`
 * (left/top/width/height/zIndex applied as-is). The *only* thing this
 * component computes itself is a display `scale` for fitting the surface's
 * true pixel size into the available viewport; that scale is applied once,
 * to the whole stage, via a single CSS `transform: scale()` — never to an
 * individual element's coordinates, and never via a `@media` breakpoint or
 * an `if (surfaceId === ...)` branch. A different surface produces a
 * differently *composed* ad because the resolver placed its elements
 * differently, not because this component reacts to which surface it is.
 *
 * Redesign note: the board is wrapped in a sized "sizer" div and the board
 * itself is transform-scaled from its top-left corner — fit-scaling never
 * changes layout flow. The bottom status bar this used to hand off to
 * <StudioFooter> is now a single mono caption line rendered directly under
 * the board (StudioFooter.tsx still owns that markup, just relocated).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { ResolvedElementView } from "./ResolvedElementView.js";
import { SafeAreaOverlay } from "./SafeAreaOverlay.js";
import { ElementBoundsOverlay } from "./ElementBoundsOverlay.js";
import { SpacingOverlay } from "./SpacingOverlay.js";
import { StudioFooter } from "./StudioFooter.js";
import { formatDimensions, formatPriority } from "../../lib/formatters.js";
import type { CanvasToggles, ResolvedElementLayout, ResolvedLayout, StudioElement, ZoomMode } from "../../lib/types.js";
import "./PreviewCanvas.css";

interface PreviewCanvasProps {
  readonly layout: ResolvedLayout;
  readonly elements: readonly StudioElement[];
  readonly surfaceName: string;
  readonly zoom: ZoomMode;
  readonly toggles: CanvasToggles;
  readonly selectedElementId: string | null;
  readonly hoveredElementId: string | null;
  readonly onSelectElement: (id: string | null) => void;
  readonly onHoverElement: (id: string | null) => void;
  readonly resolving?: boolean;
}

const CANVAS_PADDING = 56;
const MIN_SCALE = 0.05;
const MAX_FIT_SCALE = 6;

function useContainerSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}

export function PreviewCanvas({
  layout,
  elements,
  surfaceName,
  zoom,
  toggles,
  selectedElementId,
  hoveredElementId,
  onSelectElement,
  onHoverElement,
  resolving = false,
}: PreviewCanvasProps) {
  const { ref: containerRef, size: containerSize } = useContainerSize<HTMLDivElement>();

  const contentLookup = useMemo(() => {
    const map = new Map<string, StudioElement>();
    for (const el of elements) map.set(el.id, el);
    return map;
  }, [elements]);

  const fitScale =
    containerSize.width > 0 && containerSize.height > 0
      ? Math.min(
          (containerSize.width - CANVAS_PADDING * 2) / layout.surfaceWidth,
          (containerSize.height - CANVAS_PADDING * 2) / layout.surfaceHeight,
          MAX_FIT_SCALE,
        )
      : 1;
  const scale = zoom === "100" ? 1 : Math.max(MIN_SCALE, fitScale);

  const selected: ResolvedElementLayout | undefined = selectedElementId
    ? layout.visible.find((el) => el.id === selectedElementId)
    : undefined;
  const selectedContent = selected ? contentLookup.get(selected.id) : undefined;
  const selectedDegradation = selected ? layout.degradation.find((d) => d.elementId === selected.id) : undefined;

  return (
    <div className="preview-canvas" onClick={() => onSelectElement(null)}>
      <div className="preview-canvas__viewport" ref={containerRef}>
        <div className="preview-canvas__column">
          <div
            className="preview-canvas__sizer"
            style={{ width: layout.surfaceWidth * scale, height: layout.surfaceHeight * scale }}
          >
            <div
              className="preview-canvas__stage"
              style={{ width: layout.surfaceWidth, height: layout.surfaceHeight, transform: `scale(${scale})` }}
              onClick={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}
            >
              {layout.visible.map((element) => {
                const content = contentLookup.get(element.id);
                return (
                  <ResolvedElementView
                    key={element.id}
                    element={element}
                    content={content?.content ?? ""}
                    priority={content?.priority ?? 0}
                    selected={element.id === selectedElementId}
                    hovered={element.id === hoveredElementId}
                    priorityTint={toggles.priority}
                    onSelect={onSelectElement}
                    onHoverChange={onHoverElement}
                  />
                );
              })}

              {toggles.safeArea ? (
                <SafeAreaOverlay surfaceWidth={layout.surfaceWidth} surfaceHeight={layout.surfaceHeight} safeArea={layout.safeArea} />
              ) : null}
              {toggles.elementBounds ? <ElementBoundsOverlay elements={layout.visible} /> : null}
              {toggles.spacing ? <SpacingOverlay elements={layout.visible} axis={layout.axis} /> : null}

              {selected && selectedContent ? (
                <div
                  className="preview-canvas__info-chip mono"
                  style={{
                    left: Math.min(selected.x, Math.max(0, layout.surfaceWidth - 180)),
                    top: Math.max(0, selected.y - 30),
                  }}
                >
                  <span className="preview-canvas__info-chip-id">{selected.id}</span>
                  <span>{formatDimensions(selected.width, selected.height)}</span>
                  <span>{selectedContent ? formatPriority(selectedContent.priority) : ""}</span>
                  <span>{selected.role}</span>
                  <span className={selectedDegradation ? "preview-canvas__info-chip-warn" : "preview-canvas__info-chip-ok"}>
                    {selectedDegradation ? selectedDegradation.action : "ok"}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <StudioFooter
            surfaceName={surfaceName}
            surfaceDims={formatDimensions(layout.surfaceWidth, layout.surfaceHeight)}
            strategy={layout.diagnostics.strategy}
            countsLabel={`${layout.visible.length} placed · ${layout.dropped.length} dropped`}
            selectedReadout={
              selected
                ? `${selected.id}  x${Math.round(selected.x)} y${Math.round(selected.y)} w${Math.round(selected.width)} h${Math.round(selected.height)} z${selected.zIndex}`
                : null
            }
          />
        </div>
      </div>

      {resolving ? (
        <div className="preview-canvas__resolving" role="status">
          <span className="preview-canvas__resolving-dot" aria-hidden="true" />
          Resolving…
        </div>
      ) : null}

      {layout.visible.length === 0 ? (
        <div className="preview-canvas__empty">No elements fit this surface — every slot was dropped.</div>
      ) : null}
    </div>
  );
}
