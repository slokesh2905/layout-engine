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
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useRouter, useSearchParam } from "../../app/routes.js";
import { getAdSpecs, getSurfaceProfiles, importSpec, deleteSpec, resolveLayout, updateSpecMeta } from "../../lib/api.js";
import { reresolve, resolveAcrossSurfaces } from "../../lib/localResolve.js";
import { parseSpecFile, serializeSpecFile } from "../../lib/specFile.js";
import { clearDraft, loadDraft, saveDraft } from "../../lib/draftStorage.js";
import { editHistoryReducer, editStateFromDraft, initialEditHistory, EMPTY_EDIT_STATE } from "../../lib/editHistory.js";
import { diffResolutions } from "../../lib/layoutDiff.js";
import { renderLayoutToPngBlob } from "../../lib/exportPng.js";
import { renderLayoutToSvgString } from "../../lib/exportSvg.js";
import { parseFigmaSvg } from "../../lib/importSvg.js";
import type { AdElementSpec } from "../../spec.js";
import type { AdSpecSummary, CanvasToggles, StudioResolution, SurfaceDescriptor, SurfaceId, ZoomMode } from "../../lib/types.js";
import { DEFAULT_CANVAS_TOGGLES } from "../../lib/types.js";
import type { SurfaceProfile } from "../../surfaces.js";
import { Icon } from "../ui/Icon.js";
import { StudioTopBar } from "./StudioTopBar.js";
import type { ThemeMode } from "./StudioTopBar.js";
import { SurfaceToolbar } from "./SurfaceToolbar.js";
import { PreviewCanvas } from "./PreviewCanvas.js";
import { ResolutionPanel } from "./ResolutionPanel.js";
import type { CampaignMetaForm, CustomSurfaceForm, PanelTab } from "./ResolutionPanel.js";
import { PasteImportModal } from "./PasteImportModal.js";
import { NewSpecModal } from "./NewSpecModal.js";
import type { NewSpecSubmitPayload } from "./NewSpecModal.js";
import { errorMessage, formatDimensions, formatMs } from "../../lib/formatters.js";
import "./LayoutStudioPage.css";

