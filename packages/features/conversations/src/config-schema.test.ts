/**
 * The client-authored config schema and its mappers: the create vs edit key pinning,
 * the greeting-placeholder mirror of the server's refusal, and the blank-greeting →
 * null round-trip that the upsert door requires.
 */
import { describe, expect, it } from 'vitest';

import {
  blankConfigValue,
  configFormSchema,
  configToFormValue,
  formValueToBody,
  requiredFieldErrors,
  unsupportedGreetingPlaceholder,
} from './config-schema';

describe('configFormSchema', () => {
  it('renders the key fields as editable pickers on the create path', () => {
    const schema = configFormSchema();
    const props = schema.properties as Record<string, { enum?: unknown[]; const?: unknown }>;
    expect(props.target_kind?.enum).toEqual(['agent', 'tool']);
    expect(props.target_kind?.const).toBeUndefined();
    expect(props.target_name?.const).toBeUndefined();
  });

  it('pins the key fields read-only (const) on the edit path', () => {
    const schema = configFormSchema({ target_kind: 'tool', target_name: 'lookup' });
    const props = schema.properties as Record<string, { const?: unknown }>;
    expect(props.target_kind?.const).toBe('tool');
    expect(props.target_name?.const).toBe('lookup');
  });

  it('never puts x-tai42-expression on the greeting (a str.format template, not jq)', () => {
    const schema = configFormSchema();
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.greeting_template?.['x-tai42-expression']).toBeUndefined();
  });
});

describe('unsupportedGreetingPlaceholder', () => {
  it('accepts a template referencing only {pairing_code}', () => {
    expect(unsupportedGreetingPlaceholder('Hi! Your code is {pairing_code}.')).toBeNull();
  });

  it('accepts a template with no placeholders', () => {
    expect(unsupportedGreetingPlaceholder('Welcome to support.')).toBeNull();
  });

  it('rejects a foreign placeholder, naming the offender', () => {
    expect(unsupportedGreetingPlaceholder('Hi {name}!')).toBe('name');
  });

  it('rejects a pairing_code carrying a format spec', () => {
    expect(unsupportedGreetingPlaceholder('{pairing_code:>10}')).toBe('pairing_code:>10');
  });

  it('ignores escaped braces', () => {
    expect(unsupportedGreetingPlaceholder('A literal {{brace}} and {pairing_code}.')).toBeNull();
  });
});

describe('config mappers', () => {
  it('seeds the agent target kind and multichannel-off on a blank create value', () => {
    expect(blankConfigValue()).toEqual({ target_kind: 'agent', multichannel: false });
  });

  it('prefills from a stored config, omitting a null greeting', () => {
    expect(
      configToFormValue({
        target_kind: 'agent',
        target_name: 'a',
        multichannel: true,
        greeting_template: null,
      }),
    ).toEqual({
      target_kind: 'agent',
      target_name: 'a',
      multichannel: true,
    });
  });

  it('prefills a present greeting', () => {
    expect(
      configToFormValue({
        target_kind: 'agent',
        target_name: 'a',
        multichannel: false,
        greeting_template: 'Hi {pairing_code}',
      }).greeting_template,
    ).toBe('Hi {pairing_code}');
  });

  it('maps a blank greeting to null (the server refuses a blank string)', () => {
    const body = formValueToBody({
      target_kind: 'agent',
      target_name: 'a',
      multichannel: false,
      greeting_template: '   ',
    });
    expect(body.greeting_template).toBeNull();
  });

  it('trims and keeps a non-blank greeting', () => {
    const body = formValueToBody({
      target_kind: 'tool',
      target_name: 'a',
      greeting_template: '  Hi {pairing_code}  ',
    });
    expect(body.greeting_template).toBe('Hi {pairing_code}');
    expect(body.multichannel).toBe(false);
  });
});

describe('requiredFieldErrors', () => {
  it('demands a target name on the create path', () => {
    expect(requiredFieldErrors({ target_kind: 'agent', target_name: '  ' }, false)).toHaveProperty(
      'target_name',
    );
  });

  it('does not demand the key on the edit path (it is read-only there)', () => {
    expect(requiredFieldErrors({}, true)).toEqual({});
  });

  it('flags an unsupported greeting placeholder inline', () => {
    expect(
      requiredFieldErrors(
        { target_kind: 'agent', target_name: 'a', greeting_template: 'Hi {name}' },
        false,
      ),
    ).toHaveProperty('greeting_template');
  });

  it('accepts a blank greeting without error (it means no greeting)', () => {
    expect(
      requiredFieldErrors({ target_kind: 'agent', target_name: 'a', greeting_template: '' }, false),
    ).not.toHaveProperty('greeting_template');
  });
});
