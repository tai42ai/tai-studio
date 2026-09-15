import { type ApiClient, ApiError, type AuthRoute } from '@tai42/api-client';
import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { authRoutesKey, publicRoutesKey, scopesKey, tokensPayloadKey } from './keys';
import { ScopesMapper } from './ScopesMapper';
import { decorBorderedControls, renderWithProviders } from './test-utils';

type Stub = Partial<Record<keyof ApiClient, unknown>>;
function stubClient(methods: Stub): ApiClient {
  return methods as unknown as ApiClient;
}

// The scope mapper reads only path/methods/mapped; the route catalog's feature-tag
// join fields (tags/summary/action) default here so a fixture states only what it tests.
type RouteInput = Pick<AuthRoute, 'path' | 'methods' | 'mapped'> & Partial<AuthRoute>;
function routes(...entries: RouteInput[]): AuthRoute[] {
  return entries.map((entry) => ({ tags: [], summary: '', action: null, ...entry }));
}

/** A mapper stub: empty catalog/public/sub-MCP unless overridden. */
function mapperStub(overrides: Stub = {}): ApiClient {
  return stubClient({
    listAuthRoutes: vi.fn(() => Promise.resolve([] as AuthRoute[])),
    listPublicRoutes: vi.fn(() => Promise.resolve([] as string[])),
    listSubMcp: vi.fn(() => Promise.resolve({} as Record<string, Record<string, unknown>>)),
    ...overrides,
  });
}

function zoneEl(domId: string): HTMLElement {
  const el = document.querySelector(`[data-zone="${domId}"]`);
  if (el === null) throw new Error(`zone ${domId} not rendered`);
  return el as HTMLElement;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ScopesMapper rendering', () => {
  const scopes = { '/a': 's1', '/b': 's1', '/app/x': 's2' };

  function renderMapper(overrides: Stub = {}, readOnly = false) {
    return renderWithProviders(<ScopesMapper scopes={scopes} readOnly={readOnly} />, {
      client: mapperStub({
        listAuthRoutes: vi.fn(() =>
          Promise.resolve(
            routes(
              { path: '/a', methods: ['GET'], mapped: 's1' },
              { path: '/b', methods: ['GET'], mapped: 's1' },
              { path: '/c', methods: ['POST'], mapped: null },
            ),
          ),
        ),
        listSubMcp: vi.fn(() => Promise.resolve({ x: {}, y: {} })),
        ...overrides,
      }),
    });
  }

  it('groups mapped urls per scope and fills the unassigned bucket with unmapped routes and mounts', async () => {
    renderMapper();
    await screen.findByText('/a');

    const s1 = zoneEl('zone-scope-s1');
    const s2 = zoneEl('zone-scope-s2');
    const unassigned = zoneEl('zone-unassigned');

    expect(within(s1).getByText('/a')).toBeInTheDocument();
    // A chip is a TAG, so it wears the published pair rather than a local copy of
    // the shape — and with it the narrow-viewport wrapping that copy lacked.
    expect(within(s1).getByText('/a').closest('.tai-chip')).toHaveClass('tai-chip-static');
    expect(within(s1).getByText('/b')).toBeInTheDocument();
    expect(within(s2).getByText('/app/x')).toBeInTheDocument();

    // The per-zone header count reflects the chips in each zone.
    expect(within(s1).getByText('2 items')).toBeInTheDocument();
    expect(within(s2).getByText('1 item')).toBeInTheDocument();

    // The unassigned bucket holds EXACTLY the unmapped route (/c) and the
    // undiscovered mount (/app/y) — nothing already mapped.
    expect(within(unassigned).getByText('/c')).toBeInTheDocument();
    expect(within(unassigned).getByText('/app/y')).toBeInTheDocument();
    expect(within(unassigned).queryByText('/app/x')).not.toBeInTheDocument();
    expect(within(unassigned).queryByText('/a')).not.toBeInTheDocument();
  });

  it('never renders a scope zone for the reserved public marker', async () => {
    // A well-behaved backend never lists the marker as a scope, but if one leaks
    // in it must not become a "public" scope zone beside the Public surface.
    renderWithProviders(
      <ScopesMapper scopes={{ '/a': 's1', 'https://pub': 'public' }} readOnly={false} />,
      {
        client: mapperStub({
          listAuthRoutes: vi.fn(() =>
            Promise.resolve(routes({ path: '/a', methods: ['GET'], mapped: 's1' })),
          ),
        }),
      },
    );
    await screen.findByText('/a');
    expect(zoneEl('zone-scope-s1')).toBeInTheDocument();
    expect(document.querySelector('[data-zone="zone-scope-public"]')).toBeNull();
  });

  it('renders public-pinned urls in the Public zone only', async () => {
    renderMapper({ listPublicRoutes: vi.fn(() => Promise.resolve(['/health'])) });
    await screen.findByText('/health');

    const publicZone = zoneEl('zone-public');
    expect(within(publicZone).getByText('/health')).toBeInTheDocument();
    expect(within(zoneEl('zone-unassigned')).queryByText('/health')).not.toBeInTheDocument();
    expect(within(zoneEl('zone-scope-s1')).queryByText('/health')).not.toBeInTheDocument();
  });

  it('hides every mutation affordance in readOnly mode', async () => {
    renderMapper({ listPublicRoutes: vi.fn(() => Promise.resolve(['/health'])) }, true);

    await screen.findByText('/a');
    expect(screen.queryByRole('button', { name: 'Add scope' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete scope s1' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Add route to s1')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove URL /a' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unpin /health' })).not.toBeInTheDocument();
  });
  it('draws the chip remove control with the contrast-safe border, never the decorative one', async () => {
    // `tokens.css`: the decorative border sits below 3:1 and may never be a
    // control's only boundary. Derived over the whole rendered mapper.
    renderWithProviders(<ScopesMapper scopes={{ '/a': 's1' }} readOnly={false} />, {
      client: mapperStub(),
    });

    await screen.findByText('/a');
    expect(decorBorderedControls(document.body)).toEqual([]);
  });
});

