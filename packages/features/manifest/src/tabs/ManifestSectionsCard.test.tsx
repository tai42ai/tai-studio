/**
 * Tests for the manifest-sections editor: the tools/agents per-entry add-remove doors
 * and the api_tools list edits. A stub client records each call; the capability
 * projection gates whether the card renders at all. Removes run only behind the house
 * confirm; a malformed add is a loud inline error that sends no request.
 */
import { ApiError } from '@tai42/api-client';
import {
  failureWithRoll,
  reportHeading,
  ROLL_FAILURE_HEADING,
  ROLL_FAILURE_MESSAGE,
} from '@tai42/test-support';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { fullProjection, renderWithProviders, scopedProjection } from '../test-utils';
import { ManifestSectionsCard } from './ManifestSectionsCard';

const applyResult = {
  status: 'ok',
  env_keys: 0,
  awaiting_respawn: [],
  recycle: null,
  fanout: { mode: 'local-only', note: 'only this worker reloaded' },
};

/** A reply whose recycle roll stopped at a worker it left awaiting a restart. */
const stoppedRollResult = {
  status: 'ok',
  env_keys: 1,
  awaiting_respawn: [{ name: 'backend-2', keys: ['K'] }],
  span_release_error: null,
  roll_deferred: false,
  roll_deferred_to: null,
  fanout: {
    mode: 'fleet',
    op: 'reload_config',
    reachable: true,
    local_only: false,
    results: [
      {
        name: 'backend-2',
        outcome: 'applied',
        payload: { status: 'ok' },
        error: null,
        detail: null,
      },
    ],
    error: null,
  },
  recycle: {
    recycle: [
      {
        name: 'backend-2',
        kind: 'backend',
        status: 'timed-out',
        generation_before: 1,
        keys: ['K'],
        detail: 'old life still present',
      },
    ],
    skipped: [],
    fresh: [],
    recycle_stopped: { kind: 'backend', name: 'backend-2', detail: 'old life still present' },
  },
};

/** A failed write whose error body carries a recycle roll that stopped. */
function failureCarryingRoll(): ApiError {
  return new ApiError(ROLL_FAILURE_MESSAGE, 500, undefined, undefined, {
    error: ROLL_FAILURE_MESSAGE,
    error_id: 'err-1',
    recycle: stoppedRollResult.recycle,
    awaiting_respawn: [],
    roll_deferred: false,
    roll_deferred_to: null,
  });
}

