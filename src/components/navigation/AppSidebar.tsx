/**
 * Left navigation rail: wordmark, workspace switcher, the four real routes,
 * a resolver-fed "recent resolutions" list, and live connection status.
 * The "Assets" item appears in the brief's nav list but was never given a
 * route in the spec — rather than inventing a fifth page, it's rendered as
 * a disabled, clearly-labeled placeholder instead of a working link.
 */
import { useEffect, useState } from "react";
import type { RecentResolution } from "../../lib/types.js";
import { getAdSpecs, getConnectionStatus, getRecentResolutions, onConnectionStatusChange } from "../../lib/api.js";
import type { AdSpecSummary, ConnectionStatus } from "../../lib/types.js";
import { formatFitScore, formatRelativeTime } from "../../lib/formatters.js";
import { Icon } from "../ui/Icon.js";
import type { IconName } from "../ui/Icon.js";
import { StatusDot } from "../ui/StatusDot.js";
import { Link, useRouter } from "../../app/routes.js";
import type { RoutePath } from "../../app/routes.js";
import "./AppSidebar.css";

interface NavItem {
  readonly label: string;
  readonly icon: IconName;
  readonly path: RoutePath | null;
}

const NAV_ITEMS: readonly NavItem[] = [
  { label: "Layout Studio", icon: "studio", path: "/layout-studio" },
  { label: "Ad Specs", icon: "specs", path: "/specs" },
  { label: "Surface Profiles", icon: "surfaces", path: "/surfaces" },
  { label: "Validation", icon: "validation", path: "/validation" },
  { label: "Assets", icon: "assets", path: null },
];

const CONNECTION_COPY: Record<ConnectionStatus, { label: string; tone: "cyan" | "amber" | "red"; pulse: boolean }> = {
  connected: { label: "Connected", tone: "cyan", pulse: false },
  connecting: { label: "Connecting…", tone: "amber", pulse: true },
  offline: { label: "Offline", tone: "red", pulse: false },
};

interface AppSidebarProps {
  /** Called after a navigation action — StudioShell uses this to close the mobile off-canvas drawer. */
  readonly onNavigate?: () => void;
}

export function AppSidebar({ onNavigate }: AppSidebarProps = {}) {
  const { pathname, navigate } = useRouter();
  const [specs, setSpecs] = useState<readonly AdSpecSummary[] | null>(null);
  const [recent, setRecent] = useState<readonly RecentResolution[] | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>(getConnectionStatus);

  useEffect(() => {
    let cancelled = false;
    getAdSpecs().then((result) => {
      if (!cancelled) setSpecs(result);
    });
    getRecentResolutions().then((result) => {
      if (!cancelled) setRecent(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => onConnectionStatusChange(setConnection), []);

  const primarySpec = specs?.[0] ?? null;
  const connectionCopy = CONNECTION_COPY[connection];

  return (
    <aside className="app-sidebar">
      <div className="app-sidebar__brand">
        <span className="app-sidebar__logomark" aria-hidden="true">
          <Icon name="studio" size={16} />
        </span>
        <span className="app-sidebar__wordmark">FLAM</span>
      </div>

      <button type="button" className="app-sidebar__workspace" title="Workspace switching isn't available in this build">
        <span className="app-sidebar__workspace-name">Aurora Campaigns</span>
        <Icon name="chevron-down" size={14} />
      </button>

      <div className="app-sidebar__eyebrow-block">
        <span className="app-sidebar__eyebrow mono">ADAPTIVE LAYOUT STUDIO</span>
        <span className="app-sidebar__project">
          {primarySpec ? primarySpec.name : <span className="skeleton-text" aria-hidden="true" />}
        </span>
      </div>

      <nav className="app-sidebar__nav" aria-label="Primary">
        {NAV_ITEMS.map((item) => {
          const isActive = item.path !== null && pathname === item.path;
          if (item.path === null) {
            return (
              <span key={item.label} className="app-sidebar__nav-item app-sidebar__nav-item--disabled" aria-disabled="true">
                <Icon name={item.icon} size={16} />
                <span>{item.label}</span>
                <span className="app-sidebar__soon mono">Soon</span>
              </span>
            );
          }
          return (
            <Link
              key={item.label}
              to={item.path}
              className={`app-sidebar__nav-item${isActive ? " app-sidebar__nav-item--active" : ""}`}
              aria-current={isActive ? "page" : undefined}
              onClick={() => onNavigate?.()}
            >
              <Icon name={item.icon} size={16} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="app-sidebar__section">
        <span className="app-sidebar__eyebrow mono">RECENT RESOLUTIONS</span>
        {recent === null ? (
          <div className="app-sidebar__recent-list">
            <div className="skeleton-row" />
            <div className="skeleton-row" />
          </div>
        ) : recent.length === 0 ? (
          <p className="app-sidebar__empty">No resolutions yet.</p>
        ) : (
          <ul className="app-sidebar__recent-list">
            {recent.slice(0, 4).map((resolution, index) => (
              <li key={resolution.id} className="row-in" style={{ animationDelay: `${index * 40}ms` }}>
                <button
                  type="button"
                  className="app-sidebar__recent-item"
                  onClick={() => {
                    navigate(`/layout-studio?spec=${resolution.specId}&surface=${resolution.surfaceId}`);
                    onNavigate?.();
                  }}
                >
                  <span className="app-sidebar__recent-spec">{resolution.specName}</span>
                  <span className="app-sidebar__recent-meta mono">
                    {resolution.surfaceName} · fit {formatFitScore(resolution.fitScore)}
                  </span>
                  <span className="app-sidebar__recent-time mono">{formatRelativeTime(resolution.resolvedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="app-sidebar__footer">
        <StatusDot tone={connectionCopy.tone} label={connectionCopy.label} pulse={connectionCopy.pulse} />
        <button type="button" className="app-sidebar__icon-btn" title="Settings (not available in this build)" aria-disabled="true">
          <Icon name="settings" size={16} />
        </button>
      </div>
    </aside>
  );
}
