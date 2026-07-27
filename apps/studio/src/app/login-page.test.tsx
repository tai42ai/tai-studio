/**
 * The credential screen's own design-system contract, as opposed to the metadata
 * behaviour `login-renderer.test.tsx` covers: a button method renders as an
 * anchor styled like a secondary `Button`, and that anchor is a CONTROL, so its
 * only boundary may not be the decorative border token.
 */
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';

import { installServer, renderStudio, server } from './test-harness';

installServer();

/** The one shape that renders `buttonLinkStyle`: a `button` method. */
function buttonMethod(): ReturnType<typeof http.get> {
  return http.get('*/api/login/methods', () =>
    HttpResponse.json({
      data: {
        bootstrap: false,
        methods: [
          {
            shape: 'button',
            id: 'oidc',
            label: 'Continue with SSO',
            href: '/api/login/oidc/start',
          },
        ],
      },
    }),
  );
}

describe('login page — control boundaries', () => {
  it('draws every control with the contrast-safe border, never the decorative one', async () => {
    // `tokens.css`: the decorative border sits below 3:1 and "may never be a
    // control's only boundary". Derived over the whole rendered screen, so a
    // control added later is judged by the same rule rather than by a list.
    server.use(buttonMethod());
    renderStudio({ initialPath: '/login' });

    await screen.findByRole('link', { name: /Continue with SSO/ });

    const decorBordered = [
      ...document.body.querySelectorAll<HTMLElement>(
        'button, a[href], input, select, textarea, [role="button"], [role="link"]',
      ),
    ]
      .filter((node) =>
        /(^|;)\s*border:[^;]*var\(--tai-color-border\)/.test(node.getAttribute('style') ?? ''),
      )
      .map((node) => `${node.tagName.toLowerCase()}: ${node.textContent}`);

    expect(decorBordered).toEqual([]);
  });
});
