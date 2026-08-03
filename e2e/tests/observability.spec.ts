/**
 * Observability (PLAN_5), against the LIVE boot skeleton with the monitoring READ
 * endpoints stubbed via `page.route` so the runs table, the trace two-pane, and the
 * metric-sort × filter guard are deterministic (the boot skeleton seeds no runs).
 *
 * Legs: range preset applies; the metric-sort×filter incompatible combo is
 * unreachable from the UI (guarded header) AND repaired from a hand-built URL;
 * a run row opens the two-pane trace with the first ERROR span auto-selected;
 * the waterfall renders bars + a span filter; the summary bar totals; and a run
 * carrying a `fetchError` shows the trace-unavailable badge.
 */
import { test, expect, type Page } from '@playwright/test';
import { seedCredential } from './helpers';

const RUNS_PATH = '/api/observability/runs';
const METRICS_PATH = '/api/observability/metrics';
const TRACE_ID = 'trace-with-error';

/** Two runs: a clean one, and one whose trace read failed (fetchError set). */
const RUNS_PAGE = {
  items: [
    {
      id: 'run-ok',
      traceId: TRACE_ID,
      createdAt: '2026-08-01T00:00:00.000Z',
      tags: ['prod'],
      status: 'success',
      cost: 0.0123,
      latencyMs: 240,
      totalTokens: 512,
      model: 'gpt-x',
      inputPreview: 'hello',
      outputPreview: 'world',
      fetchError: null,
    },
    {
      id: 'run-degraded',
      traceId: 'trace-missing',
      createdAt: '2026-08-01T00:01:00.000Z',
      tags: [],
      status: 'error',
      cost: null,
      latencyMs: null,
      totalTokens: null,
      model: null,
      inputPreview: 'x',
      outputPreview: 'y',
      fetchError: 'monitoring backend timeout',
    },
  ],
  page: 1,
  nextPage: null,
};

/** A three-span trace whose ERROR span is NOT the first root — proves first-error select. */
const TRACE = {
  traceId: TRACE_ID,
  timestamp: '2026-08-01T00:00:00.000Z',
  tags: ['prod'],
  totalCost: 0.0123,
  input: 'hello',
  output: 'world',
  metadata: null,
  availability: 'full',
  fetchError: null,
  spans: [
    {
      id: 'root',
      parentId: null,
      traceId: TRACE_ID,
      name: 'run-root',
      type: 'CHAIN',
      level: null,
      statusMessage: null,
      start: '2026-08-01T00:00:00.000Z',
      end: '2026-08-01T00:00:00.100Z',
      model: null,
      usage: null,
      metadata: null,
      input: 'hello',
      output: 'world',
      nodeId: null,
    },
    {
      id: 'gen',
      parentId: 'root',
      traceId: TRACE_ID,
      name: 'generation-step',
      type: 'GENERATION',
      level: null,
      statusMessage: null,
      start: '2026-08-01T00:00:00.010Z',
      end: '2026-08-01T00:00:00.040Z',
      model: 'gpt-x',
      usage: { input_tokens: 5, output_tokens: 7 },
      metadata: null,
      input: 'p',
      output: 'c',
      nodeId: null,
    },
    {
      id: 'err',
      parentId: 'root',
      traceId: TRACE_ID,
      name: 'failing-tool',
      type: 'TOOL',
      level: 'ERROR',
      statusMessage: 'boom',
      start: '2026-08-01T00:00:00.050Z',
      end: '2026-08-01T00:00:00.060Z',
      model: null,
      usage: null,
      metadata: null,
      input: 'q',
      output: null,
      nodeId: null,
    },
  ],
};

const METRICS = {
  summary: {
    totalRuns: 2,
    totalCost: 0.0123,
    totalTokens: 512,
    averageLatencyMs: 240,
    avgCostPerRun: 0.006,
    avgTokensPerRun: 256,
    timeToFirstTokenMs: null,
  },
  timeSeries: [
    {
      bucket: '2026-08-01T00:00:00.000Z',
      runs: 2,
      cost: 0.0123,
      avgLatencyMs: 240,
      totalTokens: 512,
    },
  ],
  byModel: [{ model: 'gpt-x', calls: 2, cost: 0.0123, totalTokens: 512, avgLatencyMs: 240 }],
  granularity: 'day',
};

/** Stub the monitoring read endpoints before the SPA boots. */
async function stubObservability(page: Page): Promise<void> {
  await seedCredential(page);
  await page.route(
    (url) => url.pathname === METRICS_PATH,
    async (route) => {
      await route.fulfill({ json: { data: METRICS } });
    },
  );
  await page.route(
    (url) => url.pathname === RUNS_PATH,
    async (route) => {
      await route.fulfill({ json: { data: RUNS_PAGE } });
    },
  );
  await page.route(
    (url) => url.pathname === `${RUNS_PATH}/${TRACE_ID}/trace`,
    async (route) => {
      await route.fulfill({ json: { data: TRACE } });
    },
  );
}

