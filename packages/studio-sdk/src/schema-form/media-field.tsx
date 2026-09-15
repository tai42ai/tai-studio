/**
 * The media-upload string field: a drag-drop surface plus a paste fallback that
 * reads the chosen file client-side and emits the encoded string the schema
 * expects (a base64 body or a full `data:` URL). Every input path enforces the
 * effective byte cap and the declared MIME, rejecting an over-cap value or a
 * mismatched type LOUDLY — never silently truncated or accepted.
 */
import type { ReactNode } from 'react';
import { useContext, useId, useState } from 'react';

import { Badge } from '../components/badge';
import { Field, type FieldControlProps, useFieldControl } from '../components/field';
import { XCircleIcon } from '../components/icons';
import { TextInput } from '../components/inputs';
import { Button } from '../components/primitives';
import { MaxUploadBytesContext } from './context';
import type { MediaUpload } from './field-model';
import { decodedByteSize, effectiveMaxBytes, overCapMessage } from './media';

/**
 * Add the upload error this module owns to the enclosing `Field`'s wiring.
 *
 * The upload error is raised by the input surfaces themselves rather than by the
 * schema, so `Field` cannot see it: without this the message was announced by
 * nothing and neither surface reported itself invalid. Used only where the
 * element is a bare `<input>`; the SDK's `TextInput` composes the field wiring
 * with the caller's own attributes itself, so the paste fallback states only the
 * error's id and lets it do the joining.
 */
function withUploadError(
  field: FieldControlProps,
  uploadErrorId: string | undefined,
): FieldControlProps {
  if (uploadErrorId === undefined) return field;
  const describedBy = field['aria-describedby'];
  return {
    ...field,
    'aria-describedby':
      describedBy === undefined ? uploadErrorId : `${describedBy} ${uploadErrorId}`,
    'aria-invalid': true,
  };
}

/**
 * The drag-drop surface + file input. Split out so its `useFieldControl` call
 * runs INSIDE the enclosing {@link Field}, wiring the input's id/aria to the
 * field label (a hook at {@link MediaField}'s top level would read the outer,
 * label-less context instead).
 */
