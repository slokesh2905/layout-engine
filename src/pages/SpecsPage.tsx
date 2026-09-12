/**
 * Editorial tiles over the real ad-spec catalog (lib/api.ts's
 * getAdSpecs()) — no lorem-ipsum placeholders; every tile is one of the
 * catalog's genuine, defineAd()-validated specs.
 */
import { useEffect, useState } from "react";
import { Link } from "../app/routes.js";
import { getAdSpecs } from "../lib/api.js";
import { formatRelativeTime } from "../lib/formatters.js";
import type { AdSpecSummary } from "../lib/types.js";
import { Badge } from "../components/ui/Badge.js";
import { Icon } from "../components/ui/Icon.js";
import { StudioHeader } from "../components/studio/StudioHeader.js";
import "./SpecsPage.css";

export function SpecsPage() {
  const [specs, setSpecs] = useState<readonly AdSpecSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAdSpecs().then((result) => {
      if (!cancelled) setSpecs(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <StudioHeader title="Ad Specs" description="Campaign specs available to resolve — open one in the Layout Studio." />
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
