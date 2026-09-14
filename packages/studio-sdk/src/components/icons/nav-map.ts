/**
 * The canonical route-token → icon mapping. Exhaustive over {@link RouteToken}
 * (bar `login`, which is not a listed destination), so adding a route fails the
 * build here until it has a mark.
 */
import type { RouteToken } from '../../navigation/types';
import type { IconComponent } from './icon-frame';
import {
  DashboardIcon,
  ToolsIcon,
  AgentsIcon,
  PresetsIcon,
  DatabaseIcon,
  ExtensionsIcon,
  TemplatesIcon,
  ConnectorsIcon,
  ServedEndpointsIcon,
  HooksIcon,
  StorageIcon,
  SchedulingIcon,
  InteractionsIcon,
  NotificationsIcon,
  ConversationsIcon,
  MarketplaceIcon,
  ManifestIcon,
  SettingsIcon,
  SystemIcon,
} from './nav-marks';

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
  states: DatabaseIcon,
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
