/**
 * Unit tests for the pure add-schedule model: kwargs parsing, field validation, and
 * submit-body assembly (including the optional-subject branch).
 */
import { describe, expect, it } from 'vitest';

import {
  buildScheduleBody,
  CRON_FIELDS_MESSAGE,
  parseKwargs,
  splitCronExpression,
  validateScheduleForm,
} from './schedule-form';

describe('parseKwargs', () => {
  it('treats a blank field as an empty object', () => {
    expect(parseKwargs('   ')).toEqual({ ok: true, value: {} });
  });

  it('accepts a JSON object', () => {
    expect(parseKwargs('{"a": 1}')).toEqual({ ok: true, value: { a: 1 } });
  });

  it('rejects malformed JSON with a message', () => {
    const result = parseKwargs('{');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('valid JSON');
  });

  it('rejects a non-object payload', () => {
    expect(parseKwargs('[1, 2]')).toEqual({ ok: false, message: 'Kwargs must be a JSON object.' });
    expect(parseKwargs('42')).toEqual({ ok: false, message: 'Kwargs must be a JSON object.' });
  });
});

describe('validateScheduleForm', () => {
  it('flags a missing name and tool', () => {
    const v = validateScheduleForm({
      name: '  ',
      tool: null,
      mode: 'crontab',
      interval: '',
      cron: '',
    });
    expect(v.nameMissing).toBe(true);
    expect(v.toolMissing).toBe(true);
    expect(v.cronMissing).toBe(true);
  });

  it('flags a cron expression of the wrong length, never a blank one', () => {
    const v = (cron: string) =>
      validateScheduleForm({ name: 'x', tool: 't', mode: 'crontab', interval: '', cron });
    expect(v('0 2 * *').cronInvalid).toBe(true);
    expect(v('0 2 * * * * *').cronInvalid).toBe(true);
    expect(v('0 2 * * *').cronInvalid).toBe(false);
    expect(v('30 0 2 * * *').cronInvalid).toBe(false);
    expect(v('').cronInvalid).toBe(false);
    expect(v('').cronMissing).toBe(true);
    expect(
      validateScheduleForm({ name: 'x', tool: 't', mode: 'interval', interval: '5', cron: '0 2' })
        .cronInvalid,
    ).toBe(false);
  });

  it('flags a non-positive or non-numeric interval only in interval mode', () => {
    expect(
      validateScheduleForm({ name: 'x', tool: 't', mode: 'interval', interval: '0', cron: '' })
        .intervalInvalid,
    ).toBe(true);
    expect(
      validateScheduleForm({ name: 'x', tool: 't', mode: 'interval', interval: '30', cron: '' })
        .intervalInvalid,
    ).toBe(false);
    expect(
      validateScheduleForm({
        name: 'x',
        tool: 't',
        mode: 'crontab',
        interval: '',
        cron: '0 2 * * *',
      }).intervalInvalid,
    ).toBe(false);
  });
});

describe('splitCronExpression', () => {
  it('maps five fields in order', () => {
    expect(splitCronExpression(' */5  1 2 3 4 ')).toEqual({
      ok: true,
      fields: { minute: '*/5', hour: '1', day_of_month: '2', month_of_year: '3', day_of_week: '4' },
    });
  });

  it('drops the leading seconds field of a six-field expression', () => {
    expect(splitCronExpression('30 0 9 * * 1')).toEqual({
      ok: true,
      fields: { minute: '0', hour: '9', day_of_month: '*', month_of_year: '*', day_of_week: '1' },
    });
  });

  it('refuses any other field count with the field message', () => {
    expect(splitCronExpression('0 9 * *')).toEqual({ ok: false, message: CRON_FIELDS_MESSAGE });
    expect(splitCronExpression('0 0 9 * * 1 2')).toEqual({
      ok: false,
      message: CRON_FIELDS_MESSAGE,
    });
    expect(CRON_FIELDS_MESSAGE).toBe(
      'Use 5 fields (minute hour day-of-month month day-of-week), or 6 with a leading seconds field.',
    );
  });
});

