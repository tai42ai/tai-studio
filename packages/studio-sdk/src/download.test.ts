/**
 * The transient-object-URL file download. The anchor click is spied so jsdom does
 * not attempt (and log) a real navigation, while the real download wiring — the
 * object URL, the anchor's href/download, the click, and the deferred revoke — is
 * asserted exactly.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { downloadBlob } from './download';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('downloadBlob', () => {
  it('streams the blob through an anchor and revokes the url on the next tick', () => {
    vi.useFakeTimers();
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:xyz');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const appendChild = vi.spyOn(document.body, 'appendChild');

    const blob = new Blob(['payload'], { type: 'application/json' });
    downloadBlob(blob, 'trace-1.json');

    const anchor = appendChild.mock.calls
      .map((call) => call[0])
      .find((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement);

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledTimes(1);
    expect(anchor).toBeDefined();
    expect(anchor?.getAttribute('href')).toBe('blob:xyz');
    expect(anchor?.download).toBe('trace-1.json');
    // The anchor is detached again after the click — no stray node is left behind.
    expect(anchor?.isConnected).toBe(false);

    // Revoking synchronously can cancel the download, so it must be deferred.
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:xyz');
  });
});
