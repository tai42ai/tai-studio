/**
 * `Dialog` — a design-system wrapper over Radix Dialog: an accessible modal (role
 * `dialog`, focus trap, Escape to close) labelled by its title. Modality is
 * enforced by the focus trap and by Radix marking the rest of the page inert, not
 * by an `aria-modal` attribute — the panel ships none.
 *
 * Radix owns every modal behaviour — the focus trap, the background scroll lock,
 * Escape, and focus return to the trigger — so this component adds no second
 * mechanism. It contributes only the design-system surface: `tai-overlay` paints
 * the scrim from `--tai-color-scrim`, and `tai-dialog` sizes the panel with a
 * `min()` so it still fits a 320 px viewport. The one gap Radix leaves — focus
 * return for a dialog that renders no trigger — is filled by
 * `useModalFocusReturn`, which stands down whenever a trigger IS rendered.
 */
import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactElement, ReactNode } from 'react';

import { useModalFocusReturn } from './modal-focus';

export interface DialogProps {
  readonly title: string;
  readonly description?: string;
  readonly children?: ReactNode;
  /**
   * A trigger element; when omitted, control the dialog via `open`/`onOpenChange`.
   *
   * It is a single ELEMENT, not any node: Radix clones its props onto it, so a
   * string throws and a fragment silently renders openers that carry neither the
   * `aria-haspopup`/`aria-expanded`/`aria-controls` wiring nor a click handler.
   */
  readonly trigger?: ReactElement;
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

export function Dialog({
  title,
  description,
  children,
  trigger,
  open,
  defaultOpen,
  onOpenChange,
}: DialogProps) {
  const focusReturn = useModalFocusReturn(trigger !== undefined);
  return (
    <RadixDialog.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger !== undefined ? <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger> : null}
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="tai-overlay" />
        {/* Radix wires `aria-describedby` to its Description's id unconditionally,
            so a dialog that renders no Description would ship a dangling IDREF.
            Passing the prop as `undefined` is Radix's opt-out — it has to be
            ABSENT when a description IS rendered, or it would clear the wiring. */}
        <RadixDialog.Content
          className="tai-dialog"
          {...focusReturn}
          {...(description === undefined ? { 'aria-describedby': undefined } : {})}
        >
          <RadixDialog.Title className="tai-dialog-title">{title}</RadixDialog.Title>
          <div className="tai-stack">
            {description !== undefined ? (
              <RadixDialog.Description className="tai-muted">{description}</RadixDialog.Description>
            ) : null}
            {children}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
