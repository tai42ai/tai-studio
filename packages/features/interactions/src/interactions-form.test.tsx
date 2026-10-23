import { ApiError } from '@tai42/api-client';
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

  it('renders the native date/time controls per `format` and round-trips the ISO value on submit', async () => {
    const user = userEvent.setup();
    const answer = vi.fn().mockResolvedValue(undefined);
    const { channel } = renderInbox(answer);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-form-formats',
        format: 'form',
        prompt: 'Pick the moment',
        format_payload: {
          schema: {
            type: 'object',
            properties: {
              day: { type: 'string', format: 'date' },
              at: { type: 'string', format: 'time' },
              // `date-time` posts through a text box: the browser's native
              // datetime-local control cannot emit an RFC 3339 offset.
              ts: { type: 'string', format: 'date-time' },
            },
          },
          data: { values: { day: '2024-05-01' } },
        },
      }),
    );

    const day = await screen.findByLabelText('day');
    expect(day).toHaveAttribute('type', 'date');
    expect(day).toHaveValue('2024-05-01');
    expect(screen.getByLabelText('at')).toHaveAttribute('type', 'time');
    expect(screen.getByLabelText('ts')).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(answer).toHaveBeenCalledWith('q-form-formats', { day: '2024-05-01' });
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

  it("appends an option's description as a second line, and omits it when blank, null or absent", async () => {
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-form-opts-desc',
        format: 'form',
        prompt: 'Fill in the details',
        format_payload: {
          schema: { type: 'object', properties: { date: { type: 'string' } } },
          data: {
            options: {
              date: [
                { value: 'a', label: 'Option A', description: 'The first choice' },
                { value: 'b', description: '  ' },
                { value: 'c', label: 'Option C' },
                { value: 'd', label: 'Option D', description: null },
              ],
            },
          },
        },
      }),
    );

    // A non-blank description reads ` — <description>` after `label (value)`; a blank, null
    // or absent one adds nothing.
    const opts = await screen.findByTestId('form-send-options');
    expect(
      within(opts).getByText('Option A (a) — The first choice, b, Option C (c), Option D (d)'),
    ).toBeInTheDocument();
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
    // out-of-list value into. (A short enum renders as radios; SchemaForm falls back to a
    // select above the radio threshold of five options.)
    expect(await screen.findByRole('radio', { name: 'a' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'b' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'date' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'a' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(answer).toHaveBeenCalledWith('q-form-opts-control', { date: 'a' });
    });
  });

  it('renders a select for a re-optioned field above the radio threshold of per-send values', async () => {
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
              date: [
                { value: 'a' },
                { value: 'b' },
                { value: 'c' },
                { value: 'd' },
                { value: 'e' },
                { value: 'f' },
              ],
            },
          },
        },
      }),
    );

    // Six values exceed SchemaForm's radio threshold (5), so the choice renders as a select.
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

  it('re-options an array-of-strings field into a multi-select of the send values', async () => {
    const user = userEvent.setup();
    const answer = vi.fn().mockResolvedValue(undefined);
    const { channel } = renderInbox(answer);
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

    // The per-send list lands on the array's ITEMS, giving a fixed option set, so the
    // array draws as a multi-select (a checkbox per value) rather than the add/remove
    // control — one consistent field definition across channels.
    expect(await screen.findByRole('checkbox', { name: 'x' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'y' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add item' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'y' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(answer).toHaveBeenCalledWith('q-form-opts-array', { tags: ['y'] });
    });
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

  it('renders stepped pages with a display block, navigable steps, and a review readback', async () => {
    const user = userEvent.setup();
    const answer = vi.fn().mockResolvedValue(undefined);
    const { channel } = renderInbox(answer);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-form-pages',
        format: 'form',
        prompt: 'Fill in the details',
        format_payload: {
          schema: detailsSchema,
          data: { values: { count: 2 } },
          pages: [
            {
              title: 'Basics',
              fields: ['date', 'count'],
              display: [{ kind: 'heading', text: 'The basics' }],
            },
            { title: 'Extras', fields: ['notes'] },
            { title: 'Review', fields: [], kind: 'review' },
          ],
        },
      }),
    );

    // Step 1: its display heading and only its fields; a later page's field is absent.
    expect(await screen.findByTestId('form-step-status')).toHaveTextContent('Step 1 of 3 — Basics');
    expect(within(screen.getByTestId('form-display')).getByText('The basics')).toBeInTheDocument();
    expect(screen.getByLabelText('date')).toBeInTheDocument();
    expect(screen.getByLabelText('count')).toHaveValue(2);
    expect(screen.queryByLabelText('notes')).not.toBeInTheDocument();

    // Step 2: the Extras page; count is kept in the carried value.
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByTestId('form-step-status')).toHaveTextContent('Step 2 of 3 — Extras');
    await user.type(screen.getByLabelText('notes'), 'note text');

    // Step 3: the review step shows the generic readback of entered values and confirms.
    await user.click(screen.getByRole('button', { name: 'Next' }));
    const review = await screen.findByTestId('form-review');
    expect(within(review).getByText('count')).toBeInTheDocument();
    expect(within(review).getByText('2')).toBeInTheDocument();
    expect(within(review).getByText('note text')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => {
      expect(answer).toHaveBeenCalledWith('q-form-pages', { count: 2, notes: 'note text' });
    });
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
    // No pages declared → the single-form path, with no stepper chrome or options legend.
    expect(screen.queryByTestId('form-step-status')).not.toBeInTheDocument();
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

describe('InteractionsPage — form preview: reactions, conditionals, dates, bounds', () => {
  it('reacts on a declared field change: round-trips the event and applies values/options/display', async () => {
    const user = userEvent.setup();
    const answer = vi.fn().mockResolvedValue(undefined);
    const react = vi.fn().mockResolvedValue({
      values: { seats: 3 },
      options: {},
      errors: {},
      display: { total: '$30' },
    });
    const { channel } = renderInbox(answer, undefined, '', react);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-react',
        format: 'form',
        prompt: 'Pick a plan',
        format_payload: {
          schema: {
            type: 'object',
            properties: {
              plan: { type: 'string', enum: ['basic', 'pro'] },
              seats: { type: 'integer' },
            },
          },
          pages: [
            {
              title: 'Plan',
              fields: ['plan', 'seats'],
              display: [{ kind: 'body', slot: 'total' }],
            },
          ],
          reactions: { field_changed: ['plan'] },
        },
      }),
    );

    await user.click(await screen.findByRole('radio', { name: 'pro' }));

    await waitFor(() => {
      expect(react).toHaveBeenCalledWith(
        'q-react',
        { kind: 'field_changed', field: 'plan' },
        expect.objectContaining({ plan: 'pro' }),
      );
    });
    // The returned update is applied: a value is set and a display slot (a computed total)
    // is filled.
    expect(await screen.findByLabelText('seats')).toHaveValue(3);
    expect(screen.getByTestId('form-slot-total')).toHaveTextContent('$30');
    expect(answer).not.toHaveBeenCalled();
  });

  it('runs a submitted reaction before acceptance and keeps the form open on per-field errors', async () => {
    const user = userEvent.setup();
    const answer = vi.fn().mockResolvedValue(undefined);
    const react = vi.fn().mockResolvedValue({
      values: {},
      options: {},
      errors: { note: 'the note is not allowed' },
      display: {},
    });
    const { channel } = renderInbox(answer, undefined, '', react);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-react-submit',
        format: 'form',
        prompt: 'Add a note',
        format_payload: {
          schema: { type: 'object', properties: { note: { type: 'string' } } },
          reactions: { submitted: true },
        },
      }),
    );

    await user.type(await screen.findByLabelText('note'), 'hello');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(react).toHaveBeenCalledWith(
        'q-react-submit',
        { kind: 'submitted' },
        expect.objectContaining({ note: 'hello' }),
      );
    });
    // The consumer refused: its per-field message shows and the answer is NOT recorded.
    expect(await screen.findByText('the note is not allowed')).toBeInTheDocument();
    expect(answer).not.toHaveBeenCalled();
  });

  it('surfaces a reaction handler failure loudly, never a stale value', async () => {
    const user = userEvent.setup();
    const react = vi.fn().mockRejectedValue(new Error('handler timed out'));
    const { channel } = renderInbox(undefined, undefined, '', react);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-react-fail',
        format: 'form',
        prompt: 'Pick a plan',
        format_payload: {
          schema: {
            type: 'object',
            properties: { plan: { type: 'string', enum: ['basic', 'pro'] } },
          },
          reactions: { field_changed: ['plan'] },
        },
      }),
    );

    await user.click(await screen.findByRole('radio', { name: 'pro' }));
    const notice = await screen.findByTestId('form-reaction-error');
    expect(notice).toHaveAttribute('role', 'alert');
    expect(notice).toHaveTextContent('handler timed out');
  });

  it('shows and hides a conditional field, and submits the shown value', async () => {
    const user = userEvent.setup();
    const answer = vi.fn().mockResolvedValue(undefined);
    const { channel } = renderInbox(answer);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-cond',
        format: 'form',
        prompt: 'Any pets?',
        format_payload: {
          schema: {
            type: 'object',
            properties: {
              hasPet: { type: 'boolean' },
              petName: { type: 'string', visibleWhen: { field: 'hasPet', equals: true } },
            },
          },
          data: { values: { hasPet: false } },
        },
      }),
    );

    expect(await screen.findByLabelText('hasPet')).toBeInTheDocument();
    expect(screen.queryByLabelText('petName')).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('hasPet'));
    await user.type(await screen.findByLabelText('petName'), 'Rex');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(answer).toHaveBeenCalledWith('q-cond', { hasPet: true, petName: 'Rex' });
    });
  });

  it('passes date bounds to the native control and enforces the range on submit', async () => {
    const user = userEvent.setup();
    const answer = vi.fn().mockResolvedValue(undefined);
    const { channel } = renderInbox(answer);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-dates',
        format: 'form',
        prompt: 'Pick dates',
        format_payload: {
          schema: {
            type: 'object',
            properties: {
              start: { type: 'string', format: 'date', minDate: '2026-01-01' },
              end: { type: 'string', format: 'date', rangeStart: 'start', minDays: 2 },
            },
          },
        },
      }),
    );

    const start = await screen.findByLabelText('start');
    expect(start).toHaveAttribute('type', 'date');
    expect(start).toHaveAttribute('min', '2026-01-01');

    // end before start → a loud field error, submission refused.
    await user.clear(start);
    await user.type(start, '2026-01-10');
    await user.type(screen.getByLabelText('end'), '2026-01-09');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText(/on or after the start date/)).toBeInTheDocument();
    expect(answer).not.toHaveBeenCalled();
  });

  it('enforces a client-side length bound before submit, as the server does', async () => {
    const user = userEvent.setup();
    const answer = vi.fn().mockResolvedValue(undefined);
    const { channel } = renderInbox(answer);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-bounds',
        format: 'form',
        prompt: 'Short code',
        format_payload: {
          schema: { type: 'object', properties: { code: { type: 'string', maxLength: 3 } } },
          // The control draws the bound natively and caps typed input at the maximum, so an
          // over-length value reaches the form only prefilled; the validator still rejects
          // it on submit.
          data: { values: { code: 'abcd' } },
        },
      }),
    );

    await screen.findByLabelText('code');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText(/at most 3 character/)).toBeInTheDocument();
    expect(answer).not.toHaveBeenCalled();
  });
});

