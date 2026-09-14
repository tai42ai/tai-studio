/** Page-level tests for the Storage surface: honesty layers, folder folding,
 * navigation, and the in-memory filter with its URL commit. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiProvider, NavigationProvider, ThemeProvider } from '@tai42/studio-sdk';
import type { ApiClient } from '@tai42/api-client';
import type { NavigationContextValue, RouteSearch, RouteToken } from '@tai42/studio-sdk';
import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StoragePage } from './StoragePage';

afterEach(() => {
  vi.clearAllMocks();
  // The explorer persists its list/card choice per surface; clear it so each test
  // starts in the default list view.
  globalThis.localStorage.clear();
});

function renderPage(
  ui: ReactElement,
  { client, navigate = vi.fn() }: { client: ApiClient; navigate?: () => void },
): RenderResult {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <QueryClientProvider client={queryClient}>
      <ApiProvider value={client}>
        <ThemeProvider>
          <NavigationProvider
            value={{
              navigate,
              resolvePath: () => '/x',
              navigatePlugin: vi.fn(),
              resolvePluginPath: () => '/x',
            }}
          >
            {children}
          </NavigationProvider>
        </ThemeProvider>
      </ApiProvider>
    </QueryClientProvider>
  );
  // The stack is a `wrapper`, not part of the rendered element: RTL's `rerender`
  // replaces only the element, so a wrapper keeps the providers (and the query
  // cache) alive across a re-render with new props.
  return render(ui, { wrapper });
}

/** A stub client from a partial method set; an unstubbed call throws, flagging it. */
function stubClient(overrides: Partial<ApiClient>): ApiClient {
  return overrides as ApiClient;
}

/**
 * The page under a LIVE url: `navigate` writes the committed filter back into the
 * `search` prop, the way the shell's router does, so a commit actually re-renders
 * the page — the only way a remount-on-commit could detach the filter input.
 */
function LiveUrlStoragePage({ client }: { readonly client: ApiClient }): ReactElement {
  const [search, setSearch] = useState<RouteSearch<'storage'>>({});
  const queryClient = useMemo(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    [],
  );
  const value = useMemo(
    () => ({
      navigate: (_token: RouteToken, next?: RouteSearch<'storage'>) => {
        setSearch(next ?? {});
      },
      resolvePath: () => '/x',
      navigatePlugin: vi.fn(),
      resolvePluginPath: () => '/x',
    }),
    [],
  );
  return (
    <QueryClientProvider client={queryClient}>
      <ApiProvider value={client}>
        <ThemeProvider>
          <NavigationProvider value={value as NavigationContextValue}>
            <StoragePage search={search} />
          </NavigationProvider>
        </ThemeProvider>
      </ApiProvider>
    </QueryClientProvider>
  );
}

const presentInfo = { present: true as const, provider: 'FsStorage', module: 'plugin.storage' };