describe('ScopesMapper create-scope', () => {
  function renderMapper(overrides: Stub = {}) {
    return renderWithProviders(<ScopesMapper scopes={{ '/a': 's1' }} readOnly={false} />, {
      client: mapperStub({
        listAuthRoutes: vi.fn(() =>
          Promise.resolve(routes({ path: '/a', methods: ['GET'], mapped: 's1' })),
        ),
        ...overrides,
      }),
    });
  }

  it('rejects an invalid scope name (charset)', async () => {
    const user = userEvent.setup();
    renderMapper();
    await screen.findByText('/a');

    await user.type(screen.getByLabelText('New scope name'), 'bad/name');
    await user.click(screen.getByRole('button', { name: 'Add scope' }));

    expect(await screen.findByText(/only letters, numbers/)).toBeInTheDocument();
  });

  it('rejects a duplicate scope name', async () => {
    const user = userEvent.setup();
    renderMapper();
    await screen.findByText('/a');

    await user.type(screen.getByLabelText('New scope name'), 's1');
    await user.click(screen.getByRole('button', { name: 'Add scope' }));

    expect(await screen.findByText(/already exists/)).toBeInTheDocument();
  });

  it('adds a pending scope, then persists it on the first assignment', async () => {
    const user = userEvent.setup();
    const addUrlToScope = vi.fn().mockResolvedValue({ scope_id: 'ops', url: '/ops' });
    renderMapper({ addUrlToScope });
    await screen.findByText('/a');

    await user.type(screen.getByLabelText('New scope name'), 'ops');
    await user.click(screen.getByRole('button', { name: 'Add scope' }));

    // The pending zone appears with its persist-on-assign note.
    expect(await screen.findByText('Saved when the first item is assigned.')).toBeInTheDocument();

    // Assigning the first route persists it…
    await user.type(screen.getByLabelText('Add route to ops'), '/ops');
    await user.click(within(zoneEl('zone-scope-ops')).getByRole('button', { name: 'Add route' }));
    await waitFor(() => {
      expect(addUrlToScope).toHaveBeenCalledWith({ scope_id: 'ops', url: '/ops' });
    });
    // …and the scope leaves the pending set.
    await waitFor(() => {
      expect(screen.queryByText('Saved when the first item is assigned.')).not.toBeInTheDocument();
    });
  });
});

