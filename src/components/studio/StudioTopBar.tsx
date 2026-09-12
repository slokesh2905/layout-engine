/**
 * The Layout Studio's own 52px top bar — replaces the generic
 * <StudioHeader>/<SurfaceToolbar> row pair on this one route. Wordmark,
 * the active spec picker (switching specs here re-resolves exactly the way
 * choosing one on /specs would, just without leaving the screen), a live
 * "resolved in Nms" pulse, the theme toggle, and Export. Everything it
 * shows comes from the real `StudioResolution` LayoutStudioPage fetched —
 * nothing here recomputes a layout.
 */
import type { ChangeEvent } from "react";
import { Icon } from "../ui/Icon.js";
import type { AdSpecSummary } from "../../lib/types.js";
import "./StudioTopBar.css";

export type ThemeMode = "dark" | "light";

interface StudioTopBarProps {
  readonly specs: readonly AdSpecSummary[] | null;
  readonly specId: string | null;
  readonly specVersion: string | null;
  readonly onSpecChange: (specId: string) => void;
  readonly resolving: boolean;
  readonly resolveTimeLabel: string;
  readonly theme: ThemeMode;
  readonly onToggleTheme: () => void;
  readonly onExport: () => void;
  readonly canExport: boolean;
}

export function StudioTopBar({
  specs,
  specId,
  specVersion,
  onSpecChange,
  resolving,
  resolveTimeLabel,
  theme,
  onToggleTheme,
  onExport,
  canExport,
}: StudioTopBarProps) {
  return (
    <header className="studio-top-bar">
      <div className="studio-top-bar__brand">
        <span className="studio-top-bar__mark" aria-hidden="true">
          <Icon name="studio" size={13} />
        </span>
        <span className="studio-top-bar__wordmark mono">Adaptive Layout Studio</span>
      </div>

      <div className="studio-top-bar__divider" aria-hidden="true" />

      <div className="studio-top-bar__spec">
        <select
          className="studio-top-bar__spec-select"
          value={specId ?? ""}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => onSpecChange(event.target.value)}
          disabled={!specs}
          aria-label="Ad spec"
        >
          {!specs ? <option value="">Loading…</option> : null}
          {specs?.map((spec) => (
            <option key={spec.id} value={spec.id}>
              {spec.name}
            </option>
          ))}
        </select>
        {specVersion ? <span className="studio-top-bar__version mono">{specVersion.toUpperCase()}</span> : null}
      </div>

      <div className="studio-top-bar__spacer" />

      <div className="studio-top-bar__status">
        <span className={`studio-top-bar__pulse${resolving ? " studio-top-bar__pulse--busy" : ""}`} aria-hidden="true" />
        <span className="studio-top-bar__resolve-time mono">{resolveTimeLabel}</span>
      </div>

      <button type="button" className="studio-top-bar__icon-btn" title="Toggle theme" onClick={onToggleTheme}>
        <Icon name={theme === "dark" ? "sun" : "moon"} size={15} />
      </button>

      <button type="button" className="studio-top-bar__export" onClick={onExport} disabled={!canExport}>
        Export
      </button>
    </header>
  );
}
