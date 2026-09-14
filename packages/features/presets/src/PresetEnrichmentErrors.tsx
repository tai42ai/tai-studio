/**
 * The base picker's and kwargs hint's ENRICHMENT read failures, one line each. None
 * is load-bearing, so a failure keeps the form usable — but it must never degrade
 * SILENTLY (an unlabelled, ungrouped picker and a hintless kwargs box would read as
 * the truth about the deployment). Each line carries the ERROR mark so the hue is
 * never the only signal, and `.tai-field-error` wraps so a 320 px viewport never
 * widens on it.
 */
import type { ReactNode } from 'react';

import { Button, XCircleIcon, errorMessage } from '@tai42/studio-sdk';

import type { PresetToolCatalog } from './usePresetToolCatalog';

export function PresetEnrichmentErrors({
  catalog,
}: {
  readonly catalog: PresetToolCatalog;
}): ReactNode {
  const { tagsQuery, toolMetaQuery, agentsQuery, schemaQuery, enrichmentFailed, retryEnrichment } =
    catalog;
  if (!enrichmentFailed) return null;

  return (
    <div role="alert" className="tai-stack tai-stack-2">
      {tagsQuery.isError ? (
        <p className="tai-field-error" style={{ margin: 0 }}>
          <XCircleIcon />
          {`Tag grouping is unavailable: ${errorMessage(tagsQuery.error)}`}
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
