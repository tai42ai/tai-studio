import type { Extension } from '@tai42/api-client';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ExtensionPicker } from './extension-picker';

const CATALOG: Extension[] = [
  { name: 'marka', kind: 'wrapper', multiple: true, config_schema: null },
  { name: 'markb', kind: 'wrapper', multiple: true, config_schema: null },
  { name: 'backendx', kind: 'backend', multiple: false, config_schema: null },
  { name: 'backendy', kind: 'backend', multiple: false, config_schema: null },
];

/** A controlled harness so the checked state reflects each toggle. */
function Controlled({ initial = [] as string[] }: { initial?: string[] }) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <>
      <ExtensionPicker available={CATALOG} value={value} onChange={setValue} />
      <output data-testid="combo">{JSON.stringify(value)}</output>
    </>
  );
}

describe('ExtensionPicker', () => {
  it('renders the shared empty state on an empty catalog, not a bare checklist', () => {
    render(<ExtensionPicker available={[]} value={[]} onChange={vi.fn()} />);
    // The EmptyState lives inside the picker so every call site inherits it.
    expect(screen.getByText('No extensions are available.')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('groups the catalog by kind, one named group per kind holding its checkboxes', () => {
    render(<ExtensionPicker available={CATALOG} value={[]} onChange={vi.fn()} />);
    const backend = screen.getByRole('group', { name: 'Kind: backend' });
    const wrapper = screen.getByRole('group', { name: 'Kind: wrapper' });
    expect(within(wrapper).getByRole('checkbox', { name: 'marka' })).toBeInTheDocument();
    expect(within(wrapper).getByRole('checkbox', { name: 'markb' })).toBeInTheDocument();
    expect(within(backend).getByRole('checkbox', { name: 'backendx' })).toBeInTheDocument();
    expect(within(backend).getByRole('checkbox', { name: 'backendy' })).toBeInTheDocument();
    expect(within(backend).queryByRole('checkbox', { name: 'marka' })).toBeNull();
  });

  it('describes a single-select kind group, and only that group', () => {
    render(<ExtensionPicker available={CATALOG} value={[]} onChange={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Kind: backend' })).toHaveAccessibleDescription(
      '(single-select)',
    );
    expect(screen.getByRole('group', { name: 'Kind: wrapper' })).not.toHaveAccessibleDescription();
  });

  it('multi-selects freely within a stackable (wrapper) kind, preserving order', async () => {
    const user = userEvent.setup();
    render(<Controlled />);

    await user.click(screen.getByRole('checkbox', { name: 'markb' }));
    await user.click(screen.getByRole('checkbox', { name: 'marka' }));

    // Both selected; order is selection order (markb first).
    expect(screen.getByTestId('combo')).toHaveTextContent('["markb","marka"]');
  });

  it('single-selects the backend kind — a second backend replaces the first', async () => {
    const user = userEvent.setup();
    render(<Controlled />);

    await user.click(screen.getByRole('checkbox', { name: 'backendx' }));
    expect(screen.getByTestId('combo')).toHaveTextContent('["backendx"]');

    // Selecting the sibling backend drops the first (non-stackable kind).
    await user.click(screen.getByRole('checkbox', { name: 'backendy' }));
    expect(screen.getByTestId('combo')).toHaveTextContent('["backendy"]');
    expect(screen.getByRole('checkbox', { name: 'backendx' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'backendy' })).toBeChecked();
  });

  it('a backend and a wrapper coexist (single-select is per-kind, not global)', async () => {
    const user = userEvent.setup();
    render(<Controlled />);

    await user.click(screen.getByRole('checkbox', { name: 'marka' }));
    await user.click(screen.getByRole('checkbox', { name: 'backendx' }));

    expect(screen.getByTestId('combo')).toHaveTextContent('["marka","backendx"]');
  });

  it('unchecking removes the extension from the combo', async () => {
    const user = userEvent.setup();
    render(<Controlled initial={['marka', 'markb']} />);

    await user.click(screen.getByRole('checkbox', { name: 'marka' }));
    expect(screen.getByTestId('combo')).toHaveTextContent('["markb"]');
  });

  it('marks the backend group as single-select in its description', () => {
    render(<ExtensionPicker available={CATALOG} value={[]} onChange={vi.fn()} />);
    expect(screen.getByText('(single-select)')).toBeInTheDocument();
  });

  it('single-selects whichever kind the server serves as not multiple', async () => {
    const user = userEvent.setup();
    const served: Extension[] = [
      { name: 'routea', kind: 'router', multiple: false, config_schema: null },
      { name: 'routeb', kind: 'router', multiple: false, config_schema: null },
      {
        name: 'backendx',
        kind: 'backend',
        multiple: true,
        config_schema: null,
      },
      {
        name: 'backendy',
        kind: 'backend',
        multiple: true,
        config_schema: null,
      },
    ];
    function Served() {
      const [value, setValue] = useState<string[]>([]);
      return (
        <>
          <ExtensionPicker available={served} value={value} onChange={setValue} />
          <output data-testid="combo">{JSON.stringify(value)}</output>
        </>
      );
    }
    render(<Served />);
    await user.click(screen.getByRole('checkbox', { name: 'routea' }));
    await user.click(screen.getByRole('checkbox', { name: 'routeb' }));
    await user.click(screen.getByRole('checkbox', { name: 'backendx' }));
    await user.click(screen.getByRole('checkbox', { name: 'backendy' }));
    expect(screen.getByTestId('combo')).toHaveTextContent('["routeb","backendx","backendy"]');
    expect(screen.getAllByText('(single-select)')).toHaveLength(1);
  });

  it('renders an extension name containing <script> as escaped TEXT (XSS pin)', () => {
    const payload = '<script>alert(1)</script>';
    const { container } = render(
      <ExtensionPicker
        available={[
          {
            name: payload,
            kind: 'wrapper',
            multiple: true,
            config_schema: null,
          },
        ]}
        value={[payload]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(payload)).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
  });

  it('does not fire onChange when disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ExtensionPicker available={CATALOG} value={[]} onChange={onChange} disabled />);
    await user.click(screen.getByRole('checkbox', { name: 'marka' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reflects the controlled value as checked boxes', () => {
    render(<ExtensionPicker available={CATALOG} value={['markb']} onChange={vi.fn()} />);
    const picker = screen.getByTestId('extension-picker');
    expect(within(picker).getByRole('checkbox', { name: 'markb' })).toBeChecked();
    expect(within(picker).getByRole('checkbox', { name: 'marka' })).not.toBeChecked();
  });

  it('carries no inline palette on the picker', () => {
    render(<ExtensionPicker available={CATALOG} value={[]} onChange={vi.fn()} />);
    const picker = screen.getByTestId('extension-picker');
    expect(picker).toHaveClass('tai-stack');
    expect(picker.getAttribute('style')).toBeNull();
  });

  it('renders every option with its accessible name', () => {
    render(<ExtensionPicker available={CATALOG} value={['markb']} onChange={vi.fn()} />);

    expect(screen.getByTestId('extension-picker')).toHaveClass('tai-stack');
    for (const entry of CATALOG) {
      expect(screen.getByRole('checkbox', { name: entry.name })).toBeInTheDocument();
    }
    expect(screen.getByRole('checkbox', { name: 'markb' })).toBeChecked();
  });
});
