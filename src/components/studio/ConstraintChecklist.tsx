/**
 * Renders the shared `buildConstraintChecks()` result (see
 * lib/constraints.ts) for the currently resolved layout — every row is a
 * real check, never a hardcoded "pass".
 */
import { Icon } from "../ui/Icon.js";
import { buildConstraintChecks } from "../../lib/constraints.js";
import type { ResolvedLayout, SurfaceProfile } from "../../lib/types.js";
import "./ConstraintChecklist.css";

interface ConstraintChecklistProps {
  readonly layout: ResolvedLayout;
  readonly surfaceProfile: SurfaceProfile;
}

export function ConstraintChecklist({ layout, surfaceProfile }: ConstraintChecklistProps) {
  const checks = buildConstraintChecks(layout, surfaceProfile);
  return (
    <ul className="constraint-checklist">
      {checks.map((check) => (
        <li key={check.label} className={`constraint-checklist__row constraint-checklist__row--${check.result.replace("/", "")}`}>
          <span className="constraint-checklist__icon" aria-hidden="true">
            {check.result === "pass" ? (
              <Icon name="check" size={14} />
            ) : check.result === "fail" ? (
              <Icon name="x-circle" size={14} />
            ) : (
              <Icon name="alert-triangle" size={13} />
            )}
          </span>
          <span className="constraint-checklist__text">
            <span className="constraint-checklist__label">{check.label}</span>
            <span className="constraint-checklist__detail">{check.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
