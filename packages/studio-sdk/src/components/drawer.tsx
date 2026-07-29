/**
 * `Drawer` — a side-anchored, full-height modal panel, published for a screen
 * that wants a modal it can anchor to an edge rather than centre. Nothing in
 * Studio renders one today; it is SDK surface a plugin can reach for. It is the
 * same Radix Dialog machinery `Dialog` uses, so
 * the focus trap, the scroll lock, Escape and overlay dismissal, the inert
 * background, and focus return to the opener all come from the primitive; only
 * the anchoring differs, and that lives entirely in `.tai-drawer`.
 *
 * Pass the opener as `trigger` where there is one (as `Dialog` does): Radix's own
 * trigger is what carries `aria-haspopup`/`aria-expanded`/`aria-controls` and
 * what its close sequence hands focus back to. A drawer opened purely by flipping
 * `open` renders no trigger, so `useModalFocusReturn` returns focus to the opener
 * in that case alone — with a trigger present it stands down and Radix's own
 * restore is the only mechanism.
 *
 * Open state takes either form, the same three props `Dialog` publishes:
 * `open`/`onOpenChange` to drive it from the caller's state, `defaultOpen` (or
 * nothing at all) to let Radix own it behind a `trigger`.
 */
import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactElement, ReactNode } from 'react';

import { assertSlotElement } from '../element-slot';
import { CloseIcon } from './icons';
import { useModalFocusReturn } from './modal-focus';

export interface DrawerProps {
  /** The dialog's accessible name. */
  readonly title: string;
  readonly children: ReactNode;
  readonly side?: 'left' | 'right';
  /**
   * The opener. Radix labels it and returns focus to it when the drawer closes.
   *
   * It is a single ELEMENT, not any node: Radix clones its props onto it, so a
   * string throws. The type admits a FRAGMENT — `<></>` is a `ReactElement` —
   * which would render openers carrying neither the
   * `aria-haspopup`/`aria-expanded`/`aria-controls` wiring nor a click handler,
   * so {@link assertSlotElement} rejects that one at runtime.
   */
  readonly trigger?: ReactElement;
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

export function Drawer({
  title,
  children,
  side = 'left',
  trigger,
  open,
  defaultOpen,
  onOpenChange,
}: DrawerProps) {
  const focusReturn = useModalFocusReturn(trigger !== undefined);
  if (trigger !== undefined) assertSlotElement(trigger, 'Drawer `trigger`');
  return (
    <RadixDialog.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger === undefined ? null : <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>}
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="tai-overlay" />
        {/* The panel is named by its title alone; `aria-describedby={undefined}`
            is Radix's opt-out for a dialog that carries no description. */}
        <RadixDialog.Content
          className="tai-drawer"
          data-side={side}
          aria-describedby={undefined}
          {...focusReturn}
        >
          <div className="tai-drawer-header">
            <RadixDialog.Title className="tai-section-title">{title}</RadixDialog.Title>
            <RadixDialog.Close className="tai-icon-btn" aria-label="Close">
              <CloseIcon />
            </RadixDialog.Close>
          </div>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
