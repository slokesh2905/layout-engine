/**
 * Ad spec: content + layout *intent*, defined once, independent of any
 * surface. `role` and `priority` are the only things the resolver ever
 * reads to make placement decisions — `type` only affects rendering.
 */

/** The five roles the resolver's weight table and slot layout understand. */
export type ElementRole = "hero" | "primary" | "secondary" | "action" | "branding";

interface BaseElementSpec {
  /** Unique within the ad. Referenced by the resolved layout's output. */
  readonly id: string;
  readonly role: ElementRole;
  /**
   * Lower number = higher importance. Elements that share a priority are
   * placed together as one "slot" (see resolver.ts) — this is the only
   * hint the resolver takes from the spec about how elements relate to
   * each other; there is no separate grouping/layout-hint field.
   */
  readonly priority: number;
  /**
   * Optional override of resolver.ts's role-based default weight (its
   * `ROLE_WEIGHT` table) for this one element. Weight only ever affects
   * how *already-available* space is split between elements that survive
   * degradation — proportionally, on both the main axis (elements sharing
   * a slot) and the cross axis (members within a slot) — it has no effect
   * on priority/degradation ordering (which whole slots get dropped is
   * still purely `priority`-driven, unaffected by this field). Absent (the
   * common case) means "use this element's role's default weight," the
   * exact prior behavior for every existing spec. Must be a positive,
   * finite number when present — a spec author claiming more or less
   * share of space for one specific element than its role would normally
   * get, without redefining what that role means everywhere else it's used.
   */
  readonly weight?: number;
}

export interface TextElementSpec extends BaseElementSpec {
  readonly type: "text";
  readonly text: string;
}

export interface ImageElementSpec extends BaseElementSpec {
  readonly type: "image";
  readonly src: string;
  readonly alt: string;
}

export interface ButtonElementSpec extends BaseElementSpec {
  readonly type: "button";
  readonly label: string;
}

/**
 * Discriminated union on `type` — referencing `.text` on an element typed
 * "image", or constructing an element with a `role`/`type` combination
 * that doesn't exist, is a compile-time error, not something caught later.
 */
export type AdElementSpec = TextElementSpec | ImageElementSpec | ButtonElementSpec;

export interface AdSpec {
  readonly elements: readonly AdElementSpec[];
}

export interface DefineAdConfig {
  readonly elements: readonly AdElementSpec[];
}

/**
 * Validates and freezes an ad spec. Runtime checks here catch what the
 * type system structurally can't: duplicate ids, non-positive priorities,
 * and empty required content — the "invalid spec -> reported error, not
 * silent misbehavior" requirement.
 */
export function defineAd(config: DefineAdConfig): AdSpec {
  if (config.elements.length === 0) {
    throw new Error("defineAd(): `elements` must contain at least one element.");
  }

  const seenIds = new Set<string>();
  for (const element of config.elements) {
    if (!element.id || typeof element.id !== "string") {
      throw new Error(`defineAd(): every element needs a non-empty string \`id\` (got ${JSON.stringify(element.id)}).`);
    }
    if (seenIds.has(element.id)) {
      throw new Error(`defineAd(): duplicate element id "${element.id}" — ids must be unique within a spec.`);
    }
    seenIds.add(element.id);

    if (!Number.isInteger(element.priority) || element.priority < 1) {
      throw new Error(`defineAd(): element "${element.id}" has invalid priority ${element.priority} — must be a positive integer.`);
    }

    if (element.weight !== undefined && !(Number.isFinite(element.weight) && element.weight > 0)) {
      throw new Error(`defineAd(): element "${element.id}" has invalid weight ${element.weight} — must be a positive, finite number when set.`);
    }

    if (element.type === "text" && element.text.trim().length === 0) {
      throw new Error(`defineAd(): text element "${element.id}" has empty \`text\`.`);
    }
    if (element.type === "image" && (!element.src || !element.alt)) {
      throw new Error(`defineAd(): image element "${element.id}" needs both \`src\` and \`alt\`.`);
    }
    if (element.type === "button" && element.label.trim().length === 0) {
      throw new Error(`defineAd(): button element "${element.id}" has empty \`label\`.`);
    }
  }

  return { elements: config.elements };
}

/**
 * Reads whichever field actually holds an element's content, based on its
 * discriminant — `text` for "text", `label` for "button", `alt` for
 * "image" (there's no rendered pixel content for a placeholder image, so
 * its alt text is the closest thing it has to displayable "content").
 * Exists so callers (e.g. a UI inspector) never have to re-derive this
 * per-type field lookup themselves.
 */
export function elementContent(element: AdElementSpec): string {
  switch (element.type) {
    case "text":
      return element.text;
    case "button":
      return element.label;
    case "image":
      return element.alt;
  }
}

/**
 * Companion to `elementContent()` above: that function always returns a
 * *displayable string* for any element (an image's alt text stands in for
 * pixels it doesn't have) — this one returns the actual asset reference,
 * for a renderer that *can* show real pixels (a user-uploaded or externally
 * hosted image) to point an `<img>` at. `undefined` for text/button
 * elements, which have no asset of their own.
 */
export function elementSrc(element: AdElementSpec): string | undefined {
  return element.type === "image" ? element.src : undefined;
}