describe('InteractionsPage — form preview: display blocks, review formatting, more reactions', () => {
  it('renders heading, body, image and seeded-slot display blocks in order', async () => {
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-display',
        format: 'form',
        prompt: 'Overview',
        format_payload: {
          schema: { type: 'object', properties: { ack: { type: 'boolean' } } },
          data: { values: { total: 'seed-total' } },
          pages: [
            {
              title: 'Overview',
              fields: ['ack'],
              display: [
                { kind: 'heading', text: 'Summary' },
                { kind: 'body', text: 'Please confirm' },
                { kind: 'image', src: 'https://example.test/a.png', alt: 'A map' },
                { kind: 'body', slot: 'total' },
              ],
            },
          ],
        },
      }),
    );

    const display = await screen.findByTestId('form-display');
    expect(within(display).getByText('Summary')).toBeInTheDocument();
    expect(within(display).getByText('Please confirm')).toBeInTheDocument();
    expect(within(display).getByRole('img', { name: 'A map' })).toBeInTheDocument();
    // A slot seeded from the send data shows that value before any reaction.
    expect(screen.getByTestId('form-slot-total')).toHaveTextContent('seed-total');
  });

  it('draws a paged field named __proto__ and holds Next on its required error', async () => {
    const user = userEvent.setup();
    const { channel } = renderInbox();
    // JSON.parse keeps `__proto__` as an ordinary own key, as a payload from the wire carries it.
    const schema = JSON.parse(
      '{"type":"object","properties":{"__proto__":{"type":"string","title":"Code"},"a":{"type":"string","title":"A"}},"required":["__proto__","a"]}',
    ) as Record<string, unknown>;
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-proto-page',
        format: 'form',
        prompt: 'Codes',
        format_payload: {
          schema,
          pages: [
            { title: 'Codes', fields: ['__proto__', 'a'] },
            { title: 'Done', fields: [] },
          ],
        },
      }),
    );

    const code = await screen.findByRole('textbox', { name: 'Code' });
    await user.type(screen.getByRole('textbox', { name: 'A' }), 'x');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(code).toBeInTheDocument();
    expect(await screen.findByText('"__proto__" is required')).toBeInTheDocument();
  });

  it('holds Next on a shape error in a paged field named __proto__', async () => {
    const user = userEvent.setup();
    const { channel } = renderInbox();
    // JSON.parse keeps `__proto__` as an ordinary own key, as a payload from the wire carries it.
    const schema = JSON.parse(
      '{"type":"object","properties":{"__proto__":{"type":"string","title":"Code","minLength":3}}}',
    ) as Record<string, unknown>;
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-proto-page-shape',
        format: 'form',
        prompt: 'Codes',
        format_payload: {
          schema,
          pages: [
            { title: 'One', fields: ['__proto__'] },
            { title: 'Two', fields: [] },
          ],
        },
      }),
    );

    await user.type(await screen.findByRole('textbox', { name: 'Code' }), 'x');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('must be at least 3 character(s)')).toBeInTheDocument();
    expect(screen.getByTestId('form-step-status')).toHaveTextContent('Step 1 of 2 — One');
  });

  it('degrades an image block with no source to its alt text', async () => {
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-display-noimg',
        format: 'form',
        prompt: 'Overview',
        format_payload: {
          schema: { type: 'object', properties: { ack: { type: 'boolean' } } },
          pages: [
            { title: 'Overview', fields: ['ack'], display: [{ kind: 'image', alt: 'Diagram' }] },
          ],
        },
      }),
    );

    const display = await screen.findByTestId('form-display');
    expect(within(display).queryByRole('img')).not.toBeInTheDocument();
    expect(within(display).getByText('Diagram')).toBeInTheDocument();
  });

  it('formats booleans and multi-selections in the review readback', async () => {
    const user = userEvent.setup();
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-review-fmt',
        format: 'form',
        prompt: 'Review',
        format_payload: {
          schema: {
            type: 'object',
            properties: {
              agree: { type: 'boolean' },
              tags: { type: 'array', items: { type: 'string', enum: ['x', 'y'] } },
            },
          },
          data: { values: { agree: true, tags: ['x', 'y'] } },
          pages: [
            { title: 'Pick', fields: ['agree', 'tags'] },
            { title: 'Review', fields: [], kind: 'review' },
          ],
        },
      }),
    );

    await user.click(await screen.findByRole('button', { name: 'Next' }));
    const review = await screen.findByTestId('form-review');
    expect(within(review).getByText('Yes')).toBeInTheDocument();
    expect(within(review).getByText('x, y')).toBeInTheDocument();
  });

  it('applies a reaction that replaces a field choice list', async () => {
    const user = userEvent.setup();
    const react = vi.fn().mockResolvedValue({
      values: {},
      options: { topping: [{ value: 'olives' }, { value: 'basil' }] },
      errors: {},
      display: {},
    });
    const { channel } = renderInbox(undefined, undefined, '', react);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-react-opts',
        format: 'form',
        prompt: 'Build it',
        format_payload: {
          schema: {
            type: 'object',
            properties: {
              base: { type: 'string', enum: ['thin', 'thick'] },
              topping: { type: 'string' },
            },
          },
          reactions: { field_changed: ['base'], submitted: true, choices: ['topping'] },
        },
      }),
    );

    // topping starts as a free text box; after the reaction it is a choice of the
    // reaction-supplied values.
    expect(await screen.findByRole('textbox', { name: 'topping' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'thick' }));
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'olives' })).toBeInTheDocument();
    });
    expect(screen.getByRole('radio', { name: 'basil' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'topping' })).not.toBeInTheDocument();
  });

  it('fires a page-advanced reaction on Next and supports Back', async () => {
    const user = userEvent.setup();
    const react = vi.fn().mockResolvedValue({ values: {}, options: {}, errors: {}, display: {} });
    const { channel } = renderInbox(undefined, undefined, '', react);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-advance',
        format: 'form',
        prompt: 'Steps',
        format_payload: {
          schema: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' } } },
          pages: [
            { title: 'One', fields: ['a'] },
            { title: 'Two', fields: ['b'] },
          ],
          reactions: { page_advanced: ['One'] },
        },
      }),
    );

    await user.click(await screen.findByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(react).toHaveBeenCalledWith(
        'q-advance',
        { kind: 'page_advanced', page: 'One' },
        expect.any(Object),
      );
    });
    expect(screen.getByTestId('form-step-status')).toHaveTextContent('Step 2 of 2 — Two');

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('form-step-status')).toHaveTextContent('Step 1 of 2 — One');
  });

  it('accepts the answer when a submitted reaction returns no errors', async () => {
    const user = userEvent.setup();
    const answer = vi.fn().mockResolvedValue(undefined);
    const react = vi.fn().mockResolvedValue({ values: {}, options: {}, errors: {}, display: {} });
    const { channel } = renderInbox(answer, undefined, '', react);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-submit-ok',
        format: 'form',
        prompt: 'Confirm',
        format_payload: {
          schema: { type: 'object', properties: { note: { type: 'string' } } },
          reactions: { submitted: true },
        },
      }),
    );

    await user.type(await screen.findByLabelText('note'), 'ok');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(react).toHaveBeenCalledWith('q-submit-ok', { kind: 'submitted' }, expect.any(Object));
      expect(answer).toHaveBeenCalledWith('q-submit-ok', { note: 'ok' });
    });
  });
});

