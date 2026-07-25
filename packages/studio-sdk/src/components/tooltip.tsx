/**
 * `Tooltip` — a token-styled wrapper over Radix Tooltip (content gets role
 * `tooltip`, shown on hover/focus). Each instance carries its own Provider so a
 * single tooltip works without the caller mounting one.
 */
import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { CSSProperties, ReactNode } from 'react';

export interface TooltipProps {
  readonly content: ReactNode;
  readonly children: ReactNode;
  readonly delayDuration?: number;
}

const contentStyle: CSSProperties = {
  background: 'var(--tai-color-text)',
  color: 'var(--tai-color-bg)',
  padding: 'var(--tai-space-1) var(--tai-space-2)',
  borderRadius: 'var(--tai-radius-sm)',
  fontSize: 'var(--tai-text-sm)',
  fontFamily: 'var(--tai-font-sans)',
  boxShadow: 'var(--tai-shadow-sm)',
  zIndex: 50,
};

export function Tooltip({ content, children, delayDuration = 200 }: TooltipProps) {
  return (
    <RadixTooltip.Provider delayDuration={delayDuration}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content sideOffset={4} style={contentStyle}>
            {content}
            <RadixTooltip.Arrow style={{ fill: 'var(--tai-color-text)' }} />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
