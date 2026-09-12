/**
 * The Layout Studio's own 52px top bar — replaces the generic
 * <StudioHeader>/<SurfaceToolbar> row pair on this one route. Wordmark,
 * the active spec picker (switching specs here re-resolves exactly the way
 * choosing one on /specs would, just without leaving the screen), a live
 * "resolved in Nms" pulse, the theme toggle, and the three export/import
 * actions. Everything it shows comes from the real `StudioResolution`
 * LayoutStudioPage fetched — nothing here recomputes a layout.
 *
 * Three distinct "export" concepts live here, deliberately not merged into
 * one button: "Export Layout" downloads the *resolved output* as JSON
 * (unchanged from before this file grew import/export-spec support);
 * "Export Spec" / "Import Spec" round-trip the *editable source* spec as a
 * portable JSON file (see ../../lib/specFile.ts) — the save/reopen
 * mechanism for a tool with no backend to save to; "Export PNG" / "Export
 * SVG" (Phase E) render an actual picture of the resolved layout — see
 * ../../lib/exportPng.ts and ../../lib/exportSvg.ts. SVG is the
 * Figma-compatible one: dropping it into a Figma canvas yields real,
 * editable layers, not a flattened image. "Import Figma SVG…" (Phase F) is
 * the reverse trip — an SVG a user exported *from* a Figma frame becomes a
 * new spec — see ../../lib/importSvg.ts. "Export All Surfaces" (Phase G)
 * repeats the layout-JSON + PNG pair across every surface in the catalog
 * in one click — see LayoutStudioPage.tsx's handleExportAllSurfaces.
 * "Paste Spec…" / "Paste Figma SVG…" (Phase H) open ./PasteImportModal.tsx
 * for the same two imports, for content copied from a chat/email rather
 * than saved as a file — this component only opens/closes the dialog;
 * LayoutStudioPage.tsx owns what submitting it actually does.
 */