describe('InteractionsPage — form preview: malformed reactions and numeric slots', () => {
  it('a malformed reactions block is a loud inline error, never a silent form', async () => {
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-bad-reactions',
        format: 'form',
        prompt: 'Fill',
        format_payload: {
          schema: { type: 'object', properties: { x: { type: 'string' } } },
          reactions: { field_changed: 'not-a-list' },
        },
      }),
    );

    const malformed = await screen.findByTestId('malformed-payload');
    expect(malformed).toHaveAttribute('role', 'alert');
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
  });

  it('fills a computed numeric total into a display slot from a reaction', async () => {
    const user = userEvent.setup();
    const react = vi.fn().mockResolvedValue({
      values: {},
      options: {},
      errors: {},
      display: { total: 42 },
    });
    const { channel } = renderInbox(undefined, undefined, '', react);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-total',
        format: 'form',
        prompt: 'Qty',
        format_payload: {
          schema: { type: 'object', properties: { size: { type: 'string', enum: ['s', 'l'] } } },
          pages: [{ title: 'Qty', fields: ['size'], display: [{ kind: 'body', slot: 'total' }] }],
          reactions: { field_changed: ['size'] },
        },
      }),
    );

    await user.click(await screen.findByRole('radio', { name: 'l' }));
    await waitFor(() => {
      expect(screen.getByTestId('form-slot-total')).toHaveTextContent('42');
    });
  });
});

