/**
 * The Agents screen's filter, against the LIVE boot skeleton with the agent reads, the
 * authored-agents read and the tool-metadata overlay served through `page.route` (the
 * lean boot loads no agent plugin). Two agents are listed; only one carries an overlay
 * tag.
 *
 * Legs: the search box narrows the list by description and commits `?q=` on Enter; a tag
 * chip narrows it to the tagged agent and writes `?tags=`; and a reload keeps both.
 */
import { expect, type Page } from '@playwright/test';

import { needs, test } from '../needs';
import { seedCredential } from './helpers';
import { stubRead } from './session-stubs';

needs();

/** Two registered agents, told apart by their descriptions. */
const AGENTS = [
  {
    name: 'status-agent',
    description: 'Answers status questions.',
    tool_name: 'status-agent',
    input_schema: { type: 'object', properties: { query: { type: 'string' } } },
    spec_runnable: true,
  },
  {
    name: 'relay-agent',
    description: 'Relays alerts onward.',
    tool_name: 'relay-agent',
    input_schema: { type: 'object', properties: { query: { type: 'string' } } },
    spec_runnable: true,
  },
] as const;

const TAG = 'relay';

/** Serve the agent reads, no authored agents, and an overlay tagging the second agent. */
async function stubAgentsScreen(page: Page): Promise<void> {
  await seedCredential(page);
  for (const pathname of ['/api/agents', '/api/agents/spec-runnable']) {
    await stubRead(page, pathname, { data: { items: AGENTS, total: AGENTS.length } });
  }
  await stubRead(page, '/api/presets', { data: [] });
  await stubRead(page, '/api/tool-meta', {
    data: {
      folders: [],
      meta: [
        {
          tool_name: AGENTS[1].tool_name,
          folder_id: null,
          tags: [TAG],
          display_name: null,
          hidden: null,
          badges: [],
        },
      ],
    },
  });
}

/** The URL's search parameter `key`, as the address bar holds it. */
function searchParam(page: Page, key: string): () => string | null {
  return () => new URL(page.url()).searchParams.get(key);
}

/** The name cell of the listed agent `name`. */
function agentCell(page: Page, name: string) {
  return page.locator(`[data-testid="agent-name"][data-agent="${name}"]`);
}

test('the search box and a tag chip narrow the agents, write the URL, and survive a reload', async ({
  page,
}) => {
  await stubAgentsScreen(page);
  await page.goto('/agents');
  const [status, relay] = AGENTS;
  await expect(agentCell(page, status.name)).toBeVisible();
  await expect(agentCell(page, relay.name)).toBeVisible();

  const search = page.getByRole('textbox', { name: 'Filter agents' });
  await search.fill('status questions');
  await search.press('Enter');
  await expect.poll(searchParam(page, 'q')).toBe('status questions');
  await expect(agentCell(page, status.name)).toBeVisible();
  await expect(agentCell(page, relay.name)).toHaveCount(0);

  await search.fill('');
  await search.press('Enter');
  await expect(agentCell(page, status.name)).toBeVisible();
  const chip = page
    .getByRole('group', { name: 'Filter agents by tag' })
    .getByRole('button', { name: `${TAG} (1)`, exact: true });
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(searchParam(page, 'tags')).toBe(JSON.stringify([TAG]));
  await expect(agentCell(page, relay.name)).toBeVisible();
  await expect(agentCell(page, status.name)).toHaveCount(0);

  await search.fill('alerts');
  await search.press('Enter');
  await expect.poll(searchParam(page, 'q')).toBe('alerts');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Filter agents' })).toHaveValue('alerts');
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(agentCell(page, relay.name)).toBeVisible();
  await expect(agentCell(page, status.name)).toHaveCount(0);
});
