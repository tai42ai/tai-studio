import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { type ApiClient } from '@tai42/api-client';

import { InteractionsBadge } from './InteractionsBadge';
import {
  emitFrame,
  idJson,
  interactionJson,
  interactionsPage,
  makeChannel,
  pendingItem,
  renderWithProviders,
  settle,
  stubClient,
} from './test-utils';

describe('InteractionsBadge — floating count', () => {
  it('reflects the door pending total from the paged base', async () => {
    // With no live deltas the derived count equals the door's authoritative `total`,
    // so it stays honest even when only the first page of the pending set is loaded.
    const channel = makeChannel();
    const client = stubClient({
      channel,
      listInteractions: vi
        .fn()
        .mockResolvedValue(interactionsPage([pendingItem('a'), pendingItem('b')], { total: 2 })),
    });
    renderWithProviders(<InteractionsBadge />, { client });

    expect(await screen.findByTestId('interactions-badge')).toHaveTextContent('2');
  });

  it('shows no badge when the door reports nothing pending', async () => {
    const channel = makeChannel();
    // The default `listInteractions` stub is an empty page (total 0).
    const client = stubClient({ channel });
    renderWithProviders(<InteractionsBadge />, { client });

    await settle();
    expect(screen.queryByTestId('interactions-badge')).not.toBeInTheDocument();
  });

  it('stays live: a live interaction.add bumps the count WITHOUT a refetch', async () => {
    // The badge count is derived: the door total (1) plus the overlay delta. A live
    // add for a new id raises it to 2 from the overlay alone — no refetch of the
    // paged base is triggered by the delta.
    const listInteractions = vi
      .fn()
      .mockResolvedValue(interactionsPage([pendingItem('a')], { total: 1 }));
    const channel = makeChannel();
    const client = stubClient({ channel, listInteractions });
    renderWithProviders(<InteractionsBadge />, { client });

    expect(await screen.findByTestId('interactions-badge')).toHaveTextContent('1');
    const callsBefore = listInteractions.mock.calls.length;

    // A live add for an id absent from the seed arrives.
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({ interaction_id: 'b', format: 'text' }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('interactions-badge')).toHaveTextContent('2');
    });
    // The delta moved the count through the overlay, not a refetch of the base.
    expect(listInteractions.mock.calls.length).toBe(callsBefore);
  });

  it('keeps the badge count right after a reconnect following a removal (no double-subtraction)', async () => {
    // seed [a] with total 2 (one more pending on an unloaded page). Removing `a` drops
    // the count to 1 through the overlay. The reconnect refetches the base to total 1
    // (a is gone server-side); the persisted removal must NOT be subtracted from the
    // fresh total a second time — epoch reconciliation holds the badge at 1, never a
    // stale 0 (which would wrongly hide the badge). Pin the jitter to 0 for an
    // immediate reconnect.
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      // All fetches before the swap return total 2; the reconnect's resync (after the
      // swap) returns the reduced total 1. A mutable page makes this timing-robust
      // against how the initial load and conn1's resync dedupe.
      let page = interactionsPage([pendingItem('a')], { total: 2 });
      const listInteractions = vi.fn(() => Promise.resolve(page));
      const first = makeChannel();
      const reconnect = makeChannel();
      const stream = vi.fn();
      stream.mockResolvedValueOnce(first.iterator);
      stream.mockImplementation(() => Promise.resolve(reconnect.iterator));
      const client = {
        streamInteractions: stream,
        listInteractions,
        answerInteraction: vi.fn().mockResolvedValue(undefined),
        listChannels: vi.fn().mockResolvedValue({ channels: [] }),
      } as unknown as ApiClient;
      renderWithProviders(<InteractionsBadge />, { client });

      expect(await screen.findByTestId('interactions-badge')).toHaveTextContent('2');

      // The removal drops the count to 1 via the overlay (no refetch of the base).
      await emitFrame(first, 'interaction.removed', idJson('a'));
      await waitFor(() => {
        expect(screen.getByTestId('interactions-badge')).toHaveTextContent('1');
      });

      // The connection drops → the reconnect refetches the base to the reduced total 1.
      page = interactionsPage([], { total: 1 });
      await act(async () => {
        first.close();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      // The badge holds at 1, not a stale 0 — the removal is reconciled by epoch, so it
      // is not re-subtracted from the fresh total.
      await waitFor(() => {
        expect(screen.getByTestId('interactions-badge')).toHaveTextContent('1');
      });
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('degrades when a background refetch of the base fails after initial success', async () => {
    // The initial load succeeds (count honest). A stream reconnect then resyncs the
    // paged base and the list door 500s: the count is now stale, so the badge
    // degrades — it stays visible with a warning, never a silent freeze on the last
    // value. Pin the reconnect jitter to 0 so the reconnect is immediate.
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const listInteractions = vi.fn();
      listInteractions.mockResolvedValueOnce(interactionsPage([pendingItem('a')], { total: 1 }));
      listInteractions.mockRejectedValue(
        Object.assign(new Error('list door down'), { status: 500 }),
      );
      // First connection ends immediately (its resync dedupes into the initial
      // load); the reconnect's resync runs after that load settled → a real refetch.
      const first = makeChannel();
      first.close();
      const reconnect = makeChannel();
      const stream = vi.fn();
      stream.mockResolvedValueOnce(first.iterator);
      stream.mockImplementation(() => Promise.resolve(reconnect.iterator));
      const client = {
        streamInteractions: stream,
        listInteractions,
        answerInteraction: vi.fn().mockResolvedValue(undefined),
        listChannels: vi.fn().mockResolvedValue({ channels: [] }),
      } as unknown as ApiClient;
      renderWithProviders(<InteractionsBadge />, { client });

      await screen.findByTestId('interactions-badge');
      await waitFor(
        () => {
          expect(screen.getByTestId('interactions-badge')).toHaveAttribute('data-degraded', 'true');
        },
        { timeout: 5000 },
      );
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('holds the count after a removal when the reconnect refetch fails, then reconciles when it recovers', async () => {
    // Initial load: total 2 with one seeded card. Removing the seeded id drops the
    // badge to 1 via the overlay. The reconnect resyncs the base and the list door
    // 500s: the count must HOLD at 1 (the failed refetch does not advance the epoch, so
    // the prior-epoch removal keeps subtracting against the unchanged total) while the
    // badge degrades — never the stale 2 that swallowing the refetch error would leave.
    // A further reconnect resyncs successfully to the reduced total 1: still 1, healthy.
    // Pin the reconnect jitter to 0 for an immediate reconnect.
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      let phase: 'ok2' | 'fail' | 'ok1' = 'ok2';
      const listInteractions = vi.fn(() => {
        if (phase === 'fail') {
          return Promise.reject(Object.assign(new Error('list door down'), { status: 500 }));
        }
        return Promise.resolve(
          phase === 'ok2'
            ? interactionsPage([pendingItem('a')], { total: 2 })
            : interactionsPage([], { total: 1 }),
        );
      });
      const first = makeChannel();
      const second = makeChannel();
      const third = makeChannel();
      const stream = vi.fn();
      stream.mockResolvedValueOnce(first.iterator);
      stream.mockResolvedValueOnce(second.iterator);
      stream.mockImplementation(() => Promise.resolve(third.iterator));
      const client = {
        streamInteractions: stream,
        listInteractions,
        answerInteraction: vi.fn().mockResolvedValue(undefined),
        listChannels: vi.fn().mockResolvedValue({ channels: [] }),
      } as unknown as ApiClient;
      renderWithProviders(<InteractionsBadge />, { client });

      // Initial load: total 2, one card seeded → badge 2.
      expect(await screen.findByTestId('interactions-badge')).toHaveTextContent('2');

      // The removal drops the count to 1 via the overlay (no refetch of the base).
      await emitFrame(first, 'interaction.removed', idJson('a'));
      await waitFor(() => {
        expect(screen.getByTestId('interactions-badge')).toHaveTextContent('1');
      });

      // The connection drops → the reconnect's resync refetch of the base FAILS (500):
      // the badge holds at 1 AND degrades.
      phase = 'fail';
      await act(async () => {
        first.close();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      await waitFor(
        () => {
          const badge = screen.getByTestId('interactions-badge');
          expect(badge).toHaveAttribute('data-degraded', 'true');
          expect(badge).toHaveTextContent('1');
        },
        { timeout: 5000 },
      );

      // A further reconnect resyncs successfully to the reduced total 1: still 1, healthy.
      phase = 'ok1';
      await act(async () => {
        second.close();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      await waitFor(
        () => {
          const badge = screen.getByTestId('interactions-badge');
          expect(badge).toHaveTextContent('1');
          expect(badge).not.toHaveAttribute('data-degraded');
        },
        { timeout: 5000 },
      );
    } finally {
      randomSpy.mockRestore();
    }
  });
});

describe('InteractionsBadge — navigation + degraded state', () => {
  it('is a real link to the interactions view (keyboard-operable), not an inert div', async () => {
    const channel = makeChannel();
    const client = stubClient({
      channel,
      listInteractions: vi
        .fn()
        .mockResolvedValue(interactionsPage([pendingItem('a')], { total: 1 })),
    });
    renderWithProviders(<InteractionsBadge />, { client });
    await screen.findByTestId('interactions-badge');

    const badge = screen.getByTestId('interactions-badge');
    const link = within(badge).getByRole('link');
    // A real anchor carries an href (its resolved route), so it is focusable and
    // middle-clickable, not an inert status div.
    expect(link).toHaveAttribute('href');
    expect(link).toHaveAttribute('aria-label', expect.stringContaining('pending question'));
  });

  it('exposes a polite live region (role=status) so an arriving count is announced', async () => {
    const channel = makeChannel();
    const client = stubClient({
      channel,
      listInteractions: vi
        .fn()
        .mockResolvedValue(interactionsPage([pendingItem('a')], { total: 1 })),
    });
    renderWithProviders(<InteractionsBadge />, { client });
    await screen.findByTestId('interactions-badge');

    // The badge is a live region so a screen reader is notified as pending
    // questions arrive; its meaningful announced text is the link's label.
    const badge = screen.getByTestId('interactions-badge');
    expect(badge).toHaveAttribute('role', 'status');
    expect(within(badge).getByRole('link')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('1 pending question'),
    );
    // A healthy badge carries no degraded icon — the icon marks only the outage.
    expect(badge.querySelector('svg')).toBeNull();
  });

  it('does not degrade on a malformed frame while the stream stays connected', async () => {
    const channel = makeChannel();
    const client = stubClient({
      channel,
      listInteractions: vi
        .fn()
        .mockResolvedValue(interactionsPage([pendingItem('a')], { total: 1 })),
    });
    renderWithProviders(<InteractionsBadge />, { client });
    await screen.findByTestId('interactions-badge');
    // A parse error on a still-open stream is transient — the count is intact and the
    // stream is not disconnected, so the badge must keep its honest count, not flip.
    await emitFrame(channel, 'interaction.add', '{not json');

    const badge = screen.getByTestId('interactions-badge');
    expect(badge).not.toHaveAttribute('data-degraded');
    expect(within(badge).getByRole('link')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('1 pending question'),
    );
  });

  it('flips to a degraded indicator on a true outage (errored and disconnected), even at a stale zero', async () => {
    const client = {
      streamInteractions: vi.fn().mockRejectedValue(new Error('network down')),
      listInteractions: vi.fn().mockResolvedValue(interactionsPage([], { total: 0 })),
      answerInteraction: vi.fn().mockResolvedValue(undefined),
      listChannels: vi.fn().mockResolvedValue({ channels: [] }),
    } as unknown as ApiClient;
    renderWithProviders(<InteractionsBadge />, { client });
    await settle();

    // The connection dropped with nothing pending: the badge announces the outage
    // rather than vanishing or trusting a stale zero.
    const badge = screen.getByTestId('interactions-badge');
    expect(badge).toHaveAttribute('data-degraded', 'true');
    expect(within(badge).getByRole('link')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('disconnected'),
    );
    // WCAG 1.4.1: the outage is marked by an icon, not the warning tint alone.
    expect(badge.querySelector('svg')).not.toBeNull();
  });
});
