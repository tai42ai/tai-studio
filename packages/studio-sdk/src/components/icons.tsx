/**
 * The design system's icon set — the ONLY sanctioned source of iconography in
 * Studio (Unicode glyphs as icons are banned).
 *
 * Every mark is hand-authored inline SVG on a 24-unit grid with ~2 units of
 * optical padding, drawn stroke-only in `currentColor` at a uniform 1.6 stroke.
 * Because the paint is `currentColor` an icon inherits the ink of whatever it
 * sits in — a token color at FULL opacity, never a dimmed one; to mute an icon,
 * mute the surrounding text color, never the icon's alpha.
 *
 * Sizing is owned by the `tai-icon` class (16 px square, no shrink), which every
 * icon applies unconditionally. A caller-supplied `className` is APPENDED to it,
 * the way every other design-system primitive treats the prop — an inline `<svg>`
 * with a `viewBox` and no width/height has no intrinsic size, so a `className`
 * that replaced `tai-icon` would not make the mark slightly wrong, it would blow
 * it up to the replaced-element default.
 *
 * Icons are decorative by default (`aria-hidden="true"`): they accompany a text
 * label or sit inside a control that carries its own accessible name. An icon
 * that is the ONLY carrier of meaning is given a name by the caller —
 * `<AlertTriangleIcon aria-label="Warning" />` — and NAMING IT IS ENOUGH: the
 * frame derives the other two attributes from the name, so `aria-hidden` is
 * dropped and `role="img"` supplied. A name and `aria-hidden` can therefore
 * never ship together by omission. Both derived attributes are still
 * overridable through the prop spread, and the older explicit three-prop form
 * (`aria-hidden={false} role="img" aria-label="…"`) keeps working unchanged.
 *
 * {@link NAV_ICONS} is PUBLISHED SURFACE: the canonical route-token → icon
 * mapping, exported so a navigation surface renders the agreed mark for a route
 * instead of choosing one. Studio's own shell renders its nav as text and reads
 * none of it; the map is exhaustive over {@link RouteToken} regardless, so a new
 * route fails the build here until it has a mark.
 */
import type { ReactElement, SVGProps } from 'react';

import type { RouteToken } from '../navigation/types';

/**
 * Props of every icon: the full SVG surface, so `style`, events and ARIA pass
 * through. `className` is APPENDED to the `tai-icon` sizing class rather than
 * replacing it — the same merge every other design-system primitive does.
 */
export type IconProps = SVGProps<SVGSVGElement>;

/** The shape every exported icon satisfies. */
export type IconComponent = (props: IconProps) => ReactElement;

/**
 * The shared frame every mark is drawn in. Defaults are declared BEFORE the prop
 * spread so a caller can override any of them, while `className` is destructured
 * out of the spread so the caller's class is merged with `tai-icon` instead of
 * replacing it.
 *
 * The accessibility defaults are DERIVED from whether the caller gave the icon a
 * name rather than fixed. A hard-coded `aria-hidden="true"` is not self-serving:
 * it makes `<Icon aria-label="Warning" />` — the form a caller naturally reaches
 * for — a named-but-hidden element, which exposes nothing and fails nowhere. So
 * `aria-hidden` is emitted only for an icon with NO accessible name, and an icon
 * that has one is given the `role="img"` that makes the name reachable.
 */
function Icon({ className, children, ...props }: IconProps): ReactElement {
  const named = props['aria-label'] !== undefined || props['aria-labelledby'] !== undefined;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={named ? undefined : 'true'}
      role={named ? 'img' : undefined}
      className={className === undefined ? 'tai-icon' : `tai-icon ${className}`}
      {...props}
    >
      {children}
    </svg>
  );
}

// -- Navigation marks (one per Studio route) ---------------------------------

/** Observability: a dial gauge — arc, base and needle. */
export const DashboardIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M3 17.5a9 9 0 0 1 18 0" />
    <path d="M3 17.5h18" />
    <path d="M12 17.5 16.4 11.9" />
  </Icon>
);

