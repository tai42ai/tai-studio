/**
 * Pure-unit coverage of the route form's schema builder and the value <-> wire-body
 * mappers: the create/edit schema shape, prefill from every route variant, the flat
 * body a form value flattens to (with the per-variant field exclusivity the contract
 * enforces), and the inline required-field guard.
 */
import { validateAgainstSchema } from '@tai42/studio-sdk';
import { describe, expect, it } from 'vitest';

import {
  blankRouteValue,
  formValueToBody,
  requiredFieldErrors,
  routeFormErrors,
  routeFormSchema,
  type RouteFormValue,
  routeSettingsSchema,
  routeToFormValue,
} from './route-schema';
import { makeRoute } from './test-utils';

/** A stored catalogue with every member unset, as the server returns it. */
const NO_REPLY_TEXTS = {
  error: null,
  slow_down: null,
  pairing_code: null,
  pairing_code_invalid: null,
  pairing_linked: null,
  pairing_unlinked: null,
  pairing_not_linked: null,
  pairing_link_unavailable: null,
  pairing_unlink_unavailable: null,
  rejected_unsupported_type: null,
  rejected_too_large: null,
  rejected_could_not_receive: null,
};

describe('routeFormSchema', () => {
  it('makes route_name an editable string on create', () => {
    const props = routeFormSchema().properties;
    expect(props?.route_name).toMatchObject({ type: 'string', title: 'Route name' });
  });

  it('pins route_name to a read-only const on edit', () => {
    const props = routeFormSchema('chat').properties;
    expect(props?.route_name).toMatchObject({ const: 'chat', title: 'Route name' });
  });

  it('carries the five door-contract jq annotations on BOTH target variants', () => {
    const target = routeFormSchema().properties?.target;
    const variants = target?.oneOf ?? [];
    const tool = variants.find((v) => v.properties?.target_kind?.const === 'tool');
    const agent = variants.find((v) => v.properties?.target_kind?.const === 'agent');
    for (const variant of [tool, agent]) {
      for (const field of [
        'start_expr',
        'reply_expr',
        'cancel_expr',
        'resume_expr',
        'extras_expr',
      ]) {
        expect(variant?.properties?.[field]?.['x-tai42-expression']).toMatchObject({
          language: 'jq',
        });
      }
    }
  });

  it('declares $parked on the four door jqs and $turn/$asks/$parked on reply', () => {
    const tool = (routeFormSchema().properties?.target?.oneOf ?? []).find(
      (v) => v.properties?.target_kind?.const === 'tool',
    );
    const variableNames = (field: string): string[] => {
      const annotation = tool?.properties?.[field]?.['x-tai42-expression'] as
        { readonly variables?: readonly { readonly name: string }[] } | undefined;
      return (annotation?.variables ?? []).map((variable) => variable.name);
    };
    for (const field of ['start_expr', 'cancel_expr', 'resume_expr', 'extras_expr']) {
      expect(variableNames(field)).toEqual(['parked']);
    }
    expect(variableNames('reply_expr')).toEqual(['turn', 'asks', 'parked']);
  });

  it('documents the carry keys the deliver: all payload adds', () => {
    const tool = (routeFormSchema().properties?.target?.oneOf ?? []).find(
      (v) => v.properties?.target_kind?.const === 'tool',
    );
    const annotation = tool?.properties?.start_expr?.['x-tai42-expression'] as
      { readonly keys?: readonly { readonly name: string; readonly gloss: string }[] } | undefined;
    const keys = annotation?.keys ?? [];
    const byName = new Map(keys.map((key) => [key.name, key.gloss]));

    expect(byName.get('messages')).toBe(
      'under deliver: all, every message this turn carries, oldest first — each {id, text, accepted_at} plus form, attachments and location when present',
    );
    expect(byName.get('superseded')).toBe(
      "under deliver: all, the earlier messages this turn's lead superseded or carried, oldest first — each in the same shape as messages, present only when non-empty",
    );
  });

  it('accepts a fully-populated tool + channel value under its own schema', () => {
    const value: RouteFormValue = {
      route_name: 'events',
      target: { target_kind: 'tool', target_name: 'lookup', start_expr: '.', reply_expr: '.' },
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
        start_expr: { content: '.message' },
        reply_expr: { content: '.result' },
        initial_mode: 'manual',
        turns_per_hour_override: 30,
        reply_texts: { ...NO_REPLY_TEXTS, error: 'sorry', slow_down: 'One moment.' },
      }),
    );
    expect(value).toEqual({
      route_name: 'acct',
      execution_key: 'svc-chat',
      initial_mode: 'manual',
      overlap: { running: 'continue', deliver: 'one', settle_seconds: 0 },
      turns_per_hour_override: 30,
      reply_texts: { error: 'sorry', slow_down: 'One moment.' },
      target: {
        target_kind: 'tool',
        target_name: 'lookup',
        start_expr: '.message',
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
        start_expr: null,
        reply_expr: null,
        door: 'channel',
        channel: 'sms',
        our_identity: '+1555',
        turns_per_hour_override: null,
        reply_texts: null,
      }),
    );
    expect(value.target).toEqual({ target_kind: 'agent', target_name: 'assistant' });
    expect(value.delivery).toEqual({ door: 'channel', channel: 'sms', our_identity: '+1555' });
    expect(value.turns_per_hour_override).toBeUndefined();
    expect(value.reply_texts).toBeUndefined();
  });
});

