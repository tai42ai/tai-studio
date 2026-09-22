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
      // The api-key user_id a contract-bearing recurring fire runs as; required with any door jq.
      execution_key?: string | null;
      // The optional door-layer state binding applied around every fire of this schedule.
      state_binding?: s.StateBinding | null;
      // The optional door-contract jqs a parkable-driving schedule carries: start_expr
      // builds the fired tool's kwargs, cancel/resume act on parked interactions, extras
      // builds the started run's extras.
      start_expr?: s.TemplatedText | null;
      cancel_expr?: s.TemplatedText | null;
      resume_expr?: s.TemplatedText | null;
      extras_expr?: s.TemplatedText | null;
    }) => req('/api/schedules', s.jsonValue, { method: 'POST', body }),
    deleteSchedule: (name: string) =>
      req(`/api/schedules/${encodeSegment(name)}`, s.jsonValue, { method: 'DELETE' }),
  };
}
