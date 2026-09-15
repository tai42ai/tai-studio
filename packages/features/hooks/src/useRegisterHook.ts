/**
 * The register (upsert) mutation. On success it invalidates the whole hooks list;
 * in edit mode it closes the host dialog through `onClose`, and in create mode it
 * clears the form through `onReset`.
 */
import type { HookRegister } from '@tai42/api-client';
import { useApi } from '@tai42/studio-sdk';
import { useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';

import { HOOKS_KEY_ROOT } from './keys';

export function useRegisterHook({
  onClose,
  onReset,
}: {
  readonly onClose?: () => void;
  readonly onReset: () => void;
}): UseMutationResult<unknown, Error, HookRegister> {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: HookRegister) => api.registerHook(params),
    onSuccess: () => {
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === HOOKS_KEY_ROOT });
      if (onClose !== undefined) {
        onClose();
        return;
      }
      onReset();
    },
  });
}
