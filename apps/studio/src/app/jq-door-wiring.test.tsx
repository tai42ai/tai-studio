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
import { useState, type ReactNode } from 'react';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SchemaForm, type JsonSchema, type PluginContext } from '@tai42/studio-sdk';
import { __resetContributions, __resetPluginHostState } from '@tai42/studio-sdk/testing';

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

/** A plugin page whose form carries an expression-annotated field. */
function ExpressionPage(): ReactNode {
  const [value, setValue] = useState<unknown>({ condition: '.meta' });
  return <SchemaForm schema={ANNOTATED_SCHEMA} value={value} onChange={setValue} />;
}

function serveShell(): void {
  server.use(
    http.get('*/api/plugins', () =>
      HttpResponse.json({
        data: [
          {
            name: 'acme',
            version: '1.0.0',
            api_version: 1,
            entry: 'index.js',
            integrity: { 'index.js': 'sha384-abc' },
            contributions: { tool_panels: {}, pages: ['expressions'], settings_tabs: [] },
          },
        ],
      }),
    ),
    http.get('*/api/tools', () => HttpResponse.json({ data: [] })),
    http.get('*/api/tools/tags', () => HttpResponse.json({ data: [] })),
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
});