describe('ScopesMapper add-route row', () => {
  function renderMapper(overrides: Stub = {}) {
    return renderWithProviders(<ScopesMapper scopes={{ '/a': 's1' }} readOnly={false} />, {
      client: mapperStub({
        listAuthRoutes: vi.fn(() =>
          Promise.resolve(routes({ path: '/a', methods: ['GET'], mapped: 's1' })),
        ),
        ...overrides,
      }),
    });
  }

  it('validates the leading slash', async () => {
    const user = userEvent.setup();
    const addUrlToScope = vi.fn();
    renderMapper({ addUrlToScope });
    await screen.findByText('/a');

    await user.type(screen.getByLabelText('Add route to s1'), 'noslash');
    await user.click(within(zoneEl('zone-scope-s1')).getByRole('button', { name: 'Add route' }));

    expect(await screen.findByText(/must start with/)).toBeInTheDocument();
    expect(addUrlToScope).not.toHaveBeenCalled();
  });

  it('sends a pattern when the dynamic-pattern toggle is on', async () => {
    const user = userEvent.setup();
    const addUrlToScope = vi.fn().mockResolvedValue({ scope_id: 's1', url: '/x' });
    renderMapper({ addUrlToScope });
    await screen.findByText('/a');

    const s1 = zoneEl('zone-scope-s1');
    await user.type(within(s1).getByLabelText('Add route to s1'), '/x');
    await user.click(within(s1).getByRole('checkbox', { name: 'Dynamic pattern' }));
    await user.type(within(s1).getByLabelText('Pattern (regex) for route added to s1'), '^/x/.*$');
    await user.click(within(s1).getByRole('button', { name: 'Add route' }));

    await waitFor(() => {
      expect(addUrlToScope).toHaveBeenCalledWith({
        scope_id: 's1',
        url: '/x',
        pattern: '^/x/.*$',
      });
    });
  });

  it('names every disambiguated control with the words its own label shows (WCAG 2.5.3)', async () => {
    // A `Field`'s `<label for>` is what the operator READS; an `aria-label` on the
    // child REPLACES it as the accessible name. Where a scope-disambiguated name is
    // needed, that name must still carry the visible label's words, or speech input
    // ("Pattern") reaches nothing. Derived over the rendered zone rather than a list
    // of call sites, so a control added later is judged by the same rule.
    const user = userEvent.setup();
    renderMapper({});
    await screen.findByText('/a');

    const s1 = zoneEl('zone-scope-s1');
    await user.click(within(s1).getByRole('checkbox', { name: 'Dynamic pattern' }));

    const pairs = [...s1.querySelectorAll<HTMLElement>('[aria-label][id]')]
      .map((node) => ({
        node,
        visible: s1.querySelector<HTMLLabelElement>(`label[for="${node.id}"]`)?.textContent,
        name: node.getAttribute('aria-label') ?? '',
      }))
      .filter(
        (pair): pair is { node: HTMLElement; visible: string; name: string } =>
          typeof pair.visible === 'string',
      );

    // The gate is only as good as what it looks at: an empty list would pass.
    expect(pairs.map((pair) => pair.visible).sort()).toEqual(['Add route', 'Pattern (regex)']);
    expect(
      pairs.filter((pair) => !pair.name.includes(pair.visible)).map((pair) => pair.name),
    ).toEqual([]);
  });

  it('surfaces a 4xx from the assignment VERBATIM in the error strip', async () => {
    const user = userEvent.setup();
    const addUrlToScope = vi.fn().mockRejectedValue(new ApiError('scope_id must be a string', 400));
    renderMapper({ addUrlToScope });
    await screen.findByText('/a');

    await user.type(screen.getByLabelText('Add route to s1'), '/x');
    await user.click(within(zoneEl('zone-scope-s1')).getByRole('button', { name: 'Add route' }));

    expect(await screen.findByText('scope_id must be a string')).toBeInTheDocument();
  });

  it('invalidates the three source keys on a successful map', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
    const addUrlToScope = vi.fn().mockResolvedValue({ scope_id: 's1', url: '/x' });
    renderMapper({ addUrlToScope });
    await screen.findByText('/a');

    await user.type(screen.getByLabelText('Add route to s1'), '/x');
    await user.click(within(zoneEl('zone-scope-s1')).getByRole('button', { name: 'Add route' }));
    await waitFor(() => {
      expect(addUrlToScope).toHaveBeenCalled();
    });

    const invalidated = spy.mock.calls.map((call) => call[0]?.queryKey);
    expect(invalidated).toContainEqual(scopesKey);
    expect(invalidated).toContainEqual(authRoutesKey);
    expect(invalidated).toContainEqual(publicRoutesKey);
    // A scope assignment changes no key policy, so the token payloads are NOT
    // invalidated on this path (unlike remove-url / delete-scope).
    expect(invalidated).not.toContainEqual(tokensPayloadKey);
  });
});

