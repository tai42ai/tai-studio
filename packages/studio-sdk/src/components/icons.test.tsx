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
    // The paint is inherited from the frame, so a CHILD that names its own is
    // the way a hard-coded colour or an odd stroke weight actually gets in —
    // `<path fill="#F4718A">` on one shape is invisible to a root-only check and
    // ignores the reader's theme outright.
    for (const shape of svg.querySelectorAll('*')) {
      expect(shape.getAttribute('fill')).toBeNull();
      expect(shape.getAttribute('stroke')).toBeNull();
      expect(shape.getAttribute('stroke-width')).toBeNull();
    }
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

  it('exposes the icon as soon as the caller names it, with nothing else to pass', () => {
    // The form a caller reaches for naturally. A frame that hard-coded
    // `aria-hidden="true"` would leave this a named-but-hidden element — the
    // name unreachable, and no test anywhere failing — so the two supporting
    // attributes are derived from the name rather than demanded alongside it.
    const svg = renderIcon(iconModule.AlertTriangleIcon, { 'aria-label': 'Warning' });
    expect(svg.getAttribute('aria-hidden')).toBeNull();
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg).toHaveAccessibleName('Warning');
  });

  it('takes a name by reference too', () => {
    const { container } = render(
      <>
        <span id="warn-label">Warning</span>
        <iconModule.AlertTriangleIcon aria-labelledby="warn-label" />
      </>,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBeNull();
    expect(svg?.getAttribute('role')).toBe('img');
  });

  it('lets the caller expose the icon to assistive technology explicitly', () => {
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

  it('dashes the pending ring on a period that tiles its circumference', () => {
    // Asserted by ARITHMETIC rather than by pinning the pair, because the value
    // only means anything relative to the radius. A period that does not divide
    // 2πr closes the ring on a short seam — 3.2/3.2 fit 8.84 times at r = 9,
    // leaving a 2.15 gap that the inherited round linecap shrank to ~0.37 px at
    // 16 px, so one join read as solid in a ring of dashes.
    const svg = renderIcon(iconModule.PendingIcon);
    const ring = svg.querySelector('circle');
    const radius = Number(ring?.getAttribute('r'));
    const parts = (ring?.getAttribute('stroke-dasharray') ?? '').split(/[\s,]+/).map(Number);
    expect(parts).toHaveLength(2);
    const period = (parts[0] ?? Number.NaN) + (parts[1] ?? Number.NaN);
    expect(radius).toBeGreaterThan(0);
    expect(period).toBeGreaterThan(0);

    const periods = (2 * Math.PI * radius) / period;
    expect(Math.abs(periods - Math.round(periods))).toBeLessThan(0.005);
  });
});

describe('the sort pair', () => {
  /**
   * The three horizontal rows of a sort mark, top to bottom, as their widths.
   * A row is a `M<x> <y>h<width>` path; the arrow paths carry no `h` and are
   * skipped. Widths, not artwork: what the mark MEANS is whether the rows grow
   * or shrink downwards, and swapping the two icons' rows is invisible to a
   * check that only counts paths.
   */
  function rowWidths(Component: IconComponent): number[] {
    return [...renderIcon(Component).querySelectorAll('path')]
      .map((path) => /^M[\d.]+ ([\d.]+)h([\d.]+)$/.exec(path.getAttribute('d') ?? ''))
      .filter((match): match is RegExpExecArray => match !== null)
      .sort((a, b) => Number(a[1]) - Number(b[1]))
      .map((match) => Number(match[2]));
  }

  it('draws ascending as narrow-to-wide rows, matching its own name', () => {
    const widths = rowWidths(iconModule.SortAscIcon);
    expect(widths).toHaveLength(3);
    expect([...widths].sort((a, b) => a - b)).toEqual(widths);
  });

  it('draws descending as wide-to-narrow rows, matching its own name', () => {
    const widths = rowWidths(iconModule.SortDescIcon);
    expect(widths).toHaveLength(3);
    expect([...widths].sort((a, b) => b - a)).toEqual(widths);
  });

  it('is a genuine pair: the same rows, one order each way', () => {
    expect(rowWidths(iconModule.SortAscIcon)).toEqual(
      [...rowWidths(iconModule.SortDescIcon)].reverse(),
    );
  });

  /**
   * The arrowhead's apex and its two barbs, in SVG y (smaller is higher up).
   * The head is the one path of the form `M<bx> <by> <ax> <ay>l<dx> <dy>`: the
   * two absolute pairs are a barb and the apex, and the relative leg runs back
   * out to the second barb. The rows above carry `h` and the shaft carries `V`,
   * so neither can be mistaken for it — and exactly one match is demanded, so a
   * redrawn head fails loudly instead of emptying the check.
   */
  function arrowhead(Component: IconComponent): { apex: number; barbs: number[] } {
    const heads = [...renderIcon(Component).querySelectorAll('path')]
      .map((path) =>
        /^M([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)l\s*(-?[\d.]+)[\s,]*(-?[\d.]+)$/.exec(
          path.getAttribute('d') ?? '',
        ),
      )
      .filter((match): match is RegExpExecArray => match !== null);
    expect(heads).toHaveLength(1);
    const [, , barbY, , apexY, , legY] = [...(heads[0] ?? [])].map(Number);
    const apex = apexY ?? Number.NaN;
    return { apex, barbs: [barbY ?? Number.NaN, apex + (legY ?? Number.NaN)] };
  }

  // The rows say narrow-to-wide, but the ARROW is what a reader looks at first,
  // and it lives in the two paths `rowWidths` skips by construction — so the
  // three checks above stay green with the two arrows swapped and the ascending
  // mark pointing down. This pair shipped semantically swapped once already.
  it('points the ascending arrow up, the way its own rows grow', () => {
    const { apex, barbs } = arrowhead(iconModule.SortAscIcon);
    for (const barb of barbs) expect(apex).toBeLessThan(barb);
  });

  it('points the descending arrow down, the way its own rows shrink', () => {
    const { apex, barbs } = arrowhead(iconModule.SortDescIcon);
    for (const barb of barbs) expect(apex).toBeGreaterThan(barb);
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

it('renders every mark unchanged', () => {
  for (const [, Component] of ICONS) {
    const svg = renderIcon(Component);
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg).toHaveClass('tai-icon');
  }
});

it('keeps a caller-supplied accessible name', () => {
  const svg = renderIcon(NAV_ICONS.observability, {
    'aria-hidden': false,
    role: 'img',
    'aria-label': 'Observability',
  });
  expect(svg).toHaveAccessibleName('Observability');
});
