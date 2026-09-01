/**
 * Render-level WIRING pin for {@link PolicySection}'s jq-condition field. The
 * sibling `PolicySection.test.tsx` unit-tests the three exported helpers —
 * `CONDITION_SHAPE`, `makeConditionServerValidate`, `liveSampleInput` — in
 * isolation, but a green helper suite says nothing about whether the RENDERED
 * `PolicySection` actually hands those objects to its `JqField` bound to live
 * component state. That is the seam a `JqField` migration is most likely to
 * silently drop (a forgotten `shape=` / `sampleInput=` / `serverValidate=` prop
 * still typechecks and renders fine), so this file pins it.
 *
 * It replaces ONLY `JqField` in `@tai42/jq-studio` with a capture stub that records
 * the props it receives on every render (the rest of that module, and the whole SDK
 * barrel — `useApi`, `ApiProvider`, the design-system primitives — stay real via
 * `importOriginal`). It then
 * asserts the captured props are the real wired objects: `shape` is `CONDITION_SHAPE`
 * by identity; `serverValidate` routes to the client's `validateCondition`; `value`
 * tracks the live condition state through `onChange`; and `sampleInput` reflects the
 * LIVE "Sample context (JSON)" editor — a valid object when it parses, `undefined`
 * (upstream skeleton fallback) when it is blank or malformed. This restores
 * origin/main's field-wiring test intent at the new `JqField` seam.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApiClient } from '@tai42/api-client';
import { ApiProvider } from '@tai42/studio-sdk';
// Only `JqField` is stubbed (below); the props type comes from the real module.
import type { JqFieldProps } from '@tai42/jq-studio';

import { CONDITION_SHAPE, PolicySection } from './PolicySection';

// A mutable holder for the latest props the stubbed JqField was rendered with.
// Created via vi.hoisted so the hoisted vi.mock factory below can close over it.
const jqField = vi.hoisted(() => ({ props: undefined as JqFieldProps | undefined }));

vi.mock('@tai42/jq-studio', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tai42/jq-studio')>();
  return {
    ...actual,
    // Capture-only stub: record the props (so the test can drive them) and render
    // nothing. The real JqField's own behaviour is covered by jq-studio's suite and
    // by PolicySection.test.tsx's round-trip/door tests against the real component.
    JqField: (props: JqFieldProps): null => {
      jqField.props = props;
      return null;
    },
  };
});

function stubClient(methods: Partial<Record<keyof ApiClient, unknown>>): ApiClient {
  return methods as unknown as ApiClient;
}

function renderPolicySection(client: ApiClient): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return (
      <QueryClientProvider client={queryClient}>
        <ApiProvider value={client}>{children}</ApiProvider>
      </QueryClientProvider>
    );
  }
  render(<PolicySection idPrefix="p" onChange={vi.fn()} onConditionTestFailedChange={vi.fn()} />, {
    wrapper: Wrapper,
  });
}

afterEach(() => {
  jqField.props = undefined;
  vi.clearAllMocks();
});

describe('PolicySection — JqField wiring (render-level)', () => {
  it('hands the field the CONDITION_SHAPE object by identity', () => {
    renderPolicySection(stubClient({}));
    expect(jqField.props).toBeDefined();
    // Identity, not deep-equal: the field must receive the very exported descriptor,
    // so a copy/inline-literal regression (which would drift from the helper suite)
    // fails here.
    expect(jqField.props?.shape).toBe(CONDITION_SHAPE);
  });

  it('wires serverValidate so the field validates through the client guard', async () => {
    const validateCondition = vi.fn().mockResolvedValue({ ok: true, result: true });
    renderPolicySection(stubClient({ validateCondition }));

    const serverValidate = jqField.props?.serverValidate;
    expect(serverValidate).toBeInstanceOf(Function);

    await expect(
      serverValidate?.({ expression: '.policy.limit > 0', sampleInput: { sub: 'x' } }),
    ).resolves.toEqual({ ok: true, compiles: true, message: 'allows the sample' });
    // Drove the field's validator → it reached the stubbed client's guard.
    expect(validateCondition).toHaveBeenCalledWith({
      condition: '.policy.limit > 0',
      sample_context: { sub: 'x' },
    });
  });

  it('binds the field value to live condition state through onChange', () => {
    renderPolicySection(stubClient({}));
    expect(jqField.props?.value).toBe('');

    act(() => {
      jqField.props?.onChange('.policy.limit > 0');
    });
    // The controlled value round-trips back through PolicySection's state.
    expect(jqField.props?.value).toBe('.policy.limit > 0');
  });

  it('feeds sampleInput from the LIVE sample-context editor, degrading to undefined', () => {
    renderPolicySection(stubClient({}));
    // getByLabelText returns the live textarea (non-null) — the sample-context editor
    // PolicySection feeds JqField.sampleInput from.
    const textarea = screen.getByLabelText('Sample context (JSON)');

    // A valid JSON object in the editor → sampleInput() yields the parsed object.
    fireEvent.change(textarea, {
      target: { value: JSON.stringify({ sub: 'live', scopes: ['admin'] }) },
    });
    expect(jqField.props?.sampleInput?.()).toEqual({ sub: 'live', scopes: ['admin'] });

    // Blank editor → undefined, so JqField falls back to CONDITION_SHAPE.sample upstream.
    fireEvent.change(textarea, { target: { value: '   ' } });
    expect(jqField.props?.sampleInput?.()).toBeUndefined();

    // Malformed JSON → undefined (never seeds Test with junk).
    fireEvent.change(textarea, { target: { value: 'not-json' } });
    expect(jqField.props?.sampleInput?.()).toBeUndefined();
  });
});
