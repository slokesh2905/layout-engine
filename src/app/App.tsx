/**
 * App root: router + whichever route matched. Route selection is a plain
 * switch on `pathname` — deliberately not a routing library, since there
 * are exactly four real routes (see routes.tsx).
 *
 * /layout-studio is a deliberate exception to the shared <StudioShell>
 * chrome: its redesign puts the resolved ad first — full-bleed, no
 * permanent sidebar — with its own header and floating dock instead. The
 * other three routes still get the sidebar/shell treatment; reinstating it
 * on /layout-studio as a collapsed rail is future work, not part of this
 * pass (see the studio redesign's handoff notes).
 */
import { RouterProvider, useRouter } from "./routes.js";
import { StudioShell } from "../components/studio/StudioShell.js";
import { LayoutStudioPage } from "../components/studio/LayoutStudioPage.js";
import { SpecsPage } from "../pages/SpecsPage.js";
import { SurfacesPage } from "../pages/SurfacesPage.js";
import { ValidationPage } from "../pages/ValidationPage.js";

function ShellRouteOutlet() {
  const { pathname } = useRouter();

  switch (pathname) {
    case "/specs":
      return <SpecsPage />;
    case "/surfaces":
      return <SurfacesPage />;
    case "/validation":
      return <ValidationPage />;
    default:
      // RouterProvider redirects "/" to the primary route on mount, so this
      // only shows for a genuinely unknown deep link.
      return (
        <div className="app-not-found">
          <h1>Page not found</h1>
          <p>There's no route at "{pathname}".</p>
        </div>
      );
  }
}

function RouteRoot() {
  const { pathname } = useRouter();
  if (pathname === "/layout-studio") return <LayoutStudioPage />;

  return (
    <StudioShell>
      <ShellRouteOutlet />
    </StudioShell>
  );
}

export function App() {
  return (
    <>
      <RouterProvider>
        <RouteRoot />
      </RouterProvider>
      <div className="watermark">
        <div>developed by</div>
        <div>Lokesh Sharma</div>
        <div className="watermark-links">
          <a href="https://github.com/slokesh2905" target="_blank" rel="noreferrer" title="GitHub">
            <svg viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </a>
          <a href="https://www.linkedin.com/in/lokesh-sharma-4a16ba206/" target="_blank" rel="noreferrer" title="LinkedIn">
            <svg viewBox="0 0 24 24">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
          </a>
        </div>
      </div>
    </>
  );
}
