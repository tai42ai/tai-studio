/**
 * The compose dialog's create mutation: create the preset, then write any overlay
 * categorization tags (a post-create step — they live in the tool_meta overlay, not
 * the create body), and invalidate the presets + shared tools lists so the new
 * preset-tool appears.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { CreatePresetBody } from '@tai42/api-client';
import { isFeatureDisabled, toolsListKey, useApi } from '@tai42/studio-sdk';

import { authoredPresetsKey } from './keys';

export function useCreateComposedAgent(tags: string[], onClose: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: CreatePresetBody) => {
      const record = await api.createPreset(body);
      // Overlay categorization tags are NOT a create-body field — they live in the
      // tool_meta overlay, writable only once the composed agent's live tool exists.
      // Sequenced after the create so a failed tag write surfaces loudly through the
      // create error state; skipped when the operator entered none (an empty
      // merge-patch is rejected). A store-off refusal (501 `tool-meta-not-configured`)
      // is the ONE exception: the agent was created and OFF is a state, not an error.
      if (tags.length > 0) {
        try {
          await api.upsertToolMeta(record.name, { tags });
        } catch (err) {
          if (!isFeatureDisabled(err)) throw err;
        }
      }
      return record;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: authoredPresetsKey });
      // A composed agent binds a live preset-tool, so the shared registered-tool
      // master list must refetch for it to appear on the tools page without a refresh.
      void queryClient.invalidateQueries({ queryKey: toolsListKey });
      onClose();
    },
  });
}
