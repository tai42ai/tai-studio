import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import * as iconModule from './icons';
import { NAV_ICONS, type IconComponent } from './icons';

/**
 * The suite is driven off the module's own exports, so a newly added icon is
 * picked up by every contract check automatically and cannot slip through
 * untested. Assertions target the CONTRACT (grid, paint, a11y defaults,
 * overridability, route coverage, mark uniqueness) rather than the artwork.
 */
const ICONS: readonly (readonly [string, IconComponent])[] = Object.entries(iconModule)
  .filter((entry): entry is [string, IconComponent] => entry[0].endsWith('Icon'))
  .sort((a, b) => a[0].localeCompare(b[0]));

const ROUTE_TOKENS = [
  'observability',
  'tools',
  'agents',
  'presets',
  'extensions',
  'templates',
  'connectors',
  'hooks',
  'storage',
  'scheduling',
  'interactions',
  'notifications',
  'marketplace',
  'manifest',
  'settings',
  'system',
] as const;

/** Renders an icon and returns its root `<svg>`, failing loudly if it drew nothing. */
function renderIcon(Component: IconComponent, props: Record<string, unknown> = {}): SVGSVGElement {
  const { container } = render(<Component {...props} />);
  const svg = container.querySelector('svg');
  if (svg === null) throw new Error('icon rendered no <svg> root');
  return svg;
}

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
});

/**
 * The marks the design system PINS by name: the sixteen route marks plus the
 * shell, theme, control and status sets. Deleting or renaming any of them breaks
 * a screen that names it, so the inventory is asserted explicitly rather than by
 * counting whatever the module happens to export.
 */
const REQUIRED_ICONS = [
  'DashboardIcon',
  'ToolsIcon',
  'AgentsIcon',
  'PresetsIcon',
  'ExtensionsIcon',
  'TemplatesIcon',
  'ConnectorsIcon',
  'HooksIcon',
  'StorageIcon',
  'SchedulingIcon',
  'InteractionsIcon',
  'NotificationsIcon',
  'MarketplaceIcon',
  'ManifestIcon',
  'SettingsIcon',
  'SystemIcon',
  'SearchIcon',
  'SignOutIcon',
  'MenuIcon',
  'CloseIcon',
  'SunIcon',
  'MoonIcon',
  'MonitorIcon',
  'CopyIcon',
  'ExternalLinkIcon',
  'ChevronDownIcon',
  'ChevronRightIcon',
  'CheckIcon',
  'SortAscIcon',
  'SortDescIcon',
  'FilterIcon',
  'ArrowLeftIcon',
  'EyeIcon',
  'EyeOffIcon',
  'CheckCircleIcon',
  'AlertTriangleIcon',
  'XCircleIcon',
  'PendingIcon',
] as const;

describe('icon set', () => {
  it.each(REQUIRED_ICONS)('exports %s', (name) => {
    expect(Object.keys(iconModule)).toContain(name);
  });

  it.each(ICONS)('%s renders an svg on the shared 24 grid', (_name, Component) => {
    const svg = renderIcon(Component);
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('fill')).toBe('none');
  });

  it.each(ICONS)('%s paints in currentColor at the shared stroke weight', (_name, Component) => {
    const svg = renderIcon(Component);
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('stroke-width')).toBe('1.6');
    expect(svg.getAttribute('stroke-linecap')).toBe('round');
    expect(svg.getAttribute('stroke-linejoin')).toBe('round');
  });

  it.each(ICONS)('%s is decorative and 16 px by default', (_name, Component) => {
    const svg = renderIcon(Component);
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg).toHaveClass('tai-icon');
  });

  it.each(ICONS)('%s draws at least one shape', (_name, Component) => {
    const svg = renderIcon(Component);
    expect(svg.querySelectorAll('path, circle, ellipse, rect').length).toBeGreaterThan(0);
  });

  it.each(ICONS)('%s never dims itself with opacity', (_name, Component) => {
    const svg = renderIcon(Component);
    expect(svg.getAttribute('opacity')).toBeNull();
    expect(svg.style.opacity).toBe('');
    for (const shape of svg.querySelectorAll('*')) {
      expect(shape.getAttribute('opacity')).toBeNull();
      expect(shape.getAttribute('fill-opacity')).toBeNull();
      expect(shape.getAttribute('stroke-opacity')).toBeNull();
    }
  });

  it('draws a distinct mark for every icon', () => {
    const geometry = new Map<string, string>();
    for (const [name, Component] of ICONS) {
      const signature = renderIcon(Component).innerHTML;
      const clash = geometry.get(signature);
      expect(clash, `${name} draws the same geometry as ${clash ?? '(none)'}`).toBeUndefined();
      geometry.set(signature, name);
    }
    expect(geometry.size).toBe(ICONS.length);
  });
});

describe('icon props', () => {
  it('lets the caller replace the default class', () => {
    const svg = renderIcon(iconModule.SearchIcon, { className: 'my-icon' });
    expect(svg).toHaveClass('my-icon');
    expect(svg).not.toHaveClass('tai-icon');
  });

  it('lets the caller expose the icon to assistive technology', () => {
    const svg = renderIcon(iconModule.AlertTriangleIcon, {
      'aria-hidden': false,
      role: 'img',
      'aria-label': 'Warning',
    });
    expect(svg.getAttribute('aria-hidden')).toBe('false');
    expect(svg).toHaveAccessibleName('Warning');
  });

  it('passes arbitrary SVG props through', () => {
    const svg = renderIcon(iconModule.CheckIcon, {
      'data-testid': 'tick',
      focusable: 'false',
      style: { width: 24 },
    });
    expect(svg.getAttribute('data-testid')).toBe('tick');
    expect(svg.getAttribute('focusable')).toBe('false');
    expect(svg.style.width).toBe('24px');
  });

  it('uses stroke-dasharray for the pending ring', () => {
    const svg = renderIcon(iconModule.PendingIcon);
    const ring = svg.querySelector('circle');
    expect(ring?.getAttribute('stroke-dasharray')).toBe('3.2 3.2');
  });
});

describe('NAV_ICONS', () => {
  it('covers every route token except login', () => {
    expect(Object.keys(NAV_ICONS).sort()).toEqual([...ROUTE_TOKENS].sort());
    expect(Object.keys(NAV_ICONS)).not.toContain('login');
  });

  it.each(ROUTE_TOKENS)('maps %s to an exported icon component', (token) => {
    const Component = NAV_ICONS[token];
    expect(ICONS.map(([, component]) => component)).toContain(Component);
    expect(renderIcon(Component).tagName.toLowerCase()).toBe('svg');
  });

  it('gives every route a different mark', () => {
    const marks = new Set(Object.values(NAV_ICONS));
    expect(marks.size).toBe(ROUTE_TOKENS.length);
  });
});

describe.each(['light', 'dark'] as const)('under the %s theme', (theme) => {
  it('renders every mark unchanged', () => {
    document.documentElement.setAttribute('data-theme', theme);
    for (const [, Component] of ICONS) {
      const svg = renderIcon(Component);
      expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
      expect(svg.getAttribute('stroke')).toBe('currentColor');
      expect(svg).toHaveClass('tai-icon');
    }
  });

  it('keeps a caller-supplied accessible name', () => {
    document.documentElement.setAttribute('data-theme', theme);
    const svg = renderIcon(NAV_ICONS.observability, {
      'aria-hidden': false,
      role: 'img',
      'aria-label': 'Observability',
    });
    expect(svg).toHaveAccessibleName('Observability');
  });
});
