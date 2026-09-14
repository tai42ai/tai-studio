/** App-chrome and control marks: search, navigation controls, list actions,
 * ordering arrows, and the reveal/mask pair. */
import { Icon, type IconComponent } from './icon-frame';

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

/** Add / insert: the dash crossed by an upright, for an append or attach affordance. */
export const PlusIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M5.5 12h13" />
    <path d="M12 5.5v13" />
  </Icon>
);

/** Edit: a pencil laid across the surface it writes on. */
export const EditIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M4 20h4L18.5 9.5a2 2 0 0 0-2.83-2.83L5 17.2z" />
    <path d="M14 8 16 10" />
  </Icon>
);

/** Detach / unmount: a plug pulled from its socket, the two prongs above the gap. */
export const UnplugIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M15.5 8.5 20 4" />
    <path d="M10.5 6.5 6 11l7 7 4.5-4.5z" />
    <path d="M13.5 3.5 11 6M18 8.5 20.5 11M8.5 15.5 4 20" />
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
