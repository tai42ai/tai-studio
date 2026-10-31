/**
 * The MCP config editor's check of listed tool names against the tools the server
 * advertises, on the Manifest screen against the LIVE boot skeleton. The config, its
 * schema, the MCP status and the server's advertised tools are served through
 * `page.route`, so the editor shows one mounted server `srv` that advertises three tools
 * and an entry listing one name it does not advertise in each tool list.
 *
 * Legs: the form view flags the unadvertised include name on its chip, warns on both
 * lists in the words each list's effect needs, and its add row offers the advertised
 * tools; the JSON view warns in the same words with the server named; and a failed read
 * of the server's tools shows its reason with a Retry that reads again.
 */
import { expect, type Page } from '@playwright/test';

import { needs, test } from '../needs';
import { seedCredential } from './helpers';
import { serveWrite, stubRead } from './session-stubs';

needs();

const SERVER = 'srv';

/** The tools the server advertises. */
const ADVERTISED = ['search', 'fetch', 'list'] as const;

/** The entry: one advertised and one unadvertised name included, one unadvertised excluded. */
const ENTRY = {
  title: SERVER,
  transport: 'stdio',
  command: 'srv-command',
  include: ['search', 'ghost'],
  exclude: ['gone'],
} as const;

const INCLUDE_WARNING =
  'This server does not advertise ghost. Saving keeps it, but it binds no tool from this server.';
const EXCLUDE_WARNING =
  'This server does not advertise gone. Saving keeps it, but it hides nothing.';

const isAdvertisedRead = (pathname: string): boolean =>
  pathname === `/api/mcp-status/${SERVER}/advertised-tools`;

/** The advertised-tools read's answer for {@link ENTRY}. */
const ADVERTISED_READ = {
  data: {
    title: SERVER,
    include: ENTRY.include,
    exclude: ENTRY.exclude,
    unadvertised: ['ghost', 'gone'],
    tools: ADVERTISED.map((name) => ({
      name,
      title: null,
      description: null,
      bound: name === 'search',
      selected: name === 'search',
      unbound_reason: null,
    })),
  },
} as const;

/** Serve the editor's reads with {@link ENTRY} as the one configured, mounted server. */
async function stubMcpEditor(page: Page): Promise<void> {
  await seedCredential(page);
  await stubRead(page, '/api/manifest/preserved', {
    data: {
      mcp: [ENTRY],
      user_tools: [],
      extension_settings: {
        extensions_modules: [],
        backend_module: null,
        tools: [],
        mcp: [],
        api_tools: {},
      },
    },
  });
  await stubRead(page, '/api/mcp-config/schema', { data: { type: 'object', properties: {} } });
  await stubRead(page, '/api/mcp-status', {
    data: { bound: { [SERVER]: ['search'] }, failed: [], health: {} },
  });
  await stubRead(page, '/api/extensions', { data: [] });
}

/** Switch the editor to its JSON view. */
async function openJsonView(page: Page): Promise<void> {
  await page
    .getByRole('group', { name: 'Config view' })
    .getByRole('button', { name: 'JSON' })
    .click();
  await expect(page.getByLabel('MCP config')).toBeVisible();
}

test('the form view flags an unadvertised name on each list and offers the advertised tools', async ({
  page,
}) => {
  await stubMcpEditor(page);
  await serveWrite(page, 'POST', isAdvertisedRead, ADVERTISED_READ);
  await page.goto('/manifest');

  const included = page.getByRole('group', { name: 'Included tools' });
  await expect(included.getByText('ghost (not advertised)', { exact: true })).toBeVisible();
  await expect(included.getByText('search', { exact: true })).toBeVisible();
  await expect(included.getByRole('alert')).toHaveText(INCLUDE_WARNING);

  const excluded = page.getByRole('group', { name: 'Excluded tools' });
  await expect(excluded.getByText('gone (not advertised)', { exact: true })).toBeVisible();
  await expect(excluded.getByRole('alert')).toHaveText(EXCLUDE_WARNING);

  await included.getByRole('combobox', { name: 'Included tools: choose a tool' }).click();
  await expect(page.getByRole('option', { name: /fetch/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /ghost/ })).toHaveCount(0);
});

test('the JSON view warns about the unadvertised names with the server named', async ({ page }) => {
  await stubMcpEditor(page);
  await serveWrite(page, 'POST', isAdvertisedRead, ADVERTISED_READ);
  await page.goto('/manifest');
  await openJsonView(page);

  await expect(
    page.getByText(
      `The server “${SERVER}” does not advertise ghost in its include list. Saving keeps it, but it binds no tool from this server.`,
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      `The server “${SERVER}” does not advertise gone in its exclude list. Saving keeps it, but it hides nothing.`,
      { exact: true },
    ),
  ).toBeVisible();
});

test('a failed read of the server tools in the JSON view shows its reason, and Retry reads again', async ({
  page,
}) => {
  await stubMcpEditor(page);
  await serveWrite(page, 'POST', isAdvertisedRead, { status: 502, error: 'server unreachable' });
  await page.goto('/manifest');
  await openJsonView(page);

  const failure = page.getByText(
    `The tools of the server “${SERVER}” could not be read: server unreachable. Its listed names are not checked.`,
  );
  await expect(failure).toBeVisible();

  // The server answers from here on; the later route takes precedence over the failing one.
  await serveWrite(page, 'POST', isAdvertisedRead, ADVERTISED_READ);
  await page.getByRole('button', { name: 'Retry' }).click();

  await expect(failure).toHaveCount(0);
  await expect(
    page.getByText(`The server “${SERVER}” does not advertise ghost in its include list.`),
  ).toBeVisible();
});
