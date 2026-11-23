import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { emitFrame, interactionJson, renderInbox } from './test-utils';

/** A `plan` switch whose change fires a reaction, and a `colour` single choice of three. */
function colourForm(id: string, required: boolean): string {
  return interactionJson({
    interaction_id: id,
    format: 'form',
    prompt: 'Pick a colour',
    format_payload: {
      schema: {
        type: 'object',
        properties: {
          plan: { type: 'string', enum: ['basic', 'pro'] },
          colour: { type: 'string' },
        },
        ...(required ? { required: ['colour'] } : {}),
      },
      data: {
        options: { colour: [{ value: 'red' }, { value: 'green' }, { value: 'blue' }] },
      },
      reactions: { field_changed: ['plan'], choices: ['colour'] },
    },
  });
}

describe("Form answer — a reaction's replaced choice list drops the choices it no longer offers", () => {
  it('posts an optional single choice the new list does not offer as unanswered', async () => {
    const user = userEvent.setup();
    const answer = vi.fn().mockResolvedValue(undefined);
    const react = vi.fn().mockResolvedValue({
      values: {},
      options: { colour: [{ value: 'green' }] },
      errors: {},
      display: {},
    });
    const { channel } = renderInbox(answer, undefined, '', react);
    await emitFrame(channel, 'interaction.add', colourForm('q-stale-optional', false));

    await user.click(await screen.findByRole('radio', { name: 'red' }));
    await user.click(screen.getByRole('radio', { name: 'pro' }));
    await waitFor(() => {
      expect(screen.queryByRole('radio', { name: 'red' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('radio', { name: 'green' })).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(answer).toHaveBeenCalledWith('q-stale-optional', { plan: 'pro' });
    });
    expect(screen.queryByText('must be one of the allowed values')).not.toBeInTheDocument();
  });

  it('reads the required message for a required single choice the new list does not offer', async () => {
    const user = userEvent.setup();
    const answer = vi.fn().mockResolvedValue(undefined);
    const react = vi.fn().mockResolvedValue({
      values: {},
      options: { colour: [{ value: 'green' }] },
      errors: {},
      display: {},
    });
    const { channel } = renderInbox(answer, undefined, '', react);
    await emitFrame(channel, 'interaction.add', colourForm('q-stale-required', true));

    await user.click(await screen.findByRole('radio', { name: 'red' }));
    await user.click(screen.getByRole('radio', { name: 'pro' }));
    await waitFor(() => {
      expect(screen.queryByRole('radio', { name: 'red' })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('"colour" is required')).toBeInTheDocument();
    expect(screen.queryByText('must be one of the allowed values')).not.toBeInTheDocument();
    expect(answer).not.toHaveBeenCalled();
  });

  it('keeps only the offered entries of a multi-choice field', async () => {
    const user = userEvent.setup();
    const answer = vi.fn().mockResolvedValue(undefined);
    const react = vi.fn().mockResolvedValue({
      values: {},
      options: { tags: [{ value: 'beta' }, { value: 'delta' }] },
      errors: {},
      display: {},
    });
    const { channel } = renderInbox(answer, undefined, '', react);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-stale-multi',
        format: 'form',
        prompt: 'Pick tags',
        format_payload: {
          schema: {
            type: 'object',
            properties: {
              plan: { type: 'string', enum: ['basic', 'pro'] },
              tags: { type: 'array', items: { type: 'string' } },
            },
          },
          data: {
            options: { tags: [{ value: 'alpha' }, { value: 'beta' }, { value: 'gamma' }] },
          },
          reactions: { field_changed: ['plan'], choices: ['tags'] },
        },
      }),
    );

    await user.click(await screen.findByRole('checkbox', { name: 'alpha' }));
    await user.click(screen.getByRole('checkbox', { name: 'beta' }));
    await user.click(screen.getByRole('radio', { name: 'pro' }));
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'delta' })).not.toBeChecked();
    });
    expect(screen.getByRole('checkbox', { name: 'beta' })).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(answer).toHaveBeenCalledWith('q-stale-multi', { plan: 'pro', tags: ['beta'] });
    });
  });

  it('keeps the value a reaction sets while the same reaction replaces the choices', async () => {
    const user = userEvent.setup();
    const answer = vi.fn().mockResolvedValue(undefined);
    const react = vi.fn().mockResolvedValue({
      values: { colour: 'blue' },
      options: { colour: [{ value: 'green' }, { value: 'blue' }] },
      errors: {},
      display: {},
    });
    const { channel } = renderInbox(answer, undefined, '', react);
    await emitFrame(channel, 'interaction.add', colourForm('q-stale-set', true));

    await user.click(await screen.findByRole('radio', { name: 'red' }));
    await user.click(screen.getByRole('radio', { name: 'pro' }));
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'blue' })).toBeChecked();
    });

    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(answer).toHaveBeenCalledWith('q-stale-set', { plan: 'pro', colour: 'blue' });
    });
  });

  it('checks the answer at Submit without a choice the submitted reaction no longer offers', async () => {
    const user = userEvent.setup();
    const answer = vi.fn().mockResolvedValue(undefined);
    const react = vi.fn().mockResolvedValue({
      values: { plan: 'pro' },
      options: { colour: [{ value: 'green' }] },
      errors: {},
      display: {},
    });
    const { channel } = renderInbox(answer, undefined, '', react);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-stale-submit',
        format: 'form',
        prompt: 'Pick a colour',
        format_payload: {
          schema: {
            type: 'object',
            properties: {
              plan: { type: 'string', enum: ['basic', 'pro'] },
              colour: { type: 'string' },
            },
          },
          data: {
            values: { plan: 'basic' },
            options: { colour: [{ value: 'red' }, { value: 'green' }] },
          },
          reactions: { submitted: true, choices: ['colour'] },
        },
      }),
    );

    await user.click(await screen.findByRole('radio', { name: 'red' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(answer).toHaveBeenCalledWith('q-stale-submit', { plan: 'pro' });
    });
    expect(screen.queryByText('must be one of the allowed values')).not.toBeInTheDocument();
  });

  it('holds on the page when the page-advanced reaction leaves too few offered choices', async () => {
    const user = userEvent.setup();
    const react = vi.fn().mockResolvedValue({
      values: {},
      options: { extras: [{ value: 'b' }, { value: 'c' }] },
      errors: {},
      display: {},
    });
    const { channel } = renderInbox(undefined, undefined, '', react);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-stale-advance',
        format: 'form',
        prompt: 'Steps',
        format_payload: {
          schema: {
            type: 'object',
            properties: {
              extras: { type: 'array', items: { type: 'string' }, minItems: 2 },
              note: { type: 'string' },
            },
          },
          pages: [
            { title: 'One', fields: ['extras'] },
            { title: 'Two', fields: ['note'] },
          ],
          data: { options: { extras: [{ value: 'a' }, { value: 'b' }] } },
          reactions: { page_advanced: ['One'], choices: ['extras'] },
        },
      }),
    );

    await user.click(await screen.findByRole('checkbox', { name: 'a' }));
    await user.click(screen.getByRole('checkbox', { name: 'b' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('must have at least 2 item(s)')).toBeInTheDocument();
    expect(screen.getByTestId('form-step-status')).toHaveTextContent('Step 1 of 2 — One');
    expect(screen.getByRole('checkbox', { name: 'b' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'c' })).not.toBeChecked();
  });
});
