/**
 * "New Spec" modal — lets the user author a spec from scratch without
 * needing a file or a Figma export. Campaign details first, then an
 * inline "add element" form that appends to a local list, then Submit
 * which calls defineAd() (validates ids/content/priority before importSpec
 * ever sees it) and hands the result back to the caller.
 *
 * ID generation: `custom-${Date.now()}-${counter++}` — module-level counter,
 * identical scheme to SpecInspector.tsx's own "+ Add element" form so there
 * is only one id-generation strategy in the codebase.
 *
 * Priority 1–5 in the UI is a UX convention (matches the five element roles);
 * defineAd() only requires a positive integer, so that cap is a UI choice,
 * not a spec rule.
 */
import { useState } from "react";
import type { ChangeEvent } from "react";
import { defineAd } from "../../spec.js";
import type { AdElementSpec, AdSpec, ElementRole } from "../../spec.js";
import type { ImportSpecMeta } from "../../lib/api.js";
import { Icon } from "../ui/Icon.js";
import "./NewSpecModal.css";

export interface NewSpecSubmitPayload {
  readonly meta: ImportSpecMeta;
  readonly spec: AdSpec;
}

interface NewSpecModalProps {
  readonly onSubmit: (payload: NewSpecSubmitPayload) => Promise<void>;
  readonly onClose: () => void;
}

const ELEMENT_TYPES: readonly AdElementSpec["type"][] = ["text", "image", "button"];
const ELEMENT_ROLES: readonly ElementRole[] = ["hero", "primary", "secondary", "action", "branding"];

// Module-level counter — same scheme as SpecInspector.tsx's addedElementCounter.
let newSpecElementCounter = 0;

interface DraftElement {
  readonly id: string;
  readonly type: AdElementSpec["type"];
  readonly role: ElementRole;
  readonly priority: number;
  // text = text content, button = label, image = alt
  readonly content: string;
  // image only
  readonly src: string;
}

function draftToSpec(draft: DraftElement): AdElementSpec {
  const base = { id: draft.id, role: draft.role, priority: draft.priority };
  if (draft.type === "text") return { ...base, type: "text", text: draft.content || "New text" };
  if (draft.type === "button") return { ...base, type: "button", label: draft.content || "New button" };
  return { ...base, type: "image", src: draft.src || "/placeholder.png", alt: draft.content || "Image" };
}

