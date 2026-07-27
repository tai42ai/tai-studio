import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TagChips, TagsInput } from './tags';

describe('TagChips', () => {
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
    render(<TagsInput value={[]} onChange={onChange} />);

    await user.type(screen.getByLabelText('Add a tag'), 'alpha');
    await user.click(screen.getByRole('button', { name: 'Add tag' }));

    expect(onChange).toHaveBeenCalledWith(['alpha']);
  });

  it('commits the draft on Enter and on comma', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TagsInput value={[]} onChange={onChange} />);

    const input = screen.getByLabelText('Add a tag');
    await user.type(input, 'alpha{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(['alpha']);

    await user.type(input, 'beta,');
    expect(onChange).toHaveBeenLastCalledWith(['beta']);
  });

  it('ignores a blank or duplicate entry', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TagsInput value={['alpha']} onChange={onChange} />);

    const input = screen.getByLabelText('Add a tag');
    await user.type(input, '   {Enter}');
    await user.type(input, 'alpha{Enter}');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('gives every remove control a real accessible name and removes on click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TagsInput value={['alpha', 'beta']} onChange={onChange} />);

    const remove = screen.getByRole('button', { name: 'Remove tag alpha' });
    expect(remove).toHaveClass('tai-icon-btn');

    await user.click(remove);
    expect(onChange).toHaveBeenCalledWith(['beta']);
  });

  it('draws the remove mark as an icon, never a Unicode glyph, keeping the name', () => {
    render(<TagsInput value={['alpha']} onChange={vi.fn()} />);

    const remove = screen.getByRole('button', { name: 'Remove tag alpha' });
    expect(remove.querySelector('svg')).not.toBeNull();
    expect(remove.textContent).toBe('');
    expect(screen.getByRole('button', { name: 'Remove tag alpha' })).toBeInTheDocument();
  });

  it('shows each tag as a static chip beside its remove control', () => {
    render(<TagsInput value={['alpha']} onChange={vi.fn()} />);
    expect(screen.getByText('alpha')).toHaveClass('tai-chip', 'tai-chip-static');
  });

  it('disables the whole editor when disabled', () => {
    render(<TagsInput value={['alpha']} onChange={vi.fn()} disabled />);

    expect(screen.getByLabelText('Add a tag')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add tag' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove tag alpha' })).toBeDisabled();
  });
});

it('renders both exports and keeps every accessible name', () => {
  render(
    <>
      <TagChips tags={['alpha']} />
      <TagsInput value={['beta']} onChange={vi.fn()} />
    </>,
  );

  expect(screen.getByText('alpha')).toHaveClass('tai-chip');
  expect(screen.getByLabelText('Add a tag')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove tag beta' })).toBeInTheDocument();
});
