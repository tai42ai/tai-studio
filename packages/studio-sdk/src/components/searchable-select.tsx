/**
 * `SearchableSelect` — a single-choice select whose popup opens with a search box:
 * typing narrows the options to those whose label contains the text (the SDK's one
 * search rule, `matchesSearch`), or whose `description` does: an option may carry one,
 * drawn as a quieter line under its label. It takes the same option shapes as `Select`
 * — a flat `options` run or labelled `groups`, never both — and its trigger wears the same
 * class, auto-wires to an enclosing `Field` the same way, and has the same
 * `combobox` role, so the two read as one control with and without search.
 *
 * Keyboard: on the trigger, Enter, ArrowDown or ArrowUp opens the popup as the key goes
 * down (as on `Select`), Space opens it as a button press, and a printable key opens it
 * with that key already typed. In the search box ArrowDown and ArrowUp move the
 * highlight, Home and End move it to the first and last choosable option, Enter chooses
 * it, and Escape closes the popup and returns focus to the trigger. Tab and Shift+Tab
 * close the popup without choosing and move focus on from the trigger, to the control
 * after or before it, as from a closed select. The highlight is exposed as the search
 * box's `aria-activedescendant`, so focus never leaves the box while the reader moves.
 * When the query changes, the highlight moves to the first choosable match and the list
 * scrolls back to its top, so the first match is shown however far down the list was.
 *
 * Large lists: the options are indexed once per options change, a keystroke runs one
 * substring test per option against that index, and the list renders from a deferred
 * copy of the query so typing stays responsive. Each row is memoised on its indexed
 * entry, so a keystroke re-renders only the rows whose highlight or selection changed;
 * the rest are kept or removed by React without rendering.
 *
 * The popup is a Radix Popover, so it shares the layer, focus and dismiss stack the
 * design system's dialogs use: it opens above a dialog and closes on Escape or an
 * outside press without closing the dialog under it.
 */
