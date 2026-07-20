/**
 * Listing display helpers: the title a listing shows (its `display_name`, or its
 * `name` titleized when the display name is null) and the small icon that sits
 * beside it — a rounded thumbnail when the registry serves a safe http(s)
 * `icon_url`, otherwise a generated monogram badge from the title's initials.
 */
import type { CSSProperties, ReactNode } from 'react';
import { isSafeHttpUrl } from '@tai42/studio-sdk';

/** The title to show for a listing: its display name, or its name titleized. */
export function listingTitle(displayName: string | null, name: string): string {
  if (displayName !== null && displayName.trim() !== '') return displayName;
  const words = name
    .split(/[\s\-_]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.length > 0 ? words.join(' ') : name;
}

/** Up to two uppercase initials drawn from a title, for the monogram fallback. */
export function monogramInitials(title: string): string {
  const words = title
    .split(/[\s\-_]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
  if (words.length === 0) return '?';
  const initials = words.slice(0, 2).map((word) => word.charAt(0).toUpperCase());
  return initials.join('');
}

function boxStyle(size: number): CSSProperties {
  return {
    width: size,
    height: size,
    flex: '0 0 auto',
    borderRadius: 'var(--tai-radius-md)',
    objectFit: 'cover',
  };
}

/**
 * A listing's icon: the registry thumbnail when `iconUrl` is a safe http(s) URL,
 * otherwise a monogram badge built from `title`. The image is decorative (the
 * title renders as text beside it), so its `alt` is empty.
 */
export function ListingIcon({
  iconUrl,
  title,
  size = 40,
}: {
  readonly iconUrl: string | null;
  readonly title: string;
  readonly size?: number;
}): ReactNode {
  if (iconUrl !== null && isSafeHttpUrl(iconUrl)) {
    return <img src={iconUrl} alt="" width={size} height={size} style={boxStyle(size)} />;
  }
  return (
    <span
      aria-hidden="true"
      style={{
        ...boxStyle(size),
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--tai-color-surface)',
        color: 'var(--tai-color-text-muted)',
        font: 'var(--tai-text-md) var(--tai-font-sans)',
        fontWeight: 600,
      }}
    >
      {monogramInitials(title)}
    </span>
  );
}