describe('InteractionsPage — form preview: reaction failure shapes and object readback', () => {
  it('surfaces a non-Error reaction rejection loudly', async () => {
    const user = userEvent.setup();
    const react = vi.fn().mockRejectedValue('upstream unavailable');
    const { channel } = renderInbox(undefined, undefined, '', react);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-react-fail-str',
        format: 'form',
        prompt: 'Pick',
        format_payload: {
          schema: { type: 'object', properties: { p: { type: 'string', enum: ['a', 'b'] } } },
          reactions: { field_changed: ['p'] },
        },
      }),
    );

    await user.click(await screen.findByRole('radio', { name: 'b' }));
    expect(await screen.findByTestId('form-reaction-error')).toHaveTextContent(
      'upstream unavailable',
    );
  });

  it('renders an object-valued field as JSON in the review readback', async () => {
    const user = userEvent.setup();
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-review-obj',
        format: 'form',
        prompt: 'Review',
        format_payload: {
          schema: { type: 'object', properties: { meta: { type: 'object' } } },
          data: { values: { meta: { a: 1 } } },
          pages: [
            { title: 'Edit', fields: ['meta'] },
            { title: 'Review', fields: [], kind: 'review' },
          ],
        },
      }),
    );

    await user.click(await screen.findByRole('button', { name: 'Next' }));
    const review = await screen.findByTestId('form-review');
    expect(within(review).getByText('{"a":1}')).toBeInTheDocument();
  });
});

describe('InteractionsPage — form preview: review readback edge formatting', () => {
  it('reads a blank field named toString back as a dash', async () => {
    const user = userEvent.setup();
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-review-builtin-name',
        format: 'form',
        prompt: 'Review',
        format_payload: {
          schema: {
            type: 'object',
            properties: { toString: { type: 'string', title: 'Nickname' } },
          },
          pages: [
            { title: 'Edit', fields: ['toString'] },
            { title: 'Review', fields: [], kind: 'review' },
          ],
        },
      }),
    );

    await user.click(await screen.findByRole('button', { name: 'Next' }));
    const review = await screen.findByTestId('form-review');
    expect(within(review).getByText('—')).toBeInTheDocument();
  });

  it('uses field titles and renders empty values and empty selections as a dash', async () => {
    const user = userEvent.setup();
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-review-edges',
        format: 'form',
        prompt: 'Review',
        format_payload: {
          schema: {
            type: 'object',
            properties: {
              label: { type: 'string', title: 'Your label' },
              skipped: { type: 'string' },
              picks: { type: 'array', items: { type: 'string', enum: ['a', 'b'] } },
            },
          },
          data: { values: { label: 'hi', picks: [] } },
          pages: [
            { title: 'Edit', fields: ['label', 'skipped', 'picks'] },
            { title: 'Review', fields: [], kind: 'review' },
          ],
        },
      }),
    );

    await user.click(await screen.findByRole('button', { name: 'Next' }));
    const review = await screen.findByTestId('form-review');
    // The field title is used as the term; a filled value shows; an unfilled field and
    // an empty selection both read as a dash.
    expect(within(review).getByText('Your label')).toBeInTheDocument();
    expect(within(review).getByText('hi')).toBeInTheDocument();
    expect(within(review).getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('shows an empty review when every field is hidden by its predicate', async () => {
    const user = userEvent.setup();
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-review-empty',
        format: 'form',
        prompt: 'Review',
        format_payload: {
          schema: {
            type: 'object',
            properties: {
              secret: { type: 'string', visibleWhen: { field: 'missing', equals: true } },
            },
          },
          pages: [
            { title: 'Edit', fields: ['secret'] },
            { title: 'Review', fields: [], kind: 'review' },
          ],
        },
      }),
    );

    await user.click(await screen.findByRole('button', { name: 'Next' }));
    await screen.findByRole('button', { name: 'Confirm' });
    expect(screen.queryByTestId('form-review')).not.toBeInTheDocument();
  });
});

