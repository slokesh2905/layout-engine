import type { ReactNode } from "react";
import { formatPriority } from "../../lib/formatters.js";

/**
 * Tone names are kept from before the redesign (every call site still says
 * "coral"/"cyan"/… — see SpecsPage, AppSidebar, DegradationLog, etc.) but
 * none of them are hues anymore: every tone now reads through weight,
 * fill and border instead, per the studio redesign's "state must read
 * without hue" rule.
 */
export type Tone = "coral" | "cyan" | "amber" | "red" | "muted";

const TONE_STYLE: Record<Tone, { readonly color: string; readonly background: string; readonly border: string; readonly textDecoration?: string }> = {
  coral: { color: "var(--tx)", background: "var(--acdim)", border: "1px solid var(--line2)" },
  cyan: { color: "var(--tx2)", background: "transparent", border: "1px solid var(--line2)" },
  amber: { color: "var(--tx2)", background: "transparent", border: "1px dashed var(--line2)" },
  red: { color: "var(--tx)", background: "transparent", border: "1px solid var(--line2)", textDecoration: "underline" },
  muted: { color: "var(--tx3)", background: "transparent", border: "1px solid transparent" },
};

interface BadgeProps {
  readonly tone: Tone;
  readonly children: ReactNode;
  readonly className?: string;
}

export function Badge({ tone, children, className }: BadgeProps) {
  const style = TONE_STYLE[tone];
  return (
    <span
      className={`badge${className ? ` ${className}` : ""}`}
      style={{ color: style.color, background: style.background, border: style.border, textDecoration: style.textDecoration }}
    >
      {children}
    </span>
  );
}

/** P1 -> coral, P2 -> amber, P3+ -> muted, matching the brief's priority styling exactly. */
export function PriorityBadge({ priority }: { readonly priority: number }) {
  const tone: Tone = priority === 1 ? "coral" : priority === 2 ? "amber" : "muted";
  return (
    <Badge tone={tone} className="mono badge-priority">
      {formatPriority(priority)}
    </Badge>
  );
}
