import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CompletionInput } from './completion-input';

function Harness({
  fetchCompletions,
  onError,
}: {
  fetchCompletions: (value: string) => Promise<readonly string[]>;
  onError?: (error: unknown) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <CompletionInput
      value={value}
      onChange={setValue}
      fetchCompletions={fetchCompletions}
      onError={onError}
    />
  );
}

describe('CompletionInput', () => {
  it('renders completion suggestions for the typed value and fills the field on select', async () => {
    const user = userEvent.setup();
    const fetchCompletions = vi.fn(async (value: string) => [`${value}-alpha`, `${value}-beta`]);
    render(<Harness fetchCompletions={fetchCompletions} />);

    await user.type(screen.getByRole('combobox'), 'x');

    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['x-alpha', 'x-beta']);

    await user.click(screen.getByRole('option', { name: 'x-beta' }));
    expect(screen.getByRole('combobox')).toHaveValue('x-beta');
    // Suggestions clear after selection.
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('drops a stale earlier response so it cannot overwrite a newer request', async () => {
    const user = userEvent.setup();
    // Each fetch parks on a promise whose resolver is captured by its input value,
    // so resolution order is controlled independently of call order.
    const resolvers = new Map<string, (values: readonly string[]) => void>();
    const fetchCompletions = vi.fn(
      (value: string) =>
        new Promise<readonly string[]>((resolve) => {
          resolvers.set(value, resolve);
        }),
    );
    const resolveFetch = async (value: string, values: readonly string[]) => {
      const resolve = resolvers.get(value);
      if (resolve === undefined) throw new Error(`no in-flight fetch for ${value}`);
      await act(async () => {
        resolve(values);
      });
    };
    render(<Harness fetchCompletions={fetchCompletions} />);

    await user.type(screen.getByRole('combobox'), 'ab');
    // Two overlapping in-flight requests: the earlier 'a' and the newer 'ab'.
    expect(resolvers.has('a')).toBe(true);
    expect(resolvers.has('ab')).toBe(true);

    // The newer request resolves first and renders its suggestions.
    await resolveFetch('ab', ['ab-fresh']);
    expect(screen.getByRole('option')).toHaveTextContent('ab-fresh');

    // The earlier (slow) request resolves last — it is stale and must be dropped,
    // never overwriting the newer request's suggestions.
    await resolveFetch('a', ['a-stale']);
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['ab-fresh']);
    expect(screen.queryByText('a-stale')).not.toBeInTheDocument();
  });

  it('surfaces a fetch failure through onError and shows no suggestions', async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    const fetchCompletions = vi.fn(async () => {
      throw new Error('completions handler failed');
    });
    render(<Harness fetchCompletions={fetchCompletions} onError={onError} />);

    await user.type(screen.getByRole('combobox'), 'q');

    await waitFor(() => {
      expect(onError).toHaveBeenCalled();
    });
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });
});
