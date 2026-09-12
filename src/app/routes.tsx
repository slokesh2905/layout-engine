/**
 * A minimal, dependency-free router — no react-router. There are exactly
 * four routes for this app (see ROUTES below), so a full path-pattern
 * matching engine would be the "unnecessary abstraction" the brief warns
 * against; this is the smallest thing that gives real URLs, back/forward
 * button support, and a query-param API (used by /specs -> /layout-studio
 * to hand off which spec is active).
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";

export const ROUTES = ["/layout-studio", "/specs", "/surfaces", "/validation"] as const;
export type RoutePath = (typeof ROUTES)[number];
export const DEFAULT_ROUTE: RoutePath = "/layout-studio";

interface RouterState {
  readonly pathname: string;
  readonly search: string;
}

interface RouterContextValue extends RouterState {
  readonly navigate: (to: string) => void;
}

const RouterContext = createContext<RouterContextValue | null>(null);

function readLocation(): RouterState {
  return { pathname: window.location.pathname, search: window.location.search };
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RouterState>(readLocation);

  useEffect(() => {
    const onPopState = () => setState(readLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Land on the primary route by default, same as the assignment's own
  // "the primary route should be /layout-studio".
  useEffect(() => {
    if (window.location.pathname === "/" || window.location.pathname === "") {
      window.history.replaceState(null, "", DEFAULT_ROUTE);
      setState(readLocation());
    }
  }, []);

  const navigate = useCallback((to: string) => {
    const current = window.location.pathname + window.location.search;
    if (to === current) return;
    window.history.pushState(null, "", to);
    setState(readLocation());
  }, []);

  return <RouterContext.Provider value={{ ...state, navigate }}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterContextValue {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error("useRouter() must be used within a <RouterProvider>.");
  return ctx;
}

export function useSearchParam(key: string): string | null {
  const { search } = useRouter();
  return new URLSearchParams(search).get(key);
}

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  readonly to: string;
}

/** A plain <a> that intercepts a normal left-click to navigate without a full page reload; modifier-clicks (open in new tab, etc.) fall through untouched. */
export function Link({ to, onClick, children, ...rest }: LinkProps) {
  const { navigate } = useRouter();
  return (
    <a
      href={to}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
