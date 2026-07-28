/**
 * The listing display helpers: the title fallback (display name, or the name
 * titleized), the monogram initials, and the icon that renders a safe thumbnail
 * or falls back to the monogram badge (an unsafe/absent URL never becomes an
 * image src).
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ListingIcon, listingTitle, monogramInitials } from './display';

describe('listingTitle', () => {
  it('uses the display name when present', () => {
    expect(listingTitle('Toolbox Pro', 'toolbox')).toBe('Toolbox Pro');
  });

  it('titleizes the name when the display name is null', () => {
    expect(listingTitle(null, 'my-great_plugin')).toBe('My Great Plugin');
  });

  it('titleizes when the display name is blank', () => {
    expect(listingTitle('   ', 'toolbox')).toBe('Toolbox');
  });

  it('falls back to the raw name when it has no word characters', () => {
    expect(listingTitle(null, '---')).toBe('---');
  });
});

describe('monogramInitials', () => {
  it('takes up to two uppercase initials', () => {
    expect(monogramInitials('Toolbox Pro Max')).toBe('TP');
  });

  it('returns a placeholder when there are no words', () => {
    expect(monogramInitials('   ')).toBe('?');
  });
});

describe('ListingIcon', () => {
  it('renders a thumbnail image for a safe http(s) url', () => {
    const { container } = render(
      <ListingIcon iconUrl="https://cdn.example/icon.png" title="Toolbox" />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', 'https://cdn.example/icon.png');
  });

  it('renders a monogram when the url is null', () => {
    const { container } = render(<ListingIcon iconUrl={null} title="Toolbox Pro" />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('TP')).toBeInTheDocument();
  });

  it('renders a monogram (never an image) for an unsafe url', () => {
    const { container } = render(<ListingIcon iconUrl="javascript:alert(1)" title="Toolbox" />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('T')).toBeInTheDocument();
  });

  it('renders the monogram on a branded tile: tile radius, token colours, no font shorthand', () => {
    render(<ListingIcon iconUrl={null} title="Toolbox Pro" />);
    const tile = screen.getByText('TP');
    const styleAttr = tile.getAttribute('style') ?? '';
    // The tile corner, not the generic md radius.
    expect(tile.style.borderRadius).toBe('var(--tai-radius-tile)');
    // Branded ground + ink from tokens (never a literal colour).
    expect(tile.style.background).toBe('var(--tai-color-accent-tint)');
    expect(tile.style.color).toBe('var(--tai-color-accent-on-tint)');
    // The banned `font:` shorthand resets the line-height a text token carries;
    // family/size/weight sit on their own longhands instead.
    expect(styleAttr).not.toMatch(/(?:^|;)\s*font\s*:/);
    expect(tile.style.fontFamily).toBe('var(--tai-font-sans)');
  });
});
