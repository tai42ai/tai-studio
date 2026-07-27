import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ExternalLinkButton, isSafeHttpUrl } from './external-link';

describe('isSafeHttpUrl', () => {
  it('accepts http and https', () => {
    expect(isSafeHttpUrl('http://example.com')).toBe(true);
    expect(isSafeHttpUrl('https://example.com/path?q=1')).toBe(true);
  });

  it('rejects javascript:, data:, and other schemes', () => {
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeHttpUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeHttpUrl('mailto:a@b.com')).toBe(false);
    expect(isSafeHttpUrl('not a url')).toBe(false);
    // Whitespace/control-char smuggling still resolves to the javascript scheme.
    expect(isSafeHttpUrl('  javascript:alert(1)')).toBe(false);
  });
});

describe('ExternalLinkButton', () => {
  it('renders a navigable anchor for an https URL', () => {
    render(<ExternalLinkButton url="https://example.com">Open</ExternalLinkButton>);
    const link = screen.getByRole('link', { name: 'Open' });
    expect(link).toHaveAttribute('href', 'https://example.com/');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveClass('tai-btn', 'tai-btn-secondary');
  });

  it('falls back to the url as its own label', () => {
    render(<ExternalLinkButton url="https://example.com/docs" />);
    expect(screen.getByRole('link', { name: 'https://example.com/docs' })).toBeInTheDocument();
  });

  it('NEUTRALIZES a javascript: URL — plain text, not a link, no href', () => {
    render(<ExternalLinkButton url="javascript:alert(1)">Click me</ExternalLinkButton>);
    // Not rendered as a navigable anchor.
    expect(screen.queryByRole('link')).toBeNull();
    const text = screen.getByText('Click me');
    expect(text.tagName).not.toBe('A');
    expect(text).not.toHaveAttribute('href');
    expect(text).toHaveAttribute('data-neutralized', 'true');
    expect(text).toHaveAttribute(
      'title',
      'This link was blocked because it is not an http(s) URL.',
    );
    // It wears the navigable form's classes, so the two cannot drift apart.
    expect(text).toHaveClass('tai-btn', 'tai-btn-secondary');
  });

  it.each(['/settings/api-keys', '?tab=admin', '#anchor', './relative'])(
    'NEUTRALIZES the relative reference %s, which Button alone would navigate in-app',
    (url) => {
      render(<ExternalLinkButton url={url}>Homepage</ExternalLinkButton>);
      expect(screen.queryByRole('link')).toBeNull();
      const text = screen.getByText('Homepage');
      expect(text.tagName).not.toBe('A');
      expect(text).toHaveAttribute('data-neutralized', 'true');
    },
  );

  it('NEUTRALIZES a data: URL', () => {
    render(
      <ExternalLinkButton url="data:text/html,<script>alert(1)</script>">
        payload
      </ExternalLinkButton>,
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('payload').tagName).not.toBe('A');
  });
});
