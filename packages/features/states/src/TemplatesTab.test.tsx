/**
 * The Templates tab: the attachments table and the state-template catalog render; Attach
 * template opens a form over the template's parameter schema and PUTs the attachment;
 * Detach confirms and removes it; a template attached elsewhere cannot be deleted; a 501
 * shows FeatureDisabled.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, type StateDetail } from '@tai42/api-client';

import { TemplatesTab } from './TemplatesTab';
import { stateTemplatesKey } from './keys';
import { lastFileInput, renderWithProviders, type StubApiClient } from './test-utils';

function detail(attachments: unknown[] = []): StateDetail {
  return {
    name: 'profile',
    description: '',
    // A nested object property so the attachment path picker offers a non-root level.
    schema: { type: 'object', properties: { notes: { type: 'object' } } },
    subject_kinds: ['person'],
    default_subject_kind: 'person',
    retention_days: null,
    attachments,
    effective_schema: { type: 'object' },
    regimes: [],
  } as unknown as StateDetail;
}

function templateDoc(over: Record<string, unknown> = {}) {
  return {
    kind: 'state-template',
    name: 'notes',
    description: 'A notes fragment',
    parameters: {},
    schema: { type: 'object' },
    regimes: [],
    declarations: null,
    trace: {},
    attached_to: 0,
    shipped_default: false,
    ...over,
  };
}

function client(over: Partial<StubApiClient> = {}): StubApiClient {
  return {
    listStateTemplates: vi.fn().mockResolvedValue([templateDoc()]),
    ...over,
  };
}

describe('TemplatesTab', () => {
  it('renders the attachments table and the template catalog', async () => {
    renderWithProviders(
      <TemplatesTab
        state={detail([{ template: 'notes', path: ['notes'], parameters: {}, declarations: {} }])}
      />,
      { client: client() },
    );
    expect(await screen.findByText('Attachments')).toBeInTheDocument();
    expect(screen.getAllByText('notes').length).toBeGreaterThan(0);
    expect(screen.getByText('State templates')).toBeInTheDocument();
  });

  it('the attachment action icons keep their accessible names', async () => {
    renderWithProviders(
      <TemplatesTab
        state={detail([{ template: 'notes', path: ['notes'], parameters: {}, declarations: {} }])}
      />,
      { client: client() },
    );
    // The actions are icon-only buttons; their accessible name comes from `aria-label`,
    // so a screen reader (and every by-name query) still finds them.
    expect(await screen.findByRole('button', { name: 'Edit declarations' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Detach' })).toBeInTheDocument();
  });

  it('the catalog Shipped column badges a shipped default and dashes the rest', async () => {
    renderWithProviders(<TemplatesTab state={detail()} />, {
      client: client({
        listStateTemplates: vi
          .fn()
          .mockResolvedValue([
            templateDoc({ name: 'seeded', shipped_default: true }),
            templateDoc({ name: 'custom', shipped_default: false }),
          ]),
      }),
    });
    expect(await screen.findByText('Shipped')).toBeInTheDocument();
    // Exactly the shipped-default template carries the badge; the other's cell is a dash.
    expect(screen.getAllByText('shipped default')).toHaveLength(1);
    expect(screen.getAllByText('—')).toHaveLength(1);
  });

  it('Attach template PUTs the chosen template at its path', async () => {
    const user = userEvent.setup();
    const attachStateTemplate = vi.fn().mockResolvedValue({
      template: 'notes',
      path: ['notes'],
      parameters: {},
      declarations: {},
    });
    renderWithProviders(<TemplatesTab state={detail()} />, {
      client: client({ attachStateTemplate }),
    });
    const [attachBtn] = await screen.findAllByRole('button', { name: 'Attach template' });
    if (attachBtn === undefined) throw new Error('no Attach template button');
    await user.click(attachBtn);
    const dialog = await screen.findByRole('dialog');
    // Pick the template (options are labelled `name — description`).
    await user.click(within(dialog).getByLabelText('Template'));
    await user.click(await screen.findByRole('option', { name: 'notes — A notes fragment' }));
    // Pick an attachment path from the object-level picker.
    await user.click(within(dialog).getByLabelText('Attachment path'));
    await user.click(await screen.findByRole('option', { name: 'notes' }));
    await user.click(within(dialog).getByRole('button', { name: 'Attach' }));
    await waitFor(() => {
      expect(attachStateTemplate).toHaveBeenCalledWith('profile', 'notes', {
        path: ['notes'],
        parameters: {},
        declarations: {},
      });
    });
  });

  it('Detach confirms and removes the attachment', async () => {
    const user = userEvent.setup();
    const detachStateTemplate = vi.fn().mockResolvedValue({ name: 'notes', deleted: true });
    renderWithProviders(
      <TemplatesTab
        state={detail([{ template: 'notes', path: [], parameters: {}, declarations: {} }])}
      />,
      { client: client({ detachStateTemplate }) },
    );
    await user.click(await screen.findByRole('button', { name: 'Detach' }));
    await user.click(await screen.findByRole('button', { name: 'Detach', hidden: false }));
    await waitFor(() => {
      expect(detachStateTemplate).toHaveBeenCalledWith('profile', 'notes');
    });
  });

  it('a detach vetoed by a live binding shows the platform refusal verbatim and keeps the row', async () => {
    const user = userEvent.setup();
    const veto =
      "template 'notes' on state 'profile' cannot be detached — referenced by: preset 'welcome' version 1; hook 'greeter'";
    const detachStateTemplate = vi.fn().mockRejectedValue(new ApiError(veto, 409));
    renderWithProviders(
      <TemplatesTab
        state={detail([{ template: 'notes', path: [], parameters: {}, declarations: {} }])}
      />,
      { client: client({ detachStateTemplate }) },
    );
    await user.click(await screen.findByRole('button', { name: 'Detach' }));
    const confirm = await screen.findByRole('button', { name: 'Detach', hidden: false });
    await user.click(confirm);
    await waitFor(() => {
      expect(detachStateTemplate).toHaveBeenCalledWith('profile', 'notes');
    });
    // The platform message is rendered verbatim (never a generic "Request failed"),
    const alert = await screen.findByText(veto);
    expect(alert).toBeVisible();
    // the confirm dialog stays open with the attachment still present (row not removed),
    expect(
      screen.getByRole('heading', { name: "Detach 'notes' from 'profile'?" }),
    ).toBeInTheDocument();
    // and the Detach button re-enables so the operator can retry after fixing the binding.
    expect(screen.getByRole('button', { name: 'Detach', hidden: false })).toBeEnabled();
  });

  it('a template attached elsewhere cannot be deleted', async () => {
    renderWithProviders(<TemplatesTab state={detail()} />, {
      client: client({
        listStateTemplates: vi.fn().mockResolvedValue([templateDoc({ attached_to: 2 })]),
      }),
    });
    const del = await screen.findByRole('button', { name: 'Delete' });
    expect(del).toBeDisabled();
    expect(del).toHaveAttribute('title');
  });

  it('a 501 shows FeatureDisabled', async () => {
    renderWithProviders(<TemplatesTab state={detail()} />, {
      client: client({
        listStateTemplates: vi.fn().mockRejectedValue(new ApiError('no store', 501)),
      }),
    });
    expect(await screen.findByTestId('feature-disabled')).toBeInTheDocument();
  });

  it('Edit declarations saves the attachment when the template declares none', async () => {
    const user = userEvent.setup();
    const patchStateAttachment = vi.fn().mockResolvedValue({
      template: 'notes',
      path: [],
      parameters: {},
      declarations: {},
    });
    renderWithProviders(
      <TemplatesTab
        state={detail([{ template: 'notes', path: [], parameters: {}, declarations: {} }])}
      />,
      { client: client({ patchStateAttachment }) },
    );
    await user.click(await screen.findByRole('button', { name: 'Edit declarations' }));
    expect(await screen.findByText('This template declares nothing.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => {
      expect(patchStateAttachment).toHaveBeenCalledWith('profile', 'notes', { declarations: {} });
    });
  });

  it('deletes a detached template behind a confirm', async () => {
    const user = userEvent.setup();
    const deleteStateTemplate = vi.fn().mockResolvedValue({ name: 'notes', deleted: true });
    renderWithProviders(<TemplatesTab state={detail()} />, {
      client: client({ deleteStateTemplate }),
    });
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete template' }));
    await waitFor(() => {
      expect(deleteStateTemplate).toHaveBeenCalledWith('notes');
    });
  });

  it('Upload template PUTs the parsed document', async () => {
    const user = userEvent.setup();
    const putStateTemplate = vi.fn().mockResolvedValue(templateDoc());
    const { container } = renderWithProviders(<TemplatesTab state={detail()} />, {
      client: client({ putStateTemplate }),
    });
    await screen.findByText('State templates');
    const templateInput = lastFileInput(container);
    const file = new File(
      [JSON.stringify({ kind: 'state-template', name: 'notes', schema: {} })],
      'notes.json',
      {
        type: 'application/json',
      },
    );
    await user.upload(templateInput, file);
    await waitFor(() => {
      expect(putStateTemplate).toHaveBeenCalled();
    });
    expect(putStateTemplate.mock.calls[0]?.[0]).toBe('notes');
  });

  it('a bad template upload surfaces a loud alert', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<TemplatesTab state={detail()} />, {
      client: client(),
    });
    await screen.findByText('State templates');
    const templateInput = lastFileInput(container);
    await user.upload(templateInput, new File(['[]'], 'notes.json', { type: 'application/json' }));
    expect(await screen.findByText('This file must be a JSON object.')).toBeInTheDocument();
  });

  it('the attach form renders the template parameter schema', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TemplatesTab state={detail()} />, {
      client: client({
        listStateTemplates: vi.fn().mockResolvedValue([
          templateDoc({
            parameters: { type: 'object', properties: { limit: { type: 'number' } } },
          }),
        ]),
      }),
    });
    const [attachBtn] = await screen.findAllByRole('button', { name: 'Attach template' });
    if (attachBtn === undefined) throw new Error('no Attach template button');
    await user.click(attachBtn);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText('Template'));
    await user.click(await screen.findByRole('option', { name: 'notes — A notes fragment' }));
    // The parameter field from the template schema renders.
    expect(await within(dialog).findByText('limit')).toBeInTheDocument();
  });

  it('a template upload that clashes prompts Replace and retries with replace=true', async () => {
    const user = userEvent.setup();
    const putStateTemplate = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('template_exists', 409))
      .mockResolvedValueOnce(templateDoc());
    const { container } = renderWithProviders(<TemplatesTab state={detail()} />, {
      client: client({ putStateTemplate }),
    });
    await screen.findByText('State templates');
    const file = new File([JSON.stringify({ name: 'notes', schema: {} })], 'notes.json', {
      type: 'application/json',
    });
    await user.upload(lastFileInput(container), file);
    // The 409 opens the Replace confirm; a confirm retries with replace=true.
    await user.click(await screen.findByRole('button', { name: 'Replace template' }));
    await waitFor(() => {
      expect(putStateTemplate).toHaveBeenCalledTimes(2);
    });
    expect(putStateTemplate.mock.calls[0]?.[2]).toBe(false);
    expect(putStateTemplate.mock.calls[1]?.[2]).toBe(true);
  });

  it('a template upload clash cancelled fires no second PUT', async () => {
    const user = userEvent.setup();
    const putStateTemplate = vi.fn().mockRejectedValueOnce(new ApiError('template_exists', 409));
    const { container } = renderWithProviders(<TemplatesTab state={detail()} />, {
      client: client({ putStateTemplate }),
    });
    await screen.findByText('State templates');
    const file = new File([JSON.stringify({ name: 'notes', schema: {} })], 'notes.json', {
      type: 'application/json',
    });
    await user.upload(lastFileInput(container), file);
    await user.click(await screen.findByRole('button', { name: 'Keep existing' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(putStateTemplate).toHaveBeenCalledTimes(1);
  });

  it('a failed template replace renders its error in the dialog', async () => {
    const user = userEvent.setup();
    const putStateTemplate = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('template_exists', 409))
      .mockRejectedValueOnce(new Error('replace denied'));
    const { container } = renderWithProviders(<TemplatesTab state={detail()} />, {
      client: client({ putStateTemplate }),
    });
    await screen.findByText('State templates');
    const file = new File([JSON.stringify({ name: 'notes', schema: {} })], 'notes.json', {
      type: 'application/json',
    });
    await user.upload(lastFileInput(container), file);
    await user.click(await screen.findByRole('button', { name: 'Replace template' }));
    expect(await screen.findByText('replace denied')).toBeInTheDocument();
  });

  it('the attach form renders the template declaration schema up front', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TemplatesTab state={detail()} />, {
      client: client({
        listStateTemplates: vi.fn().mockResolvedValue([
          templateDoc({
            declarations: { schema: { type: 'object', properties: { tag: { type: 'string' } } } },
          }),
        ]),
      }),
    });
    const [attachBtn] = await screen.findAllByRole('button', { name: 'Attach template' });
    if (attachBtn === undefined) throw new Error('no Attach template button');
    await user.click(attachBtn);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText('Template'));
    await user.click(await screen.findByRole('option', { name: 'notes — A notes fragment' }));
    // The Declarations group renders the template's declaration schema field.
    expect(await within(dialog).findByText('tag')).toBeInTheDocument();
  });

  it('Edit declarations renders the schema when the template declares fields', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <TemplatesTab
        state={detail([{ template: 'notes', path: [], parameters: {}, declarations: {} }])}
      />,
      {
        client: client({
          listStateTemplates: vi.fn().mockResolvedValue([
            templateDoc({
              declarations: { schema: { type: 'object', properties: { tag: { type: 'string' } } } },
            }),
          ]),
        }),
      },
    );
    await user.click(await screen.findByRole('button', { name: 'Edit declarations' }));
    expect(await screen.findByText('tag')).toBeInTheDocument();
  });

  it('invalidates the template catalog after an attach (the attached_to count changes)', async () => {
    const user = userEvent.setup();
    const attachStateTemplate = vi.fn().mockResolvedValue({
      template: 'notes',
      path: ['notes'],
      parameters: {},
      declarations: {},
    });
    const { queryClient } = renderWithProviders(<TemplatesTab state={detail()} />, {
      client: client({ attachStateTemplate }),
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const [attachBtn] = await screen.findAllByRole('button', { name: 'Attach template' });
    if (attachBtn === undefined) throw new Error('no Attach template button');
    await user.click(attachBtn);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText('Template'));
    await user.click(await screen.findByRole('option', { name: 'notes — A notes fragment' }));
    await user.click(within(dialog).getByLabelText('Attachment path'));
    await user.click(await screen.findByRole('option', { name: 'notes' }));
    await user.click(within(dialog).getByRole('button', { name: 'Attach' }));
    // The catalog's server-derived count changes on attach, so its query is refetched.
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: stateTemplatesKey });
    });
  });

  it('invalidates the template catalog after a detach (the attached_to count changes)', async () => {
    const user = userEvent.setup();
    const detachStateTemplate = vi.fn().mockResolvedValue({ name: 'notes', deleted: true });
    const { queryClient } = renderWithProviders(
      <TemplatesTab
        state={detail([{ template: 'notes', path: [], parameters: {}, declarations: {} }])}
      />,
      { client: client({ detachStateTemplate }) },
    );
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    await user.click(await screen.findByRole('button', { name: 'Detach' }));
    await user.click(await screen.findByRole('button', { name: 'Detach', hidden: false }));
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: stateTemplatesKey });
    });
  });

  it('the attachments empty state action opens the attach dialog', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TemplatesTab state={detail()} />, { client: client() });
    const buttons = await screen.findAllByRole('button', { name: 'Attach template' });
    const emptyAction = buttons[1];
    if (emptyAction === undefined) throw new Error('no empty-state Attach template button');
    await user.click(emptyAction);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

describe('TemplatesTab — orphan reconcile on a declarations edit', () => {
  /** A 422 whose body carries the reconcile refusal's structured orphan payload. */
  const orphanRefusal = () =>
    new ApiError(
      're-attaching would orphan open records; re-attach with options to close them.',
      422,
      undefined,
      undefined,
      {
        reconcile: true,
        orphans: [
          { subject: 't-001', kind: 'thread', id: 'n1', label: 'First open note' },
          { subject: 't-002', kind: 'thread', id: 'n2', label: 'Second open note' },
        ],
      },
    );

  it('renders the structured orphan list and retries with a close resolution', async () => {
    const user = userEvent.setup();
    const patchStateAttachment = vi
      .fn()
      .mockRejectedValueOnce(orphanRefusal())
      .mockResolvedValueOnce({});
    renderWithProviders(
      <TemplatesTab
        state={detail([{ template: 'notes', path: ['notes'], parameters: {}, declarations: {} }])}
      />,
      {
        client: client({
          patchStateAttachment,
          listStateTemplates: vi
            .fn()
            .mockResolvedValue([
              templateDoc({ reconcile: { view: '.', close: '[]', resolutions: '.' } }),
            ]),
        }),
      },
    );

    await user.click(await screen.findByRole('button', { name: 'Edit declarations' }));
    await user.click(await screen.findByRole('button', { name: 'Save changes' }));

    // The resolve view renders the orphans FROM THE STRUCTURED DATA (subject/kind/label).
    expect(await screen.findByText('Open records to close')).toBeInTheDocument();
    expect(screen.getByText('t-001')).toBeInTheDocument();
    expect(screen.getByText('First open note')).toBeInTheDocument();
    expect(screen.getByText('Second open note')).toBeInTheDocument();
    const resolution = await screen.findByLabelText('Resolution');
    await user.type(resolution, 'not-done');

    await user.click(screen.getByRole('button', { name: 'Close orphans and save' }));
    await waitFor(() => {
      expect(patchStateAttachment).toHaveBeenCalledTimes(2);
    });
    expect(patchStateAttachment.mock.calls[1]?.[2]).toMatchObject({
      options: { orphans: 'close', resolution: 'not-done' },
    });
  });

  it('does NOT show the resolve step for a 422 without a reconcile orphan payload', async () => {
    const user = userEvent.setup();
    const patchStateAttachment = vi
      .fn()
      .mockRejectedValue(new ApiError('a declaration value failed validation', 422));
    renderWithProviders(
      <TemplatesTab
        state={detail([{ template: 'notes', path: ['notes'], parameters: {}, declarations: {} }])}
      />,
      { client: client({ patchStateAttachment }) },
    );

    await user.click(await screen.findByRole('button', { name: 'Edit declarations' }));
    await user.click(await screen.findByRole('button', { name: 'Save changes' }));

    // The error surfaces, but no resolve step (no orphan table, no resolution field, no relabel).
    expect(await screen.findByText('a declaration value failed validation')).toBeInTheDocument();
    expect(screen.queryByText('Open records to close')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Resolution')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Close orphans and save' }),
    ).not.toBeInTheDocument();
  });
});