describe('formValueToBody', () => {
  it('flattens a tool + channel value, carrying the door jqs and nulling the api-only field', () => {
    const body = formValueToBody({
      route_name: 'events',
      target: {
        target_kind: 'tool',
        target_name: 'lookup',
        start_expr: '.a',
        reply_expr: '.b',
        cancel_expr: '$parked[].id',
      },
      delivery: { door: 'channel', channel: 'whatsapp', our_identity: '+1' },
      execution_key: 'svc',
      initial_mode: 'agent',
      turns_per_hour_override: 12,
      reply_texts: { error: 'oops', pairing_code: 'Your code: {pairing_code}', slow_down: '  ' },
    });
    expect(body).toEqual({
      route_name: 'events',
      door: 'channel',
      target_kind: 'tool',
      target_name: 'lookup',
      start_expr: { content: '.a' },
      reply_expr: { content: '.b' },
      cancel_expr: { content: '$parked[].id' },
      resume_expr: null,
      extras_expr: null,
      initial_mode: 'agent',
      execution_key: 'svc',
      channel: 'whatsapp',
      our_identity: '+1',
      callback_url: null,
      turns_per_hour_override: 12,
      reply_texts: { error: 'oops', pairing_code: 'Your code: {pairing_code}' },
      locale: null,
    });
  });

  it('carries the door jqs on an agent target too, nulling the blank ones', () => {
    const body = formValueToBody({
      route_name: 'acct',
      target: { target_kind: 'agent', target_name: 'assistant', start_expr: '{ q: .message }' },
      delivery: { door: 'api', callback_url: 'https://x/y' },
      execution_key: 'svc',
      initial_mode: 'manual',
    });
    expect(body).toMatchObject({
      target_kind: 'agent',
      start_expr: { content: '{ q: .message }' },
      reply_expr: null,
      cancel_expr: null,
      resume_expr: null,
      extras_expr: null,
      door: 'api',
      callback_url: 'https://x/y',
      channel: null,
      our_identity: null,
      turns_per_hour_override: null,
      reply_texts: null,
    });
  });

  it('falls back safely on an entirely empty value (unreachable post-validation)', () => {
    const body = formValueToBody({});
    expect(body).toEqual({
      route_name: '',
      door: 'api',
      target_kind: 'agent',
      target_name: '',
      start_expr: null,
      reply_expr: null,
      cancel_expr: null,
      resume_expr: null,
      extras_expr: null,
      initial_mode: 'agent',
      execution_key: '',
      channel: null,
      our_identity: null,
      callback_url: null,
      turns_per_hour_override: null,
      reply_texts: null,
      locale: null,
    });
  });
});

