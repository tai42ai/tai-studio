/**
 * The states upload door: reads a `.json` state or state-template document and PUTs it
 * by its `kind`. A first upload never overwrites — a state-template name clash (409)
 * surfaces a Replace confirm the operator must accept; a state's 409 is a genuine
 * conflict (a narrowing over records, or a stranding kind removal) with no replace flag,
 * so it surfaces loudly. Every upload failure is a loud inline message, never swallowed.
 */
import { ApiError, type StateTemplateBody } from '@tai42/api-client';
import { errorMessage, useApi } from '@tai42/studio-sdk';
import { type ChangeEvent, useState } from 'react';

import { readJsonObjectFile } from './readJsonObjectFile';

/** A parsed upload awaiting a name-clash decision (a 409 the operator must confirm). */
export interface PendingReplace {
  readonly name: string;
  readonly document: 'state' | 'state-template';
  readonly body: Record<string, unknown>;
}

export interface StateUpload {
  readonly uploadError: string | null;
  readonly uploading: boolean;
  readonly pendingReplace: PendingReplace | null;
  readonly setPendingReplace: (value: PendingReplace | null) => void;
  readonly onFile: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  readonly putDocument: (
    document: 'state' | 'state-template',
    name: string,
    body: Record<string, unknown>,
    replace: boolean,
  ) => Promise<void>;
}

/** Resolve which document a parsed upload declares (or throw a loud message). */
function documentKind(body: Record<string, unknown>): {
  name: string;
  document: PendingReplace['document'];
} {
  const name = typeof body.name === 'string' ? body.name : '';
  if (name === '') throw new Error('This file has no `name`.');
  if (body.kind === 'state-template') return { name, document: 'state-template' };
  if (body.kind === 'state') return { name, document: 'state' };
  throw new Error('This file has no `kind` — expected state or state-template.');
}

export function useStateUpload({ onRefetch }: { onRefetch: () => Promise<unknown> }): StateUpload {
  const api = useApi();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingReplace, setPendingReplace] = useState<PendingReplace | null>(null);

  const putDocument = async (
    document: 'state' | 'state-template',
    name: string,
    body: Record<string, unknown>,
    replace: boolean,
  ): Promise<void> => {
    if (document === 'state-template') {
      await api.putStateTemplate(name, body as unknown as StateTemplateBody, replace);
    } else {
      // The declaration PUT is a plain upsert (no replace flag); it overwrites an
      // additive change and refuses a narrowing over records with a 409.
      await api.putState(name, {
        name,
        description: typeof body.description === 'string' ? body.description : '',
        schema: (body.schema as Record<string, unknown> | undefined) ?? {},
        subject_kinds: Array.isArray(body.subject_kinds) ? (body.subject_kinds as string[]) : [],
        default_subject_kind:
          typeof body.default_subject_kind === 'string' ? body.default_subject_kind : '',
        retention_days: typeof body.retention_days === 'number' ? body.retention_days : null,
      });
    }
    await onRefetch();
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    setUploadError(null);
    const file = event.target.files?.[0];
    // Reset the input so re-selecting the same file re-fires change.
    event.target.value = '';
    if (file === undefined) return;
    setUploading(true);
    try {
      const body = await readJsonObjectFile(file);
      const { name, document } = documentKind(body);
      try {
        await putDocument(document, name, body, false);
      } catch (error) {
        // Only a state-template document has a force-replace door (a 409 `template_exists`
        // the operator confirms). A state's 409 is a genuine conflict — surface it.
        if (error instanceof ApiError && error.status === 409 && document === 'state-template') {
          setPendingReplace({ name, document, body });
          return;
        }
        throw error;
      }
    } catch (error) {
      setUploadError(errorMessage(error));
    } finally {
      setUploading(false);
    }
  };

  return { uploadError, uploading, pendingReplace, setPendingReplace, onFile, putDocument };
}
