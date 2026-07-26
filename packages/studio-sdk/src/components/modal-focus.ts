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
      // A row action that deleted its own row is gone by now; focusing a
      // detached node moves nothing, so leave Radix's behaviour alone instead of
      // cancelling a restore we cannot complete.
      if (opener?.isConnected !== true) return;
      event.preventDefault();
      opener.focus();
    },
  };
}