describe('overlap policy', () => {
  it('inserts the overlap group after delivery and before execution_key', () => {
    const keys = Object.keys(routeFormSchema().properties ?? {});
    expect(keys.indexOf('overlap')).toBe(keys.indexOf('delivery') + 1);
    expect(keys.indexOf('overlap')).toBe(keys.indexOf('execution_key') - 1);
  });

  it('is a plain-object group titled Overlap with no required fields', () => {
    const overlap = routeFormSchema().properties?.overlap;
    expect(overlap).toMatchObject({ type: 'object', title: 'Overlap' });
    expect(overlap?.description).toMatch(/Leave every field blank for the defaults/);
    expect(overlap?.required).toBeUndefined();
  });

  it('orders running, deliver, settle_seconds with their enums and bounds', () => {
    const overlap = routeFormSchema().properties?.overlap;
    expect(Object.keys(overlap?.properties ?? {})).toEqual([
      'running',
      'deliver',
      'settle_seconds',
    ]);
    expect(overlap?.properties?.running).toMatchObject({
      enum: ['continue', 'cancel'],
      title: 'Running turn',
    });
    expect(overlap?.properties?.deliver).toMatchObject({ enum: ['one', 'all'], title: 'Deliver' });
    expect(overlap?.properties?.settle_seconds).toMatchObject({
      type: ['integer', 'null'],
      minimum: 0,
      maximum: 30,
      title: 'Settle window (seconds)',
    });
  });

  it('validates a partially-filled overlap group with no spurious required errors', () => {
    const value: RouteFormValue = {
      route_name: 'events',
      target: { target_kind: 'agent', target_name: 'assistant' },
      delivery: { door: 'channel', channel: 'whatsapp', our_identity: '+1' },
      execution_key: 'svc',
      overlap: { running: 'cancel' },
    };
    expect(validateAgainstSchema(routeFormSchema(), value)).toEqual({});
  });

  it('copies the stored policy in on prefill', () => {
    const value = routeToFormValue(
      makeRoute({ overlap: { running: 'cancel', deliver: 'all', settle_seconds: 5 } }),
    );
    expect(value.overlap).toEqual({ running: 'cancel', deliver: 'all', settle_seconds: 5 });
  });

  it('omits overlap from the body when the operator set nothing', () => {
    const body = formValueToBody({
      route_name: 'acct',
      target: { target_kind: 'agent', target_name: 'assistant' },
      delivery: { door: 'api', callback_url: 'https://x/y' },
      execution_key: 'svc',
    });
    expect('overlap' in body).toBe(false);
  });

  it('sends only the keys the operator set, never a null policy field', () => {
    const body = formValueToBody({
      route_name: 'acct',
      target: { target_kind: 'agent', target_name: 'assistant' },
      delivery: { door: 'api', callback_url: 'https://x/y' },
      execution_key: 'svc',
      overlap: { deliver: 'all' },
    });
    expect(body.overlap).toEqual({ deliver: 'all' });
  });

  it('carries a full policy through the body', () => {
    const body = formValueToBody({
      route_name: 'acct',
      target: { target_kind: 'agent', target_name: 'assistant' },
      delivery: { door: 'api', callback_url: 'https://x/y' },
      execution_key: 'svc',
      overlap: { running: 'cancel', deliver: 'all', settle_seconds: 5 },
    });
    expect(body.overlap).toEqual({ running: 'cancel', deliver: 'all', settle_seconds: 5 });
  });

  const settleError = (overlap: RouteFormValue['overlap']): string | undefined =>
    requiredFieldErrors(
      {
        route_name: 'ok',
        execution_key: 'svc',
        target: { target_kind: 'agent', target_name: 'assistant' },
        delivery: { door: 'channel', channel: 'sms', our_identity: '+1' },
        overlap,
      },
      false,
    )['overlap.settle_seconds'];

  it('refuses a settle window under continue + one', () => {
    expect(settleError({ settle_seconds: 5 })).toBe(
      'A settle window needs Deliver set to all or Running turn set to cancel.',
    );
    expect(settleError({ running: 'continue', deliver: 'one', settle_seconds: 5 })).toBe(
      'A settle window needs Deliver set to all or Running turn set to cancel.',
    );
  });

  it('allows a settle window once deliver is all or running is cancel', () => {
    expect(settleError({ deliver: 'all', settle_seconds: 5 })).toBeUndefined();
    expect(settleError({ running: 'cancel', settle_seconds: 5 })).toBeUndefined();
  });

  it('allows a zero (or unset) settle window under any combination', () => {
    expect(settleError({ settle_seconds: 0 })).toBeUndefined();
    expect(settleError({ running: 'continue', deliver: 'one' })).toBeUndefined();
    expect(settleError(undefined)).toBeUndefined();
  });
});

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

