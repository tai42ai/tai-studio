/** The client's refusal readers recognise the errors that same client throws: a refused
 *  call through an injected `fetch` is read back through the client's own members. */
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from './client';

const holder = {
  kind: 'hook',
  tag: 'hooks',
  name: 'h',
  locator: { hook: 'h' },
  summary: "hook 'h' names 'p'",
};

function clientAnswering(status: number, body: unknown) {
  const fetchImpl = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  );
  return createApiClient({ getToken: () => 'k', fetch: fetchImpl });
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('the call resolved; a refusal was expected');
}

describe('client refusal readers', () => {
  it('reads the holders of a 409 this client raised', async () => {
    const client = clientAnswering(409, {
      error: "preset 'p' cannot be deleted — held by:\nhook 'h' names 'p'",
      holders: [holder],
    });
    const error = await rejectionOf(client.deletePreset('p'));
    expect(client.holdersFromError(error)).toEqual([holder]);
    expect(client.storedPresetFaultFromError(error)).toBeNull();
  });

  it('reads the stored preset of a stored-preset-unreadable 500 this client raised', async () => {
    const client = clientAnswering(500, {
      error: "stored preset 'nightly' cannot be read",
      code: 'stored-preset-unreadable',
      preset: 'nightly',
    });
    const error = await rejectionOf(client.listPresets());
    expect(client.storedPresetFaultFromError(error)).toBe('nightly');
    expect(client.holdersFromError(error)).toBeNull();
  });

  it('answers null for an error no client raised', () => {
    const client = createApiClient({ getToken: () => null });
    expect(client.holdersFromError(new Error('boom'))).toBeNull();
    expect(client.storedPresetFaultFromError(new Error('boom'))).toBeNull();
  });
});
