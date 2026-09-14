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
export type { IconProps, IconComponent } from './icon-frame';
export {
  DashboardIcon,
  ToolsIcon,
  AgentsIcon,
  PresetsIcon,
  ExtensionsIcon,
  TemplatesIcon,
  ConnectorsIcon,
  HooksIcon,
  StorageIcon,
  DatabaseIcon,
  SchedulingIcon,
  InteractionsIcon,
  NotificationsIcon,
  ConversationsIcon,
  MarketplaceIcon,
  ManifestIcon,
  SettingsIcon,
  SystemIcon,
  ServedEndpointsIcon,
  PluginIcon,
} from './nav-marks';
export {
  SearchIcon,
  SignOutIcon,
  MenuIcon,
  CloseIcon,
  FilterIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CheckIcon,
  MinusIcon,
  PlusIcon,
  EditIcon,
  UnplugIcon,
  CopyIcon,
  ExternalLinkIcon,
  SortAscIcon,
  SortDescIcon,
  EyeIcon,
  EyeOffIcon,
  FolderIcon,
  GridIcon,
} from './chrome-marks';
export { SunIcon, MoonIcon, MonitorIcon } from './theme-marks';
export { CheckCircleIcon, AlertTriangleIcon, XCircleIcon, PendingIcon } from './status-marks';
export { NAV_ICONS } from './nav-map';
