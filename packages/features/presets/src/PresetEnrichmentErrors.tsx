/**
 * The base picker's and kwargs hint's ENRICHMENT read failures, one line each. None
 * is load-bearing, so a failure keeps the form usable — but it must never degrade
 * SILENTLY (an unlabelled, ungrouped picker and a hintless kwargs box would read as
 * the truth about the deployment). A failed tags read also costs the description search,
 * so while the base picker draws its search, the tags line says the tool search matches
 * tool names only. A pending, failed, refused or empty tools read, or a failed preset
 * read, puts no picker search on screen, so the line then names only the lost grouping.
 * Each line carries the ERROR mark so the hue is
 * never the only signal, and `.tai-field-error` wraps so a 320 px viewport never
 * widens on it.
 */
import {
  Button,
  errorMessage,
  TOOL_SEARCH_NAMES_ONLY_NOTE,
  toolSearchShown,
  XCircleIcon,
} from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import type { PresetToolCatalog } from './usePresetToolCatalog';

export function PresetEnrichmentErrors({
  catalog,
  base,
}: {
  readonly catalog: PresetToolCatalog;
  /** The base picker's value, `null` for none. */
  readonly base: string | null;
}): ReactNode {
  const {
    toolsQuery,
    presetsQuery,
    tagsQuery,
    toolMetaQuery,
    agentsQuery,
    schemaQuery,
    enrichmentFailed,
    retryEnrichment,
  } = catalog;
  if (!enrichmentFailed) return null;
  const searchShown =
    !presetsQuery.isError &&
    toolSearchShown({ query: toolsQuery, value: base, excludeNames: catalog.excludeNames });

  return (
    <div role="alert" className="tai-stack tai-stack-2">
      {tagsQuery.isError ? (
        <p className="tai-field-error" style={{ margin: 0 }}>
          <XCircleIcon />
          {`Tag grouping is unavailable: ${errorMessage(tagsQuery.error)}${searchShown ? `. ${TOOL_SEARCH_NAMES_ONLY_NOTE}` : ''}`}
        </p>
      ) : null}
      {toolMetaQuery.isError ? (
        <p className="tai-field-error" style={{ margin: 0 }}>
          <XCircleIcon />
          {`Overlay tags are unavailable: ${errorMessage(toolMetaQuery.error)}`}
        </p>
      ) : null}
      {agentsQuery.isError ? (
        <p className="tai-field-error" style={{ margin: 0 }}>
          <XCircleIcon />
          {`Agent labelling is unavailable: ${errorMessage(agentsQuery.error)}`}
        </p>
      ) : null}
      {schemaQuery.isError ? (
        <p className="tai-field-error" style={{ margin: 0 }}>
          <XCircleIcon />
          {`Base tool input names are unavailable: ${errorMessage(schemaQuery.error)}`}
        </p>
      ) : null}
      <div>
        <Button type="button" onClick={retryEnrichment}>
          Retry
        </Button>
      </div>
    </div>
  );
}
