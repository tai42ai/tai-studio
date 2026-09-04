/**
 * Pure-unit coverage of the route form's schema builder and the value <-> wire-body
 * mappers: the create/edit schema shape, prefill from every route variant, the flat
 * body a form value flattens to (with the per-variant field exclusivity the contract
 * enforces), and the inline required-field guard.
 */
import { describe, expect, it } from 'vitest';
import { validateAgainstSchema } from '@tai42/studio-sdk';

import { makeRoute } from './test-utils';
import {
  blankRouteValue,
  formValueToBody,
  requiredFieldErrors,
  routeFormSchema,
  routeToFormValue,
  type RouteFormValue,
} from './route-schema';

describe('routeFormSchema', () => {
  it('makes route_name an editable string on create', () => {
    const props = routeFormSchema().properties;
    expect(props?.route_name).toMatchObject({ type: 'string', title: 'Route name' });
  });

  it('pins route_name to a read-only const on edit', () => {
    const props = routeFormSchema('chat').properties;
    expect(props?.route_name).toMatchObject({ const: 'chat', title: 'Route name' });
  });

  it('carries the two jq expression annotations only on the tool variant', () => {
    const target = routeFormSchema().properties?.target;
    const variants = target?.oneOf ?? [];
    const tool = variants.find((v) => v.properties?.target_kind?.const === 'tool');
    const agent = variants.find((v) => v.properties?.target_kind?.const === 'agent');
    expect(tool?.properties?.payload_expr?.['x-tai42-expression']).toMatchObject({
      language: 'jq',
    });
    expect(tool?.properties?.reply_expr?.['x-tai42-expression']).toMatchObject({ language: 'jq' });
    expect(agent?.properties?.payload_expr).toBeUndefined();
  });

  it('accepts a fully-populated tool + channel value under its own schema', () => {
    const value: RouteFormValue = {
      route_name: 'support',
      target: { target_kind: 'tool', target_name: 'lookup', payload_expr: '.', reply_expr: '.' },
      delivery: { door: 'channel', channel: 'whatsapp', our_identity: '+1' },
      execution_key: 'svc',
      initial_mode: 'agent',
    };
    expect(validateAgainstSchema(routeFormSchema(), value)).toEqual({});
  });
});

describe('blankRouteValue', () => {
  it('seeds only the defaulted mode, leaving the variant pickers unselected', () => {
    expect(blankRouteValue()).toEqual({ initial_mode: 'agent' });
  });
});

describe('routeToFormValue', () => {
  it('prefills a tool + api route, keeping the set expressions and override', () => {
    const value = routeToFormValue(
      makeRoute({
        route_name: 'acct',
        door: 'api',
        channel: null,
        our_identity: null,
        callback_url: 'https://x/y',
        target_kind: 'tool',
        target_name: 'lookup',
        payload_expr: '.message',
        reply_expr: '.result',
        initial_mode: 'manual',
        turns_per_hour_override: 30,
        error_reply_text: 'sorry',
      }),
    );
    expect(value).toEqual({
      route_name: 'acct',
      execution_key: 'svc-chat',
      initial_mode: 'manual',
      turns_per_hour_override: 30,
      error_reply_text: 'sorry',
      target: {
        target_kind: 'tool',
        target_name: 'lookup',
        payload_expr: '.message',
        reply_expr: '.result',
      },
      delivery: { door: 'api', callback_url: 'https://x/y' },
    });
  });

  it('prefills an agent + channel route, dropping the null expressions and override', () => {
    const value = routeToFormValue(
      makeRoute({
        target_kind: 'agent',
        target_name: 'assistant',
        payload_expr: null,
        reply_expr: null,
        door: 'channel',
        channel: 'sms',
        our_identity: '+1555',
        turns_per_hour_override: null,
        error_reply_text: null,
      }),
    );
    expect(value.target).toEqual({ target_kind: 'agent', target_name: 'assistant' });
    expect(value.delivery).toEqual({ door: 'channel', channel: 'sms', our_identity: '+1555' });
    expect(value.turns_per_hour_override).toBeUndefined();
    expect(value.error_reply_text).toBeUndefined();
  });

  it('tolerates null channel identity fields on a prefill', () => {
    const value = routeToFormValue(
      makeRoute({ door: 'channel', channel: null, our_identity: null }),
    );
    expect(value.delivery).toEqual({ door: 'channel', channel: '', our_identity: '' });
  });
});

