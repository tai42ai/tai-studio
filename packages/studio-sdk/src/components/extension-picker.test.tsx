import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { Extension } from '@tai42/api-client';

import { ExtensionPicker } from './extension-picker';

const CATALOG: Extension[] = [
  { name: 'marka', kind: 'wrapper' },
  { name: 'markb', kind: 'wrapper' },
  { name: 'backendx', kind: 'backend' },
  { name: 'backendy', kind: 'backend' },
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
  it('groups the catalog by kind with a kind badge per group', () => {
    render(<ExtensionPicker available={CATALOG} value={[]} onChange={vi.fn()} />);
    // The two kinds each render a badge label.
    expect(screen.getByText('wrapper')).toHaveAttribute('data-variant', 'primary');
    expect(screen.getByText('backend')).toHaveAttribute('data-variant', 'warning');
    // A checkbox per catalog entry.
    for (const entry of CATALOG) {
      expect(screen.getByRole('checkbox', { name: entry.name })).toBeInTheDocument();
    }
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

  it('marks the backend group as single-select in its heading', () => {
    render(<ExtensionPicker available={CATALOG} value={[]} onChange={vi.fn()} />);
    expect(screen.getByText('(single-select)')).toBeInTheDocument();
  });

  it('renders an extension name containing <script> as escaped TEXT (XSS pin)', () => {
    const payload = '<script>alert(1)</script>';
    const { container } = render(
      <ExtensionPicker
        available={[{ name: payload, kind: 'wrapper' }]}
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
});
