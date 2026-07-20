import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, type ApiClient, type AuthRoute } from '@tai42/api-client';

import type { DragEndEvent } from '@dnd-kit/core';

import {
  ScopesMapper,
  PinPublicDialog,
  UnpinPublicDialog,
  DeleteScopeDialog,
  RemoveLastUrlDialog,
  resolveDrop,
  dropFromDragEvent,
  dispatchDrop,
  describeZone,
  scopeGroupsOf,
  subMcpPattern,
} from './ScopesMapper';
import type { ChipData, ZoneRef } from './ScopeItemChip';
import { authRoutesKey, publicRoutesKey, scopesKey, tokensPayloadKey } from './keys';
import { renderWithProviders } from './test-utils';

type Stub = Partial<Record<keyof ApiClient, unknown>>;
function stubClient(methods: Stub): ApiClient {
  return methods as unknown as ApiClient;
}

function routes(...entries: AuthRoute[]): AuthRoute[] {
  return entries;
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

// -- pure resolveDrop --------------------------------------------------------

describe('resolveDrop', () => {
  const routeChip = (origin: ZoneRef): ChipData => ({
    url: '/c',
    itemType: 'route',
    slug: null,
    origin,
    methods: ['GET'],
  });
  const subMcpChip = (origin: ZoneRef): ChipData => ({
    url: '/app/y',
    itemType: 'sub-mcp',
    slug: 'y',
    origin,
    methods: [],
  });

  it('maps a route chip onto a scope with a plain body', () => {
    const action = resolveDrop(routeChip({ kind: 'unassigned' }), {
      zone: { kind: 'scope', scopeId: 's1' },
    });
    expect(action).toEqual({ kind: 'assign', body: { scope_id: 's1', url: '/c' } });
  });

  it('carries the subtree pattern for a sub-MCP chip dropped on a scope', () => {
    const action = resolveDrop(subMcpChip({ kind: 'unassigned' }), {
      zone: { kind: 'scope', scopeId: 's2' },
    });
    expect(action).toEqual({
      kind: 'assign',
      body: { scope_id: 's2', url: '/app/y', pattern: subMcpPattern('y') },
    });
    expect(subMcpPattern('y')).toBe('^/app/y/.*$');
  });

  it('is a no-op for a same-zone drop', () => {
    const action = resolveDrop(routeChip({ kind: 'scope', scopeId: 's1' }), {
      zone: { kind: 'scope', scopeId: 's1' },
    });
    expect(action).toEqual({ kind: 'noop' });
  });

  it('is a no-op when dropped on the unassigned bucket or off any zone', () => {
    expect(
      resolveDrop(routeChip({ kind: 'scope', scopeId: 's1' }), { zone: { kind: 'unassigned' } }),
    ).toEqual({
      kind: 'noop',
    });
    expect(resolveDrop(routeChip({ kind: 'scope', scopeId: 's1' }), null)).toEqual({
      kind: 'noop',
    });
  });

  it('pins a chip dropped on the Public zone (sub-MCP carries its pattern)', () => {
    expect(resolveDrop(routeChip({ kind: 'unassigned' }), { zone: { kind: 'public' } })).toEqual({
      kind: 'pin',
      url: '/c',
    });
    expect(resolveDrop(subMcpChip({ kind: 'unassigned' }), { zone: { kind: 'public' } })).toEqual({
      kind: 'pin',
      url: '/app/y',
      pattern: subMcpPattern('y'),
    });
  });

  it('re-points a public chip into a scope as a plain assign', () => {
    const action = resolveDrop(routeChip({ kind: 'public' }), {
      zone: { kind: 'scope', scopeId: 's1' },
    });
    expect(action).toEqual({ kind: 'assign', body: { scope_id: 's1', url: '/c' } });
  });

  it('is a no-op re-dropping a public chip onto the Public zone', () => {
    expect(resolveDrop(routeChip({ kind: 'public' }), { zone: { kind: 'public' } })).toEqual({
      kind: 'noop',
    });
  });
});

// -- dropFromDragEvent (event adapter) ---------------------------------------

describe('dropFromDragEvent', () => {
  const chip: ChipData = {
    url: '/c',
    itemType: 'route',
    slug: null,
    origin: { kind: 'unassigned' },
    methods: ['GET'],
  };
  const subMcp: ChipData = {
    url: '/app/y',
    itemType: 'sub-mcp',
    slug: 'y',
    origin: { kind: 'unassigned' },
    methods: [],
  };
  const event = (active: ChipData | undefined, zone: ZoneRef | undefined): DragEndEvent =>
    ({
      active: { data: { current: active } },
      over: zone === undefined ? null : { data: { current: { zone } } },
    }) as unknown as DragEndEvent;

  it('maps a route chip dropped over a scope to an assign action', () => {
    expect(dropFromDragEvent(event(chip, { kind: 'scope', scopeId: 's1' }))).toEqual({
      kind: 'assign',
      body: { scope_id: 's1', url: '/c' },
    });
  });

  it('carries the sub-MCP subtree pattern from the event to the assign body', () => {
    expect(dropFromDragEvent(event(subMcp, { kind: 'scope', scopeId: 's2' }))).toEqual({
      kind: 'assign',
      body: { scope_id: 's2', url: '/app/y', pattern: subMcpPattern('y') },
    });
  });

  it('resolves a drop over the Public zone to a pin action', () => {
    expect(dropFromDragEvent(event(chip, { kind: 'public' }))).toEqual({ kind: 'pin', url: '/c' });
  });

  it('is a no-op when released off any zone', () => {
    expect(dropFromDragEvent(event(chip, undefined))).toEqual({ kind: 'noop' });
  });

  it('is a no-op when the active chip carries no payload', () => {
    expect(dropFromDragEvent(event(undefined, { kind: 'scope', scopeId: 's1' }))).toEqual({
      kind: 'noop',
    });
  });
});

describe('dispatchDrop', () => {
  it('runs an assign action through the assign handler only', () => {
    const assign = vi.fn();
    const pin = vi.fn();
    dispatchDrop({ kind: 'assign', body: { scope_id: 's1', url: '/c' } }, { assign, pin });
    expect(assign).toHaveBeenCalledWith({ scope_id: 's1', url: '/c' });
    expect(pin).not.toHaveBeenCalled();
  });

  it('routes a pin action to the pin handler (the confirm), never the assign mutation', () => {
    const assign = vi.fn();
    const pin = vi.fn();
    dispatchDrop({ kind: 'pin', url: '/app/y', pattern: subMcpPattern('y') }, { assign, pin });
    expect(pin).toHaveBeenCalledWith('/app/y', '^/app/y/.*$');
    expect(assign).not.toHaveBeenCalled();
  });

  it('does nothing for a no-op action', () => {
    const assign = vi.fn();
    const pin = vi.fn();
    dispatchDrop({ kind: 'noop' }, { assign, pin });
    expect(assign).not.toHaveBeenCalled();
    expect(pin).not.toHaveBeenCalled();
  });
});

describe('describeZone', () => {
  it('names every zone kind', () => {
    expect(describeZone({ kind: 'scope', scopeId: 's1' })).toBe('scope s1');
    expect(describeZone({ kind: 'unassigned' })).toBe('the Unassigned bucket');
    expect(describeZone({ kind: 'public' })).toBe('the Public zone');
  });
});

describe('scopeGroupsOf', () => {
  it('inverts the {url: scope_id} map into sorted per-scope url lists', () => {
    const groups = scopeGroupsOf({ '/b': 's1', '/a': 's1', '/app/x': 's2' });
    expect(groups.get('s1')).toEqual(['/a', '/b']);
    expect(groups.get('s2')).toEqual(['/app/x']);
  });
});

// -- grouping / rendering ----------------------------------------------------

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
});

