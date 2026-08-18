import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ToolPicker } from './tool-picker';

const TOOLS = ['alpha', 'beta', 'gamma'];

/**
 * The tag filter's accessible name. It comes from the `Field` that wraps it —
 * the control carries no `aria-label` of its own, because one would override
 * that visible label and leave the on-screen text out of the computed name.
 */
const FILTER_NAME = 'Filter by tag';

/** The tool listbox: the combobox that is not the tag filter. */
function toolCombobox(): HTMLElement {
  const filter = screen.getByRole('combobox', { name: FILTER_NAME });
  const found = screen.getAllByRole('combobox').find((element) => element !== filter);
  if (found === undefined) throw new Error('tool combobox not found');
  return found;
}

describe('ToolPicker', () => {
  it('renders a combobox showing the placeholder when nothing is selected', () => {
    render(
      <ToolPicker toolNames={TOOLS} value={null} onChange={vi.fn()} placeholder="Pick a tool" />,
    );
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveTextContent('Pick a tool');
  });

  it('renders one option per tool name', async () => {
    const user = userEvent.setup();
    render(<ToolPicker toolNames={TOOLS} value={null} onChange={vi.fn()} />);

    await user.click(screen.getByRole('combobox'));
    for (const name of TOOLS) {
      expect(await screen.findByRole('option', { name })).toBeInTheDocument();
    }
  });

  it('fires onChange with the chosen tool name', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ToolPicker toolNames={TOOLS} value={null} onChange={onChange} />);

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'beta' }));

    expect(onChange).toHaveBeenCalledWith('beta');
  });

  it('does not open when disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ToolPicker toolNames={TOOLS} value={null} onChange={onChange} disabled />);

    await user.click(screen.getByRole('combobox'));

    expect(screen.queryByRole('option')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders a tool name containing <script> as escaped TEXT, never an element (XSS pin)', async () => {
    const user = userEvent.setup();
    const payload = '<script>alert(1)</script>';
    const { container } = render(
      <ToolPicker toolNames={[payload]} value={payload} onChange={vi.fn()} />,
    );

    await user.click(screen.getByRole('combobox'));

    expect(screen.getAllByText(payload).length).toBeGreaterThan(0);
    expect(container.querySelector('script')).toBeNull();
  });

  it('excludes names in excludeNames from the options', async () => {
    const user = userEvent.setup();
    render(
      <ToolPicker toolNames={TOOLS} value={null} onChange={vi.fn()} excludeNames={['beta']} />,
    );

    await user.click(screen.getByRole('combobox'));
    expect(await screen.findByRole('option', { name: 'alpha' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'gamma' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'beta' })).toBeNull();
  });

  it('with tagsByTool, shows a tag filter that narrows the options to the chosen tag', async () => {
    const user = userEvent.setup();
    render(
      <ToolPicker
        toolNames={TOOLS}
        value={null}
        onChange={vi.fn()}
        tagsByTool={{ alpha: ['geo'], beta: ['geo'], gamma: ['scratch'] }}
      />,
    );

    // Two comboboxes: the tag filter and the tool picker.
    const filter = screen.getByRole('combobox', { name: FILTER_NAME });
    await user.click(filter);
    await user.click(await screen.findByRole('option', { name: 'scratch' }));

    // Now open the tool picker — only the 'scratch'-tagged tool remains.
    const tool = toolCombobox();
    await user.click(tool);

    expect(await screen.findByRole('option', { name: 'gamma' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'alpha' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'beta' })).toBeNull();
  });

  it('suffixes agent run tool option labels with " (agent)" (flat rendering)', async () => {
    const user = userEvent.setup();
    render(
      <ToolPicker
        toolNames={TOOLS}
        value={null}
        onChange={vi.fn()}
        agentToolNames={new Set(['beta'])}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    // The agent tool's label carries the suffix; a non-agent tool does not.
    expect(await screen.findByRole('option', { name: 'beta (agent)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'alpha' })).toBeInTheDocument();
  });

  it('suffixes agent run tool option labels with " (agent)" (grouped rendering)', async () => {
    const user = userEvent.setup();
    render(
      <ToolPicker
        toolNames={TOOLS}
        value={null}
        onChange={vi.fn()}
        tagsByTool={{ alpha: ['geo'], beta: ['geo'], gamma: ['scratch'] }}
        agentToolNames={new Set(['beta'])}
      />,
    );

    const tool = toolCombobox();
    await user.click(tool);

    expect(await screen.findByRole('option', { name: 'beta (agent)' })).toBeInTheDocument();
  });

  it('with tagsByTool, groups options under their tag labels', async () => {
    const user = userEvent.setup();
    render(
      <ToolPicker
        toolNames={TOOLS}
        value={null}
        onChange={vi.fn()}
        tagsByTool={{ alpha: ['geo'], beta: ['geo'], gamma: ['scratch'] }}
      />,
    );

    const tool = toolCombobox();
    await user.click(tool);

    // Radix renders group labels with role="group"; the tag names label them.
    expect(await screen.findByText('geo')).toBeInTheDocument();
    expect(screen.getByText('scratch')).toBeInTheDocument();
  });

  it('labels a mapped option "Display Name (raw)" (flat rendering)', async () => {
    const user = userEvent.setup();
    render(
      <ToolPicker
        toolNames={TOOLS}
        value={null}
        onChange={vi.fn()}
        displayNames={{ beta: 'Beta Tool' }}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    // The mapped tool shows its human name with the raw name in parentheses; an
    // unmapped tool shows the bare raw name.
    expect(await screen.findByRole('option', { name: 'Beta Tool (beta)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'alpha' })).toBeInTheDocument();
  });

  it('labels a mapped option "Display Name (raw)" (grouped rendering)', async () => {
    const user = userEvent.setup();
    render(
      <ToolPicker
        toolNames={TOOLS}
        value={null}
        onChange={vi.fn()}
        tagsByTool={{ alpha: ['geo'], beta: ['geo'], gamma: ['scratch'] }}
        displayNames={{ beta: 'Beta Tool' }}
      />,
    );

    const tool = toolCombobox();
    await user.click(tool);

    expect(await screen.findByRole('option', { name: 'Beta Tool (beta)' })).toBeInTheDocument();
  });

  it('falls back to the bare raw name for an unmapped tool', async () => {
    const user = userEvent.setup();
    render(
      <ToolPicker
        toolNames={TOOLS}
        value={null}
        onChange={vi.fn()}
        displayNames={{ beta: 'Beta Tool' }}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    expect(await screen.findByRole('option', { name: 'gamma' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /gamma \(/ })).toBeNull();
  });

  it('renders the bare raw name when the mapping equals the raw name', async () => {
    const user = userEvent.setup();
    render(
      <ToolPicker
        toolNames={TOOLS}
        value={null}
        onChange={vi.fn()}
        displayNames={{ beta: 'beta' }}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    expect(await screen.findByRole('option', { name: 'beta' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'beta (beta)' })).toBeNull();
  });

  it('renders the bare raw name when the mapping is an empty string', async () => {
    const user = userEvent.setup();
    render(
      <ToolPicker toolNames={TOOLS} value={null} onChange={vi.fn()} displayNames={{ beta: '' }} />,
    );

    await user.click(screen.getByRole('combobox'));
    // An empty display name is not a label: the option reads the bare raw name, never
    // the " (beta)" a naive `${display} (raw)` would emit.
    expect(await screen.findByRole('option', { name: 'beta' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: ' (beta)' })).toBeNull();
  });

  it('composes the display name and the agent suffix as "Display (raw) (agent)"', async () => {
    const user = userEvent.setup();
    render(
      <ToolPicker
        toolNames={TOOLS}
        value={null}
        onChange={vi.fn()}
        displayNames={{ beta: 'Beta Tool' }}
        agentToolNames={new Set(['beta'])}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    expect(
      await screen.findByRole('option', { name: 'Beta Tool (beta) (agent)' }),
    ).toBeInTheDocument();
  });

  it('fires onChange with the raw name when a display-labeled option is chosen', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ToolPicker
        toolNames={TOOLS}
        value={null}
        onChange={onChange}
        displayNames={{ beta: 'Beta Tool' }}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Beta Tool (beta)' }));

    expect(onChange).toHaveBeenCalledWith('beta');
  });

  it('renders a display name containing <script> as escaped TEXT, never an element (XSS pin)', async () => {
    const user = userEvent.setup();
    const payload = '<script>alert(1)</script>';
    const { container } = render(
      <ToolPicker
        toolNames={['beta']}
        value={null}
        onChange={vi.fn()}
        displayNames={{ beta: payload }}
      />,
    );

    await user.click(screen.getByRole('combobox'));

    expect(screen.getAllByText(`${payload} (beta)`).length).toBeGreaterThan(0);
    expect(container.querySelector('script')).toBeNull();
  });

  it('lays the filter and the picker out on the design-system stack, not an inline style', () => {
    render(
      <ToolPicker
        toolNames={TOOLS}
        value={null}
        onChange={vi.fn()}
        tagsByTool={{ alpha: ['geo'] }}
      />,
    );

    const root = screen.getByTestId('tool-picker');
    expect(root).toHaveClass('tai-stack', 'tai-stack-2');
    expect(root.getAttribute('style')).toBeNull();
  });

  it('renders its options and keeps the filter accessible name', async () => {
    const user = userEvent.setup();
    render(
      <ToolPicker
        toolNames={TOOLS}
        value={null}
        onChange={vi.fn()}
        placeholder="Pick a tool"
        tagsByTool={{ alpha: ['geo'], beta: ['geo'], gamma: ['scratch'] }}
      />,
    );

    expect(screen.getByRole('combobox', { name: FILTER_NAME })).toBeInTheDocument();
    expect(screen.getByTestId('tool-picker')).toHaveClass('tai-stack');

    const tool = toolCombobox();
    expect(tool).toHaveTextContent('Pick a tool');

    await user.click(tool);
    expect(await screen.findByRole('option', { name: 'alpha' })).toBeInTheDocument();
  });

  it("names the tag filter from its Field's visible label, with no aria-label over it", () => {
    render(
      <ToolPicker
        toolNames={TOOLS}
        value={null}
        onChange={vi.fn()}
        tagsByTool={{ alpha: ['geo'], gamma: ['scratch'] }}
      />,
    );

    // WCAG 2.5.3: the visible text IS the accessible name here. An `aria-label`
    // on the trigger outranks the field's `<label for>`, so the on-screen
    // "Filter by tag" would not appear in the computed name at all.
    const filter = screen.getByRole('combobox', { name: FILTER_NAME });
    expect(filter).toHaveAccessibleName(FILTER_NAME);
    expect(filter).not.toHaveAttribute('aria-label');
    expect(screen.getByText(FILTER_NAME).tagName).toBe('LABEL');
  });

  it('names a bare picker from aria-label, and lets a label out-rank it', () => {
    const { unmount } = render(
      <ToolPicker
        toolNames={TOOLS}
        value={null}
        onChange={vi.fn()}
        aria-label="Base tool"
        placeholder="Pick a tool"
      />,
    );

    // No Field around it, so the caller's name is the only one there is.
    expect(screen.getByRole('combobox')).toHaveAccessibleName('Base tool');
    unmount();

    render(
      <ToolPicker
        toolNames={TOOLS}
        value={null}
        onChange={vi.fn()}
        label="Base tool label"
        aria-label="Base tool"
        placeholder="Pick a tool"
      />,
    );

    // `label` renders a Field, and the field's visible label is the name.
    expect(screen.getByRole('combobox')).toHaveAccessibleName('Base tool label');
  });

  it('renders the SELECTED tool declared badges as read-only chips', () => {
    render(
      <ToolPicker
        toolNames={TOOLS}
        value="beta"
        onChange={vi.fn()}
        badgesByTool={{ beta: ['network', 'audited'] }}
      />,
    );
    const badges = screen.getByTestId('tool-picker-badges');
    expect(badges).toHaveTextContent('network');
    expect(badges).toHaveTextContent('audited');
  });

  it('shows no badge chips when nothing is selected or the tool declares none', () => {
    const { rerender } = render(
      <ToolPicker
        toolNames={TOOLS}
        value={null}
        onChange={vi.fn()}
        badgesByTool={{ beta: ['network'] }}
      />,
    );
    expect(screen.queryByTestId('tool-picker-badges')).toBeNull();

    rerender(
      <ToolPicker
        toolNames={TOOLS}
        value="alpha"
        onChange={vi.fn()}
        badgesByTool={{ beta: ['network'] }}
      />,
    );
    expect(screen.queryByTestId('tool-picker-badges')).toBeNull();
  });

  it('renders a badge containing <script> as escaped TEXT, never an element (XSS pin)', () => {
    const payload = '<script>alert(1)</script>';
    const { container } = render(
      <ToolPicker
        toolNames={TOOLS}
        value="beta"
        onChange={vi.fn()}
        badgesByTool={{ beta: [payload] }}
      />,
    );
    expect(screen.getByTestId('tool-picker-badges')).toHaveTextContent(payload);
    expect(container.querySelector('script')).toBeNull();
  });
});
