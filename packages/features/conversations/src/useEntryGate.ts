/**
 * The web-entry-gate state for one identity: the gate read plus the enable/disable
 * toggle and code-revoke mutations, and the confirm-first rule for turning the gate
 * ON while no live code exists (which would lock the route to everyone).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from '@tai42/studio-sdk';

import { webEntryGateKey } from './keys';

export function useEntryGate(identity: string) {
  const api = useApi();
  const queryClient = useQueryClient();

  const [confirmEnable, setConfirmEnable] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<string | null>(null);

  const gate = useQuery({
    queryKey: webEntryGateKey(identity),
    queryFn: ({ signal }) => api.getWebEntryGate(identity, signal),
  });

  const invalidateGate = (): void => {
    void queryClient.invalidateQueries({ queryKey: webEntryGateKey(identity) });
  };

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => api.setWebEntryGate(identity, enabled),
    onSuccess: () => {
      setConfirmEnable(false);
      invalidateGate();
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (codeId: string) => api.revokeWebEntryCode(identity, codeId),
    onSuccess: () => {
      setPendingRevoke(null);
      invalidateGate();
    },
  });

  // Turning the gate ON while no live code exists locks the route to everyone, so it
  // is confirmed first (allowed, just warned); every other flip is immediate.
  const onToggle = (next: boolean): void => {
    toggleMutation.reset();
    if (next && gate.data?.codes.length === 0) {
      setConfirmEnable(true);
      return;
    }
    toggleMutation.mutate(next);
  };

  return {
    gate,
    toggleMutation,
    revokeMutation,
    onToggle,
    confirmEnable,
    setConfirmEnable,
    pendingRevoke,
    setPendingRevoke,
  };
}