import * as RadixPopover from '@radix-ui/react-popover';
import {
  type KeyboardEvent,
  memo,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import { SELECT_TRIGGER_CLASS } from './control-styles';
import { useFieldControl, useFieldLabelId } from './field';
import { CheckIcon, ChevronDownIcon } from './icons';
import {
  edgeEntry,
  indexSections,
  type SearchableSelectGroup,
  type SearchableSelectOption,
  type SearchEntry,
  type SearchSection,
  shownEntry,
  stepEntry,
  visibleOptions,
} from './searchable-select-model';

/** Everything the two option shapes have in common. */
interface SearchableSelectSharedProps {
  /**
   * The chosen option's value; `''` for none (the placeholder shows). A value no option
   * carries shows as itself on the trigger.
   */
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  /**
   * Accessible name for the trigger, its popup and its listbox when it is not wired to
   * an enclosing `Field`. A `Field` wins where both are given, as on `Select`.
   */
  readonly 'aria-label'?: string;
  /** IDREFs describing the trigger, concatenated ahead of an enclosing `Field`'s own. */
  readonly 'aria-describedby'?: string;
  /** Accessible name of the search box (e.g. "Search tools"). */
  readonly searchLabel: string;
}

/** The FLAT shape: one ungrouped run of options. */
export interface SearchableSelectProps extends SearchableSelectSharedProps {
  readonly options: readonly SearchableSelectOption[];
}

/** The GROUPED shape: labelled clusters, each carrying its own options. */
export interface SearchableSelectGroupsProps extends SearchableSelectSharedProps {
  readonly groups: readonly SearchableSelectGroup[];
}

type SearchableSelectArgs =
  | (SearchableSelectProps & { readonly groups?: undefined })
  | (SearchableSelectGroupsProps & { readonly options?: undefined });

interface OptionRowProps {
  readonly entry: SearchEntry;
  readonly id: string;
  readonly highlighted: boolean;
  readonly selected: boolean;
}

/** One option. Pointer handling is delegated to the listbox, so a row is pure markup. */
const OptionRow = memo(function OptionRow({ entry, id, highlighted, selected }: OptionRowProps) {
  const disabled = entry.option.disabled === true;
  const { description } = entry.option;
  const hasDescription = description !== undefined && description !== '';
  const descriptionId = `${id}-description`;
  return (
    <div
      id={id}
      role="option"
      aria-selected={selected}
      aria-disabled={disabled ? true : undefined}
      aria-describedby={hasDescription ? descriptionId : undefined}
      className="tai-select-item"
      data-position={entry.position}
      data-highlighted={highlighted ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
    >
      {hasDescription ? (
        <span className="tai-search-select-option-text">
          <span>{entry.option.label}</span>
          <span id={descriptionId} className="tai-search-select-option-description">
            {description}
          </span>
        </span>
      ) : (
        <span>{entry.option.label}</span>
      )}
      {selected ? (
        <span className="tai-select-item-indicator" aria-hidden="true">
          <CheckIcon />
        </span>
      ) : null}
    </div>
  );
});

/** The position of the option row an event happened in, or `undefined` outside one. */
function positionAt(target: EventTarget): number | undefined {
  if (!(target instanceof Element)) return undefined;
  const row = target.closest<HTMLElement>('[role="option"]');
  if (row === null || row.dataset.disabled !== undefined) return undefined;
  const position = Number(row.dataset.position);
  return Number.isInteger(position) ? position : undefined;
}

/** A key that types a character (and so starts a search from the closed trigger). */
function isPrintable(event: KeyboardEvent): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

/**
 * The select's interaction state over its indexed `sections`: whether the popup is
 * open, the query and what it leaves visible, the highlight, and the key and pointer
 * handlers that move it and choose.
 *
 * The highlight is held as an option VALUE, so a list that changes while open keeps
 * it on the same option; a new query lets it go, so it lands on the first match.
 * Choosing and the empty status read the live query; only the
 * rendered rows trail it through `useDeferredValue`, so a fast type-and-Enter picks
 * from what was typed.
 */
function useSearchSelection(
  sections: readonly SearchSection[],
  value: string,
  onValueChange: (value: string) => void,
) {
  const listboxId = useId();
  const optionId = useCallback(
    (position: number) => `${listboxId}-${String(position)}`,
    [listboxId],
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [wanted, setWanted] = useState<string | undefined>(undefined);
  // Only a keyboard move scrolls the highlight into view; a pointer already sees it.
  const scrollOnMove = useRef(false);
  // Set when Tab leaves the popup, so closing it does not pull focus back to the trigger.
  const leftByTab = useRef(false);

  const indexed = useMemo(() => sections.flatMap((section) => section.entries), [sections]);
  const selectedEntry = useMemo(
    () => indexed.find((entry) => entry.option.value === value),
    [indexed, value],
  );
  const live = useMemo(() => visibleOptions(sections, query), [sections, query]);
  const deferredQuery = useDeferredValue(query);
  const rendered = useMemo(
    () => (deferredQuery === query ? live : visibleOptions(sections, deferredQuery)),
    [sections, deferredQuery, query, live],
  );
  const highlightedEntry = shownEntry(live.entries, wanted);
  const highlighted = highlightedEntry?.position;

  const scrollToHighlight = useCallback(
    (position: number | undefined) => {
      if (position === undefined) return;
      document.getElementById(optionId(position))?.scrollIntoView({ block: 'nearest' });
    },
    [optionId],
  );

  useEffect(() => {
    if (!scrollOnMove.current) return;
    scrollOnMove.current = false;
    scrollToHighlight(highlighted);
  }, [highlighted, scrollToHighlight]);

  // Once the rows for a new query are drawn, the list starts again from its top with
  // the highlight, the first match, in view. Keyed on the rendered query, so it runs after the deferred
  // rows exist; the query a popup opens with is handled by `onOpened`.
  const shownQuery = useRef(deferredQuery);
  useEffect(() => {
    if (shownQuery.current === deferredQuery) return;
    shownQuery.current = deferredQuery;
    if (listRef.current !== null) listRef.current.scrollTop = 0;
    scrollToHighlight(highlighted);
  }, [deferredQuery, highlighted, scrollToHighlight]);

  const onOpenChange = (next: boolean): void => {
    setOpen(next);
    if (!next) setQuery('');
    else setWanted(selectedEntry?.option.value);
  };

  const changeQuery = (next: string): void => {
    setQuery(next);
    setWanted(undefined);
  };

  /** Runs once the popup's rows are mounted: focus goes to the search box, and the
   *  highlight (the chosen option on open) is brought into view. */
  const onOpened = (): void => {
    shownQuery.current = query;
    inputRef.current?.focus();
    scrollToHighlight(highlighted);
  };

  /** Runs as the popup closes: focus returns to the trigger, unless Tab already moved
   *  it on from there. */
  const onClosed = (event: Event): void => {
    if (!leftByTab.current) return;
    leftByTab.current = false;
    event.preventDefault();
  };

  const choose = (entry: SearchEntry | undefined): void => {
    if (entry === undefined || entry.option.disabled === true) return;
    if (entry.option.value !== value) onValueChange(entry.option.value);
    onOpenChange(false);
  };

  const move = (to: SearchEntry | undefined): void => {
    scrollOnMove.current = true;
    setWanted(to?.option.value);
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      move(stepEntry(live.entries, highlightedEntry, event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      move(edgeEntry(live.entries, event.key === 'Home' ? 'first' : 'last'));
    } else if (event.key === 'Tab') {
      // Focus goes back to the trigger and the key's own move then runs from there, so
      // Tab lands on the control after the select and Shift+Tab on the one before it.
      leftByTab.current = true;
      triggerRef.current?.focus();
      onOpenChange(false);
    } else if (event.key === 'Enter') {
      // Enter chooses; it must never submit the form the select sits in.
      event.preventDefault();
      choose(highlightedEntry);
    }
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (open) return;
    if (event.key === 'Enter' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      // Prevented, so a native button press does not follow and toggle it shut again.
      event.preventDefault();
      onOpenChange(true);
    } else if (isPrintable(event) && event.key !== ' ') {
      event.preventDefault();
      onOpenChange(true);
      changeQuery(event.key);
    }
  };

  const entryAt = (target: EventTarget): SearchEntry | undefined => {
    const position = positionAt(target);
    return position === undefined ? undefined : indexed[position];
  };
  const onListClick = (event: MouseEvent<HTMLDivElement>): void => {
    choose(entryAt(event.target));
  };
  const onListPointerMove = (event: MouseEvent<HTMLDivElement>): void => {
    const entry = entryAt(event.target);
    if (entry !== undefined && entry.option.value !== wanted) setWanted(entry.option.value);
  };

  return {
    listboxId,
    optionId,
    inputRef,
    triggerRef,
    listRef,
    open,
    onOpenChange,
    onOpened,
    onClosed,
    query,
    changeQuery,
    empty: live.entries.length === 0,
    rendered,
    highlighted,
    selectedEntry,
    onSearchKeyDown,
    onTriggerKeyDown,
    onListClick,
    onListPointerMove,
  };
}

export function SearchableSelect(props: SearchableSelectArgs): ReactNode {
  const {
    value,
    onValueChange,
    placeholder = 'Select…',
    disabled,
    'aria-label': ariaLabel,
    'aria-describedby': ownDescribedBy,
    searchLabel,
  } = props;
  // Untyped JavaScript is the only caller that reaches this; dropping one list would
  // lose its every entry without a word.
  if ((props.options === undefined) === (props.groups === undefined)) {
    throw new Error(
      'SearchableSelect renders exactly one of `options` or `groups`; it was given both, or neither.',
    );
  }
  const field = useFieldControl();
  const fieldLabelId = useFieldLabelId();
  const sections = useMemo(
    () => indexSections(props.options, props.groups),
    [props.options, props.groups],
  );
  const {
    listboxId,
    optionId,
    inputRef,
    triggerRef,
    listRef,
    open,
    onOpenChange,
    onOpened,
    onClosed,
    query,
    changeQuery,
    empty,
    rendered,
    highlighted,
    selectedEntry,
    onSearchKeyDown,
    onTriggerKeyDown,
    onListClick,
    onListPointerMove,
  } = useSearchSelection(sections, value, onValueChange);
  // The popup and its listbox carry the control's own name: the Field's label, else
  // the caller's `aria-label`. The search box is named apart by `searchLabel`.
  const popupName =
    field.id !== undefined && fieldLabelId !== undefined
      ? { 'aria-labelledby': fieldLabelId }
      : { 'aria-label': ariaLabel };
  const describedBy = [ownDescribedBy, field['aria-describedby']].filter(
    (id): id is string => id !== undefined,
  );
  const rows = (entries: readonly SearchEntry[]): ReactNode =>
    entries.map((entry) => (
      <OptionRow
        key={entry.position}
        entry={entry}
        id={optionId(entry.position)}
        highlighted={entry.position === highlighted}
        selected={entry === selectedEntry}
      />
    ));

  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      <RadixPopover.Trigger
        ref={triggerRef}
        type="button"
        role="combobox"
        id={field.id}
        className={SELECT_TRIGGER_CLASS}
        disabled={disabled}
        // A trigger claiming the field's id is named by that field's `<label for>`, and
        // `aria-label` outranks a native label: emitting both would drop the visible text.
        aria-label={field.id === undefined ? ariaLabel : undefined}
        aria-describedby={describedBy.length > 0 ? describedBy.join(' ') : undefined}
        aria-invalid={field['aria-invalid']}
        onKeyDown={onTriggerKeyDown}
      >
        <span>{selectedEntry?.option.label ?? (value === '' ? placeholder : value)}</span>
        <ChevronDownIcon />
      </RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          className="tai-select-content tai-search-select-content"
          align="start"
          sideOffset={4}
          {...popupName}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            onOpened();
          }}
          onCloseAutoFocus={onClosed}
        >
          <div className="tai-search-select-search">
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              className="tai-input"
              aria-label={searchLabel}
              aria-expanded="true"
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={highlighted === undefined ? undefined : optionId(highlighted)}
              autoComplete="off"
              spellCheck={false}
              placeholder={searchLabel}
              value={query}
              onChange={(event) => {
                changeQuery(event.target.value);
              }}
              onKeyDown={onSearchKeyDown}
            />
          </div>
          {/* Rows take no focus: the search box keeps it and points at the highlight,
              so a press on a row must not move focus out of the box first. */}
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events -- the search box owns the keyboard through aria-activedescendant; focus never reaches the list */}
          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            {...popupName}
            tabIndex={-1}
            className="tai-select-viewport tai-search-select-list"
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={onListClick}
            onPointerMove={onListPointerMove}
          >
            {rendered.sections.map((section) =>
              section.label === undefined ? (
                rows(section.entries)
              ) : (
                <SectionGroup key={section.label} label={section.label}>
                  {rows(section.entries)}
                </SectionGroup>
              ),
            )}
          </div>
          {empty ? (
            <p role="status" className="tai-status tai-search-select-empty">
              {query.trim() === '' ? 'Nothing to choose.' : `Nothing matches “${query.trim()}”.`}
            </p>
          ) : null}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}

function SectionGroup({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactNode {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId}>
      <div id={labelId} className="tai-select-group-label tai-label">
        {label}
      </div>
      {children}
    </div>
  );
}
