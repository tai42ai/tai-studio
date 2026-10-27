import { StaticToolDisplayNamesProvider } from '@tai42/studio-sdk/testing';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SubMcpToolsField } from './SubMcpToolsField';

const TOOLS = ['chat.send', 'chat.read', 'files.list'];

function loaded(data: readonly string[]) {
  return { data, isPending: false, isError: false, error: null, refetch: vi.fn() };
}

function renderField(selected: readonly string[] = [], onToggle = vi.fn()) {
  render(
    <StaticToolDisplayNamesProvider names={{ 'chat.send': 'Send Message' }}>
      <SubMcpToolsField
        toolsQuery={loaded(TOOLS)}
        selected={selected}
        toolsError={undefined}
        onToggle={onToggle}
      />
    </StaticToolDisplayNamesProvider>,
  );
  return onToggle;
}

describe('SubMcpToolsField', () => {
  it('labels each tool with its display label and toggles the raw name', async () => {
    const user = userEvent.setup();
    const onToggle = renderField();
    await user.click(screen.getByRole('checkbox', { name: 'Send Message (chat.send)' }));
    expect(onToggle).toHaveBeenCalledWith('chat.send', true);
  });

  it('narrows the list to tools whose display or raw name contains the filter text', async () => {
    const user = userEvent.setup();
    renderField();
    const filter = screen.getByRole('textbox', { name: 'Filter tools' });

    await user.type(filter, 'MESSAGE');
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: 'Send Message (chat.send)' })).toBeInTheDocument();

    await user.clear(filter);
    await user.type(filter, 'chat.');
    expect(screen.queryByRole('checkbox', { name: 'files.list' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('keeps Enter in the filter box from submitting the enclosing form', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => {
      event.preventDefault();
    });
    render(
      <form onSubmit={onSubmit}>
        <SubMcpToolsField
          toolsQuery={loaded(TOOLS)}
          selected={[]}
          toolsError={undefined}
          onToggle={vi.fn()}
        />
        <button type="submit">Create</button>
      </form>,
    );

    await user.type(screen.getByRole('textbox', { name: 'Filter tools' }), 'chat{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('says so when no tool matches the filter', async () => {
    const user = userEvent.setup();
    renderField();
    await user.type(screen.getByRole('textbox', { name: 'Filter tools' }), 'zz');
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getByRole('status')).toHaveTextContent('No tool matches “zz”.');
  });
});