/** Tools: an open-ended spanner over its handle. */
export const ToolsIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M14.6 6.2a1 1 0 0 0 0 1.5l1.7 1.7a1 1 0 0 0 1.5 0l3.2-3.2a5.9 5.9 0 0 1-7.4 7.4l-6.8 6.8a2.1 2.1 0 0 1-3-3l6.8-6.8a5.9 5.9 0 0 1 7.4-7.4z" />
  </Icon>
);

/** Agents: a bot — antenna, panel head with eyes and mouth, side ports. */
export const AgentsIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M12 4.6V7.4" />
    <circle cx="12" cy="3.2" r="1.4" />
    <rect x="4.4" y="7.4" width="15.2" height="12.4" rx="3" />
    <path d="M2.6 12.6v2.8" />
    <path d="M21.4 12.6v2.8" />
    <path d="M9.2 11.6v1.8" />
    <path d="M14.8 11.6v1.8" />
    <path d="M9.6 16.6h4.8" />
  </Icon>
);

/** Presets: three sliders, each with its knob at a different stop. */
export const PresetsIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M3 6.8h6.5" />
    <path d="M13.5 6.8H21" />
    <circle cx="11.5" cy="6.8" r="2" />
    <path d="M3 12h10.5" />
    <path d="M17.5 12H21" />
    <circle cx="15.5" cy="12" r="2" />
    <path d="M3 17.2h4.5" />
    <path d="M11.5 17.2H21" />
    <circle cx="9.5" cy="17.2" r="2" />
  </Icon>
);

/** Extensions: a jigsaw piece — knob above, socket to the right. */
export const ExtensionsIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M9.5 6.5a2.2 2.2 0 0 1 4.4 0v.7h4.3a1.3 1.3 0 0 1 1.3 1.3v3.4H18a2.2 2.2 0 0 0 0 4.4h1.5v2.8a1.3 1.3 0 0 1-1.3 1.3H5.8a1.3 1.3 0 0 1-1.3-1.3V8.5a1.3 1.3 0 0 1 1.3-1.3h3.7z" />
  </Icon>
);

/** Templates: a stack of two sheets, the front one offset. */
export const TemplatesIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M8 8V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-3" />
    <rect x="3" y="8" width="13" height="13" rx="2" />
  </Icon>
);

/** Connectors: a two-pin power plug on its lead. */
export const ConnectorsIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M9 3v5" />
    <path d="M15 3v5" />
    <path d="M6.5 8h11v3.5a5.5 5.5 0 0 1-11 0z" />
    <path d="M12 17v4" />
  </Icon>
);

/** Hooks: a webhook fan-out — one source branching to two subscribers. */
export const HooksIcon: IconComponent = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="5.8" r="2.6" />
    <circle cx="5.4" cy="18.2" r="2.6" />
    <circle cx="18.6" cy="18.2" r="2.6" />
    <path d="M10.7 8.1 6.7 15.9" />
    <path d="M13.3 8.1 17.3 15.9" />
    <path d="M8 18.2h8" />
  </Icon>
);

/** Storage: a database cylinder with two shelves. */
export const StorageIcon: IconComponent = (props) => (
  <Icon {...props}>
    <ellipse cx="12" cy="6" rx="7.5" ry="3" />
    <path d="M4.5 6v12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V6" />
    <path d="M4.5 12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3" />
  </Icon>
);

/** Scheduling: a calendar grid with its binding posts. */
export const SchedulingIcon: IconComponent = (props) => (
  <Icon {...props}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18" />
    <path d="M8 3v4" />
    <path d="M16 3v4" />
    <path d="M7.6 14h.01" />
    <path d="M12 14h.01" />
    <path d="M16.4 14h.01" />
    <path d="M7.6 17.6h.01" />
    <path d="M12 17.6h.01" />
  </Icon>
);

