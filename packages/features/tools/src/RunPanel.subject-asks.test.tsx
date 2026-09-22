/**
 * The run panel's subject and caller-ask surfaces: the optional Subject section
 * (collapsed default sends no subject; expanded + filled sends it; a partial subject is
 * refused) and the read-only caller-ask list (an asks envelope renders the asks list; a
 * `resume_parked` / `cancel_parked` run's visit outcome renders by its kind; the empty
 * and user-only-park notes).
 */
import type { RunToolArgs } from '@tai42/api-client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AutoFormRunPanel } from './RunPanel';
import { fullProjection, renderWithProviders, type StubApiClient } from './test-utils';

const EMPTY_OBJECT_SCHEMA = { type: 'object', properties: {}, required: [] } as const;

/** The asks envelope a run returns when its tool parked one caller ask. */
const ASKS_RESULT = {
  asks: [{ id: 'ask-1', status: 'asking', question: 'Approve?' }],
};

/** Find the enabled sync Run button (it starts disabled until the projection resolves). */
async function findEnabledRun(): Promise<HTMLElement> {
  const button = await screen.findByRole('button', { name: 'Run' });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

async function expandAndPickTarget(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('button', { name: 'Subject (optional)' }));
  await user.click(await screen.findByLabelText('Target'));
  await user.click(await screen.findByRole('option', { name: 'agent · assistant' }));
}

/** A `listConversationRoutes` stub carrying just the two target fields the subject
 *  sub-form reads; the double cast bridges the partial row to the client's full type,
 *  the same shape the scheduling suite's subject test uses. */
function routesStub(): NonNullable<StubApiClient['listConversationRoutes']> {
  return vi.fn(async () => ({
    items: [{ target_kind: 'agent', target_name: 'assistant' }],
    total: 1,
  })) as unknown as NonNullable<StubApiClient['listConversationRoutes']>;
}

describe('AutoFormRunPanel — Subject section', () => {
  it('is collapsed by default and sends no subject on a plain run', async () => {
    const user = userEvent.setup();
    const runTool = vi.fn().mockResolvedValue({ ok: 1 });
    const listConversationRoutes = vi.fn();
    const client: StubApiClient = {
      runTool,
      listToolRuns: vi.fn().mockResolvedValue([]),
      listConversationRoutes,
    };
    renderWithProviders(<AutoFormRunPanel toolName="echo" schema={EMPTY_OBJECT_SCHEMA} />, {
      client,
      projection: fullProjection(),
    });

    await user.click(await findEnabledRun());

    const args = runTool.mock.calls[0]?.[0] as RunToolArgs | undefined;
    expect(args?.subject).toBeUndefined();
    // The collapsed section never mounted the conversation-targets query.
    expect(listConversationRoutes).not.toHaveBeenCalled();
  });

  it('sends the subject when the section is expanded and filled', async () => {
    const user = userEvent.setup();
    const runTool = vi.fn().mockResolvedValue({ ok: 1 });
    const client: StubApiClient = {
      runTool,
      listToolRuns: vi.fn().mockResolvedValue([]),
      listConversationRoutes: routesStub(),
    };
    renderWithProviders(<AutoFormRunPanel toolName="echo" schema={EMPTY_OBJECT_SCHEMA} />, {
      client,
      projection: fullProjection(),
    });

    await expandAndPickTarget(user);
    await user.type(screen.getByLabelText('Subject kind'), 'person');
    await user.type(screen.getByLabelText('Subject key'), 'a-42');
    await user.click(await findEnabledRun());

    const args = runTool.mock.calls[0]?.[0] as RunToolArgs | undefined;
    expect(args?.subject).toEqual({
      target_kind: 'agent',
      target_name: 'assistant',
      kind: 'person',
      key: 'a-42',
    });
  });

  it('refuses a partial subject and never runs', async () => {
    const user = userEvent.setup();
    const runTool = vi.fn().mockResolvedValue({ ok: 1 });
    const client: StubApiClient = {
      runTool,
      listToolRuns: vi.fn().mockResolvedValue([]),
      listConversationRoutes: routesStub(),
    };
    renderWithProviders(<AutoFormRunPanel toolName="echo" schema={EMPTY_OBJECT_SCHEMA} />, {
      client,
      projection: fullProjection(),
    });

    await expandAndPickTarget(user);
    // Kind + key left blank.
    await user.click(await findEnabledRun());

    expect(runTool).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'A subject needs a target, a kind, and a key.',
    );
  });

  it('keyboard: the Subject toggle expands from the keyboard', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      runTool: vi.fn(),
      listToolRuns: vi.fn().mockResolvedValue([]),
      listConversationRoutes: routesStub(),
    };
    renderWithProviders(<AutoFormRunPanel toolName="echo" schema={EMPTY_OBJECT_SCHEMA} />, {
      client,
      projection: fullProjection(),
    });

    const toggle = await screen.findByRole('button', { name: 'Subject (optional)' });
    toggle.focus();
    expect(toggle).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(await screen.findByLabelText('Subject kind')).toBeInTheDocument();
  });
});

