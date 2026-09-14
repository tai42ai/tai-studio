/** Installed channel-plugin catalog response schema. */
import { z } from 'zod';

// The installed channel-plugin catalog: names registered via the manifest's
// channel modules. A deployment with none bound answers questions only in this
// inbox (the Studio default).

export const channels = z.object({
  channels: z.array(z.string()),
});
export type Channels = z.infer<typeof channels>;