describe('InteractionsPage — form preview: reaction hold paths and stale responses', () => {
  it('holds on the page when a page-advanced reaction fails', async () => {
    const user = userEvent.setup();
    const react = vi.fn().mockRejectedValue(new Error('advance failed'));
    const { channel } = renderInbox(undefined, undefined, '', react);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-adv-fail',
        format: 'form',
        prompt: 'Steps',
        format_payload: {
          schema: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' } } },
          pages: [
            { title: 'One', fields: ['a'] },
            { title: 'Two', fields: ['b'] },
          ],
          reactions: { page_advanced: ['One'] },
        },
      }),
    );

    await user.click(await screen.findByRole('button', { name: 'Next' }));
    expect(await screen.findByTestId('form-reaction-error')).toHaveTextContent('advance failed');
    // Still on step 1 — the reaction refused the advance.
    expect(screen.getByTestId('form-step-status')).toHaveTextContent('Step 1 of 2 — One');
  });

  it('holds on the page when a page-advanced reaction returns per-field errors', async () => {
    const user = userEvent.setup();
    const react = vi
      .fn()
      .mockResolvedValue({ values: {}, options: {}, errors: { a: 'fix me' }, display: {} });
    const { channel } = renderInbox(undefined, undefined, '', react);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-adv-err',
        format: 'form',
        prompt: 'Steps',
        format_payload: {
          schema: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' } } },
          pages: [
            { title: 'One', fields: ['a'] },
            { title: 'Two', fields: ['b'] },
          ],
          reactions: { page_advanced: ['One'] },
        },
      }),
    );

    await user.click(await screen.findByRole('button', { name: 'Next' }));
    expect(await screen.findByText('fix me')).toBeInTheDocument();
    expect(screen.getByTestId('form-step-status')).toHaveTextContent('Step 1 of 2 — One');
  });

  it('does not accept the answer when the submitted reaction fails', async () => {
    const user = userEvent.setup();
    const answer = vi.fn().mockResolvedValue(undefined);
    const react = vi.fn().mockRejectedValue(new Error('submit handler down'));
    const { channel } = renderInbox(answer, undefined, '', react);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-submit-fail',
        format: 'form',
        prompt: 'Confirm',
        format_payload: {
          schema: { type: 'object', properties: { note: { type: 'string' } } },
          reactions: { submitted: true },
        },
      }),
    );

    await user.type(await screen.findByLabelText('note'), 'x');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByTestId('form-reaction-error')).toHaveTextContent(
      'submit handler down',
    );
    expect(answer).not.toHaveBeenCalled();
  });

  it('applies only the latest reaction when an earlier one resolves late', async () => {
    const user = userEvent.setup();
    let resolveFirst: (update: unknown) => void = () => undefined;
    const first = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const react = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockResolvedValue({ values: {}, options: {}, errors: {}, display: { total: 'SECOND' } });
    const { channel } = renderInbox(undefined, undefined, '', react);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-stale',
        format: 'form',
        prompt: 'Pick',
        format_payload: {
          schema: { type: 'object', properties: { p: { type: 'string', enum: ['a', 'b'] } } },
          pages: [{ title: 'Pick', fields: ['p'], display: [{ kind: 'body', slot: 'total' }] }],
          reactions: { field_changed: ['p'] },
        },
      }),
    );

    // First change starts a reaction that is still in flight; the second resolves first.
    await user.click(await screen.findByRole('radio', { name: 'a' }));
    await user.click(screen.getByRole('radio', { name: 'b' }));
    await waitFor(() => {
      expect(screen.getByTestId('form-slot-total')).toHaveTextContent('SECOND');
    });

    // The earlier reaction now resolves with a stale value — it must NOT overwrite.
    resolveFirst({ values: {}, options: {}, errors: {}, display: { total: 'FIRST' } });
    await Promise.resolve();
    expect(screen.getByTestId('form-slot-total')).toHaveTextContent('SECOND');
  });
});

describe('InteractionsPage — form preview: a scalar-root form', () => {
  it('renders a non-object schema as a single control and submits its value', async () => {
    const user = userEvent.setup();
    const answer = vi.fn().mockResolvedValue(undefined);
    const { channel } = renderInbox(answer);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-scalar',
        format: 'form',
        prompt: 'Your name',
        format_payload: { schema: { type: 'string', title: 'Name' } },
      }),
    );

    await user.type(await screen.findByLabelText('Name'), 'Ada');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(answer).toHaveBeenCalledWith('q-scalar', 'Ada');
    });
  });
});

