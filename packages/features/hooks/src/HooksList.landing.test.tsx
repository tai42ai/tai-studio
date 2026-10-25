/**
 * A link that names a hook (`?hook=`) lands on its row: the row is marked
 * `aria-current` on the accent tint, and a name the list does not hold says so.
 */
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HooksList } from './HooksList';
import {
  accountSessionProjection,
  hook,
  renderWithProviders,
  type StubApiClient,
} from './test-utils';

function client(): StubApiClient {
  return {
    listHooks: vi.fn().mockResolvedValue({
      items: [hook({ name: 'notify-event' }), hook({ name: 'relay-alert' })],
      total: 2,
      trigger_auth: {},
    }),
  };
}

describe('HooksList — landing on a named hook', () => {
  it('marks the named row and no other', async () => {
    renderWithProviders(<HooksList topic="" highlight="relay-alert" />, {
      client: client(),
      projection: accountSessionProjection(),
    });
    const edit = await screen.findByRole('button', { name: 'Edit hook relay-alert' });
    expect(edit.closest('tr')).toHaveAttribute('aria-current', 'true');
    expect(
      screen.getByRole('button', { name: 'Edit hook notify-event' }).closest('tr'),
    ).not.toHaveAttribute('aria-current');
    expect(screen.queryByText(/^No hook named/)).not.toBeInTheDocument();
  });

  it('says so when the list holds no hook by that name', async () => {
    renderWithProviders(<HooksList topic="" highlight="gone" />, {
      client: client(),
      projection: accountSessionProjection(),
    });
    expect(await screen.findByText("No hook named 'gone'.")).toBeInTheDocument();
    expect(document.querySelector('tr[aria-current]')).toBeNull();
  });
});