test('a range preset writes the relative window to the URL and the picker reflects it', async ({
  page,
}) => {
  await stubObservability(page);
  await page.goto('/observability?tab=tracing');

  const picker = page.getByRole('group', { name: 'Run time range' });
  await expect(picker).toBeVisible();
  await page.getByRole('button', { name: 'Last 7 days' }).click();

  // The preset commits its token to the URL (source of truth) and the status line reads back.
  await expect(page).toHaveURL(/[?&]from=7d(&|$)/);
  await expect(picker.getByRole('button', { name: 'Last 7 days' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(picker.getByRole('status')).toContainText('Last 7 days');
});

test('a metric sort disables the incompatible filters, and an incompatible filter disables the metric-sort header', async ({
  page,
}) => {
  await stubObservability(page);

  // Metric sort active → the level/cost/token/latency filters are withdrawn.
  await page.goto('/observability?tab=tracing&sort=cost&dir=desc');
  await expect(page.getByText(/filters are unavailable while sorting by a metric/i)).toBeVisible();

  // The mirror guard: a status filter set → the Cost metric-sort header cannot be chosen.
  await page.goto('/observability?tab=tracing&status=error');
  const costHeader = page.getByRole('button', { name: 'Cost', exact: true });
  await expect(costHeader).toBeVisible();
  await expect(costHeader).toBeDisabled();
  // A time-only sort stays legal — the When header is never guarded.
  await expect(page.getByRole('button', { name: 'When', exact: true })).toBeEnabled();
});

test('a hand-built metric-sort×filter URL is repaired to a legal query before it is sent', async ({
  page,
}) => {
  await stubObservability(page);
  // A shared/hand-edited URL states the one combo the reader answers 501 to.
  await page.goto('/observability?tab=tracing&sort=cost&dir=desc&status=error');

  // The filter is the more specific intent: the metric sort + its direction are dropped,
  // the status filter kept, and the URL — the source of truth — is rewritten to match.
  await page.waitForURL(/status=error/);
  await expect(page).not.toHaveURL(/sort=cost/);
  await expect(page).not.toHaveURL(/dir=desc/);
  // Repaired to a legal query, the table loads rather than showing the metric-sort note.
  await expect(page.getByTestId('run-row-run-ok')).toBeVisible();
  await expect(page.getByText(/filters are unavailable while sorting by a metric/i)).toHaveCount(0);
});

test('a run carrying a fetchError shows the trace-unavailable badge; a clean run does not', async ({
  page,
}) => {
  await stubObservability(page);
  await page.goto('/observability?tab=tracing');

  const degraded = page.getByTestId('run-row-run-degraded');
  await expect(degraded).toBeVisible();
  await expect(degraded.getByText('trace unavailable')).toBeVisible();
  // The healthy run's row carries no such badge.
  await expect(page.getByTestId('run-row-run-ok').getByText('trace unavailable')).toHaveCount(0);
});

test('opening a run drills into the two-pane trace with the first ERROR span auto-selected', async ({
  page,
}) => {
  await stubObservability(page);
  await page.goto('/observability?tab=tracing');

  await page.getByTestId('run-row-run-ok').click();
  await page.waitForURL(new RegExp(`trace=${TRACE_ID}`));

  // Summary bar totals: overall status error (an error span exists), span count 3.
  const summary = page.getByTestId('trace-summary');
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('error');
  // Assert the span-count on its OWN "Spans" stat cell, not any digit in the bar
  // (the cost total also contains a '3'), so the count assertion is real.
  const spansStat = summary
    .locator('div')
    .filter({ has: page.getByText('Spans', { exact: true }) })
    .last();
  await expect(spansStat.getByText('3', { exact: true })).toBeVisible();

  // Auto-selection lands on the earliest ERROR span — NOT the first root — so the
  // right-hand detail pane opens on `failing-tool`, and its waterfall row is current.
  await expect(page.getByTestId('span-detail')).toContainText('failing-tool');
  await expect(page.locator('[data-testid="waterfall-row"][data-span-id="err"]')).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(
    page.locator('[data-testid="waterfall-row"][data-span-id="root"]'),
  ).not.toHaveAttribute('aria-current', 'true');

  // The waterfall renders a bar per span, and the jump-to-error affordance is offered.
  await expect(page.getByTestId('waterfall-row')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Error' })).toBeVisible();

  // The span filter narrows the tree to matching spans only.
  await page.getByRole('textbox', { name: 'Filter spans' }).fill('generation');
  await expect(page.locator('[data-testid="waterfall-row"][data-span-id="gen"]')).toBeVisible();
  await expect(page.locator('[data-testid="waterfall-row"][data-span-id="err"]')).toHaveCount(0);
});
