/**
 * A real validation sweep: resolves every (spec × surface) combination in
 * the catalog and runs the same `buildConstraintChecks()` the Resolution
 * Panel uses on each result. A combination the resolver can't fit at all
 * (a genuine thrown error, e.g. a spec whose priority-1 elements don't fit
 * even the smallest surface) shows as an error cell, not a silently
 * skipped one.
 */
import { useEffect, useState } from "react";
import { Link } from "../app/routes.js";
import { getAdSpecs, getSurfaceProfiles, resolveLayout } from "../lib/api.js";
import { buildConstraintChecks } from "../lib/constraints.js";
import { errorMessage, formatFitScore, formatMs } from "../lib/formatters.js";
import type { AdSpecSummary, StudioResolution, SurfaceDescriptor, SurfaceId } from "../lib/types.js";
import { Icon } from "../components/ui/Icon.js";
import { StudioHeader } from "../components/studio/StudioHeader.js";
import { ConstraintChecklist } from "../components/studio/ConstraintChecklist.js";
import "./ValidationPage.css";

interface MatrixEntry {
  readonly specId: string;
  readonly surfaceId: SurfaceId;
  readonly resolution: StudioResolution | null;
  readonly error: string | null;
}

interface SelectedCell {
  readonly specId: string;
  readonly surfaceId: SurfaceId;
}

export function ValidationPage() {
  const [specs, setSpecs] = useState<readonly AdSpecSummary[] | null>(null);
  const [surfaces, setSurfaces] = useState<readonly SurfaceDescriptor[] | null>(null);
  const [matrix, setMatrix] = useState<readonly MatrixEntry[] | null>(null);
  const [selected, setSelected] = useState<SelectedCell | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getAdSpecs(), getSurfaceProfiles()]).then(([specResult, surfaceResult]) => {
      if (cancelled) return;
      setSpecs(specResult);
      setSurfaces(surfaceResult);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!specs || !surfaces) return;
    let cancelled = false;
    const combos = specs.flatMap((spec) =>
      surfaces.map((surface) =>
        resolveLayout({ specId: spec.id, surfaceId: surface.id })
          .then((resolution): MatrixEntry => ({ specId: spec.id, surfaceId: surface.id, resolution, error: null }))
          .catch((err: unknown): MatrixEntry => ({ specId: spec.id, surfaceId: surface.id, resolution: null, error: errorMessage(err) })),
      ),
    );
    Promise.all(combos).then((results) => {
      if (!cancelled) setMatrix(results);
    });
    return () => {
      cancelled = true;
    };
  }, [specs, surfaces]);

  const selectedEntry = selected ? matrix?.find((e) => e.specId === selected.specId && e.surfaceId === selected.surfaceId) ?? null : null;

  return (
    <>
      <StudioHeader title="Validation" description="Hard-constraint pass/fail for every spec × surface combination." />
      <div className="validation-page">
        {!specs || !surfaces || !matrix ? (
          <div className="validation-page__loading">
            <div className="skeleton-row" />
            <div className="skeleton-row" />
            <div className="skeleton-row" />
          </div>
        ) : (
          <>
            <div className="validation-page__table-wrap">
              <table className="validation-table mono">
                <thead>
                  <tr>
                    <th className="validation-table__corner">Spec \ Surface</th>
                    {surfaces.map((surface) => (
                      <th key={surface.id}>{surface.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {specs.map((spec) => (
                    <tr key={spec.id}>
                      <th scope="row">{spec.name}</th>
                      {surfaces.map((surface) => {
                        const entry = matrix.find((e) => e.specId === spec.id && e.surfaceId === surface.id);
                        const isSelected = selected?.specId === spec.id && selected.surfaceId === surface.id;
                        if (!entry) return <td key={surface.id} />;

                        if (entry.error) {
                          return (
                            <td key={surface.id}>
                              <button
                                type="button"
                                className={`validation-cell validation-cell--error${isSelected ? " validation-cell--selected" : ""}`}
                                onClick={() => setSelected({ specId: spec.id, surfaceId: surface.id })}
                                title={entry.error}
                              >
                                <Icon name="x-circle" size={13} />
                                Error
                              </button>
                            </td>
                          );
                        }

                        const checks = buildConstraintChecks(entry.resolution!.layout, entry.resolution!.surface.profile);
                        const failCount = checks.filter((c) => c.result === "fail").length;
                        return (
                          <td key={surface.id}>
                            <button
                              type="button"
                              className={`validation-cell${failCount === 0 ? " validation-cell--pass" : " validation-cell--fail"}${
                                isSelected ? " validation-cell--selected" : ""
                              }`}
                              onClick={() => setSelected({ specId: spec.id, surfaceId: surface.id })}
                            >
                              <Icon name={failCount === 0 ? "check" : "alert-triangle"} size={13} />
                              {failCount === 0 ? "Pass" : `${failCount} fail`}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedEntry ? (
              <div className="validation-page__detail">
                <div className="validation-page__detail-header">
                  <h2>
                    {specs.find((s) => s.id === selectedEntry.specId)?.name} · {surfaces.find((s) => s.id === selectedEntry.surfaceId)?.name}
                  </h2>
                  {selectedEntry.resolution ? (
                    <Link to={`/layout-studio?spec=${selectedEntry.specId}&surface=${selectedEntry.surfaceId}`} className="validation-page__open">
                      Open in Studio
                      <Icon name="chevron-right" size={14} />
                    </Link>
                  ) : null}
                </div>
                {selectedEntry.error ? (
                  <p className="validation-page__detail-error">{selectedEntry.error}</p>
                ) : selectedEntry.resolution ? (
                  <>
                    <p className="validation-page__detail-meta mono">
                      Resolved in {formatMs(selectedEntry.resolution.layout.diagnostics.resolvedInMs)} · fit score{" "}
                      {formatFitScore(selectedEntry.resolution.layout.diagnostics.fitScore)}
                    </p>
                    <ConstraintChecklist layout={selectedEntry.resolution.layout} surfaceProfile={selectedEntry.resolution.surface.profile} />
                  </>
                ) : null}
              </div>
            ) : (
              <p className="validation-page__hint">Select a cell to see its full constraint checklist.</p>
            )}
          </>
        )}
      </div>
    </>
  );
}