describe('ManifestSectionsCard', () => {
  it('adds tool entries from pasted JSON (single object, replace off by default)', async () => {
    const user = userEvent.setup();
    const addToolsEntries = vi.fn().mockResolvedValue(applyResult);
    renderWithProviders(<ManifestSectionsCard />, {
      client: { addToolsEntries },
      projection: fullProjection(),
    });

    await screen.findByText('Manifest sections');
    await user.type(screen.getByLabelText('Add tool entries'), '{{"title":"echo","module":"mod"}');
    await user.click(screen.getByRole('button', { name: 'Add tool entries' }));

    expect(addToolsEntries).toHaveBeenCalledWith([{ title: 'echo', module: 'mod' }], false);
  });

  it('accepts an array of entries and honours the replace toggle', async () => {
    const user = userEvent.setup();
    const addToolsEntries = vi.fn().mockResolvedValue(applyResult);
    renderWithProviders(<ManifestSectionsCard />, {
      client: { addToolsEntries },
      projection: fullProjection(),
    });

    await screen.findByText('Manifest sections');
    // A JSON array is set directly (userEvent treats `[`/`{` as special key syntax).
    fireEvent.change(screen.getByLabelText('Add tool entries'), {
      target: { value: '[{"title":"a","module":"m"}]' },
    });
    // The tools section's replace toggle (the agents section has its own).
    await user.click(
      screen.getByRole('checkbox', { name: 'Replace an existing tool entry with the same title' }),
    );
    await user.click(screen.getByRole('button', { name: 'Add tool entries' }));

    expect(addToolsEntries).toHaveBeenCalledWith([{ title: 'a', module: 'm' }], true);
  });

  it('rejects malformed JSON loudly without sending a request', async () => {
    const user = userEvent.setup();
    const addToolsEntries = vi.fn();
    renderWithProviders(<ManifestSectionsCard />, {
      client: { addToolsEntries },
      projection: fullProjection(),
    });

    await screen.findByText('Manifest sections');
    await user.type(screen.getByLabelText('Add tool entries'), 'not json');
    await user.click(screen.getByRole('button', { name: 'Add tool entries' }));

    expect(screen.getByText(/Invalid JSON/)).toBeInTheDocument();
    expect(addToolsEntries).not.toHaveBeenCalled();
  });

  it('rejects an entry missing a title', async () => {
    const user = userEvent.setup();
    const addToolsEntries = vi.fn();
    renderWithProviders(<ManifestSectionsCard />, {
      client: { addToolsEntries },
      projection: fullProjection(),
    });

    await screen.findByText('Manifest sections');
    await user.type(screen.getByLabelText('Add tool entries'), '{{"module":"mod"}');
    await user.click(screen.getByRole('button', { name: 'Add tool entries' }));

    expect(screen.getByText(/non-empty "title"/)).toBeInTheDocument();
    expect(addToolsEntries).not.toHaveBeenCalled();
  });

  it('removes a tool entry by title only after the house confirm', async () => {
    const user = userEvent.setup();
    const removeToolsEntry = vi.fn().mockResolvedValue(applyResult);
    renderWithProviders(<ManifestSectionsCard />, {
      client: { removeToolsEntry },
      projection: fullProjection(),
    });

    await screen.findByText('Manifest sections');
    await user.type(screen.getByLabelText('Remove tool entry'), 'echo');
    await user.click(screen.getByRole('button', { name: 'Remove tool entry' }));

    expect(removeToolsEntry).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove tool entry' }));
    expect(removeToolsEntry).toHaveBeenCalledWith('echo');
  });

  it('adds and removes an api_tools name on the chosen list', async () => {
    const user = userEvent.setup();
    const updateApiTools = vi.fn().mockResolvedValue(applyResult);
    renderWithProviders(<ManifestSectionsCard />, {
      client: { updateApiTools },
      projection: fullProjection(),
    });

    await screen.findByText('API tools');
    await user.type(screen.getByLabelText('Operation name'), 'weather');
    // The list defaults to Include.
    await user.click(screen.getByRole('button', { name: 'Add name' }));
    expect(updateApiTools).toHaveBeenCalledWith({ include_add: ['weather'] });
  });

  it('reports the recycle roll an entry add ran', async () => {
    const user = userEvent.setup();
    const addToolsEntries = vi.fn().mockResolvedValue(stoppedRollResult);
    renderWithProviders(<ManifestSectionsCard />, {
      client: { addToolsEntries },
      projection: fullProjection(),
    });

    await screen.findByText('Manifest sections');
    fireEvent.change(screen.getByLabelText('Add tool entries'), {
      target: { value: '{"title":"echo","module":"mod"}' },
    });
    await user.click(screen.getByRole('button', { name: 'Add tool entries' }));

    expect(await screen.findByTestId('recycle-stopped')).toHaveTextContent(
      'The recycle stopped at backend-2 (backend workers)',
    );
    expect(screen.getByTestId('recycle-stopped')).toHaveTextContent('old life still present');
    expect(
      screen.getByText(
        reportHeading('1 worker needs a restart to apply some settings — add tool entries'),
      ),
    ).toBeVisible();
  });

  it('reports the recycle roll an entry removal ran', async () => {
    const user = userEvent.setup();
    const removeAgentsEntry = vi.fn().mockResolvedValue(stoppedRollResult);
    renderWithProviders(<ManifestSectionsCard />, {
      client: { removeAgentsEntry },
      projection: fullProjection(),
    });

    await screen.findByText('Manifest sections');
    await user.type(screen.getByLabelText('Remove agent entry'), 'helper');
    await user.click(screen.getByRole('button', { name: 'Remove agent entry' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove agent entry' }));

    expect(await screen.findByTestId('recycle-stopped')).toHaveTextContent(
      'The recycle stopped at backend-2 (backend workers)',
    );
    expect(screen.getByTestId('recycle-stopped')).toHaveTextContent('old life still present');
    expect(
      screen.getByText(
        reportHeading('1 worker needs a restart to apply some settings — remove agent entry'),
      ),
    ).toBeVisible();
  });

  it('reports the recycle roll an api_tools edit ran', async () => {
    const user = userEvent.setup();
    const updateApiTools = vi.fn().mockResolvedValue(stoppedRollResult);
    renderWithProviders(<ManifestSectionsCard />, {
      client: { updateApiTools },
      projection: fullProjection(),
    });

    await screen.findByText('API tools');
    await user.type(screen.getByLabelText('Operation name'), 'weather');
    await user.click(screen.getByRole('button', { name: 'Add name' }));

    expect(await screen.findByTestId('recycle-stopped')).toHaveTextContent(
      'The recycle stopped at backend-2 (backend workers)',
    );
    expect(screen.getByTestId('recycle-stopped')).toHaveTextContent('old life still present');
    expect(
      screen.getByText(
        reportHeading('1 worker needs a restart to apply some settings — api_tools'),
      ),
    ).toBeVisible();
  });

  it('withdraws the Tools remove affordance when the projection reaches add but not the DELETE door', async () => {
    // The tools ADD door (POST) is reachable, so the section renders; the remove door is
    // a distinct DYNAMIC DELETE this scoped projection cannot reach, so Remove is withdrawn.
    renderWithProviders(<ManifestSectionsCard />, {
      client: { addToolsEntries: vi.fn(), removeToolsEntry: vi.fn() },
      projection: scopedProjection({
        routes: [{ path: '/api/tools-config/entries', methods: ['POST'] }],
      }),
    });

    await screen.findByText('Manifest sections');
    // Add stays offered…
    expect(screen.getByRole('button', { name: 'Add tool entries' })).toBeInTheDocument();
    // …but the remove control (a door this caller can only be refused) is gone.
    expect(screen.queryByLabelText('Remove tool entry')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove tool entry' })).not.toBeInTheDocument();
  });

  it('offers the Tools remove affordance for a full (admin) projection', async () => {
    renderWithProviders(<ManifestSectionsCard />, {
      client: { addToolsEntries: vi.fn(), removeToolsEntry: vi.fn() },
      projection: fullProjection(),
    });

    await screen.findByText('Manifest sections');
    expect(screen.getByLabelText('Remove tool entry')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove tool entry' })).toBeInTheDocument();
  });

  it('is withdrawn entirely for a reader whose projection cannot reach the doors', async () => {
    renderWithProviders(<ManifestSectionsCard />, {
      client: { addToolsEntries: vi.fn() },
      // No projection → capability stays loading → every write gate fails closed.
    });

    await waitFor(() => {
      expect(screen.queryByText('Manifest sections')).not.toBeInTheDocument();
    });
  });
});

describe('ManifestSectionsCard — a failed write that carries a recycle roll', () => {
  it('shows the roll beside the error of a failed entry add', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ManifestSectionsCard />, {
      client: { addToolsEntries: vi.fn().mockRejectedValue(failureWithRoll()) },
      projection: fullProjection(),
    });

    await screen.findByText('Manifest sections');
    fireEvent.change(screen.getByLabelText('Add tool entries'), {
      target: { value: '{"title":"echo","module":"mod"}' },
    });
    await user.click(screen.getByRole('button', { name: 'Add tool entries' }));

    expect(
      await screen.findByText(reportHeading(`${ROLL_FAILURE_HEADING} — add tool entries`)),
    ).toBeInTheDocument();
    expect(screen.getByText(ROLL_FAILURE_MESSAGE)).toBeInTheDocument();
  });

  it('shows the roll beside the error of a failed api_tools edit', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ManifestSectionsCard />, {
      client: { updateApiTools: vi.fn().mockRejectedValue(failureWithRoll()) },
      projection: fullProjection(),
    });

    await screen.findByText('API tools');
    await user.type(screen.getByLabelText('Operation name'), 'weather');
    await user.click(screen.getByRole('button', { name: 'Add name' }));

    expect(
      await screen.findByText(reportHeading(`${ROLL_FAILURE_HEADING} — api_tools`)),
    ).toBeInTheDocument();
    expect(screen.getByText(ROLL_FAILURE_MESSAGE)).toBeInTheDocument();
  });

  it('names a failed entry add on its roll', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ManifestSectionsCard />, {
      client: { addToolsEntries: vi.fn().mockRejectedValue(failureCarryingRoll()) },
      projection: fullProjection(),
    });

    await screen.findByText('Manifest sections');
    fireEvent.change(screen.getByLabelText('Add tool entries'), {
      target: { value: '{"title":"echo","module":"mod"}' },
    });
    await user.click(screen.getByRole('button', { name: 'Add tool entries' }));

    expect(
      await screen.findByRole('region', { name: 'Worker recycle — add tool entries' }),
    ).toBeVisible();
  });

  it('names a failed entry removal in its confirm', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ManifestSectionsCard />, {
      client: { removeAgentsEntry: vi.fn().mockRejectedValue(failureCarryingRoll()) },
      projection: fullProjection(),
    });

    await screen.findByText('Manifest sections');
    await user.type(screen.getByLabelText('Remove agent entry'), 'helper');
    await user.click(screen.getByRole('button', { name: 'Remove agent entry' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove agent entry' }));

    expect(
      await within(dialog).findByRole('region', { name: 'Worker recycle — remove agent entry' }),
    ).toBeVisible();
  });
});

