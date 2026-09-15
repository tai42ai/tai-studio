/**
 * The create form's submit feedback: a genuine create failure (400/409/5xx) is loud;
 * the dry-run verdict renders the server's valid/invalid message verbatim; and a
 * versioning-store-off refusal (501) shows a muted OFF note instead of a red alert.
 */
import {
  errorMessage,
  ErrorState,
  FeatureDisabled,
  featureDisabledMessage,
  isFeatureDisabled,
} from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import type { PresetMutations } from './usePresetMutations';
import { ValidateVerdict } from './verdict';

export function PresetSubmitFeedback({
  create,
  validate,
  versioningDisabled,
  versioningRefusal,
}: {
  readonly create: PresetMutations['create'];
  readonly validate: PresetMutations['validate'];
  readonly versioningDisabled: boolean;
  readonly versioningRefusal: PresetMutations['versioningRefusal'];
}): ReactNode {
  return (
    <>
      {/* A store-off refusal renders the muted OFF note below, never here: the red
          ErrorState is reserved for genuine create failures (400/409/5xx). */}
      {create.isError && !isFeatureDisabled(create.error) ? (
        <ErrorState message={errorMessage(create.error)} />
      ) : null}

      {/* Dry-run verdict: a request failure is loud; a store-off 501 is the muted OFF
          note below instead; otherwise the server's valid/invalid verdict renders. */}
      {validate.isError && !isFeatureDisabled(validate.error) ? (
        <ErrorState message={errorMessage(validate.error)} />
      ) : validate.data !== undefined ? (
        <ValidateVerdict valid={validate.data.valid} error={validate.data.error} />
      ) : null}

      {versioningDisabled ? (
        <FeatureDisabled
          feature="Preset versioning"
          message={featureDisabledMessage(versioningRefusal)}
        />
      ) : null}
    </>
  );
}
