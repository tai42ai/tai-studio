/**
 * Pure-unit coverage of the route form's in-form errors: the required-field blank checks
 * scoped to the selected variants, and the document-constraint errors with their field
 * display text (an optional text field left blank carrying none).
 */
import { describe, expect, it } from 'vitest';

import { requiredFieldErrors, routeFormErrors } from './route-form-errors';
import { formValueToBody, routeFormSchema, type RouteFormValue } from './route-schema';

describe('requiredFieldErrors', () => {
  it('flags the blank required identity fields on a create', () => {
    const errors = requiredFieldErrors({ initial_mode: 'agent' }, false);
    expect(errors.route_name).toBe('A route name is required.');
    expect(errors.execution_key).toBe('An execution key is required.');
  });

  it('rejects a non-slug route name with the field text', () => {
    expect(routeFormErrors(routeFormSchema(), { route_name: 'Bad Name' }, false).route_name).toBe(
      'Use lowercase letters, digits and hyphens.',
    );
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
  });
});

describe('routeFormErrors', () => {
  const apiRoute = (callback_url: string): RouteFormValue => ({
    route_name: 'ok',
    execution_key: 'svc',
    target: { target_kind: 'agent', target_name: 'assistant' },
    delivery: { door: 'api', callback_url },
  });
  const callbackError = (callback_url: string): string | undefined =>
    routeFormErrors(routeFormSchema(), apiRoute(callback_url), false)['delivery.callback_url'];

  it('accepts a poll-only api route, with no callback URL', () => {
    expect(routeFormErrors(routeFormSchema(), apiRoute(''), false)).toEqual({});
    expect(formValueToBody(apiRoute(''))).toMatchObject({ door: 'api', callback_url: null });
  });

  it('refuses a callback URL with a user name in-form, with the field text', () => {
    expect(callbackError('https://user@host')).toBe(
      'Must be an absolute https URL with no user name or password.',
    );
  });

  it('refuses a non-https or relative callback URL and passes an absolute https one', () => {
    const text = 'Must be an absolute https URL with no user name or password.';
    expect(callbackError('http://sink.example/cb')).toBe(text);
    expect(callbackError('sink.example/cb')).toBe(text);
    expect(callbackError('https://sink.example/cb')).toBeUndefined();
  });

  it('refuses a channel name carrying a colon in-form and passes a clean one', () => {
    const withChannel = (channel: string): string | undefined =>
      routeFormErrors(
        routeFormSchema(),
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

  it('shows a reply text bound as its field text and accepts a blank reply', () => {
    const withReply = (member: string, text: string): string | undefined =>
      routeFormErrors(
        routeFormSchema(),
        { ...apiRoute('https://sink.example/cb'), reply_texts: { [member]: text } },
        false,
      )[`reply_texts.${member}`];
    expect(withReply('error', 'x'.repeat(2001))).toBe(
      'Enter the reply text (up to 2,000 characters).',
    );
    expect(withReply('pairing_code', 'x'.repeat(2001))).toBe(
      'Enter the reply text (up to 2,000 characters).',
    );
    expect(withReply('error', '   ')).toBeUndefined();
    expect(withReply('slow_down', 'One moment.')).toBeUndefined();
  });

  it('reads the route-name slug and the door rules from the contract document', () => {
    const props = routeFormSchema().properties;
    expect(props?.route_name?.pattern).toBe('^[a-z0-9-]+$');
    const [api, channel] = props?.delivery?.oneOf ?? [];
    expect(api?.required).toEqual(['door']);
    expect(channel?.required).toEqual(['door', 'channel', 'our_identity']);
    expect(props?.turns_per_hour_override).toMatchObject({ type: ['integer', 'null'], minimum: 1 });
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
