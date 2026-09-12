/**
 * The primary screen — redesigned as a full-bleed canvas-first workspace
 * (see App.tsx: this route deliberately skips <StudioShell>'s sidebar).
 * Owns the one piece of state everything else here is derived from — which
 * (spec, surface) pair is active — reads it from the URL so a resolution
 * is shareable/bookmarkable, and is the only place that calls the
 * adapter's `resolveLayout()` for that base pair. Two live, purely local
 * experiments sit on top of that base resolution — a custom surface typed
 * into the Surface tab, and drag-to-reprioritise in the Elements tab —
 * both re-resolved through ../../lib/localResolve.ts, which still only
 * ever calls the real resolver. Every child below is fed the resulting
 * `StudioResolution`; none of them fetch or compute anything themselves.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParam } from "../../app/routes.js";
import { getAdSpecs, getSurfaceProfiles, resolveLayout } from "../../lib/api.js";
import { reresolve } from "../../lib/localResolve.js";
import type { AdSpecSummary, CanvasToggles, StudioResolution, SurfaceDescriptor, SurfaceId, ZoomMode } from "../../lib/types.js";
import { DEFAULT_CANVAS_TOGGLES } from "../../lib/types.js";
import type { SurfaceProfile } from "../../surfaces.js";
import { StudioTopBar } from "./StudioTopBar.js";
import type { ThemeMode } from "./StudioTopBar.js";
import { SurfaceToolbar } from "./SurfaceToolbar.js";
import { PreviewCanvas } from "./PreviewCanvas.js";
import { ResolutionPanel } from "./ResolutionPanel.js";
import type { CustomSurfaceForm, PanelTab } from "./ResolutionPanel.js";
import { errorMessage, formatDimensions, formatMs } from "../../lib/formatters.js";
import "./LayoutStudioPage.css";

const DEFAULT_CUSTOM_FORM: CustomSurfaceForm = { width: 640, height: 200, safeArea: 12, minTapTarget: 44, minTextSize: 0 };
const THEME_STORAGE_KEY = "als-theme";

function buildCustomProfile(form: CustomSurfaceForm): SurfaceProfile {
  return {
    width: form.width,
    height: form.height,
    safeArea: { top: form.safeArea, right: form.safeArea, bottom: form.safeArea, left: form.safeArea },
    minTapTarget: form.minTapTarget > 0 ? form.minTapTarget : undefined,
    touchOnly: form.minTapTarget > 0 ? true : undefined,
    minTextSize: form.minTextSize > 0 ? form.minTextSize : undefined,
  };
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function LayoutStudioPage() {
  const { navigate } = useRouter();
  const specParam = useSearchParam("spec");
  const surfaceParam = useSearchParam("surface");

  // -- Theme: applied at the document root, so it persists across routes. --
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "light" || stored === "dark") return stored;
    } catch {
      /* localStorage unavailable — fall through to the default. */
    }
    return "dark";
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* best-effort persistence only */
    }
  }, [theme]);

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

  const [resolution, setResolution] = useState<StudioResolution | null>(null);
  const [resolving, setResolving] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);

  // -- Local, purely client-side experiments on top of the base resolution. --
  const [priorityOverrides, setPriorityOverrides] = useState<Readonly<Record<string, number>>>({});
  const [customActive, setCustomActive] = useState(false);
  const [customForm, setCustomForm] = useState<CustomSurfaceForm>(DEFAULT_CUSTOM_FORM);

  useEffect(() => {
    let cancelled = false;
    setResolving(true);
    setError(null);
    resolveLayout({ specId: specParam ?? undefined, surfaceId: (surfaceParam as SurfaceId | null) ?? undefined })
      .then((result) => {
        if (cancelled) return;
        setResolution(result);
        setSelectedElementId(null);
        setHoveredElementId(null);
        setPriorityOverrides({});
        setCustomActive(false);
        setResolving(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(errorMessage(err));
        setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [specParam, surfaceParam]);

  const effective = useMemo<{ resolution: StudioResolution | null; error: string | null }>(() => {
    if (!resolution) return { resolution: null, error: null };
    const hasOverrides = Object.keys(priorityOverrides).length > 0;
    if (!hasOverrides && !customActive) return { resolution, error: null };
    try {
      const customSurface = customActive ? buildCustomProfile(customForm) : undefined;
      return { resolution: reresolve(resolution, { priorityOverrides, customSurface }), error: null };
    } catch (err) {
      return { resolution: null, error: errorMessage(err) };
    }
  }, [resolution, priorityOverrides, customActive, customForm]);

  const panelResolution = effective.resolution ?? resolution;

  const [panelOpen, setPanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<PanelTab>("elements");
  const [toggles, setToggles] = useState<CanvasToggles>(DEFAULT_CANVAS_TOGGLES);
  const [zoom, setZoom] = useState<ZoomMode>("fit");

  const handleSpecChange = useCallback(
    (specId: string) => {
      navigate(`/layout-studio?spec=${specId}`);
    },
    [navigate],
  );

  const handleSurfaceChange = useCallback(
    (id: SurfaceId) => {
      setCustomActive(false);
      const specId = resolution?.spec.id ?? specParam ?? undefined;
      navigate(specId ? `/layout-studio?spec=${specId}&surface=${id}` : `/layout-studio?surface=${id}`);
    },
    [navigate, resolution, specParam],
  );

  const handleActivateCustom = useCallback(() => {
    setCustomActive(true);
    setPanelOpen(true);
    setPanelTab("surface");
    setSelectedElementId(null);
  }, []);

  const handleReprioritize = useCallback(
    (fromId: string, toId: string) => {
      if (!panelResolution) return;
      const target = panelResolution.elements.find((el) => el.id === toId);
      if (!target) return;
      setPriorityOverrides((prev) => ({ ...prev, [fromId]: target.priority }));
    },
    [panelResolution],
  );

  const handleExport = useCallback(() => {
    const active = effective.resolution ?? resolution;
    if (!active) return;
    downloadJson(`${active.spec.id}--${active.surface.id}.json`, {
      spec: active.spec,
      surface: { id: active.surface.id, name: active.surface.name, profile: active.surface.profile },
      layout: active.layout,
      degradationOrder: active.degradationOrder,
      exportedAt: new Date().toISOString(),
    });
  }, [effective.resolution, resolution]);

  if (error) {
    return (
      <div className="layout-studio-page layout-studio-page--bare">
        <div className="layout-studio-page__error">
          <strong>Couldn't resolve this layout.</strong>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!resolution || !surfaces) {
    return (
      <div className="layout-studio-page layout-studio-page--bare">
        <div className="layout-studio-page__loading">Resolving…</div>
      </div>
    );
  }

  const customDims = customActive ? formatDimensions(customForm.width, customForm.height) : "type it";

  return (
    <div className="layout-studio-page">
      <StudioTopBar
        specs={specs}
        specId={resolution.spec.id}
        specVersion={resolution.spec.version}
        onSpecChange={handleSpecChange}
        resolving={resolving}
        resolveTimeLabel={panelResolution ? formatMs(panelResolution.layout.diagnostics.resolvedInMs) : "resolving"}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
        onExport={handleExport}
        canExport={!!(effective.resolution ?? resolution)}
      />

      <div className="layout-studio-page__workspace">
        <div className="layout-studio-page__stage-area">
          {effective.error ? (
            <div className="preview-canvas layout-studio-page__stage-error">
              <div className="layout-studio-page__resolver-error">
                <div className="layout-studio-page__resolver-error-kicker mono">Resolver threw</div>
                <div className="layout-studio-page__resolver-error-message mono">{effective.error}</div>
              </div>
            </div>
          ) : effective.resolution ? (
            <PreviewCanvas
              layout={effective.resolution.layout}
              elements={effective.resolution.elements}
              surfaceName={effective.resolution.surface.name}
              zoom={zoom}
              toggles={toggles}
              selectedElementId={selectedElementId}
              hoveredElementId={hoveredElementId}
              onSelectElement={setSelectedElementId}
              onHoverElement={setHoveredElementId}
              resolving={resolving}
            />
          ) : null}

          <div className="layout-studio-page__dock">
            <SurfaceToolbar
              surfaces={surfaces}
              activeSurfaceId={panelResolution?.surface.id ?? null}
              onSurfaceChange={handleSurfaceChange}
              customActive={customActive}
              customDims={customDims}
              onPickCustom={handleActivateCustom}
              safeArea={toggles.safeArea}
              onToggleSafeArea={() => setToggles((prev) => ({ ...prev, safeArea: !prev.safeArea }))}
              elementBounds={toggles.elementBounds}
              onToggleElementBounds={() => setToggles((prev) => ({ ...prev, elementBounds: !prev.elementBounds }))}
              zoom={zoom}
              onToggleZoom={() => setZoom((prev) => (prev === "fit" ? "100" : "fit"))}
            />
          </div>
        </div>

        {panelResolution ? (
          <ResolutionPanel
            open={panelOpen}
            onOpen={() => setPanelOpen(true)}
            onClose={() => setPanelOpen(false)}
            tab={panelTab}
            onTabChange={setPanelTab}
            resolution={panelResolution}
            selectedElementId={selectedElementId}
            hoveredElementId={hoveredElementId}
            onSelectElement={setSelectedElementId}
            onHoverElement={setHoveredElementId}
            hasOverrides={Object.keys(priorityOverrides).length > 0}
            onResetPriorities={() => setPriorityOverrides({})}
            onReprioritize={handleReprioritize}
            customForm={customForm}
            onCustomFieldChange={(key, value) => setCustomForm((prev) => ({ ...prev, [key]: value }))}
            onApplyCustom={handleActivateCustom}
            customActive={customActive}
          />
        ) : null}
      </div>
    </div>
  );
}
