/**
 * The create-trigger-link flow: a form that, on success, becomes a shown-once QR
 * dialog for the minted link. During the reveal the link cannot be re-minted, so
 * light dismissal is disabled — only the explicit Done button closes it; the form
 * phase stays an ordinary dismissable modal.
 */
import { Dialog } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { MintedLinkReveal } from './MintedLinkReveal';
import { TriggerLinkForm } from './TriggerLinkForm';
import { useCreateTriggerLink } from './useCreateTriggerLink';

export function CreateTriggerLinkDialog({ onClose }: { readonly onClose: () => void }): ReactNode {
  const form = useCreateTriggerLink();

  return (
    <Dialog
      title="Create trigger link"
      open
      dismissable={form.link === null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {form.url !== null && form.link !== null && form.qr !== null ? (
        <MintedLinkReveal url={form.url} link={form.link} qr={form.qr} onClose={onClose} />
      ) : (
        <TriggerLinkForm form={form} onClose={onClose} />
      )}
    </Dialog>
  );
}
