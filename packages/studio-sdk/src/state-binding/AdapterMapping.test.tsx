import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AdapterMapping } from './AdapterMapping';
import type { BindingSourceSchemas } from './types';

const SOURCES: BindingSourceSchemas = {
  output: [
    { path: ['total'], label: 'total' },
    { path: ['label'], label: 'label' },
  ],
  input: [{ path: ['memo'], label: 'memo' }],
};

function renderMapping(overrides: Partial<Parameters<typeof AdapterMapping>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <AdapterMapping
      declaredInput={['total']}
      value=""
      onChange={onChange}
      sources={SOURCES}
      {...overrides}
    />,
  );
  return onChange;
}

describe('AdapterMapping — value sources', () => {
  it('compiles a picked field into the adapter jq', async () => {
    const user = userEvent.setup();
    const onChange = renderMapping();
    await user.click(screen.getByRole('combobox', { name: 'Field' }));
    await user.click(await screen.findByRole('option', { name: 'total' }));
    expect(onChange).toHaveBeenLastCalledWith('{ total: (.output.total) }');
  });

  it('picks a field from the input root', async () => {
    const user = userEvent.setup();
    const onChange = renderMapping();
    await user.click(screen.getByRole('combobox', { name: 'Field root' }));
    await user.click(await screen.findByRole('option', { name: 'Run input' }));
    await user.click(screen.getByRole('combobox', { name: 'Field' }));
    await user.click(await screen.findByRole('option', { name: 'memo' }));
    expect(onChange).toHaveBeenLastCalledWith('{ total: (.input.memo) }');
  });

  it('compiles a hardcoded literal', async () => {
    const user = userEvent.setup();
    const onChange = renderMapping();
    await user.click(screen.getByRole('combobox', { name: 'Source for total' }));
    await user.click(await screen.findByRole('option', { name: 'Literal' }));
    await user.type(screen.getByLabelText('Literal for total'), '"label-a"');
    expect(onChange).toHaveBeenLastCalledWith('{ total: ("label-a") }');
  });

  it('surfaces a malformed literal loudly and stores null (never the empty string)', async () => {
    const user = userEvent.setup();
    const onChange = renderMapping();
    await user.click(screen.getByRole('combobox', { name: 'Source for total' }));
    await user.click(await screen.findByRole('option', { name: 'Literal' }));
    await user.type(screen.getByLabelText('Literal for total'), 'nope');
    expect(screen.getByText('total: This is not valid JSON.')).toBeInTheDocument();
    // A compile failure has no valid adapter: it emits null (no adapter), never '' —
    // the platform's save-time compile check refuses an empty adapter.
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(onChange).not.toHaveBeenCalledWith('');
  });

  it('compiles a jq expression', async () => {
    const user = userEvent.setup();
    const onChange = renderMapping();
    await user.click(screen.getByRole('combobox', { name: 'Source for total' }));
    await user.click(await screen.findByRole('option', { name: 'Jq' }));
    await user.type(screen.getByLabelText('Jq for total'), '.output.total + 1');
    expect(onChange).toHaveBeenLastCalledWith('{ total: (.output.total + 1) }');
  });
});

describe('AdapterMapping — show jq on demand', () => {
  it('shows the per-row jq and the compiled adapter jq', async () => {
    const user = userEvent.setup();
    renderMapping();
    const row = screen.getByTestId('adapter-row-total');
    await user.click(within(row).getByRole('button', { name: 'Show jq' }));
    expect(screen.getByTestId('adapter-row-jq-total')).toHaveTextContent('.output');
    await user.click(screen.getByRole('button', { name: 'Show adapter jq' }));
    expect(screen.getByTestId('adapter-compiled-jq')).toHaveTextContent('{ total: (.output) }');
  });
});

describe('AdapterMapping — escape hatch', () => {
  it('offers the raw jq box and authors the adapter directly', async () => {
    const user = userEvent.setup();
    const onChange = renderMapping();
    await user.click(screen.getByRole('button', { name: 'Write jq' }));
    await user.type(screen.getByLabelText('Adapter'), '.output.total');
    expect(onChange).toHaveBeenCalled();
  });

  it('shows the tool-output passthrough for a no-declared-input update, escape hatch available', async () => {
    const user = userEvent.setup();
    const onChange = renderMapping({ declaredInput: [] });
    // No fields to map: the passthrough copy shows and null is stored (no adapter).
    expect(
      screen.getByText('This update runs with the tool output as its input.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Map fields' })).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith(null);
    // The Write-jq escape hatch stays available: it reveals the raw adapter box.
    await user.click(screen.getByRole('button', { name: 'Write jq' }));
    expect(screen.getByLabelText('Adapter')).toBeInTheDocument();
  });

  it('reopens a generated adapter as the mapping form (round-trip from stored data)', async () => {
    const user = userEvent.setup();
    renderMapping({ value: '{ total: (.output.total) }' });
    // Rebuilt as the field form, not the raw box.
    expect(screen.queryByLabelText('Adapter')).not.toBeInTheDocument();
    const row = screen.getByTestId('adapter-row-total');
    await user.click(within(row).getByRole('button', { name: 'Show jq' }));
    expect(screen.getByTestId('adapter-row-jq-total')).toHaveTextContent('.output.total');
  });

  it('opens an unrecognised stored adapter in the raw jq box', () => {
    renderMapping({ value: '.output | { total: .total }' });
    expect(screen.getByLabelText('Adapter')).toHaveValue('.output | { total: .total }');
  });
});

