/** Schedule listing and server-clock response schemas. */
import { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';
import { jsonValue } from './shared';

// The listing is the generated `ScheduleListRow` array the server publishes (name, tool,
// typed cadence, enabled, next run, an optional backend error — never tool arguments).
export const scheduleList = openapi.scheduleListResponse;

export const serverDateTime = z
  .object({
    utc: jsonValue,
    local: jsonValue.optional(),
    system: jsonValue.optional(),
  })
  .loose();
