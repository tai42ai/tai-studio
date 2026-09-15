import { type ApiClient, ApiError } from '@tai42/api-client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DeleteScopeDialog,
  PinPublicDialog,
  RemoveLastUrlDialog,
  UnpinPublicDialog,
} from './scope-confirm-dialogs';
import { subMcpPattern } from './scope-mapping';
import { renderWithProviders } from './test-utils';

type Stub = Partial<Record<keyof ApiClient, unknown>>;
function stubClient(methods: Stub): ApiClient {
  return methods as unknown as ApiClient;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PinPublicDialog', () => {
  it('pins a plain url on confirm and states the enforcement effect', async () => {
    const user = userEvent.setup();
    const pinRoutePublic = vi.fn().mockResolvedValue({ url: '/c' });
    const onClose = vi.fn();
    renderWithProviders(<PinPublicDialog url="/c" onClose={onClose} />, {
      client: stubClient({ pinRoutePublic }),
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
      { client: stubClient({ pinRoutePublic }) },
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
      client: stubClient({ pinRoutePublic }),
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
      client: stubClient({ unpinPublicRoute }),
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
      client: stubClient({ unpinPublicRoute }),
    });

    await user.click(screen.getByRole('button', { name: 'Unpin' }));
    expect(await screen.findByText("url is not pinned public: '/c'")).toBeInTheDocument();
  });
});

describe('confirm dialog copy states the cascade', () => {
  it('DeleteScopeDialog names the key-policy rewrite', () => {
    renderWithProviders(<DeleteScopeDialog scopeId="s1" itemCount={3} onClose={vi.fn()} />, {
      client: stubClient({}),
    });
    expect(screen.getByText(/removes the scope from every API key/)).toBeInTheDocument();
    expect(screen.getByText(/3 items/)).toBeInTheDocument();
  });

  it('RemoveLastUrlDialog names the key-policy rewrite', () => {
    renderWithProviders(<RemoveLastUrlDialog scopeId="s1" url="/a" onClose={vi.fn()} />, {
      client: stubClient({}),
    });
    expect(screen.getByText(/stripped from every API key/)).toBeInTheDocument();
  });
});
