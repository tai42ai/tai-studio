/**
 * The conversation route dialog's jq fields taking a stored template with render
 * parameters, against the LIVE boot skeleton with the reads the dialog depends on served
 * through `page.route`: the route list, the agent and channel lists its pickers draw, the
 * storage-presence signal and the template catalog. Access control is served off, so the
 * dialog binds the fill identity and asks for no key. The route write is served too, so
 * each case reads the body the dialog sends.
 *
 * Legs: a start expression picked as a stored template with a render parameter is sent
 * as that template and parameter; and the Edit door on a route whose start expression is
 * a stored template shows that template and its parameters and saves them back unchanged.
 */
import { expect, type Locator, type Page } from '@playwright/test';

import { needs, test } from '../needs';
import { seedCredential } from './helpers';
import {
  bodyOf,
  gateOffSession,
  nextRequest,
  serveWrite,
  stubRead,
  stubSession,
} from './session-stubs';

needs();

/** The stored templates the catalog lists. */
const CATALOG = ['start-text', 'start-parts'] as const;

/** The agent and channel the route binds. */
const AGENT = 'assistant';
const CHANNEL = 'web';

/** A start expression held as a stored template with one render parameter. */
const STORED_START = { id: CATALOG[0], kwargs: { field: 'text' } } as const;

/** An existing channel route to an agent whose start expression is {@link STORED_START}. */
const ROUTE = {
  route_name: 'assistant-line',
  door: 'channel',
  channel: CHANNEL,
  target_kind: 'agent',
  target_name: AGENT,
  start_expr: STORED_START,
  reply_expr: null,
  execution_key: '__no_auth__',
  execution_key_fingerprint: 'fp-demo',
  initial_mode: 'agent',
  our_identity: '+10000000000',
  callback_url: null,
  turns_per_hour_override: null,
  reply_texts: null,
  callback_secret: null,
  locale: null,
  overlap: { running: 'continue', deliver: 'one', settle_seconds: 0 },
} as const;

const START = 'Start expression';

const isRouteWrite = (pathname: string): boolean =>
  pathname.startsWith('/api/conversations/') && pathname.split('/').length === 4;

/** Serve the reads the dialog draws from, with `routes` as the route list, and the write. */
async function stubRouteDialog(page: Page, routes: readonly unknown[]): Promise<void> {
  await seedCredential(page);
  await stubSession(page, gateOffSession);
  await stubRead(page, '/api/conversations', {
    data: {
      items: routes,
      total: routes.length,
      page: 1,
      page_size: 100,
      next_page: null,
      truncated: false,
    },
  });
  await stubRead(page, '/api/agents', {
    data: {
      items: [
        {
          name: AGENT,
          description: '',
          tool_name: `run_${AGENT}`,
          input_schema: {},
          spec_runnable: false,
        },
      ],
      total: 1,
    },
  });
  await stubRead(page, '/api/channels', {
    data: { channels: [{ name: CHANNEL, identity_hint: 'The address visitors message.' }] },
  });
  await stubRead(page, '/api/storage', {
    data: { present: true, provider: 'demo', module: 'demo', surfaces: ['storage', 'templates'] },
  });
  await stubRead(page, '/api/templates', { data: CATALOG });
  await serveWrite(page, 'POST', isRouteWrite, {
    data: { route_name: ROUTE.route_name, created: true, callback_secret: null, route: ROUTE },
  });
}

/** Pick `option` in the combobox named `name` inside `dialog`. */
async function pick(page: Page, dialog: Locator, name: string, option: string): Promise<void> {
  await dialog.getByRole('combobox', { name, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

/** The start expression's source radio named `source`. */
function startSource(dialog: Locator, source: string): Locator {
  return dialog
    .getByRole('radiogroup', { name: `${START} source` })
    .getByRole('radio', { name: source });
}

/** The start expression's render-parameter text box named `which` in row 1. */
function startParameter(dialog: Locator, which: 'key' | 'value'): Locator {
  return dialog
    .getByRole('group', { name: `${START} render parameters` })
    .getByRole('textbox', { name: `${START} render parameters ${which} 1` });
}

test('a start expression picked as a stored template is sent with its template and parameters', async ({
  page,
}) => {
  await stubRouteDialog(page, []);
  await page.goto('/conversations');

  await page.getByRole('button', { name: 'Create route' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Route name').fill(ROUTE.route_name);
  await pick(page, dialog, 'Target kind', 'Agent');
  await pick(page, dialog, 'Agent', AGENT);
  await pick(page, dialog, 'Door', 'Channel');
  await pick(page, dialog, 'Channel', CHANNEL);
  await dialog.getByLabel('Our identity').fill(ROUTE.our_identity);

  await startSource(dialog, 'Stored template').click();
  await pick(page, dialog, START, STORED_START.id);
  await dialog
    .getByRole('group', { name: START, exact: true })
    .getByRole('button', { name: 'Add render parameters' })
    .click();
  await startParameter(dialog, 'key').fill('field');
  await startParameter(dialog, 'value').fill('text');

  const write = nextRequest(page, 'POST', isRouteWrite);
  await dialog.getByRole('button', { name: 'Create route' }).click();

  expect(bodyOf(await write).start_expr).toEqual(STORED_START);
});

test('the Edit door shows a stored-template start expression and saves it back unchanged', async ({
  page,
}) => {
  await stubRouteDialog(page, [ROUTE]);
  await page.goto('/conversations');

  await page.getByRole('button', { name: `Edit route ${ROUTE.route_name}` }).click();
  const dialog = page.getByRole('dialog');
  await expect(startSource(dialog, 'Stored template')).toBeChecked();
  await expect(dialog.getByRole('combobox', { name: START, exact: true })).toContainText(
    STORED_START.id,
  );
  await expect(startParameter(dialog, 'key')).toHaveValue('field');
  await expect(startParameter(dialog, 'value')).toHaveValue('text');

  const write = nextRequest(page, 'POST', isRouteWrite);
  await dialog.getByRole('button', { name: 'Save changes' }).click();

  expect(bodyOf(await write).start_expr).toEqual(STORED_START);
});