describe('InteractionsPage — form preview: the reaction door is host-configurable', () => {
  it('POSTs reactions to an injected host endpoint instead of the authed door', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { values: {}, options: {}, errors: {}, display: { total: 'web' } },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    // The authed door (api.reactInteraction) must NOT be used when a host endpoint is set.
    const react = vi.fn().mockResolvedValue({ values: {}, options: {}, errors: {}, display: {} });
    try {
      const { channel } = renderInbox(undefined, undefined, '', react, '/web/channel/react');
      await emitFrame(
        channel,
        'interaction.add',
        interactionJson({
          interaction_id: 'q-web-react',
          format: 'form',
          prompt: 'Pick',
          format_payload: {
            schema: { type: 'object', properties: { p: { type: 'string', enum: ['a', 'b'] } } },
            pages: [{ title: 'Pick', fields: ['p'], display: [{ kind: 'body', slot: 'total' }] }],
            reactions: { field_changed: ['p'] },
          },
        }),
      );

      await user.click(await screen.findByRole('radio', { name: 'b' }));
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/web/channel/react',
          expect.objectContaining({ method: 'POST' }),
        );
      });
      const init = (fetchMock.mock.calls[0]?.[1] ?? {}) as RequestInit;
      const sentBody = typeof init.body === 'string' ? init.body : '';
      expect(JSON.parse(sentBody)).toEqual({
        event: { kind: 'field_changed', field: 'p' },
        values: { p: 'b' },
      });
      // The authed in-app door was never called, and the host update applied.
      expect(react).not.toHaveBeenCalled();
      expect(screen.getByTestId('form-slot-total')).toHaveTextContent('web');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('applies a bare (un-enveloped) update body from the host endpoint', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ values: {}, options: {}, errors: {}, display: { total: 'bare' } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { channel } = renderInbox(undefined, undefined, '', undefined, '/web/channel/react');
      await emitFrame(
        channel,
        'interaction.add',
        interactionJson({
          interaction_id: 'q-web-bare',
          format: 'form',
          prompt: 'Pick',
          format_payload: {
            schema: { type: 'object', properties: { p: { type: 'string', enum: ['a', 'b'] } } },
            pages: [{ title: 'Pick', fields: ['p'], display: [{ kind: 'body', slot: 'total' }] }],
            reactions: { field_changed: ['p'] },
          },
        }),
      );

      await user.click(await screen.findByRole('radio', { name: 'b' }));
      await waitFor(() => {
        expect(screen.getByTestId('form-slot-total')).toHaveTextContent('bare');
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('surfaces a failed host-endpoint reaction loudly with the server message', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'the channel session expired' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { channel } = renderInbox(undefined, undefined, '', undefined, '/web/channel/react');
      await emitFrame(
        channel,
        'interaction.add',
        interactionJson({
          interaction_id: 'q-web-fail',
          format: 'form',
          prompt: 'Pick',
          format_payload: {
            schema: { type: 'object', properties: { p: { type: 'string', enum: ['a', 'b'] } } },
            reactions: { field_changed: ['p'] },
          },
        }),
      );

      await user.click(await screen.findByRole('radio', { name: 'b' }));
      expect(await screen.findByTestId('form-reaction-error')).toHaveTextContent(
        'the channel session expired',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('falls back to the status text when a failed host response has no JSON body', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('not json', { status: 502, statusText: 'Bad Gateway' }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { channel } = renderInbox(undefined, undefined, '', undefined, '/web/channel/react');
      await emitFrame(
        channel,
        'interaction.add',
        interactionJson({
          interaction_id: 'q-web-nojson',
          format: 'form',
          prompt: 'Pick',
          format_payload: {
            schema: { type: 'object', properties: { p: { type: 'string', enum: ['a', 'b'] } } },
            reactions: { field_changed: ['p'] },
          },
        }),
      );

      await user.click(await screen.findByRole('radio', { name: 'b' }));
      expect(await screen.findByTestId('form-reaction-error')).toHaveTextContent('Bad Gateway');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('uses the authed in-app door by default, never a raw fetch', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const react = vi.fn().mockResolvedValue({ values: {}, options: {}, errors: {}, display: {} });
    try {
      // No reactionEndpoint injected → the in-app Studio surface keeps the authed door.
      const { channel } = renderInbox(undefined, undefined, '', react);
      await emitFrame(
        channel,
        'interaction.add',
        interactionJson({
          interaction_id: 'q-authed-react',
          format: 'form',
          prompt: 'Pick',
          format_payload: {
            schema: { type: 'object', properties: { p: { type: 'string', enum: ['a', 'b'] } } },
            reactions: { field_changed: ['p'] },
          },
        }),
      );

      await user.click(await screen.findByRole('radio', { name: 'b' }));
      await waitFor(() => {
        expect(react).toHaveBeenCalledWith(
          'q-authed-react',
          { kind: 'field_changed', field: 'p' },
          expect.objectContaining({ p: 'b' }),
        );
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('SteppedForm — caller-set page button and Back labels', () => {
  it('draws each page button_label on the primary button and wording.form.back on Back', async () => {
    const user = userEvent.setup();
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-labels',
        format: 'form',
        prompt: 'Steps',
        format_payload: {
          schema: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' } } },
          pages: [
            { title: 'One', fields: ['a'], button_label: 'Continue' },
            { title: 'Two', fields: ['b'], button_label: 'Send it' },
          ],
          wording: { form: { back: 'Go back' } },
        },
      }),
    );

    // Page one's primary button reads its button_label, not the generic "Next".
    expect(await screen.findByRole('button', { name: 'Continue' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    // Page two (last) reads its own button_label, not "Submit"; Back reads the caller's word.
    expect(screen.getByRole('button', { name: 'Send it' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go back' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });
});

describe('SinglePageForm — caller-set submit button and field picker placeholder', () => {
  it('draws wording.form.submit on the terminal button and wording.form.fields[name].choice_label on the field picker', async () => {
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-single-wording',
        format: 'form',
        prompt: 'Fill this in',
        format_payload: {
          // A six-option enum draws as a select (above the radio threshold), so its
          // placeholder is observable; a page-less form takes `wording.form.submit`.
          schema: {
            type: 'object',
            properties: {
              lane: { type: 'string', enum: ['n', 's', 'e', 'w', 'ne', 'nw'], title: 'Lane' },
            },
          },
          wording: {
            form: { submit: 'Send it', fields: { lane: { choice_label: 'Pick a lane' } } },
          },
        },
      }),
    );

    // The terminal button reads the caller's word, not the surface's own "Submit".
    expect(await screen.findByRole('button', { name: 'Send it' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
    // The select shows the caller's field placeholder in place of the default "Select…".
    expect(screen.getByRole('combobox', { name: 'Lane' })).toHaveTextContent('Pick a lane');
  });
});

describe('Form answer — caller-set invalid sentence per field', () => {
  const schema = {
    type: 'object',
    properties: {
      code: { type: 'string', pattern: '^[A-Z]{3}$', title: 'Code' },
      note: { type: 'string', pattern: '^[a-z]+$', title: 'Note' },
    },
    required: ['code'],
  };
  const wording = { form: { fields: { code: { invalid: 'Use three capital letters' } } } };

  it('shows wording.form.fields[name].invalid under the field after an invalid submit', async () => {
    const user = userEvent.setup();
    const answer = vi.fn().mockResolvedValue(undefined);
    const { channel } = renderInbox(answer);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-invalid-single',
        format: 'form',
        prompt: 'Codes',
        format_payload: { schema, data: { values: { code: 'abc', note: 'ABC' } }, wording },
      }),
    );

    await screen.findByLabelText(/Code/);
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    // The field with a sentence shows it; the field without keeps the SDK's word.
    expect(await screen.findByText('Use three capital letters')).toBeInTheDocument();
    expect(screen.queryByText('must match the required pattern')).toBeInTheDocument();
    expect(answer).not.toHaveBeenCalled();
  });

  it('keeps the required message for a missing value', async () => {
    const user = userEvent.setup();
    const answer = vi.fn().mockResolvedValue(undefined);
    const { channel } = renderInbox(answer);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-invalid-required',
        format: 'form',
        prompt: 'Codes',
        format_payload: { schema, wording },
      }),
    );

    await screen.findByLabelText(/Code/);
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText(/"code" is required/)).toBeInTheDocument();
    expect(screen.queryByText('Use three capital letters')).not.toBeInTheDocument();
    expect(answer).not.toHaveBeenCalled();
  });

  it("shows a page field's invalid sentence when Next is refused", async () => {
    const user = userEvent.setup();
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-invalid-paged',
        format: 'form',
        prompt: 'Codes',
        format_payload: {
          schema,
          data: { values: { code: 'abc' } },
          pages: [
            { title: 'One', fields: ['code'] },
            { title: 'Two', fields: ['note'] },
          ],
          wording,
        },
      }),
    );

    await screen.findByLabelText(/Code/);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Use three capital letters')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Two' })).not.toBeInTheDocument();
  });

  it("shows the last page field's invalid sentence when the stepped form's submit is refused", async () => {
    const user = userEvent.setup();
    const answer = vi.fn().mockResolvedValue(undefined);
    const { channel } = renderInbox(answer);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-invalid-paged-submit',
        format: 'form',
        prompt: 'Codes',
        format_payload: {
          schema,
          data: { values: { code: 'ABC', note: 'ABC' } },
          pages: [
            { title: 'One', fields: ['code'] },
            { title: 'Two', fields: ['note'] },
          ],
          wording: { form: { fields: { note: { invalid: 'Use small letters only' } } } },
        },
      }),
    );

    await screen.findByLabelText(/Code/);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByLabelText(/Note/);
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Use small letters only')).toBeInTheDocument();
    expect(screen.queryByText('must match the required pattern')).not.toBeInTheDocument();
    expect(answer).not.toHaveBeenCalled();
  });
});

describe('InteractionsPage — form preview: a date range with a time on each end', () => {
  // The times are declared LAST; each draws and reads back right after its own date.
  const timedSchema = {
    type: 'object',
    properties: {
      from: { type: 'string', format: 'date', title: 'From' },
      to: { type: 'string', format: 'date', title: 'To', rangeStart: 'from' },
      note: { type: 'string', title: 'Note' },
      from_time: { type: 'string', format: 'time', title: 'From time', timeOf: 'from' },
      to_time: { type: 'string', format: 'time', title: 'To time', timeOf: 'to' },
    },
  };

  it('draws each time under its date in the range group and refuses an earlier same-day end time', async () => {
    const user = userEvent.setup();
    const answer = vi.fn().mockResolvedValue(undefined);
    const { channel } = renderInbox(answer);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-timed-range',
        format: 'form',
        prompt: 'Pick a slot',
        format_payload: {
          schema: timedSchema,
          data: {
            values: { from: '2026-03-01', to: '2026-03-01', from_time: '10:00', to_time: '09:00' },
          },
        },
      }),
    );

    const group = await screen.findByRole('group', { name: 'From – To' });
    const labels = Array.from(group.querySelectorAll('input')).map(
      (input) => input.labels?.[0]?.textContent,
    );
    expect(labels).toEqual(['From', 'From time', 'To', 'To time']);
    expect(within(group).getByLabelText('From time')).toHaveAttribute('type', 'time');

    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('must be on or after the start time')).toBeInTheDocument();
    expect(screen.getByLabelText('To time')).toHaveAccessibleDescription(
      'must be on or after the start time',
    );
    expect(answer).not.toHaveBeenCalled();
  });

  it('reads each time back right after its date on a review page', async () => {
    const user = userEvent.setup();
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-timed-review',
        format: 'form',
        prompt: 'Pick a slot',
        format_payload: {
          schema: timedSchema,
          data: {
            values: { from: '2026-03-01', to: '2026-03-02', from_time: '10:00', to_time: '09:00' },
          },
          pages: [
            { title: 'When', fields: ['from', 'to', 'note', 'from_time', 'to_time'] },
            { title: 'Review', fields: [], kind: 'review' },
          ],
        },
      }),
    );

    await screen.findByRole('group', { name: 'From – To' });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    const review = await screen.findByTestId('form-review');
    expect(Array.from(review.querySelectorAll('dt')).map((term) => term.textContent)).toEqual([
      'From',
      'From time',
      'To',
      'To time',
      'Note',
    ]);
  });
});

