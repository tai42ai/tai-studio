import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { emitFrame, interactionJson, renderInbox } from './test-utils';

describe('InteractionsPage — form preview: per-send values, options and pages', () => {
  /** A generic form: the abstract shape the design's example uses. */
  const detailsSchema = {
    type: 'object',
    properties: {
      date: { type: 'string' },
      count: { type: 'integer' },
      notes: { type: 'string' },
    },
  };

  it('prefills the form controls from per-send data.values, and submits them', async () => {
    const user = userEvent.setup();
    const answer = vi.fn().mockResolvedValue(undefined);
    const { channel } = renderInbox(answer);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-form-data',
        format: 'form',
        prompt: 'Fill in the details',
        format_payload: {
          schema: {
            type: 'object',
            properties: { count: { type: 'integer' }, notes: { type: 'string' } },
          },
          data: { values: { count: 2, notes: 'note text' } },
        },
      }),
    );

    expect(await screen.findByLabelText('count')).toHaveValue(2);
    expect(screen.getByLabelText('notes')).toHaveValue('note text');

    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(answer).toHaveBeenCalledWith('q-form-data', {
        count: 2,
        notes: 'note text',
      });
    });
  });

  it('shows the per-send value→label mapping as read-only context (label with its value; value alone when unlabelled)', async () => {
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-form-opts',
        format: 'form',
        prompt: 'Fill in the details',
        format_payload: {
          schema: { type: 'object', properties: { date: { type: 'string' } } },
          data: {
            options: {
              date: [{ value: 'a', label: 'Option A' }, { value: 'b' }],
            },
          },
        },
      }),
    );

    // The control renders the raw values, so the block names what each value means:
    // `label (value)` for a labelled option, the bare value for an unlabelled one.
    const opts = await screen.findByTestId('form-send-options');
    expect(within(opts).getByText('date')).toBeInTheDocument();
    expect(within(opts).getByText('Option A (a), b')).toBeInTheDocument();
  });

  it('renders a re-optioned field as a choice of the per-send values, not a free control', async () => {
    const user = userEvent.setup();
    const answer = vi.fn().mockResolvedValue(undefined);
    const { channel } = renderInbox(answer);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-form-opts-control',
        format: 'form',
        prompt: 'Fill in the details',
        format_payload: {
          schema: { type: 'object', properties: { date: { type: 'string' } } },
          data: {
            options: {
              date: [
                { value: 'a', label: 'Option A' },
                { value: 'b', label: 'Option B' },
              ],
            },
          },
        },
      }),
    );

    // The published `date` was a free string; with a per-send option list it is now a
    // choice control offering exactly the send's values — no free text input to type an
    // out-of-list value into. (A two-option enum renders as radios; SchemaForm falls
    // back to a select above three options.)
    expect(await screen.findByRole('radio', { name: 'a' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'b' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'date' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'a' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(answer).toHaveBeenCalledWith('q-form-opts-control', { date: 'a' });
    });
  });

  it('renders a select for a re-optioned field with more than three per-send values', async () => {
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-form-opts-select',
        format: 'form',
        prompt: 'Fill in the details',
        format_payload: {
          schema: { type: 'object', properties: { date: { type: 'string' } } },
          data: {
            options: {
              date: [{ value: 'a' }, { value: 'b' }, { value: 'c' }, { value: 'd' }],
            },
          },
        },
      }),
    );

    // Four values exceed SchemaForm's radio cap, so the choice renders as a select.
    expect(await screen.findByRole('combobox', { name: 'date' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'date' })).not.toBeInTheDocument();
  });

  it('prefills a re-optioned field with the send value when it is one of the choices', async () => {
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-form-opts-prefill',
        format: 'form',
        prompt: 'Fill in the details',
        format_payload: {
          schema: { type: 'object', properties: { date: { type: 'string' } } },
          data: {
            values: { date: 'b' },
            options: {
              date: [
                { value: 'a', label: 'Option A' },
                { value: 'b', label: 'Option B' },
              ],
            },
          },
        },
      }),
    );

    // A prefill inside the per-send set selects that choice. The ask door validates
    // every prefill against the effective (re-optioned) schema before delivery, so a
    // prefill OUTSIDE the set can never reach the preview — no in-preview case for it.
    const selected = await screen.findByRole('radio', { name: 'b' });
    expect(selected).toBeChecked();
    expect(screen.getByRole('radio', { name: 'a' })).not.toBeChecked();
  });

  it('leaves a field with no per-send options as its unchanged control', async () => {
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-form-opts-mixed',
        format: 'form',
        prompt: 'Fill in the details',
        format_payload: {
          schema: {
            type: 'object',
            properties: { date: { type: 'string' }, notes: { type: 'string' } },
          },
          data: {
            options: { date: [{ value: 'a' }, { value: 'b' }] },
          },
        },
      }),
    );

    // `date` becomes a choice; `notes` (no per-send list) stays a free text control.
    expect(await screen.findByRole('radio', { name: 'a' })).toBeInTheDocument();
    expect(screen.getByLabelText('notes')).toHaveValue('');
    expect(screen.queryByRole('textbox', { name: 'date' })).not.toBeInTheDocument();
  });

  it('re-options an array-of-strings field on its items, so each added item is a choice', async () => {
    const user = userEvent.setup();
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-form-opts-array',
        format: 'form',
        prompt: 'Fill in the details',
        format_payload: {
          schema: {
            type: 'object',
            properties: { tags: { type: 'array', items: { type: 'string' } } },
          },
          data: {
            options: {
              tags: [
                { value: 'x', label: 'Ex' },
                { value: 'y', label: 'Why' },
              ],
            },
          },
        },
      }),
    );

    // The per-send list lands on the array's ITEMS, so a newly added item is a choice of
    // the send's values rather than a free string.
    await user.click(await screen.findByRole('button', { name: 'Add item' }));
    expect(screen.getByRole('radio', { name: 'x' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'y' })).toBeInTheDocument();
  });

  it('omits the options block when every field per-send list is empty', async () => {
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-form-opts-empty',
        format: 'form',
        prompt: 'Fill in the details',
        format_payload: {
          schema: { type: 'object', properties: { date: { type: 'string' } } },
          data: { options: { date: [] } },
        },
      }),
    );

    expect(await screen.findByRole('button', { name: 'Submit' })).toBeInTheDocument();
    expect(screen.queryByTestId('form-send-options')).not.toBeInTheDocument();
  });

  it('shows the pages outline with each page title and its fields', async () => {
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-form-pages',
        format: 'form',
        prompt: 'Fill in the details',
        format_payload: {
          schema: detailsSchema,
          pages: [
            { title: 'Basics', fields: ['date', 'count'] },
            { title: 'Extras', fields: ['notes'] },
            { title: 'Review', fields: [] },
          ],
        },
      }),
    );

    const pagesBlock = await screen.findByTestId('form-pages');
    expect(within(pagesBlock).getByText('Basics')).toBeInTheDocument();
    expect(within(pagesBlock).getByText('— date, count')).toBeInTheDocument();
    expect(within(pagesBlock).getByText('Extras')).toBeInTheDocument();
    // A page listing no fields renders its title alone, with no trailing field run.
    expect(within(pagesBlock).getByText('Review')).toBeInTheDocument();
  });

  it('renders the bare form (no context blocks) when data and pages are absent', async () => {
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-form-bare',
        format: 'form',
        prompt: 'Fill this in',
        format_payload: { schema: { type: 'object', properties: { name: { type: 'string' } } } },
      }),
    );

    expect(await screen.findByLabelText('name')).toBeInTheDocument();
    expect(screen.queryByTestId('form-pages')).not.toBeInTheDocument();
    expect(screen.queryByTestId('form-send-options')).not.toBeInTheDocument();
  });

  it('a malformed per-send data block is a loud inline error, never a silent form', async () => {
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-form-bad-data',
        format: 'form',
        prompt: 'Fill',
        format_payload: {
          schema: { type: 'object', properties: { date: { type: 'string' } } },
          data: { options: { date: 'not-a-list' } },
        },
      }),
    );

    const malformed = await screen.findByTestId('malformed-payload');
    expect(malformed).toHaveAttribute('role', 'alert');
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
  });

  it('a malformed pages block is a loud inline error, never a silent form', async () => {
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-form-bad-pages',
        format: 'form',
        prompt: 'Fill',
        format_payload: {
          schema: { type: 'object', properties: { date: { type: 'string' } } },
          pages: [{ title: 'When' }],
        },
      }),
    );

    const malformed = await screen.findByTestId('malformed-payload');
    expect(malformed).toHaveAttribute('role', 'alert');
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
  });
});
