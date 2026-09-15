/**
 * The shell's feature routes: one typed data route per feature page, plus the
 * plugin-page catch-all. Each hangs off the pathless authed layout. Feature packages
 * export the page component + its typed search contract; the shell owns the routing.
 * The routes are built in per-domain groups so each builder stays small; the tree is
 * flat (path-matched, order-independent), so grouping is a code-shape choice only.
 */
import { schemas } from '@tai42/api-client';
import { AgentsPage } from '@tai42/feature-agents';
import { ConnectorsPage } from '@tai42/feature-connectors';
import { ConversationsPage } from '@tai42/feature-conversations';
import { ExtensionsPage } from '@tai42/feature-extensions';
import { HooksPage } from '@tai42/feature-hooks';
import { InteractionsPage } from '@tai42/feature-interactions';
import { ManifestPage, ServedEndpointsPage } from '@tai42/feature-manifest';
import { MarketplacePage } from '@tai42/feature-marketplace';
import { NotificationsPage } from '@tai42/feature-notifications';
import { ObservabilityPage } from '@tai42/feature-observability';
import { PresetsPage } from '@tai42/feature-presets';
import { SchedulingPage } from '@tai42/feature-scheduling';
import { SettingsPage } from '@tai42/feature-settings';
import { StatesPage } from '@tai42/feature-states';
import { StoragePage } from '@tai42/feature-storage';
import { SystemPage } from '@tai42/feature-system';
import { TemplatesPage } from '@tai42/feature-templates';
import { ToolsPage } from '@tai42/feature-tools';
import type { RouteSearch } from '@tai42/studio-sdk';
import { createRoute, useParams, useSearch } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import type { PluginLoader } from './plugin-loader';
import { PluginPage } from './plugin-page';
import {
  parseEnum,
  parseMarketplaceSearch,
  parseObservabilitySearch,
  parseTags,
} from './route-search';
import type { AuthedLayoutRoute } from './shell-routes';

/** The authoring surfaces: tools, agents, presets, states, extensions. */
function buildWorkbenchRoutes(authedLayout: AuthedLayoutRoute) {
  const toolsRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/tools',
    validateSearch: (search: Record<string, unknown>): RouteSearch<'tools'> => ({
      tool: typeof search.tool === 'string' ? search.tool : undefined,
      tags: parseTags(search.tags),
      q: typeof search.q === 'string' ? search.q : undefined,
    }),
    component: function ToolsRoute(): ReactNode {
      return <ToolsPage search={useSearch({ from: '/authed/tools' })} />;
    },
  });

  const agentsRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/agents',
    component: (): ReactNode => <AgentsPage />,
  });

  const presetsRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/presets',
    validateSearch: (search: Record<string, unknown>): RouteSearch<'presets'> => ({
      preset: typeof search.preset === 'string' ? search.preset : undefined,
    }),
    component: function PresetsRoute(): ReactNode {
      return <PresetsPage search={useSearch({ from: '/authed/presets' })} />;
    },
  });

  const statesRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/states',
    validateSearch: (search: Record<string, unknown>): RouteSearch<'states'> => ({
      state: typeof search.state === 'string' ? search.state : undefined,
      tab: parseEnum(search.tab, ['declaration', 'templates', 'records', 'consumers'] as const),
      subject: typeof search.subject === 'string' ? search.subject : undefined,
      target: typeof search.target === 'string' ? search.target : undefined,
      template: typeof search.template === 'string' ? search.template : undefined,
    }),
    component: function StatesRoute(): ReactNode {
      return <StatesPage search={useSearch({ from: '/authed/states' })} />;
    },
  });

  const extensionsRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/extensions',
    component: (): ReactNode => <ExtensionsPage search={{}} />,
  });

  return [toolsRoute, agentsRoute, presetsRoute, statesRoute, extensionsRoute];
}

