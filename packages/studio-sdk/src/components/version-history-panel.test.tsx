import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VersionHistoryPanel, type VersionHistoryEntry } from './version-history-panel';

const VERSIONS: VersionHistoryEntry[] = [
  {
    version: 1,
    body: { fixed_kwargs: { units: 'metric' } },
    is_current: false,
    created_at: '2024-01-01T00:00:02+00:00',
  },
  {
    version: 2,
    body: { fixed_kwargs: { units: 'imperial' } },
    is_current: true,
    created_at: '2024-01-01T00:00:03+00:00',
  },
];

/** Version 1 carrying the given tags, paired with the (tag-less) current version 2. */
function taggedPair(tags: string[]): VersionHistoryEntry[] {
  return [
    {
      version: 1,
      body: { fixed_kwargs: { units: 'metric' } },
      is_current: false,
      created_at: '2024-01-01T00:00:02+00:00',
      tags,
    },
    {
      version: 2,
      body: { fixed_kwargs: { units: 'imperial' } },
      is_current: true,
      created_at: '2024-01-01T00:00:03+00:00',
    },
  ];
}

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

/** One version row's cell at `column` (0-based), failing loudly when it is absent. */
function cellOf(version: number, column: number): HTMLElement {
  const cells = within(screen.getByTestId(`version-row-${String(version)}`)).getAllByRole('cell');
  const cell = cells[column];
  if (cell === undefined)
    throw new Error(`version row ${String(version)} has no cell ${String(column)}`);
  return cell;
}

