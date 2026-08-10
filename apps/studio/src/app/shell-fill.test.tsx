/**
 * The shell's fill-mode wiring: a routed page that calls `useFillViewport` makes
 * the shell add the `--fill` modifiers to `<main>` and the page wrapper; a page
 * that does not keeps the default content-sized `.tai-page`; and navigating away
 * from a fill page removes the modifiers again.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor, act } from '@testing-library/react';
import type { PluginContext } from '@tai42/studio-sdk';
import { useFillViewport } from '@tai42/studio-sdk';
import { __resetContributions, __resetPluginHostState } from '@tai42/studio-sdk/testing';

import { installServer, renderStudio, server, type HarnessResult } from './test-harness';

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

/** A page that opts into full-height fill mode. */
function CanvasPage() {
  useFillViewport();
  return <div data-testid="canvas" />;
}

/** A page that does not opt in — a normal scrolling page. */
function PlainPage() {
  return <div data-testid="plain" />;
}

function pageWrapper(): HTMLElement {
  const main = document.getElementById('main-content');
  if (main === null) throw new Error('shell <main> not found');
  const wrapper = main.querySelector('.tai-page');
  if (wrapper === null) throw new Error('.tai-page wrapper not found');
  return wrapper as HTMLElement;
}

function shellMain(): HTMLElement {
  const main = document.getElementById('main-content');
  if (main === null) throw new Error('shell <main> not found');
  return main;
}

describe('shell fill mode', () => {
  beforeEach(() => {
    __resetContributions();
    __resetPluginHostState();
  });

  it('adds the fill modifiers when the page opts in', async () => {
    serveShell(['canvas']);
    const register = (ctx: PluginContext): void => {
      ctx.registerPage({ path: 'canvas', title: 'Canvas', component: CanvasPage });
    };
    const importModule = vi.fn(() => Promise.resolve({ register }));

    renderStudio({ initialPath: '/plugins/acme/canvas', sessionKey: 'k-fill', importModule });

    await screen.findByTestId('canvas');
    await waitFor(() => {
      expect(pageWrapper().classList.contains('tai-page--fill')).toBe(true);
      expect(shellMain().classList.contains('tai-shell-main--fill')).toBe(true);
    });
  });

  it('keeps the default page for a page that does not opt in', async () => {
    serveShell(['plain']);
    const register = (ctx: PluginContext): void => {
      ctx.registerPage({ path: 'plain', title: 'Plain', component: PlainPage });
    };
    const importModule = vi.fn(() => Promise.resolve({ register }));

    renderStudio({ initialPath: '/plugins/acme/plain', sessionKey: 'k-plain', importModule });

    await screen.findByTestId('plain');
    expect(pageWrapper().classList.contains('tai-page--fill')).toBe(false);
    expect(shellMain().classList.contains('tai-shell-main--fill')).toBe(false);
  });

  it('removes the fill modifiers when navigating away from the fill page', async () => {
    serveShell(['canvas', 'plain']);
    const register = (ctx: PluginContext): void => {
      ctx.registerPage({ path: 'canvas', title: 'Canvas', component: CanvasPage });
      ctx.registerPage({ path: 'plain', title: 'Plain', component: PlainPage });
    };
    const importModule = vi.fn(() => Promise.resolve({ register }));

    const shell: HarnessResult = renderStudio({
      initialPath: '/plugins/acme/canvas',
      sessionKey: 'k-fill-nav',
      importModule,
    });

    await screen.findByTestId('canvas');
    await waitFor(() => {
      expect(pageWrapper().classList.contains('tai-page--fill')).toBe(true);
    });

    await act(async () => {
      shell.studio.router.history.push('/plugins/acme/plain');
    });

    await screen.findByTestId('plain');
    await waitFor(() => {
      expect(pageWrapper().classList.contains('tai-page--fill')).toBe(false);
      expect(shellMain().classList.contains('tai-shell-main--fill')).toBe(false);
    });
  });
});
