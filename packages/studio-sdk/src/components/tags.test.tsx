import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Field } from './field';
import { TagChips, TagsInput } from './tags';
import type { TagChipsProps, TagsInputProps } from '../index';

/**
 * PUBLISHED-TYPE GATE, enforced by `pnpm typecheck` (`tsc --noEmit` covers every
 * file under `src`, tests included). Both components are re-exported from the
 * package entry, so a plugin author must be able to NAME what they accept; the
 * types are imported from `../index` so dropping a re-export fails this too.
 */
interface PluginTagChipsProps extends TagChipsProps {
  readonly tone?: 'quiet' | 'loud';
}
interface PluginTagsInputProps extends TagsInputProps {
  readonly max?: number;
}

describe('TagChips', () => {
  it('publishes a nameable props type a plugin can extend', () => {
    const chips: PluginTagChipsProps = { tags: ['alpha'], tone: 'quiet' };
    const input: PluginTagsInputProps = { value: ['beta'], onChange: vi.fn(), max: 3 };
    expect([chips.tags, input.value, input.max]).toEqual([['alpha'], ['beta'], 3]);
  });

  it('renders one static chip per tag', () => {
    render(<TagChips tags={['alpha', 'beta']} />);

    for (const tag of ['alpha', 'beta']) {
      expect(screen.getByText(tag)).toHaveClass('tai-chip', 'tai-chip-static');
    }
  });

  it('renders nothing when there are no tags', () => {
    const { container } = render(<TagChips tags={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a tag containing <script> as escaped TEXT, never an element (XSS pin)', () => {
    const payload = '<script>alert(1)</script>';
    const { container } = render(<TagChips tags={[payload]} />);
    expect(screen.getByText(payload)).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
  });
});

describe('TagsInput', () => {
  it('adds a tag from the button', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Field label="Tags">
        <TagsInput value={[]} onChange={onChange} />
      </Field>,
    );

    await user.type(screen.getByLabelText('Tags'), 'alpha');
    await user.click(screen.getByRole('button', { name: 'Add tag' }));

    expect(onChange).toHaveBeenCalledWith(['alpha']);
  });

  it('names the Add/Remove controls after itemNoun so a second editor stays distinct', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Field label="Badges">
        <TagsInput value={['alpha']} onChange={onChange} itemNoun="badge" />
      </Field>,
    );

    await user.type(screen.getByLabelText('Badges'), 'network');
    await user.click(screen.getByRole('button', { name: 'Add badge' }));
    expect(onChange).toHaveBeenCalledWith(['alpha', 'network']);

    expect(screen.getByRole('button', { name: 'Remove badge alpha' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add tag' })).toBeNull();
  });

  it('commits the draft on Enter and on comma', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Field label="Tags">
        <TagsInput value={[]} onChange={onChange} />
      </Field>,
    );

    const input = screen.getByLabelText('Tags');
    await user.type(input, 'alpha{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(['alpha']);

    await user.type(input, 'beta,');
    expect(onChange).toHaveBeenLastCalledWith(['beta']);
  });

  it('ignores a blank or duplicate entry', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Field label="Tags">
        <TagsInput value={['alpha']} onChange={onChange} />
      </Field>,
    );

    const input = screen.getByLabelText('Tags');
    await user.type(input, '   {Enter}');
    await user.type(input, 'alpha{Enter}');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('gives every remove control a real accessible name and removes on click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Field label="Tags">
        <TagsInput value={['alpha', 'beta']} onChange={onChange} />
      </Field>,
    );

    const remove = screen.getByRole('button', { name: 'Remove tag alpha' });
    expect(remove).toHaveClass('tai-icon-btn');

    await user.click(remove);
    expect(onChange).toHaveBeenCalledWith(['beta']);
  });

  it('draws the remove mark as an icon, never a Unicode glyph, keeping the name', () => {
    render(
      <Field label="Tags">
        <TagsInput value={['alpha']} onChange={vi.fn()} />
      </Field>,
    );

    const remove = screen.getByRole('button', { name: 'Remove tag alpha' });
    expect(remove.querySelector('svg')).not.toBeNull();
    expect(remove.textContent).toBe('');
    expect(screen.getByRole('button', { name: 'Remove tag alpha' })).toBeInTheDocument();
  });

  it('shows each tag as a static chip beside its remove control', () => {
    render(
      <Field label="Tags">
        <TagsInput value={['alpha']} onChange={vi.fn()} />
      </Field>,
    );
    expect(screen.getByText('alpha')).toHaveClass('tai-chip', 'tai-chip-static');
  });

  it('disables the whole editor when disabled', () => {
    render(
      <Field label="Tags">
        <TagsInput value={['alpha']} onChange={vi.fn()} disabled />
      </Field>,
    );

    expect(screen.getByLabelText('Tags')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add tag' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove tag alpha' })).toBeDisabled();
  });

  it('renders both exports and keeps every accessible name', () => {
    render(
      <>
        <TagChips tags={['alpha']} />
        <Field label="Tags">
          <TagsInput value={['beta']} onChange={vi.fn()} />
        </Field>
      </>,
    );

    expect(screen.getByText('alpha')).toHaveClass('tai-chip');
    expect(screen.getByLabelText('Tags')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove tag beta' })).toBeInTheDocument();
  });

  it('takes the Field label as its name rather than overriding it (WCAG 2.5.3)', () => {
    // The draft input claims the Field's control id, so the label a user SEES is
    // the name a voice-control user says. An `aria-label` of the editor's own
    // would replace it with a string that appears nowhere on screen.
    render(
      <Field label="Release tags">
        <TagsInput value={[]} onChange={vi.fn()} />
      </Field>,
    );
    const input = screen.getByLabelText('Release tags');
    expect(input).toHaveAttribute('placeholder', 'Add a tag…');
    expect(input).not.toHaveAttribute('aria-label');
    // The visible label really is the label element wired to this control.
    expect(screen.getByText('Release tags').tagName).toBe('LABEL');
    expect(screen.getByText('Release tags')).toHaveAttribute('for', input.id);
  });

  it('takes a caller aria-label as its name when mounted outside a Field', () => {
    // Published surface: a plugin author who mounts the editor without a `Field`
    // must still be able to name it. The label forwards to the draft input as a
    // native attribute (the pass-through family in `inputs.tsx`), so a bare editor
    // is nameable rather than nameless. Deleting the forward leaves it unnamed.
    render(<TagsInput value={[]} onChange={vi.fn()} aria-label="Release tags" />);
    const input = screen.getByLabelText('Release tags');
    expect(input).toHaveAttribute('placeholder', 'Add a tag…');
    // …and inside a Field with no aria-label, the Field still names it (the prop
    // is optional and its absence changes nothing about the wrapped case).
    expect(input.tagName).toBe('INPUT');
  });
});
