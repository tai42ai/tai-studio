/**
 * Interactions inbox, against the LIVE boot skeleton with the paged pending door
 * and the SSE stream stubbed via `page.route` (the boot skeleton seeds no pending
 * questions). The pending set is served by `GET /api/interactions`; the stream is
 * tail-only and carries no live delta here, so the set is stable.
 *
 * Legs: the floating badge counts the door's pending total and links to the inbox;
 * questions sharing a `group_id` fold into one grouped section; a free-text answer
 * cannot be submitted empty (a one-shot answer, so an empty submit is blocked).
 */
import { test, expect, type Page } from '@playwright/test';
import { seedCredential } from './helpers';

/** Two pending text questions in one group — the paged base the inbox seeds from. */
const PENDING_PAGE = {
  data: {
    items: [
      {
        interaction_id: 'i1',
        group_id: 'grp-1',
        question: 'Approve step one?',
        answer_format: 'text',
        created_at: '2026-08-01T00:00:00.000Z',
        timeout_at: '2026-08-09T00:00:00.000Z',
      },
      {
        interaction_id: 'i2',
        group_id: 'grp-1',
        question: 'Approve step two?',
        answer_format: 'text',
        created_at: '2026-08-01T00:00:01.000Z',
        timeout_at: '2026-08-09T00:00:00.000Z',
      },
    ],
    total: 2,
    page: 1,
    page_size: 50,
    next_page: null,
    truncated: false,
  },
};

/** A tail-only stream: an open SSE body with no backlog and no delta frames. */
const STREAM_BODY = [':keepalive', '', ''].join('\n');

async function stubInbox(page: Page): Promise<void> {
  await seedCredential(page);
  await page.route(
    (url) => url.pathname === '/api/interactions',
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(PENDING_PAGE),
      });
    },
  );
  await page.route(
    (url) => url.pathname === '/api/interactions/stream',
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
        body: STREAM_BODY,
      });
    },
  );
}

test('the floating badge counts pending questions and navigates to the inbox', async ({ page }) => {
  await stubInbox(page);
  // The badge is shell-mounted, so it is visible from any authed page.
  await page.goto('/observability');

  const badge = page.getByTestId('interactions-badge');
  await expect(badge).toBeVisible();
  const link = badge.getByRole('link', { name: '2 pending questions' });
  await expect(link).toBeVisible();

  await link.click();
  await page.waitForURL('**/interactions');
  await expect(page.getByRole('heading', { name: 'Interactions' })).toBeVisible();
});

test('questions sharing a group fold into one grouped section; an empty free-text answer is blocked', async ({
  page,
}) => {
  await stubInbox(page);
  await page.goto('/interactions');

  // The two same-group questions render inside one grouped section, not scattered.
  const group = page
    .getByTestId('interaction-group')
    .filter({ has: page.getByText('Related questions') });
  await expect(group).toBeVisible();
  await expect(group).toContainText('Approve step one?');
  await expect(group).toContainText('Approve step two?');

  // A one-shot text answer cannot be sent empty: Submit is disabled until non-whitespace.
  const firstCard = group.getByTestId('interaction-card').first();
  const submit = firstCard.getByRole('button', { name: 'Submit' });
  await expect(submit).toBeDisabled();
  await firstCard.getByLabel('Your answer').fill('looks good');
  await expect(submit).toBeEnabled();
});
