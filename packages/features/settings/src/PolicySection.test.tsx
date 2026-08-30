/**
 * Tests for {@link PolicySection}'s jq-condition field after its migration to the
 * SDK-re-exported {@link JqField} (the drop-in @tai42/jq-studio control): the inline
 * condition still round-trips its value, the visual-editor door is now ALWAYS present
 * (the editor is a direct dependency, not a plugin-registered extension), and the
 * shape + serverValidate the field is wired with carry an honest JqAuthContext shape
 * and route to the fail-closed `validate-condition` guard, and its Test panel seeds
 * from the LIVE sample-context editor. The shape/validate/sample wiring is asserted
 * directly against the exported {@link CONDITION_SHAPE}, {@link makeConditionServerValidate},
 * and {@link liveSampleInput} — the real objects/providers the field receives.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError, type ApiClient } from '@tai42/api-client';

import {
  CONDITION_SHAPE,
  liveSampleInput,
  makeConditionServerValidate,
  PolicySection,
} from './PolicySection';
import { renderWithProviders } from './test-utils';

function stubClient(methods: Partial<Record<keyof ApiClient, unknown>>): ApiClient {
  return methods as unknown as ApiClient;
}

describe('PolicySection — jq condition field', () => {
  it('round-trips the inline condition value through onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <PolicySection idPrefix="p" onChange={onChange} onConditionTestFailedChange={vi.fn()} />,
      { client: stubClient({}) },
    );

    await user.type(screen.getByLabelText('jq condition'), '.policy.limit > 0');

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ condition: '.policy.limit > 0', condition_id: null }),
      );
    });
  });

  it('offers an always-present visual-editor door on the jq condition field', async () => {
    // JqField is a direct dependency now (no editor-registry door): the visual editor
    // is always available, so the field renders its door unconditionally. The door
    // folds its field label into its accessible name, so it is pinned by the specific
    // "Open the visual editor for jq condition" name — not a bare /visual editor/.
    renderWithProviders(
      <PolicySection idPrefix="p" onChange={vi.fn()} onConditionTestFailedChange={vi.fn()} />,
      { client: stubClient({}) },
    );
    expect(
      await screen.findByRole('button', { name: 'Open the visual editor for jq condition' }),
    ).toBeInTheDocument();
  });

  it('declares an honest JqAuthContext shape for the condition field', () => {
    expect(CONDITION_SHAPE.id).toBe('tai42.access-control.jq-auth-context');
    expect(CONDITION_SHAPE.returns).toMatch(/true or false/i);
    // The FULL JqAuthContext key set — a dropped key must fail this test.
    expect(CONDITION_SHAPE.keys.map((k) => k.name)).toEqual([
      'sub',
      'scopes',
      'identity',
      'policy',
      'context',
      'request',
      'system',
    ]);
    // The static skeleton the visual editor's Test panel seeds from.
    expect(CONDITION_SHAPE.sample).toMatchObject({ sub: 'anon', scopes: [] });
  });

  it('seeds the visual editor from the LIVE sample-context editor, degrading to the skeleton', () => {
    // The provider JqField.sampleInput receives: a valid editor yields the live
    // parsed object (takes precedence over shape.sample upstream); a blank or
    // malformed editor yields undefined, so JqField falls back to CONDITION_SHAPE.sample.
    expect(liveSampleInput(JSON.stringify({ sub: 'live', scopes: ['admin'] }))).toEqual({
      sub: 'live',
      scopes: ['admin'],
    });
    expect(liveSampleInput('')).toBeUndefined();
    expect(liveSampleInput('   ')).toBeUndefined();
    expect(liveSampleInput('not-json')).toBeUndefined();
    // A non-object (array/scalar) is not a valid sample context → undefined → skeleton.
    expect(liveSampleInput('[1,2,3]')).toBeUndefined();
    expect(liveSampleInput('42')).toBeUndefined();
  });

  it('routes serverValidate to the fail-closed guard and maps its outcomes', async () => {
    const validateCondition = vi.fn();
    const serverValidate = makeConditionServerValidate(stubClient({ validateCondition }));

    // A sample object rides as sample_context; result:true → "allows the sample".
    validateCondition.mockResolvedValueOnce({ ok: true, result: true });
    await expect(
      serverValidate({ expression: '.policy.limit > 0', sampleInput: { sub: 'x' } }),
    ).resolves.toEqual({ ok: true, compiles: true, message: 'allows the sample' });
    expect(validateCondition).toHaveBeenLastCalledWith({
      condition: '.policy.limit > 0',
      sample_context: { sub: 'x' },
    });

    // result:false → "denies the sample".
    validateCondition.mockResolvedValueOnce({ ok: true, result: false });
    await expect(
      serverValidate({ expression: '.policy.limit > 0', sampleInput: { sub: 'x' } }),
    ).resolves.toEqual({ ok: true, compiles: true, message: 'denies the sample' });

    // A non-object sample compiles-only — the guard is called WITHOUT a sample.
    validateCondition.mockResolvedValueOnce({ ok: true, result: null });
    await expect(
      serverValidate({ expression: '.x', sampleInput: 'not-an-object' }),
    ).resolves.toEqual({ ok: true, compiles: true, message: undefined });
    expect(validateCondition).toHaveBeenLastCalledWith({ condition: '.x' });

    // A 400 from the guard maps to a not-ok result carrying its verbatim message.
    validateCondition.mockRejectedValueOnce(new ApiError('bad jq', 400));
    await expect(serverValidate({ expression: '.(', sampleInput: { sub: 'x' } })).resolves.toEqual({
      ok: false,
      compiles: false,
      message: 'bad jq',
    });
  });
});
