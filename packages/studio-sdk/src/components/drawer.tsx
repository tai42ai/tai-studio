/**
 * `Drawer` — a side-anchored, full-height modal panel (the shell's navigation
 * surface below 640 px). It is the same Radix Dialog machinery `Dialog` uses, so
 * the focus trap, the scroll lock, Escape and overlay dismissal, the inert
 * background, and focus return to the opener all come from the primitive; only
 * the anchoring differs, and that lives entirely in `.tai-drawer`.
 *
 * Pass the opener as `trigger` (as `Dialog` does). Radix's own trigger is what
 * carries `aria-haspopup`/`aria-expanded`/`aria-controls` and what its close
 * sequence hands focus back to — a drawer opened purely by flipping `open`
 * leaves Radix with nothing to restore focus to, and returning focus by hand
 * would be a second mechanism competing with the primitive's.
 */
import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

import { CloseIcon } from './icons';

export interface DrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The dialog's accessible name. */
  readonly title: string;
  readonly children: ReactNode;
  readonly side?: 'left' | 'right';
  /** The opener. Radix labels it and returns focus to it when the drawer closes. */
  readonly trigger?: ReactNode;
}

export function Drawer({
  open,
  onOpenChange,
  title,
  children,
  side = 'left',
  trigger,
}: DrawerProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger === undefined ? null : <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>}
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="tai-overlay" />
        {/* The panel is named by its title alone; `aria-describedby={undefined}`
            is Radix's opt-out for a dialog that carries no description. */}
        <RadixDialog.Content className="tai-drawer" data-side={side} aria-describedby={undefined}>
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
