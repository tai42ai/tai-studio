/**
 * The route view's URL-backed filter bar: a delivery-status select and an address
 * substring narrow the thread list; a text needle searches record text (the open
 * thread's transcript, else the route's messages). Every control writes the page's
 * search through `navigate` — the URL is the single source of truth — so each filter
 * is linkable and survives a reload, exactly as the observability/marketplace bars.
 *
 * The status select commits on change; the two text fields hold a local draft and
 * commit on submit (Enter or the Apply button), never per keystroke. A draft is
 * re-seeded from the committed URL value DURING RENDER so a filter arriving from a
 * deep link / back-forward overwrites the box.
 */
import { useState, type ReactNode } from 'react';
import {
  Button,
  Field,
  Select,
  TextInput,
  useAppNavigate,
  type RouteSearch,
} from '@tai42/studio-sdk';
import type { ConversationDeliveryStatus } from '@tai42/api-client';

import { mergeSearch, type ConversationsSearch } from './search';
import { DELIVERY_LABEL, DELIVERY_STATUSES } from './status';

/** Radix `Select.Item` forbids an empty value, so "any status" is a sentinel. */
const ANY_STATUS = '__any_status__';

const STATUS_OPTIONS = [
  { value: ANY_STATUS, label: 'Any status' },
  ...DELIVERY_STATUSES.map((status) => ({ value: status, label: DELIVERY_LABEL[status] })),
];

export function ConversationFilters({
  search,
}: {
  readonly search: ConversationsSearch;
}): ReactNode {
  const navigate = useAppNavigate();

  const committedAddress = search.address ?? '';
  const committedQuery = search.q ?? '';
  const [address, setAddress] = useState(committedAddress);
  const [query, setQuery] = useState(committedQuery);
  const [seed, setSeed] = useState({ address: committedAddress, query: committedQuery });
  if (seed.address !== committedAddress || seed.query !== committedQuery) {
    setSeed({ address: committedAddress, query: committedQuery });
    setAddress(committedAddress);
    setQuery(committedQuery);
  }

  const apply = (patch: Partial<RouteSearch<'conversations'>>): void => {
    navigate('conversations', mergeSearch(search, patch));
  };

  const submitText = (): void => {
    apply({
      address: address.trim() === '' ? undefined : address.trim(),
      q: query.trim() === '' ? undefined : query.trim(),
    });
  };

  return (
    <form
      className="tai-row"
      data-testid="conversation-filters"
      onSubmit={(event) => {
        event.preventDefault();
        submitText();
      }}
    >
      <Field label="Delivery status">
        <Select
          options={STATUS_OPTIONS}
          value={search.status ?? ANY_STATUS}
          onValueChange={(next) => {
            apply({
              status: next === ANY_STATUS ? undefined : (next as ConversationDeliveryStatus),
            });
          }}
        />
      </Field>
      <Field label="Address">
        <TextInput
          value={address}
          onChange={(event) => {
            setAddress(event.target.value);
          }}
          placeholder="Match part of an address"
        />
      </Field>
      <Field label="Search text">
        <TextInput
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          placeholder="Search message text"
        />
      </Field>
      <Button type="submit">Apply</Button>
    </form>
  );
}