// -- create scope ------------------------------------------------------------

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

// -- add-route row -----------------------------------------------------------

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
    await user.type(within(s1).getByLabelText('Pattern for route added to s1'), '^/x/.*$');
    await user.click(within(s1).getByRole('button', { name: 'Add route' }));

    await waitFor(() => {
      expect(addUrlToScope).toHaveBeenCalledWith({
        scope_id: 's1',
        url: '/x',
        pattern: '^/x/.*$',
      });
    });
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

// -- remove url / delete scope -----------------------------------------------

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

// -- public pin / unpin dialogs ----------------------------------------------

describe('PinPublicDialog', () => {
  it('pins a plain url on confirm and states the enforcement effect', async () => {
    const user = userEvent.setup();
    const pinRoutePublic = vi.fn().mockResolvedValue({ url: '/c' });
    const onClose = vi.fn();
    renderWithProviders(<PinPublicDialog url="/c" onClose={onClose} />, {
      client: mapperStub({ pinRoutePublic }),
    });

    expect(screen.getByText(/without API-key authentication/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pin public' }));
    await waitFor(() => {
      expect(pinRoutePublic).toHaveBeenCalledWith({ url: '/c' });
    });
  });

  it('carries the sub-MCP pattern into the pin', async () => {
    const user = userEvent.setup();
    const pinRoutePublic = vi.fn().mockResolvedValue({ url: '/app/y' });
    renderWithProviders(
      <PinPublicDialog url="/app/y" pattern={subMcpPattern('y')} onClose={vi.fn()} />,
      { client: mapperStub({ pinRoutePublic }) },
    );

    await user.click(screen.getByRole('button', { name: 'Pin public' }));
    await waitFor(() => {
      expect(pinRoutePublic).toHaveBeenCalledWith({ url: '/app/y', pattern: '^/app/y/.*$' });
    });
  });

  it('does not pin when cancelled', async () => {
    const user = userEvent.setup();
    const pinRoutePublic = vi.fn();
    renderWithProviders(<PinPublicDialog url="/c" onClose={vi.fn()} />, {
      client: mapperStub({ pinRoutePublic }),
    });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(pinRoutePublic).not.toHaveBeenCalled();
  });
});

describe('UnpinPublicDialog', () => {
  it('unpins on confirm', async () => {
    const user = userEvent.setup();
    const unpinPublicRoute = vi.fn().mockResolvedValue({ url: '/c' });
    renderWithProviders(<UnpinPublicDialog url="/c" onClose={vi.fn()} />, {
      client: mapperStub({ unpinPublicRoute }),
    });

    await user.click(screen.getByRole('button', { name: 'Unpin' }));
    await waitFor(() => {
      expect(unpinPublicRoute).toHaveBeenCalledWith('/c');
    });
  });

  it('surfaces a 404 (already unpinned) VERBATIM', async () => {
    const user = userEvent.setup();
    const unpinPublicRoute = vi
      .fn()
      .mockRejectedValue(new ApiError("url is not pinned public: '/c'", 404));
    renderWithProviders(<UnpinPublicDialog url="/c" onClose={vi.fn()} />, {
      client: mapperStub({ unpinPublicRoute }),
    });

    await user.click(screen.getByRole('button', { name: 'Unpin' }));
    expect(await screen.findByText("url is not pinned public: '/c'")).toBeInTheDocument();
  });
});

// -- pin/unpin surfaced by the mapper ----------------------------------------

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

// -- DeleteScopeDialog / RemoveLastUrlDialog copy -----------------------------

describe('confirm dialog copy states the cascade', () => {
  it('DeleteScopeDialog names the key-policy rewrite', () => {
    renderWithProviders(<DeleteScopeDialog scopeId="s1" itemCount={3} onClose={vi.fn()} />, {
      client: mapperStub(),
    });
    expect(screen.getByText(/removes the scope from every API key/)).toBeInTheDocument();
    expect(screen.getByText(/3 items/)).toBeInTheDocument();
  });

  it('RemoveLastUrlDialog names the key-policy rewrite', () => {
    renderWithProviders(<RemoveLastUrlDialog scopeId="s1" url="/a" onClose={vi.fn()} />, {
      client: mapperStub(),
    });
    expect(screen.getByText(/stripped from every API key/)).toBeInTheDocument();
  });
});