describe('buildScheduleBody', () => {
  const base = {
    tool: 'run_report',
    name: 'nightly',
    mode: 'crontab' as const,
    intervalValue: NaN,
    cron: '0 2 * * *',
    subjectTarget: '',
    subjectKind: '',
    subjectKey: '',
    stateBinding: null,
    executionKey: '',
    contract: { startExpr: null, cancelExpr: null, resumeExpr: null, extrasExpr: null },
  };

  it('assembles a crontab body naming the base tool and the five cadence fields', () => {
    const result = buildScheduleBody(base, { a: 1 });
    expect(result).toEqual({
      ok: true,
      body: {
        // The server resolves the backend's schedule vehicle; the request names the base tool.
        tool_name: 'run_report',
        tool_kwargs: { a: 1 },
        cadence: {
          kind: 'crontab',
          minute: '0',
          hour: '2',
          day_of_month: '*',
          month_of_year: '*',
          day_of_week: '*',
        },
        schedule_name: 'nightly',
      },
    });
  });

  it('sends an interval cadence in interval mode', () => {
    const result = buildScheduleBody({ ...base, mode: 'interval', intervalValue: 60 }, {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body.cadence).toEqual({ kind: 'interval', every: 60 });
  });

  it('refuses a cron expression of the wrong length on the cron field', () => {
    expect(buildScheduleBody({ ...base, cron: '0 2 * *' }, {})).toEqual({
      ok: false,
      field: 'cron',
      message: CRON_FIELDS_MESSAGE,
    });
  });

  it('sends a fully-specified subject as the top-level door field, never a tool kwarg', () => {
    const result = buildScheduleBody(
      { ...base, subjectTarget: 'conversation:main', subjectKind: 'person', subjectKey: 'a-42' },
      {},
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.subject).toEqual({
        target_kind: 'conversation',
        target_name: 'main',
        kind: 'person',
        key: 'a-42',
      });
      expect('subject' in (result.body.tool_kwargs ?? {})).toBe(false);
    }
  });

  it('keeps a tool argument of its own named subject in tool_kwargs untouched', () => {
    const result = buildScheduleBody(base, { subject: 'a plain string' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.tool_kwargs).toEqual({ subject: 'a plain string' });
      expect('subject' in result.body).toBe(false);
    }
  });

  it('rejects a partially-specified subject', () => {
    const result = buildScheduleBody({ ...base, subjectKind: 'person' }, {});
    expect(result).toEqual({
      ok: false,
      field: 'subject',
      message: 'A subject needs a target, a kind, and a key.',
    });
  });

  it('includes state_binding only when set', () => {
    const binding = { states: [] };
    const result = buildScheduleBody({ ...base, stateBinding: binding }, {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body.state_binding).toBe(binding);
  });

  it('carries the execution key and door jqs, sending each only when set', () => {
    const result = buildScheduleBody(
      {
        ...base,
        executionKey: 'svc-events',
        contract: {
          startExpr: { content: '.args' },
          cancelExpr: null,
          resumeExpr: null,
          extrasExpr: { content: '{ trace: true }' },
        },
      },
      {},
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.execution_key).toBe('svc-events');
      expect(result.body.start_expr).toEqual({ content: '.args' });
      expect(result.body.extras_expr).toEqual({ content: '{ trace: true }' });
      expect('cancel_expr' in result.body).toBe(false);
      expect('resume_expr' in result.body).toBe(false);
    }
  });

  it('refuses a door-contract jq with no execution key', () => {
    const result = buildScheduleBody(
      {
        ...base,
        contract: {
          startExpr: { content: '.args' },
          cancelExpr: null,
          resumeExpr: null,
          extrasExpr: null,
        },
      },
      {},
    );
    expect(result).toEqual({
      ok: false,
      field: 'executionKey',
      message: 'A door-contract jq (start / cancel / resume / extras) needs an execution key.',
    });
  });
});
