/**
 * The app-wide frame: the nav sidebar plus a content slot for whichever
 * route is active. Each route owns its own <StudioHeader> (and, on the
 * primary screen, its own <SurfaceToolbar>/<StudioFooter>) rather than
 * StudioShell hardcoding a per-path title lookup — that keeps a route's
 * chrome declared next to the content it describes.
 *
 * Responsive note: on a narrow viewport the sidebar becomes an off-canvas
 * drawer (opened by the menu button below) instead of a permanent column —
 * this only ever changes *dashboard chrome* via CSS media queries; nothing
 * here touches how an ad is composed inside the Preview Canvas.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { AppSidebar } from "../navigation/AppSidebar.js";
import { Icon } from "../ui/Icon.js";
import "./StudioShell.css";

interface StudioShellProps {
  readonly children: ReactNode;
}

export function StudioShell({ children }: StudioShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="studio-shell">
      <button
        type="button"
        className="studio-shell__menu-btn"
        aria-label="Open navigation"
        aria-expanded={sidebarOpen}
        onClick={() => setSidebarOpen(true)}
      >
        <Icon name="layers" size={18} />
      </button>

      <div className={`studio-shell__sidebar-wrap${sidebarOpen ? " is-open" : ""}`}>
        <AppSidebar onNavigate={() => setSidebarOpen(false)} />
      </div>
      {sidebarOpen ? <div className="studio-shell__backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" /> : null}

      <main className="studio-shell__main">{children}</main>
    </div>
  );
}
