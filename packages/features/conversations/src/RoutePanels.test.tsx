/**
 * Tests for the host's route-panel slot on a route's drill-in: a neutral synthetic
 * panel registered for a synthetic channel renders for that channel's routes only, and
 * nothing renders for an api-door route, another channel, a plugin pass that is not
 * ready, or a capability the caller lacks. A throwing panel is contained in the SDK's
 * error card; the catalogue's own failure is surfaced. The panel is registered through
 * the host's real `loadPlugin`, as a plugin bundle registers it.
 */
import type { RoutePanelProps } from '@tai42/studio-sdk';
import { loadPlugin, type PluginLoaderState, setPluginHostState } from '@tai42/studio-sdk/host';
import { __resetContributions, __resetPluginHostState } from '@tai42/studio-sdk/testing';
import { screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { conversationRoutesKey } from './keys';
import { RoutePanels } from './RoutePanels';
import {
  fullProjection,
  makeRoute,
  renderWithProviders,
  scopedProjection,
  type StubApiClient,
} from './test-utils';

function hostState(status: PluginLoaderState['status']): PluginLoaderState {
  return { status, loaded: [], plugins: [], errors: {}, registryError: null };
}

function SyntheticPanel({ pluginId, route }: RoutePanelProps): ReactNode {
  return (
    <p>
      synthetic panel of {pluginId} for {route.route_name} at {route.our_identity}
    </p>
  );
}

function ThrowingPanel(): ReactNode {
  throw new Error('panel blew up');
}

async function registerPanel(
  component: (props: RoutePanelProps) => ReactNode = SyntheticPanel,
  requiredCapabilities?: { routes: string[] },
): Promise<void> {
  await loadPlugin(
    'synthetic_plugin',
    (ctx) => {
      ctx.registerRoutePanel({
        channel: 'synthetic',
        title: 'Synthetic gate',
        component,
        ...(requiredCapabilities === undefined ? {} : { requiredCapabilities }),
      });
    },
    { mounts: {}, declaredRoutePanels: ['synthetic'] },
  );
}

const syntheticRoute = makeRoute({
  route_name: 'relay',
  door: 'channel',
  channel: 'synthetic',
  our_identity: 'relay-ident',
});

function clientWith(routes: unknown[]): StubApiClient {
  return {
    listConversationRoutes: vi.fn().mockResolvedValue({ items: routes, total: routes.length }),
  };
}

afterEach(() => {
  __resetContributions();
  __resetPluginHostState();
});

describe('RoutePanels', () => {
  it('renders the panel contributed for the route channel, in a region named by its title', async () => {
    await registerPanel();
    setPluginHostState(hostState('ready'));
    renderWithProviders(<RoutePanels route="relay" />, {
      client: clientWith([syntheticRoute]),
      projection: fullProjection(),
    });
    const region = await screen.findByRole('region', { name: 'Synthetic gate' });
    expect(region).toHaveTextContent(
      'synthetic panel of synthetic_plugin for relay at relay-ident',
    );
  });

  const hidden: { name: string; route: ReturnType<typeof makeRoute> }[] = [
    { name: 'an api-door route', route: makeRoute({ route_name: 'relay', door: 'api' }) },
    { name: 'another channel', route: makeRoute({ route_name: 'relay', channel: 'other' }) },
  ];
  for (const { name, route } of hidden) {
    it(`renders nothing for ${name}`, async () => {
      await registerPanel();
      setPluginHostState(hostState('ready'));
      const { queryClient } = renderWithProviders(<RoutePanels route="relay" />, {
        client: clientWith([route]),
        projection: fullProjection(),
      });
      await waitFor(() => {
        expect(queryClient.getQueryData(conversationRoutesKey)).toBeDefined();
      });
      expect(screen.queryByRole('region', { name: 'Synthetic gate' })).not.toBeInTheDocument();
    });
  }

  it('renders nothing while the plugin pass is not ready', async () => {
    await registerPanel();
    setPluginHostState(hostState('loading'));
    const { queryClient } = renderWithProviders(<RoutePanels route="relay" />, {
      client: clientWith([syntheticRoute]),
      projection: fullProjection(),
    });
    await waitFor(() => {
      expect(queryClient.getQueryData(conversationRoutesKey)).toBeDefined();
    });
    expect(screen.queryByRole('region', { name: 'Synthetic gate' })).not.toBeInTheDocument();
  });

  it('renders nothing for a caller whose projection misses the panel capability', async () => {
    await registerPanel(SyntheticPanel, { routes: ['/api/synthetic/gates'] });
    setPluginHostState(hostState('ready'));
    const { queryClient } = renderWithProviders(<RoutePanels route="relay" />, {
      client: clientWith([syntheticRoute]),
      projection: scopedProjection({ routes: [{ path: '/api/other', methods: ['GET'] }] }),
    });
    await waitFor(() => {
      expect(queryClient.getQueryData(conversationRoutesKey)).toBeDefined();
    });
    expect(screen.queryByRole('region', { name: 'Synthetic gate' })).not.toBeInTheDocument();
  });

  it('renders the panel for a scoped caller that reaches its capability', async () => {
    await registerPanel(SyntheticPanel, { routes: ['/api/synthetic/gates'] });
    setPluginHostState(hostState('ready'));
    renderWithProviders(<RoutePanels route="relay" />, {
      client: clientWith([syntheticRoute]),
      projection: scopedProjection({
        routes: [{ path: '/api/synthetic/gates/relay-ident', methods: ['GET'] }],
      }),
    });
    expect(await screen.findByRole('region', { name: 'Synthetic gate' })).toBeInTheDocument();
  });

  it('contains a throwing panel in the error card named by its title', async () => {
    await registerPanel(ThrowingPanel);
    setPluginHostState(hostState('ready'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderWithProviders(<RoutePanels route="relay" />, {
      client: clientWith([syntheticRoute]),
      projection: fullProjection(),
    });
    expect(await screen.findByText('Synthetic gate: panel blew up')).toBeInTheDocument();
  });

  it('surfaces the route catalogue failure as an error card with a retry', async () => {
    setPluginHostState(hostState('ready'));
    renderWithProviders(<RoutePanels route="relay" />, {
      client: { listConversationRoutes: vi.fn().mockRejectedValue(new Error('catalogue down')) },
      projection: fullProjection(),
    });
    expect(await screen.findByText('catalogue down')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
