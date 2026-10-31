/**
 * `AgentPicker` — picks a registered agent by name from the agent list read
 * (`GET /api/agents`) the host owns and hands in. Presentational: it fetches nothing
 * and names no query library. It draws the read's states and its own copy, and flags
 * a stored agent the loaded list does not hold as "not registered".
 */
import type { AgentListing } from '@tai42/api-client';
import type { ReactNode } from 'react';

import { AppLink } from '../navigation/app-link';
import { type ListReadFlags, type NamedListCopy, NamedListPicker } from './named-list-picker';

/** The subset of the agent list read this picker reads; a TanStack query result satisfies it. */
export interface AgentListQuery extends ListReadFlags {
  readonly data: AgentListing | undefined;
}

export interface AgentPickerProps {
  readonly query: AgentListQuery;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  /** The host form's field error, shown under the control while the select renders. */
  readonly error?: string | undefined;
}

const COPY: NamedListCopy = {
  label: 'Agent',
  loadingPlaceholder: 'Loading agents…',
  placeholder: 'Select an agent',
  forbiddenNote:
    "This session cannot list agents, so type the agent's exact name. Saving checks that the agent is registered.",
  emptyNote: 'No agents are registered on this deployment.',
  emptyAction: (
    <AppLink to="agents" className="tai-link">
      Open the Agents screen
    </AppLink>
  ),
  unlistedLabel: 'not registered',
  searchLabel: 'Search agents',
};

export function AgentPicker({ query, value, onValueChange, error }: AgentPickerProps): ReactNode {
  const names = (query.data?.items ?? []).map((item) => item.name);
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