describe('VersionHistoryPanel', () => {
  it('renders each version with a current badge on the active one', () => {
    render(<VersionHistoryPanel versions={VERSIONS} onRollback={vi.fn()} />);

    expect(screen.getByTestId('version-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('version-row-2')).toBeInTheDocument();
    // The current version (2) is selected by default and shows the Current badge.
    expect(screen.getByText('Current')).toBeInTheDocument();
  });

  it('shows the selected version body and switches on View', async () => {
    const user = userEvent.setup();
    render(<VersionHistoryPanel versions={VERSIONS} onRollback={vi.fn()} />);

    // Defaults to the current version's body.
    expect(screen.getByText('Version 2 body')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'View version 1' }));
    expect(screen.getByText('Version 1 body')).toBeInTheDocument();
  });

  it('the current version cannot be rolled back to (its Roll back is disabled)', () => {
    render(<VersionHistoryPanel versions={VERSIONS} onRollback={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Roll back to version 2' })).toBeDisabled();
  });

  it('rolls back only after the confirm dialog is confirmed', async () => {
    const user = userEvent.setup();
    const onRollback = vi.fn();
    render(<VersionHistoryPanel versions={VERSIONS} onRollback={onRollback} />);

    await user.click(screen.getByRole('button', { name: 'Roll back to version 1' }));
    // A confirm dialog appears; the callback has NOT fired yet.
    expect(onRollback).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Roll back' }));

    expect(onRollback).toHaveBeenCalledWith(1);
  });

  it('surfaces a rollback error loudly in the confirm dialog', async () => {
    const user = userEvent.setup();
    render(
      <VersionHistoryPanel
        versions={VERSIONS}
        onRollback={vi.fn()}
        rollbackError="preset is conflicted"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Roll back to version 1' }));
    expect(screen.getByRole('alert')).toHaveTextContent('preset is conflicted');
  });

  it('closes the confirm dialog on a SUCCESSFUL rollback (pending true→false, no error)', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <VersionHistoryPanel versions={VERSIONS} onRollback={vi.fn()} rollbackPending={false} />,
    );

    await user.click(screen.getByRole('button', { name: 'Roll back to version 1' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Mutation goes in flight — the confirm stays open while pending (no spurious close).
    rerender(
      <VersionHistoryPanel versions={VERSIONS} onRollback={vi.fn()} rollbackPending={true} />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Mutation settles successfully (pending true→false, no error) — the confirm closes.
    rerender(
      <VersionHistoryPanel versions={VERSIONS} onRollback={vi.fn()} rollbackPending={false} />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the confirm dialog OPEN showing the error on a FAILED rollback', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <VersionHistoryPanel versions={VERSIONS} onRollback={vi.fn()} rollbackPending={false} />,
    );

    await user.click(screen.getByRole('button', { name: 'Roll back to version 1' }));
    rerender(
      <VersionHistoryPanel versions={VERSIONS} onRollback={vi.fn()} rollbackPending={true} />,
    );

    // Mutation settles with an error (pending true→false WITH rollbackError) — stays open.
    rerender(
      <VersionHistoryPanel
        versions={VERSIONS}
        onRollback={vi.fn()}
        rollbackPending={false}
        rollbackError="preset is conflicted"
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('preset is conflicted');
  });

  it('does not spuriously close the confirm on mount or on an already-present error', async () => {
    const user = userEvent.setup();
    // Mount with rollbackError already present: opening the confirm must NOT auto-close it.
    render(
      <VersionHistoryPanel
        versions={VERSIONS}
        onRollback={vi.fn()}
        rollbackPending={false}
        rollbackError="preset is conflicted"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Roll back to version 1' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('preset is conflicted');
  });

  it('arms Compare on the first click and opens a diff dialog on the second', async () => {
    const user = userEvent.setup();
    render(<VersionHistoryPanel versions={VERSIONS} onRollback={vi.fn()} />);

    // First click arms comparing-from v1 (the button label reflects the armed state).
    await user.click(screen.getByRole('button', { name: 'Compare version 1' }));
    expect(screen.getByRole('button', { name: 'Compare version 1' })).toHaveTextContent(
      'Comparing…',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Second click on another row opens the v1 → v2 diff dialog.
    await user.click(screen.getByRole('button', { name: 'Compare version 2' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('v1 compared with v2')).toBeInTheDocument();
    // The bodies differ only in fixed_kwargs.units → a single diff row at that path.
    expect(within(dialog).getByTestId('diff-row-fixed_kwargs.units')).toBeInTheDocument();
  });

  it('disarms Compare when the armed row is clicked again (no dialog)', async () => {
    const user = userEvent.setup();
    render(<VersionHistoryPanel versions={VERSIONS} onRollback={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Compare version 1' }));
    await user.click(screen.getByRole('button', { name: 'Compare version 1' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compare version 1' })).toHaveTextContent('Compare');
  });

  it('shows a Tags column only when an entry carries tags OR onEditTags is provided', () => {
    // No tags and no onEditTags → no Tags column.
    const { rerender } = render(<VersionHistoryPanel versions={VERSIONS} onRollback={vi.fn()} />);
    expect(screen.queryByRole('columnheader', { name: 'Tags' })).toBeNull();

    // An entry carrying tags → the Tags column appears.
    const tagged = taggedPair(['stable']);
    rerender(<VersionHistoryPanel versions={tagged} onRollback={vi.fn()} />);
    expect(screen.getByRole('columnheader', { name: 'Tags' })).toBeInTheDocument();
    expect(screen.getByText('stable')).toBeInTheDocument();
  });

  it('shows the Tags column when onEditTags is provided even with no tags', () => {
    render(
      <VersionHistoryPanel
        versions={VERSIONS}
        onRollback={vi.fn()}
        onEditTags={() => Promise.resolve()}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Tags' })).toBeInTheDocument();
  });

  it('opens an Edit-tags dialog seeded from the row tags and saves the new list', async () => {
    const user = userEvent.setup();
    const onEditTags = vi.fn().mockResolvedValue(undefined);
    const tagged = taggedPair(['stable']);
    render(<VersionHistoryPanel versions={tagged} onRollback={vi.fn()} onEditTags={onEditTags} />);

    await user.click(screen.getByRole('button', { name: 'Edit tags for version 1' }));
    const dialog = screen.getByRole('dialog');
    // Seeded from the row's tags: the existing chip has a Remove affordance.
    expect(within(dialog).getByRole('button', { name: 'Remove tag stable' })).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Add a tag'), 'reviewed');
    await user.click(within(dialog).getByRole('button', { name: 'Add tag' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save tags' }));

    expect(onEditTags).toHaveBeenCalledWith(1, ['stable', 'reviewed']);
  });

  it('renders a rejected Edit-tags save message verbatim and keeps the dialog open', async () => {
    const user = userEvent.setup();
    const onEditTags = vi.fn().mockRejectedValue(new Error('preset has no version 1'));
    const tagged = taggedPair(['stable']).slice(0, 1);
    render(<VersionHistoryPanel versions={tagged} onRollback={vi.fn()} onEditTags={onEditTags} />);

    await user.click(screen.getByRole('button', { name: 'Edit tags for version 1' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save tags' }));

    expect(await screen.findByText('preset has no version 1')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows no Edit-tags affordance when onEditTags is omitted', () => {
    const tagged = taggedPair(['stable']).slice(0, 1);
    render(<VersionHistoryPanel versions={tagged} onRollback={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Edit tags/ })).toBeNull();
  });

  it('renders a body containing markup as escaped TEXT, never an element (XSS pin)', () => {
    const payload = '<script>alert(1)</script>';
    const { container } = render(
      <VersionHistoryPanel
        versions={[{ version: 1, body: { note: payload }, is_current: true, created_at: 'now' }]}
        onRollback={vi.fn()}
      />,
    );
    expect(screen.getAllByText(/<script>alert\(1\)<\/script>/).length).toBeGreaterThan(0);
    expect(container.querySelector('script')).toBeNull();
  });

  it('states each row status as a mark PLUS a label, never color alone', () => {
    render(<VersionHistoryPanel versions={VERSIONS} onRollback={vi.fn()} />);

    const current = within(cellOf(2, 2)).getByText('Current');
    expect(current).toHaveClass('tai-status', 'tai-status-ok');
    expect(current.querySelector('svg')).not.toBeNull();

    const historical = within(cellOf(1, 2)).getByText('Historical');
    expect(historical).toHaveClass('tai-status', 'tai-status-pending');
    expect(historical.querySelector('svg')).not.toBeNull();
  });

  it('renders the version number and the timestamp in the machine voice', () => {
    render(<VersionHistoryPanel versions={VERSIONS} onRollback={vi.fn()} />);

    expect(cellOf(1, 0)).toHaveClass('tai-table-id');
    expect(cellOf(1, 0)).toHaveAttribute('data-numeric', 'true');
    expect(cellOf(1, 1)).toHaveClass('tai-mono');
    expect(screen.getByRole('columnheader', { name: 'Version' })).toHaveAttribute(
      'data-numeric',
      'true',
    );
  });

  it('scrolls the version table inside its own region and stacks the panel by class', () => {
    const { container } = render(<VersionHistoryPanel versions={VERSIONS} onRollback={vi.fn()} />);

    const panel = container.firstElementChild;
    expect(panel).toHaveClass('tai-stack');
    expect(panel?.getAttribute('style')).toBeNull();

    const table = screen.getByRole('table');
    expect(table.parentElement).toHaveClass('tai-scroll-region');
  });

  it('puts every dialog action row on the shared dialog-actions class', async () => {
    const user = userEvent.setup();
    render(<VersionHistoryPanel versions={VERSIONS} onRollback={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Roll back to version 1' }));
    const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: 'Roll back' });
    expect(confirm.parentElement).toHaveClass('tai-dialog-actions');
  });

  it.each(['light', 'dark'] as const)(
    'renders the history and keeps every action name under the %s theme',
    (theme) => {
      document.documentElement.setAttribute('data-theme', theme);
      render(
        <VersionHistoryPanel
          versions={taggedPair(['stable'])}
          onRollback={vi.fn()}
          onEditTags={() => Promise.resolve()}
        />,
      );

      expect(screen.getByText('Current')).toHaveClass('tai-status-ok');
      expect(screen.getByText('Version 2 body')).toHaveClass('tai-section-title');
      for (const name of [
        'View version 1',
        'Compare version 1',
        'Edit tags for version 1',
        'Roll back to version 1',
      ]) {
        expect(screen.getByRole('button', { name })).toBeInTheDocument();
      }
    },
  );
});
