/** Installed channel-plugin catalog sub-client. */
import * as s from '../schemas';
import type { Transport } from './transport';

export function channelsClient(t: Transport) {
  const { req } = t;
  return {
    // The installed channel-plugin names (delivery media for ask questions).
    listChannels: (signal?: AbortSignal) => req('/api/channels', s.channels, { signal }),
  };
}
