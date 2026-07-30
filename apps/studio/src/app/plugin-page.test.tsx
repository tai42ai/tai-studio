/**
 * The plugin catch-all page: deep-link resolution end to end. A page that declares a
 * {@link PluginPageParamsSchema} receives the VALIDATED sub-path `params` and
 * `search`; a schema throw renders a LOUD error card, never a blank view; a sub-path
 * against a schemaless page is a not-found card.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import type { PluginContext, PluginPageProps } from '@tai42/studio-sdk';
import { __resetContributions, __resetPluginHostState } from '@tai42/studio-sdk/testing';

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
            api_version: 1,
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
function FlowsPage({ params, search }: PluginPageProps) {
  return <div data-testid="echo">{JSON.stringify({ params, search })}</div>;
}

describe('plugin deep-link page', () => {
  beforeEach(() => {
    __resetContributions();
    __resetPluginHostState();
  });

  it('forwards the validated sub-path params and search to the page', async () => {
    serveShell(['flows']);
    const register = (ctx: PluginContext): void => {
      ctx.registerPage({
        path: 'flows',
        title: 'Flows',
        component: FlowsPage,
        params: {
          parseParams: (remainder) => ({ flow: remainder }),
          parseSearch: (raw) => ({ dir: typeof raw.dir === 'string' ? raw.dir : 'root' }),
        },
      });
    };
    const importModule = vi.fn(() => Promise.resolve({ register }));

    renderStudio({
      initialPath: '/plugins/acme/flows/myflow?dir=eu',
      sessionKey: 'k-deep',
      importModule,
    });

    const echo = await screen.findByTestId('echo');
    expect(JSON.parse(echo.textContent)).toEqual({
      params: { flow: 'myflow' },
      search: { dir: 'eu' },
    });
  });

  it('renders a loud error card when the sub-path fails the page schema', async () => {
    serveShell(['flows']);
    const register = (ctx: PluginContext): void => {
      ctx.registerPage({
        path: 'flows',
        title: 'Flows',
        component: FlowsPage,
        params: {
          parseParams: (remainder) => {
            if (remainder === '') throw new Error('a flow id is required');
            return { flow: remainder };
          },
        },
      });
    };
    const importModule = vi.fn(() => Promise.resolve({ register }));

    renderStudio({
      initialPath: '/plugins/acme/flows',
      sessionKey: 'k-deep',
      importModule,
    });

    expect(await screen.findByText(/a flow id is required/)).toBeInTheDocument();
    expect(screen.queryByTestId('echo')).toBeNull();
  });

  it('is a not-found card for a sub-path against a schemaless page', async () => {
    serveShell(['flows']);
    const register = (ctx: PluginContext): void => {
      ctx.registerPage({ path: 'flows', title: 'Flows', component: FlowsPage });
    };
    const importModule = vi.fn(() => Promise.resolve({ register }));

    renderStudio({
      initialPath: '/plugins/acme/flows/orphan',
      sessionKey: 'k-deep',
      importModule,
    });

    expect(await screen.findByText('Page not found')).toBeInTheDocument();
  });
});