/** Interactions: two overlapping speech bubbles — a conversation. */
export const InteractionsIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M4.5 3h7a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H8l-3 3v-3h-.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
    <path d="M12.5 9h7a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H19v3l-3-3h-3.5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2z" />
  </Icon>
);

/** Notifications: a bell with its clapper. */
export const NotificationsIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M18 8.5a6 6 0 0 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5z" />
    <path d="M13.7 19a2 2 0 0 1-3.4 0" />
  </Icon>
);

/** Conversations: one speech bubble holding transcript lines. */
export const ConversationsIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V16h-1A2.5 2.5 0 0 1 4 13.5z" />
    <path d="M8 7.5h8" />
    <path d="M8 10.5h8" />
    <path d="M8 13.5h4" />
  </Icon>
);

/** Marketplace: a shopping bag. */
export const MarketplaceIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M4.6 8h14.8l-1 12.1a1 1 0 0 1-1 .9H6.6a1 1 0 0 1-1-.9L4.6 8z" />
    <path d="M8.5 11V6.6a3.5 3.5 0 0 1 7 0V11" />
  </Icon>
);

/** Manifest: a document with a folded corner and its entries. */
export const ManifestIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M13.5 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8.5z" />
    <path d="M13.5 3v5.5H19" />
    <path d="M8.5 12.5h7" />
    <path d="M8.5 16.5h7" />
    <path d="M8.5 8.5h2" />
  </Icon>
);

/** Settings: an eight-tooth cog around its bore. */
export const SettingsIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M9.5 5.9 10.3 3.2 13.7 3.2 14.5 5.9 17 4.5 19.5 7 18.1 9.5 20.8 10.3 20.8 13.7 18.1 14.5 19.5 17 17 19.5 14.5 18.1 13.7 20.8 10.3 20.8 9.5 18.1 7 19.5 4.5 17 5.9 14.5 3.2 13.7 3.2 10.3 5.9 9.5 4.5 7 7 4.5Z" />
    <circle cx="12" cy="12" r="3.2" />
  </Icon>
);

/** System: a processor die with its pins. */
export const SystemIcon: IconComponent = (props) => (
  <Icon {...props}>
    <rect x="6.5" y="6.5" width="11" height="11" rx="1.6" />
    <rect x="9.8" y="9.8" width="4.4" height="4.4" rx="1" />
    <path d="M9.5 3v3.5" />
    <path d="M14.5 3v3.5" />
    <path d="M9.5 17.5V21" />
    <path d="M14.5 17.5V21" />
    <path d="M3 9.5h3.5" />
    <path d="M3 14.5h3.5" />
    <path d="M17.5 9.5H21" />
    <path d="M17.5 14.5H21" />
  </Icon>
);

// -- Chrome ------------------------------------------------------------------

/** A magnifier. */
export const SearchIcon: IconComponent = (props) => (
  <Icon {...props}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.3 15.3 20.5 20.5" />
  </Icon>
);

/** Sign out: a door with an outbound arrow. */
export const SignOutIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M9.5 20.5H5.5A1.5 1.5 0 0 1 4 19V5a1.5 1.5 0 0 1 1.5-1.5h4" />
    <path d="M15.5 16.5 20 12l-4.5-4.5" />
    <path d="M20 12H9.5" />
  </Icon>
);

/** The three-bar menu / drawer toggle. */
export const MenuIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M3.5 6.5h17" />
    <path d="M3.5 12h17" />
    <path d="M3.5 17.5h17" />
  </Icon>
);

/** Dismiss. */
export const CloseIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M5.5 5.5 18.5 18.5" />
    <path d="M18.5 5.5 5.5 18.5" />
  </Icon>
);

/** A funnel. */
export const FilterIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M3.5 5h17l-6.6 7.8V19l-3.8 2v-8.2z" />
  </Icon>
);

/** Back / previous. */
export const ArrowLeftIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M20 12H4.5" />
    <path d="M11 5 4 12l7 7" />
  </Icon>
);

