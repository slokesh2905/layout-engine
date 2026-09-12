import { formatFitScore, formatMs } from "../../lib/formatters.js";
import type { ResolvedLayoutDiagnostics } from "../../lib/types.js";

interface ResolutionSummaryProps {
  readonly diagnostics: ResolvedLayoutDiagnostics;
  readonly visibleCount: number;
  readonly droppedCount: number;
}

function fitScoreTone(score: number): "cyan" | "amber" | "red" {
  if (score >= 90) return "cyan";
  if (score >= 60) return "amber";
  return "red";
}

export function ResolutionSummary({ diagnostics, visibleCount, droppedCount }: ResolutionSummaryProps) {
  return (
    <div className="resolution-summary">
      <div className="resolution-summary__score" data-tone={fitScoreTone(diagnostics.fitScore)}>
        <span className="resolution-summary__score-value mono">{formatFitScore(diagnostics.fitScore)}</span>
        <span className="resolution-summary__score-label">Fit score</span>
      </div>
      <div className="resolution-summary__stats">
        <div className="resolution-summary__stat">
          <span className="resolution-summary__stat-value mono">{formatMs(diagnostics.resolvedInMs)}</span>
          <span className="resolution-summary__stat-label">Resolved in</span>
        </div>
        <div className="resolution-summary__stat">
          <span className="resolution-summary__stat-value mono">
            {visibleCount}
            {droppedCount > 0 ? <span className="resolution-summary__stat-sub"> / {droppedCount} dropped</span> : null}
          </span>
          <span className="resolution-summary__stat-label">Visible</span>
        </div>
        <div className="resolution-summary__stat">
          <span className={`resolution-summary__stat-value mono${diagnostics.overlapCount > 0 ? " resolution-summary__stat-value--bad" : ""}`}>
            {diagnostics.overlapCount}
          </span>
          <span className="resolution-summary__stat-label">Overlaps</span>
        </div>
        <div className="resolution-summary__stat">
          <span className={`resolution-summary__stat-value mono${diagnostics.clippedCount > 0 ? " resolution-summary__stat-value--bad" : ""}`}>
            {diagnostics.clippedCount}
          </span>
          <span className="resolution-summary__stat-label">Clipped</span>
        </div>
      </div>
    </div>
  );
}
