/**
 * The single-server MCP actions the directory offers: reload one server (a failed or
 * not-loaded one) and deregister a failed one. Both refresh the live status read.
 */
import { summarizeFleetResult } from '@tai42/api-client';
import { mcpFailedKey, mcpStatusKey, useApi } from '@tai42/studio-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useMcpServerActions() {
  const api = useApi();
  const queryClient = useQueryClient();
  const refreshStatus = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: mcpStatusKey });
    await queryClient.invalidateQueries({ queryKey: mcpFailedKey });
  };
  const reload = useMutation({
    mutationFn: (title: string) => api.reloadMcp(title),
    onSuccess: refreshStatus,
  });
  const deregister = useMutation({
    mutationFn: (title: string) => api.deregisterMcp(title),
    onSuccess: refreshStatus,
  });
  return {
    reload,
    deregister,
    reloadReport: reload.data === undefined ? null : summarizeFleetResult(reload.data),
    deregisterReport: deregister.data === undefined ? null : summarizeFleetResult(deregister.data),
  };
}
