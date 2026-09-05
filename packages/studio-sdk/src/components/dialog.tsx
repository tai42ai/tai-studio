/**
 * `Dialog` — a design-system wrapper over Radix Dialog: an accessible modal (role
 * `dialog`, focus trap, Escape to close) labelled by its title. Modality comes from
 * the focus trap and Radix marking the page inert, not an `aria-modal` attribute.
 *
 * Radix owns every modal behaviour (focus trap, scroll lock, Escape, focus return
 * to the trigger); this component adds only the design-system surface (`tai-overlay`
 * scrim, `tai-dialog` panel). The one gap Radix leaves — focus return for a dialog
 * with no trigger — is filled by `useModalFocusReturn`, which stands down when a
 * trigger IS rendered. The `fullscreen`, `contentClassName` and `chromeless` opt-ins
 * (see the props) reshape the panel without giving up any Radix behaviour.
 */
import * as RadixDialog from '@radix-ui/react-dialog';
import { useRef, type ReactElement, type ReactNode } from 'react';

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
  /**
   * When `false`, the light-dismiss gestures are disabled: Escape and a pointer
   * press outside the panel no longer close it, so the only way out is an explicit
   * action the `children` render (a Done/Cancel button calling `onOpenChange`).
   * The focus trap, the scrim and every other Radix behaviour are unchanged. This
   * is a generic mechanism — it knows nothing of what the dialog holds — for the
   * one-time-reveal case where an accidental dismiss would lose content the server
   * cannot reproduce. Defaults to `true`, the ordinary dismissable modal. This
   * design-system panel renders no built-in close (X) affordance, so there is none
   * to hide here; explicit close stays entirely with the caller's own buttons.
   */
  readonly dismissable?: boolean;
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
  dismissable = true,
}: DialogProps) {
  const focusReturn = useModalFocusReturn(trigger !== undefined);
  if (trigger !== undefined) assertSlotElement(trigger, 'Dialog `trigger`');

  const contentClasses = ['tai-dialog'];
  if (fullscreen) contentClasses.push('tai-dialog-fullscreen');
  if (contentClassName !== undefined) contentClasses.push(contentClassName);

  // Blocking a dismiss is `preventDefault` on the two gestures Radix fires for
  // one — Escape and a pointer press outside the panel — so the trap and scrim
  // stay in place and only an explicit action can call `onOpenChange`.
  //
  // The handlers are STABLE (created once) and read `dismissable` through a live
  // ref, deliberately: Radix's dismissable layer latches the handler it was given
  // and keeps calling that first closure, so a dialog that mounts dismissable and
  // later turns undismissable (the shown-once reveal) would go on honouring the
  // stale `dismissable` if the value were read from the render closure. The ref,
  // rewritten every render, is what a fresh gesture always sees.
  const dismissableRef = useRef(dismissable);
  dismissableRef.current = dismissable;
  const dismissGuards = useRef({
    onEscapeKeyDown: (event: KeyboardEvent) => {
      if (!dismissableRef.current) event.preventDefault();
    },
    onPointerDownOutside: (event: Event) => {
      if (!dismissableRef.current) event.preventDefault();
    },
  }).current;

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
          {...dismissGuards}
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