describe('AutoFormRunPanel — caller asks', () => {
  function asksClient(runTool: NonNullable<StubApiClient['runTool']>): StubApiClient {
    return { runTool, listToolRuns: vi.fn().mockResolvedValue([]) };
  }

  it('renders the read-only asks list when a run parks caller asks', async () => {
    const user = userEvent.setup();
    const runTool = vi.fn().mockResolvedValue(ASKS_RESULT);
    renderWithProviders(<AutoFormRunPanel toolName="echo" schema={EMPTY_OBJECT_SCHEMA} />, {
      client: asksClient(runTool),
      projection: fullProjection(),
    });

    await user.click(await findEnabledRun());

    expect(await screen.findByText('Approve?')).toBeInTheDocument();
    // The id an operator copies into a resume_parked run is on the row.
    expect(screen.getByLabelText('Ask id ask-1')).toHaveTextContent('ask-1');
  });

  it('states the empty case when the run parked with no open asks', async () => {
    const user = userEvent.setup();
    const runTool = vi.fn().mockResolvedValue({ asks: [] });
    renderWithProviders(<AutoFormRunPanel toolName="echo" schema={EMPTY_OBJECT_SCHEMA} />, {
      client: asksClient(runTool),
      projection: fullProjection(),
    });

    await user.click(await findEnabledRun());

    expect(await screen.findByTestId('asks-empty')).toHaveTextContent(
      'This run parked with no open asks.',
    );
  });

  it('shows the no-open-asks note when a run parks only user asks', async () => {
    const user = userEvent.setup();
    const runTool = vi.fn().mockResolvedValue({
      interaction_id: 'u1',
      interaction_ids: ['u1'],
      caller_interaction_ids: [],
    });
    renderWithProviders(<AutoFormRunPanel toolName="echo" schema={EMPTY_OBJECT_SCHEMA} />, {
      client: asksClient(runTool),
      projection: fullProjection(),
    });

    await user.click(await findEnabledRun());

    expect(await screen.findByTestId('run-parked-note')).toHaveTextContent(
      'This run parked with no open asks.',
    );
  });

  it('renders a resume_parked run visit outcome as its final result', async () => {
    const user = userEvent.setup();
    const runTool = vi.fn().mockResolvedValue({
      action: 'resumed',
      cancelled: [],
      kind: 'result',
      result: { done: true },
    });
    renderWithProviders(
      <AutoFormRunPanel toolName="resume_parked" schema={EMPTY_OBJECT_SCHEMA} />,
      { client: asksClient(runTool), projection: fullProjection() },
    );

    await user.click(await findEnabledRun());

    expect(await screen.findByText('done:')).toBeInTheDocument();
  });

  it('renders new caller asks from a resume_parked run as another read-only list', async () => {
    const user = userEvent.setup();
    const runTool = vi.fn().mockResolvedValue({
      action: 'resumed',
      cancelled: [],
      kind: 'asks',
      asks: [{ id: 'ask-2', status: 'asking', question: 'And now?' }],
    });
    renderWithProviders(
      <AutoFormRunPanel toolName="resume_parked" schema={EMPTY_OBJECT_SCHEMA} />,
      { client: asksClient(runTool), projection: fullProjection() },
    );

    await user.click(await findEnabledRun());

    expect(await screen.findByText('And now?')).toBeInTheDocument();
    expect(screen.getByLabelText('Ask id ask-2')).toHaveTextContent('ask-2');
  });
});