import { useRef } from "react";
import type { ChangeEvent } from "react";
import { Icon } from "../ui/Icon.js";
import { Dropdown, DropdownItem } from "../ui/Dropdown.js";
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
  readonly onExportLayout: () => void;
  readonly canExportLayout: boolean;
  readonly onExportSpec: () => void;
  readonly canExportSpec: boolean;
  readonly onImportSpec: (file: File) => void;
  readonly onExportPng: () => void;
  readonly canExportPng: boolean;
  readonly onExportSvg: () => void;
  readonly canExportSvg: boolean;
  readonly onImportFigmaSvg: (file: File) => void;
  readonly onExportAllSurfaces: () => void;
  readonly canExportAllSurfaces: boolean;
  readonly exportingAllSurfaces: boolean;
  readonly onOpenPasteSpec: () => void;
  readonly onOpenPasteSvg: () => void;
  readonly onOpenNewSpec: () => void;
  readonly onDuplicateSpec: () => void;
  /** False only while nothing has resolved yet. Duplicating a built-in is
   *  exactly how you get an editable copy of it — unlike delete, this is
   *  never gated on `isCustom`. */
  readonly canDuplicateSpec: boolean;
  readonly onDeleteSpec: () => void;
  /** True only for custom/imported specs — built-ins cannot be deleted. */
  readonly canDeleteSpec: boolean;
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
  onExportLayout,
  canExportLayout,
  onExportSpec,
  canExportSpec,
  onImportSpec,
  onExportPng,
  canExportPng,
  onExportSvg,
  canExportSvg,
  onImportFigmaSvg,
  onExportAllSurfaces,
  canExportAllSurfaces,
  exportingAllSurfaces,
  onOpenPasteSpec,
  onOpenPasteSvg,
  onOpenNewSpec,
  onDuplicateSpec,
  canDuplicateSpec,
  onDeleteSpec,
  canDeleteSpec,
}: StudioTopBarProps) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const importSvgInputRef = useRef<HTMLInputElement>(null);
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
        <button
          type="button"
          className="studio-top-bar__new-btn"
          onClick={onOpenNewSpec}
          title="Create a new spec from scratch"
        >
          + New
        </button>
        <button
          type="button"
          className="studio-top-bar__new-btn studio-top-bar__duplicate-btn"
          onClick={onDuplicateSpec}
          disabled={!canDuplicateSpec}
          title="Duplicate this spec — bakes in any live local edits (priorities, order, images, content, added/removed elements) into a new, independent spec"
          aria-label="Duplicate spec"
        >
          <Icon name="duplicate" size={13} />
        </button>
        <button
          type="button"
          className={`studio-top-bar__new-btn studio-top-bar__delete-btn${canDeleteSpec ? " studio-top-bar__delete-btn--active" : ""}`}
          onClick={onDeleteSpec}
          disabled={!canDeleteSpec}
          title={canDeleteSpec ? "Delete this spec (built-in specs are protected)" : "Built-in specs cannot be deleted"}
          aria-label="Delete spec"
        >
          <Icon name="close" size={13} />
        </button>
      </div>

      <div className="studio-top-bar__spacer" />

      <div className="studio-top-bar__status">
        <span className={`studio-top-bar__pulse${resolving ? " studio-top-bar__pulse--busy" : ""}`} aria-hidden="true" />
        <span className="studio-top-bar__resolve-time mono">{resolveTimeLabel}</span>
      </div>

      <button type="button" className="studio-top-bar__icon-btn" title="Toggle theme" onClick={onToggleTheme}>
        <Icon name={theme === "dark" ? "sun" : "moon"} size={15} />
      </button>

      <Dropdown label="Export">
        <DropdownItem 
          onClick={onExportSpec} 
          disabled={!canExportSpec} 
          title="Download the editable spec — elements, roles, priorities, content — as a portable JSON file"
        >
          Export Spec
        </DropdownItem>
        <DropdownItem 
          onClick={onExportPng} 
          disabled={!canExportPng} 
          title="Download a PNG picture of the resolved layout"
        >
          Export PNG
        </DropdownItem>
        <DropdownItem 
          onClick={onExportSvg} 
          disabled={!canExportSvg} 
          title="Download an SVG picture of the resolved layout — drag it into Figma for real, editable layers"
        >
          Export SVG
        </DropdownItem>
        <DropdownItem 
          onClick={onExportAllSurfaces} 
          disabled={!canExportAllSurfaces || exportingAllSurfaces} 
          title="Download a layout JSON + PNG for every surface in the catalog, in one go — your browser may ask once whether to allow multiple downloads"
        >
          {exportingAllSurfaces ? "Exporting…" : "Export All Surfaces"}
        </DropdownItem>
        <DropdownItem 
          onClick={onExportLayout} 
          disabled={!canExportLayout} 
          title="Download the resolved output — positions, sizes, diagnostics — for this spec/surface pair"
        >
          Export Layout
        </DropdownItem>
      </Dropdown>

      <Dropdown label="Import">
        <DropdownItem 
          onClick={() => importInputRef.current?.click()} 
          title="Load a spec file exported from this app"
        >
          Import Spec…
        </DropdownItem>
        <DropdownItem 
          onClick={() => importSvgInputRef.current?.click()} 
          title="Load an SVG exported from a Figma frame (File → Export → SVG) as a new spec"
        >
          Import Figma SVG…
        </DropdownItem>
      </Dropdown>

      <Dropdown label="Paste">
        <DropdownItem 
          onClick={onOpenPasteSpec} 
          title="Paste a spec file's JSON text directly, instead of picking a file"
        >
          Paste Spec…
        </DropdownItem>
        <DropdownItem 
          onClick={onOpenPasteSvg} 
          title="Paste a Figma-exported SVG's markup directly, instead of picking a file"
        >
          Paste Figma SVG…
        </DropdownItem>
      </Dropdown>

      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="studio-top-bar__file-input"
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onImportSpec(file);
        }}
      />
      <input
        ref={importSvgInputRef}
        type="file"
        accept="image/svg+xml,.svg"
        className="studio-top-bar__file-input"
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onImportFigmaSvg(file);
        }}
      />
    </header>
  );
}
