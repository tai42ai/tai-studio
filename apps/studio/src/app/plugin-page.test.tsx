/**
 * The plugin catch-all page: deep-link resolution end to end. A page that declares a
 * {@link PluginPageParamsSchema} receives the VALIDATED sub-path `params` and
 * `search`; a schema throw renders a LOUD error card, never a blank view; a sub-path
 * against a schemaless page is a not-found card.
 */
import type { PluginContext, PluginPageProps } from '@tai42/studio-sdk';
import { STUDIO_PLUGIN_API_VERSION } from '@tai42/studio-sdk';
import { __resetContributions, __resetPluginHostState } from '@tai42/studio-sdk/testing';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { installServer, renderStudio, server } from './test-harness';

installServer();

function serveShell(pages: string[]): void {
  server.use(
    http.get('*/api/plugins', () =>
      HttpResponse.json({
        data: [
          {
            name: 'acme',
            version: '1.0.0',
            api_version: STUDIO_PLUGIN_API_VERSION,
            mounts: {},
            entry: 'index.js',
            integrity: { 'index.js': 'sha384-abc' },
            contributions: { tool_panels: {}, pages, settings_tabs: [] },
          },
        ],
      }),
    ),
    http.get('*/api/tools', () => HttpResponse.json({ data: [] })),
    http.get('*/api/tools/tags', () => HttpResponse.json({ data: [] })),
  );
}

/** A page that echoes the params + search it was handed. */
function ReportsPage({ params, search }: PluginPageProps) {
  return <div data-testid="echo">{JSON.stringify({ params, search })}</div>;
}

describe('plugin deep-link page', () => {
  beforeEach(() => {
    __resetContributions();
    __resetPluginHostState();
  });

  it('forwards the validated sub-path params and search to the page', async () => {
    serveShell(['reports']);
    const register = (ctx: PluginContext): void => {
      ctx.registerPage({
        path: 'reports',
        title: 'Reports',
        component: ReportsPage,
        params: {
          parseParams: (remainder) => ({ report: remainder }),
          parseSearch: (raw) => ({ dir: typeof raw.dir === 'string' ? raw.dir : 'root' }),
        },
      });
    };
    const importModule = vi.fn(() => Promise.resolve({ register }));

    renderStudio({
      initialPath: '/plugins/acme/reports/myreport?dir=eu',
      sessionKey: 'k-deep',
      importModule,
    });

    const echo = await screen.findByTestId('echo');
    expect(JSON.parse(echo.textContent)).toEqual({
      params: { report: 'myreport' },
      search: { dir: 'eu' },
    });
  });

  it('renders a loud error card when the sub-path fails the page schema', async () => {
    serveShell(['reports']);
    const register = (ctx: PluginContext): void => {
      ctx.registerPage({
        path: 'reports',
        title: 'Reports',
        component: ReportsPage,
        params: {
          parseParams: (remainder) => {
            if (remainder === '') throw new Error('a report id is required');
            return { report: remainder };
          },
        },
      });
    };
    const importModule = vi.fn(() => Promise.resolve({ register }));

    renderStudio({
      initialPath: '/plugins/acme/reports',
      sessionKey: 'k-deep',
      importModule,
    });

    expect(await screen.findByText(/a report id is required/)).toBeInTheDocument();
    expect(screen.queryByTestId('echo')).toBeNull();
  });

  it('forwards ONLY the rendered plugin’s own entryState slot, never a sibling’s', async () => {
    serveShell(['reports']);
    // The page echoes the entryState it was handed.
    function EntryEcho({ entryState }: PluginPageProps) {
      return <div data-testid="entry">{JSON.stringify(entryState ?? null)}</div>;
    }
    const register = (ctx: PluginContext): void => {
      ctx.registerPage({ path: 'reports', title: 'Reports', component: EntryEcho });
    };
    const importModule = vi.fn(() => Promise.resolve({ register }));

    const { studio } = renderStudio({
      initialPath: '/plugins/acme/reports',
      sessionKey: 'k-entry',
      importModule,
    });

    // Before any state is written the page sees no checkpoint.
    const echo = await screen.findByTestId('entry');
    expect(JSON.parse(echo.textContent)).toBeNull();

    // Write TWO slots onto the current entry: the rendered plugin (acme) and a sibling
    // (beta). The page must receive acme's slot only — never beta's.
    const update = studio.navigation.updatePluginEntryState;
    if (update === undefined) throw new Error('host is missing updatePluginEntryState');
    update('beta', { secret: 'not-yours' });
    update('acme', { selected: 'row-7' });

    await waitFor(() => {
      expect(JSON.parse(screen.getByTestId('entry').textContent)).toEqual({ selected: 'row-7' });
    });
  });

  it('is a not-found card for a sub-path against a schemaless page', async () => {
    serveShell(['reports']);
    const register = (ctx: PluginContext): void => {
      ctx.registerPage({ path: 'reports', title: 'Reports', component: ReportsPage });
    };
    const importModule = vi.fn(() => Promise.resolve({ register }));

    renderStudio({
      initialPath: '/plugins/acme/reports/orphan',
      sessionKey: 'k-deep',
      importModule,
    });

    expect(await screen.findByText('Page not found')).toBeInTheDocument();
  });
});
