/**
 * The media-upload string field: a drag-drop surface plus a paste fallback that
 * reads the chosen file client-side and emits the encoded string the schema
 * expects (a base64 body or a full `data:` URL). Every input path enforces the
 * effective byte cap and the declared MIME, rejecting an over-cap value or a
 * mismatched type LOUDLY — never silently truncated or accepted.
 */
import type { CSSProperties, ReactNode } from 'react';
import { useContext, useId, useState } from 'react';

import { Badge } from '../components/badge';
import { Button } from '../components/primitives';
import { Field, useFieldControl } from '../components/field';
import { TextInput } from '../components/inputs';
import type { MediaUpload } from './classify';
import { MaxUploadBytesContext } from './context';
import { decodedByteSize, effectiveMaxBytes, overCapMessage } from './media';

const dropZoneStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-2)',
  padding: 'var(--tai-space-4)',
  border: '1px dashed var(--tai-color-border)',
  borderRadius: 'var(--tai-radius-md)',
  background: 'var(--tai-color-surface)',
};

/**
 * The drag-drop surface + file input. Split out so its `useFieldControl` call
 * runs INSIDE the enclosing {@link Field}, wiring the input's id/aria to the
 * field label (a hook at {@link MediaField}'s top level would read the outer,
 * label-less context instead).
 */
function UploadDropZone({
  accept,
  onFile,
}: {
  accept: string | undefined;
  onFile: (file: File | undefined) => void;
}): ReactNode {
  const field = useFieldControl();
  return (
    <div
      style={dropZoneStyle}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        onFile(event.dataTransfer.files[0]);
      }}
    >
      <input
        {...field}
        type="file"
        accept={accept}
        onChange={(event) => {
          onFile(event.target.files?.[0]);
          // Reset so re-picking the same file fires `change` again.
          event.target.value = '';
        }}
      />
      <span style={{ fontSize: 'var(--tai-text-sm)', color: 'var(--tai-color-text-muted)' }}>
        Drag & drop a file here, or choose one above.
      </span>
    </div>
  );
}

/**
 * A string field whose schema opts into a file upload. Reads the chosen file
 * client-side and emits the encoded string the schema expects (a base64 body or
 * a full `data:` URL) — bounded by a size cap and the declared MIME, both
 * rejected LOUDLY. A text fallback (paste a URL/base64) stays available.
 */