describe('ManifestSectionsCard — the reports of several writes', () => {
  it('names the add and the removal whose reports stack on one section', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ManifestSectionsCard />, {
      client: {
        addToolsEntries: vi.fn().mockResolvedValue(stoppedRollResult),
        removeToolsEntry: vi.fn().mockResolvedValue(stoppedRollResult),
      },
      projection: fullProjection(),
    });

    await screen.findByText('Manifest sections');
    fireEvent.change(screen.getByLabelText('Add tool entries'), {
      target: { value: '{"title":"echo","module":"mod"}' },
    });
    await user.click(screen.getByRole('button', { name: 'Add tool entries' }));
    await screen.findByRole('region', { name: 'Worker recycle — add tool entries' });

    await user.type(screen.getByLabelText('Remove tool entry'), 'helper');
    await user.click(screen.getByRole('button', { name: 'Remove tool entry' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove tool entry' }));

    expect(
      await screen.findByRole('region', { name: 'Worker recycle — remove tool entry' }),
    ).toBeVisible();
    expect(screen.getByRole('region', { name: 'Worker recycle — add tool entries' })).toBeVisible();
    expect(
      screen.getByText(
        reportHeading('1 worker needs a restart to apply some settings — add tool entries'),
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        reportHeading('1 worker needs a restart to apply some settings — remove tool entry'),
      ),
    ).toBeVisible();
  });
});