export function NewSpecModal({ onSubmit, onClose }: NewSpecModalProps) {
  // Campaign meta
  const [campaignName, setCampaignName] = useState("");
  const [brand, setBrand] = useState("");
  const [supportingCopy, setSupportingCopy] = useState("");

  // Elements list
  const [elements, setElements] = useState<DraftElement[]>([]);

  // Add-element row state
  const [newType, setNewType] = useState<AdElementSpec["type"]>("text");
  const [newRole, setNewRole] = useState<ElementRole>("primary");
  const [newPriority, setNewPriority] = useState(1);
  const [newContent, setNewContent] = useState("");
  const [newSrc, setNewSrc] = useState("");

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = campaignName.trim().length > 0 && elements.length > 0 && !submitting;

  function handleAddElement() {
    const id = `custom-${Date.now()}-${newSpecElementCounter++}`;
    setElements((prev) => [
      ...prev,
      {
        id,
        type: newType,
        role: newRole,
        priority: Math.max(1, Math.round(newPriority)),
        content: newContent,
        src: newSrc,
      },
    ]);
    setNewContent("");
    setNewSrc("");
  }

  function handleRemoveElement(id: string) {
    setElements((prev) => prev.filter((el) => el.id !== id));
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const spec = defineAd({ elements: elements.map(draftToSpec) });
      const meta: ImportSpecMeta = {
        campaignName: campaignName.trim(),
        brand: brand.trim(),
        supportingCopy: supportingCopy.trim(),
      };
      await onSubmit({ meta, spec });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  const addBlocked = newType === "image" && !newSrc.trim();

  return (
    <div className="new-spec-modal__backdrop" role="presentation" onClick={onClose}>
      <div
        className="new-spec-modal"
        role="dialog"
        aria-modal="true"
        aria-label="New spec"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="new-spec-modal__header">
          <h2 className="new-spec-modal__title">New spec</h2>
          <button type="button" className="new-spec-modal__close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={13} />
          </button>
        </div>

        <p className="new-spec-modal__description">
          Author a spec from scratch. Add at least one element before submitting.
        </p>

        {/* Campaign details */}
        <fieldset className="new-spec-modal__fieldset">
          <legend className="new-spec-modal__legend mono">Campaign details</legend>
          <div className="new-spec-modal__field">
            <label className="new-spec-modal__label" htmlFor="nsp-campaign-name">
              Campaign name <span className="new-spec-modal__required" aria-hidden="true">*</span>
            </label>
            <input
              id="nsp-campaign-name"
              type="text"
              className="new-spec-modal__input"
              placeholder="e.g. Aurora Summer Launch"
              value={campaignName}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setCampaignName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="new-spec-modal__field">
            <label className="new-spec-modal__label" htmlFor="nsp-brand">
              Brand
            </label>
            <input
              id="nsp-brand"
              type="text"
              className="new-spec-modal__input"
              placeholder="e.g. AURORA"
              value={brand}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setBrand(e.target.value)}
            />
          </div>
          <div className="new-spec-modal__field">
            <label className="new-spec-modal__label" htmlFor="nsp-copy">
              Supporting copy
            </label>
            <input
              id="nsp-copy"
              type="text"
              className="new-spec-modal__input"
              placeholder="e.g. Clean electrolytes. Zero noise."
              value={supportingCopy}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSupportingCopy(e.target.value)}
            />
          </div>
        </fieldset>

        {/* Elements list */}
        <fieldset className="new-spec-modal__fieldset">
          <legend className="new-spec-modal__legend mono">
            Elements{elements.length > 0 ? ` (${elements.length})` : ""}
          </legend>

          {elements.length > 0 && (
            <ul className="new-spec-modal__element-list">
              {elements.map((el) => (
                <li key={el.id} className="new-spec-modal__element-row">
                  <span className="new-spec-modal__element-badge mono">{el.type}</span>
                  <span className="new-spec-modal__element-info">
                    <span className="new-spec-modal__element-content">{el.content || "—"}</span>
                    <span className="new-spec-modal__element-meta mono">
                      {el.role} · P{el.priority}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="new-spec-modal__element-remove"
                    onClick={() => handleRemoveElement(el.id)}
                    aria-label={`Remove element`}
                  >
                    <Icon name="close" size={11} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Add element row */}
          <div className="new-spec-modal__add-row">
            <select
              className="new-spec-modal__select"
              value={newType}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setNewType(e.target.value as AdElementSpec["type"])}
              aria-label="Element type"
            >
              {ELEMENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              className="new-spec-modal__select"
              value={newRole}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setNewRole(e.target.value as ElementRole)}
              aria-label="Element role"
            >
              {ELEMENT_ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <input
              type="number"
              className="new-spec-modal__input new-spec-modal__input--priority"
              value={newPriority}
              min={1}
              max={5}
              aria-label="Priority (1–5)"
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewPriority(Number(e.target.value))}
            />
            <input
              type="text"
              className="new-spec-modal__input new-spec-modal__input--content"
              placeholder={newType === "image" ? "Alt text" : newType === "button" ? "Button label" : "Text content"}
              value={newContent}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewContent(e.target.value)}
              aria-label="Content"
            />
            {newType === "image" && (
              <input
                type="text"
                className="new-spec-modal__input new-spec-modal__input--src"
                placeholder="Image URL or /path.png"
                value={newSrc}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewSrc(e.target.value)}
                aria-label="Image source"
              />
            )}
            <button
              type="button"
              className="new-spec-modal__add-btn"
              onClick={handleAddElement}
              disabled={addBlocked}
              title={addBlocked ? "Image elements need a source URL" : "Add this element to the spec"}
            >
              + Add
            </button>
          </div>
        </fieldset>

        {/* Error */}
        {error && (
          <div className="new-spec-modal__error" role="alert">
            <Icon name="alert-triangle" size={13} />
            <span>{error}</span>
          </div>
        )}

        {/* Actions */}
        <div className="new-spec-modal__actions">
          <button type="button" className="new-spec-modal__cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="new-spec-modal__submit"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting ? "Creating…" : "Create spec"}
          </button>
        </div>
      </div>
    </div>
  );
}
