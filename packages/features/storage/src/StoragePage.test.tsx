/**
 * Page-level tests for the Storage surface, driven through the exact provider stack
 * the shell supplies at runtime with a stub `ApiClient`. They assert the two honesty
 * layers (absent provider → empty state; present → provider card + browser), the
 * in-memory filter, stat expansion (including `content_type: null`), the upload text
 * and file paths, the download save-helper call, and the delete / delete-directory
 * confirms with their invalidations and verbatim server errors.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiProvider, NavigationProvider, ThemeProvider } from '@tai42/studio-sdk';
import type { ApiClient } from '@tai42/api-client';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StoragePage } from './StoragePage';

const downloadBlob = vi.hoisted(() => vi.fn());

vi.mock('@tai42/studio-sdk', async (importActual) => {
  const actual = await importActual<typeof import('@tai42/studio-sdk')>();
  return { ...actual, downloadBlob };
});

afterEach(() => {
  vi.clearAllMocks();
});

function renderPage(
  ui: ReactElement,
  { client, navigate = vi.fn() }: { client: ApiClient; navigate?: () => void },
): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <QueryClientProvider client={queryClient}>
      <ApiProvider value={client}>
        <ThemeProvider>
          <NavigationProvider value={{ navigate, resolvePath: () => '/x' }}>
            {children}
          </NavigationProvider>
        </ThemeProvider>
      </ApiProvider>
    </QueryClientProvider>
  );
  render(ui, { wrapper });
}

/** A stub client from a partial method set; an unstubbed call throws, flagging it. */
function stubClient(overrides: Partial<ApiClient>): ApiClient {
  return overrides as ApiClient;
}

const presentInfo = { present: true as const, provider: 'FsStorage', module: 'plugin.storage' };

describe('StoragePage', () => {
  it('renders the empty state when no provider is installed', async () => {
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue({ present: false, provider: null, module: null }),
    });
    renderPage(<StoragePage search={{}} />, { client });

    expect(await screen.findByText('Storage needs a storage-provider plugin')).toBeInTheDocument();
    expect(screen.queryByTestId('storage-table')).not.toBeInTheDocument();
  });

  it('surfaces a loud error state when the info request rejects', async () => {
    const client = stubClient({
      getStorageInfo: vi.fn().mockRejectedValue(new Error('storage info boom')),
    });
    renderPage(<StoragePage search={{}} />, { client });

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('storage info boom')).toBeInTheDocument();
  });

  it('renders the provider identity and the resource list', async () => {
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: ['a.txt', 'nested/b.bin'] }),
    });
    renderPage(<StoragePage search={{}} />, { client });

    expect(await screen.findByText('FsStorage')).toBeInTheDocument();
    expect(screen.getByText('plugin.storage')).toBeInTheDocument();
    const table = await screen.findByTestId('storage-table');
    expect(within(table).getByText('a.txt')).toBeInTheDocument();
    expect(within(table).getByText('nested/b.bin')).toBeInTheDocument();
  });

  it('filters the fetched id list in memory without refetching', async () => {
    const list = vi.fn().mockResolvedValue({ resources: ['alpha.txt', 'beta.txt'] });
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: list,
    });
    renderPage(<StoragePage search={{ filter: 'alpha' }} />, { client });

    const table = await screen.findByTestId('storage-table');
    expect(within(table).getByText('alpha.txt')).toBeInTheDocument();
    expect(within(table).queryByText('beta.txt')).not.toBeInTheDocument();
    // The filter is a pure in-memory narrowing: the list is fetched once.
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('commits the filter to the URL on Enter', async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: ['a.txt'] }),
    });
    renderPage(<StoragePage search={{}} />, { client, navigate });

    await screen.findByTestId('storage-table');
    const input = screen.getByLabelText('Filter');
    await user.type(input, 'a.tx{Enter}');
    expect(navigate).toHaveBeenCalledWith('storage', { filter: 'a.tx' });
  });

  it('does not re-navigate when the filter loses focus unchanged', async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: ['a.txt'] }),
    });
    renderPage(<StoragePage search={{ filter: 'a' }} />, { client, navigate });

    await screen.findByTestId('storage-table');
    await user.click(screen.getByLabelText('Filter'));
    // Blur (tab out) with the draft untouched: no redundant history write.
    await user.tab();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('commits the filter to the URL on an edited blur', async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: ['a.txt'] }),
    });
    renderPage(<StoragePage search={{}} />, { client, navigate });

    await screen.findByTestId('storage-table');
    await user.type(screen.getByLabelText('Filter'), 'a.tx');
    await user.tab();
    expect(navigate).toHaveBeenCalledWith('storage', { filter: 'a.tx' });
  });

  it('renders the no-resources empty state when the store is empty', async () => {
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: [] }),
    });
    renderPage(<StoragePage search={{}} />, { client });

    expect(await screen.findByText('No resources')).toBeInTheDocument();
  });

  it('expands a resource stat, including a null content_type', async () => {
    const user = userEvent.setup();
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: ['blob'] }),
      statStorageResource: vi.fn().mockResolvedValue({ id: 'blob', content_type: null }),
    });
    renderPage(<StoragePage search={{}} />, { client });

    await screen.findByTestId('storage-table');
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

  it('uploads a file as base64 via FileReader', async () => {
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
    await user.type(within(dialog).getByLabelText('Resource id'), 'a.txt');
    await user.click(within(dialog).getByRole('radio', { name: 'File' }));

    const file = new File(['abc'], 'a.txt', { type: 'text/plain' });
    await user.upload(within(dialog).getByLabelText('Choose a file'), file);

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

  it('clears a stale file-read error when switching the upload mode to Text', async () => {
    const user = userEvent.setup();
    // A FileReader whose reads always fail, so onFileChange sets the read error.
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
      });
      renderPage(<StoragePage search={{}} />, { client });

      await screen.findByText('No resources');
      await user.click(screen.getByRole('button', { name: 'Upload' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('radio', { name: 'File' }));

      const file = new File(['abc'], 'a.txt', { type: 'text/plain' });
      await user.upload(within(dialog).getByLabelText('Choose a file'), file);
      expect(await within(dialog).findByText('Could not read a.txt')).toBeInTheDocument();

      // Switching to Text must drop the stale file-read error (no file input present).
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

    await screen.findByTestId('storage-table');
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

    await screen.findByTestId('storage-table');
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

    await screen.findByTestId('storage-table');
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

  it('deletes a directory after confirm and invalidates the list', async () => {
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

    await screen.findByTestId('storage-table');
    await user.click(screen.getByRole('button', { name: 'Delete directory' }));
    await user.type(screen.getByLabelText('Directory path'), 'reports');
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
    const message = "directory '.' must be a relative path with no '..' segment";
    const client = stubClient({
      getStorageInfo: vi.fn().mockResolvedValue(presentInfo),
      listStorageResources: vi.fn().mockResolvedValue({ resources: ['a.txt'] }),
      deleteStorageDir: vi.fn().mockRejectedValue(new Error(message)),
    });
    renderPage(<StoragePage search={{}} />, { client });

    await screen.findByTestId('storage-table');
    await user.click(screen.getByRole('button', { name: 'Delete directory' }));
    await user.type(screen.getByLabelText('Directory path'), '.');
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete directory' }));

    expect(await within(dialog).findByText(message)).toBeInTheDocument();
  });
});