/** Move the item one place earlier in an ordered list. */
export const ArrowUpIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M12 20V4.5" />
    <path d="M5 11 12 4l7 7" />
  </Icon>
);

/** Move the item one place later in an ordered list. */
export const ArrowDownIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M12 4v15.5" />
    <path d="M5 13 12 20l7-7" />
  </Icon>
);

/** Expand / collapse affordance. */
export const ChevronDownIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M5.5 9 12 15.5 18.5 9" />
  </Icon>
);

/** Disclosure / breadcrumb separator. */
export const ChevronRightIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M9 5.5 15.5 12 9 18.5" />
  </Icon>
);

/** A bare tick, for selection and confirmation. */
export const CheckIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
  </Icon>
);

/** A bare dash, for a partial selection — the tick's mixed-state counterpart. */
export const MinusIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M5.5 12h13" />
  </Icon>
);

/** Copy to clipboard: a sheet duplicated behind another. */
export const CopyIcon: IconComponent = (props) => (
  <Icon {...props}>
    <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
    <path d="M15.5 5.5V5A1.5 1.5 0 0 0 14 3.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h.5" />
  </Icon>
);

/** Opens in a new tab / leaves the app. */
export const ExternalLinkIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M13.5 4.5h6v6" />
    <path d="M19.5 4.5 11 13" />
    <path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
  </Icon>
);

/** Ascending sort: an up arrow beside narrow-to-wide rows. */
export const SortAscIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M6.5 20V5" />
    <path d="M3.5 8.5 6.5 5l3 3.5" />
    <path d="M12.5 7h3" />
    <path d="M12.5 12h5.5" />
    <path d="M12.5 17h8" />
  </Icon>
);

/** Descending sort: a down arrow beside wide-to-narrow rows. */
export const SortDescIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M6.5 4v15" />
    <path d="M3.5 15.5 6.5 19l3-3.5" />
    <path d="M12.5 7h8" />
    <path d="M12.5 12h5.5" />
    <path d="M12.5 17h3" />
  </Icon>
);

// -- Theme trio (one mark per option of the light / dark / system control) ----

/** Light theme. */
export const SunIcon: IconComponent = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.6v2.4" />
    <path d="M12 19v2.4" />
    <path d="M2.6 12H5" />
    <path d="M19 12h2.4" />
    <path d="M5.3 5.3 7 7" />
    <path d="M17 17 18.7 18.7" />
    <path d="M18.7 5.3 17 7" />
    <path d="M7 17 5.3 18.7" />
  </Icon>
);

/** Dark theme. */
export const MoonIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M20.5 14.3A9 9 0 0 1 9.7 3.5a9 9 0 1 0 10.8 10.8z" />
  </Icon>
);

/** Follow the operating system. */
export const MonitorIcon: IconComponent = (props) => (
  <Icon {...props}>
    <rect x="3" y="4" width="18" height="12.5" rx="2" />
    <path d="M8 21h8" />
    <path d="M12 16.5V21" />
  </Icon>
);

/** Reveal a masked value. */
export const EyeIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3.2" />
  </Icon>
);

/** Mask a revealed value. */
export const EyeOffIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M17.9 17.9A9.9 9.9 0 0 1 12 19.8c-6.2 0-10-7-10-7a18.3 18.3 0 0 1 4.6-5.4" />
    <path d="M9.9 4.4A9.1 9.1 0 0 1 12 4.2c6.2 0 10 7 10 7a18.4 18.4 0 0 1-2.1 3.1" />
    <path d="M14.1 14.1a3.2 3.2 0 1 1-4.4-4.4" />
    <path d="M2.6 2.6 21.4 21.4" />
  </Icon>
);

// -- Status marks ------------------------------------------------------------

/** Success. */
export const CheckCircleIcon: IconComponent = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12.3 10.9 15.2 16 9.5" />
  </Icon>
);

