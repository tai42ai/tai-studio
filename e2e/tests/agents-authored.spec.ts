/**
 * The Agents screen's one list of registered and authored agents, against the LIVE boot
 * skeleton with the agent reads served through `page.route` (the lean boot loads no agent
 * plugin). The folder overlay read is the live one.
 *
 * Legs: a placeholder holds the authored agents' place while the presets read is in
 * flight, then the authored agent is listed beside the registered one, each marked with
 * its kind; with none authored, a writer reads "No authored agents yet" with the Compose
 * hint, and a viewer reads the same card without the hint.
 */
import { expect, type Page } from '@playwright/test';

import { needs, test } from '../needs';
import { seedCredential } from './helpers';
import { onlyReachSession, stubSession } from './session-stubs';

needs();

const AGENT = {
  name: 'tools-agent',
  description: 'runs tools',
  tool_name: 'tools-agent',
  input_schema: { type: 'object', properties: { query: { type: 'string' } } },
  spec_runnable: true,
};

const AUTHORED = {
  name: 'relay-agent',
  base_tool: AGENT.name,
  description: 'An authored agent over tools-agent.',
  active_version: 1,
  conflicted: false,
  conflicted_reason: null,
  extensions: [],
  input_schema: null,
  input_map: null,
  output_schema: null,
  output_map: null,
  used_by: [],
  uses: [],
};

const COMPOSE_HINT = 'Compose an agent to bake a prompt, tools, and presets over a base agent.';

/** Serve the agents registry and the authorable list with {@link AGENT}. */
async function stubAgentReads(page: Page): Promise<void> {
  for (const pathname of ['/api/agents', '/api/agents/spec-runnable']) {
    await page.route(
      (url) => url.pathname === pathname,
      async (route) => {
        await route.fulfill({ json: { data: { items: [AGENT], total: 1 } } });
      },
    );
  }
}

/** Serve `GET /api/presets` with `presets` once `release` resolves. */
async function stubPresets(
  page: Page,
  presets: readonly unknown[],
  release: Promise<void> = Promise.resolve(),
): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/presets',
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      await release;
      await route.fulfill({ json: { data: presets } });
    },
  );
}

/** The name cell of the listed agent `name`. */
function agentCell(page: Page, name: string) {
  return page.locator(`[data-testid="agent-name"][data-agent="${name}"]`);
}

test('authored agents show a placeholder while they load, then list beside the registered ones', async ({
  page,
}) => {
  await seedCredential(page);
  await stubAgentReads(page);
  let releasePresets: () => void = () => undefined;
  const presetsHeld = new Promise<void>((resolve) => {
    releasePresets = resolve;
  });
  await stubPresets(page, [AUTHORED], presetsHeld);
  await page.goto('/agents');

  await expect(page.getByTestId('authored-agents-loading')).toBeVisible();
  await expect(agentCell(page, AGENT.name)).toHaveAttribute('data-kind', 'registered');
  releasePresets();

  await expect(page.getByTestId('authored-agents-loading')).toBeHidden();
  await expect(agentCell(page, AUTHORED.name)).toHaveAttribute('data-kind', 'authored');
  await expect(page.getByRole('button', { name: `Run agent ${AGENT.name}` })).toBeVisible();
  await expect(
    page.getByRole('button', { name: `Run authored agent ${AUTHORED.name}` }),
  ).toBeVisible();
  await expect(page.getByText('No authored agents yet')).toHaveCount(0);
});

test('with none authored, a writer reads "No authored agents yet" with the Compose hint', async ({
  page,
}) => {
  await seedCredential(page);
  await stubAgentReads(page);
  await stubPresets(page, []);
  await page.goto('/agents');

  const authoring = page.getByRole('region', { name: 'Agent authoring' });
  await expect(authoring.getByText('No authored agents yet')).toBeVisible();
  await expect(authoring.getByText(COMPOSE_HINT)).toBeVisible();
  await expect(authoring.getByRole('button', { name: 'Compose agent' })).toBeVisible();
});

test('with none authored, a viewer reads "No authored agents yet" without the Compose hint', async ({
  page,
}) => {
  await seedCredential(page);
  await stubSession(
    page,
    onlyReachSession('alice', [
      { path: '/api/agents', methods: ['GET'] },
      { path: '/api/agents/spec-runnable', methods: ['GET'] },
      { path: '/api/presets', methods: ['GET'] },
      { path: '/api/tool-meta', methods: ['GET'] },
    ]),
  );
  await stubAgentReads(page);
  await stubPresets(page, []);
  await page.goto('/agents');

  // The write gate fails closed until the session's projection is loaded, so first wait
  // for a mark drawn only from a loaded projection: the Primary nav's Agents row (the nav
  // shows placeholder rows until then). Only then is the missing Compose a refusal.
  await expect(
    page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Agents', exact: true }),
  ).toBeVisible();
  const authoring = page.getByRole('region', { name: 'Agent authoring' });
  await expect(authoring.getByText('No authored agents yet')).toBeVisible();
  await expect(authoring.getByText(COMPOSE_HINT)).toHaveCount(0);
  await expect(authoring.getByRole('button', { name: 'Compose agent' })).toHaveCount(0);
});
