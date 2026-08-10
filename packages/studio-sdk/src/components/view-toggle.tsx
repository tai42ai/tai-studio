/**
 * `ViewToggle` + `useViewMode` — the list/card switch every entity screen shares.
 *
 * The control is a `RadioGroup variant="segmented"` with ICON-ONLY options: each
 * option's text label is rendered for assistive tech only (`visuallyHiddenLabel`),
 * so the segment shows just its glyph while keeping a real accessible name. A single
 * screen's choice persists across sessions in `localStorage`, keyed per SURFACE —
 * the tools screen and the flows page each remember their own view — via
 * {@link useViewMode}. The two live in the SDK so every entity screen (and the
 * flows page) toggles identically; `EntityCardGrid` renders the card half.
 */
import { useCallback, useState, type ReactNode } from 'react';

import { GridIcon, MenuIcon } from './icons';
import { RadioGroup } from './radio-group';

/** The two entity-screen layouts. */
export type ViewMode = 'list' | 'cards';

const OPTIONS = [
  { value: 'list', label: 'List view', icon: <MenuIcon />, visuallyHiddenLabel: true },
  { value: 'cards', label: 'Card view', icon: <GridIcon />, visuallyHiddenLabel: true },
] as const;

export interface ViewToggleProps {
  readonly value: ViewMode;
  readonly onValueChange: (mode: ViewMode) => void;
  /** The control's accessible group name (e.g. "Tools view"). */
  readonly 'aria-label': string;
  readonly disabled?: boolean;
}

/** The icon-only segmented switch. Controlled: pair it with {@link useViewMode}. */
export function ViewToggle({
  value,
  onValueChange,
  'aria-label': ariaLabel,
  disabled,
}: ViewToggleProps): ReactNode {
  return (
    <RadioGroup
      variant="segmented"
      orientation="horizontal"
      aria-label={ariaLabel}
      options={OPTIONS}
      value={value}
      onValueChange={(next) => {
        // The option values are a closed pair, so the widening back to `ViewMode`
        // is exact — a stray value could only come from a mismatched options list.
        onValueChange(next as ViewMode);
      }}
      disabled={disabled}
    />
  );
}

const STORAGE_PREFIX = 'tai-studio.view-mode.';

function readStoredMode(surface: string, fallback: ViewMode): ViewMode {
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_PREFIX + surface);
    if (raw === 'list' || raw === 'cards') return raw;
  } catch {
    // No storage (private mode / non-browser) — fall back to the caller's default.
  }
  return fallback;
}

/**
 * The persisted view mode for one `surface` (a stable key like `'tools'`). Returns
 * the stored choice or `fallback` when none is set, and a setter that writes through
 * to `localStorage`. Storage failures degrade to in-memory only — never a thrown
 * boot, matching the theme preference's defensive reads/writes.
 */
export function useViewMode(
  surface: string,
  fallback: ViewMode = 'list',
): readonly [ViewMode, (mode: ViewMode) => void] {
  const [mode, setModeState] = useState<ViewMode>(() => readStoredMode(surface, fallback));
  const setMode = useCallback(
    (next: ViewMode) => {
      setModeState(next);
      try {
        globalThis.localStorage.setItem(STORAGE_PREFIX + surface, next);
      } catch {
        // Storage unavailable — the choice still applies for this session.
      }
    },
    [surface],
  );
  return [mode, setMode];
}
