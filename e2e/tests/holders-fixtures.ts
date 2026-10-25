/**
 * The seeds the holder-list suites share, written through the real HTTP API: a preset
 * a conversation route is bound to (a delete holder), and a state with an attached
 * template plus a preset whose state binding names it (a detach holder). Every write
 * raises on a non-2xx; the cleanup helpers treat a 404 as already gone and raise on
 * anything else.
 *
 * Fixtures use a domain-agnostic ledger/mark vocabulary, never a business scenario.
 */
import { type APIRequestContext, request as apiRequest } from '@playwright/test';

import { BASE_URL } from '../playwright.config';
import { API_KEY, EXECUTION_KEY_ID } from './helpers';

export const HOLDERS_BASE_TOOL = 'studio_demo_echo';
export const HOLDERS_STATE = 'holders-ledger';
export const HOLDERS_TEMPLATE = 'holders-mark';

type Response = Awaited<ReturnType<APIRequestContext['get']>>;

async function ok(res: Response, what: string): Promise<void> {
  if (!res.ok()) throw new Error(`${what} failed (${String(res.status())}): ${await res.text()}`);
}

async function gone(res: Response, what: string): Promise<void> {
  if (res.status() === 404) return;
  await ok(res, what);
}

/** An API context authenticated with the suite key. The caller disposes it. */
export function holdersApi(): Promise<APIRequestContext> {
  return apiRequest.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
  });
}

/** Create preset `name` over the demo echo tool, with `stateBinding` when given. */
export async function createPreset(
  api: APIRequestContext,
  name: string,
  stateBinding: unknown = null,
): Promise<void> {
  await ok(
    await api.post('/api/presets', {
      data: {
        name,
        base_tool: HOLDERS_BASE_TOOL,
        description: 'Echoes a fixed message.',
        fixed_kwargs: {},
        state_binding: stateBinding,
      },
    }),
    `create preset ${name}`,
  );
}

/** Create the api-door conversation route `route` whose tool target is `tool`. */
export async function createBoundRoute(
  api: APIRequestContext,
  route: string,
  tool: string,
): Promise<void> {
  await ok(
    await api.post(`/api/conversations/${route}`, {
      data: {
        door: 'api',
        target_kind: 'tool',
        target_name: tool,
        start_expr: { content: '{ message: .message }' },
        reply_expr: { content: '{ text: .result }' },
        execution_key: EXECUTION_KEY_ID,
        callback_url: 'https://holders-route.invalid/cb',
      },
    }),
    `create route ${route}`,
  );
}

/** Declare the ledger state, upload the mark template, and attach it (re-attached fresh). */
export async function seedStateAndTemplate(api: APIRequestContext): Promise<void> {
  await ok(
    await api.put(`/api/states/${HOLDERS_STATE}`, {
      data: {
        name: HOLDERS_STATE,
        description: 'One document per subject — a ledger of marks.',
        schema: { type: 'object', properties: { label: { type: 'string' } } },
        subject_kinds: ['item'],
        default_subject_kind: 'item',
      },
    }),
    'declare state',
  );
  await ok(
    await api.put(`/api/state-templates/${HOLDERS_TEMPLATE}?replace=true`, {
      data: {
        kind: 'state-template',
        name: HOLDERS_TEMPLATE,
        description: 'A count of marks.',
        schema: { type: 'object', properties: { marks: { type: 'number' } } },
        parameters: {},
        regimes: [{ path: ['marks'], regime: 'single' }],
        template_jq: {
          add: {
            description: 'Add to the marks.',
            purpose: 'update',
            params: ['marks'],
            reads: [],
            writes: [['marks']],
            jq: {
              content: '[{ op: "set", path: ["marks"], value: (.marks + $input.marks) }]',
            },
          },
        },
      },
    }),
    'upload template document',
  );
  await detachTemplate(api);
  await ok(
    await api.put(`/api/states/${HOLDERS_STATE}/attachments/${HOLDERS_TEMPLATE}`, {
      data: { path: [], parameters: {}, declarations: {} },
    }),
    'attach template',
  );
}

/** The state binding that names the mark template on the ledger state. */
export const MARK_BINDING = {
  states: [
    {
      state: HOLDERS_STATE,
      templates: [HOLDERS_TEMPLATE],
      subject_expr: { content: '.subject_id' },
    },
  ],
} as const;

export async function deletePreset(api: APIRequestContext, name: string): Promise<void> {
  await gone(await api.delete(`/api/presets/${name}`), `delete preset ${name}`);
}

export async function deleteRoute(api: APIRequestContext, route: string): Promise<void> {
  await gone(await api.delete(`/api/conversations/${route}`), `delete route ${route}`);
}

export async function detachTemplate(api: APIRequestContext): Promise<void> {
  await gone(
    await api.delete(`/api/states/${HOLDERS_STATE}/attachments/${HOLDERS_TEMPLATE}`),
    'detach the template',
  );
}
