/**
 * `Tooltip` — a design-system wrapper over Radix Tooltip (content gets role
 * `tooltip`, shown on hover/focus, wired to the trigger by Radix). Each instance
 * carries its own Provider so a single tooltip works without the caller mounting
 * one, and `delayDuration` tunes that Provider's open delay.
 *
 * The bubble is the `tai-tooltip` surface; the arrow is the one paint the class
 * layer cannot reach (Radix renders it as an inline SVG), so it takes the same
 * raised-surface token the bubble's background resolves from.
 */
import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactElement, ReactNode } from 'react';

export interface TooltipProps {
  readonly content: ReactNode;
  /**
   * The element the bubble describes and hangs off.
   *
   * It is a single ELEMENT, not any node: Radix clones its props onto it, so a
   * string throws and a fragment silently renders children that carry none of
   * the hover/focus wiring or the `aria-describedby` back to the bubble.
   */
  readonly children: ReactElement;
  readonly delayDuration?: number;
}

export function Tooltip({ content, children, delayDuration = 200 }: TooltipProps) {
  return (
    <RadixTooltip.Provider delayDuration={delayDuration}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content sideOffset={4} className="tai-tooltip">
            {content}
            <RadixTooltip.Arrow style={{ fill: 'var(--tai-color-surface-raised)' }} />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
