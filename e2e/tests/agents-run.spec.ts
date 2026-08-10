/**
 * Agents streaming run, against the LIVE boot skeleton with the agents
 * list + run stream stubbed via `page.route`.
 *
 * Legs: a stream that ends WITHOUT a terminal frame settles as an error (never a
 * green Finished); a user Stop settles as Stopped; the timeline autoscrolls while
 * pinned, detaches on a scroll-up, and offers Jump to latest to re-pin.
 */
import { test, expect, type Page } from '@playwright/test';
import { seedCredential } from './helpers';

const AGENT = {
  name: 'echo-agent',
  description: 'echoes input',
  tool_name: 'echo',
  input_schema: { type: 'object', properties: { query: { type: 'string' } } },
  spec_runnable: false,
};
const RUNS_PATH = '/api/agents/echo-agent/runs';

/** One SSE frame carrying a JSON agent event on its `data` line. */
function frame(event: Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

async function stubAgents(page: Page): Promise<void> {
  await seedCredential(page);
  await page.route(
    (url) => url.pathname === '/api/agents',
    async (route) => {
      await route.fulfill({ json: { data: { items: [AGENT], total: 1 } } });
    },
  );
  await page.route(
    (url) => url.pathname === '/api/agents/spec-runnable',
    async (route) => {
      await route.fulfill({ json: { data: { items: [], total: 0 } } });
    },
  );
}

/** Open the agent's run view and fire the run. */
async function startRun(page: Page): Promise<void> {
  await page.goto('/agents');
  await page
    .getByTestId('agent-row')
    .filter({ hasText: 'echo-agent' })
    .getByRole('button', { name: 'Run' })
    .click();
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
}

test('a stream that ends without a terminal frame settles as an error, not Finished', async ({
  page,
}) => {
  await stubAgents(page);
  // A partial transcript with NO stream.end/stream.error — the connection died mid-run.
  await page.route(
    (url) => url.pathname === RUNS_PATH,
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: frame({ type: 'message_delta', text: 'partial…' }),
      });
    },
  );

  await startRun(page);

  // Settles Failed with the transport message — never a green Finished.
  await expect(page.getByText('connection lost before the run finished')).toBeVisible();
  await expect(page.getByText('Failed', { exact: true })).toBeVisible();
  await expect(page.getByText('Finished', { exact: true })).toHaveCount(0);
});

test('a user Stop settles the run as Stopped', async ({ page }) => {
  await stubAgents(page);
  // Hang the run open so the transcript is truncated by the Stop, not the server.
  await page.route(
    (url) => url.pathname === RUNS_PATH,
    async () => {
      await new Promise(() => {
        /* never resolves — the fetch is torn down by Stop */
      });
    },
  );

  await startRun(page);

  // The run is live; Stop it.
  const stop = page.getByRole('button', { name: 'Stop the run' });
  await expect(stop).toBeVisible();
  await stop.click();

  // A deliberate halt reads as Stopped — not Ready (a fresh run) nor Failed.
  await expect(page.getByText('Stopped', { exact: true })).toBeVisible();
  await expect(page.getByText('Failed', { exact: true })).toHaveCount(0);
});

test('the timeline autoscrolls while pinned, detaches on scroll-up, and re-pins via Jump to latest', async ({
  page,
}) => {
  await stubAgents(page);
  // A long transcript so the timeline overflows its own scroll region.
  const messages = Array.from({ length: 24 }, (_, i) =>
    frame({ type: 'message_final', text: `line ${String(i)}` }),
  );
  await page.route(
    (url) => url.pathname === RUNS_PATH,
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: messages.join('') + frame({ type: 'stream.end' }),
      });
    },
  );

  await startRun(page);

  const timeline = page.getByTestId('agent-timeline');
  await expect(timeline).toBeVisible();
  // Pinned: the tail followed the new content to the bottom.
  await expect
    .poll(async () =>
      timeline.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight <= 32),
    )
    .toBe(true);
  // No jump affordance while pinned.
  await expect(page.getByTestId('timeline-jump')).toHaveCount(0);

  // Scrolling up detaches the follow and reveals Jump to latest.
  await timeline.evaluate((el) => {
    el.scrollTop = 0;
    el.dispatchEvent(new Event('scroll'));
  });
  const jump = page.getByTestId('timeline-jump');
  await expect(jump).toBeVisible();

  // Jump re-pins to the tail and withdraws the affordance.
  await jump.click();
  await expect(page.getByTestId('timeline-jump')).toHaveCount(0);
});
