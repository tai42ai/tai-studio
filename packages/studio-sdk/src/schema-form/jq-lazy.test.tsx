/**
 * The jq door is code-split: `StringField` reaches `JqField` through a dynamic
 * `import('../jq')` behind a `lazy` boundary, taken ONLY when a field carries a
 * well-formed `x-tai42-expression` annotation. This is the runtime half of the
 * decoupling the build-graph trace proves statically — a form whose fields carry
 * no (or a malformed) annotation must never pull the jq module, so a consumer
 * that bundles the SDK never ships the visual editor, worker, and wasm to end
 * users whose forms can't author expressions.
 *
 * The mock's factory is what flips `loaded`: vitest evaluates a `vi.mock`
 * factory the first time its module is imported (statically or dynamically), so
 * within this file — where nothing imports `../jq` for its runtime value — the
 * flag staying `false` witnesses that no jq import was ever requested. The
 * factory returns a stub rather than the real exports so a regression that DID
 * reach the door still would not drag jq-studio into this suite.
 */
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SchemaForm } from './SchemaForm';
import type { JsonSchema } from './types';

const loaded = vi.hoisted(() => ({ value: false }));

vi.mock('../jq', () => {
  loaded.value = true;
  return { JqField: () => <div data-testid="jq-door" /> };
});

/** Let any pending dynamic import settle so a leaked load would surface. */
async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

const plainSchema: JsonSchema = {
  type: 'object',
  properties: {
    condition: { type: 'string', title: 'Route condition' },
  },
};

const malformedSchema: JsonSchema = {
  type: 'object',
  properties: {
    // `language: 'lorem'` is not a known expression language, so the classifier
    // rejects the annotation and the field falls back to a plain string input.
    condition: {
      type: 'string',
      title: 'Route condition',
      'x-tai42-expression': { language: 'lorem' },
    },
  },
};

describe('SchemaForm — jq door lazy loading', () => {
  it('does NOT load the jq module for a form with no annotated field', async () => {
    render(<SchemaForm schema={plainSchema} value={{}} onChange={() => undefined} />);
    await flushMicrotasks();

    expect(loaded.value).toBe(false);
    expect(screen.queryByTestId('jq-door')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Route condition' }).tagName).toBe('INPUT');
  });

  it('does NOT load the jq module for a MALFORMED annotation', async () => {
    render(<SchemaForm schema={malformedSchema} value={{}} onChange={() => undefined} />);
    await flushMicrotasks();

    expect(loaded.value).toBe(false);
    expect(screen.queryByTestId('jq-door')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Route condition' }).tagName).toBe('INPUT');
  });
});
