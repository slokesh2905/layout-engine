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
import type { AdElementSpec } from "../../spec.js";
import type { StudioResolution, SurfaceDescriptor, SurfaceId } from "../../lib/types.js";
import type { LayoutDiff } from "../../lib/layoutDiff.js";
import "./ResolutionPanel.css";

export type PanelTab = "elements" | "checks" | "log" | "surface" | "meta" | "compare";

export interface CustomSurfaceForm {
  readonly width: number;
  readonly height: number;
  readonly safeArea: number;
  readonly minTapTarget: number;
  readonly minTextSize: number;
}

/**
 * Phase H: the editable campaign fields — deliberately its own small type
 * rather than importing ../../lib/api.ts's `ImportSpecMeta` (same shape),
 * matching this file's existing habit of defining its own local form types
 * (see `CustomSurfaceForm` above) rather than reaching into the adapter
 * layer from a presentational component.
 */
export interface CampaignMetaForm {
  readonly campaignName: string;
  readonly brand: string;
  readonly supportingCopy: string;
}

const TABS: readonly { readonly id: PanelTab; readonly label: string }[] = [
  { id: "elements", label: "Elements" },
  { id: "checks", label: "Checks" },
  { id: "log", label: "Log" },
  { id: "surface", label: "Surface" },
  { id: "meta", label: "Campaign" },
  { id: "compare", label: "Compare" },
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
  readonly canUndo: boolean;
  readonly onUndo: () => void;
  readonly canRedo: boolean;
  readonly onRedo: () => void;
  readonly onReprioritize: (fromId: string, toId: string) => void;
  readonly onUploadImage: (elementId: string, dataUrl: string) => void;
  readonly onUpdateContent: (elementId: string, value: string) => void;
  readonly onUpdateWeight: (elementId: string, value: number | null) => void;
  readonly onRemoveElement: (elementId: string) => void;
  readonly onAddElement: (element: AdElementSpec) => void;
  readonly customForm: CustomSurfaceForm;
  readonly onCustomFieldChange: (key: keyof CustomSurfaceForm, value: number) => void;
  readonly onApplyCustom: () => void;
  readonly customActive: boolean;
  readonly metaForm: CampaignMetaForm;
  readonly onMetaFieldChange: (key: keyof CampaignMetaForm, value: string) => void;
  readonly onSaveMeta: () => void;
  readonly metaDirty: boolean;
  readonly savingMeta: boolean;
  // Compare mode — see LayoutStudioPage.tsx's compareData/handleToggleCompare.
  readonly compareActive: boolean;
  readonly onToggleCompare: () => void;
  readonly compareSurfaceId: SurfaceId | null;
  readonly onCompareSurfaceChange: (id: SurfaceId) => void;
  /** Real surfaces the compare picker offers — every surface except the one currently active. */
  readonly compareCandidates: readonly SurfaceDescriptor[];
  /** null until compareActive and a valid target are both set. */
  readonly compareDiff: LayoutDiff | null;
  readonly compareASurfaceName: string | null;
  readonly compareBSurfaceName: string | null;
  /** Informational note shown while a custom surface is active — turning Compare on will switch back to a real one (see LayoutStudioPage.tsx's handleToggleCompare). */
  readonly compareDisabledReason: string | null;
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
  canUndo,
  onUndo,
  canRedo,
  onRedo,
  onReprioritize,
  onUploadImage,
  onUpdateContent,
  onUpdateWeight,
  onRemoveElement,
  onAddElement,
  customForm,
  onCustomFieldChange,
  onApplyCustom,
  customActive,
  metaForm,
  onMetaFieldChange,
  onSaveMeta,
  metaDirty,
  savingMeta,
  compareActive,
  onToggleCompare,
  compareSurfaceId,
  onCompareSurfaceChange,
  compareCandidates,
  compareDiff,
  compareASurfaceName,
  compareBSurfaceName,
  compareDisabledReason,
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
      <div className="resolution-panel__header">
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
        </div>
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
            canUndo={canUndo}
            onUndo={onUndo}
            canRedo={canRedo}
            onRedo={onRedo}
            onReprioritize={onReprioritize}
            onUploadImage={onUploadImage}
            onUpdateContent={onUpdateContent}
            onUpdateWeight={onUpdateWeight}
            onRemoveElement={onRemoveElement}
            onAddElement={onAddElement}
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

        {tab === "meta" ? (
          <div className="resolution-panel__meta-tab">
            <p className="resolution-panel__surface-hint">
              Renames this spec's campaign details — reflected everywhere its name is shown, including "Export Spec".
            </p>
            <label className="resolution-panel__meta-field">
              <span className="mono">Campaign name</span>
              <input
                type="text"
                value={metaForm.campaignName}
                onChange={(event: ChangeEvent<HTMLInputElement>) => onMetaFieldChange("campaignName", event.target.value)}
              />
            </label>
            <label className="resolution-panel__meta-field">
              <span className="mono">Brand</span>
              <input type="text" value={metaForm.brand} onChange={(event: ChangeEvent<HTMLInputElement>) => onMetaFieldChange("brand", event.target.value)} />
            </label>
            <label className="resolution-panel__meta-field">
              <span className="mono">Supporting copy</span>
              <textarea
                rows={3}
                value={metaForm.supportingCopy}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onMetaFieldChange("supportingCopy", event.target.value)}
              />
            </label>
            <button type="button" className="resolution-panel__resolve-custom" onClick={onSaveMeta} disabled={!metaDirty || savingMeta}>
              {savingMeta ? "Saving…" : "Save campaign details"}
            </button>
          </div>
        ) : null}

        {tab === "compare" ? (
          <div className="resolution-panel__compare-tab">
            <p className="resolution-panel__surface-hint">
              Resolves this exact spec — every live local edit already applied — against a second real surface, side
              by side, and highlights every element that behaves differently between them.
            </p>

            <label className="resolution-panel__meta-field">
              <span className="mono">Compare against</span>
              <select
                className="resolution-panel__compare-select"
                value={compareSurfaceId ?? ""}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => onCompareSurfaceChange(event.target.value as SurfaceId)}
                disabled={compareCandidates.length === 0}
              >
                {compareCandidates.length === 0 ? <option value="">No other surfaces</option> : null}
                {compareCandidates.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            {compareDisabledReason ? <p className="resolution-panel__surface-hint">{compareDisabledReason}</p> : null}

            <button
              type="button"
              className="resolution-panel__resolve-custom"
              onClick={onToggleCompare}
              disabled={compareCandidates.length === 0}
            >
              <Icon name="compare" size={13} />
              {compareActive ? "Exit compare" : "Compare side by side"}
            </button>

            {compareActive && compareDiff ? (
              <>
                <div className="resolution-panel__eyebrow mono">Summary</div>
                <dl className="resolution-panel__kv mono">
                  <dt>fit score Δ</dt>
                  <dd>
                    {compareDiff.summary.fitScoreDelta > 0 ? "+" : ""}
                    {compareDiff.summary.fitScoreDelta}
                  </dd>
                  <dt>only in {compareASurfaceName}</dt>
                  <dd>{compareDiff.summary.onlyInA}</dd>
                  <dt>only in {compareBSurfaceName}</dt>
                  <dd>{compareDiff.summary.onlyInB}</dd>
                  <dt>dropped in both</dt>
                  <dd>{compareDiff.summary.droppedInBoth}</dd>
                  <dt>changed size</dt>
                  <dd>{compareDiff.summary.changed}</dd>
                  <dt>unchanged</dt>
                  <dd>{compareDiff.summary.same}</dd>
                </dl>

                <div className="resolution-panel__eyebrow mono">Per element</div>
                <ul className="compare-diff__list">
                  {compareDiff.entries.map((entry) => {
                    const label =
                      entry.status === "same"
                        ? "Same"
                        : entry.status === "changed"
                          ? "Changed"
                          : entry.status === "dropped-in-both"
                            ? "Dropped in both"
                            : entry.status === "dropped-in-b"
                              ? `Only in ${compareASurfaceName}`
                              : `Only in ${compareBSurfaceName}`;
                    return (
                      <li
                        key={entry.elementId}
                        className={`compare-diff__row compare-diff__row--${entry.status}`}
                        onClick={() => onSelectElement(entry.elementId)}
                      >
                        <span className="compare-diff__content">{entry.content || entry.elementId}</span>
                        <span className="compare-diff__role mono">{entry.role}</span>
                        <span className="compare-diff__status mono">{label}</span>
                        {entry.status === "changed" ? (
                          <span className="compare-diff__delta mono">
                            {entry.widthDelta !== null && Math.abs(entry.widthDelta) > 0.5
                              ? `Δw ${entry.widthDelta > 0 ? "+" : ""}${Math.round(entry.widthDelta)}`
                              : ""}
                            {entry.heightDelta !== null && Math.abs(entry.heightDelta) > 0.5
                              ? ` Δh ${entry.heightDelta > 0 ? "+" : ""}${Math.round(entry.heightDelta)}`
                              : ""}
                            {entry.fontSizeDelta !== null && Math.abs(entry.fontSizeDelta) > 0.5
                              ? ` Δfont ${entry.fontSizeDelta > 0 ? "+" : ""}${Math.round(entry.fontSizeDelta)}`
                              : ""}
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
