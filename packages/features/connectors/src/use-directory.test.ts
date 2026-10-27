/**
 * The directory rows built from the reads: their order, a managed entry kept on its
 * provider's card, servers drawn from the live status when the configuration is
 * refused, a listing folded once installed, and the search match.
 */
import { matchesSearch } from '@tai42/studio-sdk';
import { describe, expect, it, vi } from 'vitest';

import { connection, listing, provider } from './test-utils';
import {
  type DirectoryReads,
  directoryRows,
  type ReadState,
  rowSearchTexts,
  type ServerEntry,
} from './use-directory';

function ready<T>(data: T): ReadState<T> {
  return { status: 'ready', data };
}

const REFUSED = { status: 'refused' } as const;

function entry(title: string, connectionId: string | null = null): ServerEntry {
  return { title, include: [], exclude: [], connectionId };
}

function reads(overrides: Partial<DirectoryReads> = {}): DirectoryReads {
  return {
    providers: ready([]),
    connections: ready([]),
    manifest: ready([]),
    status: ready({ bound: {}, failed: [] }),
    installed: ready(new Set<string>()),
    marketplace: {
      state: ready([]),
      hasNextPage: false,
      fetchingNext: false,
      nextPageError: null,
      fetchNext: vi.fn(),
    },
    ...overrides,
  };
}

function marketplace(rows: ReturnType<typeof listing>[]): DirectoryReads['marketplace'] {
  return { ...reads().marketplace, state: ready(rows) };
}

describe('directoryRows', () => {
  it('lists providers, then servers in manifest order, then listings by display name', () => {
    const rows = directoryRows(
      reads({
        providers: ready([provider()]),
        manifest: ready([entry('relay'), entry('alerts')]),
        marketplace: marketplace([
          listing({ ref: 'acme/zeta', display_name: 'Zeta', kinds: [] }),
          listing({ ref: 'acme/alpha', display_name: 'Alpha', kinds: [] }),
        ]),
      }),
    );
    expect(rows.map((row) => row.key)).toEqual([
      'provider:github',
      'server:relay',
      'server:alerts',
      'listing:acme/alpha',
      'listing:acme/zeta',
    ]);
  });

  it("keeps a managed entry on its provider's card and draws an orphaned one alone", () => {
    const rows = directoryRows(
      reads({
        providers: ready([provider()]),
        connections: ready([
          connection(),
          connection({ connection_id: 'c-x', provider_id: 'gone' }),
        ]),
        manifest: ready([entry('github_repo', 'conn-1'), entry('gone_repo', 'c-x')]),
      }),
    );
    expect(rows.map((row) => row.key)).toEqual(['provider:github', 'server:gone_repo']);
  });

  it("gives each provider card its own connections in read order, or the read's state", () => {
    const providers = ready([provider(), provider({ id: 'acme_mail' }), provider({ id: 'relay' })]);
    const connectionsOf = (overrides: Partial<DirectoryReads>) =>
      directoryRows(reads({ providers, ...overrides })).map((row) => {
        if (row.kind !== 'provider') throw new Error(`not a provider row: ${row.key}`);
        const { connections } = row;
        return connections === null || connections === 'unknown'
          ? connections
          : connections.map((c) => c.connection_id);
      });
    const connections = ready([
      connection({ connection_id: 'c-1', provider_id: 'acme_mail' }),
      connection({ connection_id: 'c-2' }),
      connection({ connection_id: 'c-3', provider_id: 'acme_mail' }),
    ]);
    expect(connectionsOf({ connections })).toEqual([['c-2'], ['c-1', 'c-3'], []]);
    expect(connectionsOf({ connections: { status: 'loading' } })).toEqual([null, null, null]);
    expect(connectionsOf({ connections: REFUSED })).toEqual(['unknown', 'unknown', 'unknown']);
  });

  it('draws servers from the bound and failed titles when the configuration is refused', () => {
    const rows = directoryRows(
      reads({
        manifest: REFUSED,
        status: ready({
          bound: { relay: ['relay_send'] },
          failed: [{ title: 'alerts', category: 'auth', message: 'denied' }],
        }),
      }),
    );
    expect(rows.map((row) => [row.key, row.kind === 'server' ? row.live.kind : null])).toEqual([
      ['server:relay', 'bound'],
      ['server:alerts', 'failed'],
    ]);
  });

  it('folds a listing whose names are all installed and keeps one with a name missing', () => {
    const rows = directoryRows(
      reads({
        installed: ready(new Set(['acme_mail'])),
        marketplace: marketplace([
          listing(),
          listing({
            ref: 'acme/files',
            kinds: [{ kind: 'connector', count: 2, names: ['acme_mail', 'acme_files'] }],
          }),
        ]),
      }),
    );
    expect(rows.map((row) => row.key)).toEqual(['listing:acme/files']);
  });

  it('withholds listings when the installed read is not ready', () => {
    const rows = directoryRows(
      reads({ installed: REFUSED, marketplace: marketplace([listing()]) }),
    );
    expect(rows).toEqual([]);
  });
});

describe('rowSearchTexts', () => {
  const [row] = directoryRows(reads({ providers: ready([provider()]) }));
  if (row === undefined) throw new Error('no provider row');
  const matches = (query: string): boolean => matchesSearch(query, ...rowSearchTexts(row));

  it('searches the display name, the description and the id, ignoring case', () => {
    expect(matches('GITHUB')).toBe(true);
    expect(matches('your github account')).toBe(true);
    expect(matches('git')).toBe(true);
    expect(matches('mail')).toBe(false);
    expect(matches('  ')).toBe(true);
  });
});
