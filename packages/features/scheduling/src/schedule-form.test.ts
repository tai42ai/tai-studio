/**
 * Unit tests for the pure add-schedule model: kwargs parsing, field validation, and
 * submit-body assembly (including the optional-subject branch).
 */
import { describe, expect, it } from 'vitest';

import { buildScheduleBody, parseKwargs, validateScheduleForm } from './schedule-form';

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
  };

  it('assembles a crontab body with no subject and no state binding', () => {
    const result = buildScheduleBody(base, { a: 1 });
    expect(result).toEqual({
      ok: true,
      body: {
        tool_name: 'run_report',
        tool_kwargs: { a: 1 },
        schedule_kwargs: { backend_schedule: '0 2 * * *', backend_schedule_name: 'nightly' },
      },
    });
  });

  it('uses the interval value in interval mode', () => {
    const result = buildScheduleBody({ ...base, mode: 'interval', intervalValue: 60 }, {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body.schedule_kwargs.backend_schedule).toBe(60);
  });

  it('folds a fully-specified subject into tool_kwargs', () => {
    const result = buildScheduleBody(
      { ...base, subjectTarget: 'conversation:main', subjectKind: 'person', subjectKey: 'a-42' },
      {},
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.body.tool_kwargs.subject).toEqual({
        target_kind: 'conversation',
        target_name: 'main',
        kind: 'person',
        key: 'a-42',
      });
  });

  it('rejects a partially-specified subject', () => {
    const result = buildScheduleBody({ ...base, subjectKind: 'person' }, {});
    expect(result).toEqual({
      ok: false,
      subjectError: 'A subject needs a target, a kind, and a key.',
    });
  });

  it('includes state_binding only when set', () => {
    const binding = { states: [] };
    const result = buildScheduleBody({ ...base, stateBinding: binding }, {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body.state_binding).toBe(binding);
  });
});