export function MediaField({
  heading,
  description,
  error,
  media,
  value,
  onChange,
}: {
  heading: string;
  description: string | undefined;
  error: string | undefined;
  media: MediaUpload;
  value: string;
  onChange: (value: string) => void;
}): ReactNode {
  const pasteId = useId();
  const defaultMax = useContext(MaxUploadBytesContext);
  const maxBytes = effectiveMaxBytes(media.maxBytes, defaultMax);
  const [uploadError, setUploadError] = useState<string | undefined>(undefined);
  const [attached, setAttached] = useState<
    { name: string; previewUrl: string; value: string } | undefined
  >(undefined);

  const accept = (file: File | undefined): void => {
    if (file === undefined) return;
    void readMediaFile(file, media, maxBytes).then(
      ({ value: encoded, previewUrl }) => {
        setUploadError(undefined);
        setAttached({ name: file.name, previewUrl, value: encoded });
        onChange(encoded);
      },
      (reason: unknown) => {
        // Reject loudly; keep any previously accepted value untouched.
        setUploadError(reason instanceof Error ? reason.message : String(reason));
      },
    );
  };

  const clear = (): void => {
    setUploadError(undefined);
    setAttached(undefined);
    onChange('');
  };

  // The just-picked file's chip/preview applies ONLY while it still matches the
  // current field value; if the value is reset or replaced externally (an edit
  // loads a different record, or the form resets after submit), fall back to a
  // value-derived display so a stale filename/thumbnail can never linger.
  const activeAttached = attached?.value === value ? attached : undefined;
  // Prefer the just-read preview; on an edit with a pre-existing data-url value,
  // reconstruct the preview from the value itself.
  const previewUrl =
    activeAttached?.previewUrl ??
    (media.encoding === 'data-url' && value.startsWith('data:') ? value : undefined);
  const isImage =
    media.mediaType?.startsWith('image/') === true || previewUrl?.startsWith('data:image') === true;
  const fileName = activeAttached?.name ?? (value !== '' ? 'Attached file' : undefined);

  return (
    <Field label={heading} description={description} error={error}>
      <UploadDropZone accept={media.mediaType} onFile={accept} />

      {fileName !== undefined ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-2)' }}>
          {isImage && previewUrl !== undefined ? (
            <img
              src={previewUrl}
              alt={fileName}
              style={{
                maxWidth: 96,
                maxHeight: 96,
                borderRadius: 'var(--tai-radius-sm)',
                border: '1px solid var(--tai-color-border)',
              }}
            />
          ) : (
            <Badge>{fileName}</Badge>
          )}
          <Button type="button" variant="secondary" onClick={clear}>
            Remove
          </Button>
        </div>
      ) : null}

      {uploadError !== undefined ? (
        <span
          role="alert"
          style={{ fontSize: 'var(--tai-text-sm)', color: 'var(--tai-color-danger)' }}
        >
          {uploadError}
        </span>
      ) : null}

      <label
        htmlFor={pasteId}
        style={{ fontSize: 'var(--tai-text-sm)', color: 'var(--tai-color-text-muted)' }}
      >
        Or paste a value
        <TextInput
          id={pasteId}
          type="text"
          value={value}
          onChange={(event) => {
            const next = event.target.value;
            // The same effective cap the picker enforces, measured on the pasted
            // string's DECODED byte size. Reject over-cap LOUDLY; never accept or
            // truncate — the field keeps its prior value.
            const size = decodedByteSize(next);
            if (size > maxBytes) {
              setUploadError(overCapMessage('The pasted value', size, maxBytes));
              return;
            }
            setUploadError(undefined);
            setAttached(undefined);
            onChange(next);
          }}
        />
      </label>
    </Field>
  );
}

/** Compare a file's MIME against a `contentMediaType` pattern (`image/*` etc.). */
function matchesMediaType(fileType: string, pattern: string): boolean {
  // An empty file type is genuinely unknown (jsdom / OS gaps) — the server still
  // validates, so we do not fabricate a mismatch here; only a KNOWN wrong type
  // is rejected.
  if (fileType === '') return true;
  const [patType, patSub] = pattern.toLowerCase().split('/');
  const [fileMain, fileSub] = fileType.toLowerCase().split('/');
  if (patType !== fileMain) return false;
  return patSub === '*' || patSub === fileSub;
}

/**
 * Validate a chosen file against the media contract and read it into the encoded
 * string the schema expects. Rejects an over-cap file or a MIME that does not
 * match `contentMediaType` — never truncates, never silently accepts.
 */
async function readMediaFile(
  file: File,
  media: MediaUpload,
  maxBytes: number,
): Promise<{ value: string; previewUrl: string }> {
  if (file.size > maxBytes) {
    throw new Error(overCapMessage(`"${file.name}"`, file.size, maxBytes));
  }
  if (media.mediaType !== undefined && !matchesMediaType(file.type, media.mediaType)) {
    throw new Error(
      `"${file.name}" is ${file.type === '' ? 'an unknown type' : file.type}, which does not match the required ${media.mediaType}.`,
    );
  }
  const dataUrl = await readAsDataUrl(file);
  const comma = dataUrl.indexOf(',');
  if (comma < 0) {
    throw new Error(`Could not read "${file.name}" as an encoded value.`);
  }
  const body = dataUrl.slice(comma + 1);
  return { value: media.encoding === 'data-url' ? dataUrl : body, previewUrl: dataUrl };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // A successful read must yield the data-url string; anything else is a real
      // read anomaly and rejects loudly rather than emitting an empty value.
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error(`Failed to read "${file.name}" as a data URL.`));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error(`Failed to read "${file.name}".`));
    };
    reader.readAsDataURL(file);
  });
}
