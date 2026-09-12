/**
 * A real undo/redo history stack over the Studio's local "what if" edits —
 * priority overrides, drag-reordering, uploaded images, inline content
 * edits, and added/removed elements (see LayoutStudioPage.tsx and
 * ./localResolve.ts, which is what actually re-resolves whatever
 * `EditState` this file is currently holding). It replaces what used to be
 * six independent `useState` calls in LayoutStudioPage.tsx with one
 * `useReducer`, so every edit that should count as a single undo step
 * updates all six fields atomically in one dispatch.
 *
 * Deliberately does NOT cover `customActive`/`customForm` (the Surface
 * tab's typed-in profile) — that was never part of `hasOverrides` either;
 * it's a separate "preview against a different surface" experiment, not an
 * edit to the ad itself, and undoing a content edit shouldn't also revert
 * which surface you happened to be looking at.
 */
import type { AdElementSpec } from "../spec.js";
import type { StudioDraft } from "./draftStorage.js";

export interface EditState {
  readonly priorityOverrides: Readonly<Record<string, number>>;
  readonly orderOverrides: readonly string[];
  readonly imageOverrides: Readonly<Record<string, string>>;
  readonly contentOverrides: Readonly<Record<string, string>>;
  /**
   * Per-element `weight` overrides (backlog item 9 — see resolver.ts's
   * `elementWeight()`) — same shape and same override-layering semantics
   * as `priorityOverrides` above: keyed by element id, applied on top of
   * whatever the base spec itself set (usually nothing, i.e. "use this
   * role's default"). Clearing an id from this record (rather than never
   * setting one to `undefined` — the record can't hold that) reverts that
   * element to whatever the base spec says, exactly like every other
   * override field here.
   */
  readonly weightOverrides: Readonly<Record<string, number>>;
  readonly addedElements: readonly AdElementSpec[];
  readonly removedElementIds: readonly string[];
}

export const EMPTY_EDIT_STATE: EditState = {
  priorityOverrides: {},
  orderOverrides: [],
  imageOverrides: {},
  contentOverrides: {},
  weightOverrides: {},
  addedElements: [],
  removedElementIds: [],
};

/** Builds the starting `EditState` for a freshly (re)loaded spec — whatever
 *  its saved draft holds, or the empty state if there isn't one. */
export function editStateFromDraft(draft: StudioDraft | null): EditState {
  if (!draft) return EMPTY_EDIT_STATE;
  return {
    priorityOverrides: draft.priorityOverrides,
    orderOverrides: draft.orderOverrides,
    imageOverrides: draft.imageOverrides,
    contentOverrides: draft.contentOverrides,
    weightOverrides: draft.weightOverrides,
    addedElements: draft.addedElements,
    removedElementIds: draft.removedElementIds,
  };
}

export interface EditHistory {
  readonly past: readonly EditState[];
  readonly present: EditState;
  readonly future: readonly EditState[];
}

export function initialEditHistory(present: EditState): EditHistory {
  return { past: [], present, future: [] };
}

// A generous but finite cap — without one, an hour-long editing session
// would grow `past` forever. 50 steps is far more than anyone scrolls back
// through by hand; the oldest step is simply dropped once exceeded, same
// as every mainstream editor's undo buffer.
const MAX_HISTORY = 50;

function capPast(past: readonly EditState[]): readonly EditState[] {
  return past.length > MAX_HISTORY ? past.slice(past.length - MAX_HISTORY) : past;
}

export type EditHistoryAction =
  // A discrete, atomic edit (a drag-drop reprioritize, an image upload, an
  // add/remove, a "Reset to spec") — the current `present` becomes the new
  // undo step, `value` becomes the new `present`, and `future` is cleared
  // (making a fresh edit after undoing abandons whatever was undone, same
  // as every text editor).
  | { readonly type: "commit"; readonly value: EditState }
  // Updates `present` in place without touching `past`/`future` — used
  // while a text field is still being typed into, so the live preview
  // re-resolves on every keystroke without turning every keystroke into
  // its own undo step.
  | { readonly type: "replace"; readonly value: EditState }
  // Finalizes an in-progress typing session (see `handleUpdateContent` in
  // LayoutStudioPage.tsx) into exactly one undo step: `baseline` — the
  // state from *before* the first keystroke of that session — is what
  // gets pushed onto `past`; `present` is left as whatever the last
  // `replace` already set it to.
  | { readonly type: "commitBaseline"; readonly baseline: EditState }
  | { readonly type: "undo" }
  | { readonly type: "redo" }
  // Starts a brand new history with no past/future — used when switching
  // to a different spec (or surface's owning spec): a previous spec's
  // undo stack is meaningless once you've navigated away from it, exactly
  // like its draft is scoped per spec id in draftStorage.ts.
  | { readonly type: "reset"; readonly value: EditState };

export function editHistoryReducer(state: EditHistory, action: EditHistoryAction): EditHistory {
  switch (action.type) {
    case "commit":
      return { past: capPast([...state.past, state.present]), present: action.value, future: [] };
    case "replace":
      return { ...state, present: action.value };
    case "commitBaseline":
      return { past: capPast([...state.past, action.baseline]), present: state.present, future: [] };
    case "undo": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1]!;
      return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future] };
    }
    case "redo": {
      if (state.future.length === 0) return state;
      const next = state.future[0]!;
      return { past: capPast([...state.past, state.present]), present: next, future: state.future.slice(1) };
    }
    case "reset":
      return { past: [], present: action.value, future: [] };
  }
}
