/**
 * The shell's jq-door injection, end to end. The SDK's `SchemaForm` holds NO edge
 * to the jq editor — a consumer that bundles the SDK would otherwise emit the
 * visual editor, its worker file, and its wasm whether or not it ever authors an
 * expression — so an `x-tai42-expression` field renders the visual-editor door
 * only because THIS host hands `JqField` down through `ExpressionFieldContext` at
 * the composition root.
 *
 * The form under test is rendered by a PLUGIN page: it is the furthest point from
 * the root that must still get the door, so a form anywhere shallower (a feature's
 * run panel, the SchemaEditor preview, an elicitation answer) is covered a
 * fortiori. The real `JqField` renders here — no double — so the assertion is the
 * door's own affordance, not a stand-in.
 */
import {
  type JsonSchema,
  type PluginContext,
  SchemaForm,
  STUDIO_PLUGIN_API_VERSION,
} from '@tai42/studio-sdk';
import { __resetContributions, __resetPluginHostState } from '@tai42/studio-sdk/testing';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { type ReactNode, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { installServer, renderStudio, server } from './test-harness';

installServer();

const ANNOTATED_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    condition: {
      type: 'string',
      title: 'Route condition',
      'x-tai42-expression': { language: 'jq' },
    },
  },
};

const TEMPLATED_SCHEMA: JsonSchema = {
  $defs: {
    TemplatedText: {
      type: 'object',
      title: 'TemplatedText',
      properties: {
        content: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null },
        id: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null },
        kwargs: { type: 'object', additionalProperties: true },
      },
      'x-tai42-templated-text': { language: 'jinja' },
    },
  },
  type: 'object',
  properties: {
    gate: { $ref: '#/$defs/TemplatedText', 'x-tai42-expression': { language: 'jq' } },
  },
  required: ['gate'],
};

/** A plugin page whose form carries a jq-typed templated-text field set to a stored id. */
function TemplatedPage(): ReactNode {
  const [value, setValue] = useState<unknown>({ gate: { id: 'checks/ready' } });
  return <SchemaForm schema={TEMPLATED_SCHEMA} value={value} onChange={setValue} />;
}

/** A plugin page whose form carries an expression-annotated field. */
function ExpressionPage(): ReactNode {
  const [value, setValue] = useState<unknown>({ condition: '.meta' });
  return <SchemaForm schema={ANNOTATED_SCHEMA} value={value} onChange={setValue} />;
}

function serveShell(...extra: Parameters<typeof server.use>): void {
  server.use(
    http.get('*/api/plugins', () =>
      HttpResponse.json({
        data: [
          {
            name: 'acme',
            version: '1.0.0',
            api_version: STUDIO_PLUGIN_API_VERSION,
            mounts: {},
            entry: 'index.js',
            integrity: { 'index.js': 'sha384-abc' },
            contributions: { tool_panels: {}, pages: ['expressions'], settings_tabs: [] },
          },
        ],
      }),
    ),
    http.get('*/api/tools', () => HttpResponse.json({ data: [] })),
    http.get('*/api/tools/tags', () => HttpResponse.json({ data: [] })),
    ...extra,
  );
}

describe('the shell injects the jq door into every SchemaForm below it', () => {
  beforeEach(() => {
    __resetContributions();
    __resetPluginHostState();
  });

  it('renders the visual-editor door for an expression-annotated field', async () => {
    serveShell();
    const register = (ctx: PluginContext): void => {
      ctx.registerPage({ path: 'expressions', title: 'Expressions', component: ExpressionPage });
    };

    renderStudio({
      initialPath: '/plugins/acme/expressions',
      sessionKey: 'k-jq-door',
      importModule: vi.fn(() => Promise.resolve({ register })),
    });

    expect(
      await screen.findByRole('button', { name: 'Open the visual editor for Route condition' }),
    ).toBeInTheDocument();
    // The door's own resting control, not the form's plain text input.
    expect(screen.getByRole('textbox', { name: /Route condition/ }).tagName).toBe('TEXTAREA');
  });

  it('gives a templated-text field the door and the stored templates', async () => {
    serveShell(
      http.get('*/api/storage', () =>
        HttpResponse.json({
          data: {
            module: 'acme.storage',
            present: true,
            provider: 'local',
            surfaces: ['storage', 'templates'],
          },
        }),
      ),
      http.get('*/api/templates', () =>
        HttpResponse.json({ data: ['checks/ready', 'checks/other'] }),
      ),
    );
    const register = (ctx: PluginContext): void => {
      ctx.registerPage({ path: 'templated', title: 'Templated', component: TemplatedPage });
    };

    renderStudio({
      initialPath: '/plugins/acme/templated',
      sessionKey: 'k-templated-door',
      importModule: vi.fn(() => Promise.resolve({ register })),
    });

    const user = userEvent.setup();
    const group = await screen.findByRole('group', { name: 'gate' });
    expect(await within(group).findByRole('radio', { name: 'Stored template' })).toBeChecked();
    await user.click(await within(group).findByRole('combobox', { name: 'gate' }));
    expect(await screen.findByRole('option', { name: 'checks/other' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(within(group).getByRole('radio', { name: 'Inline text' }));
    expect(
      await screen.findByRole('button', { name: 'Open the visual editor for gate' }),
    ).toBeInTheDocument();
  });
});
