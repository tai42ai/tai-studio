/**
 * Focus return for a modal that renders no Radix `Trigger`.
 *
 * Radix composes its own close handler AFTER the consumer's — `composeEventHandlers`
 * runs the consumer's `onCloseAutoFocus` first and skips Radix's only when that
 * handler called `preventDefault`. Radix's handler is
 * `event.preventDefault(); triggerRef.current?.focus()`: it returns focus to the
 * Trigger and cancels the focus scope's restore in the same breath. A modal
 * driven purely by `open`/`onOpenChange` — every confirm mounted for the
 * duration of one action — has no Trigger for that ref to point at, so if that
 * handler is allowed to run the cancel lands, the focus does not, and the reader
 * is left on `<body>` with their place in the page gone (WCAG 2.4.3).
 *
 * So with no Trigger this stands in for one and never yields the decision back:
 * it prevents default unconditionally — Radix's restore is a guaranteed no-op
 * here, and a `<body>` if allowed to run — and then lands the focus itself, on
 * the first of these that will take it:
 *
 *   1. the element focus left on the way in, when it can still hold focus;
 *   2. the nearest of that element's ancestors still in the document, borrowing
 *      it a `tabindex="-1"` if it has none.
 *
 * The second case is the common one, not the exotic one: the action a confirm
 * confirms is usually what removes, disables or hides the control that opened
 * it. The list or table the vanished row sat in is still on screen and is where
 * the reader was, so that is where they are put back.
 *
 * Those ancestors are recorded on the way IN because they cannot be recovered on
 * the way out: detaching a node clears its own `parentElement`, so walking up
 * from a removed row's button dead-ends inside the removed subtree instead of
 * reaching the list that is still there. While the opener is still attached its
 * live chain is used instead, so an opener that moved is followed rather than
 * remembered wrongly.
 *
 * A borrowed `tabindex` is handed back on the element's `blur`, so the DOM keeps
 * the attribute only while that element actually holds focus — and an element
 * that is itself removed first takes the listener with it. Removing it any
 * earlier would strip the attribute out from under the focus it exists to hold.
 *
 * When a Trigger IS rendered both handlers stand down and prevent nothing, so
 * Radix's own restore runs untouched — there is never a second mechanism
 * competing with the primitive.
 */
import { useRef } from 'react';

export interface ModalFocusReturnHandlers {
  /** Runs before Radix moves focus into the panel, while the opener still holds it. */
  readonly onOpenAutoFocus: (event: Event) => void;
  /** Runs as the panel unmounts, before the focus scope would restore. */
  readonly onCloseAutoFocus: (event: Event) => void;
}

/**
 * `element`'s ancestors, nearest first, stopping short of `<body>` — landing on
 * `<body>` is the failure this module exists to prevent, and it is already where
 * focus falls when nothing else will take it.
 */
function ancestorChain(element: HTMLElement): HTMLElement[] {
  const chain: HTMLElement[] = [];
  const { body } = element.ownerDocument;
  for (
    let node = element.parentElement;
    node !== null && node !== body;
    node = node.parentElement
  ) {
    chain.push(node);
  }
  return chain;
}

/**
 * Focuses a container that was never meant to be focusable, lending it a
 * `tabindex="-1"` if it has none and taking that back when it loses focus.
 *
 * @returns whether the focus actually landed.
 */
function focusAsFallback(element: HTMLElement): boolean {
  const borrowed = !element.hasAttribute('tabindex');
  if (borrowed) element.setAttribute('tabindex', '-1');
  element.focus();
  if (element.ownerDocument.activeElement !== element) {
    if (borrowed) element.removeAttribute('tabindex');
    return false;
  }
  if (borrowed) {
    element.addEventListener(
      'blur',
      () => {
        element.removeAttribute('tabindex');
      },
      { once: true },
    );
  }
  return true;
}

/**
 * The `onOpenAutoFocus` / `onCloseAutoFocus` pair to spread onto a Radix
 * `Dialog.Content`.
 *
 * @param hasTrigger - whether a Radix `Trigger` is rendered. When it is, both
 *   handlers stand down and Radix's own focus return applies.
 */
export function useModalFocusReturn(hasTrigger: boolean): ModalFocusReturnHandlers {
  const openerRef = useRef<HTMLElement | null>(null);
  const openedUnderRef = useRef<HTMLElement[]>([]);

  return {
    onOpenAutoFocus: (): void => {
      // Recording is only ever read by the close handler, which stands down with
      // a Trigger present. Standing down here too keeps the pair symmetric and
      // stops the hook holding the opener and its whole ancestor chain alive for
      // a modal that will never consult them.
      if (hasTrigger) return;
      // The focus scope dispatches this BEFORE it focuses the panel, so the
      // active element is still whatever the reader activated to open the modal,
      // and its ancestors are still attached to record.
      const active = document.activeElement;
      const opener = active instanceof HTMLElement ? active : null;
      openerRef.current = opener;
      openedUnderRef.current = opener === null ? [] : ancestorChain(opener);
    },
    onCloseAutoFocus: (event: Event): void => {
      if (hasTrigger) return;
      const opener = openerRef.current;
      const openedUnder = openedUnderRef.current;
      openerRef.current = null;
      openedUnderRef.current = [];

      // Radix's handler runs next unless this one prevents default. Its
      // `triggerRef` is null by definition here, and it cancels the scope's
      // restore before finding that out, so letting it run is a guaranteed
      // `<body>`. Take the decision away from it in every case, including the
      // one where there is nothing to return focus to.
      event.preventDefault();
      if (opener === null) return;

      opener.focus();
      if (opener.ownerDocument.activeElement === opener) return;

      // The opener would not take focus — it was removed, disabled or hidden by
      // the action this modal confirmed. Fall back to the nearest ancestor that
      // is still in the document, so the reader keeps their place in the page.
      const chain = opener.isConnected ? ancestorChain(opener) : openedUnder;
      for (const ancestor of chain) {
        if (ancestor.isConnected && focusAsFallback(ancestor)) return;
      }
    },
  };
}
