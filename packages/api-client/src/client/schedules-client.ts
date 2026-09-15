/** Schedule listing and mutation sub-client. */
import { encodeSegment } from '../http';
import * as s from '../schemas';
import type { Transport } from './transport';

export function schedulesClient(t: Transport) {
  const { req } = t;
  return {
    listSchedules: (signal?: AbortSignal) => req('/api/schedules', s.scheduleList, { signal }),
    getServerDateTime: (signal?: AbortSignal) =>
      req('/api/schedules/server-datetime', s.serverDateTime, { signal }),
    addSchedule: (body: {
      tool_name: string;
      tool_kwargs: Record<string, unknown>;
      schedule_kwargs: Record<string, unknown>;
      // The optional door-layer state binding applied around every fire of this schedule.
      state_binding?: s.StateBinding | null;
    }) => req('/api/schedules', s.jsonValue, { method: 'POST', body }),
    deleteSchedule: (name: string) =>
      req(`/api/schedules/${encodeSegment(name)}`, s.jsonValue, { method: 'DELETE' }),
  };
}
