/**
 * `ExtensionComboBuilder`'s list of committed combos: one row of name badges per
 * combo, with per-combo Edit and Remove and an inline unknown-name note.
 */
import type { PresetExtensionElement } from '@tai42/api-client';
import { Fragment, type ReactNode } from 'react';

import { comboElementNames, unknownNames } from '../extension-combos';
import { Badge } from './badge';
import { CloseIcon, XCircleIcon } from './icons';
import { Button } from './primitives';

/** One committed combo's row: its name badges and the Edit / Remove pair, with an
 *  inline unknown-name note. */
function CommittedComboRow({
  combo,
  index,
  editing,
  disabled,
  unknown,
  onEdit,
  onRemove,
}: {
  readonly combo: readonly PresetExtensionElement[];
  readonly index: number;
  readonly editing: number | null;
  readonly disabled: boolean | undefined;
  readonly unknown: readonly string[];
  readonly onEdit: (index: number) => void;
  readonly onRemove: (index: number) => void;
}): ReactNode {
  const names = comboElementNames(combo);
  return (
    <li className="tai-card tai-stack tai-stack-2">
      <div className="tai-row">
        {/* The badges take the row's spare width so the Edit/Remove pair pins to a
            stable trailing edge across combos of varied length. */}
        <span className="tai-row" style={{ flex: 1 }}>
          {names.map((name, position) => (
            <Fragment key={`${name}-${String(position)}`}>
              {position > 0 ? (
                <span aria-hidden className="tai-muted">
                  +
                </span>
              ) : null}
              <Badge variant={unknown.includes(name) ? 'danger' : 'primary'}>{name}</Badge>
            </Fragment>
          ))}
        </span>
        <Button
          type="button"
          // The name starts with the words the button is SHOWING, which is what WCAG
          // 2.5.3 (Label in Name) asks: a constant "Edit …" would leave a button
          // reading "Editing" named "Edit", and a voice-control user naming a control
          // they cannot see.
          aria-label={`${editing === index ? 'Editing' : 'Edit'} extension set ${names.join('+')}`}
          disabled={disabled === true || editing === index}
          onClick={() => {
            onEdit(index);
          }}
        >
          {editing === index ? 'Editing' : 'Edit'}
        </Button>
        <Button
          type="button"
          aria-label={`Remove extension set ${names.join('+')}`}
          disabled={disabled}
          onClick={() => {
            onRemove(index);
          }}
        >
          <CloseIcon />
          Remove
        </Button>
      </div>
      {unknown.length > 0 ? (
        <p role="alert" className="tai-field-error">
          <XCircleIcon />
          {unknown.length === 1 ? 'Unknown extension: ' : 'Unknown extensions: '}
          {unknown.join(', ')}.
        </p>
      ) : null}
    </li>
  );
}

/** The current combos, each a row of name badges with per-combo Edit and Remove. */
export function CommittedComboList({
  value,
  availableReady,
  availableNames,
  editing,
  disabled,
  onEdit,
  onRemove,
}: {
  readonly value: readonly PresetExtensionElement[][];
  readonly availableReady: boolean;
  readonly availableNames: ReadonlySet<string>;
  readonly editing: number | null;
  readonly disabled: boolean | undefined;
  readonly onEdit: (index: number) => void;
  readonly onRemove: (index: number) => void;
}): ReactNode {
  if (value.length === 0) return <p className="tai-muted">No extension sets.</p>;
  return (
    <ul className="tai-stack tai-stack-2">
      {value.map((combo, index) => (
        // The index IS the identity here: the list mutates by append, in-place update,
        // and remove-by-index (no reorder), and a combo has no stable id of its own —
        // so an index key is stable and cannot collide.
        <CommittedComboRow
          key={index}
          combo={combo}
          index={index}
          editing={editing}
          disabled={disabled}
          unknown={availableReady ? unknownNames(combo, availableNames) : []}
          onEdit={onEdit}
          onRemove={onRemove}
        />
      ))}
    </ul>
  );
}
