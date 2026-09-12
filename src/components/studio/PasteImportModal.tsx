/**
 * Phase H: "paste to import" — the same JSON spec / Figma SVG content the
 * file pickers already accept (see StudioTopBar.tsx / SpecsPage.tsx's
 * "Import Spec…" / "Import Figma SVG…"), but for someone who has it
 * copied from a chat or an email rather than saved as a file on disk. One
 * generic modal parameterized by the caller (title/placeholder/what
 * "submit" actually does) rather than two near-identical components — the
 * only thing that differs between a spec paste and an SVG paste is which
 * parse+import function `onSubmit` calls, which is the caller's business,
 * not this component's.
 *
 * Owns its own textarea/error/submitting state; the caller owns whether
 * it's open at all (conditionally rendered) and what closing means.
 * `onSubmit` is expected to reject with a plain `Error` on a parse/import
 * failure — shown inline so the user can fix the pasted text and retry
 * without losing it, rather than closing and routing to an external toast.
 */
import { useState } from "react";
import type { ChangeEvent } from "react";
import { Icon } from "../ui/Icon.js";
import "./PasteImportModal.css";

interface PasteImportModalProps {
  readonly title: string;
  readonly description: string;
  readonly placeholder: string;
  readonly submitLabel: string;
  readonly onSubmit: (text: string) => Promise<void>;
  readonly onClose: () => void;
}

export function PasteImportModal({ title, description, placeholder, submitLabel, onSubmit, onClose }: PasteImportModalProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit() {
    if (!text.trim() || submitting) return;
    setError(null);
    setSubmitting(true);
    onSubmit(text)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSubmitting(false));
  }

  return (
    <div className="paste-import-modal__backdrop" role="presentation" onClick={onClose}>
      <div className="paste-import-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="paste-import-modal__header">
          <h2 className="paste-import-modal__title">{title}</h2>
          <button type="button" className="paste-import-modal__close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={13} />
          </button>
        </div>
        <p className="paste-import-modal__description">{description}</p>
        <textarea
          className="paste-import-modal__textarea"
          placeholder={placeholder}
          value={text}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setText(event.target.value)}
          rows={12}
          spellCheck={false}
          autoFocus
        />
        {error ? (
          <div className="paste-import-modal__error" role="alert">
            <Icon name="alert-triangle" size={13} />
            <span>{error}</span>
          </div>
        ) : null}
        <div className="paste-import-modal__actions">
          <button type="button" className="paste-import-modal__cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="paste-import-modal__submit" onClick={handleSubmit} disabled={!text.trim() || submitting}>
            {submitting ? "Importing…" : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
