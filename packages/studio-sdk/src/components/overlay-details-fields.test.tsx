import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import {
  OverlayDetailsFields,
  overlayDetailsPatch,
  type OverlayDetails,
  type OverlayDetailsFieldsProps,
} from '../index';

/** A controlled host so the fields drive real state through `onChange`. */
function Harness({
  initial,
  nativeTags,
}: {
  initial: OverlayDetails;
  nativeTags?: readonly string[];
}) {
  const [value, setValue] = useState<OverlayDetails>(initial);
  return (
    <div>
      <OverlayDetailsFields value={value} onChange={setValue} nativeTags={nativeTags} />
      <output data-testid="patch">{JSON.stringify(overlayDetailsPatch(value))}</output>
    </div>
  );
}

// Published-type gate: the props must be nameable from the package entry.
const _props: OverlayDetailsFieldsProps = {
  value: { displayName: '', tags: [] },
  onChange: () => undefined,
};
void _props;

describe('overlayDetailsPatch — the pinned display-name mapping', () => {
  it('maps a blank input to display_name: null (clear), never ""', () => {
    expect(overlayDetailsPatch({ displayName: '', tags: [] }).display_name).toBeNull();
  });

  it('maps a whitespace-only input to null', () => {
    expect(overlayDetailsPatch({ displayName: '   ', tags: [] }).display_name).toBeNull();
  });

  it('sends trimmed non-empty text as-is and copies the tags', () => {
    const patch = overlayDetailsPatch({ displayName: '  Paris  ', tags: ['geo'] });
    expect(patch.display_name).toBe('Paris');
    expect(patch.tags).toEqual(['geo']);
  });

  it('sends ONLY display_name and tags (no folder_id / hidden keys)', () => {
    expect(Object.keys(overlayDetailsPatch({ displayName: 'x', tags: [] })).sort()).toEqual([
      'display_name',
      'tags',
    ]);
  });
});

describe('OverlayDetailsFields', () => {
  it('edits the display name through onChange, reflected in the patch', async () => {
    render(<Harness initial={{ displayName: '', tags: [] }} />);
    await userEvent.type(screen.getByLabelText('Display name'), 'Paris');
    expect(screen.getByTestId('patch')).toHaveTextContent('"display_name":"Paris"');
  });

  it('adds a tag through the shared tags input', async () => {
    render(<Harness initial={{ displayName: '', tags: [] }} />);
    await userEvent.type(screen.getByPlaceholderText('Add a tag…'), 'geo{Enter}');
    expect(screen.getByTestId('patch')).toHaveTextContent('"tags":["geo"]');
  });

  it('shows native tags as distinct read-only chips when provided', () => {
    render(<Harness initial={{ displayName: '', tags: [] }} nativeTags={['weather']} />);
    expect(screen.getByText('Native tags (read-only)')).toBeInTheDocument();
    expect(screen.getByText('weather')).toBeInTheDocument();
  });

  it('omits the native-tag section when there are none', () => {
    render(<Harness initial={{ displayName: '', tags: [] }} />);
    expect(screen.queryByText('Native tags (read-only)')).not.toBeInTheDocument();
  });
});
