/**
 * `ExternalLinkButton` — an open-link action whose href is scheme-checked against
 * an http/https allow-list. A `javascript:`/`data:`/other-scheme URL is NOT
 * navigable: it is NEUTRALIZED, rendered as plain text (no anchor, no href), so a
 * hostile URL can never become a live navigation target. This is an XSS pin.
 */
import type { CSSProperties, ReactNode } from 'react';

/** True only for an absolute `http:`/`https:` URL. Everything else is unsafe. */
export function isSafeHttpUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:';
}

export interface ExternalLinkButtonProps {
  readonly url: string;
  readonly children?: ReactNode;
}

const baseStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
  padding: 'var(--tai-space-2) var(--tai-space-4)',
  borderRadius: 'var(--tai-radius-md)',
  font: 'var(--tai-text-md) var(--tai-font-sans)',
  border: '1px solid var(--tai-color-border)',
  background: 'var(--tai-color-surface-raised)',
  color: 'var(--tai-color-text)',
  textDecoration: 'none',
  cursor: 'pointer',
};

const neutralizedStyle: CSSProperties = {
  ...baseStyle,
  cursor: 'not-allowed',
  color: 'var(--tai-color-text-muted)',
};

export function ExternalLinkButton({ url, children }: ExternalLinkButtonProps) {
  const label = children ?? url;

  if (!isSafeHttpUrl(url)) {
    // Neutralized: plain text, never a navigable anchor.
    return (
      <span
        data-neutralized="true"
        title="This link was blocked because it is not an http(s) URL."
        style={neutralizedStyle}
      >
        {label}
      </span>
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer external" style={baseStyle}>
      {label}
    </a>
  );
}