describe('reply texts', () => {
  const apiRoute = (callback_url: string): RouteFormValue => ({
    route_name: 'ok',
    execution_key: 'svc',
    target: { target_kind: 'agent', target_name: 'assistant' },
    delivery: { door: 'api', callback_url },
  });

  it('groups one optional text field per contract member, each with the document bounds', () => {
    const group = routeFormSchema().properties?.reply_texts;
    expect(group).toMatchObject({ type: 'object', title: 'Reply texts' });
    expect(group?.required).toBeUndefined();
    expect(Object.keys(group?.properties ?? {}).sort()).toEqual(Object.keys(NO_REPLY_TEXTS).sort());
    for (const field of Object.values(group?.properties ?? {})) {
      expect(field).toMatchObject({
        type: ['string', 'null'],
        minLength: 1,
        maxLength: 2000,
        pattern: '\\S',
      });
      expect(field.title).toEqual(expect.any(String));
      expect(field.description).toEqual(expect.any(String));
    }
  });

  it("names the pairing-code reply's two tokens", () => {
    const field = routeFormSchema().properties?.reply_texts?.properties?.pairing_code;
    expect(field?.description).toContain('{pairing_code}');
    expect(field?.description).toContain('{expires_at}');
  });

  it('places the group last, after the turn-rate override', () => {
    const keys = Object.keys(routeFormSchema().properties ?? {});
    expect(keys.at(-1)).toBe('reply_texts');
  });

  it('sends an all-blank catalogue as null, never an empty object', () => {
    const body = formValueToBody({
      ...apiRoute('https://sink.example/cb'),
      reply_texts: { error: ' ', slow_down: '' },
    });
    expect(body.reply_texts).toBeNull();
  });

  it('round-trips a stored catalogue through the form unchanged', () => {
    const stored = { ...NO_REPLY_TEXTS, pairing_linked: 'Linked.', rejected_too_large: 'Too big.' };
    const value = routeToFormValue(makeRoute({ reply_texts: stored }));
    expect(formValueToBody(value).reply_texts).toEqual({
      pairing_linked: 'Linked.',
      rejected_too_large: 'Too big.',
    });
  });
});

describe('routeSettingsSchema', () => {
  const JQ_FIELDS = ['start_expr', 'reply_expr', 'cancel_expr', 'resume_expr', 'extras_expr'];

  it('renders no expressions until a target kind is picked', () => {
    expect(Object.keys(routeSettingsSchema(undefined).properties ?? {})).toEqual([
      'overlap',
      'initial_mode',
      'turns_per_hour_override',
      'reply_texts',
    ]);
  });

  it.each(['agent', 'tool'] as const)(
    'groups the five jq fields of a %s target as "Expressions", first',
    (kind) => {
      const schema = routeSettingsSchema(kind);
      expect(Object.keys(schema.properties ?? {})).toEqual([
        'target',
        'overlap',
        'initial_mode',
        'turns_per_hour_override',
        'reply_texts',
      ]);
      const target = schema.properties?.target;
      expect(target?.title).toBe('Expressions');
      expect(Object.keys(target?.properties ?? {})).toEqual(JQ_FIELDS);
    },
  );

  it("carries each kind's start description, the same text the validation schema holds", () => {
    const variants = routeFormSchema().properties?.target?.oneOf ?? [];
    for (const [index, kind] of (['agent', 'tool'] as const).entries()) {
      expect(routeSettingsSchema(kind).properties?.target?.properties?.start_expr).toEqual(
        variants[index]?.properties?.start_expr,
      );
    }
    expect(
      routeSettingsSchema('agent').properties?.target?.properties?.start_expr?.description,
    ).not.toBe(routeSettingsSchema('tool').properties?.target?.properties?.start_expr?.description);
  });

  it('holds none of the fields the dialog authors itself', () => {
    const keys = Object.keys(routeSettingsSchema('agent').properties ?? {});
    for (const authored of ['route_name', 'delivery', 'execution_key']) {
      expect(keys).not.toContain(authored);
    }
    const target = routeSettingsSchema('tool').properties?.target?.properties ?? {};
    expect(Object.keys(target)).not.toContain('target_name');
  });
});
