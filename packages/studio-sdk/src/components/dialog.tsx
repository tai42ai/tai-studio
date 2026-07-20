/**
 * `Dialog` — a token-styled wrapper over Radix Dialog: an accessible modal (role
 * `dialog`, `aria-modal`, focus trap, Escape to close) labelled by its title.
 */
import * as RadixDialog from '@radix-ui/react-dialog';
import type { CSSProperties, ReactNode } from 'react';

export interface DialogProps {
  readonly title: string;
  readonly description?: string;
  readonly children?: ReactNode;
  /** A trigger element; when omitted, control the dialog via `open`/`onOpenChange`. */
  readonly trigger?: ReactNode;
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.45)',
};

const contentStyle: CSSProperties = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 'min(90vw, 30rem)',
  background: 'var(--tai-color-surface-raised)',
  color: 'var(--tai-color-text)',
  border: '1px solid var(--tai-color-border)',
  borderRadius: 'var(--tai-radius-lg)',
  boxShadow: 'var(--tai-shadow-md)',
  padding: 'var(--tai-space-6)',
};

export function Dialog({
  title,
  description,
  children,
  trigger,
  open,
  defaultOpen,
  onOpenChange,
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger !== undefined ? <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger> : null}
      <RadixDialog.Portal>
        <RadixDialog.Overlay style={overlayStyle} />
        <RadixDialog.Content style={contentStyle}>
          <RadixDialog.Title style={{ margin: 0, fontSize: 'var(--tai-text-lg)' }}>
            {title}
          </RadixDialog.Title>
          {description !== undefined ? (
            <RadixDialog.Description
              style={{ marginTop: 'var(--tai-space-2)', color: 'var(--tai-color-text-muted)' }}
            >
              {description}
            </RadixDialog.Description>
          ) : null}
          <div style={{ marginTop: 'var(--tai-space-4)' }}>{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
