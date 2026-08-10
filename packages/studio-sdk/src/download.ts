/**
 * Stream a `Blob` (an export- or content-route response) to the user as a file
 * download via a transient object URL. The object URL is revoked on the next tick —
 * revoking it synchronously can cancel the download before the browser commits it.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
