/**
 * Repurposed for the redesign: this file now renders just the Elements tab
 * of <ResolutionPanel>'s single 320px panel (it used to be its own
 * always-visible left drawer — see the studio redesign's handoff notes for
 * why that drawer went away). Still the full element roster (including
 * anything this surface dropped) and the degradation order, rendered
 * verbatim from `describeDegradationOrder()` (resolver.ts) — never
 * re-authored here — plus one new capability: dragging a row onto another
 * hands it that element's current priority and re-resolves (the roster's
 * drag handle finally does something).
 */
import { useState } from "react";
import type { DragEvent } from "react";
import { Icon } from "../ui/Icon.js";
import type { IconName } from "../ui/Icon.js";
import type { ResolvedLayout, StudioElement } from "../../lib/types.js";
import "./SpecInspector.css";

interface ElementsTabProps {
  readonly elements: readonly StudioElement[];
  readonly layout: ResolvedLayout;
  readonly degradationOrder: readonly string[];
  readonly selectedElementId: string | null;
  readonly hoveredElementId: string | null;
  readonly onSelectElement: (id: string) => void;
  readonly onHoverElement: (id: string | null) => void;
  readonly hasOverrides: boolean;
  readonly onResetPriorities: () => void;
  readonly onReprioritize: (fromId: string, toId: string) => void;
}

const TYPE_ICON: Record<StudioElement["type"], IconName> = {
  text: "type-text",
  image: "type-image",
  button: "cursor-click",
};

function parseStep(step: string): { readonly verb: string; readonly label: string } {
  const match = /^(Preserve|Truncate|Drop)\s+(.*)$/.exec(step);
  return match ? { verb: match[1]!, label: match[2]! } : { verb: "", label: step };
}

export function SpecInspector({
  elements,
  layout,
  degradationOrder,
  selectedElementId,
  hoveredElementId,
  onSelectElement,
  onHoverElement,
  hasOverrides,
  onResetPriorities,
  onReprioritize,
}: ElementsTabProps) {
  const [dragId, setDragId] = useState<string | null>(null);

  return (
    <div className="spec-inspector">
      <ul className="spec-inspector__list">
        {elements.map((element) => {
          const visible = layout.visible.find((v) => v.id === element.id);
          const dropped = layout.dropped.find((d) => d.id === element.id);
          const degraded = layout.degradation.find((d) => d.elementId === element.id && d.action !== "dropped");
          const state = dropped ? "Dropped" : degraded ? (degraded.action === "shrunk" ? "Shrunk" : "Truncated") : visible ? "Visible" : "—";
          const meta = visible
            ? `${element.role} · P${element.priority} · ${Math.round(visible.width)}×${Math.round(visible.height)} · ${Math.round(visible.fontSize)}px`
            : `${element.role} · P${element.priority}`;

          return (
            <li
              key={element.id}
              draggable
              onDragStart={() => setDragId(element.id)}
              onDragOver={(event: DragEvent<HTMLLIElement>) => event.preventDefault()}
              onDrop={() => {
                if (dragId && dragId !== element.id) onReprioritize(dragId, element.id);
                setDragId(null);
              }}
              className={`spec-inspector__row${element.id === selectedElementId ? " spec-inspector__row--selected" : ""}${
                element.id === hoveredElementId ? " spec-inspector__row--hovered" : ""
              }${dropped ? " spec-inspector__row--dropped" : ""}`}
              onMouseEnter={() => onHoverElement(element.id)}
              onMouseLeave={() => onHoverElement(null)}
              onClick={() => onSelectElement(element.id)}
            >
              <span className="spec-inspector__drag-handle" title="Drag onto another row to swap priority" aria-hidden="true">
                <Icon name="drag-handle" size={14} />
              </span>
              <Icon name={TYPE_ICON[element.type]} size={14} />
              <span className="spec-inspector__row-main">
                <span className="spec-inspector__row-content">{element.content}</span>
                <span className="spec-inspector__row-meta mono">{meta}</span>
              </span>
              <span className={`spec-inspector__badge${dropped ? " spec-inspector__badge--dropped" : ""}`}>{state}</span>
            </li>
          );
        })}
      </ul>

      {hasOverrides ? (
        <button type="button" className="spec-inspector__reset" onClick={onResetPriorities}>
          Reset priorities to spec
        </button>
      ) : null}

      <div className="spec-inspector__eyebrow mono">Degradation order</div>
      <ol className="spec-inspector__degradation-order">
        {degradationOrder.map((step, index) => {
          const { verb, label } = parseStep(step);
          return (
            <li key={`${index}-${step}`} className="spec-inspector__degradation-step">
              <span className="spec-inspector__degradation-index mono">{String(index + 1).padStart(2, "0")}</span>
              <span className={`spec-inspector__degradation-verb mono${verb === "Drop" ? " spec-inspector__degradation-verb--drop" : ""}`}>
                {verb}
              </span>
              <span className="spec-inspector__degradation-label">{label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