/** Warning. */
export const AlertTriangleIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M10.6 3.9 2.7 17.9a1.6 1.6 0 0 0 1.4 2.4h15.8a1.6 1.6 0 0 0 1.4-2.4L13.4 3.9a1.6 1.6 0 0 0-2.8 0z" />
    <path d="M12 9.6v4" />
    <path d="M12 16.9h.01" />
  </Icon>
);

/** Failure. */
export const XCircleIcon: IconComponent = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M15 9 9 15" />
    <path d="M9 9 15 15" />
  </Icon>
);

/**
 * Pending / running / queued — a clock hand inside a dashed ring.
 *
 * The dash period has to TILE the circumference or the ring closes on a seam.
 * At r = 9 the circumference is 2π·9 = 56.5487. A 3.2/3.2 array (period 6.4)
 * fits 8.84 times, so the ring shut with a 2.15 gap instead of 3.2 — and with
 * the inherited round linecap eating 1.6 at each end that seam rendered ~0.37 px
 * wide at 16 px, reading as joined while every other gap read as a gap. Eight
 * whole periods divide it exactly: 56.5487 / 8 = 7.0686, halved for the dash and
 * the gap = 3.5343 each, giving 16 even segments and no seam.
 */
export const PendingIcon: IconComponent = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" strokeDasharray="3.5343 3.5343" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);

/** Folder: a tabbed folder, for the tool-organization tree and breadcrumbs. */
export const FolderIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M3 6.5a2 2 0 0 1 2-2h4l2 2.5h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Icon>
);

/** Grid: a 2x2 tile array — the card-view half of the list/card toggle. */
export const GridIcon: IconComponent = (props) => (
  <Icon {...props}>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </Icon>
);

/** Served endpoints: a broadcast node radiating to the tools it serves. */
export const ServedEndpointsIcon: IconComponent = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="2.5" />
    <path d="M7.8 7.8a6 6 0 0 0 0 8.4" />
    <path d="M16.2 7.8a6 6 0 0 1 0 8.4" />
    <path d="M5 5a9 9 0 0 0 0 14" />
    <path d="M19 5a9 9 0 0 1 0 14" />
  </Icon>
);

/** Plugin: a puzzle piece — the host's provenance mark for plugin-contributed nav. */
export const PluginIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M10 4a2 2 0 0 1 4 0c0 .8.7 1.4 1.5 1.4H18a1 1 0 0 1 1 1v2.6c0 .8.6 1.5 1.4 1.5a2 2 0 0 1 0 4c-.8 0-1.4.7-1.4 1.5V19a1 1 0 0 1-1 1h-2.6c-.8 0-1.4-.6-1.4-1.4a2 2 0 0 0-4 0c0 .8-.6 1.4-1.4 1.4H6a1 1 0 0 1-1-1v-2.5C5 15.7 4.4 15 3.6 15a2 2 0 0 1 0-4c.8 0 1.4-.7 1.4-1.5V6a1 1 0 0 1 1-1h2.5C9.3 5 10 4.4 10 3.6z" />
  </Icon>
);

// -- Route mapping -----------------------------------------------------------

/**
 * The canonical mark for every navigable route token. `login` is excluded: it is
 * not a destination the navigation surfaces list. Keyed by the token type, so
 * adding a route to {@link RouteToken} fails the build here until it gets a mark.
 */
export const NAV_ICONS: Readonly<Record<Exclude<RouteToken, 'login'>, IconComponent>> = {
  observability: DashboardIcon,
  tools: ToolsIcon,
  agents: AgentsIcon,
  presets: PresetsIcon,
  extensions: ExtensionsIcon,
  templates: TemplatesIcon,
  connectors: ConnectorsIcon,
  servedEndpoints: ServedEndpointsIcon,
  hooks: HooksIcon,
  storage: StorageIcon,
  scheduling: SchedulingIcon,
  interactions: InteractionsIcon,
  notifications: NotificationsIcon,
  conversations: ConversationsIcon,
  marketplace: MarketplaceIcon,
  manifest: ManifestIcon,
  settings: SettingsIcon,
  system: SystemIcon,
};
