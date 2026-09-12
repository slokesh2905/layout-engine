/**
 * Renders exactly one resolver-placed element at its resolved (x, y, width,
 * height, zIndex) — nothing here branches on a surface id or composes a
 * layout; every pixel comes straight from `element`. Content comes from the
 * spec's own text/label/alt field (already extracted by `elementContent()`
 * upstream). An "image" element renders a real `<img>` when `src` actually
 * loads — a locally uploaded file (see SpecInspector.tsx's "Upload image…")
 * always will, since it's a same-origin `data:` URI — and falls back to the
 * labeled placeholder tile on `onError`, so the built-in demo specs (whose
 * `src` values, e.g. "/aurora-bottle.png", were never real files — see
 * spec.ts's own doc comment on `elementContent()`) keep looking exactly as
 * intentionally designed instead of showing a broken-image icon.
 */
import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { Icon } from "../ui/Icon.js";
import { AD_BOARD_FONT_FAMILY, textWeightFor } from "../../lib/renderLayout.js";
import { createCanvasMeasurer, wrapTextToFit } from "../../lib/textMeasure.js";
import type { ResolvedElementLayout } from "../../lib/types.js";

/**
 * "entering"/"exiting" are PreviewCanvas.tsx's `useAnimatedElements()`
 * telling this view it's mid FLIP-style transition — a surface switch (or
 * any other re-resolve) just added or is about to remove this element from
 * `layout.visible`. "visible" (the default, and the only phase a caller
 * that doesn't animate needs to pass) means "just render normally."
 */
export type ElementTransitionPhase = "entering" | "visible" | "exiting";

interface ResolvedElementViewProps {
  readonly element: ResolvedElementLayout;
  readonly content: string;
  readonly src?: string;
  readonly priority: number;
  readonly selected: boolean;
  readonly hovered: boolean;
  readonly priorityTint: boolean;
  readonly transitionPhase?: ElementTransitionPhase;
  readonly onSelect: (id: string) => void;
  readonly onHoverChange: (id: string | null) => void;
}

export function ResolvedElementView({
  element,
  content,
  src,
  priority,
  selected,
  hovered,
  priorityTint,
  transitionPhase = "visible",
  onSelect,
  onHoverChange,
}: ResolvedElementViewProps) {
  // Reset the fallback whenever the src itself changes (e.g. the user just
  // replaced this element's image) rather than sticking with a stale
  // failure from whatever was here before.
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [src]);

  // Real, measured word-wrap for "text" elements (see ../../lib/textMeasure.ts's
  // own doc comment for why this lives here rather than in resolver.ts).
  // Padding (2px each side) matches `.resolved-element--text { padding: 0 2px; }`.
  // Harmless to compute for non-text elements too — cheap, and keeps this a
  // plain top-level hook call rather than one made conditional on element.type.
  const wrapped = useMemo(() => {
    const measure = createCanvasMeasurer(textWeightFor(element.role), AD_BOARD_FONT_FAMILY);
    return wrapTextToFit(content, Math.max(0, element.width - 4), element.height, element.fontSize, measure);
  }, [content, element.width, element.height, element.fontSize, element.role]);

  const classNames = [
    "resolved-element",
    `resolved-element--${element.type}`,
    `resolved-element--role-${element.role}`,
    selected && "resolved-element--selected",
    hovered && "resolved-element--hovered",
    priorityTint && `resolved-element--priority-${Math.min(priority, 3)}`,
    transitionPhase !== "visible" && `resolved-element--${transitionPhase}`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classNames}
      style={{ left: element.x, top: element.y, width: element.width, height: element.height, zIndex: element.zIndex }}
      onMouseEnter={() => onHoverChange(element.id)}
      onMouseLeave={() => onHoverChange(null)}
      onClick={() => onSelect(element.id)}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(element.id);
        }
      }}
    >
      {element.atFloor ? <span className="resolved-element__floor-marker" title="At minimum size" aria-hidden="true" /> : null}
      {element.type === "text" ? (
        <span className="resolved-element__text" style={{ fontSize: wrapped.fontSize }}>
          {wrapped.lines.map((line, i) => (
            <span key={i} className="resolved-element__text-line">
              {i === wrapped.lines.length - 1 && wrapped.truncated ? `${line}…` : line}
            </span>
          ))}
        </span>
      ) : element.type === "button" ? (
        <span className="resolved-element__button-label" style={{ fontSize: element.fontSize }}>
          {content}
        </span>
      ) : src && !imageFailed ? (
        <img className="resolved-element__image" src={src} alt={content} draggable={false} onError={() => setImageFailed(true)} />
      ) : (
        <span className="resolved-element__image-placeholder">
          <Icon name="type-image" size={Math.max(12, Math.min(22, element.height * 0.4))} />
          <span className="resolved-element__image-alt">{content}</span>
        </span>
      )}
    </div>
  );
}
