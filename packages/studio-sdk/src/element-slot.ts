/**
 * The runtime half of the `asChild` slot contract.
 *
 * Radix clones its own props onto the node an `asChild` slot is given, so the
 * slot takes exactly one ELEMENT. `ReactElement` states half of that: it rejects
 * a string, which would throw inside Radix anyway. It does NOT reject a
 * FRAGMENT — `<></>` is a `ReactElement` whose `type` is the fragment symbol —
 * and a fragment is the worse of the two, because React drops every prop cloned
 * onto it: the opener renders, carries no `aria-haspopup`/`aria-expanded`/
 * `aria-controls` and no handler, and fails nothing.
 */
import { Fragment } from 'react';
import type { ReactElement } from 'react';

/** Raises when an `asChild` slot is handed a fragment. `slot` names the prop. */
export function assertSlotElement(element: ReactElement, slot: string): void {
  if (element.type !== Fragment) return;
  throw new Error(
    `${slot} takes a single element, not a fragment: React drops the props the ` +
      'slot clones onto it, so the wiring and the handler would be lost.',
  );
}
