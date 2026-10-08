/**
 * Observability, against the LIVE boot skeleton, whose monitoring backend is the
 * seeded neutral demo backend (`e2e/docs-demo/monitoring-plugin`, loaded by
 * `boot/manifest.yml`).
 *
 * Two kinds of leg:
 * - live — no `page.route` on the monitoring reads: the served capabilities are the
 *   demo reader's own declaration (every sort combines with every filter), the runs
 *   list is the seeded dataset, and a span's Resolved toggle goes through the real
 *   resolved route — the newest seeded trace's `summarise` step resolves to the seeded
 *   answer and its `follow_up` step references a record the backend does not hold
 *   (the 502 panel). These need the seeded backend this suite boots, so a target run
 *   skips them.
 * - forced — the monitoring reads are fulfilled via `page.route` with fixed payloads,
 *   for the states the seeded backend does not produce: a declared sort × filter
 *   incompatibility (the Langfuse reader's real served declaration, the api-client
 *   fixture), a trace whose first ERROR span is auto-selected, the waterfall and its
 *   span filter, the summary bar, the by-model card's unavailable state, and by-model
 *   captions wider than a phone's screen.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, type Page } from '@playwright/test';

import { needs, test } from '../needs';
import { seedCredential } from './helpers';

needs();

const RUNS_PATH = '/api/observability/runs';
const METRICS_PATH = '/api/observability/metrics';
const CAPABILITIES_PATH = '/api/observability/capabilities';
const TRACE_ID = 'trace-with-error';

/** Two runs: a clean success, and one in error status with no cost/latency/tokens. */
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
      inputPreview: 'hello',
      outputPreview: 'world',
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
      inputPreview: 'x',
      outputPreview: 'y',
    },
  ],
  page: 1,
  nextPage: null,
};

/**
 * The Langfuse reader's served capabilities: its metric sorts cannot carry the status /
 * cost / token / latency / version filters. Read from the api-client fixture that holds
 * that reader's real `capabilities_view` output, so the guard legs react to a declaration
 * an actual backend serves.
 */
const CAPABILITIES: unknown = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        '../../packages/api-client/fixtures/redacted/observability-capabilities.json',
        import.meta.url,
      ),
    ),
    'utf8',
  ),
);

