/**
 * `CompletionInput` — a text field wired to MCP `completion/complete`. As the
 * human types, it asks the provided `fetchCompletions` (a thin wrapper over the
 * MCP completions capability) for argument suggestions and renders them as a
 * selectable list; picking one fills the field. A fetch failure clears the
 * suggestions and surfaces through `onError` — never a silent swallow.
 *
 * The field is a `tai-input` and its popup wears the Select popup's classes
 * (`tai-select-content` / `tai-select-item`), so a suggestion list and a select
 * list are the same object to a reader.
 *
 * Reusable by any feature; the intended consumer is a `SchemaForm` string field
 * that has a completion provider for its tool/prompt/resource argument.
 */
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';

import { useFieldControl } from './field';

export interface CompletionInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Fetch argument completions for the current input value. */
  readonly fetchCompletions: (value: string) => Promise<readonly string[]>;
  /** Surfaced (not swallowed) when a completion fetch fails. */
  readonly onError?: (error: unknown) => void;
  readonly placeholder?: string;
}

const wrapStyle: CSSProperties = { position: 'relative' };

/**
 * The popup FLOATS below the field: absolutely positioned within the
 * `position: relative` wrapper (`top: 100%` = the field's bottom edge, stretched
 * `left`/`right` to the field's width) so it is taken OUT OF FLOW — it neither
 * displaces the content below the field nor gets laid out inside it. Its stacking
 * comes from `tai-select-content`'s `--tai-z-popover` z-index, which was inert
 * while the list was in-flow (z-index needs a positioned box) and is exactly what
 * this `position` now activates, so the list clears a sibling control it overlaps.
 *
 * Absolute-in-wrapper rather than a portal on purpose: this is an inline form
 * control (a `SchemaForm` string field). A portal would need anchor-rect popper
 * plumbing, and it buys nothing here — the wrapper is a plain flow box, so the
 * only container that could clip the list is a scrollable ancestor (e.g. the
 * `Dialog` body), where an absolute list simply extends that ancestor's scroll
 * area instead of being cut off. It is still a `<ul>`, so it also drops the marker
 * a host without a CSS reset would draw.
 */
const listStyle: CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  right: 0,
  marginTop: 'var(--tai-space-1)',
  marginBottom: 0,
  listStyle: 'none',
};

/**
 * A completion-backed text input. Suggestions refresh on every edit (a
 * per-request sequence guard drops a stale response) and render as an ARIA
 * listbox; selecting an option fills the field and clears the list.
 */
export function CompletionInput({
  value,
  onChange,
  fetchCompletions,
  onError,
  placeholder,
}: CompletionInputProps): ReactNode {
  const field = useFieldControl();
  const listboxId = useId();
  const [suggestions, setSuggestions] = useState<readonly string[]>([]);
  // The list is only shown while the human is typing. Selecting an option (a
  // programmatic value change) closes it until the next keystroke, so the field
  // does not immediately re-suggest against the value it just accepted.
  const [open, setOpen] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const requestId = ++seq.current;
    let cancelled = false;
    fetchCompletions(value)
      .then((values) => {
        // Drop a stale response so a slow earlier request cannot overwrite a
        // newer one's suggestions.
        if (!cancelled && requestId === seq.current) setSuggestions(values);
      })
      .catch((error: unknown) => {
        if (cancelled || requestId !== seq.current) return;
        setSuggestions([]);
        onError?.(error);
      });
    return () => {
      cancelled = true;
    };
  }, [value, fetchCompletions, onError]);

  const select = (suggestion: string) => {
    setOpen(false);
    setSuggestions([]);
    onChange(suggestion);
  };

  const showList = open && suggestions.length > 0;

  return (
    <div style={wrapStyle}>
      <input
        {...field}
        className="tai-input"
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-autocomplete="list"
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          setOpen(true);
          onChange(event.target.value);
        }}
      />
      {/* `tai-select-viewport` carries the inset that gives an option's focus ring
          room. This popup is its own clip box — it has no Radix viewport to put
          the class on — so it wears both, or preflight's `* { padding: 0 }` zeroes
          the inset and clips every ring. */}
      {showList && (
        <ul
          id={listboxId}
          role="listbox"
          className="tai-select-content tai-select-viewport"
          style={listStyle}
        >
          {suggestions.map((suggestion) => (
            <li key={suggestion} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="tai-select-item"
                onClick={() => {
                  select(suggestion);
                }}
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
