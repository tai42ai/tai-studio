/** Schedule listing and mutation sub-client. */
import { apiRoutes, buildPath } from '../generated/api-routes';
import * as s from '../schemas';
import type { Transport } from './transport';

export function schedulesClient(t: Transport) {
  const { req } = t;
  return {
    listSchedules: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_schedules.path, s.scheduleList, { signal }),
    getServerDateTime: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_schedules_server_datetime.path, s.serverDateTime, { signal }),
    // The body is the served `ScheduleCreate` document: the base tool, its kwargs, an optional
    // typed cadence (none runs the tool once now) and schedule name, the top-level subject,
    // the state binding, the execution key and the four door-contract jqs.
    addSchedule: (body: s.ScheduleCreate) =>
      req(apiRoutes.post_api_schedules.path, s.jsonValue, { method: 'POST', body }),
    deleteSchedule: (name: string) =>
      req(
        buildPath(apiRoutes.delete_api_schedules_schedule_name.path, { schedule_name: name }),
        s.jsonValue,
        { method: 'DELETE' },
      ),
  };
}
