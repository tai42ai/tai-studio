/**
 * The optional state-binding editor — one shape on every door (a preset, a channel
 * route, a schedule, a hook) and, in the flow engine, per node. It attaches one or
 * more states, each with the templates it attaches on save, a subject/scope, input
 * injections evaluated before the run, and updates applied after it.
 *
 * It lives in the Studio SDK so every plugin door reuses it; it holds NO edge to jq
 * (the jq fields render through the host's ambient expression door, else a plain
 * textarea) and paints from SDK tokens only.
 */
import type { ReactNode } from 'react';

import { Button, EmptyState, ErrorState, Skeleton } from '../components/primitives';
import { StateAttachRow } from './StateAttachRow';
import type {
  BindingSourceSchemas,
  BindingStateOption,
  BindingTemplateOption,
  StateAttach,
  StateBinding,
} from './types';

export interface StateBindingEditorProps {
  /** The binding, or `null` when the door binds no state. */
  readonly value: StateBinding | null;
  readonly onChange: (value: StateBinding | null) => void;
  /** The states this door may bind, each with its attached templates and fields. */
  readonly statesCatalog: readonly BindingStateOption[];
  /** The templates the editor may attach (attach-on-use), each with its template jq. */
  readonly templatesCatalog: readonly BindingTemplateOption[];
  /** The run's output/input field paths a picker offers when a schema is known. */
  readonly sources?: BindingSourceSchemas;
  /**
   * The TARGET's own binding (e.g. the preset a route dispatches), passed by the door
   * screen — never fetched here. A state this binding names that the inherited one
   * also names shows a precedence warning on its card.
   */
  readonly inherited?: StateBinding | null;
  /** The catalog fetch is in flight. */
  readonly loading?: boolean;
  /** The catalog fetch failed. */
  readonly error?: string;
}

function blankAttach(): StateAttach {
  return {
    state: '',
    templates: [],
    subject_expr: '',
    scope_expr: null,
    input_injections: [],
    updates: [],
  };
}

export function StateBindingEditor({
  value,
  onChange,
  statesCatalog,
  templatesCatalog,
  sources,
  inherited,
  loading = false,
  error,
}: StateBindingEditorProps): ReactNode {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
        <Skeleton height={32} />
        <Skeleton height={32} />
      </div>
    );
  }
  if (error !== undefined) {
    return <ErrorState message="Couldn't load states and templates." />;
  }

  const states = value?.states ?? [];

  const setStates = (next: readonly StateAttach[]): void => {
    onChange(next.length === 0 ? null : { states: [...next] });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
      {states.length === 0 ? (
        <EmptyState
          title="No state bound"
          description="Attach a state to inject a value into the run and update the record after it."
          action={
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                setStates([blankAttach()]);
              }}
            >
              Attach a state
            </Button>
          }
        />
      ) : (
        <>
          {states.map((attach, index) => {
            const inheritedAttach =
              attach.state === ''
                ? undefined
                : inherited?.states.find((entry) => entry.state === attach.state);
            // The subject is a required jq (contract: min_length=1); an empty one is
            // caught inline once a state is chosen, never sent for the server to 422.
            const subjectError =
              attach.state !== '' && attach.subject_expr.trim() === ''
                ? 'Subject is required.'
                : undefined;
            return (
              <StateAttachRow
                // Positional identity within a save; a state name may be blank while picking.
                key={index}
                attach={attach}
                statesCatalog={statesCatalog}
                templatesCatalog={templatesCatalog}
                sources={sources}
                subjectError={subjectError}
                inherited={
                  inheritedAttach === undefined
                    ? undefined
                    : {
                        subject_expr: inheritedAttach.subject_expr,
                        scope_expr: inheritedAttach.scope_expr,
                      }
                }
                onChange={(next) => {
                  setStates(
                    states.map((current, position) => (position === index ? next : current)),
                  );
                }}
                onRemove={() => {
                  setStates(states.filter((_, position) => position !== index));
                }}
              />
            );
          })}
          <div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setStates([...states, blankAttach()]);
              }}
            >
              Attach a state
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
