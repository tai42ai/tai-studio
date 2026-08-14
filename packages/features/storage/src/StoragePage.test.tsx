/**
 * Page-level tests for the Storage surface, driven through the exact provider stack
 * the shell supplies at runtime with a stub `ApiClient`. They assert the two honesty
 * layers (absent provider → empty state; present → provider card + shared explorer),
 * path-shaped ids folding into virtual folders (folder rows/cards, navigation, the
 * per-folder delete-directory action), the in-memory substring filter, stat
 * expansion (including `content_type: null`), the upload text and file paths, the
 * download save-helper call, and the delete / delete-directory confirms with their
 * invalidations and verbatim server errors.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiProvider, NavigationProvider, ThemeProvider } from '@tai42/studio-sdk';
import type { ApiClient } from '@tai42/api-client';
import type { NavigationContextValue, RouteSearch, RouteToken } from '@tai42/studio-sdk';
import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StoragePage } from './StoragePage';

const downloadBlob = vi.hoisted(() => vi.fn());

vi.mock('@tai42/studio-sdk', async (importActual) => {
  const actual = await importActual<typeof import('@tai42/studio-sdk')>();
  return { ...actual, downloadBlob };
});

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
    renderPage(<StoragePage search={{ filter: 'alpha' }} />, { client });

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

    rerender(<StoragePage search={{ filter: 'zulu' }} />);
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
    renderPage(<StoragePage search={{ filter: 'zzz' }} />, { client });

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
    expect(navigate).toHaveBeenCalledWith('storage', { filter: 'a.tx' });
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
    expect(navigate).toHaveBeenCalledWith('storage', { filter: 'a.tx' });
  });

  it('clears the filter param when the box is emptied and committed', async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: ['a.txt', 'zulu.log'] }),
    });
    renderPage(<StoragePage search={{ filter: 'zulu' }} />, { client, navigate });

    await screen.findByRole('table');
    const input = screen.getByRole('textbox', { name: 'Filter resources' });
    await user.clear(input);
    await user.keyboard('{Enter}');
    // Emptying and committing must clear the param so the URL and box cannot drift.
    expect(navigate).toHaveBeenCalledWith('storage', { filter: undefined });
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
    renderPage(<StoragePage search={{ filter: 'a.tx' }} />, { client, navigate });

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
    renderPage(<StoragePage search={{ filter: ' a.tx ' }} />, { client, navigate });

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

  it('expands a resource stat, including a null content_type', async () => {
    const user = userEvent.setup();
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: ['blob'] }),
      statStorageResource: vi.fn().mockResolvedValue({ id: 'blob', content_type: null }),
    });
    renderPage(<StoragePage search={{}} />, { client });

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Stat blob' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/content_type/)).toBeInTheDocument();
    expect(within(dialog).getByText('null')).toBeInTheDocument();
  });

  it('uploads text content and invalidates the list', async () => {
    const user = userEvent.setup();
    const list = vi
      .fn()
      .mockResolvedValueOnce({ resources: [] })
      .mockResolvedValue({ resources: ['note.txt'] });
    const upload = vi.fn().mockResolvedValue({ id: 'note.txt', stored: true });
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: list,
      uploadStorageResource: upload,
    });
    renderPage(<StoragePage search={{}} />, { client });

    await screen.findByText('No resources');
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Resource id'), 'note.txt');
    await user.type(within(dialog).getByLabelText('Text content'), 'hello');
    await user.click(within(dialog).getByRole('button', { name: 'Upload' }));

    await waitFor(() => {
      expect(upload).toHaveBeenCalledWith({ id: 'note.txt', content_text: 'hello' });
    });
    await waitFor(() => {
      expect(list).toHaveBeenCalledTimes(2);
    });
  });

  it('uploads a single picked file as base64 in files mode', async () => {
    const user = userEvent.setup();
    const upload = vi.fn().mockResolvedValue({ id: 'a.txt', stored: true });
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: [] }),
      uploadStorageResource: upload,
    });
    renderPage(<StoragePage search={{}} />, { client });

    await screen.findByText('No resources');
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('radio', { name: 'Files' }));

    // The id is derived from the file name — no separate id field in files mode.
    const file = new File(['abc'], 'a.txt', { type: 'text/plain' });
    await user.upload(within(dialog).getByLabelText('Choose files'), file);

    const submit = within(dialog).getByRole('button', { name: 'Upload' });
    await waitFor(() => {
      expect(submit).toBeEnabled();
    });
    await user.click(submit);

    // `data:text/plain;base64,YWJj` → the door wants only `YWJj`.
    await waitFor(() => {
      expect(upload).toHaveBeenCalledWith({ id: 'a.txt', content_base64: 'YWJj' });
    });
  });

  it('loops the single-item door once per file across a multi-file batch', async () => {
    const user = userEvent.setup();
    const upload = vi.fn().mockResolvedValue({ stored: true });
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: [] }),
      uploadStorageResource: upload,
    });
    renderPage(<StoragePage search={{}} />, { client });

    await screen.findByText('No resources');
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('radio', { name: 'Files' }));
    await user.upload(within(dialog).getByLabelText('Choose files'), [
      new File(['abc'], 'a.txt', { type: 'text/plain' }),
      new File(['def'], 'b.txt', { type: 'text/plain' }),
    ]);
    const submit = within(dialog).getByRole('button', { name: 'Upload' });
    await waitFor(() => {
      expect(submit).toBeEnabled();
    });
    await user.click(submit);

    await waitFor(() => {
      expect(upload).toHaveBeenCalledTimes(2);
    });
    expect(upload).toHaveBeenCalledWith({ id: 'a.txt', content_base64: 'YWJj' });
    expect(upload).toHaveBeenCalledWith({ id: 'b.txt', content_base64: 'ZGVm' });
  });

  it('blocks the whole batch BEFORE any request when a name already exists', async () => {
    const user = userEvent.setup();
    const upload = vi.fn();
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: ['a.txt'] }),
      uploadStorageResource: upload,
    });
    renderPage(<StoragePage search={{}} />, { client });

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('radio', { name: 'Files' }));
    await user.upload(
      within(dialog).getByLabelText('Choose files'),
      new File(['abc'], 'a.txt', { type: 'text/plain' }),
    );

    // The collision is announced, Upload stays disabled, and nothing is sent.
    expect(await within(dialog).findByText(/already exist/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Upload' })).toBeDisabled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('keeps the dialog open on a PARTIAL failure with the failed file still listed', async () => {
    const user = userEvent.setup();
    const upload = vi
      .fn()
      .mockResolvedValueOnce({ stored: true })
      .mockRejectedValueOnce(new Error('quota exceeded'));
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: [] }),
      uploadStorageResource: upload,
    });
    renderPage(<StoragePage search={{}} />, { client });

    await screen.findByText('No resources');
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('radio', { name: 'Files' }));
    await user.upload(within(dialog).getByLabelText('Choose files'), [
      new File(['abc'], 'a.txt', { type: 'text/plain' }),
      new File(['def'], 'b.txt', { type: 'text/plain' }),
    ]);
    const submit = within(dialog).getByRole('button', { name: 'Upload' });
    await waitFor(() => {
      expect(submit).toBeEnabled();
    });
    await user.click(submit);

    // close-on-success-only: the dialog stays open and names the failure verbatim.
    expect(await within(dialog).findByText('quota exceeded')).toBeInTheDocument();
    expect(within(dialog).getByText('Uploaded')).toBeInTheDocument();
    expect(within(dialog).getByText('Failed')).toBeInTheDocument();
  });

  it('surfaces a per-file read error on upload and clears it when switching to Text', async () => {
    const user = userEvent.setup();
    // A FileReader whose reads always fail, so the per-file upload rejects loudly.
    class ErroringFileReader {
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      readAsDataURL(): void {
        setTimeout(() => this.onerror?.(), 0);
      }
    }
    vi.stubGlobal('FileReader', ErroringFileReader);
    try {
      const client = stubClient({
        getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
        listStorageResources: vi.fn().mockResolvedValue({ resources: [] }),
        uploadStorageResource: vi.fn(),
      });
      renderPage(<StoragePage search={{}} />, { client });

      await screen.findByText('No resources');
      await user.click(screen.getByRole('button', { name: 'Upload' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('radio', { name: 'Files' }));

      const file = new File(['abc'], 'a.txt', { type: 'text/plain' });
      await user.upload(within(dialog).getByLabelText('Choose files'), file);
      await user.click(within(dialog).getByRole('button', { name: 'Upload' }));
      expect(await within(dialog).findByText('Could not read a.txt')).toBeInTheDocument();

      // Switching to Text drops the failed batch and its stale error.
      await user.click(within(dialog).getByRole('radio', { name: 'Text' }));
      expect(within(dialog).queryByText('Could not read a.txt')).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('renders an upload server error verbatim', async () => {
    const user = userEvent.setup();
    const message = "exactly one of 'content_text' or 'content_base64' is required";
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: [] }),
      uploadStorageResource: vi.fn().mockRejectedValue(new Error(message)),
    });
    renderPage(<StoragePage search={{}} />, { client });

    await screen.findByText('No resources');
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Resource id'), 'x');
    await user.type(within(dialog).getByLabelText('Text content'), 'y');
    await user.click(within(dialog).getByRole('button', { name: 'Upload' }));

    expect(await within(dialog).findByText(message)).toBeInTheDocument();
  });

  it('downloads a resource through the save helper with the id basename', async () => {
    const user = userEvent.setup();
    const blob = new Blob(['x'], { type: 'application/octet-stream' });
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: ['nested/b.bin'] }),
      downloadStorageResource: vi.fn().mockResolvedValue(blob),
    });
    renderPage(<StoragePage search={{}} />, { client });

    // The resource lives in a folder; open it, then download from inside.
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'nested' }));
    await user.click(screen.getByRole('button', { name: 'Download nested/b.bin' }));

    await waitFor(() => {
      expect(downloadBlob).toHaveBeenCalledWith(blob, 'b.bin');
    });
  });

  it('surfaces a download error loudly', async () => {
    const user = userEvent.setup();
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: ['gone'] }),
      downloadStorageResource: vi.fn().mockRejectedValue(new Error("resource 'gone' not found")),
    });
    renderPage(<StoragePage search={{}} />, { client });

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Download gone' }));

    expect(await screen.findByText("resource 'gone' not found")).toBeInTheDocument();
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('deletes a resource after confirm and invalidates the list', async () => {
    const user = userEvent.setup();
    const list = vi
      .fn()
      .mockResolvedValueOnce({ resources: ['a.txt'] })
      .mockResolvedValue({ resources: [] });
    const del = vi.fn().mockResolvedValue({ id: 'a.txt', deleted: true });
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: list,
      deleteStorageResource: del,
    });
    renderPage(<StoragePage search={{}} />, { client });

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Delete a.txt' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(del).toHaveBeenCalledWith('a.txt');
    });
    await waitFor(() => {
      expect(list).toHaveBeenCalledTimes(2);
    });
  });

  it('deletes a directory from its folder action and invalidates the list', async () => {
    const user = userEvent.setup();
    const list = vi
      .fn()
      .mockResolvedValueOnce({ resources: ['reports/x.csv'] })
      .mockResolvedValue({ resources: [] });
    const delDir = vi.fn().mockResolvedValue({ dir: 'reports', deleted: true });
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: list,
      deleteStorageDir: delDir,
    });
    renderPage(<StoragePage search={{}} />, { client });

    await screen.findByRole('table');
    // The delete-directory action rides the `reports` folder row for its own prefix.
    await user.click(screen.getByRole('button', { name: 'Delete directory reports' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete directory' }));

    await waitFor(() => {
      expect(delDir).toHaveBeenCalledWith('reports');
    });
    await waitFor(() => {
      expect(list).toHaveBeenCalledTimes(2);
    });
  });

  it('renders a rejected directory delete verbatim in the dialog', async () => {
    const user = userEvent.setup();
    const message = "directory 'reports' could not be removed";
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: ['reports/x.csv'] }),
      deleteStorageDir: vi.fn().mockRejectedValue(new Error(message)),
    });
    renderPage(<StoragePage search={{}} />, { client });

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Delete directory reports' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete directory' }));

    expect(await within(dialog).findByText(message)).toBeInTheDocument();
  });
});
