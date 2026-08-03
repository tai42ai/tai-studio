/**
 * The custom 404. An unknown path must render a shell-styled "page not found" with
 * a link home under the root outlet — never TanStack's bare built-in text with no
 * chrome and no way back. Driven through the REAL composition root over a memory
 * history pointed at a path no route claims.
 */
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';

import { installServer, renderStudio } from './test-harness';

installServer();

describe('custom 404', () => {
  it('renders the not-found message and a link home for an unknown path', async () => {
    renderStudio({ initialPath: '/no-such-page', sessionKey: 'sk-test' });

    expect(await screen.findByText('Page not found')).toBeInTheDocument();
    const home = screen.getByRole('link', { name: 'Go home' });
    expect(home).toHaveAttribute('href', '/');
  });
});
