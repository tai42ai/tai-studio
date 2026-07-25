import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../test-utils';
import { SubMcpTab } from './SubMcpTab';

const TOOLS = ['echo', 'sum'];

describe('SubMcpTab', () => {
  it('lists sub-MCP servers with their tools', async () => {
    const client = {
      listSubMcp: vi.fn().mockResolvedValue({ alpha: { tools: ['echo'] } }),
      listTools: vi.fn().mockResolvedValue(TOOLS),
    };
    renderWithProviders(<SubMcpTab />, { client });

    expect(await screen.findByText('alpha')).toBeInTheDocument();
    // The tool badge in the list row.
    expect(screen.getAllByText('echo').length).toBeGreaterThan(0);
  });

  it('shows an empty state when there are no sub-MCP servers', async () => {
    const client = {
      listSubMcp: vi.fn().mockResolvedValue({}),
      listTools: vi.fn().mockResolvedValue(TOOLS),
    };
    renderWithProviders(<SubMcpTab />, { client });

    expect(await screen.findByText('No sub-MCP servers')).toBeInTheDocument();
  });

  it('surfaces a list fetch failure as a loud error', async () => {
    const client = {
      listSubMcp: vi.fn().mockRejectedValue(new Error('list boom')),
      listTools: vi.fn().mockResolvedValue(TOOLS),
    };
    renderWithProviders(<SubMcpTab />, { client });

    expect(await screen.findByText('list boom')).toBeInTheDocument();
  });

  it('creates a sub-MCP from a slug and selected tools', async () => {
    const user = userEvent.setup();
    const createSubMcp = vi.fn().mockResolvedValue({ slug: 'beta', tools: ['sum'] });
    const client = {
      listSubMcp: vi.fn().mockResolvedValue({}),
      listTools: vi.fn().mockResolvedValue(TOOLS),
      createSubMcp,
    };
    renderWithProviders(<SubMcpTab />, { client });

    await screen.findByRole('checkbox', { name: 'sum' });
    await user.type(screen.getByRole('textbox', { name: 'Slug' }), 'beta');
    await user.click(screen.getByRole('checkbox', { name: 'sum' }));
    await user.click(screen.getByRole('button', { name: /Create sub-MCP/ }));

    await waitFor(() => {
      expect(createSubMcp).toHaveBeenCalledWith('beta', ['sum']);
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
    renderWithProviders(<SubMcpTab />, { client });

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
      listSubMcp: vi.fn().mockResolvedValue({ alpha: { tools: ['echo'] } }),
      listTools: vi.fn().mockResolvedValue(TOOLS),
      deleteSubMcp,
    };
    renderWithProviders(<SubMcpTab />, { client });

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
    renderWithProviders(<SubMcpTab />, { client });

    expect(await screen.findByText('tools boom')).toBeInTheDocument();
  });
});
