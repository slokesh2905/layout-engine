import type { Tone } from "./Badge.js";

/** No hue left — "connected" reads brighter (var(--tx)) than "connecting"/"offline" (dimmer), never by color. */
const TONE_COLORS: Record<Tone, string> = {
  coral: "var(--tx)",
  cyan: "var(--tx)",
  amber: "var(--tx2)",
  red: "var(--tx3)",
  muted: "var(--tx3)",
};

interface StatusDotProps {
  readonly tone: Tone;
  readonly label?: string;
  /** Slow pulse for "live"/"connecting" states — never used for a static state like "offline". */
  readonly pulse?: boolean;
  readonly className?: string;
}

/** A small colored dot + optional label, used for connection status and other transient studio state. */
export function StatusDot({ tone, label, pulse = false, className }: StatusDotProps) {
  return (
    <span className={`status-dot-row${className ? ` ${className}` : ""}`}>
      <span
        className={`status-dot${pulse ? " status-dot--pulse" : ""}`}
        style={{ background: TONE_COLORS[tone] }}
        aria-hidden="true"
      />
      {label ? <span className="mono">{label}</span> : null}
    </span>
  );
}