describe('formValueToBody', () => {
  it('flattens a tool + channel value and nulls the api-only field', () => {
    const body = formValueToBody({
      route_name: 'support',
      target: { target_kind: 'tool', target_name: 'lookup', payload_expr: '.a', reply_expr: '.b' },
      delivery: { door: 'channel', channel: 'whatsapp', our_identity: '+1' },
      execution_key: 'svc',
      initial_mode: 'agent',
      turns_per_hour_override: 12,
      error_reply_text: 'oops',
    });
    expect(body).toEqual({
      route_name: 'support',
      door: 'channel',
      target_kind: 'tool',
      target_name: 'lookup',
      payload_expr: '.a',
      reply_expr: '.b',
      initial_mode: 'agent',
      execution_key: 'svc',
      channel: 'whatsapp',
      our_identity: '+1',
      callback_url: null,
      turns_per_hour_override: 12,
      error_reply_text: 'oops',
    });
  });

  it('nulls the tool-only and channel-only fields for an agent + api value', () => {
    const body = formValueToBody({
      route_name: 'acct',
      target: { target_kind: 'agent', target_name: 'assistant' },
      delivery: { door: 'api', callback_url: 'https://x/y' },
      execution_key: 'svc',
      initial_mode: 'manual',
    });
    expect(body).toMatchObject({
      target_kind: 'agent',
      payload_expr: null,
      reply_expr: null,
      door: 'api',
      callback_url: 'https://x/y',
      channel: null,
      our_identity: null,
      turns_per_hour_override: null,
      error_reply_text: null,
    });
  });

  it('falls back safely on an entirely empty value (unreachable post-validation)', () => {
    const body = formValueToBody({});
    expect(body).toEqual({
      route_name: '',
      door: 'api',
      target_kind: 'agent',
      target_name: '',
      payload_expr: null,
      reply_expr: null,
      initial_mode: 'agent',
      execution_key: '',
      channel: null,
      our_identity: null,
      callback_url: null,
      turns_per_hour_override: null,
      error_reply_text: null,
    });
  });
});

describe('requiredFieldErrors', () => {
  it('flags the blank required identity fields on a create', () => {
    const errors = requiredFieldErrors({ initial_mode: 'agent' }, false);
    expect(errors.route_name).toBe('A route name is required.');
    expect(errors.execution_key).toBe('An execution key is required.');
  });

  it('rejects a non-slug route name', () => {
    expect(requiredFieldErrors({ route_name: 'Bad Name' }, false).route_name).toMatch(/slug/);
  });

  it('skips the route-name check on edit (the name is read-only)', () => {
    expect(requiredFieldErrors({ initial_mode: 'agent' }, true).route_name).toBeUndefined();
  });

  it('names the blank field per target kind and per door', () => {
    const toolChannel = requiredFieldErrors(
      {
        route_name: 'ok',
        execution_key: 'svc',
        target: { target_kind: 'tool', target_name: '  ' },
        delivery: { door: 'channel', channel: '', our_identity: '' },
      },
      false,
    );
    expect(toolChannel['target.target_name']).toBe('A tool name is required.');
    expect(toolChannel['delivery.channel']).toBe('A channel is required.');
    expect(toolChannel['delivery.our_identity']).toBe('An identity is required.');

    const agentApi = requiredFieldErrors(
      {
        route_name: 'ok',
        execution_key: 'svc',
        target: { target_kind: 'agent', target_name: '' },
        delivery: { door: 'api', callback_url: '' },
      },
      false,
    );
    expect(agentApi['target.target_name']).toBe('An agent name is required.');
    expect(agentApi['delivery.callback_url']).toBe('A callback URL is required.');
  });

  it('rejects a non-https or relative callback URL and passes an absolute https one', () => {
    const withUrl = (callback_url: string): string | undefined =>
      requiredFieldErrors(
        {
          route_name: 'ok',
          execution_key: 'svc',
          target: { target_kind: 'agent', target_name: 'assistant' },
          delivery: { door: 'api', callback_url },
        },
        false,
      )['delivery.callback_url'];
    expect(withUrl('http://sink.example/cb')).toBe('Must be an absolute https URL.');
    expect(withUrl('sink.example/cb')).toBe('Must be an absolute https URL.');
    expect(withUrl('https://sink.example/cb')).toBeUndefined();
  });

  it('rejects a channel name carrying a colon and passes a clean one', () => {
    const withChannel = (channel: string): string | undefined =>
      requiredFieldErrors(
        {
          route_name: 'ok',
          execution_key: 'svc',
          target: { target_kind: 'agent', target_name: 'assistant' },
          delivery: { door: 'channel', channel, our_identity: '+1' },
        },
        false,
      )['delivery.channel'];
    expect(withChannel('whats:app')).toBe('Use a ":"-free channel name.');
    expect(withChannel('whatsapp')).toBeUndefined();
  });

  it('returns no errors for a complete, valid value', () => {
    expect(
      requiredFieldErrors(
        {
          route_name: 'ok-1',
          execution_key: 'svc',
          target: { target_kind: 'tool', target_name: 'lookup' },
          delivery: { door: 'channel', channel: 'sms', our_identity: '+1' },
        },
        false,
      ),
    ).toEqual({});
  });
});
