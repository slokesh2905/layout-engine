/**
 * Repurposed for the redesign: this file now renders just the Elements tab
 * of <ResolutionPanel>'s single 320px panel (it used to be its own
 * always-visible left drawer — see the studio redesign's handoff notes for
 * why that drawer went away). Still the full element roster (including
 * anything this surface dropped) and the degradation order, rendered
 * verbatim from `describeDegradationOrder()` (resolver.ts) — never
 * re-authored here — plus capabilities layered on top of the read-only
 * roster: dragging a row onto another hands it that element's current
 * priority and re-resolves (the roster's drag handle finally does
 * something); an "Upload image…" affordance on image rows lets a user
 * replace a built-in placeholder with their own file; the content field is
 * directly editable per row (text/label/alt, whichever `elementContent()`
 * would read for that element's type); a row can be removed outright
 * (guarded so the roster never drops to zero elements — `defineAd()`
 * requires at least one); and a compact form at the bottom builds a brand
 * new element to append to the spec. All of it — uploads, edits, removals,
 * additions — stays client-side (see LayoutStudioPage.tsx's
 * `imageOverrides`/`contentOverrides`/`addedElements`/`removedElementIds`),
 * never uploaded anywhere.
 */
import { useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { Icon } from "../ui/Icon.js";
import type { IconName } from "../ui/Icon.js";
import type { AdElementSpec, ElementRole } from "../../spec.js";
import { ROLE_WEIGHT } from "../../resolver.js";
import type { ResolvedLayout, StudioElement } from "../../lib/types.js";
import "./SpecInspector.css";

interface ElementsTabProps {
  readonly elements: readonly StudioElement[];
  readonly layout: ResolvedLayout;
  readonly degradationOrder: readonly string[];
  readonly selectedElementId: string | null;
  readonly hoveredElementId: string | null;
  readonly onSelectElement: (id: string) => void;
  readonly onHoverElement: (id: string | null) => void;
  readonly hasOverrides: boolean;
  readonly onResetPriorities: () => void;
  readonly canUndo: boolean;
  readonly onUndo: () => void;
  readonly canRedo: boolean;
  readonly onRedo: () => void;
  readonly onReprioritize: (fromId: string, toId: string) => void;
  readonly onUploadImage: (elementId: string, dataUrl: string) => void;
  readonly onUpdateContent: (elementId: string, value: string) => void;
  /**
   * `value === null` clears this element's weight override, reverting it
   * to its role's resolver.ts default (see LayoutStudioPage.tsx's
   * `handleUpdateWeight` and resolver.ts's `elementWeight()` — backlog
   * item 9).
   */
  readonly onUpdateWeight: (elementId: string, value: number | null) => void;
  readonly onRemoveElement: (elementId: string) => void;
  readonly onAddElement: (element: AdElementSpec) => void;
}

const TYPE_ICON: Record<StudioElement["type"], IconName> = {
  text: "type-text",
  image: "type-image",
  button: "cursor-click",
};

const ELEMENT_TYPES: readonly AdElementSpec["type"][] = ["text", "image", "button"];
const ELEMENT_ROLES: readonly ElementRole[] = ["hero", "primary", "secondary", "action", "branding"];

let addedElementCounter = 0;

function parseStep(step: string): { readonly verb: string; readonly label: string } {
  const match = /^(Preserve|Truncate|Reduce|Drop)\s+(.*)$/.exec(step);
  return match ? { verb: match[1]!, label: match[2]! } : { verb: "", label: step };
}

function contentPlaceholder(type: AdElementSpec["type"]): string {
  return type === "image" ? "Alt text" : type === "button" ? "Button label" : "Text";
}

export function SpecInspector({
  elements,
  layout,
  degradationOrder,
  selectedElementId,
  hoveredElementId,
  onSelectElement,
  onHoverElement,
  hasOverrides,
  onResetPriorities,
  canUndo,
  onUndo,
  canRedo,
  onRedo,
  onReprioritize,
  onUploadImage,
  onUpdateContent,
  onUpdateWeight,
  onRemoveElement,
  onAddElement,
}: ElementsTabProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const canRemove = elements.length > 1;

  // -- "+ Add element" form state — a brand new element, appended on submit. --
  const [newType, setNewType] = useState<AdElementSpec["type"]>("text");
  const [newRole, setNewRole] = useState<ElementRole>("secondary");
  const [newPriority, setNewPriority] = useState(2);
  const [newContent, setNewContent] = useState("");
  const [newImageSrc, setNewImageSrc] = useState<string | null>(null);
  const newImageInputRef = useRef<HTMLInputElement>(null);
  const addBlocked = newType === "image" && !newImageSrc;

  function resetAddForm() {
    setNewContent("");
    setNewImageSrc(null);
  }

  function handleAddSubmit() {
    if (addBlocked) return;
    const id = `custom-${Date.now()}-${addedElementCounter++}`;
    const base = { id, role: newRole, priority: Math.max(1, Math.round(newPriority)) };
    const element: AdElementSpec =
      newType === "text"
        ? { ...base, type: "text", text: newContent.trim() || "New text" }
        : newType === "button"
          ? { ...base, type: "button", label: newContent.trim() || "New button" }
          : { ...base, type: "image", src: newImageSrc!, alt: newContent.trim() || "Image" };
    onAddElement(element);
    resetAddForm();
  }

  return (
    <div className="spec-inspector">
      <ul className={`spec-inspector__list${dragId ? " spec-inspector__list--dragging" : ""}`}>
        {elements.map((element) => {
          const visible = layout.visible.find((v) => v.id === element.id);
          const dropped = layout.dropped.find((d) => d.id === element.id);
          const degraded = layout.degradation.find((d) => d.elementId === element.id && d.action !== "dropped");
          const state = dropped ? "Dropped" : degraded ? (degraded.action === "shrunk" ? "Shrunk" : "Truncated") : visible ? "Visible" : "—";
          const meta = visible
            ? `${element.role} · P${element.priority} · ${Math.round(visible.width)}×${Math.round(visible.height)} · ${Math.round(visible.fontSize)}px`
            : `${element.role} · P${element.priority}`;

          return (
            <li
              key={element.id}
              draggable
              onDragStart={(event: DragEvent<HTMLLIElement>) => {
                setDragId(element.id);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragEnter={(event: DragEvent<HTMLLIElement>) => {
                event.preventDefault();
                if (dragId && dragId !== element.id) setDragOverId(element.id);
              }}
              onDragLeave={(event: DragEvent<HTMLLIElement>) => {
                event.preventDefault();
                if (dragOverId === element.id) setDragOverId(null);
              }}
              onDragOver={(event: DragEvent<HTMLLIElement>) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event: DragEvent<HTMLLIElement>) => {
                event.preventDefault();
                if (dragId && dragId !== element.id) onReprioritize(dragId, element.id);
                setDragId(null);
                setDragOverId(null);
              }}
              onDragEnd={() => {
                setDragId(null);
                setDragOverId(null);
              }}
              className={`spec-inspector__row${element.id === selectedElementId ? " spec-inspector__row--selected" : ""}${
                element.id === hoveredElementId ? " spec-inspector__row--hovered" : ""
              }${element.id === dragId ? " spec-inspector__row--dragging" : ""}${
                element.id === dragOverId ? " spec-inspector__row--drag-over" : ""
              }${dropped ? " spec-inspector__row--dropped" : ""}`}
              onMouseEnter={() => onHoverElement(element.id)}
              onMouseLeave={() => onHoverElement(null)}
              onClick={() => onSelectElement(element.id)}
            >
              <span className="spec-inspector__drag-handle" title="Drag onto another row to swap priority" aria-hidden="true">
                <Icon name="drag-handle" size={14} />
              </span>
              <Icon name={TYPE_ICON[element.type]} size={14} />
              <span className="spec-inspector__row-main">
                <input
                  type="text"
                  className="spec-inspector__content-input"
                  value={element.content}
                  placeholder={contentPlaceholder(element.type)}
                  title="Edit this element's content"
                  onClick={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => onUpdateContent(element.id, event.target.value)}
                />
                <span className="spec-inspector__row-meta mono">{meta}</span>
              </span>
              <input
                type="number"
                className="spec-inspector__weight-input mono"
                value={element.weight ?? ""}
                placeholder={String(ROLE_WEIGHT[element.role])}
                title={`Weight override — how much of the shared space this element claims relative to its slot-mates. Blank uses this role's default (${ROLE_WEIGHT[element.role]}); must be a positive number.`}
                min="0.1"
                step="0.1"
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const raw = event.target.value;
                  if (raw.trim() === "") {
                    onUpdateWeight(element.id, null);
                    return;
                  }
                  const parsed = Number(raw);
                  if (Number.isFinite(parsed) && parsed > 0) onUpdateWeight(element.id, parsed);
                }}
              />
              {element.type === "image" ? (
                <button
                  type="button"
                  className="spec-inspector__upload-btn"
                  title="Replace with your own image — stays in this browser, never uploaded anywhere"
                  onClick={(event) => {
                    event.stopPropagation(); // don't also select the row
                    setUploadTargetId(element.id);
                    uploadInputRef.current?.click();
                  }}
                >
                  <Icon name="assets" size={13} />
                </button>
              ) : null}
              <button
                type="button"
                className="spec-inspector__remove-btn"
                title={canRemove ? "Remove this element" : "A spec needs at least one element"}
                disabled={!canRemove}
                onClick={(event) => {
                  event.stopPropagation();
                  if (canRemove) onRemoveElement(element.id);
                }}
              >
                <Icon name="close" size={12} />
              </button>
              <span className={`spec-inspector__badge${dropped ? " spec-inspector__badge--dropped" : ""}`}>{state}</span>
            </li>
          );
        })}
      </ul>

      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        className="spec-inspector__upload-input"
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          const targetId = uploadTargetId;
          setUploadTargetId(null);
          if (!file || !targetId) return;
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === "string") onUploadImage(targetId, reader.result);
          };
          reader.readAsDataURL(file);
        }}
      />

      <div className="spec-inspector__history-row">
        <button
          type="button"
          className="spec-inspector__history-btn"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <Icon name="undo" size={14} />
        </button>
        <button
          type="button"
          className="spec-inspector__history-btn"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
        >
          <Icon name="redo" size={14} />
        </button>
        {hasOverrides ? (
          <button type="button" className="spec-inspector__reset" onClick={onResetPriorities}>
            Reset to spec
          </button>
        ) : null}
      </div>

      <div className="spec-inspector__eyebrow mono">Add element</div>
      <div className="spec-inspector__add-form">
        <div className="spec-inspector__add-row">
          <select
            className="spec-inspector__add-select"
            value={newType}
            onChange={(event) => setNewType(event.target.value as AdElementSpec["type"])}
          >
            {ELEMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <select
            className="spec-inspector__add-select"
            value={newRole}
            onChange={(event) => setNewRole(event.target.value as ElementRole)}
          >
            {ELEMENT_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <input
            type="number"
            className="spec-inspector__add-priority"
            min={1}
            max={9}
            value={newPriority}
            title="Priority"
            onChange={(event: ChangeEvent<HTMLInputElement>) => setNewPriority(Math.max(1, Number(event.target.value) || 1))}
          />
        </div>

        {newType === "image" ? (
          <>
            <button
              type="button"
              className="spec-inspector__add-upload"
              onClick={() => newImageInputRef.current?.click()}
            >
              <Icon name="assets" size={13} />
              {newImageSrc ? "Image chosen — pick another" : "Choose image…"}
            </button>
            <input
              ref={newImageInputRef}
              type="file"
              accept="image/*"
              className="spec-inspector__upload-input"
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  if (typeof reader.result === "string") setNewImageSrc(reader.result);
                };
                reader.readAsDataURL(file);
              }}
            />
          </>
        ) : null}

        <input
          type="text"
          className="spec-inspector__add-content"
          placeholder={contentPlaceholder(newType)}
          value={newContent}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setNewContent(event.target.value)}
        />

        <button type="button" className="spec-inspector__add-submit" disabled={addBlocked} onClick={handleAddSubmit}>
          + Add element
        </button>
      </div>

      <div className="spec-inspector__eyebrow mono">Degradation order</div>
      <ol className="spec-inspector__degradation-order">
        {degradationOrder.map((step, index) => {
          const { verb, label } = parseStep(step);
          return (
            <li key={`${index}-${step}`} className="spec-inspector__degradation-step">
              <span className="spec-inspector__degradation-index mono">{String(index + 1).padStart(2, "0")}</span>
              <span className={`spec-inspector__degradation-verb mono${verb === "Drop" ? " spec-inspector__degradation-verb--drop" : verb === "Reduce" ? " spec-inspector__degradation-verb--reduce" : ""}`}>
                {verb}
              </span>
              <span className="spec-inspector__degradation-label">{label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
