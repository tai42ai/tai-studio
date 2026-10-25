import type { Extension, PresetExtensionElement } from '@tai42/api-client';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { JSON_SCHEMA_META_URI } from '../schema-form/json-schema-meta';
import { ExtensionComboBuilder } from './extension-combo-builder';
import { AlertTriangleIcon, XCircleIcon } from './icons';

const CATALOG: Extension[] = [
  { name: 'marka', kind: 'wrapper', multiple: true, config_schema: null },
  { name: 'markb', kind: 'wrapper', multiple: true, config_schema: null },
  { name: 'backendx', kind: 'backend', multiple: false, config_schema: null },
  {
    name: 'shape_ext',
    kind: 'wrapper',
    multiple: true,
    config_schema: {
      type: 'object',
      properties: { schema: { $ref: JSON_SCHEMA_META_URI, title: 'Shape' } },
      required: ['schema'],
    },
  },
  {
    name: 'label_ext',
    kind: 'wrapper',
    multiple: true,
    config_schema: {
      type: 'object',
      properties: { label: { type: 'string', title: 'Label', minLength: 1 } },
      required: ['label'],
    },
  },
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

    const add = screen.getByRole('button', { name: 'Add extension set' });
    expect(add).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'marka' }));
    expect(add).toBeEnabled();
  });

  it('adds a plain-name combo in member order and clears the draft (regression)', async () => {
    const user = userEvent.setup();
    render(<Controlled />);

    await user.click(screen.getByRole('checkbox', { name: 'markb' }));
    await user.click(screen.getByRole('checkbox', { name: 'marka' }));
    await user.click(screen.getByRole('button', { name: 'Add extension set' }));

    // Committed as bare-name elements (no config), in selection order; draft resets.
    expect(screen.getByTestId('combos')).toHaveTextContent('[["markb","marka"]]');
    expect(screen.getByRole('button', { name: 'Add extension set' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'marka' })).not.toBeChecked();
  });

  it('blocks a duplicate combo already in the value (by name sequence)', async () => {
    const user = userEvent.setup();
    render(<Controlled initial={[['marka']]} />);

    await user.click(screen.getByRole('checkbox', { name: 'marka' }));

    expect(screen.getByRole('alert')).toHaveTextContent('This extension set is already added.');
    expect(screen.getByRole('button', { name: 'Add extension set' })).toBeDisabled();
  });

  it('removes a committed combo from the value', async () => {
    const user = userEvent.setup();
    render(<Controlled initial={[['marka'], ['backendx']]} />);

    await user.click(screen.getByRole('button', { name: 'Remove extension set marka' }));

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
    expect(screen.getByText('No extension sets.')).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Remove extension set marka' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders an extension name containing <script> as escaped TEXT (XSS pin)', () => {
    const payload = '<script>alert(1)</script>';
    const { container } = render(
      <ExtensionComboBuilder
        available={[
          {
            name: payload,
            kind: 'wrapper',
            multiple: true,
            config_schema: null,
          },
        ]}
        value={[[payload]]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getAllByText(payload).length).toBeGreaterThan(0);
    expect(container.querySelector('script')).toBeNull();
  });

  it('composes a combo in draft order: bare names and { name, config } settings', async () => {
    const user = userEvent.setup();
    render(<Controlled />);

    await user.click(screen.getByRole('checkbox', { name: 'shape_ext' }));
    await user.click(screen.getByRole('checkbox', { name: 'marka' }));
    await user.click(screen.getByRole('checkbox', { name: 'label_ext' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Shape JSON' }), {
      target: { value: '{"type":"object","title":"R"}' },
    });
    await user.type(screen.getByRole('textbox', { name: /^Label/ }), 'alpha');
    await user.click(screen.getByRole('button', { name: 'Add extension set' }));

    expect(screen.getByTestId('combos')).toHaveTextContent(
      JSON.stringify([
        [
          { name: 'shape_ext', config: { schema: { type: 'object', title: 'R' } } },
          'marka',
          { name: 'label_ext', config: { label: 'alpha' } },
        ],
      ]),
    );
  });

  it('keeps Add off while any settings form is invalid or unreported', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const add = (): HTMLElement => screen.getByRole('button', { name: 'Add extension set' });

    await user.click(screen.getByRole('checkbox', { name: 'label_ext' }));
    expect(screen.getByRole('group', { name: 'label_ext settings' })).toBeInTheDocument();
    expect(add()).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: /^Label/ }), 'alpha');
    expect(add()).toBeEnabled();

    await user.click(screen.getByRole('checkbox', { name: 'shape_ext' }));
    expect(add()).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Shape JSON' }), {
      target: { value: '{ broken' },
    });
    expect(add()).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Shape JSON' }), {
      target: { value: '{"type":"string"}' },
    });
    expect(add()).toBeEnabled();

    // Unticking a configurable extension drops its form from the gate.
    await user.click(screen.getByRole('checkbox', { name: 'shape_ext' }));
    expect(add()).toBeEnabled();
  });

  it('re-seeds every configurable element when a combo is edited', async () => {
    const user = userEvent.setup();
    const stored = { type: 'object', title: 'Stored' };
    render(
      <Controlled
        initial={[
          [
            { name: 'shape_ext', config: { schema: stored } },
            { name: 'label_ext', config: { label: 'beta' } },
          ],
        ]}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Edit extension set shape_ext+label_ext' }),
    );
    expect(screen.getByRole('textbox', { name: 'Shape JSON' })).toHaveValue(
      JSON.stringify(stored, null, 2),
    );
    expect(screen.getByRole('textbox', { name: /^Label/ })).toHaveValue('beta');

    await user.type(screen.getByRole('textbox', { name: /^Label/ }), '2');
    await user.click(screen.getByRole('button', { name: 'Update extension set' }));
    expect(screen.getByTestId('combos')).toHaveTextContent(
      JSON.stringify([
        [
          { name: 'shape_ext', config: { schema: stored } },
          { name: 'label_ext', config: { label: 'beta2' } },
        ],
      ]),
    );
  });

  it('keeps an element without a settings schema verbatim when its combo is edited', async () => {
    const user = userEvent.setup();
    const configured = { name: 'marka', config: { verifier: 'demo' } };
    const unlisted = { name: 'gone_ext', config: { n: 1 } };
    render(<Controlled initial={[[configured, unlisted, 'markb']]} />);

    await user.click(
      screen.getByRole('button', { name: 'Edit extension set marka+gone_ext+markb' }),
    );
    await user.click(screen.getByRole('button', { name: 'Update extension set' }));

    expect(screen.getByTestId('combos')).toHaveTextContent(
      JSON.stringify([[configured, unlisted, 'markb']]),
    );
  });

  it('keeps a served env-marker setting sealed and writes the marker back verbatim', async () => {
    const user = userEvent.setup();
    const served = { name: 'label_ext', config: { label: '!ENV ${EXT_TOKEN}' } };
    render(<Controlled initial={[[served]]} />);

    await user.click(screen.getByRole('button', { name: 'Edit extension set label_ext' }));
    expect(screen.queryByRole('textbox', { name: /^Label/ })).toBeNull();
    expect(screen.getByText('Env reference EXT_TOKEN, kept as written.')).toBeInTheDocument();
    const update = screen.getByRole('button', { name: 'Update extension set' });
    expect(update).toBeEnabled();
    await user.click(update);

    expect(screen.getByTestId('combos')).toHaveTextContent(JSON.stringify([[served]]));
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

    const remove = screen.getByRole('button', { name: 'Remove extension set marka' });
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
    expect(screen.getByRole('alert')).toHaveTextContent('This extension set is already added.');
    expect(screen.getByRole('alert').querySelector('svg')?.innerHTML).toBe(error);
  });

  it('names the Edit button with the words it is showing (WCAG 2.5.3)', async () => {
    // A constant "Edit combo …" would leave a button reading "Editing" named
    // "Edit": Label in Name fails, and a voice-control user is left naming a
    // control they cannot see.
    const user = userEvent.setup();
    render(<Controlled initial={[['marka']]} />);

    await user.click(screen.getByRole('button', { name: 'Edit extension set marka' }));
    const editing = screen.getByRole('button', { name: 'Editing extension set marka' });
    expect(editing).toHaveTextContent('Editing');
    expect(screen.queryByRole('button', { name: 'Edit extension set marka' })).toBeNull();
  });

  it('renders the no-combos note as a muted line, not a full empty-state panel', () => {
    render(<ExtensionComboBuilder available={CATALOG} value={[]} onChange={vi.fn()} />);
    const note = screen.getByText('No extension sets.');
    expect(note).toHaveClass('tai-muted');
    expect(note).not.toHaveClass('tai-empty-state');
  });

  it('renders its combos and keeps every action name', () => {
    render(<ExtensionComboBuilder available={CATALOG} value={[['marka']]} onChange={vi.fn()} />);

    expect(screen.getByTestId('extension-combo-builder')).toHaveClass('tai-stack');
    const [row] = screen.getAllByRole('listitem');
    if (row === undefined) throw new Error('no combo row rendered');
    expect(within(row).getByText('marka')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit extension set marka' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove extension set marka' })).toHaveClass(
      'tai-btn',
    );
    expect(screen.getByRole('button', { name: 'Add extension set' })).toBeInTheDocument();
  });
});
