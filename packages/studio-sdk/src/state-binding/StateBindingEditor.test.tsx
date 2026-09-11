import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { StateBindingEditor } from './StateBindingEditor';
import type { BindingStateOption, BindingTemplateOption, StateBinding } from './types';

const STATES: BindingStateOption[] = [{ name: 'counters' }, { name: 'notes' }];
const TEMPLATES: BindingTemplateOption[] = [
  { name: 'tally', templateJq: [{ name: 'current', purpose: 'input' }] },
];

function Harness({
  onChange = vi.fn(),
}: {
  readonly onChange?: (value: StateBinding | null) => void;
}) {
  const [value, setValue] = useState<StateBinding | null>(null);
  return (
    <StateBindingEditor
      value={value}
      statesCatalog={STATES}
      templatesCatalog={TEMPLATES}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe('StateBindingEditor', () => {
  it('shows the empty state with an Attach a state action', () => {
    render(<Harness />);
    expect(screen.getByText('No state bound')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Attach a state' })).toBeInTheDocument();
  });

  it('renders a Skeleton while the catalog loads', () => {
    const { container } = render(
      <StateBindingEditor
        value={null}
        statesCatalog={[]}
        templatesCatalog={[]}
        onChange={vi.fn()}
        loading
      />,
    );
    expect(container.querySelector('.tai-skeleton')).not.toBeNull();
  });

  it('shows the catalog error state', () => {
    render(
      <StateBindingEditor
        value={null}
        statesCatalog={[]}
        templatesCatalog={[]}
        onChange={vi.fn()}
        error="boom"
      />,
    );
    expect(screen.getByText("Couldn't load states and templates.")).toBeInTheDocument();
  });

  it('attaches a first state and then a second', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Attach a state' }));
    expect(screen.getByRole('combobox', { name: 'State' })).toBeInTheDocument();
    // With one card open, the footer "Attach a state" adds another.
    await user.click(screen.getByRole('button', { name: 'Attach a state' }));
    expect(screen.getAllByRole('combobox', { name: 'State' })).toHaveLength(2);
  });

  it('emits a { states: [...] } object with at least one attach, never { states: [] }', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Attach a state' }));
    const value = onChange.mock.calls.at(-1)?.[0] as StateBinding | null;
    expect(value).not.toBeNull();
    expect(value?.states.length).toBeGreaterThanOrEqual(1);
  });

  it('flags an empty subject as required once a state is chosen, and clears it when filled', () => {
    const attach = {
      state: 'counters',
      templates: [],
      subject_expr: { content: '' },
      scope_expr: null,
      input_injections: [],
      updates: [],
    };
    const { rerender } = render(
      <StateBindingEditor
        value={{ states: [attach] }}
        statesCatalog={STATES}
        templatesCatalog={TEMPLATES}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Subject is required.')).toBeInTheDocument();
    rerender(
      <StateBindingEditor
        value={{ states: [{ ...attach, subject_expr: { content: '.subject_id' } }] }}
        statesCatalog={STATES}
        templatesCatalog={TEMPLATES}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByText('Subject is required.')).not.toBeInTheDocument();
  });

  it('reports null when the last attached state is removed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Attach a state' }));
    await user.click(screen.getByRole('button', { name: /Remove state/ }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByText('No state bound')).toBeInTheDocument();
  });
});
