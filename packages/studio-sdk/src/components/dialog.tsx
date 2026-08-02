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
 *
 * Three additive opt-ins let a caller reshape the panel without giving up any
 * Radix behaviour:
 *
 *   - `fullscreen` swaps the centred fixed-size panel for one that fills the
 *     viewport edge to edge (`tai-dialog-fullscreen`); the overlay is untouched.
 *   - `contentClassName` merges onto `RadixDialog.Content` after the surface
 *     classes, so a host can hang its own CSS-scoping root on the content element
 *     — the mount point a plugin needs for its styles to reach inside the portal.
 *   - `chromeless` drops the forced visual `Title` and the `tai-stack` children
 *     wrapper, rendering `children` directly for a chrome-free content mode. The
 *     `title` is still required and still names the dialog: it is rendered
 *     visually-hidden so the accessible name never depends on the visible chrome.
 */
import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactElement, ReactNode } from 'react';

import { assertSlotElement } from '../element-slot';
import { useModalFocusReturn } from './modal-focus';

export interface DialogProps {
  readonly title: string;
  readonly description?: string;
  readonly children?: ReactNode;
  /**
   * A trigger element; when omitted, control the dialog via `open`/`onOpenChange`.
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
  /**
   * Fill the viewport edge to edge instead of centring a fixed-size panel. The
   * overlay, the focus trap and every other Radix behaviour are unchanged.
   */
  readonly fullscreen?: boolean;
  /**
   * A class merged onto `RadixDialog.Content` after the surface classes, for a
   * host that must reach the content element itself — e.g. a plugin hanging its
   * CSS-scoping root on the panel so its styles apply inside the Radix portal.
   */
  readonly contentClassName?: string;
  /**
   * Drop the forced visual `Title` and the `tai-stack` children wrapper, rendering
   * `children` directly for a chrome-free content mode. The `title` is still
   * required and still names the dialog — it renders visually-hidden — so the
   * accessible name never depends on the visible chrome.
   */
  readonly chromeless?: boolean;
}

export function Dialog({
  title,
  description,
  children,
  trigger,
  open,
  defaultOpen,
  onOpenChange,
  fullscreen = false,
  contentClassName,
  chromeless = false,
}: DialogProps) {
  const focusReturn = useModalFocusReturn(trigger !== undefined);
  if (trigger !== undefined) assertSlotElement(trigger, 'Dialog `trigger`');

  const contentClasses = ['tai-dialog'];
  if (fullscreen) contentClasses.push('tai-dialog-fullscreen');
  if (contentClassName !== undefined) contentClasses.push(contentClassName);

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
          className={contentClasses.join(' ')}
          {...focusReturn}
          {...(description === undefined ? { 'aria-describedby': undefined } : {})}
        >
          {/* The title always names the dialog; `chromeless` only hides it, moving
              it behind `tai-visually-hidden` so the accessible name is unchanged. */}
          <RadixDialog.Title className={chromeless ? 'tai-visually-hidden' : 'tai-dialog-title'}>
            {title}
          </RadixDialog.Title>
          {chromeless ? (
            <>
              {description !== undefined ? (
                <RadixDialog.Description className="tai-visually-hidden">
                  {description}
                </RadixDialog.Description>
              ) : null}
              {children}
            </>
          ) : (
            <div className="tai-stack">
              {description !== undefined ? (
                <RadixDialog.Description className="tai-muted">
                  {description}
                </RadixDialog.Description>
              ) : null}
              {children}
            </div>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
