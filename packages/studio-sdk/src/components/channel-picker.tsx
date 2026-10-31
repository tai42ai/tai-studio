/**
 * `ChannelPicker` — picks an installed channel plugin by name from the channel list
 * read (`GET /api/channels`) the host owns and hands in. Presentational: it fetches
 * nothing and names no query library. It draws the read's states and its own copy,
 * and flags a stored channel the loaded list does not hold as "not installed".
 */
import type { Channels } from '@tai42/api-client';
import type { ReactNode } from 'react';

import { AppLink } from '../navigation/app-link';
import { type ListReadFlags, type NamedListCopy, NamedListPicker } from './named-list-picker';

/** The subset of the channel list read this picker reads; a TanStack query result satisfies it. */
export interface ChannelListQuery extends ListReadFlags {
  readonly data: Channels | undefined;
}

export interface ChannelPickerProps {
  readonly query: ChannelListQuery;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  /** The host form's field error, shown under the control while the select renders. */
  readonly error?: string | undefined;
}

/**
 * The named channel's declared hint for a route's identity: the hint, `null` for a
 * listed channel that declares none, `undefined` when the name is not listed.
 */
export function channelIdentityHint(data: Channels, name: string): string | null | undefined {
  const entry = data.channels.find((channel) => channel.name === name);
  return entry === undefined ? undefined : entry.identity_hint;
}

const COPY: NamedListCopy = {
  label: 'Channel',
  description: 'An installed channel plugin; the answer goes back on the same channel.',
  loadingPlaceholder: 'Loading channels…',
  placeholder: 'Select a channel',
  forbiddenNote:
    "This session cannot list channels, so type the channel's exact name. Saving checks that the channel is installed.",
  emptyNote: 'No channels are installed on this deployment.',
  emptyAction: (
    <AppLink to="marketplace" search={{ kind: 'channel' }} className="tai-link">
      Browse channel plugins
    </AppLink>
  ),
  unlistedLabel: 'not installed',
  searchLabel: 'Search channels',
};

export function ChannelPicker({
  query,
  value,
  onValueChange,
  error,
}: ChannelPickerProps): ReactNode {
  const names = (query.data?.channels ?? []).map((channel) => channel.name);
  return (
    <NamedListPicker
      query={query}
      names={names}
      value={value}
      onValueChange={onValueChange}
      error={error}
      copy={COPY}
    />
  );
}
