/**
 * Tests for the app-tool admin card: the fenced reload/remove doors are reachable
 * only for a writer, reload POSTs the kind+name, and remove runs only behind the
 * house confirm. A stub client records each call; the capability projection gates
 * whether the card renders at all.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders, fullProjection, scopedProjection } from './test-utils';
import { ToolAdminCard } from './ToolAdminCard';

const fleetOk = (op: string) => ({
  op,
  reachable: true,
  local_only: true,
  results: [{ name: 'serve-a', outcome: 'applied', payload: null, error: null, detail: null }],
  error: null,
});

describe('ToolAdminCard', () => {
  it('reloads a tool by kind + name through the fenced door', async () => {
    const user = userEvent.setup();
    const reloadTool = vi.fn().mockResolvedValue(fleetOk('reload_tool'));
    renderWithProviders(<ToolAdminCard />, {
      client: { reloadTool },
      projection: fullProjection(),
    });

    await screen.findByText('App tool administration');
    await user.type(screen.getByLabelText('Kind'), 'example_tool');
    await user.type(screen.getByLabelText('Name'), 'echo');
    await user.click(screen.getByRole('button', { name: 'Reload tool' }));

    expect(reloadTool).toHaveBeenCalledWith({ kind: 'example_tool', name: 'echo' });
  });

  it('removes a tool only after the house confirm', async () => {
    const user = userEvent.setup();
    const removeTool = vi.fn().mockResolvedValue(fleetOk('remove_tool'));
    renderWithProviders(<ToolAdminCard />, {
      client: { removeTool },
      projection: fullProjection(),
    });

    await screen.findByText('App tool administration');
    await user.type(screen.getByLabelText('Kind'), 'example_tool');
    await user.type(screen.getByLabelText('Name'), 'echo');
    await user.click(screen.getByRole('button', { name: 'Remove tool' }));

    // The row click opens the confirm but fires nothing — a destructive remove never
    // runs on the button click alone.
    expect(removeTool).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove tool' }));
    expect(removeTool).toHaveBeenCalledWith({ kind: 'example_tool', name: 'echo' });
  });

  it('disables both actions until kind AND name are filled', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ToolAdminCard />, {
      client: { reloadTool: vi.fn() },
      projection: fullProjection(),
    });

    await screen.findByText('App tool administration');
    expect(screen.getByRole('button', { name: 'Reload tool' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove tool' })).toBeDisabled();
    await user.type(screen.getByLabelText('Kind'), 'example_tool');
    // Only kind filled — still disabled (both identifiers are required).
    expect(screen.getByRole('button', { name: 'Reload tool' })).toBeDisabled();
    await user.type(screen.getByLabelText('Name'), 'echo');
    expect(screen.getByRole('button', { name: 'Reload tool' })).toBeEnabled();
  });

  it('is withdrawn entirely for a reader whose projection cannot reach either door', async () => {
    renderWithProviders(<ToolAdminCard />, {
      client: { reloadTool: vi.fn() },
      // A scoped (non-admin) projection with no matching route pattern.
      projection: scopedProjection(),
    });

    // The capability context reaches `ready` (getMe resolves), then the card stays
    // absent — a card whose every door can only refuse is never offered.
    await waitFor(() => {
      expect(screen.queryByText('App tool administration')).not.toBeInTheDocument();
    });
  });

  it('offers only Reload when the projection reaches the reload door but not remove', async () => {
    renderWithProviders(<ToolAdminCard />, {
      client: { reloadTool: vi.fn() },
      // Reload is reachable; Remove is a distinct door this projection cannot reach.
      projection: scopedProjection({ routes: [{ path: '/api/tools/reload', methods: ['POST'] }] }),
    });

    await screen.findByText('App tool administration');
    expect(screen.getByRole('button', { name: 'Reload tool' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove tool' })).not.toBeInTheDocument();
  });

  it('offers only Remove when the projection reaches the remove door but not reload', async () => {
    renderWithProviders(<ToolAdminCard />, {
      client: { removeTool: vi.fn() },
      // Remove is reachable on its OWN route; Reload is not — the card offers Remove alone.
      projection: scopedProjection({ routes: [{ path: '/api/tools/remove', methods: ['POST'] }] }),
    });

    await screen.findByText('App tool administration');
    expect(screen.getByRole('button', { name: 'Remove tool' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reload tool' })).not.toBeInTheDocument();
  });
});
