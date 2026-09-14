/**
 * Shared scaffolding for the interactions-stream tests: the scripted SSE client,
 * the wire-shape frame builders, the seed factory, and the `renderStream` harness
 * that mounts `useInteractionsStream` behind the API + unauthorized providers.
 */
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import type { ApiClient, Interaction, SseFrame } from '@tai42/api-client';

import { ApiProvider } from './useApi';
import { UnauthorizedProvider } from './useUnauthorized';
import { useInteractionsStream } from './useSse';

export function iterate(frames: SseFrame[]): AsyncGenerator<SseFrame> {
  async function* gen(): AsyncGenerator<SseFrame> {
    // Deliver each frame on a resolved microtask so the fake stream is genuinely
    // asynchronous, matching the real fetch/ReadableStream tail.
    for (const frame of frames) yield await Promise.resolve(frame);
  }
  return gen();
}

// The `interaction.add` wire shape (the live tail) — the full question.
export function addData(id: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    interaction_id: id,
    group_id: `g-${id}`,
    question: '',
    answer_format: 'text',
    format_payload: {},
    created_at: '2026-07-04T00:00:00Z',
    timeout_at: '2026-07-04T00:05:00Z',
    ...extra,
  });
}

// The `answered` / `removed` wire shape — ids only, no question fields.
export function idData(id: string): string {
  return JSON.stringify({ interaction_id: id, group_id: `g-${id}` });
}

export const add = (id: string): SseFrame => ({ event: 'interaction.add', data: addData(id) });
export const answered = (id: string): SseFrame => ({
  event: 'interaction.answered',
  data: idData(id),
});
export const removed = (id: string): SseFrame => ({
  event: 'interaction.removed',
  data: idData(id),
});

/** A pending record shaped like the paged base the door serves. */
export function seedItem(id: string, extra: Partial<Interaction> = {}): Interaction {
  return {
    interaction_id: id,
    group_id: `g-${id}`,
    question: '',
    answer_format: 'text',
    format_payload: {},
    created_at: '2026-07-04T00:00:00Z',
    timeout_at: '2026-07-04T00:05:00Z',
    sensitive: false,
    ...extra,
  };
}

export function scriptedClient(...batches: SseFrame[][]): ApiClient {
  const stream = vi.fn<(signal?: AbortSignal) => Promise<AsyncGenerator<SseFrame>>>();
  for (const batch of batches) stream.mockResolvedValueOnce(iterate(batch));
  // Any further reconnects yield an empty (already-drained) stream.
  stream.mockImplementation(() => Promise.resolve(iterate([])));
  return { streamInteractions: stream } as unknown as ApiClient;
}

export interface RenderOpts {
  readonly seed?: readonly Interaction[];
  readonly total?: number;
  readonly onResync?: () => boolean | Promise<boolean>;
  readonly onUnauthorized?: () => void;
}

export function renderStream(client: ApiClient, opts: RenderOpts = {}) {
  // The default models a resync whose refetch LANDED (true), so a (re)connect advances
  // the count epoch; a test drives the failed-refetch path by passing its own onResync.
  const onResync = opts.onResync ?? vi.fn(() => true);
  const wrapper = ({ children }: { children: ReactNode }) =>
    opts.onUnauthorized !== undefined ? (
      <ApiProvider value={client}>
        <UnauthorizedProvider value={opts.onUnauthorized}>{children}</UnauthorizedProvider>
      </ApiProvider>
    ) : (
      <ApiProvider value={client}>{children}</ApiProvider>
    );
  const view = renderHook(
    ({ seed, total }: { seed: readonly Interaction[]; total: number }) =>
      useInteractionsStream({ seed, total, onResync }),
    {
      wrapper,
      initialProps: { seed: opts.seed ?? [], total: opts.total ?? opts.seed?.length ?? 0 },
    },
  );
  return { ...view, onResync };
}

export async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
