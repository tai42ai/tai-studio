/**
 * The profile dialog host: renders whichever profile dialog the tab has opened
 * (create / edit / diff / apply / revert / versions / delete) and owns the delete
 * mutation. Revert re-applies the reserved `@previous` profile each apply auto-saves.
 */
import type { ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog, useApi } from '@tai42/studio-sdk';

import { settingsProfilesKey } from './keys';
import { ProfileFormDialog } from './ProfileFormDialog';
import { DiffDialog } from './ProfileDiffDialog';
import { ApplyProfileDialog } from './ApplyProfileDialog';
import { ProfileVersionsDialog } from './ProfileVersionsDialog';

/** The reserved profile that every apply auto-saves the replaced env into. */
const PREVIOUS_PROFILE = '@previous';

export type OpenDialog =
  | { readonly kind: 'create' }
  | { readonly kind: 'edit'; readonly name: string }
  | { readonly kind: 'delete'; readonly name: string }
  | { readonly kind: 'diff'; readonly name: string }
  | { readonly kind: 'apply'; readonly name: string }
  | { readonly kind: 'revert' }
  | { readonly kind: 'versions'; readonly name: string };

export function ProfileDialogHost({
  open,
  ownedSecret,
  readOnly,
  onClose,
}: {
  readonly open: OpenDialog | null;
  readonly ownedSecret: ReadonlyMap<string, boolean>;
  readonly readOnly: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: (name: string) => api.deleteSettingsProfile(name),
    onSuccess: () => {
      onClose();
      void queryClient.invalidateQueries({ queryKey: settingsProfilesKey });
    },
  });

  if (open === null) return null;

  switch (open.kind) {
    case 'create':
      return <ProfileFormDialog name={null} ownedSecret={ownedSecret} onClose={onClose} />;
    case 'edit':
      return <ProfileFormDialog name={open.name} ownedSecret={ownedSecret} onClose={onClose} />;
    case 'diff':
      return <DiffDialog name={open.name} onClose={onClose} />;
    case 'apply':
      return (
        <ApplyProfileDialog
          name={open.name}
          title={`Apply profile — ${open.name}`}
          intro="Review the change, then apply the profile to the fleet."
          onClose={onClose}
        />
      );
    case 'revert':
      return (
        <ApplyProfileDialog
          name={PREVIOUS_PROFILE}
          title="Revert last apply"
          intro="Re-applies the environment replaced by the most recent apply."
          onClose={onClose}
        />
      );
    case 'versions':
      return (
        <ProfileVersionsDialog
          name={open.name}
          ownedSecret={ownedSecret}
          readOnly={readOnly}
          onClose={onClose}
        />
      );
    case 'delete':
      return (
        <ConfirmDialog
          title="Delete profile"
          confirmLabel="Delete profile"
          pendingLabel="Deleting"
          isPending={remove.isPending}
          error={remove.isError ? remove.error : undefined}
          onConfirm={() => {
            remove.mutate(open.name);
          }}
          onClose={onClose}
        >
          <p style={{ margin: 0 }}>
            Delete the profile <strong>{open.name}</strong>? Its version history is removed too. The
            live environment is unchanged until another profile is applied.
          </p>
        </ConfirmDialog>
      );
  }
}
