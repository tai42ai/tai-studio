/**
 * The state-template catalog's upload door: reads a `.json` template document and PUTs
 * it. A first upload never overwrites — a name clash (409) surfaces a Replace confirm,
 * and only a confirm retries with replace=true. Every failure is a loud inline message.
 */
import { useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { errorMessage, useApi } from '@tai42/studio-sdk';
import { ApiError, type StateTemplateBody } from '@tai42/api-client';

import { stateTemplatesKey } from './keys';
import { readJsonObjectFile } from './readJsonObjectFile';

export interface PendingTemplateReplace {
  readonly name: string;
  readonly body: Record<string, unknown>;
}

export interface TemplateUpload {
  readonly uploadError: string | null;
  readonly pendingReplace: PendingTemplateReplace | null;
  readonly setPendingReplace: (value: PendingTemplateReplace | null) => void;
  readonly onFile: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  readonly putTemplate: (
    name: string,
    body: Record<string, unknown>,
    replace: boolean,
  ) => Promise<void>;
}

export function useTemplateUpload(): TemplateUpload {
  const api = useApi();
  const queryClient = useQueryClient();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingReplace, setPendingReplace] = useState<PendingTemplateReplace | null>(null);

  const putTemplate = async (
    name: string,
    body: Record<string, unknown>,
    replace: boolean,
  ): Promise<void> => {
    await api.putStateTemplate(name, body as unknown as StateTemplateBody, replace);
    await queryClient.invalidateQueries({ queryKey: stateTemplatesKey });
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    setUploadError(null);
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    try {
      const body = await readJsonObjectFile(file);
      const name = typeof body.name === 'string' ? body.name : '';
      if (name === '') throw new Error('This template document has no `name`.');
      try {
        await putTemplate(name, body, false);
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          setPendingReplace({ name, body });
          return;
        }
        throw error;
      }
    } catch (uploadErr) {
      setUploadError(errorMessage(uploadErr));
    }
  };

  return { uploadError, pendingReplace, setPendingReplace, onFile, putTemplate };
}
