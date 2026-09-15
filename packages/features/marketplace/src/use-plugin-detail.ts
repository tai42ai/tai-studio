/** The plugin-detail state machine: the detail/installed/advisory reads, the
 * install/update/uninstall mutations, the active dialog, and the last receipt. */
import type { MarketplaceInstallBody, MarketplaceInstallResult } from '@tai42/api-client';
import { featureDisabledMessage, isFeatureDisabled, useApi } from '@tai42/studio-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { marketplaceAdvisoriesKey, marketplaceInstalledKey, marketplacePluginKey } from './keys';
import type { ActionResult, ActiveAction } from './plugin-detail-data';

/**
 * The install/update/uninstall mutations plus the store-off refusal message. Each
 * success records the receipt, closes the dialog, and invalidates the whole query
 * cache — a pip install/uninstall + reload can stale ANY server-derived read.
 */
function usePluginMutations(
  refValue: string,
  setActiveAction: (action: ActiveAction | null) => void,
  setResult: (result: ActionResult) => void,
) {
  const api = useApi();
  const queryClient = useQueryClient();

  const onInstallSuccess = (receipt: MarketplaceInstallResult, verb: string): void => {
    setActiveAction(null);
    setResult({
      verb,
      ref: receipt.ref,
      version: receipt.version,
      notes: receipt.notes,
      advisories: receipt.advisories,
      routes: receipt.routes,
    });
    void queryClient.invalidateQueries();
  };

  // The install/update body minus the ref the mutation supplies: the env dialog adds
  // the preview's missing_env values + secret marks, the mount dialog adds the chosen
  // route bases + public-route consent; a plain install/update sends none.
  const installMutation = useMutation({
    mutationFn: (body: Omit<MarketplaceInstallBody, 'ref'>) =>
      api.installMarketplacePlugin({ ref: refValue, ...body }),
    onSuccess: (receipt) => {
      onInstallSuccess(receipt, 'Installed');
    },
  });
  const updateMutation = useMutation({
    mutationFn: (body: Omit<MarketplaceInstallBody, 'ref'>) =>
      api.updateMarketplacePlugin({ ref: refValue, ...body }),
    onSuccess: (receipt) => {
      onInstallSuccess(receipt, 'Updated');
    },
  });
  const uninstallMutation = useMutation({
    mutationFn: () => api.uninstallMarketplacePlugin({ ref: refValue }),
    onSuccess: (receipt) => {
      setActiveAction(null);
      setResult({
        verb: 'Uninstalled',
        ref: receipt.ref,
        version: null,
        notes: receipt.notes,
        advisories: [],
        routes: [],
      });
      void queryClient.invalidateQueries();
    },
  });

  // The marketplace install store is unconfigured: an install/update/uninstall
  // answered with a 501 `marketplace-not-configured`. The muted OFF note replaces the
  // write buttons; browse/detail reads never need the store, so they stay untouched.
  const storeRefusal = [installMutation.error, updateMutation.error, uninstallMutation.error].find(
    isFeatureDisabled,
  );
  const storeRefusalMessage =
    storeRefusal !== undefined ? featureDisabledMessage(storeRefusal) : null;

  return { installMutation, updateMutation, uninstallMutation, storeRefusalMessage };
}

export function usePluginDetail(refValue: string) {
  const api = useApi();
  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);

  const slash = refValue.indexOf('/');
  const namespace = slash >= 0 ? refValue.slice(0, slash) : '';
  const name = slash >= 0 ? refValue.slice(slash + 1) : '';

  const detailQuery = useQuery({
    queryKey: marketplacePluginKey(refValue),
    queryFn: ({ signal }) => api.getMarketplacePlugin(namespace, name, signal),
    enabled: slash >= 0,
  });
  const installedQuery = useQuery({
    queryKey: marketplaceInstalledKey,
    queryFn: ({ signal }) => api.listInstalledMarketplacePlugins(signal),
    enabled: slash >= 0,
  });
  const advisoriesQuery = useQuery({
    queryKey: marketplaceAdvisoriesKey,
    queryFn: ({ signal }) => api.getMarketplaceAdvisories(signal),
    enabled: slash >= 0,
  });

  const { installMutation, updateMutation, uninstallMutation, storeRefusalMessage } =
    usePluginMutations(refValue, setActiveAction, setResult);

  const closeAction = (): void => {
    if (activeAction === 'install') installMutation.reset();
    if (activeAction === 'update') updateMutation.reset();
    if (activeAction === 'uninstall') uninstallMutation.reset();
    setActiveAction(null);
  };

  return {
    slash,
    detailQuery,
    installedQuery,
    advisoriesQuery,
    installMutation,
    updateMutation,
    uninstallMutation,
    activeAction,
    openAction: setActiveAction,
    result,
    storeRefusalMessage,
    closeAction,
  };
}
