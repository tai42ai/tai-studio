/**
 * The directory rows built from the reads: their order, a managed entry kept on its
 * provider's card, servers drawn from the live status when the configuration is
 * refused, a listing folded once installed, and the search match.
 */
import { describe, expect, it, vi } from 'vitest';

import { connection, listing, provider } from './test-utils';
import {
  type DirectoryReads,
  directoryRows,
  type ReadState,
  rowMatches,
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

describe('rowMatches', () => {
  const [row] = directoryRows(reads({ providers: ready([provider()]) }));
  if (row === undefined) throw new Error('no provider row');

  it('matches the display name, the description and the id, ignoring case', () => {
    expect(rowMatches(row, 'GITHUB')).toBe(true);
    expect(rowMatches(row, 'your github account')).toBe(true);
    expect(rowMatches(row, 'git')).toBe(true);
    expect(rowMatches(row, 'mail')).toBe(false);
    expect(rowMatches(row, '  ')).toBe(true);
  });
});
