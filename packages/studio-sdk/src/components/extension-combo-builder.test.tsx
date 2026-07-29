import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { Extension, PresetExtensionElement } from '@tai42/api-client';

import { ExtensionComboBuilder } from './extension-combo-builder';
import { AlertTriangleIcon, XCircleIcon } from './icons';

const CATALOG: Extension[] = [
  { name: 'marka', kind: 'wrapper' },
  { name: 'markb', kind: 'wrapper' },
  { name: 'backendx', kind: 'backend' },
  { name: 'output_schema', kind: 'wrapper' },
];

/** A controlled harness so the committed combos reflect each Add/Update/Remove. */
function Controlled({
  initial = [] as PresetExtensionElement[][],
}: {
  initial?: PresetExtensionElement[][];
}) {
  const [value, setValue] = useState<PresetExtensionElement[][]>(initial);
  return (
    <>
      <ExtensionComboBuilder available={CATALOG} value={value} onChange={setValue} />
      <output data-testid="combos">{JSON.stringify(value)}</output>
    </>
  );
}

describe('ExtensionComboBuilder', () => {
  it('Add is disabled until the draft has at least one member (no empty combo)', async () => {
    const user = userEvent.setup();
    render(<Controlled />);

    const add = screen.getByRole('button', { name: 'Add combo' });
    expect(add).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'marka' }));
    expect(add).toBeEnabled();
  });

  it('adds a plain-name combo in member order and clears the draft (regression)', async () => {
    const user = userEvent.setup();
    render(<Controlled />);

    await user.click(screen.getByRole('checkbox', { name: 'markb' }));
    await user.click(screen.getByRole('checkbox', { name: 'marka' }));
    await user.click(screen.getByRole('button', { name: 'Add combo' }));

    // Committed as bare-name elements (no config), in selection order; draft resets.
    expect(screen.getByTestId('combos')).toHaveTextContent('[["markb","marka"]]');
    expect(screen.getByRole('button', { name: 'Add combo' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'marka' })).not.toBeChecked();
  });

  it('blocks a duplicate combo already in the value (by name sequence)', async () => {
    const user = userEvent.setup();
    render(<Controlled initial={[['marka']]} />);

    await user.click(screen.getByRole('checkbox', { name: 'marka' }));

    expect(screen.getByRole('alert')).toHaveTextContent('This combo is already added.');
    expect(screen.getByRole('button', { name: 'Add combo' })).toBeDisabled();
  });

  it('removes a committed combo from the value', async () => {
    const user = userEvent.setup();
    render(<Controlled initial={[['marka'], ['backendx']]} />);

    await user.click(screen.getByRole('button', { name: 'Remove combo marka' }));

    expect(screen.getByTestId('combos')).toHaveTextContent('[["backendx"]]');
  });

  it('renders each committed combo as ordered name badges', () => {
    render(
      <ExtensionComboBuilder
        available={CATALOG}
        value={[['marka', 'backendx']]}
        onChange={vi.fn()}
      />,
    );
    const [row] = screen.getAllByRole('listitem');
    if (row === undefined) throw new Error('no combo row rendered');
    expect(within(row).getByText('marka')).toBeInTheDocument();
    expect(within(row).getByText('backendx')).toBeInTheDocument();
  });

  it('shows the empty note when there are no combos', () => {
    render(<ExtensionComboBuilder available={CATALOG} value={[]} onChange={vi.fn()} />);
    expect(screen.getByText('No extension combos.')).toBeInTheDocument();
  });

  it('does not fire onChange when disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ExtensionComboBuilder
        available={CATALOG}
        value={[['marka']]}
        onChange={onChange}
        disabled
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Remove combo marka' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders an extension name containing <script> as escaped TEXT (XSS pin)', () => {
    const payload = '<script>alert(1)</script>';
    const { container } = render(
      <ExtensionComboBuilder
        available={[{ name: payload, kind: 'wrapper' }]}
        value={[[payload]]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getAllByText(payload).length).toBeGreaterThan(0);
    expect(container.querySelector('script')).toBeNull();
  });

  it('authors an output_schema element as { name, config: { schema } }', async () => {
    const user = userEvent.setup();
    render(<Controlled />);

    // Selecting output_schema reveals the inline SchemaEditor.
    await user.click(screen.getByRole('checkbox', { name: 'output_schema' }));
    const editor = screen.getByLabelText('Output schema JSON');
    fireEvent.change(editor, { target: { value: '{"type":"object","properties":{}}' } });

    await user.click(screen.getByRole('button', { name: 'Add combo' }));

    expect(screen.getByTestId('combos')).toHaveTextContent(
      JSON.stringify([
        [{ name: 'output_schema', config: { schema: { type: 'object', properties: {} } } }],
      ]),
    );
  });

  it('composes a mixed combo (a plain name + an output_schema config element)', async () => {
    const user = userEvent.setup();
    render(<Controlled />);

    await user.click(screen.getByRole('checkbox', { name: 'marka' }));
    await user.click(screen.getByRole('checkbox', { name: 'output_schema' }));
    fireEvent.change(screen.getByLabelText('Output schema JSON'), {
      target: { value: '{"type":"object","title":"R"}' },
    });
    await user.click(screen.getByRole('button', { name: 'Add combo' }));

    // The plain name stays a bare element; output_schema carries its config, in order.
    expect(screen.getByTestId('combos')).toHaveTextContent(
      JSON.stringify([
        ['marka', { name: 'output_schema', config: { schema: { type: 'object', title: 'R' } } }],
      ]),
    );
  });

  it('preserves a non-output_schema element config when its combo is edited', async () => {
    const user = userEvent.setup();
    // A config-bearing element the builder does NOT author inline (e.g. an
    // ask_external verifier). Editing the combo must not flatten it to a bare name.
    const configured = { name: 'marka', config: { verifier: 'secret_env' } };
    render(<Controlled initial={[[configured, 'markb']]} />);

    // Pull the combo into the draft and re-commit without changing its members.
    await user.click(screen.getByRole('button', { name: 'Edit combo marka+markb' }));
    await user.click(screen.getByRole('button', { name: 'Update combo' }));

    expect(screen.getByTestId('combos')).toHaveTextContent(JSON.stringify([[configured, 'markb']]));
  });

  it('blocks Add while the output_schema config is invalid JSON', async () => {
    const user = userEvent.setup();
    render(<Controlled />);

    await user.click(screen.getByRole('checkbox', { name: 'output_schema' }));
    fireEvent.change(screen.getByLabelText('Output schema JSON'), {
      target: { value: '{ broken' },
    });

    expect(screen.getByRole('button', { name: 'Add combo' })).toBeDisabled();
  });

  it('flags an unknown extension name in a seeded combo and reports invalid with ZERO edits', () => {
    const onValidityChange = vi.fn();
    // A combo referencing `gone` — a plugin removed after the preset was authored.
    render(
      <ExtensionComboBuilder
        available={CATALOG}
        value={[['marka', 'gone']]}
        onChange={vi.fn()}
        onValidityChange={onValidityChange}
      />,
    );

    // The danger note surfaces on the row without any user interaction.
    expect(screen.getByRole('alert')).toHaveTextContent('Unknown extension: gone.');
    // And the validity callback reports invalid on mount.
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
  });

  it('reports valid and suppresses the unknown-name note while the catalog is not ready', () => {
    const onValidityChange = vi.fn();
    render(
      <ExtensionComboBuilder
        available={[]}
        value={[['marka', 'gone']]}
        onChange={vi.fn()}
        onValidityChange={onValidityChange}
        availableReady={false}
      />,
    );

    // No flash while loading: no danger note, and validity stays true.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onValidityChange).toHaveBeenLastCalledWith(true);
  });

  it('reports valid when every combo name is known', () => {
    const onValidityChange = vi.fn();
    render(
      <ExtensionComboBuilder
        available={CATALOG}
        value={[['marka', 'markb']]}
        onChange={vi.fn()}
        onValidityChange={onValidityChange}
      />,
    );

    expect(screen.queryByRole('alert')).toBeNull();
    expect(onValidityChange).toHaveBeenLastCalledWith(true);
  });

  it('re-hydrates the SchemaEditor with a stored element config when a combo is edited', async () => {
    const user = userEvent.setup();
    const stored = { type: 'object', title: 'Stored', properties: {} };
    render(<Controlled initial={[[{ name: 'output_schema', config: { schema: stored } }]]} />);

    // Pull the stored combo back into the draft; its config seeds the editor.
    await user.click(screen.getByRole('button', { name: 'Edit combo output_schema' }));

    expect(screen.getByLabelText('Output schema JSON')).toHaveValue(
      JSON.stringify(stored, null, 2),
    );

    // Update it in place to a new schema.
    fireEvent.change(screen.getByLabelText('Output schema JSON'), {
      target: { value: '{"type":"object","title":"Edited"}' },
    });
    await user.click(screen.getByRole('button', { name: 'Update combo' }));

    expect(screen.getByTestId('combos')).toHaveTextContent(
      JSON.stringify([
        [{ name: 'output_schema', config: { schema: { type: 'object', title: 'Edited' } } }],
      ]),
    );
  });

  it('renders each committed combo as a design-system card, with no inline palette', () => {
    render(
      <ExtensionComboBuilder
        available={CATALOG}
        value={[['marka', 'backendx']]}
        onChange={vi.fn()}
      />,
    );

    const builder = screen.getByTestId('extension-combo-builder');
    expect(builder).toHaveClass('tai-stack');
    expect(builder.getAttribute('style')).toBeNull();

    const [row] = screen.getAllByRole('listitem');
    if (row === undefined) throw new Error('no combo row rendered');
    expect(row).toHaveClass('tai-card', 'tai-stack', 'tai-stack-2');
    expect(row.getAttribute('style')).toBeNull();
  });

  it('removes a combo through a marked button that keeps its accessible name', async () => {
    const user = userEvent.setup();
    render(<Controlled initial={[['marka'], ['backendx']]} />);

    const remove = screen.getByRole('button', { name: 'Remove combo marka' });
    expect(remove).toHaveClass('tai-btn');
    // The mark is an icon beside the word, never a Unicode glyph standing in for it.
    expect(remove.querySelector('svg')).not.toBeNull();
    expect(remove).toHaveTextContent('Remove');

    await user.click(remove);
    expect(screen.getByTestId('combos')).toHaveTextContent('[["backendx"]]');
  });

  it('states the duplicate and unknown-name faults as a field error carrying a mark', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Controlled initial={[['marka']]} />);

    await user.click(screen.getByRole('checkbox', { name: 'marka' }));
    const duplicate = screen.getByRole('alert');
    expect(duplicate).toHaveClass('tai-field-error');
    expect(duplicate.querySelector('svg')).not.toBeNull();
    unmount();

    render(
      <ExtensionComboBuilder available={CATALOG} value={[['marka', 'gone']]} onChange={vi.fn()} />,
    );
    const unknown = screen.getByRole('alert');
    expect(unknown).toHaveClass('tai-field-error');
    expect(unknown).toHaveTextContent('Unknown extension: gone.');
    expect(unknown.querySelector('svg')).not.toBeNull();
  });

  it('marks both inline errors with the ERROR mark, never the warning one', async () => {
    // The mark vocabulary: the crossed circle is a failure, the triangle is a
    // warning. Every `.tai-field-error` here states a rejected input, so both
    // alerts take the same crossed circle — two marks on one class would state
    // two different severities for one condition.
    const user = userEvent.setup();
    const error = render(<XCircleIcon />).container.querySelector('svg')?.innerHTML;
    const warning = render(<AlertTriangleIcon />).container.querySelector('svg')?.innerHTML;
    expect(error).not.toBe(warning);

    const unknownRender = render(
      <ExtensionComboBuilder available={CATALOG} value={[['marka', 'gone']]} onChange={vi.fn()} />,
    );
    expect(screen.getByRole('alert').querySelector('svg')?.innerHTML).toBe(error);
    unknownRender.unmount();

    render(<Controlled initial={[['marka']]} />);
    await user.click(screen.getByRole('checkbox', { name: 'marka' }));
    expect(screen.getByRole('alert')).toHaveTextContent('This combo is already added.');
    expect(screen.getByRole('alert').querySelector('svg')?.innerHTML).toBe(error);
  });

  it('names the Edit button with the words it is showing (WCAG 2.5.3)', async () => {
    // A constant "Edit combo …" would leave a button reading "Editing" named
    // "Edit": Label in Name fails, and a voice-control user is left naming a
    // control they cannot see.
    const user = userEvent.setup();
    render(<Controlled initial={[['marka']]} />);

    await user.click(screen.getByRole('button', { name: 'Edit combo marka' }));
    const editing = screen.getByRole('button', { name: 'Editing combo marka' });
    expect(editing).toHaveTextContent('Editing');
    expect(screen.queryByRole('button', { name: 'Edit combo marka' })).toBeNull();
  });

  it('renders the no-combos note as a muted line, not a full empty-state panel', () => {
    render(<ExtensionComboBuilder available={CATALOG} value={[]} onChange={vi.fn()} />);
    const note = screen.getByText('No extension combos.');
    expect(note).toHaveClass('tai-muted');
    expect(note).not.toHaveClass('tai-empty-state');
  });

  it('renders its combos and keeps every action name', () => {
    render(<ExtensionComboBuilder available={CATALOG} value={[['marka']]} onChange={vi.fn()} />);

    expect(screen.getByTestId('extension-combo-builder')).toHaveClass('tai-stack');
    const [row] = screen.getAllByRole('listitem');
    if (row === undefined) throw new Error('no combo row rendered');
    expect(within(row).getByText('marka')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit combo marka' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove combo marka' })).toHaveClass('tai-btn');
    expect(screen.getByRole('button', { name: 'Add combo' })).toBeInTheDocument();
  });
});
