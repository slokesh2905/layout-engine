/**
 * Repurposed for the redesign: what used to be two permanent side panels
 * (a left <SpecInspector> and a right <ResolutionPanel>) plus a full-width
 * <StudioFooter> is now one dismissible 320px panel with four tabs —
 * Elements / Checks / Log / Surface. Every tab still reads straight off
 * the real `StudioResolution` the page fetched (or locally re-resolved via
 * ../../lib/localResolve.ts for overrides/custom surfaces); nothing here
 * recomputes a position, size, fontSize or check result.
 */
import type { ChangeEvent } from "react";
import { Icon } from "../ui/Icon.js";
import { SpecInspector } from "./SpecInspector.js";
import { ResolutionSummary } from "./ResolutionSummary.js";
import { ConstraintChecklist } from "./ConstraintChecklist.js";
import { StrategySummary } from "./StrategySummary.js";
import { DegradationLog } from "./DegradationLog.js";
import { formatPx } from "../../lib/formatters.js";
import type { StudioResolution } from "../../lib/types.js";
import "./ResolutionPanel.css";

export type PanelTab = "elements" | "checks" | "log" | "surface";

export interface CustomSurfaceForm {
  readonly width: number;
  readonly height: number;
  readonly safeArea: number;
  readonly minTapTarget: number;
  readonly minTextSize: number;
}

const TABS: readonly { readonly id: PanelTab; readonly label: string }[] = [
  { id: "elements", label: "Elements" },
  { id: "checks", label: "Checks" },
  { id: "log", label: "Log" },
  { id: "surface", label: "Surface" },
];

const CUSTOM_FIELDS: readonly { readonly key: keyof CustomSurfaceForm; readonly label: string; readonly max: number }[] = [
  { key: "width", label: "Width", max: 4000 },
  { key: "height", label: "Height", max: 4000 },
  { key: "safeArea", label: "Safe inset", max: 200 },
  { key: "minTapTarget", label: "Min tap", max: 200 },
  { key: "minTextSize", label: "Min text", max: 200 },
];

interface ResolutionPanelProps {
  readonly open: boolean;
  readonly onOpen: () => void;
  readonly onClose: () => void;
  readonly tab: PanelTab;
  readonly onTabChange: (tab: PanelTab) => void;
  readonly resolution: StudioResolution;
  readonly selectedElementId: string | null;
  readonly hoveredElementId: string | null;
  readonly onSelectElement: (id: string) => void;
  readonly onHoverElement: (id: string | null) => void;
  readonly hasOverrides: boolean;
  readonly onResetPriorities: () => void;
  readonly onReprioritize: (fromId: string, toId: string) => void;
  readonly customForm: CustomSurfaceForm;
  readonly onCustomFieldChange: (key: keyof CustomSurfaceForm, value: number) => void;
  readonly onApplyCustom: () => void;
  readonly customActive: boolean;
}

export function ResolutionPanel({
  open,
  onOpen,
  onClose,
  tab,
  onTabChange,
  resolution,
  selectedElementId,
  hoveredElementId,
  onSelectElement,
  onHoverElement,
  hasOverrides,
  onResetPriorities,
  onReprioritize,
  customForm,
  onCustomFieldChange,
  onApplyCustom,
  customActive,
}: ResolutionPanelProps) {
  if (!open) {
    return (
      <button type="button" className="resolution-panel__reopen" onClick={onOpen}>
        <Icon name="panel-right" size={14} />
        Inspector
      </button>
    );
  }

  const { layout, surface } = resolution;
  const d = layout.diagnostics;

  return (
    <div className="resolution-panel">
      <div className="resolution-panel__tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`resolution-panel__tab${tab === t.id ? " resolution-panel__tab--active" : ""}`}
            onClick={() => onTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
        <div className="resolution-panel__tabs-spacer" />
        <button type="button" className="resolution-panel__collapse" title="Collapse" onClick={onClose}>
          <Icon name="chevron-right" size={14} />
        </button>
      </div>

      <div className="resolution-panel__body">
        {tab === "elements" ? (
          <SpecInspector
            elements={resolution.elements}
            layout={layout}
            degradationOrder={resolution.degradationOrder}
            selectedElementId={selectedElementId}
            hoveredElementId={hoveredElementId}
            onSelectElement={onSelectElement}
            onHoverElement={onHoverElement}
            hasOverrides={hasOverrides}
            onResetPriorities={onResetPriorities}
            onReprioritize={onReprioritize}
          />
        ) : null}

        {tab === "checks" ? (
          <div className="resolution-panel__section-stack">
            <ResolutionSummary diagnostics={d} visibleCount={layout.visible.length} droppedCount={layout.dropped.length} />
            <ConstraintChecklist layout={layout} surfaceProfile={surface.profile} />
            <StrategySummary layout={layout} />
          </div>
        ) : null}

        {tab === "log" ? (
          <DegradationLog layout={layout} selectedElementId={selectedElementId} onSelectElement={onSelectElement} />
        ) : null}

        {tab === "surface" ? (
          <div className="resolution-panel__surface-tab">
            <p className="resolution-panel__surface-hint">
              Type any constraints. The resolver has never seen this surface — same code path, no id lookup.
            </p>
            <div className="resolution-panel__custom-grid">
              {CUSTOM_FIELDS.map((field) => (
                <label key={field.key} className="resolution-panel__custom-field">
                  <span className="mono">{field.label}</span>
                  <input
                    type="number"
                    min={0}
                    max={field.max}
                    value={customForm[field.key]}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      onCustomFieldChange(field.key, Math.max(0, Math.min(field.max, Number(event.target.value) || 0)))
                    }
                  />
                </label>
              ))}
            </div>
            <button type="button" className="resolution-panel__resolve-custom" onClick={onApplyCustom}>
              Resolve this surface
            </button>

            <div className="resolution-panel__eyebrow mono">Active profile</div>
            <dl className="resolution-panel__kv mono">
              <dt>name</dt>
              <dd>{surface.name}</dd>
              <dt>size</dt>
              <dd>
                {formatPx(surface.profile.width)} × {formatPx(surface.profile.height)}
              </dd>
              <dt>minTapTarget</dt>
              <dd>{surface.profile.minTapTarget ? `${surface.profile.minTapTarget}px` : "—"}</dd>
              <dt>minTextSize</dt>
              <dd>{surface.profile.minTextSize ? `${surface.profile.minTextSize}px` : "—"}</dd>
              <dt>touchOnly</dt>
              <dd>{surface.profile.touchOnly ? "true" : "false"}</dd>
              <dt>custom active</dt>
              <dd>{customActive ? "true" : "false"}</dd>
            </dl>
          </div>
        ) : null}
      </div>
    </div>
  );
}
