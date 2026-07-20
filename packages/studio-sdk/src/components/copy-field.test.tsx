import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CopyField } from './copy-field';

function mockClipboard() {
  const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  return writeText;
}

describe('CopyField', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the value and an optional caption', () => {
    render(<CopyField value="tai_key_123" caption="Copy this key now." />);
    expect(screen.getByText('tai_key_123')).toBeInTheDocument();
    expect(screen.getByText('Copy this key now.')).toBeInTheDocument();
  });

  it('copies the value to the clipboard and flips to the copied state', async () => {
    const user = userEvent.setup();
    const writeText = mockClipboard();
    render(<CopyField value="tai_key_123" />);

    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(writeText).toHaveBeenCalledWith('tai_key_123');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('renders a value containing <script> as escaped TEXT, never an element (XSS pin)', () => {
    const payload = '<script>alert(1)</script>';
    const { container } = render(<CopyField value={payload} />);
    expect(screen.getByText(payload)).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
  });
});
