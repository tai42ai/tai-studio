import type { ReferenceHolder } from '@tai42/api-client';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { NavigationProvider } from '../navigation/context';
import type {
  NavigationContextValue,
  PluginSearch,
  RouteSearch,
  RouteToken,
} from '../navigation/types';
import { HolderList, HolderPreview, type HolderPreviewState, previewHolders } from './holder-list';

function makeNav(overrides: Partial<NavigationContextValue> = {}): NavigationContextValue {
  return {
    navigate: vi.fn(),
    resolvePath: vi.fn(<T extends RouteToken>(token: T, search?: RouteSearch<T>) => {
      const qs = search ? new URLSearchParams(search as Record<string, string>).toString() : '';
      return `/${token}${qs ? `?${qs}` : ''}`;
    }),
    navigatePlugin: vi.fn(),
    resolvePluginPath: vi.fn(
      (pluginId: string, pagePath: string, params?: string, search?: PluginSearch) => {
        const remainder = params !== undefined && params !== '' ? `/${params}` : '';
        const qs = search ? new URLSearchParams(search as Record<string, string>).toString() : '';
        return `/plugins/${pluginId}/${pagePath}${remainder}${qs ? `?${qs}` : ''}`;
      },
    ),
    ...overrides,
  };
}

function holder(
  kind: string,
  name: string,
  locator: ReferenceHolder['locator'] = {},
): ReferenceHolder {
  return { kind, name, locator, summary: `${kind} ${name}` };
}

function renderList(
  holders: ReferenceHolder[],
  nav: NavigationContextValue,
  onNavigate?: () => void,
) {
  return render(
    <NavigationProvider value={nav}>
      <HolderList
        holders={holders}
        label="Holders of p"
        lead="Still used by — remove these first:"
        onNavigate={onNavigate}
      />
    </NavigationProvider>,
  );
}

describe('HolderList', () => {
  it('links every core kind to its screen', () => {
    renderList(
      [
        holder('preset', 'a'),
        holder('preset version', 'b', { version: 3 }),
        holder('hook', 'h'),
        holder('schedule', 's'),
        holder('conversation route', 'r'),
        holder('conversation config', 't', { target_kind: 'tool' }),
        holder('tool extensions', 'x'),
        holder('parked interactions', 'pi'),
        holder('answered continuations', 'ac'),
        holder('state records', 'tool1', { count: 2 }),
        holder('pending save', '7', { status: 'pending' }),
        holder('state declaration', 'st'),
        holder('state template', 'doc'),
        holder('api key', 'k'),
        holder('principal', 'u'),
        holder('role', 'ro'),
        holder('setting', 'FLOW_DEFAULT_ON_ERROR'),
      ],
      makeNav(),
    );
    const href = (name: string) => screen.getByRole('link', { name }).getAttribute('href');
    expect(href('preset a')).toBe('/presets?preset=a');
    expect(href('preset version b')).toBe('/presets?preset=b&version=3');
    expect(href('hook h')).toBe('/hooks?hook=h');
    expect(href('schedule s')).toBe('/scheduling?schedule=s');
    expect(href('conversation route r')).toBe('/conversations?route=r');
    expect(href('conversation config t')).toBe('/conversations?config=tool%3At');
    expect(href('tool extensions x')).toBe('/manifest');
    expect(href('parked interactions pi')).toBe('/interactions');
    expect(href('answered continuations ac')).toBe('/interactions');
    expect(href('state records tool1')).toBe('/states');
    expect(href('pending save 7')).toBe('/states');
    expect(href('state declaration st')).toBe('/states?state=st&tab=declaration');
    expect(href('state template doc')).toBe('/states?template=doc');
    expect(href('api key k')).toBe('/settings');
    expect(href('principal u')).toBe('/settings');
    expect(href('role ro')).toBe('/settings');
    expect(href('setting FLOW_DEFAULT_ON_ERROR')).toBe('/settings');
  });

  it('links a plugin kind through the registered resolver, and shows an unresolved kind as text', () => {
    const nav = makeNav({
      resolveHolderLink: (h) =>
        h.kind === 'flow node' ? { pluginId: 'acme', pagePath: 'flows', params: h.name } : null,
    });
    renderList([holder('flow node', 'f', { node: 'n1' }), holder('widget', 'w')], nav);
    expect(screen.getByRole('link', { name: 'flow node f' }).getAttribute('href')).toBe(
      '/plugins/acme/flows/f',
    );
    const list = screen.getByRole('list', { name: 'Holders of p' });
    expect(within(list).getByText('widget w').closest('a')).toBeNull();
  });

  it('shows a plugin kind as text when the host resolves no plugin kinds', () => {
    renderList([holder('flow node', 'f')], makeNav());
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('flow node f')).toBeInTheDocument();
  });

  it('calls onNavigate, then navigates, on a plain click', async () => {
    const order: string[] = [];
    const nav = makeNav({ navigate: vi.fn(() => order.push('navigate')) });
    renderList([holder('hook', 'h')], nav, () => order.push('close'));
    await userEvent.click(screen.getByRole('link', { name: 'hook h' }));
    expect(order).toEqual(['close', 'navigate']);
    expect(nav.navigate).toHaveBeenCalledWith('hooks', { hook: 'h' });
  });

  it('renders the lead and a labelled list inside the scroll region box', () => {
    renderList([holder('hook', 'h')], makeNav());
    expect(screen.getByText('Still used by — remove these first:')).toHaveClass('tai-holder-lead');
    const list = screen.getByRole('list', { name: 'Holders of p' });
    expect(list.parentElement).toHaveClass('tai-scroll-region', 'tai-holder-list');
  });

  it('throws on a core holder missing the locator its kind carries', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderList([holder('preset version', 'b')], makeNav())).toThrow(
      'a “preset version” holder carries no number locator “version”',
    );
  });
});

describe('HolderPreview', () => {
  function renderPreview(state: HolderPreviewState) {
    return render(
      <NavigationProvider value={makeNav()}>
        <HolderPreview
          state={state}
          label="Holders of p"
          lead="Still used by — remove these first:"
        />
      </NavigationProvider>,
    );
  }

  it('shows the checking spinner while loading', () => {
    renderPreview({ status: 'loading' });
    expect(
      screen.getByRole('status', { name: 'Checking what still uses this' }),
    ).toBeInTheDocument();
  });

  it('shows the no-grant line as a status', () => {
    renderPreview({ status: 'no-grant', message: 'outside your access' });
    expect(screen.getByRole('status')).toHaveTextContent('outside your access');
  });

  it('shows a failed read as a muted status line', () => {
    renderPreview({ status: 'error', error: new Error('boom') });
    expect(screen.getByRole('status')).toHaveTextContent('Could not check what uses this: boom');
  });

  it('renders nothing for an empty preview and the list for a non-empty one', () => {
    const { container, unmount } = renderPreview({ status: 'ready', holders: [] });
    expect(container).toBeEmptyDOMElement();
    unmount();
    renderPreview({ status: 'ready', holders: [holder('hook', 'h')] });
    expect(screen.getByRole('list', { name: 'Holders of p' })).toBeInTheDocument();
  });

  it('blocks only on read holders', () => {
    expect(previewHolders({ status: 'loading' })).toEqual([]);
    expect(previewHolders({ status: 'ready', holders: [holder('hook', 'h')] })).toHaveLength(1);
  });
});
