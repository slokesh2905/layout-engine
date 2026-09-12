/**
 * Renders exactly one resolver-placed element at its resolved (x, y, width,
 * height, zIndex) — nothing here branches on a surface id or composes a
 * layout; every pixel comes straight from `element`. Content comes from the
 * spec's own text/label/alt field (already extracted by `elementContent()`
 * upstream) — an "image" element has no real asset behind it, so, per
 * spec.ts's own doc comment ("there's no rendered pixel content for a
 * placeholder image, so its alt text is the closest thing it has to
 * displayable content"), it renders as a labeled placeholder tile rather
 * than a broken <img>.
 */
import type { KeyboardEvent } from "react";
import { Icon } from "../ui/Icon.js";
import type { ResolvedElementLayout } from "../../lib/types.js";

interface ResolvedElementViewProps {
  readonly element: ResolvedElementLayout;
  readonly content: string;
  readonly priority: number;
  readonly selected: boolean;
  readonly hovered: boolean;
  readonly priorityTint: boolean;
  readonly onSelect: (id: string) => void;
  readonly onHoverChange: (id: string | null) => void;
}

export function ResolvedElementView({
  element,
  content,
  priority,
  selected,
  hovered,
  priorityTint,
  onSelect,
  onHoverChange,
}: ResolvedElementViewProps) {
  const classNames = [
    "resolved-element",
    `resolved-element--${element.type}`,
    `resolved-element--role-${element.role}`,
    selected && "resolved-element--selected",
    hovered && "resolved-element--hovered",
    priorityTint && `resolved-element--priority-${Math.min(priority, 3)}`,
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
        <span className="resolved-element__text" style={{ fontSize: element.fontSize }}>
          {content}
        </span>
      ) : element.type === "button" ? (
        <span className="resolved-element__button-label" style={{ fontSize: element.fontSize }}>
          {content}
        </span>
      ) : (
        <span className="resolved-element__image-placeholder">
          <Icon name="type-image" size={Math.max(12, Math.min(22, element.height * 0.4))} />
          <span className="resolved-element__image-alt">{content}</span>
        </span>
      )}
    </div>
  );
}
