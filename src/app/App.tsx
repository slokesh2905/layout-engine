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
    <RouterProvider>
      <RouteRoot />
    </RouterProvider>
  );
}
