/**
 * WCAG 2.1 (SC 1.4.3) contrast-ratio math — real color science, not a
 * fabricated pass. Built for constraints.ts's new "Text contrast" hard
 * constraint: operates on the exact CSS color strings renderLayout.ts's
 * `AD_BOARD_COLORS` already hand-copies from styles/tokens.css as the ad
 * board's fixed, theme-independent palette (see that file's own doc
 * comment on why those are hardcoded rather than read from computed
 * styles) — so this never invents a color, only computes with the ones
 * every element already actually renders with.
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface Rgba extends Rgb {
  readonly a: number;
}

/** Parses "#rrggbb" or "rgb(a)(r, g, b[, a])" — the only two shapes AD_BOARD_COLORS uses. */
export function parseColor(color: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const value = hex[1]!;
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
      a: 1,
    };
  }
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(color);
  if (rgba) {
    return {
      r: Number(rgba[1]),
      g: Number(rgba[2]),
      b: Number(rgba[3]),
      a: rgba[4] !== undefined ? Number(rgba[4]) : 1,
    };
  }
  throw new Error(`Unrecognized color: "${color}" (expected #rrggbb or rgb(a)(...)).`);
}

/**
 * Alpha-composites a (possibly translucent) foreground over an opaque
 * background — needed because `AD_BOARD_COLORS.inkDim` (secondary-role
 * text) is `rgba(23, 23, 26, 0.55)`, not a solid color: its *effective*
 * on-screen color, and therefore its real contrast ratio, depends on
 * exactly what it's sitting on top of.
 */
export function compositeOver(fg: Rgba, bg: Rgb): Rgb {
  return {
    r: fg.a * fg.r + (1 - fg.a) * bg.r,
    g: fg.a * fg.g + (1 - fg.a) * bg.g,
    b: fg.a * fg.b + (1 - fg.a) * bg.b,
  };
}

function channelLuminance(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance(color: Rgb): number {
  return 0.2126 * channelLuminance(color.r) + 0.7152 * channelLuminance(color.g) + 0.0722 * channelLuminance(color.b);
}

/** WCAG contrast ratio between two colors — always >= 1, order-independent. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * WCAG 2.1 SC 1.4.3's two thresholds: 3.0:1 for "large" text, 4.5:1
 * otherwise. Simplified to a size-only check (>=24px counts as large) —
 * the full spec also lowers the bar to 18.66px for *bold* text, but every
 * text/button label in this app renders at font-weight 500/600 (see
 * PreviewCanvas.css), never the 700+ most contrast checkers require to
 * call a font genuinely "bold", so that branch never actually applies
 * here and isn't worth the extra parameter.
 */
export function requiredContrastRatio(fontSizePx: number): number {
  return fontSizePx >= 24 ? 3.0 : 4.5;
}