describe('ScopesMapper remove/delete', () => {
  it('removes a non-last url without a confirm and invalidates the token payloads', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
    const removeUrlFromScope = vi.fn().mockResolvedValue({ url: '/a' });
    renderWithProviders(<ScopesMapper scopes={{ '/a': 's1', '/b': 's1' }} readOnly={false} />, {
      client: mapperStub({
        removeUrlFromScope,
        listAuthRoutes: vi.fn(() =>
          Promise.resolve(
            routes(
              { path: '/a', methods: ['GET'], mapped: 's1' },
              { path: '/b', methods: ['GET'], mapped: 's1' },
            ),
          ),
        ),
      }),
    });
    await screen.findByText('/a');

    await user.click(screen.getByRole('button', { name: 'Remove URL /a' }));
    await waitFor(() => {
      expect(removeUrlFromScope).toHaveBeenCalledWith({ url: '/a' });
    });
    // Unmapping a url cascades key policies, so the token payloads refetch too.
    await waitFor(() => {
      const invalidated = spy.mock.calls.map((call) => call[0]?.queryKey);
      expect(invalidated).toContainEqual(tokensPayloadKey);
    });
  });

  it('confirms removing the last url of a scope before unmapping it', async () => {
    const user = userEvent.setup();
    const removeUrlFromScope = vi.fn().mockResolvedValue({ url: '/a' });
    renderWithProviders(<ScopesMapper scopes={{ '/a': 's1' }} readOnly={false} />, {
      client: mapperStub({
        removeUrlFromScope,
        listAuthRoutes: vi.fn(() =>
          Promise.resolve(routes({ path: '/a', methods: ['GET'], mapped: 's1' })),
        ),
      }),
    });
    await screen.findByText('/a');

    await user.click(screen.getByRole('button', { name: 'Remove URL /a' }));
    // A confirm dialog naming the cascade appears first.
    expect(await screen.findByText(/last URL of scope/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove URL' }));
    await waitFor(() => {
      expect(removeUrlFromScope).toHaveBeenCalledWith({ url: '/a' });
    });
  });

  it('deletes a scope after confirming and invalidates the token payloads too', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
    const removeScope = vi.fn().mockResolvedValue({ scope_id: 's1', deleted_keys: 2 });
    renderWithProviders(<ScopesMapper scopes={{ '/a': 's1' }} readOnly={false} />, {
      client: mapperStub({
        removeScope,
        listAuthRoutes: vi.fn(() =>
          Promise.resolve(routes({ path: '/a', methods: ['GET'], mapped: 's1' })),
        ),
      }),
    });
    await screen.findByText('/a');

    await user.click(screen.getByRole('button', { name: 'Delete scope s1' }));
    expect(await screen.findByText(/removes the scope from every API key/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete scope' }));
    await waitFor(() => {
      expect(removeScope).toHaveBeenCalledWith('s1');
    });

    const invalidated = spy.mock.calls.map((call) => call[0]?.queryKey);
    expect(invalidated).toContainEqual(tokensPayloadKey);
  });
});

describe('ScopesMapper public surface interactions', () => {
  it('opens the unpin confirm from a public chip and unpins verbatim on 404', async () => {
    const user = userEvent.setup();
    const unpinPublicRoute = vi
      .fn()
      .mockRejectedValue(new ApiError("url is not pinned public: '/health'", 404));
    renderWithProviders(<ScopesMapper scopes={{ '/a': 's1' }} readOnly={false} />, {
      client: mapperStub({
        unpinPublicRoute,
        listAuthRoutes: vi.fn(() =>
          Promise.resolve(routes({ path: '/a', methods: ['GET'], mapped: 's1' })),
        ),
        listPublicRoutes: vi.fn(() => Promise.resolve(['/health'])),
      }),
    });
    await screen.findByText('/health');

    await user.click(screen.getByRole('button', { name: 'Unpin /health' }));
    await user.click(screen.getByRole('button', { name: 'Unpin' }));
    expect(await screen.findByText("url is not pinned public: '/health'")).toBeInTheDocument();
  });
});
