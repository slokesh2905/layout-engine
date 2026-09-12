/** Small, dependency-free display formatters shared across the studio UI. */

export function formatMs(ms: number): string {
  if (ms < 1) return "<1ms";
  return `${Math.round(ms)}ms`;
}

export function formatPx(value: number): string {
  return `${Math.round(value)}px`;
}

export function formatDimensions(width: number, height: number): string {
  return `${Math.round(width)} × ${Math.round(height)}`;
}

export function capitalize(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
}

/** "primary" -> "Primary", "square-kiosk" -> "Square Kiosk" */
export function toTitleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(capitalize)
    .join(" ");
}

export function formatPriority(priority: number): string {
  return `P${priority}`;
}

export function formatRelativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "Never resolved";
  const then = new Date(iso).getTime();
  const diffSeconds = Math.max(0, Math.round((now.getTime() - then) / 1000));
  if (diffSeconds < 5) return "Just now";
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

export function formatFitScore(score: number): string {
  return `${Math.round(score)}`;
}

/** Normalizes a caught value (the adapter's async calls can reject with anything) into a displayable message. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