function UploadDropZone({
  accept,
  uploadErrorId,
  onFile,
}: {
  accept: string | undefined;
  /** Set while an upload error stands, so the input points at it and reads invalid. */
  uploadErrorId: string | undefined;
  onFile: (file: File | undefined) => void;
}): ReactNode {
  const field = withUploadError(useFieldControl(), uploadErrorId);
  return (
    <div
      className="tai-card tai-stack tai-stack-2"
      // The dashed edge is the drop target's ONLY boundary, so it takes the
      // contrast-safe control border rather than the card's decorative one; the
      // card class still owns the ground, the radius and the padding.
      style={{ borderStyle: 'dashed', borderColor: 'var(--tai-color-control-border)' }}
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
      <span className="tai-field-hint">Drag &amp; drop a file here, or choose one above.</span>
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
  const uploadErrorId = useId();
  const defaultMax = useContext(MaxUploadBytesContext);
  const maxBytes = effectiveMaxBytes(media.maxBytes, defaultMax);
  const [uploadError, setUploadError] = useState<string | undefined>(undefined);
  const [attached, setAttached] = useState<AttachedMedia | undefined>(undefined);

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

  const { previewUrl, isImage, fileName } = mediaPreview(attached, value, media);

  return (
    <Field label={heading} description={description} error={error}>
      <UploadDropZone
        accept={media.mediaType}
        uploadErrorId={uploadError === undefined ? undefined : uploadErrorId}
        onFile={accept}
      />

      <AttachedPreview
        fileName={fileName}
        isImage={isImage}
        previewUrl={previewUrl}
        onClear={clear}
      />

      {uploadError !== undefined ? (
        <span id={uploadErrorId} role="alert" className="tai-field-error">
          <XCircleIcon />
          {uploadError}
        </span>
      ) : null}

      <MediaPasteInput
        pasteId={pasteId}
        value={value}
        maxBytes={maxBytes}
        uploadErrorId={uploadError === undefined ? undefined : uploadErrorId}
        onReject={setUploadError}
        onAccept={(next) => {
          setUploadError(undefined);
          setAttached(undefined);
          onChange(next);
        }}
      />
    </Field>
  );
}

/** The just-picked file, retained only while it still matches the current field value. */
interface AttachedMedia {
  name: string;
  previewUrl: string;
  value: string;
}

/**
 * The display derived from the attached file and the current value: the chip/preview
 * applies ONLY while the attachment still matches the value (an external reset or a
 * different record loading falls back to a value-derived display so a stale
 * filename/thumbnail can never linger); an existing data-url value reconstructs its
 * own preview.
 */
function mediaPreview(
  attached: AttachedMedia | undefined,
  value: string,
  media: MediaUpload,
): { previewUrl: string | undefined; isImage: boolean; fileName: string | undefined } {
  const activeAttached = attached?.value === value ? attached : undefined;
  const previewUrl =
    activeAttached?.previewUrl ??
    (media.encoding === 'data-url' && value.startsWith('data:') ? value : undefined);
  const isImage =
    media.mediaType?.startsWith('image/') === true || previewUrl?.startsWith('data:image') === true;
  const fileName = activeAttached?.name ?? (value !== '' ? 'Attached file' : undefined);
  return { previewUrl, isImage, fileName };
}

/** The attached-file chip: an image thumbnail when previewable, else a filename badge, plus Remove. */
function AttachedPreview({
  fileName,
  isImage,
  previewUrl,
  onClear,
}: {
  fileName: string | undefined;
  isImage: boolean;
  previewUrl: string | undefined;
  onClear: () => void;
}): ReactNode {
  if (fileName === undefined) return null;
  return (
    <div className="tai-row">
      {isImage && previewUrl !== undefined ? (
        <img
          src={previewUrl}
          alt={fileName}
          // A thumbnail is per-instance geometry: it is capped to a fixed height and
          // can never exceed the width it is given.
          style={{
            maxWidth: '100%',
            maxHeight: '6rem',
            borderRadius: 'var(--tai-radius-md)',
            border: '1px solid var(--tai-color-control-border)',
          }}
        />
      ) : (
        <Badge>{fileName}</Badge>
      )}
      <Button type="button" variant="secondary" onClick={onClear}>
        Remove
      </Button>
    </div>
  );
}

/**
 * The paste fallback: a text input that enforces the SAME effective byte cap the
 * picker does, measured on the pasted string's DECODED size. An over-cap paste is
 * rejected LOUDLY (`onReject`) and the field keeps its prior value; an accepted paste
 * clears any attachment and emits the new value (`onAccept`).
 */
function MediaPasteInput({
  pasteId,
  value,
  maxBytes,
  uploadErrorId,
  onReject,
  onAccept,
}: {
  pasteId: string;
  value: string;
  maxBytes: number;
  /** Set while an upload error stands, so the input points at it and reads invalid. */
  uploadErrorId: string | undefined;
  onReject: (message: string) => void;
  onAccept: (value: string) => void;
}): ReactNode {
  return (
    <label htmlFor={pasteId} className="tai-field">
      <span className="tai-field-hint">Or paste a value</span>
      <TextInput
        id={pasteId}
        type="text"
        // Only the upload error's id: `TextInput` joins it with the enclosing Field's
        // own description and error IDREFs rather than replacing them.
        aria-describedby={uploadErrorId}
        aria-invalid={uploadErrorId === undefined ? undefined : true}
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          const size = decodedByteSize(next);
          if (size > maxBytes) {
            onReject(overCapMessage('The pasted value', size, maxBytes));
            return;
          }
          onAccept(next);
        }}
      />
    </label>
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
