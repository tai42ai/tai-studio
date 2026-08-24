/**
 * `openTargetProps` — the ONE house pattern for a whole-row / whole-card "open"
 * affordance.
 *
 * A navigable list entry (a table `<TR>`, a card `<div role="listitem">`) has a
 * single natural destination: opening it. The industry-standard affordance is to
 * make the WHOLE entry the click target — not only the name link buried in its
 * first cell — while never HIJACKING the interactive elements nested inside it
 * (the name link itself, an actions kebab, a Run button, an expandable preview).
 * This helper is that affordance, extracted once so every surface spreads the
 * same object rather than hand-rolling — and subtly diverging on — the yield
 * rules.
 *
 * The contract, spread onto the entry element:
 *  - `cursor: pointer`, so the whole entry reads as activatable.
 *  - a click handler that opens the entry, EXCEPT when the click
 *      • landed on (or inside) a nested interactive element — a `button`, an
 *        `a`, or an inline `[role="menu"]`/`[role="menuitem"]` — which owns its
 *        own activation, or
 *      • is the tail of a press-drag that SELECTED text (a non-collapsed
 *        selection), which is a read gesture, not an open intent.
 *  - with `keyboard`, `tabIndex: 0` and an Enter/Space handler under the same
 *    yield rules, so the entry is operable without a pointer.
 *
 * Keyboard note: PREFER giving the entry a real nested interactive element (the
 * name `AppLink`) as its accessible activation path and leaving `keyboard` off —
 * the helper yields to that element, so it stays the one keyboard/AT target and
 * the whole-entry click is a pure pointer convenience layered over it. Reach for
 * `keyboard` only when the entry genuinely has no such nested control (a run row
 * of timestamps and badges), where the entry itself must become the focus stop.
 *
 * Dependency-free: it reads only the DOM `event.target`, `window.getSelection()`,
 * and returns plain React attributes — nothing to bundle, nothing to mock.
 */
import type { KeyboardEvent, MouseEvent } from 'react';

/** The nested interactive elements a whole-target open always yields to: a click
 *  or key that originates on one of these (or a descendant, e.g. an icon `<svg>`
 *  inside a button) is that element's own activation, never an open of the entry.
 *  The menu roles cover an INLINE menu; a portalled menu (Radix) never bubbles to
 *  the entry, so it needs no selector here. */
const NESTED_INTERACTIVE = 'button, a, [role="menu"], [role="menuitem"]';

export interface OpenTargetOptions {
  /** Open the entry. `undefined` disables the affordance entirely — the helper
   *  returns empty props so the element stays inert (no cursor, no handlers),
   *  which lets a caller wire the whole thing behind an optional prop. */
  readonly onOpen: (() => void) | undefined;
  /** Extra selector(s) that also count as "nested interactive" for THIS surface,
   *  merged with the built-in set. Use it for a marked non-`button`/`a` subtree
   *  that owns its own clicks (e.g. an expandable preview keyed by a data
   *  attribute). Standard CSS selector syntax, comma-separated. */
  readonly ignoreWithin?: string;
  /** Make the entry itself keyboard-operable: a `tabIndex: 0` focus stop with
   *  Enter/Space activation. Leave off when a nested interactive element already
   *  carries the accessible path (see the keyboard note above) — adding it there
   *  would create a duplicate tab stop. */
  readonly keyboard?: boolean;
}

/** The React attributes {@link openTargetProps} yields — spread onto the entry
 *  element (`<TR>`, card `<div>`). Every field is optional so the disabled case
 *  is the empty object. */
export interface OpenTargetProps {
  readonly onClick?: (event: MouseEvent<HTMLElement>) => void;
  readonly onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  readonly tabIndex?: number;
  readonly style?: { readonly cursor: 'pointer' };
}

/** True when the event originated on, or inside, an element the entry must yield
 *  to — a built-in nested-interactive element or a caller `ignoreWithin` match. */
function landedOnNestedInteractive(target: EventTarget | null, selector: string): boolean {
  return target instanceof Element && target.closest(selector) !== null;
}

/**
 * Build the whole-target open props for one entry. See the module doc for the
 * contract; pass `onOpen: undefined` to get an inert entry (empty props).
 */
export function openTargetProps({
  onOpen,
  ignoreWithin,
  keyboard = false,
}: OpenTargetOptions): OpenTargetProps {
  if (onOpen === undefined) return {};

  const selector =
    ignoreWithin === undefined ? NESTED_INTERACTIVE : `${NESTED_INTERACTIVE}, ${ignoreWithin}`;

  const props: {
    onClick: (event: MouseEvent<HTMLElement>) => void;
    onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
    tabIndex?: number;
    style: { readonly cursor: 'pointer' };
  } = {
    onClick: (event) => {
      // A press-drag that selects the entry's text also fires a click; that is a
      // read gesture, not an open intent, so an active (non-collapsed) selection
      // suppresses the open. A keyboard Enter cannot leave a selection, so its
      // handler skips this check.
      if (window.getSelection()?.isCollapsed === false) return;
      if (landedOnNestedInteractive(event.target, selector)) return;
      onOpen();
    },
    style: { cursor: 'pointer' },
  };

  if (keyboard) {
    props.tabIndex = 0;
    props.onKeyDown = (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (landedOnNestedInteractive(event.target, selector)) return;
      // Space would otherwise scroll the region; Enter/Space both activate.
      event.preventDefault();
      onOpen();
    };
  }

  return props;
}
