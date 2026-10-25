/**
 * The view for a presets read that failed on one stored row the server cannot read.
 * Every list and detail read walks each active body, so the one bad row fails them all
 * until it is gone: the server's message is shown WITHOUT a Retry (a retry fails the
 * same way), and below it the one way out — deleting that row.
 *
 * The delete is drawn only once the access projection is known: on a ready projection
 * that admits the delete route the danger button opens the delete confirm; on a ready
 * projection that does not, a muted status line says so in the button's place; while
 * the projection is loading or failed, neither is drawn.
 */
import { apiRoutes } from '@tai42/api-client';
import {
  Button,
  errorMessage,
  ErrorState,
  useAppNavigate,
  useCanWrite,
  useCapabilities,
} from '@tai42/studio-sdk';
import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { DeletePresetDialog } from './DeletePresetDialog';
import { PRESETS_KEY_ROOT } from './keys';

export function StoredPresetFault({
  error,
  name,
  selected,
}: {
  /** The read's error, its message shown verbatim. */
  readonly error: unknown;
  /** The stored row the server could not read. */
  readonly name: string;
  /** The page's selected preset (`?preset=`), if any. */
  readonly selected: string | undefined;
}): ReactNode {
  const { state } = useCapabilities();
  const canDelete = useCanWrite(apiRoutes.delete_api_presets_name.path, 'DELETE');
  const queryClient = useQueryClient();
  const navigate = useAppNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
      <ErrorState message={errorMessage(error)} />
      {canDelete ? (
        <div>
          <Button
            type="button"
            variant="danger"
            onClick={() => {
              setDeleteOpen(true);
            }}
          >
            {`Delete preset '${name}'`}
          </Button>
        </div>
      ) : state.status === 'ready' ? (
        <p
          role="status"
          style={{
            margin: 0,
            color: 'var(--tai-color-text-muted)',
            fontSize: 'var(--tai-text-sm)',
          }}
        >
          {`Deleting preset '${name}' is outside your access — it needs write access to presets.`}
        </p>
      ) : null}
      {deleteOpen ? (
        <DeletePresetDialog
          name={name}
          conflicted={null}
          onClose={() => {
            setDeleteOpen(false);
          }}
          onDeleted={() => {
            setDeleteOpen(false);
            // Every presets read walked the faulted row, so each reads again.
            void queryClient.invalidateQueries({ queryKey: [PRESETS_KEY_ROOT] });
            if (selected === name) navigate('presets', {});
          }}
        />
      ) : null}
    </div>
  );
}
