/**
 * An empty tool result read as such, against the LIVE boot skeleton: on the tool run
 * panel, where the reference plugin's `studio_demo_empty` returns an empty object, an empty
 * list or none, and in a trace's span detail, where the monitoring reads are served through
 * `page.route` with a tool span that ended without error and recorded an empty output.
 */
import { expect, type Page } from '@playwright/test';

import { needs, test } from '../needs';
import { seedCredential } from './helpers';
import { stubRead } from './session-stubs';

needs();

test.describe('the run panel', () => {
  needs('kind:studio_plugins:reference_plugin');

  for (const [shape, shown] of [
    ['object', '{}'],
    ['list', '[]'],
    ['none', 'null'],
  ] as const) {
    test(`a run that returns ${shown} shows the empty-result note naming it`, async ({ page }) => {
      await seedCredential(page);
      await page.goto('/tools?tool=studio_demo_empty');

      await page
        .getByRole('group', { name: 'shape' })
        .getByRole('radio', { name: shape, exact: true })
        .check();
      await page.getByRole('button', { name: 'Run', exact: true }).click();

      await expect(page.getByRole('heading', { name: 'Result' })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('Empty result', { exact: true })).toBeVisible();
      await expect(
        page.getByText(`The tool returned an empty value: ${shown}.`, { exact: true }),
      ).toBeVisible();
    });
  }
});

const TRACE_ID = 'trace-empty-output';
const RUNS_PATH = '/api/observability/runs';

/** A run whose one tool span ended without error and returned an empty object. */
const TRACE = {
  traceId: TRACE_ID,
  timestamp: '2026-08-01T00:00:00.000Z',
  tags: [],
  totalCost: null,
  input: { shape: 'object' },
  output: {},
  metadata: null,
  spans: [
    {
      id: 'empty-tool',
      parentId: null,
      traceId: TRACE_ID,
      name: 'studio_demo_empty',
      kind: 'TOOL',
      level: null,
      statusMessage: null,
      start: '2026-08-01T00:00:00.000Z',
      end: '2026-08-01T00:00:00.020Z',
      model: null,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      metadata: null,
      input: { shape: 'object' },
      output: {},
    },
  ],
} as const;

/** Serve the monitoring reads the tracing tab draws, with {@link TRACE} as the one trace. */
async function stubTrace(page: Page): Promise<void> {
  await seedCredential(page);
  await stubRead(page, '/api/observability/capabilities', {
    data: {
      pageSizeMax: 100,
      sortKeys: ['createdAt'],
      incompatibleFilters: {},
      metrics: { measures: ['count'], dimensions: [] },
    },
  });
  await stubRead(page, RUNS_PATH, { data: { items: [], page: 1, nextPage: null } });
  await stubRead(page, `${RUNS_PATH}/${TRACE_ID}/trace`, { data: TRACE });
}

test('a tool span that ended with an empty output says the tool returned an empty result', async ({
  page,
}) => {
  await stubTrace(page);
  await page.goto(`/observability?tab=tracing&trace=${TRACE_ID}`);

  await page.locator('[data-testid="waterfall-row"][data-span-id="empty-tool"]').click();
  const detail = page.getByTestId('span-detail');
  await expect(detail).toContainText('studio_demo_empty');
  await expect(
    detail.getByText('The tool returned an empty result.', { exact: true }),
  ).toBeVisible();
});
