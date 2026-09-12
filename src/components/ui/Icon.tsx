/**
 * A small set of hand-drawn inline SVG icons — no icon library dependency
 * (npm installs aren't available while building this in a sandboxed
 * environment, and pulling one in for ~20 glyphs would be the
 * "unnecessary abstraction" the brief warns against anyway). Every icon
 * is stroke-based, 1.5px, `currentColor`, on an 18×18 canvas, so they can
 * be recolored and resized purely with CSS `color`/`font-size` from the
 * call site.
 */
import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "studio"
  | "specs"
  | "surfaces"
  | "validation"
  | "assets"
  | "chevron-down"
  | "chevron-up"
  | "chevron-right"
  | "eye"
  | "grid"
  | "ruler"
  | "layers"
  | "compare"
  | "export"
  | "close"
  | "check"
  | "alert-triangle"
  | "x-circle"
  | "drag-handle"
  | "type-text"
  | "type-image"
  | "type-button"
  | "zoom-in"
  | "zoom-out"
  | "fit"
  | "pulse"
  | "clock"
  | "plug"
  | "settings"
  | "sun"
  | "moon"
  | "corners"
  | "bounding-box"
  | "cursor-click"
  | "panel-right"
  | "duplicate"
  | "undo"
  | "redo";

interface IconProps extends SVGProps<SVGSVGElement> {
  readonly name: IconName;
  readonly size?: number;
}

