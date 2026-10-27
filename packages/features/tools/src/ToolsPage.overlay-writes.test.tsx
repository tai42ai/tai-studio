/**
 * The tools page's overlay writes against the overlay read they build on: the per-tool
 * Edit and the folder actions are offered only once the tool_meta read has loaded — a
 * merge-patch seeded from an unread overlay would overwrite the stored display name,
 * tags, badges, folder and visibility with blanks — and a failed save shows the
 * server's error in the open dialog, cleared when the dialog closes.
 */
import { ApiError, type ToolMetaOverlay } from '@tai42/api-client';
import { __resetContributions } from '@tai42/studio-sdk/testing';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { toolMetaKey } from './keys';
import { fullProjection, renderWithProviders, type StubApiClient } from './test-utils';
import { ToolsPage } from './ToolsPage';

afterEach(() => {
  __resetContributions();
  globalThis.localStorage.clear();
});

const FILED_OVERLAY: ToolMetaOverlay = {
  folders: [{ id: 'f1', name: 'Weather', parent_id: null }],
  meta: [
    {
      tool_name: 'echo',
      display_name: 'Echo',
      tags: ['alpha'],
      badges: [],
      folder_id: null,
      hidden: null,
    },
  ],
};

function client(over: StubApiClient = {}): StubApiClient {
  return {
    listTools: vi.fn().mockResolvedValue(['echo']),
    listToolTags: vi.fn().mockResolvedValue([]),
    listToolMeta: vi.fn().mockResolvedValue(FILED_OVERLAY),
    upsertToolMeta: vi.fn().mockResolvedValue({}),
    ...over,
  };
}

describe('ToolsPage — overlay writes wait for the overlay read', () => {
  it('offers no Edit while the overlay read is loading, then offers it once it lands', async () => {
    let resolveMeta: (value: ToolMetaOverlay) => void = () => undefined;
    const pending = new Promise<ToolMetaOverlay>((resolve) => {
      resolveMeta = resolve;
    });
    renderWithProviders(<ToolsPage search={{}} />, {
      client: client({ listToolMeta: vi.fn().mockReturnValue(pending) }),
      projection: fullProjection(),
    });

    expect(await screen.findByText('echo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit tool echo' })).toBeNull();

    resolveMeta(FILED_OVERLAY);
    expect(await screen.findByRole('button', { name: 'Edit tool echo' })).toBeInTheDocument();
  });

  it('offers no Edit when the overlay read failed, so no blank save can overwrite it', async () => {
    renderWithProviders(<ToolsPage search={{}} />, {
      client: client({
        listToolMeta: vi.fn().mockRejectedValue(new ApiError('overlay down', 500, 'internal')),
      }),
      projection: fullProjection(),
    });

    expect(await screen.findByText(/overlay down/)).toBeInTheDocument();
    expect(screen.getByText('echo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit tool echo' })).toBeNull();
  });

  it('withdraws the Edit and the folder actions when an overlay re-read fails', async () => {
    const listToolMeta = vi.fn().mockResolvedValue(FILED_OVERLAY);
    const { queryClient } = renderWithProviders(<ToolsPage search={{}} />, {
      client: client({ listToolMeta }),
      projection: fullProjection(),
    });

    expect(
      await screen.findByRole('button', { name: 'Rename folder Weather' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit tool echo' })).toBeInTheDocument();

    listToolMeta.mockRejectedValue(new ApiError('overlay down', 500, 'internal'));
    await queryClient.invalidateQueries({ queryKey: toolMetaKey });

    expect(await screen.findByText(/overlay down/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Rename folder Weather' })).toBeNull();
    });
    expect(screen.queryByRole('button', { name: 'Edit tool echo' })).toBeNull();
  });
});

describe('ToolsPage — a failed overlay save shows its error', () => {
  it('shows the server error in the dialog and clears it when the dialog closes', async () => {
    const user = userEvent.setup();
    const upsertToolMeta = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('database exploded', 500, 'internal'))
      .mockResolvedValue({});
    renderWithProviders(<ToolsPage search={{}} />, {
      client: client({ upsertToolMeta }),
      projection: fullProjection(),
    });

    await user.click(await screen.findByRole('button', { name: 'Edit tool echo' }));
    await screen.findByText('Edit echo');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/database exploded/)).toBeInTheDocument();
    // The form stays so the user can retry.
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByText('Edit echo')).toBeNull();
    });
    await user.click(screen.getByRole('button', { name: 'Edit tool echo' }));
    await screen.findByText('Edit echo');
    expect(screen.queryByText(/database exploded/)).toBeNull();
  });
});
