import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from './test-utils';
import { ServedEndpointsPage } from './ServedEndpointsPage';

const TOOLS = ['echo', 'sum'];

describe('ServedEndpointsPage', () => {
  it('renders the Connections page header', async () => {
    const client = {
      listSubMcp: vi.fn().mockResolvedValue({}),
      listTools: vi.fn().mockResolvedValue(TOOLS),
    };
    renderWithProviders(<ServedEndpointsPage search={{}} />, { client });

    expect(screen.getByRole('heading', { name: 'Served endpoints' })).toBeInTheDocument();
    // The page still owns the sub-MCP listing + create surfaces.
    expect(await screen.findByText('Sub-MCP servers')).toBeInTheDocument();
  });

  it('lists sub-MCP servers with their transport, endpoint, and tools', async () => {
    const client = {
      listSubMcp: vi.fn().mockResolvedValue({ alpha: { tools: ['echo'], transport: 'sse' } }),
      listTools: vi.fn().mockResolvedValue(TOOLS),
    };
    renderWithProviders(<ServedEndpointsPage search={{}} />, { client });

    expect(await screen.findByText('alpha')).toBeInTheDocument();
    // Every table is inside a `ScrollRegion`: a bare table on a 320 px page
    // widens the document instead of scrolling inside its own box.
    for (const table of document.querySelectorAll('table')) {
      expect(table.closest('.tai-scroll-region')).not.toBeNull();
    }
    // The hidden Actions header wears the published clip class, not a partial
    // hand-rolled copy of it that stays selectable and readable to a magnifier.
    expect(screen.getByText('Actions')).toHaveClass('tai-visually-hidden');
    // Transport and the concrete endpoint URL are surfaced per row.
    expect(screen.getByText('sse')).toBeInTheDocument();
    expect(screen.getByText('/app/alpha')).toBeInTheDocument();
    // The tool badge in the list row.
    expect(screen.getAllByText('echo').length).toBeGreaterThan(0);
  });

  it('shows an empty state when there are no sub-MCP servers', async () => {
    const client = {
      listSubMcp: vi.fn().mockResolvedValue({}),
      listTools: vi.fn().mockResolvedValue(TOOLS),
    };
    renderWithProviders(<ServedEndpointsPage search={{}} />, { client });

    expect(await screen.findByText('No sub-MCP servers')).toBeInTheDocument();
  });

  it('surfaces a list fetch failure as a loud error', async () => {
    const client = {
      listSubMcp: vi.fn().mockRejectedValue(new Error('list boom')),
      listTools: vi.fn().mockResolvedValue(TOOLS),
    };
    renderWithProviders(<ServedEndpointsPage search={{}} />, { client });

    expect(await screen.findByText('list boom')).toBeInTheDocument();
  });

  it('creates a sub-MCP from a slug and selected tools on the default transport', async () => {
    const user = userEvent.setup();
    const createSubMcp = vi
      .fn()
      .mockResolvedValue({ slug: 'beta', tools: ['sum'], transport: 'http' });
    const client = {
      listSubMcp: vi.fn().mockResolvedValue({}),
      listTools: vi.fn().mockResolvedValue(TOOLS),
      createSubMcp,
    };
    renderWithProviders(<ServedEndpointsPage search={{}} />, { client });

    await screen.findByRole('checkbox', { name: 'sum' });
    await user.type(screen.getByRole('textbox', { name: 'Slug' }), 'beta');
    await user.click(screen.getByRole('checkbox', { name: 'sum' }));
    await user.click(screen.getByRole('button', { name: /Create sub-MCP/ }));

    await waitFor(() => {
      expect(createSubMcp).toHaveBeenCalledWith('beta', ['sum'], 'http');
    });
  });

  it('creates a sub-MCP on a chosen transport', async () => {
    const user = userEvent.setup();
    const createSubMcp = vi
      .fn()
      .mockResolvedValue({ slug: 'beta', tools: ['sum'], transport: 'sse' });
    const client = {
      listSubMcp: vi.fn().mockResolvedValue({}),
      listTools: vi.fn().mockResolvedValue(TOOLS),
      createSubMcp,
    };
    renderWithProviders(<ServedEndpointsPage search={{}} />, { client });

    await screen.findByRole('checkbox', { name: 'sum' });
    await user.type(screen.getByRole('textbox', { name: 'Slug' }), 'beta');
    await user.click(screen.getByRole('checkbox', { name: 'sum' }));
    await user.click(screen.getByRole('radio', { name: 'SSE' }));
    await user.click(screen.getByRole('button', { name: /Create sub-MCP/ }));

    await waitFor(() => {
      expect(createSubMcp).toHaveBeenCalledWith('beta', ['sum'], 'sse');
    });
  });

  it('warns and confirms before replacing an existing slug', async () => {
    const user = userEvent.setup();
    const createSubMcp = vi
      .fn()
      .mockResolvedValue({ slug: 'alpha', tools: ['sum'], transport: 'http' });
    const client = {
      listSubMcp: vi.fn().mockResolvedValue({ alpha: { tools: ['echo'], transport: 'http' } }),
      listTools: vi.fn().mockResolvedValue(TOOLS),
      createSubMcp,
    };
    renderWithProviders(<ServedEndpointsPage search={{}} />, { client });

    await screen.findByRole('checkbox', { name: 'sum' });
    await user.type(screen.getByRole('textbox', { name: 'Slug' }), 'alpha');
    await user.click(screen.getByRole('checkbox', { name: 'sum' }));

    // The slug already exists — a loud inline warning precedes any write.
    expect(screen.getByText(/already exists\. Registering will replace it/)).toBeInTheDocument();

    // Submitting a swap does NOT write until confirmed.
    await user.click(screen.getByRole('button', { name: /Create sub-MCP/ }));
    const dialog = await screen.findByRole('dialog');
    expect(createSubMcp).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Replace sub-MCP' }));
    await waitFor(() => {
      expect(createSubMcp).toHaveBeenCalledWith('alpha', ['sum'], 'http');
    });
  });

  it('blocks creation with loud field errors and sends no request', async () => {
    const user = userEvent.setup();
    const createSubMcp = vi.fn();
    const client = {
      listSubMcp: vi.fn().mockResolvedValue({}),
      listTools: vi.fn().mockResolvedValue(TOOLS),
      createSubMcp,
    };
    renderWithProviders(<ServedEndpointsPage search={{}} />, { client });

    await screen.findByRole('checkbox', { name: 'sum' });
    await user.click(screen.getByRole('button', { name: /Create sub-MCP/ }));

    expect(await screen.findByText('A slug is required.')).toBeInTheDocument();
    expect(screen.getByText('Select at least one tool for the sub-MCP.')).toBeInTheDocument();
    expect(createSubMcp).not.toHaveBeenCalled();
  });

  it('deletes a sub-MCP only after the confirm dialog', async () => {
    const user = userEvent.setup();
    const deleteSubMcp = vi.fn().mockResolvedValue({ slug: 'alpha', removed: true });
    const client = {
      listSubMcp: vi.fn().mockResolvedValue({ alpha: { tools: ['echo'], transport: 'http' } }),
      listTools: vi.fn().mockResolvedValue(TOOLS),
      deleteSubMcp,
    };
    renderWithProviders(<ServedEndpointsPage search={{}} />, { client });

    await screen.findByText('alpha');
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    const dialog = await screen.findByRole('dialog');
    expect(deleteSubMcp).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(deleteSubMcp).toHaveBeenCalledWith('alpha');
  });

  it('surfaces a tool-list failure inside the create form', async () => {
    const client = {
      listSubMcp: vi.fn().mockResolvedValue({}),
      listTools: vi.fn().mockRejectedValue(new Error('tools boom')),
    };
    renderWithProviders(<ServedEndpointsPage search={{}} />, { client });

    expect(await screen.findByText('tools boom')).toBeInTheDocument();
  });

  it('wears the ghost style on the per-row sub-MCP Delete, not filled danger', async () => {
    const client = {
      listSubMcp: vi.fn().mockResolvedValue({ alpha: { tools: ['echo'], transport: 'sse' } }),
      listTools: vi.fn().mockResolvedValue(TOOLS),
    };
    renderWithProviders(<ServedEndpointsPage search={{}} />, { client });

    await screen.findByText('alpha');
    // The row Delete opens a confirm dialog; it stays low-emphasis in the table, with the
    // danger emphasis reserved for the dialog's own Delete button.
    const rowDelete = screen.getByRole('button', { name: 'Delete' });
    expect(rowDelete).toHaveClass('tai-btn-ghost');
    expect(rowDelete).not.toHaveClass('tai-btn-danger');
  });
});