describe('AdapterMapping — WYSIWYG default on mount', () => {
  it('emits the compiled default on mount so an accepted default is stored', () => {
    const onChange = renderMapping();
    expect(onChange).toHaveBeenCalledWith('{ total: (.output) }');
  });

  it('does not emit on mount when a stored adapter is present (preserves it)', () => {
    const onChange = renderMapping({ value: '{ total: (.output.total) }' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('refuses a whitespace-only raw adapter and stores null, never the whitespace', async () => {
    const user = userEvent.setup();
    const seen: (string | null)[] = [];
    function Host() {
      const [value, setValue] = useState('');
      return (
        <AdapterMapping
          declaredInput={['total']}
          value={value}
          onChange={(next) => {
            seen.push(next);
            setValue(next ?? '');
          }}
          sources={SOURCES}
        />
      );
    }
    render(<Host />);
    await user.click(screen.getByRole('button', { name: 'Write jq' }));
    fireEvent.change(screen.getByLabelText('Adapter'), { target: { value: '   ' } });
    // Whitespace normalizes to null — never stored as '' or as the whitespace itself —
    // and the editor refuses an empty adapter loudly in its error slot.
    expect(seen).toContain(null);
    expect(seen.every((v) => v?.trim() !== '')).toBe(true);
    expect(
      screen.getByText(
        'Map the declared inputs or write an adapter jq — an empty adapter is refused.',
      ),
    ).toBeInTheDocument();
  });
});

describe('AdapterMapping — no schema', () => {
  it('falls back to a path text input when a root has no field schema', async () => {
    const user = userEvent.setup();
    const onChange = renderMapping({ sources: undefined });
    await user.type(screen.getByLabelText('Field path'), 'a.b');
    expect(onChange).toHaveBeenLastCalledWith('{ total: (.output.a.b) }');
  });
});

describe('AdapterMapping — tool-schema load states', () => {
  it('shows a skeleton in the field slot while the tool schema loads', () => {
    const { container } = render(
      <AdapterMapping
        declaredInput={['total']}
        value=""
        onChange={vi.fn()}
        sources={{ loading: true }}
      />,
    );
    expect(container.querySelector('.tai-skeleton')).not.toBeNull();
    expect(screen.queryByLabelText('Field path')).not.toBeInTheDocument();
  });

  it('surfaces a schema-load error but keeps the path input usable', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AdapterMapping
        declaredInput={['total']}
        value=""
        onChange={onChange}
        sources={{ error: "Couldn't load the tool's fields." }}
      />,
    );
    expect(screen.getByText("Couldn't load the tool's fields.")).toBeInTheDocument();
    await user.type(screen.getByLabelText('Field path'), 'total');
    expect(onChange).toHaveBeenLastCalledWith('{ total: (.output.total) }');
  });
});

describe('AdapterMapping — toggle back to fields re-derives from the current jq', () => {
  /** A controlled host so a raw-jq edit updates the value the component reads back. */
  function Controlled({
    initial,
    onEmit,
  }: {
    readonly initial: string;
    readonly onEmit: (value: string | null) => void;
  }) {
    const [value, setValue] = useState(initial);
    return (
      <AdapterMapping
        declaredInput={['total']}
        value={value}
        onChange={(next) => {
          onEmit(next);
          setValue(next ?? '');
        }}
        sources={SOURCES}
      />
    );
  }

  it('re-derives rows from the edited jq and never clobbers it with the stale mount rows', async () => {
    const user = userEvent.setup();
    const seen: (string | null)[] = [];
    render(<Controlled initial="{ total: (.output.total) }" onEmit={(v) => seen.push(v)} />);

    // Starts mappable (fields mode). Edit the raw jq to a DIFFERENT mappable adapter.
    await user.click(screen.getByRole('button', { name: 'Write jq' }));
    fireEvent.change(screen.getByLabelText('Adapter'), {
      target: { value: '{ total: (.output.label) }' },
    });

    // Toggle back: the rows reflect the EDITED jq, not the mount-time `.output.total`.
    await user.click(screen.getByRole('button', { name: 'Map fields' }));
    const row = screen.getByTestId('adapter-row-total');
    await user.click(within(row).getByRole('button', { name: 'Show jq' }));
    expect(screen.getByTestId('adapter-row-jq-total')).toHaveTextContent('.output.label');

    // The stored jq is never overwritten back to the stale mount value.
    expect(seen).not.toContain('{ total: (.output.total) }');
  });

  it('keeps the raw jq view and the value when the jq cannot be mapped to fields', async () => {
    const user = userEvent.setup();
    const seen: (string | null)[] = [];
    render(<Controlled initial="" onEmit={(v) => seen.push(v)} />);

    await user.click(screen.getByRole('button', { name: 'Write jq' }));
    fireEvent.change(screen.getByLabelText('Adapter'), {
      target: { value: '.output | { total: .total }' },
    });

    const before = seen.length;
    await user.click(screen.getByRole('button', { name: 'Map fields' }));

    // Still the raw jq box, value intact, and a note says why — no emit fired.
    expect(screen.getByLabelText('Adapter')).toHaveValue('.output | { total: .total }');
    expect(
      screen.getByText('This adapter jq cannot be shown as fields. Edit it here.'),
    ).toBeInTheDocument();
    expect(seen.length).toBe(before);
  });
});

describe('AdapterMapping — keyboard', () => {
  it('reaches the mode toggle first by Tab', async () => {
    const user = userEvent.setup();
    renderMapping();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Map fields' })).toHaveFocus();
  });
});
