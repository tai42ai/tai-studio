import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { InjectionList } from './InputInjectionRow';
import type { ResolvedTemplateJq } from './catalog';
import type { StateInjection } from './types';

const INPUT_JQ: ResolvedTemplateJq[] = [
  {
    name: 'current',
    ref: 'current',
    template: 'tally',
    purpose: 'input',
    description: 'the head',
  },
];

function Harness({ inputJq = INPUT_JQ }: { readonly inputJq?: ResolvedTemplateJq[] }) {
  const [injections, setInjections] = useState<StateInjection[]>([]);
  return (
    <InjectionList
      injections={injections}
      inputJq={inputJq}
      onChange={(next) => {
        setInjections([...next]);
      }}
    />
  );
}

describe('InjectionList', () => {
  it('adds a template-jq injection defaulting to the first input jq', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Add input' }));
    expect(screen.getByTestId('injection-row-0')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Injection source 1' })).toHaveTextContent(
      'current',
    );
  });

  it('adds a custom injection when no input jq is available', async () => {
    const user = userEvent.setup();
    render(<Harness inputJq={[]} />);
    await user.click(screen.getByRole('button', { name: 'Add input' }));
    expect(screen.getByLabelText('Custom injection jq 1')).toBeInTheDocument();
  });

  it('switches a row to a custom jq and back to a template jq', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Add input' }));
    await user.click(screen.getByRole('combobox', { name: 'Injection source 1' }));
    await user.click(await screen.findByRole('option', { name: 'Custom jq' }));
    expect(screen.getByLabelText('Custom injection jq 1')).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Injection source 1' }));
    await user.click(await screen.findByRole('option', { name: 'current — the head' }));
    expect(screen.queryByLabelText('Custom injection jq 1')).not.toBeInTheDocument();
  });

  it('edits the into field and removes the row', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Add input' }));
    await user.type(screen.getByLabelText('Into field 1'), 'opening');
    expect(screen.getByLabelText('Into field 1')).toHaveValue('opening');
    await user.click(screen.getByRole('button', { name: 'Remove input 1' }));
    expect(screen.queryByTestId('injection-row-0')).not.toBeInTheDocument();
  });
});