describe("Form answer — the caller's could-not-update line", () => {
  /** A reacting one-field form carrying `wording.form.update_failed`. */
  const reactingForm = (interactionId: string, updateFailed?: string): string =>
    interactionJson({
      interaction_id: interactionId,
      format: 'form',
      prompt: 'Pick',
      format_payload: {
        schema: { type: 'object', properties: { p: { type: 'string', enum: ['a', 'b'] } } },
        reactions: { field_changed: ['p'] },
        ...(updateFailed !== undefined
          ? { wording: { form: { update_failed: updateFailed } } }
          : {}),
      },
    });

  it("draws the caller's line with the in-app door's own reason", async () => {
    const user = userEvent.setup();
    const react = vi
      .fn()
      .mockRejectedValue(
        new ApiError('p is odd', 400, undefined, undefined, { error: 'p is odd' }),
      );
    const { channel } = renderInbox(undefined, undefined, '', react);
    await emitFrame(channel, 'interaction.add', reactingForm('q-uf-app', 'No update ({reason})'));

    await user.click(await screen.findByRole('radio', { name: 'b' }));
    const notice = await screen.findByTestId('form-reaction-error');
    expect(notice).toHaveAttribute('role', 'alert');
    expect(notice).toHaveTextContent(/^No update \(p is odd\)$/);
  });

  it('fills {reason} with nothing when the failure carries no server reason', async () => {
    const user = userEvent.setup();
    const react = vi.fn().mockRejectedValue(new Error('network down'));
    const { channel } = renderInbox(undefined, undefined, '', react);
    await emitFrame(channel, 'interaction.add', reactingForm('q-uf-none', 'No update.{reason}'));

    await user.click(await screen.findByRole('radio', { name: 'b' }));
    expect(await screen.findByTestId('form-reaction-error')).toHaveTextContent(/^No update\.$/);
  });

  it("draws the caller's line with the host door's reason", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'the reaction was refused', reason: 'p is odd' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    try {
      const { channel } = renderInbox(undefined, undefined, '', undefined, '/web/channel/react');
      await emitFrame(
        channel,
        'interaction.add',
        reactingForm('q-uf-host', 'No update ({reason})'),
      );

      await user.click(await screen.findByRole('radio', { name: 'b' }));
      expect(await screen.findByTestId('form-reaction-error')).toHaveTextContent(
        /^No update \(p is odd\)$/,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("never fills {reason} with the host door's message", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'the channel session expired' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    try {
      const { channel } = renderInbox(undefined, undefined, '', undefined, '/web/channel/react');
      await emitFrame(
        channel,
        'interaction.add',
        reactingForm('q-uf-host-none', 'No update.{reason}'),
      );

      await user.click(await screen.findByRole('radio', { name: 'b' }));
      expect(await screen.findByTestId('form-reaction-error')).toHaveTextContent(/^No update\.$/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Form answer — the caller's step-progress line", () => {
  const stepped = (interactionId: string, stepProgress?: string): string =>
    interactionJson({
      interaction_id: interactionId,
      format: 'form',
      prompt: 'Steps',
      format_payload: {
        schema: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' } } },
        pages: [
          { title: 'One', fields: ['a'] },
          { title: 'Two', fields: ['b'] },
        ],
        ...(stepProgress !== undefined
          ? { wording: { form: { step_progress: stepProgress } } }
          : {}),
      },
    });

  it("draws the caller's line with {step} and {steps} filled, then the page title", async () => {
    const user = userEvent.setup();
    const { channel } = renderInbox();
    await emitFrame(channel, 'interaction.add', stepped('q-sp-set', 'Page {step}/{steps}'));

    const status = await screen.findByTestId('form-step-status');
    expect(status).toHaveTextContent(/^Page 1\/2 — One$/);
    expect(screen.getByRole('region', { name: 'Page 1/2 — One' })).toBe(status);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByTestId('form-step-status')).toHaveTextContent(/^Page 2\/2 — Two$/);
  });

  it("names the section by the surface's own line when the send set none", async () => {
    const { channel } = renderInbox();
    await emitFrame(channel, 'interaction.add', stepped('q-sp-unset'));

    const status = await screen.findByTestId('form-step-status');
    expect(screen.getByRole('region', { name: 'Step 1 of 2 — One' })).toBe(status);
  });
});

describe("Form answer — the field's own words", () => {
  it('reads a yes/no value back in the field words', async () => {
    const user = userEvent.setup();
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-bool-words',
        format: 'form',
        prompt: 'Review',
        format_payload: {
          schema: {
            type: 'object',
            properties: { agree: { type: 'boolean' }, news: { type: 'boolean' } },
          },
          data: { values: { agree: true, news: false } },
          pages: [
            { title: 'Pick', fields: ['agree', 'news'] },
            { title: 'Review', fields: [], kind: 'review' },
          ],
          wording: {
            form: {
              fields: {
                agree: { true_label: 'Agreed', false_label: 'Declined' },
                news: { true_label: 'Subscribed', false_label: 'Not subscribed' },
              },
            },
          },
        },
      }),
    );

    await user.click(await screen.findByRole('button', { name: 'Next' }));
    const review = await screen.findByTestId('form-review');
    expect(Array.from(review.querySelectorAll('dd')).map((cell) => cell.textContent)).toEqual([
      'Agreed',
      'Not subscribed',
    ]);
  });

  it("shows the field's required sentence for a missing value", async () => {
    const user = userEvent.setup();
    const answer = vi.fn().mockResolvedValue(undefined);
    const { channel } = renderInbox(answer);
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-required-words',
        format: 'form',
        prompt: 'Codes',
        format_payload: {
          schema: {
            type: 'object',
            properties: { code: { type: 'string', title: 'Code' } },
            required: ['code'],
          },
          wording: { form: { fields: { code: { required: 'Enter a code first' } } } },
        },
      }),
    );

    await screen.findByLabelText(/Code/);
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Enter a code first')).toBeInTheDocument();
    expect(screen.queryByText(/"code" is required/)).not.toBeInTheDocument();
    expect(answer).not.toHaveBeenCalled();
  });

  it("draws a list field's add, remove, item and empty words", async () => {
    const user = userEvent.setup();
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({
        interaction_id: 'q-list-words',
        format: 'form',
        prompt: 'Tags',
        format_payload: {
          schema: {
            type: 'object',
            properties: { tags: { type: 'array', items: { type: 'string' }, title: 'Tags' } },
          },
          wording: {
            form: {
              fields: {
                tags: {
                  add_item: 'Add a tag',
                  remove_item: 'Drop',
                  item_label: 'Tag {n}',
                  no_items: 'No tags yet',
                },
              },
            },
          },
        },
      }),
    );

    expect(await screen.findByText('No tags yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add a tag' }));
    expect(screen.getByRole('textbox', { name: /^Tag 1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Drop Tag 1' })).toBeInTheDocument();
    expect(screen.queryByText('No tags yet')).not.toBeInTheDocument();
  });
});
