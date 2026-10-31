/** `ChannelPicker` over a stub channel list read, and `channelIdentityHint`. */
import type { Channels } from '@tai42/api-client';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { channelIdentityHint, ChannelPicker } from './channel-picker';
import {
  forbiddenRead,
  pendingRead,
  renderWithNavigation,
  type StubQuery,
  stubQuery,
} from './named-list-test-utils';

const REQUIRED = 'A channel is required.';

function listing(names: readonly string[]): Channels {
  return { channels: names.map((name) => ({ name, identity_hint: null })) };
}

function renderPicker(query: StubQuery<Channels>, value = '', error?: string) {
  const onValueChange = vi.fn();
  renderWithNavigation(
    <ChannelPicker query={query} value={value} onValueChange={onValueChange} error={error} />,
  );
  return { onValueChange };
}

describe('ChannelPicker', () => {
  it('pending: a disabled select reading "Loading channels…", with the description', () => {
    renderPicker(stubQuery(pendingRead));
    const combobox = screen.getByRole('combobox', { name: 'Channel' });
    expect(combobox).toBeDisabled();
    expect(combobox).toHaveTextContent('Loading channels…');
    expect(
      screen.getByText('An installed channel plugin; the answer goes back on the same channel.'),
    ).toBeInTheDocument();
  });

  it('error: the server message with Retry, the field error hidden', async () => {
    const query = stubQuery<Channels>({ isError: true, error: new Error('channels boom') });
    renderPicker(query, '', REQUIRED);
    expect(screen.getByRole('alert')).toHaveTextContent('channels boom');
    await userEvent.setup().click(screen.getByRole('button', { name: /Retry/ }));
    expect(query.refetch).toHaveBeenCalledOnce();
    expect(screen.queryByText(REQUIRED)).toBeNull();
  });

  it('loaded: the names as options; the field error shows under the select', async () => {
    const { onValueChange } = renderPicker(
      stubQuery({ data: listing(['web', 'slack']), isSuccess: true }),
      '',
      REQUIRED,
    );
    expect(screen.getByText(REQUIRED)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Channel' }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'web',
      'slack',
    ]);
    await user.click(screen.getByRole('option', { name: 'slack' }));
    expect(onValueChange).toHaveBeenCalledWith('slack');
  });

  it('loaded: the search box narrows the channels', async () => {
    renderPicker(stubQuery({ data: listing(['web', 'slack', 'webhook']), isSuccess: true }));
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Channel' }));
    await user.type(screen.getByRole('combobox', { name: 'Search channels' }), 'web');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'web',
      'webhook',
    ]);
  });

  it('empty: the note and the link to the channel plugins', () => {
    renderPicker(stubQuery({ data: listing([]), isSuccess: true }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'No channels are installed on this deployment.',
    );
    expect(screen.getByRole('link', { name: 'Browse channel plugins' })).toHaveAttribute(
      'href',
      '/marketplace?kind=channel',
    );
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('refused: a typed entry named by the field, described by the no-list note', () => {
    renderPicker(stubQuery(forbiddenRead));
    const input = screen.getByRole('textbox', { name: 'Channel' });
    expect(input).toHaveValue('');
    // The note comes first; the field's own description follows it.
    expect(input).toHaveAccessibleDescription(
      expect.stringMatching(
        /^This session cannot list channels, so type the channel's exact name\. Saving checks that the channel is installed\./,
      ),
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: /Retry/ })).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('refused: hands the typed name, trimmed, to onValueChange on blur', async () => {
    const user = userEvent.setup();
    const { onValueChange } = renderPicker(stubQuery(forbiddenRead));
    await user.type(screen.getByRole('textbox', { name: 'Channel' }), '  typed_channel ');
    expect(onValueChange).not.toHaveBeenCalled();
    await user.tab();
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('typed_channel');
  });

  it('refused with a stored value: the typed entry holds it, unflagged', () => {
    renderPicker(stubQuery(forbiddenRead), 'sms', REQUIRED);
    expect(screen.getByRole('textbox', { name: 'Channel' })).toHaveValue('sms');
    expect(screen.queryByText(/not registered|not installed/)).toBeNull();
    expect(screen.getByText(REQUIRED)).toBeInTheDocument();
  });

  it('unlisted: the stored channel flagged "not installed", described by the warning line', () => {
    renderPicker(stubQuery({ data: listing(['web']), isSuccess: true }), 'sms');
    const combobox = screen.getByRole('combobox', { name: 'Channel' });
    expect(combobox).toHaveTextContent('sms (not installed)');
    const line = screen.getByText(/sms is not installed\. Pick another, or saving is refused\./);
    expect(line).toHaveTextContent(
      'not installed sms is not installed. Pick another, or saving is refused.',
    );
    expect(combobox.getAttribute('aria-describedby')?.split(' ')).toContain(line.id);
  });

  it('an empty list with an unlisted stored value: the flagged sole option and the empty line', async () => {
    renderPicker(stubQuery({ data: listing([]), isSuccess: true }), 'sms');
    expect(screen.getByRole('status')).toHaveTextContent(
      'No channels are installed on this deployment.',
    );
    await userEvent.setup().click(screen.getByRole('combobox', { name: 'Channel' }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'sms (not installed)',
    ]);
  });
});

describe('channelIdentityHint', () => {
  const data: Channels = {
    channels: [
      { name: 'web', identity_hint: 'The web chat-line id.' },
      { name: 'bare', identity_hint: null },
    ],
  };

  it('is the hint, null for a listed channel without one, undefined for an unlisted name', () => {
    expect(channelIdentityHint(data, 'web')).toBe('The web chat-line id.');
    expect(channelIdentityHint(data, 'bare')).toBeNull();
    expect(channelIdentityHint(data, 'ghost')).toBeUndefined();
  });
});
