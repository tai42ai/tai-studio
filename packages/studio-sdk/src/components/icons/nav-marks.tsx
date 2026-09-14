/** The route-destination marks — one per navigable Studio route, plus the
 * plugin-provenance mark for plugin-contributed navigation. */
import { Icon, type IconComponent } from './icon-frame';

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

/** States: a stacked-disk cylinder — one document store per subject. */
export const DatabaseIcon: IconComponent = (props) => (
  <Icon {...props}>
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
    <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
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
