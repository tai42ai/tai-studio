import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ToolPicker } from './tool-picker';

const TOOLS = ['alpha', 'beta', 'gamma'];

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
    const filter = screen.getByRole('combobox', { name: 'Filter tools by tag' });
    await user.click(filter);
    await user.click(await screen.findByRole('option', { name: 'scratch' }));

    // Now open the tool picker — only the 'scratch'-tagged tool remains.
    const toolCombobox = screen
      .getAllByRole('combobox')
      .find((el) => el.getAttribute('aria-label') !== 'Filter tools by tag');
    if (toolCombobox === undefined) throw new Error('tool combobox not found');
    await user.click(toolCombobox);

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

    const toolCombobox = screen
      .getAllByRole('combobox')
      .find((el) => el.getAttribute('aria-label') !== 'Filter tools by tag');
    if (toolCombobox === undefined) throw new Error('tool combobox not found');
    await user.click(toolCombobox);

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

    const toolCombobox = screen
      .getAllByRole('combobox')
      .find((el) => el.getAttribute('aria-label') !== 'Filter tools by tag');
    if (toolCombobox === undefined) throw new Error('tool combobox not found');
    await user.click(toolCombobox);

    // Radix renders group labels with role="group"; the tag names label them.
    expect(await screen.findByText('geo')).toBeInTheDocument();
    expect(screen.getByText('scratch')).toBeInTheDocument();
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

    expect(screen.getByRole('combobox', { name: 'Filter tools by tag' })).toBeInTheDocument();
    expect(screen.getByTestId('tool-picker')).toHaveClass('tai-stack');

    const toolCombobox = screen
      .getAllByRole('combobox')
      .find((el) => el.getAttribute('aria-label') !== 'Filter tools by tag');
    if (toolCombobox === undefined) throw new Error('tool combobox not found');
    expect(toolCombobox).toHaveTextContent('Pick a tool');

    await user.click(toolCombobox);
    expect(await screen.findByRole('option', { name: 'alpha' })).toBeInTheDocument();
  });
});
