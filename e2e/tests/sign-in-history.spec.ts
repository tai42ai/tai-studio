/**
 * Browser history across the doors into `/login`, against the LIVE boot skeleton.
 *
 * An operator who follows a link from another page into a guarded Studio route is
 * sent to `/login`, signs in, and lands on the route they asked for. Both hops
 * REPLACE the current history entry — the guard's redirect replaces the guarded
 * route with `/login`, and the post-sign-in navigation replaces `/login` with the
 * destination — so the Studio holds a single entry and one press of Back returns
 * the browser to the page the operator came from. A push at either hop would leave
 * `/login` (or the guarded route, which redirects to it) one step back, and Back
 * would trap the operator inside the Studio.
 *
 * A stored key the server refuses takes the other door: the first `401` clears the
 * credential and sends the operator to `/login`, again REPLACING the failing route.
 * Back from the login screen then leaves the Studio; a push would leave the guarded
 * route one step back, where the cleared credential sends Back straight to `/login`.
 */
import { expect } from '@playwright/test';

import { needs, test } from '../needs';
import { API_KEY, seedCredential } from './helpers';

// Signs in through the login screen's API-key form, which a stack with an accounts
// provider replaces with its own sign-in.
needs('kind:identity', 'setting:key-login');

/** The page the operator starts on: a document outside the Studio's origin, so the
 * Studio is entered fresh, with no credential in its sessionStorage. */
const OUTSIDE_PAGE = 'data:text/html,<title>Outside</title><h1>Outside the Studio</h1>';

test('Back after signing in leaves the Studio for the page before it, never /login', async ({
  page,
}) => {
  await page.goto(OUTSIDE_PAGE);
  await expect(page.getByRole('heading', { name: 'Outside the Studio' })).toBeVisible();
  const outsideUrl = page.url();

  // The guarded route redirects an unauthenticated operator to the login screen,
  // carrying the requested route as the return target.
  await page.goto('/tools');
  await page.waitForURL((url) => url.pathname === '/login');
  expect(new URL(page.url()).searchParams.get('redirect')).toBe('/tools');

  await page.getByLabel('API key').fill(API_KEY);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname === '/tools');
  await expect(page.getByRole('heading', { level: 1, name: 'Tools' })).toBeVisible();

  // Every document the main frame shows from here on: Back must reach the outside
  // page directly, never passing through the login screen on the way.
  const visited: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) visited.push(frame.url());
  });

  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Outside the Studio' })).toBeVisible();
  expect(page.url()).toBe(outsideUrl);
  expect(visited.filter((url) => url.includes('/login'))).toEqual([]);
});

test('Back from the login screen a refused key was sent to leaves the Studio, never /login', async ({
  page,
}) => {
  await page.goto(OUTSIDE_PAGE);
  await expect(page.getByRole('heading', { name: 'Outside the Studio' })).toBeVisible();
  const outsideUrl = page.url();

  // A stored credential the server holds no key for: the shell boots signed in, so
  // the guard lets the route render, and its first API read is refused with a 401.
  await seedCredential(page, 'sk-e2e-refused-key-not-seeded');
  await page.goto('/tools');
  await page.waitForURL((url) => url.pathname === '/login');
  expect(new URL(page.url()).searchParams.get('redirect')).toBe('/tools');
  await expect(page.getByLabel('API key')).toBeVisible();

  const visited: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) visited.push(frame.url());
  });

  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Outside the Studio' })).toBeVisible();
  expect(page.url()).toBe(outsideUrl);
  expect(visited.filter((url) => url.includes('/login'))).toEqual([]);
});
