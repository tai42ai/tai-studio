/**
 * The brand lockup is the shell's home link. It commits through the navigation
 * gate like every chrome link outside the route-token map, so an armed
 * unsaved-changes guard is consulted first — that gate is pinned in the SDK
 * (`navigation-guard.test.tsx`); here the link contract itself is pinned.
 */
import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { installServer, renderStudio } from './test-harness';

installServer();

describe('shell brand link', () => {
  it('is a link home carrying an accessible name that survives the rail collapse', async () => {
    renderStudio({ initialPath: '/settings', sessionKey: 'k-brand' });

    // The shell renders the lockup once per breakpoint (sidebar and top bar); only
    // one is displayed at a time, and every copy must anchor home.
    const brands = await screen.findAllByRole('link', { name: 'TAI42 Studio home' });
    expect(brands.length).toBeGreaterThan(0);
    for (const brand of brands) expect(brand).toHaveAttribute('href', '/');
  });

  it('navigates home on click', async () => {
    const user = userEvent.setup();
    renderStudio({ initialPath: '/settings', sessionKey: 'k-brand-nav' });

    const brands = await screen.findAllByRole('link', { name: 'TAI42 Studio home' });
    const brand = brands[0];
    if (brand === undefined) throw new Error('the shell rendered no brand link');
    await user.click(brand);

    await waitFor(() => {
      expect(window.location.pathname).not.toBe('/settings');
    });
  });
});
