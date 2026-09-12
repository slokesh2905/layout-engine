/**
 * Visual cards over the real surface catalog (lib/mock-data.ts). Each
 * card's mini preview is a plain aspect-ratio box scaled from the surface's
 * true width/height — a real proportional shape, not a decorative icon.
 */
import { useEffect, useState } from "react";
import { Link } from "../app/routes.js";
import { getSurfaceProfiles } from "../lib/api.js";
import { formatDimensions } from "../lib/formatters.js";
import type { SurfaceDescriptor } from "../lib/types.js";
import { Badge } from "../components/ui/Badge.js";
import { Icon } from "../components/ui/Icon.js";
import { StudioHeader } from "../components/studio/StudioHeader.js";
import "./SurfacesPage.css";

const PREVIEW_BOX = 92;

function previewSize(width: number, height: number): { width: number; height: number } {
  const scale = PREVIEW_BOX / Math.max(width, height);
  return { width: Math.max(6, Math.round(width * scale)), height: Math.max(6, Math.round(height * scale)) };
}

export function SurfacesPage() {
  const [surfaces, setSurfaces] = useState<readonly SurfaceDescriptor[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSurfaceProfiles().then((result) => {
      if (!cancelled) setSurfaces(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <StudioHeader title="Surface Profiles" description="Real width, height, and constraint data — the resolver never sees more than this." />
      <div className="surfaces-page">
        {surfaces === null ? (
          <div className="surfaces-page__loading">
            <div className="skeleton-row" />
            <div className="skeleton-row" />
          </div>
        ) : (
          <div className="surfaces-page__grid">
            {surfaces.map((surface, index) => {
              const preview = previewSize(surface.profile.width, surface.profile.height);
              return (
                <article key={surface.id} className="surface-tile reveal" style={{ animationDelay: `${index * 60}ms` }}>
                  <div className="surface-tile__preview-wrap">
                    <div className="surface-tile__preview" style={{ width: preview.width, height: preview.height }} />
                  </div>
                  <div className="surface-tile__body">
                    <div className="surface-tile__top">
                      <h2 className="surface-tile__name">{surface.name}</h2>
                      <Badge tone="muted">{surface.contextLabel}</Badge>
                    </div>
                    <span className="surface-tile__dims mono">{formatDimensions(surface.profile.width, surface.profile.height)}</span>
                    <p className="surface-tile__description">{surface.description}</p>
                    <dl className="surface-tile__facts mono">
                      {surface.profile.minTapTarget ? (
                        <div>
                          <dt>Min tap target</dt>
                          <dd>{surface.profile.minTapTarget}px</dd>
                        </div>
                      ) : null}
                      {surface.profile.minTextSize ? (
                        <div>
                          <dt>Min text size</dt>
                          <dd>{surface.profile.minTextSize}px</dd>
                        </div>
                      ) : null}
                      {surface.profile.viewingDistance ? (
                        <div>
                          <dt>Viewing distance</dt>
                          <dd>{surface.profile.viewingDistance}</dd>
                        </div>
                      ) : null}
                    </dl>
                    <Link to={`/layout-studio?surface=${surface.id}`} className="surface-tile__open">
                      Open in Studio
                      <Icon name="chevron-right" size={14} />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
