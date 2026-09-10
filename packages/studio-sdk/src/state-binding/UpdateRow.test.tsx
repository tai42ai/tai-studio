import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { UpdateList } from './UpdateRow';
import type { ResolvedTemplateJq } from './catalog';
import type { BindingSourceSchemas, StateUpdate } from './types';

const UPDATE_JQ: ResolvedTemplateJq[] = [
  {
    name: 'bump',
    ref: 'bump',
    template: 'tally',
    purpose: 'update',
    description: 'add to the tally',
    params: ['total'],
    writes: [['tally']],
  },
];
const SOURCES: BindingSourceSchemas = { output: [{ path: ['total'], label: 'total' }] };

function Harness({ updateJq = UPDATE_JQ }: { readonly updateJq?: ResolvedTemplateJq[] }) {
  const [updates, setUpdates] = useState<StateUpdate[]>([]);
  return (
    <UpdateList
      updates={updates}
      updateJq={updateJq}
      sources={SOURCES}
      onChange={(next) => {
        setUpdates([...next]);
      }}
    />
  );
}

describe('UpdateList', () => {
  it('adds a template update showing its declared writes and the adapter mapping', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Add update' }));
    expect(screen.getByText('writes: tally')).toBeInTheDocument();
    // The named update's adapter renders one mapping row per declared input key.
    expect(screen.getByTestId('adapter-row-total')).toBeInTheDocument();
  });

  it('seeds a new template update with a null adapter (never the empty string)', async () => {
    const user = userEvent.setup();
    const calls: StateUpdate[][] = [];
    function Spy() {
      const [updates, setUpdates] = useState<StateUpdate[]>([]);
      return (
        <UpdateList
          updates={updates}
          updateJq={UPDATE_JQ}
          sources={SOURCES}
          onChange={(next) => {
            calls.push([...next]);
            setUpdates([...next]);
          }}
        />
      );
    }
    render(<Spy />);
    await user.click(screen.getByRole('button', { name: 'Add update' }));
    // The add itself seeds `adapter: null`; the mount-time default is compiled after.
    expect(calls[0]?.[0]?.adapter).toBeNull();
    // At no point is the empty string stored (the platform refuses an empty adapter).
    expect(calls.some((call) => call[0]?.adapter === '')).toBe(false);
  });

  it('adds a custom update when no update jq is available', async () => {
    const user = userEvent.setup();
    render(<Harness updateJq={[]} />);
    await user.click(screen.getByRole('button', { name: 'Add update' }));
    expect(screen.getByLabelText('Custom update jq 1')).toBeInTheDocument();
  });

  it('switches a template update to custom and exposes the op-id field', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Add update' }));
    await user.click(screen.getByRole('combobox', { name: 'Update source 1' }));
    await user.click(await screen.findByRole('option', { name: 'Custom jq' }));
    expect(screen.getByLabelText('Custom update jq 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Op id')).toBeInTheDocument();
  });

  it('removes the row', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Add update' }));
    await user.click(screen.getByRole('button', { name: 'Remove update 1' }));
    expect(screen.queryByTestId('update-row-0')).not.toBeInTheDocument();
  });
});