/** The activity surfaces: interactions, notifications, conversations, observability. */
function buildActivityRoutes(authedLayout: AuthedLayoutRoute) {
  const interactionsRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/interactions',
    component: (): ReactNode => <InteractionsPage search={{}} />,
  });

  const notificationsRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/notifications',
    component: (): ReactNode => <NotificationsPage search={{}} />,
  });

  const conversationsRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/conversations',
    validateSearch: (search: Record<string, unknown>): RouteSearch<'conversations'> => ({
      route: typeof search.route === 'string' ? search.route : undefined,
      thread: typeof search.thread === 'string' ? search.thread : undefined,
      // Derived from the delivery-status SCHEMA (the single typed source), so a new
      // backend status widens this shared URL parameter automatically — never a stale
      // hand-copied literal list that would silently drop it.
      status: parseEnum(search.status, schemas.conversationDeliveryStatus.options),
      address: typeof search.address === 'string' ? search.address : undefined,
      q: typeof search.q === 'string' ? search.q : undefined,
    }),
    component: function ConversationsRoute(): ReactNode {
      return <ConversationsPage search={useSearch({ from: '/authed/conversations' })} />;
    },
  });

  const observabilityRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/observability',
    validateSearch: parseObservabilitySearch,
    component: function ObservabilityRoute(): ReactNode {
      return <ObservabilityPage search={useSearch({ from: '/authed/observability' })} />;
    },
  });

  return [interactionsRoute, notificationsRoute, conversationsRoute, observabilityRoute];
}

/** The integration surfaces: connectors, served endpoints, hooks, templates, storage, manifest. */
function buildIntegrationRoutes(authedLayout: AuthedLayoutRoute) {
  const connectorsRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/connectors',
    validateSearch: (search: Record<string, unknown>): RouteSearch<'connectors'> => ({
      connection: typeof search.connection === 'string' ? search.connection : undefined,
    }),
    component: function ConnectorsRoute(): ReactNode {
      return <ConnectorsPage search={useSearch({ from: '/authed/connectors' })} />;
    },
  });

  const servedEndpointsRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/served-endpoints',
    component: (): ReactNode => <ServedEndpointsPage search={{}} />,
  });

  const hooksRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/hooks',
    component: (): ReactNode => <HooksPage search={{}} />,
  });

  const templatesRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/templates',
    validateSearch: (search: Record<string, unknown>): RouteSearch<'templates'> => ({
      template: typeof search.template === 'string' ? search.template : undefined,
      q: typeof search.q === 'string' ? search.q : undefined,
    }),
    component: function TemplatesRoute(): ReactNode {
      return <TemplatesPage search={useSearch({ from: '/authed/templates' })} />;
    },
  });

  const storageRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/storage',
    validateSearch: (search: Record<string, unknown>): RouteSearch<'storage'> => ({
      q: typeof search.q === 'string' ? search.q : undefined,
    }),
    component: function StorageRoute(): ReactNode {
      return <StoragePage search={useSearch({ from: '/authed/storage' })} />;
    },
  });

  const manifestRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/manifest',
    component: (): ReactNode => <ManifestPage search={{}} />,
  });

  return [
    connectorsRoute,
    servedEndpointsRoute,
    hooksRoute,
    templatesRoute,
    storageRoute,
    manifestRoute,
  ];
}

/** The administration surfaces + the runtime plugin-page catch-all. */
function buildAdminRoutes(authedLayout: AuthedLayoutRoute, plugins: PluginLoader) {
  const settingsRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/settings',
    component: (): ReactNode => <SettingsPage search={{}} />,
  });

  const systemRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/system',
    component: (): ReactNode => <SystemPage search={{}} />,
  });

  const schedulingRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/scheduling',
    component: (): ReactNode => <SchedulingPage search={{}} />,
  });

  const marketplaceRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/marketplace',
    validateSearch: parseMarketplaceSearch,
    component: function MarketplaceRoute(): ReactNode {
      return <MarketplacePage search={useSearch({ from: '/authed/marketplace' })} />;
    },
  });

  const pluginRoute = createRoute({
    getParentRoute: () => authedLayout,
    path: '/plugins/$pluginId/$',
    // Gate ONLY plugin-page resolution on the load pass; core routes never wait.
    loader: () => plugins.ensureLoaded(),
    component: function PluginRoute(): ReactNode {
      const { pluginId, _splat } = useParams({ from: '/authed/plugins/$pluginId/$' });
      return <PluginPage loader={plugins} pluginId={pluginId} path={_splat ?? ''} />;
    },
  });

  return [settingsRoute, systemRoute, schedulingRoute, marketplaceRoute, pluginRoute];
}

export function buildFeatureRoutes(authedLayout: AuthedLayoutRoute, plugins: PluginLoader) {
  return [
    ...buildWorkbenchRoutes(authedLayout),
    ...buildActivityRoutes(authedLayout),
    ...buildIntegrationRoutes(authedLayout),
    ...buildAdminRoutes(authedLayout, plugins),
  ];
}
