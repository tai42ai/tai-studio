/**
 * Tests for {@link PolicySection}'s jq-condition field after its graduation to the
 * SDK {@link ExpressionField}: the inline condition still round-trips its value, its
 * visual-editor door appears ONLY when a jq editor is registered (and stays absent
 * otherwise), and the declaration it hands the editor carries an honest
 * JqAuthContext shape, a live sample from the sample-context editor, and the
 * fail-closed `validate-condition` guard as its `serverValidate` hook.
 */
import { useEffect, type ReactElement } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError, type ApiClient } from '@tai42/api-client';
import {
  EXPRESSION_EDITOR_CONTRACT_VERSION,
  ExpressionEditorsProvider,
  type ExpressionEditorContribution,
  type ExpressionEditorProps,
  type ExpressionFieldDeclaration,
} from '@tai42/studio-sdk';

import { PolicySection } from './PolicySection';
import { renderWithProviders } from './test-utils';

function stubClient(methods: Partial<Record<keyof ApiClient, unknown>>): ApiClient {
  return methods as unknown as ApiClient;
}

/** The declaration the fake editor last received, captured for direct exercise. It
 *  is read through {@link captured} (a getter), not the bare field, so its type
 *  stays the union — a direct field read narrows to its `null` seed since TS cannot
 *  see the assignment that happens inside the editor's effect. */
const box: { declaration: ExpressionFieldDeclaration | null } = { declaration: null };
const captured = (): ExpressionFieldDeclaration | null => box.declaration;

function CapturingEditor({ declaration }: ExpressionEditorProps): ReactElement {
  useEffect(() => {
    box.declaration = declaration;
  }, [declaration]);
  return <div data-testid="fake-editor" />;
}

function withJqEditor(node: ReactElement): ReactElement {
  const editors = new Map<string, ExpressionEditorContribution>([
    [
      'jq',
      {
        language: 'jq',
        contractVersion: EXPRESSION_EDITOR_CONTRACT_VERSION,
        load: () => Promise.resolve({ Editor: CapturingEditor }),
      },
    ],
  ]);
  return <ExpressionEditorsProvider editors={editors}>{node}</ExpressionEditorsProvider>;
}

describe('PolicySection — jq condition expression field', () => {
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

  it('grows a visual-editor door only when a jq editor is registered', async () => {
    // No provider: plain textarea, no launcher.
    const { unmount } = renderWithProviders(
      <PolicySection idPrefix="p" onChange={vi.fn()} onConditionTestFailedChange={vi.fn()} />,
      { client: stubClient({}) },
    );
    expect(
      screen.queryByRole('button', { name: /open the visual editor for jq condition/i }),
    ).not.toBeInTheDocument();
    unmount();

    // Registered jq editor: the door appears.
    renderWithProviders(
      withJqEditor(
        <PolicySection idPrefix="p" onChange={vi.fn()} onConditionTestFailedChange={vi.fn()} />,
      ),
      { client: stubClient({}) },
    );
    expect(
      await screen.findByRole('button', {
        name: /open the visual editor for jq condition/i,
      }),
    ).toBeInTheDocument();
  });

  it('hands the editor a jq declaration wired to the JqAuthContext shape and validate guard', async () => {
    box.declaration = null;
    const user = userEvent.setup();
    const validateCondition = vi.fn();
    renderWithProviders(
      withJqEditor(
        <PolicySection idPrefix="p" onChange={vi.fn()} onConditionTestFailedChange={vi.fn()} />,
      ),
      { client: stubClient({ validateCondition }) },
    );

    await user.click(
      await screen.findByRole('button', { name: /open the visual editor for jq condition/i }),
    );
    await screen.findByTestId('fake-editor');
    await waitFor(() => {
      expect(captured()).not.toBeNull();
    });
    const declaration = captured();
    if (declaration === null) throw new Error('declaration not captured');

    // Language + honest shape.
    expect(declaration.language).toBe('jq');
    expect(declaration.shape?.id).toBe('tai42.access-control.jq-auth-context');
    expect(declaration.shape?.returns).toMatch(/true or false/i);
    // The FULL JqAuthContext key set — a dropped key must fail this test.
    expect(declaration.shape?.keys.map((k) => k.name)).toEqual([
      'sub',
      'scopes',
      'identity',
      'policy',
      'context',
      'request',
      'system',
    ]);

    // The Test panel seeds from the sample-context editor (pre-seeded skeleton).
    expect(declaration.sampleInput?.()).toMatchObject({ sub: 'anon', scopes: [] });

    // serverValidate routes to the guard with the sample and maps its outcomes.
    validateCondition.mockResolvedValueOnce({ ok: true, result: true });
    await expect(
      declaration.serverValidate?.({ expression: '.policy.limit > 0', sampleInput: { sub: 'x' } }),
    ).resolves.toEqual({ ok: true, compiles: true, message: 'allows the sample' });
    expect(validateCondition).toHaveBeenLastCalledWith({
      condition: '.policy.limit > 0',
      sample_context: { sub: 'x' },
    });

    validateCondition.mockResolvedValueOnce({ ok: true, result: false });
    await expect(
      declaration.serverValidate?.({ expression: '.policy.limit > 0', sampleInput: { sub: 'x' } }),
    ).resolves.toEqual({ ok: true, compiles: true, message: 'denies the sample' });

    // A non-object sample compiles-only — the guard is called WITHOUT a sample.
    validateCondition.mockResolvedValueOnce({ ok: true, result: null });
    await expect(
      declaration.serverValidate?.({ expression: '.x', sampleInput: 'not-an-object' }),
    ).resolves.toEqual({ ok: true, compiles: true, message: undefined });
    expect(validateCondition).toHaveBeenLastCalledWith({ condition: '.x' });

    // A 400 from the guard maps to a not-ok result carrying its verbatim message.
    validateCondition.mockRejectedValueOnce(new ApiError('bad jq', 400));
    await expect(
      declaration.serverValidate?.({ expression: '.(', sampleInput: { sub: 'x' } }),
    ).resolves.toEqual({ ok: false, compiles: false, message: 'bad jq' });
  });

  it('falls the sample provider back to the skeleton when the sample editor is blank or invalid', async () => {
    box.declaration = null;
    const user = userEvent.setup();
    renderWithProviders(
      withJqEditor(
        <PolicySection idPrefix="p" onChange={vi.fn()} onConditionTestFailedChange={vi.fn()} />,
      ),
      { client: stubClient({}) },
    );
    await user.click(
      await screen.findByRole('button', { name: /open the visual editor for jq condition/i }),
    );
    await screen.findByTestId('fake-editor');
    await waitFor(() => {
      expect(captured()).not.toBeNull();
    });

    const sampleEditor = screen.getByLabelText('Sample context (JSON)');

    // Blank sample → the skeleton default.
    await user.clear(sampleEditor);
    await waitFor(() => {
      expect(captured()?.sampleInput?.()).toMatchObject({ sub: 'anon' });
    });

    // Malformed sample → the skeleton default (the catch path), never a throw.
    await user.type(sampleEditor, 'not-json');
    await waitFor(() => {
      expect(captured()?.sampleInput?.()).toMatchObject({ sub: 'anon' });
    });
  });
});
