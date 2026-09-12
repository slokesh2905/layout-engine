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

/**
 * FLIP-style transitions for whichever `ResolvedLayout` this canvas is
 * currently given — switching surfaces (or any other cause of a
 * re-resolve: a content edit, undo/redo, Compare mode's second pane) is
 * "just" a new `layout.visible` array to this component. Persisting
 * elements already animate their move via the plain CSS transition on
 * `.resolved-element` (left/top/width/height) since they keep the same
 * React key (element id) across renders — nothing new needed there. What
 * *is* new: an element that a surface switch drops or reintroduces used to
 * just vanish/pop in, because React unmounts/mounts it outright the moment
 * it leaves/enters `layout.visible`. This hook keeps a dropped element
 * mounted a little longer (fading + shrinking out) and mounts a newly
 * placed one starting from that same faded/shrunk state before flipping it
 * to visible on the next paint, entirely client-side, entirely layered on
 * top of the resolver's own `visible`/`dropped` split — nothing here
 * changes which elements the resolver placed, only how their appearance
 * and disappearance is presented.
 */
type ElementTransitionPhase = "entering" | "visible" | "exiting";

interface AnimatedElementEntry {
  readonly element: ResolvedElementLayout;
  readonly phase: ElementTransitionPhase;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function useAnimatedElements(visible: readonly ResolvedElementLayout[]): readonly AnimatedElementEntry[] {
  const reducedMotion = usePrefersReducedMotion();
  const [entries, setEntries] = useState<Map<string, AnimatedElementEntry>>(
    () => new Map(visible.map((el) => [el.id, { element: el, phase: "visible" as const }])),
  );
  const pendingRemovals = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    setEntries((prev) => {
      const next = new Map(prev);
      const visibleIds = new Set(visible.map((el) => el.id));

      // No longer resolved as visible: with motion allowed, keep the entry
      // around one more beat marked "exiting" (fades + shrinks via CSS,
      // then a timeout deletes it for real); with reduced motion, drop it
      // immediately — there's no animated state to hold it in.
      for (const [id, entry] of prev) {
        if (visibleIds.has(id) || entry.phase === "exiting") continue;
        if (reducedMotion) {
          next.delete(id);
          continue;
        }
        next.set(id, { element: entry.element, phase: "exiting" });
        const existingTimeout = pendingRemovals.current.get(id);
        if (existingTimeout) clearTimeout(existingTimeout);
        pendingRemovals.current.set(
          id,
          setTimeout(() => {
            pendingRemovals.current.delete(id);
            setEntries((current) => {
              const copy = new Map(current);
              copy.delete(id);
              return copy;
            });
          }, ELEMENT_TRANSITION_MS),
        );
      }

      // Newly resolved as visible: a genuinely new id starts "entering"
      // (or straight to "visible" under reduced motion); an id that was
      // mid-exit and came back (rapid surface toggling) cancels its
      // pending removal and resumes as visible instead of restarting an
      // entrance animation from a still-faded state.
      for (const el of visible) {
        const existing = prev.get(el.id);
        if (!existing) {
          next.set(el.id, { element: el, phase: reducedMotion ? "visible" : "entering" });
          continue;
        }
        const pendingTimeout = pendingRemovals.current.get(el.id);
        if (pendingTimeout) {
          clearTimeout(pendingTimeout);
          pendingRemovals.current.delete(el.id);
        }
        next.set(el.id, { element: el, phase: existing.phase === "exiting" ? "visible" : existing.phase });
      }

      return next;
    });
  }, [visible, reducedMotion]);

  // A freshly-"entering" entry needs two distinct paints to actually
  // transition (mount at the faded/shrunk state, then move to the resting
  // state) rather than skip straight to it — flip it to "visible" on the
  // next animation frame, once the browser has had a chance to paint the
  // entering state first.
  useEffect(() => {
    const enteringIds = [...entries.values()].filter((entry) => entry.phase === "entering").map((entry) => entry.element.id);
    if (enteringIds.length === 0) return;
    const frame = requestAnimationFrame(() => {
      setEntries((prev) => {
        const next = new Map(prev);
        for (const id of enteringIds) {
          const entry = next.get(id);
          if (entry && entry.phase === "entering") next.set(id, { element: entry.element, phase: "visible" });
        }
        return next;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [entries]);

  // Clear any outstanding removal timers on unmount (e.g. navigating away
  // from the Studio mid-transition) so they don't fire a setState after
  // this component is gone.
  useEffect(
    () => () => {
      for (const timeout of pendingRemovals.current.values()) clearTimeout(timeout);
      pendingRemovals.current.clear();
    },
    [],
  );

  return useMemo(() => [...entries.values()], [entries]);
}

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

// Mirrors `--duration-med` in tokens.css (see PreviewCanvas.css's
// `.resolved-element--entering`/`--exiting` rules) — kept in sync there
// rather than read from computed styles, same reasoning textMeasure.ts's
// LINE_HEIGHT_RATIO already documents for its own CSS-mirroring constant.
const ELEMENT_TRANSITION_MS = 300;

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
  const animatedElements = useAnimatedElements(layout.visible);

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
              {animatedElements.map(({ element, phase }) => {
                const content = contentLookup.get(element.id);
                return (
                  <ResolvedElementView
                    key={element.id}
                    element={element}
                    transitionPhase={phase}
                    content={content?.content ?? ""}
                    src={content?.src}
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