const PATHS: Record<IconName, ReactNode> = {
  studio: (
    <>
      <rect x="2.5" y="2.5" width="13" height="13" rx="1.5" />
      <path d="M2.5 7h13M7 16.5V7" />
    </>
  ),
  specs: (
    <>
      <path d="M4 2.5h7l3.5 3.5V15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z" />
      <path d="M11 2.5V6h3.5M6 9.5h6M6 12.5h6" />
    </>
  ),
  surfaces: (
    <>
      <rect x="2.5" y="4" width="6.5" height="10" rx="1" />
      <rect x="10.5" y="6.5" width="5" height="5.5" rx="1" />
    </>
  ),
  validation: (
    <>
      <path d="M9 2.5 15.5 6v5.2c0 3-2.7 5.4-6.5 6.3-3.8-.9-6.5-3.3-6.5-6.3V6L9 2.5Z" />
      <path d="M6.2 9.3 8.3 11.4l3.5-4" />
    </>
  ),
  assets: (
    <>
      <rect x="2.5" y="3.5" width="13" height="11" rx="1.2" />
      <circle cx="6.3" cy="7.3" r="1.3" />
      <path d="m3.5 13.5 3.8-4 2.6 2.6 2.3-2.3 4.3 4.3" />
    </>
  ),
  "chevron-down": <path d="m4.5 6.5 4.5 5 4.5-5" />,
  "chevron-up": <path d="m4.5 11.5 4.5-5 4.5 5" />,
  "chevron-right": <path d="m6.5 4.5 5 4.5-5 4.5" />,
  eye: (
    <>
      <path d="M2 9s2.8-5 7-5 7 5 7 5-2.8 5-7 5-7-5-7-5Z" />
      <circle cx="9" cy="9" r="2" />
    </>
  ),
  grid: (
    <>
      <path d="M2.5 6.5h13M2.5 11.5h13M6.5 2.5v13M11.5 2.5v13" />
    </>
  ),
  ruler: (
    <>
      <rect x="2.5" y="6.5" width="13" height="5" rx="1" />
      <path d="M5.5 6.5v2M8.5 6.5v2M11.5 6.5v2M14.5 6.5v2" />
    </>
  ),
  layers: (
    <>
      <path d="M9 2.5 15.5 6 9 9.5 2.5 6 9 2.5Z" />
      <path d="M2.5 10 9 13.5 15.5 10M2.5 13 9 16.5 15.5 13" />
    </>
  ),
  compare: (
    <>
      <path d="M6 2.5v13M12 2.5v13" />
      <path d="M6 5.5 3.5 8 6 10.5M12 5.5 14.5 8 12 10.5" />
    </>
  ),
  export: (
    <>
      <path d="M9 2.5v8.5M5.8 6.3 9 3l3.2 3.3" />
      <path d="M3 12v2.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V12" />
    </>
  ),
  close: <path d="m4.5 4.5 9 9m0-9-9 9" />,
  check: <path d="m3.5 9.5 3.3 3.3 7.2-7.6" />,
  "alert-triangle": (
    <>
      <path d="M9 2.7 16 15H2L9 2.7Z" />
      <path d="M9 7.3v3.4" />
      <circle cx="9" cy="13" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  "x-circle": (
    <>
      <circle cx="9" cy="9" r="6.5" />
      <path d="m6.5 6.5 5 5m0-5-5 5" />
    </>
  ),
  "drag-handle": (
    <>
      <circle cx="6.5" cy="5.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="11.5" cy="5.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="6.5" cy="9" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="11.5" cy="9" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="6.5" cy="12.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="11.5" cy="12.5" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  "type-text": (
    <>
      <path d="M3.5 4.5h11M9 4.5v9M6.5 13.5h5" />
    </>
  ),
  "type-image": (
    <>
      <rect x="2.5" y="3.5" width="13" height="11" rx="1.2" />
      <circle cx="6.3" cy="7.3" r="1.2" />
      <path d="m3.7 13 3.6-3.8 2.4 2.4 2.2-2.2 3.9 3.9" />
    </>
  ),
  "type-button": (
    <>
      <rect x="2.5" y="6" width="13" height="6" rx="3" />
      <path d="M6.5 9h5" />
    </>
  ),
  "zoom-in": (
    <>
      <circle cx="8" cy="8" r="5.2" />
      <path d="m15.5 15.5-3.2-3.2M8 5.8v4.4M5.8 8h4.4" />
    </>
  ),
  "zoom-out": (
    <>
      <circle cx="8" cy="8" r="5.2" />
      <path d="m15.5 15.5-3.2-3.2M5.8 8h4.4" />
    </>
  ),
  fit: (
    <>
      <path d="M2.5 6.5v-3a1 1 0 0 1 1-1h3M15.5 6.5v-3a1 1 0 0 0-1-1h-3M2.5 11.5v3a1 1 0 0 0 1 1h3M15.5 11.5v3a1 1 0 0 1-1 1h-3" />
    </>
  ),
  pulse: <path d="M2 9h3l1.6-4.5L9.2 14 11 9h5" />,
  clock: (
    <>
      <circle cx="9" cy="9" r="6.5" />
      <path d="M9 5.5V9l2.6 1.6" />
    </>
  ),
  plug: (
    <>
      <path d="M6.5 2.5v4M11.5 2.5v4M5 6.5h8v2.6A3.9 3.9 0 0 1 9.1 13v3" />
    </>
  ),
  settings: (
    <>
      <circle cx="9" cy="9" r="2.3" />
      <path d="M9 3.2v1.6M9 13.2v1.6M14.8 9h-1.6M4.8 9H3.2M12.9 5.1l-1.1 1.1M6.2 11.7l-1.1 1.1M12.9 12.9l-1.1-1.1M6.2 6.3 5.1 5.1" />
    </>
  ),
  sun: (
    <>
      <circle cx="9" cy="9" r="3.2" />
      <path d="M9 2v1.8M9 14.2V16M16 9h-1.8M3.8 9H2M13.7 4.3l-1.3 1.3M5.6 12.1l-1.3 1.3M13.7 13.7l-1.3-1.3M5.6 5.9 4.3 4.6" />
    </>
  ),
  moon: <path d="M14.8 10.4A6 6 0 0 1 7.6 3.2a6.2 6.2 0 1 0 7.2 7.2Z" />,
  corners: (
    <>
      <path d="M2.5 6.5v-3a1 1 0 0 1 1-1h3M15.5 6.5v-3a1 1 0 0 0-1-1h-3M2.5 11.5v3a1 1 0 0 0 1 1h3M15.5 11.5v3a1 1 0 0 1-1 1h-3" />
      <rect x="6" y="6" width="6" height="6" rx="0.5" />
    </>
  ),
  "bounding-box": (
    <>
      <rect x="3.5" y="3.5" width="11" height="11" rx="1" strokeDasharray="2.2 2.2" />
    </>
  ),
  "cursor-click": (
    <>
      <path d="M4 2.5 8.5 14l1.6-4 4-1.6L4 2.5Z" />
      <path d="M12.5 12.5 15.5 15.5" />
    </>
  ),
  "panel-right": (
    <>
      <rect x="2.5" y="3.5" width="13" height="11" rx="1.2" />
      <path d="M11.5 3.5v11" />
    </>
  ),
  duplicate: (
    <>
      <rect x="6.5" y="2.5" width="9" height="9" rx="1.3" />
      <rect x="2.5" y="6.5" width="9" height="9" rx="1.3" />
    </>
  ),
  undo: (
    <>
      <path d="M4.5 9a5.5 5.5 0 1 0 1.6-3.9" />
      <path d="M4.5 4.5v3.6h3.6" />
    </>
  ),
  redo: (
    <>
      <path d="M13.5 9a5.5 5.5 0 1 1-1.6-3.9" />
      <path d="M13.5 4.5v3.6h-3.6" />
    </>
  ),
};

export function Icon({ name, size = 18, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
