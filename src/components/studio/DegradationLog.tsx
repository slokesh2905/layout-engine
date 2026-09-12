/**
 * A row per `layout.degradation` entry — the resolver's own record of what
 * it dropped, shrank, or truncated, with its own reason string. Clicking a
 * row that's still visible highlights it on the canvas; a dropped element
 * has nothing to highlight (it isn't in `layout.visible`), so its row says
 * so instead of silently doing nothing.
 */
import { Badge } from "../ui/Badge.js";
import type { DegradationAction, DegradationEntry, ResolvedLayout } from "../../lib/types.js";

interface DegradationLogProps {
  readonly layout: ResolvedLayout;
  readonly selectedElementId: string | null;
  readonly onSelectElement: (id: string) => void;
}

const ACTION_TONE: Record<DegradationAction, "coral" | "amber"> = {
  dropped: "coral",
  shrunk: "amber",
  truncated: "amber",
};

function isHighlightable(entry: DegradationEntry, layout: ResolvedLayout): boolean {
  return layout.visible.some((v) => v.id === entry.elementId);
}

export function DegradationLog({ layout, selectedElementId, onSelectElement }: DegradationLogProps) {
  if (layout.degradation.length === 0) {
    return <p className="degradation-log__empty">No degradation — everything resolved at full size.</p>;
  }

  return (
    <ul className="degradation-log">
      {layout.degradation.map((entry) => {
        const highlightable = isHighlightable(entry, layout);
        return (
          <li key={entry.elementId} className="degradation-log__row">
            <button
              type="button"
              className={`degradation-log__button${entry.elementId === selectedElementId ? " degradation-log__button--selected" : ""}`}
              onClick={() => highlightable && onSelectElement(entry.elementId)}
              disabled={!highlightable}
              title={highlightable ? "Highlight on canvas" : "Dropped elements aren't rendered on this surface"}
            >
              <span className="degradation-log__row-top">
                <span className="degradation-log__id mono">{entry.elementId}</span>
                <Badge tone={ACTION_TONE[entry.action]}>{entry.action}</Badge>
              </span>
              <span className="degradation-log__reason">{entry.reason}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
