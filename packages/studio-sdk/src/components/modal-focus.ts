/**
 * Focus return for a modal that renders no Radix `Trigger`.
 *
 * Radix's own close sequence is `event.preventDefault(); triggerRef.current?.focus()`
 * — it returns focus to its Trigger and, in the same breath, cancels the focus
 * scope's restore. A modal driven purely by `open`/`onOpenChange` (every confirm
 * mounted for the duration of one action) has no Trigger for that ref to point
 * at, so the cancel lands but the focus never does, and the reader is left on
 * `<body>` with their place in the page gone (WCAG 2.4.3).
 *
 * This stands in for the missing Trigger and only then: it remembers the element
 * focus left on the way in and hands it back on the way out. When a Trigger IS
 * rendered it prevents nothing, so Radix's own restore runs untouched — there is
 * never a second mechanism competing with the primitive.
 */
import { useRef } from 'react';

export interface ModalFocusReturnHandlers {
  /** Runs before Radix moves focus into the panel, while the opener still holds it. */
  readonly onOpenAutoFocus: (event: Event) => void;
  /** Runs as the panel unmounts, before the focus scope would restore. */
  readonly onCloseAutoFocus: (event: Event) => void;
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

  return {
    onOpenAutoFocus: (): void => {
      // The focus scope dispatches this BEFORE it focuses the panel, so the
      // active element is still whatever the reader activated to open the modal.
      const opener = document.activeElement;
      openerRef.current = opener instanceof HTMLElement ? opener : null;
    },
    onCloseAutoFocus: (event: Event): void => {
      if (hasTrigger) return;
      const opener = openerRef.current;
      if (opener === null) return;
      // Try FIRST, then decide. The remembered opener may have been removed by
      // the very action this modal confirmed, or left disabled or hidden by it,
      // and focusing any of those moves nothing. Cancelling Radix's restore is
      // only justified once the focus has actually landed — testing
      // `isConnected` alone would claim the restore for a disabled opener and
      // strand the reader on `<body>`, which is the failure being fixed.
      opener.focus();
      if (opener.ownerDocument.activeElement === opener) event.preventDefault();
    },
  };
}
