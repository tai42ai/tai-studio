import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { StateAttachRow } from './StateAttachRow';
import type { BindingStateOption, BindingTemplateOption, StateAttach } from './types';

const STATES: BindingStateOption[] = [
  {
    name: 'counters',
    attachedTemplates: ['tally'],
    fields: [{ path: ['count'], label: 'count' }],
  },
  { name: 'notes' },
];
const TEMPLATES: BindingTemplateOption[] = [
  {
    name: 'tally',
    templateJq: [
      { name: 'current', purpose: 'input', description: 'the head' },
      { name: 'bump', purpose: 'update', params: ['total'], writes: [['tally']] },
    ],
  },
  { name: 'audit', templateJq: [{ name: 'trail', purpose: 'update', params: ['event'] }] },
];

function blank(): StateAttach {
  return {
    state: '',
    templates: [],
    subject_expr: '',
    scope_expr: null,
    input_injections: [],
    updates: [],
  };
}

function Harness({ onRemove = vi.fn() }: { readonly onRemove?: () => void }) {
  const [attach, setAttach] = useState<StateAttach>(blank());
  return (
    <StateAttachRow
      attach={attach}
      statesCatalog={STATES}
      templatesCatalog={TEMPLATES}
      onChange={setAttach}
      onRemove={onRemove}
    />
  );
}

describe('StateAttachRow', () => {
  it('hides the templates/subject sections until a state is chosen', () => {
    render(<Harness />);
    expect(screen.queryByText('Templates')).not.toBeInTheDocument();
  });

  it('picks a state and reveals the templates, subject, inputs and updates sections', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('combobox', { name: 'State' }));
    await user.click(await screen.findByRole('option', { name: 'counters' }));
    expect(screen.getByText('Templates')).toBeInTheDocument();
    expect(screen.getByLabelText('Subject')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add input' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add update' })).toBeInTheDocument();
  });

  it('shows the attach-on-use hint for a not-yet-attached template pick', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('combobox', { name: 'State' }));
    await user.click(await screen.findByRole('option', { name: 'counters' }));
    // `tally` is already attached → no hint; `audit` is not → hint on pick.
    await user.click(screen.getByRole('checkbox', { name: 'audit' }));
    expect(
      screen.getByText('This template will be attached to the state when you save.'),
    ).toBeInTheDocument();
    // An already-attached pick shows no hint.
    await user.click(screen.getByRole('checkbox', { name: 'tally' }));
    const hints = screen.getAllByText('This template will be attached to the state when you save.');
    expect(hints).toHaveLength(1);
  });

  it('offers the update jq of a checked template in a new update row', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('combobox', { name: 'State' }));
    await user.click(await screen.findByRole('option', { name: 'counters' }));
    await user.click(screen.getByRole('checkbox', { name: 'tally' }));
    await user.click(screen.getByRole('button', { name: 'Add update' }));
    expect(screen.getByText('writes: tally')).toBeInTheDocument();
  });

  it('removes the whole attached state', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<Harness onRemove={onRemove} />);
    await user.click(screen.getByRole('button', { name: /Remove state/ }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('names an unset state on the remove control', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Remove state (unset)' })).toBeInTheDocument();
  });

  it('resets template picks when the state changes', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('combobox', { name: 'State' }));
    await user.click(await screen.findByRole('option', { name: 'counters' }));
    await user.click(screen.getByRole('checkbox', { name: 'tally' }));
    expect(screen.getByRole('checkbox', { name: 'tally' })).toBeChecked();
    await user.click(screen.getByRole('combobox', { name: 'State' }));
    await user.click(await screen.findByRole('option', { name: 'notes' }));
    expect(screen.getByRole('checkbox', { name: 'tally' })).not.toBeChecked();
  });

  it('warns when it overrides an inherited subject, showing the preset subject/scope', () => {
    render(
      <StateAttachRow
        attach={{
          state: 'counters',
          templates: [],
          subject_expr: '.a',
          scope_expr: null,
          input_injections: [],
          updates: [],
        }}
        statesCatalog={STATES}
        templatesCatalog={TEMPLATES}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        inherited={{ subject_expr: '.preset_key', scope_expr: '.region' }}
      />,
    );
    expect(screen.getByText('Overrides the preset’s subject')).toBeInTheDocument();
    expect(screen.getByText('Preset default:')).toBeInTheDocument();
    expect(screen.getByText(/subject: \.preset_key/)).toHaveTextContent('scope: .region');
  });

  it('shows the "Template not attached." error with the raw jq when a bound template is absent', () => {
    render(
      <StateAttachRow
        attach={{
          state: 'counters',
          templates: ['ghost'],
          subject_expr: '.a',
          scope_expr: null,
          input_injections: [{ template_jq: 'ghost.read', jq: null, into: 'x' }],
          updates: [],
        }}
        statesCatalog={STATES}
        templatesCatalog={TEMPLATES}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText('Template not attached.')).toBeInTheDocument();
    // The raw jq is visible, never a blank form.
    expect(screen.getByText(/subject: \.a/)).toBeInTheDocument();
    expect(screen.getByText(/ghost\.read/)).toBeInTheDocument();
    // No live pickers when unresolved.
    expect(screen.queryByRole('button', { name: 'Add input' })).not.toBeInTheDocument();
  });

  it('shows the error state when the bound state itself is absent on the server', () => {
    render(
      <StateAttachRow
        attach={{
          state: 'vanished',
          templates: [],
          subject_expr: '.a',
          scope_expr: null,
          input_injections: [],
          updates: [],
        }}
        statesCatalog={STATES}
        templatesCatalog={TEMPLATES}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText('Template not attached.')).toBeInTheDocument();
  });

  it('offers only the attached templates input jq as expression inserts (never update jq)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('combobox', { name: 'State' }));
    await user.click(await screen.findByRole('option', { name: 'counters' }));
    await user.click(screen.getByRole('checkbox', { name: 'tally' }));
    // The Subject field's inserts are the input jq only; the update `bump` is not offered.
    const subject = screen.getByTestId('binding-jq-subject');
    expect(within(subject).getByRole('button', { name: 'tjq_current({})' })).toBeInTheDocument();
    expect(within(subject).queryByRole('button', { name: 'tjq_bump({})' })).not.toBeInTheDocument();
  });

  it('keeps within-card structure reachable', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('combobox', { name: 'State' }));
    await user.click(await screen.findByRole('option', { name: 'counters' }));
    const card = screen.getByTestId('state-attach-counters');
    expect(within(card).getByLabelText('Scope')).toBeInTheDocument();
  });
});
