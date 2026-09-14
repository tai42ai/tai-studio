/** The theme trio — one mark per option of the light / dark / system control. */
import { Icon, type IconComponent } from './icon-frame';

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
