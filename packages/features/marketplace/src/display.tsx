/**
 * Listing display helpers: the title a listing shows (its `display_name`, or its
 * `name` titleized when the display name is null) and the small icon that sits
 * beside it — a rounded thumbnail when the registry serves a safe http(s)
 * `icon_url`, otherwise a generated monogram badge from the title's initials.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
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

/** The shared tile box: a fixed square with the tile corner, for both faces. */
function boxStyle(size: number): CSSProperties {
  return {
    width: size,
    height: size,
    flex: '0 0 auto',
    borderRadius: 'var(--tai-radius-tile)',
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
  // The URL that failed is remembered (not a bare flag) so a listing that later
  // serves a different icon gets a fresh attempt instead of the old failure.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (iconUrl !== null && isSafeHttpUrl(iconUrl) && iconUrl !== failedSrc) {
    // A safe URL can still 404, expire, or be blocked; `onError` falls back to
    // the monogram so a broken image never paints the browser's broken glyph.
    return (
      <img
        src={iconUrl}
        alt=""
        width={size}
        height={size}
        style={boxStyle(size)}
        onError={() => {
          setFailedSrc(iconUrl);
        }}
      />
    );
  }
  // A branded monogram tile: the accent tint ground and its on-tint ink — the
  // same pair every accent surface paints with — so the fallback reads as part
  // of the system rather than a grey placeholder. The `font:` shorthand is
  // avoided on purpose (it resets the line-height a text token carries); family,
  // size and weight sit on their own longhands.
  return (
    <span
      aria-hidden="true"
      style={{
        ...boxStyle(size),
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--tai-color-accent-tint)',
        color: 'var(--tai-color-accent-on-tint)',
        fontFamily: 'var(--tai-font-sans)',
        fontSize: 'var(--tai-text-md)',
        fontWeight: 600,
      }}
    >
      {monogramInitials(title)}
    </span>
  );
}