describe('StoragePage', () => {
  it('renders the empty state when no provider is installed', async () => {
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue({ present: false, provider: null, module: null }),
    });
    renderPage(<StoragePage search={{}} />, { client });

    expect(await screen.findByText('Storage needs a storage-provider plugin')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('surfaces a loud error state when the info request rejects', async () => {
    const client = stubClient({
      getStorageInfo: vi.fn().mockRejectedValue(new Error('storage info boom')),
    });
    renderPage(<StoragePage search={{}} />, { client });

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('storage info boom')).toBeInTheDocument();
  });

  it('renders the provider identity and the current-directory listing', async () => {
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: ['a.txt', 'nested/b.bin'] }),
    });
    renderPage(<StoragePage search={{}} />, { client });

    expect(await screen.findByText('FsStorage')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Storage' })).toBeInTheDocument();
    expect(screen.getByText('plugin.storage')).toBeInTheDocument();

    const table = await screen.findByRole('table');
    // The root shows the root-level file plus the virtual folder its nested id
    // implies; the nested id itself lives inside that folder, not at the root.
    expect(within(table).getByText('a.txt')).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: 'nested' })).toBeInTheDocument();
    expect(within(table).queryByText('nested/b.bin')).not.toBeInTheDocument();
  });

  it('navigates into a virtual folder to its members', async () => {
    const user = userEvent.setup();
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: ['a.txt', 'nested/b.bin'] }),
    });
    renderPage(<StoragePage search={{}} />, { client });

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'nested' }));

    const table = screen.getByRole('table');
    expect(within(table).getByText('nested/b.bin')).toBeInTheDocument();
    expect(within(table).queryByText('a.txt')).not.toBeInTheDocument();
  });

  it('renders folders and resources as cards in card view', async () => {
    const user = userEvent.setup();
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: ['a.txt', 'nested/b.bin'] }),
    });
    renderPage(<StoragePage search={{}} />, { client });

    await screen.findByRole('table');
    await user.click(screen.getByRole('radio', { name: 'Card view' }));

    const grid = screen.getByRole('list', { name: 'Resources' });
    expect(within(grid).getByRole('button', { name: 'nested' })).toBeInTheDocument();
    expect(within(grid).getByText('a.txt')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('filters the fetched id list in memory without refetching', async () => {
    const list = vi.fn().mockResolvedValue({ resources: ['alpha.txt', 'beta.txt'] });
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: list,
    });
    renderPage(<StoragePage search={{ q: 'alpha' }} />, { client });

    const table = await screen.findByRole('table');
    expect(within(table).getByText('alpha.txt')).toBeInTheDocument();
    expect(within(table).queryByText('beta.txt')).not.toBeInTheDocument();
    // The filter is a pure in-memory narrowing: the list is fetched once.
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('narrows the listing as the filter box is typed into', async () => {
    const user = userEvent.setup();
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: ['alpha.txt', 'beta.txt'] }),
    });
    renderPage(<StoragePage search={{}} />, { client });

    await screen.findByRole('table');
    await user.type(screen.getByRole('textbox', { name: 'Filter resources' }), 'beta');

    const table = screen.getByRole('table');
    expect(within(table).getByText('beta.txt')).toBeInTheDocument();
    expect(within(table).queryByText('alpha.txt')).not.toBeInTheDocument();
  });

  it('re-seeds the filter box when the url filter changes underneath it', async () => {
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: ['a.txt', 'zulu.log'] }),
    });
    const { rerender } = renderPage(<StoragePage search={{}} />, { client });

    await screen.findByRole('table');
    expect(screen.getByRole('textbox', { name: 'Filter resources' })).toHaveValue('');

    rerender(<StoragePage search={{ q: 'zulu' }} />);
    expect(screen.getByRole('textbox', { name: 'Filter resources' })).toHaveValue('zulu');
    const table = screen.getByRole('table');
    expect(within(table).getByText('zulu.log')).toBeInTheDocument();
    expect(within(table).queryByText('a.txt')).not.toBeInTheDocument();
  });

  it('renders the no-resources empty state when the store is empty', async () => {
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: [] }),
    });
    renderPage(<StoragePage search={{}} />, { client });

    expect(await screen.findByText('No resources')).toBeInTheDocument();
  });

  it('renders the no-match empty state when the filter excludes every resource', async () => {
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: ['alpha.txt', 'beta.txt'] }),
    });
    renderPage(<StoragePage search={{ q: 'zzz' }} />, { client });

    expect(await screen.findByText('No matching resources')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('commits the filter to the URL on Enter', async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: ['a.txt'] }),
    });
    renderPage(<StoragePage search={{}} />, { client, navigate });

    await screen.findByRole('table');
    await user.type(screen.getByRole('textbox', { name: 'Filter resources' }), 'a.tx{Enter}');
    expect(navigate).toHaveBeenCalledWith('storage', { q: 'a.tx' }, { replace: true });
  });

  it('commits the filter to the URL on an edited blur', async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: ['a.txt'] }),
    });
    renderPage(<StoragePage search={{}} />, { client, navigate });

    await screen.findByRole('table');
    await user.type(screen.getByRole('textbox', { name: 'Filter resources' }), 'a.tx');
    await user.tab();
    expect(navigate).toHaveBeenCalledWith('storage', { q: 'a.tx' }, { replace: true });
  });

  it('clears the filter param when the box is emptied and committed', async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: ['a.txt', 'zulu.log'] }),
    });
    renderPage(<StoragePage search={{ q: 'zulu' }} />, { client, navigate });

    await screen.findByRole('table');
    const input = screen.getByRole('textbox', { name: 'Filter resources' });
    await user.clear(input);
    await user.keyboard('{Enter}');
    // Emptying and committing must clear the param so the URL and box cannot drift.
    expect(navigate).toHaveBeenCalledWith('storage', { q: undefined }, { replace: true });
  });

  it('does not navigate while the filter is only being typed', async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: ['alpha.txt', 'beta.txt'] }),
    });
    renderPage(<StoragePage search={{}} />, { client, navigate });

    await screen.findByRole('table');
    // Typing narrows the list live but must not touch the URL until a commit.
    await user.type(screen.getByRole('textbox', { name: 'Filter resources' }), 'beta');
    expect(within(screen.getByRole('table')).queryByText('alpha.txt')).not.toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not push a redundant history entry when Enter repeats the committed filter', async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: ['a.txt'] }),
    });
    renderPage(<StoragePage search={{ q: 'a.tx' }} />, { client, navigate });

    const input = await screen.findByRole('textbox', { name: 'Filter resources' });
    await user.click(input);
    await user.keyboard('{Enter}');
    // The box already shows the committed value, so a bare Enter commits nothing.
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not self-commit a padded deep-link filter on an untouched tab-through blur', async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: ['a.txt'] }),
    });
    renderPage(<StoragePage search={{ q: ' a.tx ' }} />, { client, navigate });

    const input = await screen.findByRole('textbox', { name: 'Filter resources' });
    expect(input).toHaveValue(' a.tx ');
    // Tabbing through the untouched padded box is not a user edit — no navigation.
    await user.click(input);
    await user.tab();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps the keyboard caret in the filter input when Enter commits (WCAG 2.4.3)', async () => {
    const user = userEvent.setup();
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: ['a.txt', 'zulu.log'] }),
    });
    render(<LiveUrlStoragePage client={client} />);

    await screen.findByRole('table');
    // The node identity taken BEFORE the commit is the whole point: a remount on the
    // committed filter would render an identical-looking input while detaching the
    // one the operator was typing into, dropping the caret on `document.body`.
    const input = screen.getByRole('textbox', { name: 'Filter resources' });
    await user.type(input, 'a.tx{Enter}');

    // The commit landed: the URL narrowed the table.
    await waitFor(() => {
      expect(within(screen.getByRole('table')).queryByText('zulu.log')).toBeNull();
    });
    expect(input.isConnected).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(input).toHaveValue('a.tx');
  });
});
