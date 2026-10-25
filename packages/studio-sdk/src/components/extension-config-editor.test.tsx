import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { JSON_SCHEMA_META_URI } from '../schema-form/json-schema-meta';
import type { JsonSchema } from '../schema-form/types';
import { type ExtensionConfigChange, ExtensionConfigEditor } from './extension-config-editor';

function renderEditor(schema: JsonSchema, value?: Record<string, unknown>) {
  const onChange = vi.fn<(next: ExtensionConfigChange) => void>();
  render(
    <ExtensionConfigEditor
      name="demo_ext"
      schema={schema}
      value={value}
      onChange={onChange}
      idPrefix="demo"
    />,
  );
  const last = (): ExtensionConfigChange | undefined => onChange.mock.calls.at(-1)?.[0];
  return { onChange, last };
}

const FIELDS: JsonSchema = {
  type: 'object',
  properties: {
    label: { type: 'string', title: 'Label', minLength: 1 },
    mode: { type: 'string', title: 'Mode', enum: ['fast', 'slow'] },
  },
  required: ['label', 'mode'],
};

describe('ExtensionConfigEditor', () => {
  it('renders form fields and reports valid only once they match the schema', async () => {
    const user = userEvent.setup();
    const { last } = renderEditor(FIELDS);
    expect(last()?.valid).toBe(false);
    await user.type(screen.getByRole('textbox', { name: /Label/ }), 'alpha');
    expect(last()?.valid).toBe(false);
    await user.click(screen.getByRole('radio', { name: 'slow' }));
    expect(last()).toEqual({ config: { label: 'alpha', mode: 'slow' }, valid: true });
  });

  it('authors a meta-schema property with a SchemaEditor; invalid JSON reports invalid', () => {
    const { last } = renderEditor({
      type: 'object',
      properties: { shape: { $ref: JSON_SCHEMA_META_URI, title: 'Result shape' } },
      required: ['shape'],
    });
    const box = screen.getByRole('textbox', { name: 'Result shape JSON' });
    expect(last()?.valid).toBe(false);
    fireEvent.change(box, { target: { value: '{"type": "object"}' } });
    expect(last()).toEqual({ config: { shape: { type: 'object' } }, valid: true });
    fireEvent.change(box, { target: { value: '{ not json' } });
    expect(last()?.valid).toBe(false);
  });

  it('emits the form part and the schema-valued part in one config', async () => {
    const user = userEvent.setup();
    const { last } = renderEditor({
      type: 'object',
      properties: {
        label: { type: 'string', title: 'Label' },
        shape: { $ref: JSON_SCHEMA_META_URI, title: 'Result shape' },
      },
    });
    await user.type(screen.getByRole('textbox', { name: /^Label/ }), 'beta');
    fireEvent.change(screen.getByRole('textbox', { name: 'Result shape JSON' }), {
      target: { value: '{"type": "string"}' },
    });
    expect(last()).toEqual({
      config: { label: 'beta', shape: { type: 'string' } },
      valid: true,
    });
  });

  it('shows an error and reports invalid for a meta-schema $ref below the top level', () => {
    const { last } = renderEditor({
      type: 'object',
      properties: {
        outer: { type: 'object', properties: { inner: { $ref: JSON_SCHEMA_META_URI } } },
      },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The settings of demo_ext cannot be edited here: a JSON Schema setting is nested at $.outer.inner.',
    );
    expect(last()?.valid).toBe(false);
  });

  it('seeds from the stored value when editing', () => {
    const { last } = renderEditor(FIELDS, { label: 'gamma', mode: 'fast' });
    expect(screen.getByRole('textbox', { name: /Label/ })).toHaveValue('gamma');
    expect(last()).toEqual({ config: { label: 'gamma', mode: 'fast' }, valid: true });
  });

  it('names the group "<name> settings"', () => {
    renderEditor(FIELDS);
    expect(screen.getByRole('group', { name: 'demo_ext settings' })).toBeInTheDocument();
  });

  it('seals an env-marker setting: a read-only row, emitted verbatim, valid', async () => {
    const user = userEvent.setup();
    const { last } = renderEditor(
      {
        type: 'object',
        properties: {
          label: { type: 'string', title: 'Label' },
          n: { type: 'integer', title: 'Count' },
        },
        required: ['label', 'n'],
      },
      { label: '!ENV ${EXT_TOKEN}', n: 2 },
    );
    expect(screen.queryByRole('textbox', { name: /Label/ })).toBeNull();
    expect(screen.getByText('Label')).toBeInTheDocument();
    expect(screen.getByText('Env reference EXT_TOKEN, kept as written.')).toBeInTheDocument();
    const count = screen.getByRole('spinbutton', { name: /Count/ });
    await user.clear(count);
    await user.type(count, '3');
    expect(last()).toEqual({ config: { label: '!ENV ${EXT_TOKEN}', n: 3 }, valid: true });
  });

  it('a marker nested inside an object setting seals the whole setting', () => {
    const { last } = renderEditor(
      {
        type: 'object',
        properties: {
          auth: {
            type: 'object',
            title: 'Auth',
            properties: { user: { type: 'string' }, secret: { type: 'string' } },
          },
        },
      },
      { auth: { user: 'alice', secret: '!ENV ${EXT_SECRET}' } },
    );
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Env reference EXT_SECRET, kept as written.')).toBeInTheDocument();
    expect(last()).toEqual({
      config: { auth: { user: 'alice', secret: '!ENV ${EXT_SECRET}' } },
      valid: true,
    });
  });

  it('a required sealed key does not make the form invalid', () => {
    const { last } = renderEditor(
      {
        type: 'object',
        properties: { label: { type: 'string', title: 'Label' } },
        required: ['label'],
      },
      { label: '!ENV ${EXT_TOKEN}' },
    );
    expect(last()).toEqual({ config: { label: '!ENV ${EXT_TOKEN}' }, valid: true });
  });
});
