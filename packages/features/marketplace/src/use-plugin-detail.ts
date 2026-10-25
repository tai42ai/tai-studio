/** The plugin-detail state machine: the detail/installed/advisory reads, the
 * uninstall mutation, the active dialog, and the last receipt. Install and update run
 * through the SDK's `useInstallAction` inside their forms; the host hears back here. */
import type { MarketplaceInstallResult } from '@tai42/api-client';
import {
  featureDisabledMessage,
  installedMarketplacePluginsKey,
  isFeatureDisabled,
  marketplacePluginKey,
  useApi,
} from '@tai42/studio-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { marketplaceAdvisoriesKey } from './keys';
import type { ActionResult, ActiveAction } from './plugin-detail-data';

/**
 * The host side of every action: each success records the receipt, closes the dialog,
 * and invalidates the whole query cache — a pip install/uninstall + reload can stale
 * ANY server-derived read. The store-off refusal message reads the last failed
 * install/update and the uninstall error.
 */
function usePluginActions(
  refValue: string,
  setActiveAction: (action: ActiveAction | null) => void,
  setResult: (result: ActionResult) => void,
) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [installFailure, setInstallFailure] = useState<unknown>(null);

  const onInstallSuccess = (receipt: MarketplaceInstallResult, verb: string): void => {
    setActiveAction(null);
    setInstallFailure(null);
    setResult({
      verb,
      ref: receipt.ref,
      version: receipt.version,
      notes: receipt.notes,
      advisories: receipt.advisories,
      routes: receipt.routes,
      reload: receipt.reload,
    });
    void queryClient.invalidateQueries();
  };

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
        reload: receipt.reload,
      });
      void queryClient.invalidateQueries();
    },
  });

  // The marketplace install store is unconfigured: an install/update/uninstall
  // answered with a 501 `marketplace-not-configured`. The muted OFF note replaces the
  // write buttons; browse/detail reads never need the store, so they stay untouched.
  const storeRefusal = [installFailure, uninstallMutation.error].find(isFeatureDisabled);
  const storeRefusalMessage =
    storeRefusal !== undefined ? featureDisabledMessage(storeRefusal) : null;

  return {
    onInstalled: (receipt: MarketplaceInstallResult) => {
      onInstallSuccess(receipt, 'Installed');
    },
    onUpdated: (receipt: MarketplaceInstallResult) => {
      onInstallSuccess(receipt, 'Updated');
    },
    onInstallFailed: setInstallFailure,
    /** Forget the failures a dialog recorded, on its close. */
    resetFailures: () => {
      setInstallFailure(null);
      uninstallMutation.reset();
    },
    uninstallMutation,
    storeRefusalMessage,
  };
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
    queryKey: installedMarketplacePluginsKey,
    queryFn: ({ signal }) => api.listInstalledMarketplacePlugins(signal),
    enabled: slash >= 0,
  });
  const advisoriesQuery = useQuery({
    queryKey: marketplaceAdvisoriesKey,
    queryFn: ({ signal }) => api.getMarketplaceAdvisories(signal),
    enabled: slash >= 0,
  });

  const actions = usePluginActions(refValue, setActiveAction, setResult);

  const closeAction = (): void => {
    actions.resetFailures();
    setActiveAction(null);
  };

  return {
    slash,
    detailQuery,
    installedQuery,
    advisoriesQuery,
    actions,
    activeAction,
    openAction: setActiveAction,
    result,
    storeRefusalMessage: actions.storeRefusalMessage,
    closeAction,
  };
}
