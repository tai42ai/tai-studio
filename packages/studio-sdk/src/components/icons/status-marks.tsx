/** Status marks — success, warning, failure and the pending/running ring. */
import { Icon, type IconComponent } from './icon-frame';

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
