/**
 * Repurposed for the redesign: this used to be a full-width status bar
 * along the bottom of the screen. It's now the single mono caption line
 * centered directly under the board (see PreviewCanvas.tsx) — surface,
 * true pixel size, strategy, placed/dropped counts, and the selected
 * element's real resolved x/y/w/h/z collapse into one line, same as
 * before, just relocated and without its own bar.
 */
import "./StudioFooter.css";

interface StudioFooterProps {
  readonly surfaceName: string;
  readonly surfaceDims: string;
  readonly strategy: string;
  readonly countsLabel: string;
  readonly selectedReadout: string | null;
}

export function StudioFooter({ surfaceName, surfaceDims, strategy, countsLabel, selectedReadout }: StudioFooterProps) {
  return (
    <div className="studio-footer mono">
      <span className="studio-footer__item studio-footer__item--dim">{surfaceName}</span>
      <span className="studio-footer__item">{surfaceDims}</span>
      <span className="studio-footer__item">{strategy}</span>
      <span className="studio-footer__item">{countsLabel}</span>
      {selectedReadout ? <span className="studio-footer__item studio-footer__item--accent">{selectedReadout}</span> : null}
    </div>
  );
}