const DEFAULT_CUSTOM_FORM: CustomSurfaceForm = { width: 640, height: 200, safeArea: 12, minTapTarget: 44, minTextSize: 0 };
const EMPTY_META_FORM: CampaignMetaForm = { campaignName: "", brand: "", supportingCopy: "" };
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
    try {
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
      if (window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
    } catch {
      /* matchMedia unavailable */
    }
    return "light";
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
  const [importError, setImportError] = useState<string | null>(null);
  // Phase E: PNG/SVG rendering can fail independently of import (a hostile
  // canvas policy, an image that won't decode) — kept separate from
  // importError above since the two toasts describe unrelated failures.
  const [exportError, setExportError] = useState<string | null>(null);
  // Phase G: true only while "Export All Surfaces" is actively working
  // through its per-surface loop — used to disable the button against a
  // double-click (each run already triggers up to 2×surfaces browser
  // downloads; doubling that from an impatient second click helps no one).
  const [batchExporting, setBatchExporting] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);

  // Phase H: the editable Campaign tab's form state — synced from
  // `resolution.spec` whenever the active spec/surface changes (see the
  // resolve effect below), then edited freely until "Save campaign
  // details" actually persists it via updateSpecMeta(). Not part of the
  // priority/image/content override family above: it never affects the
  // resolved layout, so it's never re-resolved and never touches
  // ../../lib/localResolve.ts.
  const [metaForm, setMetaForm] = useState<CampaignMetaForm>(EMPTY_META_FORM);
  const [savingMeta, setSavingMeta] = useState(false);
  // Which paste-to-import dialog (if any) is open — see ./PasteImportModal.tsx.
  const [pasteModal, setPasteModal] = useState<"spec" | "svg" | null>(null);
  // New-spec modal — open when user clicks "+ New" in the top bar.
  const [newSpecOpen, setNewSpecOpen] = useState(false);

  // -- Local, purely client-side experiments on top of the base resolution. --
  const [customActive, setCustomActive] = useState(false);
  const [customForm, setCustomForm] = useState<CustomSurfaceForm>(DEFAULT_CUSTOM_FORM);
  // The six content-affecting local edits below — priority overrides,
  // drag-reordering, uploaded images, inline content edits, and
  // added/removed elements — now live in one undo/redo history stack (see
  // ../../lib/editHistory.ts) instead of six independent `useState` calls,
  // so a single user action (a drag-drop, an upload, an add/remove, a
  // "Reset to spec") becomes exactly one undo step across all of them.
  const [editHistory, dispatchEdit] = useReducer(editHistoryReducer, initialEditHistory(EMPTY_EDIT_STATE));
  const { priorityOverrides, orderOverrides, imageOverrides, contentOverrides, weightOverrides, addedElements, removedElementIds } = editHistory.present;
  const canUndo = editHistory.past.length > 0;
  const canRedo = editHistory.future.length > 0;
  // Tracks an in-progress typing session in the roster's content field (see
  // handleUpdateContent below) — the state from *before* the first
  // keystroke, so the whole burst of typing collapses into one undo step
  // once the user pauses, rather than one step per character.
  const typingBaselineRef = useRef<typeof editHistory.present | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);

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
        // Phase D: a saved draft for this exact spec (see ../../lib/draftStorage.ts)
        // overrides the usual "switching spec/surface clears every local
        // experiment" reset below — this is what makes an accidental
        // refresh non-destructive without also surviving a tab close.
        const draft = loadDraft(result.spec.id);
        // A fresh history for this spec — a previous spec's undo/redo stack
        // has no meaning here, same as its draft is scoped per spec id.
        dispatchEdit({ type: "reset", value: editStateFromDraft(draft) });
        setCustomActive(draft?.customActive ?? false);
        if (draft) setCustomForm(draft.customForm);
        // Phase H: campaign meta isn't part of the draft above — it isn't a
        // local "what if" experiment, it's the spec's actual saved-or-not
        // name/brand/copy — so it always comes straight from the freshly
        // resolved spec's own summary, never from sessionStorage.
        setMetaForm({ campaignName: result.spec.name, brand: result.spec.brand, supportingCopy: result.spec.supportingCopy });
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

  const hasOverrides =
    Object.keys(priorityOverrides).length > 0 ||
    orderOverrides.length > 0 ||
    Object.keys(imageOverrides).length > 0 ||
    Object.keys(contentOverrides).length > 0 ||
    Object.keys(weightOverrides).length > 0 ||
    addedElements.length > 0 ||
    removedElementIds.length > 0;

  // Phase D: keeps the current spec's draft in sessionStorage up to date
  // with every local edit, and removes it once there's nothing left worth
  // restoring (both "Reset to spec" and manually undoing every edit land
  // here). Loading the draft back is the resolve effect's job above — this
  // effect only ever writes for the spec that's currently active.
  useEffect(() => {
    if (!resolution) return;
    const specId = resolution.spec.id;
    if (!hasOverrides && !customActive) {
      clearDraft(specId);
      return;
    }
    saveDraft(specId, { priorityOverrides, orderOverrides, imageOverrides, contentOverrides, weightOverrides, addedElements, removedElementIds, customActive, customForm });
  }, [
    resolution,
    hasOverrides,
    customActive,
    customForm,
    priorityOverrides,
    orderOverrides,
    imageOverrides,
    contentOverrides,
    weightOverrides,
    addedElements,
    removedElementIds,
  ]);

  const effective = useMemo<{ resolution: StudioResolution | null; error: string | null }>(() => {
    if (!resolution) return { resolution: null, error: null };
    if (!hasOverrides && !customActive) return { resolution, error: null };
    try {
      const customSurface = customActive ? buildCustomProfile(customForm) : undefined;
      return {
        resolution: reresolve(resolution, {
          priorityOverrides,
          orderOverrides,
          customSurface,
          imageOverrides,
          contentOverrides,
          weightOverrides,
          addedElements,
          removedElementIds,
        }),
        error: null,
      };
    } catch (err) {
      return { resolution: null, error: errorMessage(err) };
    }
  }, [
    resolution,
    priorityOverrides,
    orderOverrides,
    imageOverrides,
    contentOverrides,
    weightOverrides,
    addedElements,
    removedElementIds,
    hasOverrides,
    customActive,
    customForm,
  ]);

  const panelResolution = effective.resolution ?? resolution;

  const [panelOpen, setPanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<PanelTab>("elements");
  const [toggles, setToggles] = useState<CanvasToggles>(DEFAULT_CANVAS_TOGGLES);
  const [zoom, setZoom] = useState<ZoomMode>("fit");

  // Compare mode — resolves the exact same effective spec (every live local
  // edit already applied) against a second real surface via
  // ../../lib/localResolve.ts's resolveAcrossSurfaces() (the same function
  // "Export All Surfaces" already uses), then diffs the two ResolvedLayouts
  // element-by-element (../../lib/layoutDiff.ts). Scoped to two *real*
  // catalog surfaces only — a typed-in custom surface has no stable id to
  // compare against, so activating one turns Compare off (see
  // handleActivateCustom below) and activating Compare turns Custom off.
  const [compareActive, setCompareActive] = useState(false);
  const [compareSurfaceId, setCompareSurfaceId] = useState<SurfaceId | null>(null);

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
    setCompareActive(false);
    setPanelOpen(true);
    setPanelTab("surface");
    setSelectedElementId(null);
  }, []);

  const handleToggleCompare = useCallback(() => {
    setCompareActive((prev) => {
      const next = !prev;
      if (next) setCustomActive(false);
      return next;
    });
  }, []);

  const handleCompareSurfaceChange = useCallback((id: SurfaceId) => {
    setCompareSurfaceId(id);
  }, []);

  // Surfaces the picker offers as a compare target — every real surface
  // except whichever one is currently active (comparing a surface against
  // itself would always show zero diffs, so there's nothing to offer).
  const compareCandidates = useMemo(
    () => (surfaces ?? []).filter((s) => s.id !== resolution?.surface.id),
    [surfaces, resolution],
  );

  // Seeds a default compare target the first time Compare is turned on (or
  // if the active surface itself changes to match whatever was selected) —
  // never overrides a target the user already picked.
  useEffect(() => {
    if (!compareActive) return;
    if (compareSurfaceId && compareCandidates.some((s) => s.id === compareSurfaceId)) return;
    const fallback = compareCandidates[0];
    if (fallback) setCompareSurfaceId(fallback.id);
  }, [compareActive, compareSurfaceId, compareCandidates]);

  // Both sides of the comparison share one `elements` roster and one
  // effective spec (resolveAcrossSurfaces computes the effective spec
  // exactly once) — only `layout` differs, one per surface — so ids line
  // up perfectly for diffResolutions() below.
  const compareData = useMemo(() => {
    if (!compareActive || !resolution || customActive) return null;
    const target = compareCandidates.find((s) => s.id === compareSurfaceId);
    if (!target) return null;
    const [a, b] = resolveAcrossSurfaces(resolution, [resolution.surface, target], {
      priorityOverrides,
      orderOverrides,
      imageOverrides,
      contentOverrides,
      weightOverrides,
      addedElements,
      removedElementIds,
    });
    if (!a || !b) return null;
    return { a, b, diff: diffResolutions(a.elements, a.layout, b.layout) };
  }, [
    compareActive,
    resolution,
    customActive,
    compareCandidates,
    compareSurfaceId,
    priorityOverrides,
    orderOverrides,
    imageOverrides,
    contentOverrides,
    weightOverrides,
    addedElements,
    removedElementIds,
  ]);

  // Each handler below computes the *whole* next EditState and dispatches
  // one "commit" — that's what makes a drag-drop that touches both
  // priority and order, say, collapse into a single undo step instead of
  // two. handleUpdateContent (continuous typing) is the one exception —
  // see its own comment.
  const handleReprioritize = useCallback(
    (fromId: string, toId: string) => {
      if (!panelResolution) return;
      const elements = panelResolution.elements;
      const fromIndex = elements.findIndex((el) => el.id === fromId);
      const toIndex = elements.findIndex((el) => el.id === toId);
      if (fromIndex === -1 || toIndex === -1) return;

      const target = elements[toIndex];
      if (!target) return;

      const current = editHistory.present;
      const nextPriorityOverrides = { ...current.priorityOverrides, [fromId]: target.priority };

      const currentOrder = current.orderOverrides.length > 0 ? current.orderOverrides : elements.map((e) => e.id);
      const fromIdx = currentOrder.indexOf(fromId);
      const toIdx = currentOrder.indexOf(toId);
      let nextOrderOverrides = current.orderOverrides;
      if (fromIdx !== -1 && toIdx !== -1) {
        const newOrder = [...currentOrder];
        newOrder.splice(fromIdx, 1);
        newOrder.splice(toIdx, 0, fromId);
        nextOrderOverrides = newOrder;
      }

      dispatchEdit({
        type: "commit",
        value: { ...current, priorityOverrides: nextPriorityOverrides, orderOverrides: nextOrderOverrides },
      });
    },
    [panelResolution, editHistory.present],
  );

  const handleUploadImage = useCallback(
    (elementId: string, dataUrl: string) => {
      const current = editHistory.present;
      dispatchEdit({ type: "commit", value: { ...current, imageOverrides: { ...current.imageOverrides, [elementId]: dataUrl } } });
    },
    [editHistory.present],
  );

  // Continuous typing needs to re-resolve on every keystroke (that's the
  // whole point of an inline-editable field) without turning every
  // keystroke into its own undo step — see ../../lib/editHistory.ts's
  // "replace"/"commitBaseline" doc comments. `typingBaselineRef` captures
  // the state from just before the *first* keystroke of a burst; once
  // 600ms pass with no further typing (a pause, a blur, switching fields),
  // that baseline is pushed onto the undo stack as a single step covering
  // the whole burst — the same granularity a text editor's own undo gives
  // a sentence you just typed.
  const handleUpdateContent = useCallback(
    (elementId: string, value: string) => {
      if (typingBaselineRef.current === null) {
        typingBaselineRef.current = editHistory.present;
      }
      const current = editHistory.present;
      dispatchEdit({ type: "replace", value: { ...current, contentOverrides: { ...current.contentOverrides, [elementId]: value } } });

      if (typingTimeoutRef.current !== null) window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = window.setTimeout(() => {
        const baseline = typingBaselineRef.current;
        typingBaselineRef.current = null;
        typingTimeoutRef.current = null;
        if (baseline) dispatchEdit({ type: "commitBaseline", baseline });
      }, 600);
    },
    [editHistory.present],
  );

  // Same typing-burst debounce handleUpdateContent above uses (and the same
  // typingBaselineRef/typingTimeoutRef pair — a burst of either kind of
  // field collapses into one undo step, keyed to whichever field the user
  // was actually typing into). `value === null` clears this element's
  // override (delete its key) rather than storing an `undefined`, since
  // weightOverrides is a plain `Record<string, number>` — clearing reverts
  // it to whatever the base spec says (usually nothing, i.e. its role's
  // resolver.ts default), the same "override present -> present wins, else
  // fall through to the spec" layering every other override field uses.
  const handleUpdateWeight = useCallback(
    (elementId: string, value: number | null) => {
      if (typingBaselineRef.current === null) {
        typingBaselineRef.current = editHistory.present;
      }
      const current = editHistory.present;
      const nextWeightOverrides = { ...current.weightOverrides };
      if (value === null) delete nextWeightOverrides[elementId];
      else nextWeightOverrides[elementId] = value;
      dispatchEdit({ type: "replace", value: { ...current, weightOverrides: nextWeightOverrides } });

      if (typingTimeoutRef.current !== null) window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = window.setTimeout(() => {
        const baseline = typingBaselineRef.current;
        typingBaselineRef.current = null;
        typingTimeoutRef.current = null;
        if (baseline) dispatchEdit({ type: "commitBaseline", baseline });
      }, 600);
    },
    [editHistory.present],
  );

  const handleAddElement = useCallback(
    (element: AdElementSpec) => {
      const current = editHistory.present;
      dispatchEdit({ type: "commit", value: { ...current, addedElements: [...current.addedElements, element] } });
    },
    [editHistory.present],
  );

  const handleRemoveElement = useCallback(
    (elementId: string) => {
      const current = editHistory.present;
      // A removed element was either one of the base spec's own elements or
      // one added locally this session — drop it from `addedElements` too
      // so it doesn't linger there; filtering an id that was never added is
      // a harmless no-op.
      dispatchEdit({
        type: "commit",
        value: {
          ...current,
          removedElementIds: current.removedElementIds.includes(elementId) ? current.removedElementIds : [...current.removedElementIds, elementId],
          addedElements: current.addedElements.filter((el) => el.id !== elementId),
        },
      });
      if (selectedElementId === elementId) setSelectedElementId(null);
    },
    [editHistory.present, selectedElementId],
  );

  // Reset is itself just one more (undoable) edit — landing on
  // EMPTY_EDIT_STATE rather than wiping `past`/`future`, so "Reset to
  // spec" followed by Undo genuinely brings every override back.
  const handleResetOverrides = useCallback(() => {
    dispatchEdit({ type: "commit", value: EMPTY_EDIT_STATE });
  }, []);

  const handleUndo = useCallback(() => {
    // A pending typing burst hasn't been committed yet — undoing right now
    // should undo the edit *before* that burst, not silently drop it, so
    // flush it into history first.
    if (typingBaselineRef.current !== null) {
      const baseline = typingBaselineRef.current;
      typingBaselineRef.current = null;
      if (typingTimeoutRef.current !== null) {
        window.clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      dispatchEdit({ type: "commitBaseline", baseline });
    }
    dispatchEdit({ type: "undo" });
  }, []);

  const handleRedo = useCallback(() => {
    dispatchEdit({ type: "redo" });
  }, []);

  // Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or Ctrl+Y), but only while focus isn't
  // inside a text input/textarea — the roster's own content field has its
  // own native undo the browser already handles, and hijacking it there
  // would fight the very typing-burst logic handleUpdateContent above sets
  // up on purpose.
  useEffect(() => {
    function isEditableTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || isEditableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        handleRedo();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, handleRedo]);

  const handleExportLayout = useCallback(() => {
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

  // Distinct from handleExportLayout above: this downloads the *editable
  // source* spec (see ../../lib/specFile.ts) — a portable file a user can
  // reopen or hand to someone else, since there's no backend to save it
  // for them. Reads off `effective.resolution ?? resolution` (not just the
  // base `resolution`) so a live priority-drag experiment is reflected in
  // what gets exported, same as handleExportLayout already does.
  const handleExportSpec = useCallback(() => {
    const active = effective.resolution ?? resolution;
    if (!active) return;
    const file = serializeSpecFile(
      { campaignName: active.spec.name, brand: active.spec.brand, supportingCopy: active.spec.supportingCopy },
      active.rawSpec,
    );
    downloadJson(`${active.spec.id}.spec.json`, file);
  }, [effective.resolution, resolution]);

  // Phase E: the two visual exports. Both read off the same
  // `effective.resolution ?? resolution` as the JSON exports above, so a
  // locally-edited view (dragged priority, uploaded image, edited text)
  // exports what's actually on screen. "Export SVG" is the Figma-compatible
  // one — see ../../lib/exportSvg.ts's doc comment.
  const handleExportPng = useCallback(() => {
    const active = effective.resolution ?? resolution;
    if (!active) return;
    setExportError(null);
    renderLayoutToPngBlob(active)
      .then((blob) => downloadBlob(`${active.spec.id}--${active.surface.id}.png`, blob))
      .catch((err: unknown) => setExportError(errorMessage(err)));
  }, [effective.resolution, resolution]);

  const handleExportSvg = useCallback(() => {
    const active = effective.resolution ?? resolution;
    if (!active) return;
    setExportError(null);
    renderLayoutToSvgString(active)
      .then((svg) => downloadBlob(`${active.spec.id}--${active.surface.id}.svg`, new Blob([svg], { type: "image/svg+xml" })))
      .catch((err: unknown) => setExportError(errorMessage(err)));
  }, [effective.resolution, resolution]);

  // Phase G: one layout JSON + one PNG per surface in the catalog, for the
  // spec/edits currently on screen. Reuses ../../lib/localResolve.ts's
  // resolveAcrossSurfaces() to compute the effective spec exactly once and
  // resolve it against every real surface profile — same overrides
  // (priority/image/content/added/removed) the live preview already
  // reflects, so a batch export matches what's actually being looked at.
  // No zip dependency: this just triggers 2×surfaces individual downloads,
  // one surface at a time with a short pause between — see the loop below
  // for why. A PNG render failure for one surface (a decode error, a
  // hostile canvas policy) doesn't abort the rest; its JSON still comes
  // down, and every failure is reported together at the end.
  const handleExportAllSurfaces = useCallback(async () => {
    const base = resolution;
    if (!base || !surfaces || surfaces.length === 0 || batchExporting) return;
    setExportError(null);
    setBatchExporting(true);
    try {
      const perSurface = resolveAcrossSurfaces(base, surfaces, {
        priorityOverrides,
        orderOverrides,
        imageOverrides,
        contentOverrides,
        weightOverrides,
        addedElements,
        removedElementIds,
      });
      const pngFailures: string[] = [];
      for (const surfaceResolution of perSurface) {
        const stem = `${surfaceResolution.spec.id}--${surfaceResolution.surface.id}`;
        downloadJson(`${stem}.json`, {
          spec: surfaceResolution.spec,
          surface: { id: surfaceResolution.surface.id, name: surfaceResolution.surface.name, profile: surfaceResolution.surface.profile },
          layout: surfaceResolution.layout,
          degradationOrder: surfaceResolution.degradationOrder,
          exportedAt: new Date().toISOString(),
        });
        try {
          const blob = await renderLayoutToPngBlob(surfaceResolution);
          downloadBlob(`${stem}.png`, blob);
        } catch {
          pngFailures.push(surfaceResolution.surface.name);
        }
        // Chrome (and others) treat a burst of script-triggered downloads
        // fired in the same tick as a candidate for its "this site is
        // trying to download multiple files" block — a real risk here,
        // since one click means up to 2×surfaces downloads. Spacing them
        // out, one surface at a time, is the whole mitigation available
        // without a zip dependency; it costs nothing a user would notice.
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      if (pngFailures.length > 0) {
        setExportError(`Couldn't render a PNG for: ${pngFailures.join(", ")} (that surface's layout JSON still downloaded).`);
      }
    } finally {
      setBatchExporting(false);
    }
  }, [resolution, surfaces, priorityOverrides, orderOverrides, imageOverrides, contentOverrides, weightOverrides, addedElements, removedElementIds, batchExporting]);

  const handleImportSpec = useCallback(
    (file: File) => {
      setImportError(null);
      file
        .text()
        .then((text) => {
          const { meta, spec } = parseSpecFile(text);
          return importSpec(meta, spec);
        })
        .then((summary) => {
          // The spec picker's options come from this list — without adding
          // the new summary to it, the dropdown would have no <option> for
          // the id we're about to navigate to.
          setSpecs((prev) => (prev ? [...prev, summary] : [summary]));
          navigate(`/layout-studio?spec=${summary.id}`);
        })
        .catch((err: unknown) => setImportError(errorMessage(err)));
    },
    [navigate],
  );

  // Phase F: the Figma-compatible "in" half. Shares importError/the same
  // success path as handleImportSpec above (new summary appended, navigate
  // to it) — the only real difference is where the AdSpec + a starting
  // campaign name come from: ../../lib/importSvg.ts's parseFigmaSvg() in
  // place of parseSpecFile(). brand/supportingCopy have no SVG-native
  // source, so they start blank, same as any fresh spec would.
  const handleImportFigmaSvg = useCallback(
    (file: File) => {
      setImportError(null);
      file
        .text()
        .then((text) => {
          const { spec, suggestedName } = parseFigmaSvg(text);
          const meta = { campaignName: suggestedName ?? "Imported from Figma", brand: "", supportingCopy: "" };
          return importSpec(meta, spec);
        })
        .then((summary) => {
          setSpecs((prev) => (prev ? [...prev, summary] : [summary]));
          navigate(`/layout-studio?spec=${summary.id}`);
        })
        .catch((err: unknown) => setImportError(errorMessage(err)));
    },
    [navigate],
  );

  // Phase H: paste-to-import. Both mirror their file-picker counterparts
  // above exactly, minus the `file.text()` step — and both are handed
  // straight to ./PasteImportModal.tsx as its `onSubmit`, so a thrown
  // parse error (parseSpecFile/parseFigmaSvg are synchronous throws; an
  // async function wrapping them turns that into a rejected promise
  // automatically) surfaces inline in the dialog instead of the page's
  // importError toast — letting the user fix the pasted text and retry
  // without losing it or the dialog closing out from under them.
  const handlePasteSpecSubmit = useCallback(
    async (text: string) => {
      const { meta, spec } = parseSpecFile(text);
      const summary = await importSpec(meta, spec);
      setSpecs((prev) => (prev ? [...prev, summary] : [summary]));
      setPasteModal(null);
      navigate(`/layout-studio?spec=${summary.id}`);
    },
    [navigate],
  );

  const handlePasteSvgSubmit = useCallback(
    async (text: string) => {
      const { spec, suggestedName } = parseFigmaSvg(text);
      const meta = { campaignName: suggestedName ?? "Imported from Figma", brand: "", supportingCopy: "" };
      const summary = await importSpec(meta, spec);
      setSpecs((prev) => (prev ? [...prev, summary] : [summary]));
      setPasteModal(null);
      navigate(`/layout-studio?spec=${summary.id}`);
    },
    [navigate],
  );

  // Duplicate / Save As. Unlike New Spec (a blank form) or Import (an
  // external file), this clones what's actually on screen right now —
  // `effective.resolution?.rawSpec` already has every live local edit
  // (priority drags, reordering, uploaded images, inline content edits,
  // added/removed elements) baked in via ../../lib/localResolve.ts, so
  // duplicating is how those otherwise-ephemeral, draft-only experiments
  // (see the draft effect above) become a real, independent, permanent
  // catalog entry — the same durability tier as an imported spec, reusing
  // importSpec() exactly as NewSpecModal's submit does below. Works on a
  // built-in spec too (never gated on isCustom, unlike delete): that's the
  // only way to get an editable copy of one, since a built-in's own
  // elements are never mutated in place.
  const handleDuplicateSpec = useCallback(() => {
    const active = effective.resolution ?? resolution;
    if (!active) return;
    setImportError(null);
    const meta = {
      campaignName: `${active.spec.name} (Copy)`,
      brand: active.spec.brand,
      supportingCopy: active.spec.supportingCopy,
    };
    importSpec(meta, active.rawSpec)
      .then((summary) => {
        setSpecs((prev) => (prev ? [...prev, summary] : [summary]));
        navigate(`/layout-studio?spec=${summary.id}`);
      })
      .catch((err: unknown) => setImportError(errorMessage(err)));
  }, [effective.resolution, resolution, navigate]);

  // Phase H: editable campaign meta. Unlike every other override in this
  // file, saving this one really does call the adapter (updateSpecMeta())
  // — it isn't a local "what if" re-resolved through localResolve.ts, it's
  // an actual rename of the catalog entry for the rest of the session, the
  // same durability tier as an imported spec. Updates `resolution.spec` and
  // `specs` in place afterward rather than re-fetching, so the change shows
  // up immediately in the spec picker and anything reading `resolution.spec`
  // (Export Spec, the Studio wordmark row) without a network round trip.
  const handleMetaFieldChange = useCallback((key: keyof CampaignMetaForm, value: string) => {
    setMetaForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSaveMeta = useCallback(() => {
    if (!resolution) return;
    setSavingMeta(true);
    updateSpecMeta(resolution.spec.id, metaForm)
      .then((summary) => {
        setResolution((prev) => (prev ? { ...prev, spec: summary } : prev));
        setSpecs((prev) => (prev ? prev.map((s) => (s.id === summary.id ? summary : s)) : prev));
      })
      .catch((err: unknown) => setExportError(errorMessage(err)))
      .finally(() => setSavingMeta(false));
  }, [resolution, metaForm]);

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
  const metaDirty =
    metaForm.campaignName !== resolution.spec.name ||
    metaForm.brand !== resolution.spec.brand ||
    metaForm.supportingCopy !== resolution.spec.supportingCopy;

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
        onExportLayout={handleExportLayout}
        canExportLayout={!!(effective.resolution ?? resolution)}
        onExportSpec={handleExportSpec}
        canExportSpec={!!(effective.resolution ?? resolution)}
        onImportSpec={handleImportSpec}
        onExportPng={handleExportPng}
        canExportPng={!!(effective.resolution ?? resolution)}
        onExportSvg={handleExportSvg}
        canExportSvg={!!(effective.resolution ?? resolution)}
        onImportFigmaSvg={handleImportFigmaSvg}
        onExportAllSurfaces={handleExportAllSurfaces}
        canExportAllSurfaces={!!resolution && !!surfaces && surfaces.length > 0}
        exportingAllSurfaces={batchExporting}
        onOpenPasteSpec={() => setPasteModal("spec")}
        onOpenPasteSvg={() => setPasteModal("svg")}
        onOpenNewSpec={() => setNewSpecOpen(true)}
        onDuplicateSpec={handleDuplicateSpec}
        canDuplicateSpec={!!(effective.resolution ?? resolution)}
        onDeleteSpec={() => {
          if (!resolution?.spec.isCustom) return;
          const specId = resolution.spec.id;
          deleteSpec(specId)
            .then(() => {
              setSpecs((prev) => prev ? prev.filter((s) => s.id !== specId) : prev);
              // Navigate to the first available spec that isn't the deleted one
              navigate("/layout-studio");
            })
            .catch((err: unknown) => setImportError(errorMessage(err)));
        }}
        canDeleteSpec={!!(resolution?.spec.isCustom)}
      />

      <div className="layout-studio-page__workspace">
        {importError ? (
          <div className="layout-studio-page__toast" role="alert">
            <span className="layout-studio-page__toast-icon" aria-hidden="true">
              <Icon name="alert-triangle" size={15} />
            </span>
            <span>{importError}</span>
            <button type="button" className="layout-studio-page__toast-close" onClick={() => setImportError(null)} aria-label="Dismiss">
              <Icon name="close" size={13} />
            </button>
          </div>
        ) : null}

        {exportError ? (
          <div className="layout-studio-page__toast" role="alert">
            <span className="layout-studio-page__toast-icon" aria-hidden="true">
              <Icon name="alert-triangle" size={15} />
            </span>
            <span>{exportError}</span>
            <button type="button" className="layout-studio-page__toast-close" onClick={() => setExportError(null)} aria-label="Dismiss">
              <Icon name="close" size={13} />
            </button>
          </div>
        ) : null}

        <div className="layout-studio-page__stage-area">
          {effective.error ? (
            <div className="preview-canvas layout-studio-page__stage-error">
              <div className="layout-studio-page__resolver-error">
                <div className="layout-studio-page__resolver-error-kicker mono">Resolver threw</div>
                <div className="layout-studio-page__resolver-error-message mono">{effective.error}</div>
              </div>
            </div>
          ) : compareActive && compareData ? (
            <div className="layout-studio-page__compare-stage">
              <div className="layout-studio-page__compare-pane">
                <div className="layout-studio-page__compare-pane-label mono">{compareData.a.surface.name}</div>
                <PreviewCanvas
                  layout={compareData.a.layout}
                  elements={compareData.a.elements}
                  surfaceName={compareData.a.surface.name}
                  zoom={zoom}
                  toggles={toggles}
                  selectedElementId={selectedElementId}
                  hoveredElementId={hoveredElementId}
                  onSelectElement={setSelectedElementId}
                  onHoverElement={setHoveredElementId}
                  resolving={resolving}
                />
              </div>
              <div className="layout-studio-page__compare-pane">
                <div className="layout-studio-page__compare-pane-label mono">{compareData.b.surface.name}</div>
                <PreviewCanvas
                  layout={compareData.b.layout}
                  elements={compareData.b.elements}
                  surfaceName={compareData.b.surface.name}
                  zoom={zoom}
                  toggles={toggles}
                  selectedElementId={selectedElementId}
                  hoveredElementId={hoveredElementId}
                  onSelectElement={setSelectedElementId}
                  onHoverElement={setHoveredElementId}
                  resolving={resolving}
                />
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
            hasOverrides={hasOverrides}
            onResetPriorities={handleResetOverrides}
            canUndo={canUndo}
            onUndo={handleUndo}
            canRedo={canRedo}
            onRedo={handleRedo}
            onReprioritize={handleReprioritize}
            onUploadImage={handleUploadImage}
            onUpdateContent={handleUpdateContent}
            onUpdateWeight={handleUpdateWeight}
            onRemoveElement={handleRemoveElement}
            onAddElement={handleAddElement}
            customForm={customForm}
            onCustomFieldChange={(key, value) => setCustomForm((prev) => ({ ...prev, [key]: value }))}
            onApplyCustom={handleActivateCustom}
            customActive={customActive}
            metaForm={metaForm}
            onMetaFieldChange={handleMetaFieldChange}
            onSaveMeta={handleSaveMeta}
            metaDirty={metaDirty}
            savingMeta={savingMeta}
            compareActive={compareActive}
            onToggleCompare={handleToggleCompare}
            compareSurfaceId={compareSurfaceId}
            onCompareSurfaceChange={handleCompareSurfaceChange}
            compareCandidates={compareCandidates}
            compareDiff={compareData?.diff ?? null}
            compareASurfaceName={compareData?.a.surface.name ?? null}
            compareBSurfaceName={compareData?.b.surface.name ?? null}
            compareDisabledReason={
              customActive ? "You're previewing a custom surface right now — turning Compare on switches back to a real one." : null
            }
          />
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

        {newSpecOpen ? (
          <NewSpecModal
            onSubmit={async ({ meta, spec }: NewSpecSubmitPayload) => {
              const summary = await importSpec(meta, spec);
              setSpecs((prev) => (prev ? [...prev, summary] : [summary]));
              setNewSpecOpen(false);
              navigate(`/layout-studio?spec=${summary.id}`);
            }}
            onClose={() => setNewSpecOpen(false)}
          />
        ) : null}
      </div>
    </div>
  );
}
