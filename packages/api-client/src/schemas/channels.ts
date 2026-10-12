/** Installed channel-plugin catalog response schema. */
import type { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';

// The installed channel-plugin catalog: names registered via the manifest's
// channel modules. A deployment with none bound answers questions only in this
// inbox (the Studio default).

export const channels = openapi.channelListing;
export type Channels = z.infer<typeof channels>;