/** A three-span trace whose ERROR span is NOT the first root — proves first-error select. */
const TRACE = {
  traceId: TRACE_ID,
  timestamp: '2026-08-01T00:00:00.000Z',
  tags: ['prod'],
  totalCost: 0.0123,
  input: 'hello',
  output: 'world',
  metadata: null,
  spans: [
    {
      id: 'root',
      parentId: null,
      traceId: TRACE_ID,
      name: 'run-root',
      kind: 'CHAIN',
      level: null,
      statusMessage: null,
      start: '2026-08-01T00:00:00.000Z',
      end: '2026-08-01T00:00:00.100Z',
      model: null,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      metadata: null,
      input: 'hello',
      output: 'world',
    },
    {
      id: 'gen',
      parentId: 'root',
      traceId: TRACE_ID,
      name: 'generation-step',
      kind: 'LLM',
      level: null,
      statusMessage: null,
      start: '2026-08-01T00:00:00.010Z',
      end: '2026-08-01T00:00:00.040Z',
      model: 'gpt-x',
      inputTokens: 5,
      outputTokens: 7,
      totalTokens: null,
      metadata: null,
      input: [{ role: 'user', parts: [{ type: 'text', content: 'p' }] }],
      output: [
        { role: 'assistant', parts: [{ type: 'text', content: 'c' }], finish_reason: 'stop' },
      ],
    },
    {
      id: 'err',
      parentId: 'root',
      traceId: TRACE_ID,
      name: 'failing-tool',
      kind: 'TOOL',
      level: 'ERROR',
      statusMessage: 'boom',
      start: '2026-08-01T00:00:00.050Z',
      end: '2026-08-01T00:00:00.060Z',
      model: null,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      metadata: null,
      input: { query: 'q' },
      output: null,
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
  byModelAvailable: true,
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
    (url) => url.pathname === CAPABILITIES_PATH,
    async (route) => {
      await route.fulfill({ json: { data: CAPABILITIES } });
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

test('the served capabilities disable the filters a sort cannot carry, and the sort a filter excludes', async ({
  page,
}) => {
  await stubObservability(page);

  // The tracing tab reads the backend's served capabilities.
  const capabilitiesRead = page.waitForRequest((request) =>
    request.url().includes(CAPABILITIES_PATH),
  );
  await page.goto('/observability?tab=tracing&sort=cost&dir=desc');
  await capabilitiesRead;
  // A cost sort → the filters it cannot carry are disabled; tags stay legal.
  await expect(page.getByLabel('Min cost')).toBeDisabled();
  await expect(page.getByLabel('Max latency (ms)')).toBeDisabled();
  await expect(page.getByLabel('Tags (comma-separated)')).toBeEnabled();

  // The mirror guard: a status filter set → the Cost sort header cannot be chosen.
  await page.goto('/observability?tab=tracing&status=error');
  const costHeader = page.getByRole('button', { name: 'Cost', exact: true });
  await expect(costHeader).toBeVisible();
  await expect(costHeader).toBeDisabled();
  // The time sort combines with every filter — the When header stays available.
  await expect(page.getByRole('button', { name: 'When', exact: true })).toBeEnabled();
});

test('a hand-built metric-sort×filter URL is repaired to a legal query before it is sent', async ({
  page,
}) => {
  await stubObservability(page);
  // A shared/hand-edited URL states a combination the served capabilities exclude.
  await page.goto('/observability?tab=tracing&sort=cost&dir=desc&status=error');

  // The filter is the more specific intent: the metric sort + its direction are dropped,
  // the status filter kept, and the URL — the source of truth — is rewritten to match.
  await page.waitForURL(/status=error/);
  await expect(page).not.toHaveURL(/sort=cost/);
  await expect(page).not.toHaveURL(/dir=desc/);
  // Repaired to a legal query, the table loads and the status filter stays usable.
  await expect(page.getByTestId('run-row-run-ok')).toBeVisible();
  await expect(page.getByLabel('Min cost')).toBeEnabled();
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

test('the by-model card shows the unavailable notice, not empty bars, when byModelAvailable is false', async ({
  page,
}) => {
  await seedCredential(page);
  await page.route(
    (url) => url.pathname === METRICS_PATH,
    async (route) => {
      await route.fulfill({
        json: { data: { ...METRICS, byModel: [], byModelAvailable: false } },
      });
    },
  );
  await page.goto('/observability');

  await expect(page.getByText('Per-model breakdown is unavailable for this range.')).toBeVisible();
  // The unavailable notice replaces the bar list — no by-model bars are rendered.
  await expect(page.getByLabel('Cost by model')).toHaveCount(0);
});

/**
 * By-model rows whose captions are longer than a phone's content box: a large cost, a
 * ten-digit token count and a six-digit call count, under a model name longer than any
 * label column.
 */
const WIDE_BY_MODEL = [
  {
    model: 'provider/an-exceptionally-long-model-identifier-with-a-dated-preview-suffix',
    calls: 123_456,
    cost: 98_765.43,
    totalTokens: 9_876_543_210,
    avgLatencyMs: 240,
  },
  { model: 'gpt-x', calls: 2, cost: 0.0123, totalTokens: 512, avgLatencyMs: 240 },
];

for (const width of [320, 390] as const) {
  test.describe(`the by-model card at ${String(width)} px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('keeps every row, caption included, inside the card without scrolling sideways', async ({
      page,
    }) => {
      await seedCredential(page);
      await page.route(
        (url) => url.pathname === METRICS_PATH,
        async (route) => {
          await route.fulfill({ json: { data: { ...METRICS, byModel: WIDE_BY_MODEL } } });
        },
      );
      await page.goto('/observability');

      const list = page.getByRole('list', { name: 'Cost by model' });
      await expect(list.getByRole('listitem')).toHaveCount(WIDE_BY_MODEL.length);

      const escapes = await list.evaluate((root) => {
        const bound = root.getBoundingClientRect().right;
        return [...root.querySelectorAll('[role="listitem"] *')]
          .map((el) => ({ text: el.textContent, right: el.getBoundingClientRect().right }))
          .filter((box) => box.right > bound + 0.5)
          .map((box) => `${box.text} ends at ${String(box.right)} past ${String(bound)}`);
      });
      expect(escapes, 'a by-model row runs past its list').toEqual([]);

      const overflow = await page.evaluate(() => {
        const root = document.documentElement;
        return root.scrollWidth - root.clientWidth;
      });
      expect(
        overflow,
        `the dashboard overflows horizontally at ${String(width)} px`,
      ).toBeLessThanOrEqual(0);
    });
  });
}

/** The newest seeded trace: its `model` step records the generated message by reference to
 * the generation's recorded message, its `summarise` step references the generation's
 * answer, and its `follow_up` step references a record the backend does not hold. */
const SEEDED_TRACE_ID = 'docs-demo-024';
const MODEL_STEP_SPAN_ID = `${SEEDED_TRACE_ID}-model`;
const SUMMARISE_SPAN_ID = `${SEEDED_TRACE_ID}-summarise`;
const FOLLOW_UP_SPAN_ID = `${SEEDED_TRACE_ID}-follow-up`;
const ROOT_SPAN_ID = `${SEEDED_TRACE_ID}-root`;
/** The generation the `summarise` reference names. */
const GENERATION_SPAN_ID = `${SEEDED_TRACE_ID}-gen`;
/** The record id the `follow_up` reference names, which the backend does not hold. */
const MISSING_OBSERVATION_ID = 'docs-demo-not-recorded';
/** The generation answer the `summarise` reference points at, as the seed records it. */
const SEEDED_ANSWER =
  'The outage began at 09:12 when the cache tier stopped answering; service recovered at 09:40.';
/** The tag every seeded trace carries. The runs list is narrowed to it because the other
 * suites' tool runs record into the same backend. */
const SEEDED_TAG = 'docs-demo';

function resolvedPath(spanId: string): string {
  return `${RUNS_PATH}/${SEEDED_TRACE_ID}/spans/${spanId}/resolved`;
}

test.describe('over the seeded monitoring backend', () => {
  needs('setting:monitoring-seed');

  test('the served capabilities turn every served key into a sort and keep every filter under a sort', async ({
    page,
  }) => {
    await seedCredential(page);
    const capabilitiesRead = page.waitForResponse(
      (response) => new URL(response.url()).pathname === CAPABILITIES_PATH,
    );
    await page.goto(`/observability?tab=tracing&tags=${SEEDED_TAG}&sort=cost&dir=desc`);

    // The backend's own declaration: the four run-list sorts, no sort × filter exclusion.
    const response = await capabilitiesRead;
    expect(response.status()).toBe(200);
    const served = ((await response.json()) as { data: Record<string, unknown> }).data;
    expect([...(served.sortKeys as string[])].sort()).toEqual([
      'cost',
      'createdAt',
      'latencyMs',
      'totalTokens',
    ]);
    expect(served.incompatibleFilters).toEqual({});

    // The seeded runs are listed by the real list read, under the cost sort.
    await expect(page.getByTestId(`run-row-${SEEDED_TRACE_ID}`)).toBeVisible();
    for (const header of ['When', 'Cost', 'Latency', 'Tokens']) {
      await expect(page.getByRole('button', { name: header, exact: true })).toBeEnabled();
    }
    // A sort the backend combines with every filter leaves every filter usable.
    for (const label of ['Min cost', 'Max latency (ms)', 'Min tokens', 'Tags (comma-separated)']) {
      await expect(page.getByLabel(label)).toBeEnabled();
    }
    await expect(page).toHaveURL(/sort=cost/);
  });

  test('a recorded reference opens resolved through the real resolved route', async ({ page }) => {
    await seedCredential(page);
    await page.goto(`/observability?tab=tracing&trace=${SEEDED_TRACE_ID}`);

    await page
      .locator(`[data-testid="waterfall-row"][data-span-id="${SUMMARISE_SPAN_ID}"]`)
      .click();
    const detail = page.getByTestId('span-detail');
    await expect(detail).toContainText('summarise');
    await expect(detail).toContainText('Recorded with 1 reference to other steps.');
    await expect(detail.getByRole('radio', { name: 'As recorded' })).toBeChecked();

    const resolvedRead = page.waitForResponse(
      (response) => new URL(response.url()).pathname === resolvedPath(SUMMARISE_SPAN_ID),
    );
    await detail.getByRole('radio', { name: 'Resolved' }).click();
    const response = await resolvedRead;
    expect(response.status()).toBe(200);
    expect(new URL(response.url()).searchParams.get('field')).toBe('input');
    await expect(detail).toContainText('Full value assembled from 1 reference.');
    await expect(detail.getByTestId('resolved-tree')).toContainText(SEEDED_ANSWER);
  });

  test('a reference step selected after other steps opens As recorded, its reference shown in full', async ({
    page,
  }) => {
    await seedCredential(page);
    await page.goto(`/observability?tab=tracing&trace=${SEEDED_TRACE_ID}`);
    const detail = page.getByTestId('span-detail');
    const row = (spanId: string) =>
      page.locator(`[data-testid="waterfall-row"][data-span-id="${spanId}"]`);

    // A step without references first, then the reference step.
    await row(ROOT_SPAN_ID).click();
    await expect(detail).toContainText('tools_agent');
    await expect(detail).not.toContainText('Recorded with');
    await row(SUMMARISE_SPAN_ID).click();
    await expect(detail).toContainText('Recorded with 1 reference to other steps.');
    await expect(detail.getByRole('radio', { name: 'As recorded' })).toBeChecked();
    // As recorded, the reference object shows its key, the span id and the pointer.
    await expect(detail).toContainText('$tai42_ref');
    await expect(detail).toContainText(GENERATION_SPAN_ID);
    await expect(detail).toContainText('/0/parts/0/content');

    // Resolved on one step does not carry to the next: no read is sent for it.
    const summariseResolved = page.waitForResponse(
      (response) => new URL(response.url()).pathname === resolvedPath(SUMMARISE_SPAN_ID),
    );
    await detail.getByRole('radio', { name: 'Resolved' }).click();
    expect((await summariseResolved).status()).toBe(200);
    await expect(detail).toContainText('Full value assembled from 1 reference.');
    let followUpReads = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === resolvedPath(FOLLOW_UP_SPAN_ID)) followUpReads += 1;
    });
    await row(FOLLOW_UP_SPAN_ID).click();
    await expect(detail).toContainText('follow_up');
    await expect(detail.getByRole('radio', { name: 'As recorded' })).toBeChecked();
    await expect(detail).toContainText(MISSING_OBSERVATION_ID);
    expect(followUpReads).toBe(0);
  });

  test('a model step shows each reference it records deep in its output As recorded', async ({
    page,
  }) => {
    await seedCredential(page);
    await page.goto(`/observability?tab=tracing&trace=${SEEDED_TRACE_ID}`);

    await page
      .locator(`[data-testid="waterfall-row"][data-span-id="${MODEL_STEP_SPAN_ID}"]`)
      .click();
    const detail = page.getByTestId('span-detail');
    await expect(detail).toContainText('Recorded with 5 references to other steps.');
    await expect(detail.getByRole('radio', { name: 'As recorded' })).toBeChecked();
    // Each reference sits six levels into the step's output (the update's message
    // fields); the tree opens to it, showing the span id and the pointer it names.
    await expect(detail.getByText('$tai42_ref:')).toHaveCount(5);
    await expect(detail.getByText(`"${GENERATION_SPAN_ID}"`)).toHaveCount(5);
    for (const member of [
      'additional_kwargs',
      'response_metadata',
      'tool_calls',
      'invalid_tool_calls',
      'usage_metadata',
    ]) {
      await expect(detail).toContainText(`/tai42.message/${member}`);
    }
  });

  test('a reference to a record the backend does not hold answers the missing-value panel', async ({
    page,
  }) => {
    await seedCredential(page);
    await page.goto(`/observability?tab=tracing&trace=${SEEDED_TRACE_ID}`);

    await page
      .locator(`[data-testid="waterfall-row"][data-span-id="${FOLLOW_UP_SPAN_ID}"]`)
      .click();
    const detail = page.getByTestId('span-detail');
    await expect(detail).toContainText('follow_up');
    await expect(detail).toContainText('Recorded with 1 reference to other steps.');

    const resolvedRead = page.waitForResponse(
      (response) => new URL(response.url()).pathname === resolvedPath(FOLLOW_UP_SPAN_ID),
    );
    await detail.getByRole('radio', { name: 'Resolved' }).click();
    expect((await resolvedRead).status()).toBe(502);
    const panel = detail.getByRole('alert');
    await expect(panel).toContainText('A referenced value is missing from the monitoring backend:');

    // "Show as recorded" returns to the value as it was recorded.
    await panel.getByRole('button', { name: 'Show as recorded' }).click();
    await expect(detail.getByRole('alert')).toHaveCount(0);
    await expect(detail.getByRole('radio', { name: 'As recorded' })).toBeChecked();
  });
});
