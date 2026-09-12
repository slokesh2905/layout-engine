/**
 * Editorial tiles over the real ad-spec catalog (lib/api.ts's
 * getAdSpecs()) — no lorem-ipsum placeholders; every tile is one of the
 * catalog's genuine, defineAd()-validated specs, built-in or imported
 * alike (see lib/api.ts's importSpec() — an imported spec is just another
 * catalog entry from here on).
 */
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Link, useRouter } from "../app/routes.js";
import { getAdSpecs, getCustomSpecs, importSpec } from "../lib/api.js";
import { errorMessage, formatRelativeTime } from "../lib/formatters.js";
import { parseFigmaSvg } from "../lib/importSvg.js";
import { parseSpecFile } from "../lib/specFile.js";
import { parseSpecBundle, serializeSpecBundle } from "../lib/specBundle.js";
import type { AdSpecSummary } from "../lib/types.js";
import { Badge } from "../components/ui/Badge.js";
import { Icon } from "../components/ui/Icon.js";
import { StudioHeader } from "../components/studio/StudioHeader.js";
import { PasteImportModal } from "../components/studio/PasteImportModal.js";
import "./SpecsPage.css";

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadJson(filename: string, payload: unknown) {
  downloadBlob(filename, new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
}

export function SpecsPage() {
  const { navigate } = useRouter();
  const [specs, setSpecs] = useState<readonly AdSpecSummary[] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const importSvgInputRef = useRef<HTMLInputElement>(null);
  const importBundleInputRef = useRef<HTMLInputElement>(null);
  // Phase H: which paste-to-import dialog (if any) is open — see
  // ../components/studio/PasteImportModal.tsx. No "bundle" variant: a
  // multi-spec bundle is sized for a file, not a paste box.
  const [pasteModal, setPasteModal] = useState<"spec" | "svg" | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAdSpecs().then((result) => {
      if (!cancelled) setSpecs(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleImportFile(file: File) {
    setImportError(null);
    file
      .text()
      .then((text) => {
        const { meta, spec } = parseSpecFile(text);
        return importSpec(meta, spec);
      })
      .then((summary) => {
        navigate(`/layout-studio?spec=${summary.id}`);
      })
      .catch((err: unknown) => setImportError(errorMessage(err)));
  }

  // Phase F: same shape as handleImportFile above, reading an SVG exported
  // from a Figma frame instead of a spec file this app produced itself —
  // see ../lib/importSvg.ts.
  function handleImportFigmaSvgFile(file: File) {
    setImportError(null);
    file
      .text()
      .then((text) => {
        const { spec, suggestedName } = parseFigmaSvg(text);
        const meta = { campaignName: suggestedName ?? "Imported from Figma", brand: "", supportingCopy: "" };
        return importSpec(meta, spec);
      })
      .then((summary) => {
        navigate(`/layout-studio?spec=${summary.id}`);
      })
      .catch((err: unknown) => setImportError(errorMessage(err)));
  }

  // Phase H: paste-to-import, for content copied from a chat/email rather
  // than saved as a file — same shape as handleImportFile/
  // handleImportFigmaSvgFile above minus the `file.text()` step. Handed
  // straight to PasteImportModal as its `onSubmit`; a thrown parse error
  // surfaces inline in the dialog rather than this page's importError
  // toast, so the user can fix the pasted text and retry without losing it.
  async function handlePasteSpecSubmit(text: string) {
    const { meta, spec } = parseSpecFile(text);
    const summary = await importSpec(meta, spec);
    setPasteModal(null);
    navigate(`/layout-studio?spec=${summary.id}`);
  }

  async function handlePasteSvgSubmit(text: string) {
    const { spec, suggestedName } = parseFigmaSvg(text);
    const meta = { campaignName: suggestedName ?? "Imported from Figma", brand: "", supportingCopy: "" };
    const summary = await importSpec(meta, spec);
    setPasteModal(null);
    navigate(`/layout-studio?spec=${summary.id}`);
  }

  // Phase H: "export everything" — every spec imported this session (never
  // a built-in one, see ../lib/specBundle.ts's doc comment), bundled into
  // one file. Reuses the importError toast for the "nothing to bundle yet"
  // case too — it's the page's one general "that didn't work" surface, not
  // exclusively for imports.
  function handleExportBundle() {
    setImportError(null);
    getCustomSpecs()
      .then((entries) => {
        if (entries.length === 0) {
          throw new Error("No imported specs to bundle yet — import or paste at least one first.");
        }
        downloadJson("adaptive-layout-studio-specs.bundle.json", serializeSpecBundle(entries));
      })
      .catch((err: unknown) => setImportError(errorMessage(err)));
  }

  // The reverse trip: every spec in a bundle file, imported in one go.
  // Unlike a single-spec import, this deliberately doesn't navigate into
  // any one of them — it stays on the catalog grid and appends every newly
  // imported spec as its own tile, since there's no single "the" spec the
  // user was after.
  function handleImportBundleFile(file: File) {
    setImportError(null);
    file
      .text()
      .then((text) => {
        const { specs: bundleSpecs } = parseSpecBundle(text);
        return Promise.all(bundleSpecs.map(({ meta, spec }) => importSpec(meta, spec)));
      })
      .then((summaries) => {
        setSpecs((prev) => (prev ? [...prev, ...summaries] : summaries));
      })
      .catch((err: unknown) => setImportError(errorMessage(err)));
  }

  return (
    <>
      <StudioHeader title="Ad Specs" description="Campaign specs available to resolve — open one in the Layout Studio.">
        <button type="button" className="specs-page__import-btn" onClick={() => importInputRef.current?.click()}>
          Import spec…
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          className="specs-page__file-input"
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) handleImportFile(file);
          }}
        />
        <button type="button" className="specs-page__import-btn" onClick={() => setPasteModal("spec")}>
          Paste Spec…
        </button>
        <button type="button" className="specs-page__import-btn" onClick={() => importSvgInputRef.current?.click()}>
          Import Figma SVG…
        </button>
        <input
          ref={importSvgInputRef}
          type="file"
          accept="image/svg+xml,.svg"
          className="specs-page__file-input"
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) handleImportFigmaSvgFile(file);
          }}
        />
        <button type="button" className="specs-page__import-btn" onClick={() => setPasteModal("svg")}>
          Paste Figma SVG…
        </button>
        <button type="button" className="specs-page__import-btn" onClick={handleExportBundle} title="Download every spec imported this session as one file">
          Export All Custom Specs
        </button>
        <button type="button" className="specs-page__import-btn" onClick={() => importBundleInputRef.current?.click()} title="Import every spec from a bundle file in one go">
          Import Spec Bundle…
        </button>
        <input
          ref={importBundleInputRef}
          type="file"
          accept="application/json,.json"
          className="specs-page__file-input"
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) handleImportBundleFile(file);
          }}
        />
      </StudioHeader>
      {importError ? (
        <div className="specs-page__import-error" role="alert">
          <Icon name="alert-triangle" size={14} />
          <span>{importError}</span>
          <button type="button" onClick={() => setImportError(null)} aria-label="Dismiss">
            <Icon name="close" size={12} />
          </button>
        </div>
      ) : null}
      {pasteModal === "spec" ? (
        <PasteImportModal
          title="Paste Spec JSON"
          description="Paste the JSON text of a spec file exported from this app (Export Spec)."
          placeholder='{"kind": "adaptive-layout-studio-spec", "formatVersion": 1, ...}'
          submitLabel="Import"
          onSubmit={handlePasteSpecSubmit}
          onClose={() => setPasteModal(null)}
        />
      ) : null}
      {pasteModal === "svg" ? (
        <PasteImportModal
          title="Paste Figma SVG"
          description="Paste the SVG markup exported from a Figma frame (File → Export → SVG)."
          placeholder="<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; ...>...</svg>"
          submitLabel="Import"
          onSubmit={handlePasteSvgSubmit}
          onClose={() => setPasteModal(null)}
        />
      ) : null}
      <div className="specs-page">
        {specs === null ? (
          <div className="specs-page__loading">
            <div className="skeleton-row" />
            <div className="skeleton-row" />
            <div className="skeleton-row" />
          </div>
        ) : specs.length === 0 ? (
          <p className="specs-page__empty">No ad specs in the catalog.</p>
        ) : (
          <div className="specs-page__grid">
            {specs.map((spec, index) => (
              <article key={spec.id} className="spec-tile reveal" style={{ animationDelay: `${index * 60}ms` }}>
                <div className="spec-tile__top">
                  <span className="spec-tile__brand mono">{spec.brand}</span>
                  <Badge tone={spec.status === "ready" ? "cyan" : "amber"}>{spec.status === "ready" ? "Ready" : "Needs review"}</Badge>
                </div>
                <h2 className="spec-tile__name">{spec.name}</h2>
                <p className="spec-tile__copy">{spec.supportingCopy}</p>
                <dl className="spec-tile__stats mono">
                  <div>
                    <dt>Version</dt>
                    <dd>{spec.version}</dd>
                  </div>
                  <div>
                    <dt>Elements</dt>
                    <dd>{spec.elementCount}</dd>
                  </div>
                  <div>
                    <dt>Required</dt>
                    <dd>{spec.requiredCount}</dd>
                  </div>
                  <div>
                    <dt>Degradable</dt>
                    <dd>{spec.degradableCount}</dd>
                  </div>
                </dl>
                <div className="spec-tile__footer">
                  <span className="spec-tile__resolved mono">{formatRelativeTime(spec.lastResolvedAt)}</span>
                  <Link to={`/layout-studio?spec=${spec.id}`} className="spec-tile__open">
                    Open in Studio
                    <Icon name="chevron-right" size={14} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
