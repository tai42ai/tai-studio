/**
 * The inline jq-condition editor: the visual {@link JqField} over the JqAuthContext
 * shape, the context-field hints, a sample-context editor, and the Test-condition
 * button hitting the fail-closed `validate-condition` guard. The guard is ADVISORY —
 * a failed test surfaces the verbatim message and reports `onTestFailedChange(true)`
 * (a non-blocking Save warning), but never blocks the save.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Badge,
  Button,
  ErrorState,
  Spinner,
  Textarea,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';
import { JqField } from '@tai42/jq-studio';

import {
  CONDITION_SHAPE,
  JQ_CONTEXT_HINTS,
  SAMPLE_CONTEXT_SKELETON,
  liveSampleInput,
  makeConditionServerValidate,
  parseSampleContext,
} from './policy-condition';

const fieldLabelStyle: CSSProperties = {
  fontSize: 'var(--tai-text-sm)',
  fontWeight: 600,
  color: 'var(--tai-color-text)',
  display: 'block',
  marginBottom: 'var(--tai-space-1)',
};

const hintsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--tai-space-1)',
  fontFamily: 'var(--tai-font-mono)',
};

const mutedNoteStyle: CSSProperties = {
  margin: 'var(--tai-space-1) 0 0',
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
};

const sampleErrorStyle: CSSProperties = {
  margin: 'var(--tai-space-1) 0 0',
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-err-text)',
};

/** The read-only list of JqAuthContext field paths the condition can reference. */
function ContextHints(): ReactNode {
  return (
    <div>
      <span style={{ fontSize: 'var(--tai-text-sm)', color: 'var(--tai-color-text-muted)' }}>
        Available context fields:
      </span>
      <div style={hintsStyle}>
        {JQ_CONTEXT_HINTS.map((hint) => (
          <Badge key={hint} variant="neutral">
            {hint}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function OutcomeBadge({
  outcome,
}: {
  readonly outcome: 'allows' | 'denies' | 'compiles';
}): ReactNode {
  if (outcome === 'allows') return <Badge variant="success">allows sample</Badge>;
  if (outcome === 'denies') return <Badge variant="warning">denies sample</Badge>;
  return <Badge variant="neutral">compiles (no sample evaluated)</Badge>;
}

export function ConditionInlineEditor({
  idPrefix,
  label,
  value,
  hideLabel,
  disabled,
  onChange,
  onTestFailedChange,
}: {
  readonly idPrefix: string;
  readonly label: string;
  readonly value: string;
  readonly hideLabel: boolean;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
  /** Fires `true` when the last Test failed and the content is unchanged since. */
  readonly onTestFailedChange: (failed: boolean) => void;
}): ReactNode {
  const api = useApi();
  const [sampleContext, setSampleContext] = useState(SAMPLE_CONTEXT_SKELETON);
  const [sampleError, setSampleError] = useState<string | null>(null);
  // The known-broken condition message from the last Test (a 400 the guard threw);
  // surfaced verbatim, reported as a non-blocking Save warning, cleared on edit.
  const [conditionError, setConditionError] = useState<string | null>(null);
  const [validateOutcome, setValidateOutcome] = useState<'allows' | 'denies' | 'compiles' | null>(
    null,
  );

  const validate = useMutation({
    mutationFn: ({
      content,
      sample,
    }: {
      content: string;
      sample: Record<string, unknown> | undefined;
    }) =>
      api.validateCondition(
        sample === undefined
          ? { condition: content }
          : { condition: content, sample_context: sample },
      ),
    onSuccess: (result) => {
      setConditionError(null);
      setValidateOutcome(
        result.result === true ? 'allows' : result.result === false ? 'denies' : 'compiles',
      );
    },
    onError: (error) => {
      // A 400 is the guard's verbatim compile/render/eval message — surfaced exactly.
      setValidateOutcome(null);
      setConditionError(errorMessage(error));
    },
  });

  const runTest = (content: string): void => {
    setSampleError(null);
    let sample: Record<string, unknown> | undefined;
    try {
      sample = parseSampleContext(sampleContext);
    } catch (error) {
      // A malformed sample is a loud FIELD error that never fires the request and
      // never blocks save (the sample is a test input, not part of the condition).
      setSampleError(errorMessage(error));
      return;
    }
    validate.mutate({ content, sample });
  };

  const conditionServerValidate = useMemo(() => makeConditionServerValidate(api), [api]);
  const provideSampleInput = useCallback(() => liveSampleInput(sampleContext), [sampleContext]);

  useEffect(() => {
    onTestFailedChange(conditionError !== null);
  }, [conditionError, onTestFailedChange]);

  return (
    <div
      className={hideLabel ? 'tai-templated-inline--grouped' : undefined}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}
    >
      <JqField
        label={label}
        shape={CONDITION_SHAPE}
        sampleInput={provideSampleInput}
        serverValidate={conditionServerValidate}
        multiline
        value={value}
        readOnly={disabled}
        onChange={(next) => {
          onChange(next);
          // Editing invalidates the last Test result, clearing the Save warning.
          setConditionError(null);
          setValidateOutcome(null);
        }}
      />
      <ContextHints />
      <div>
        <label style={fieldLabelStyle} htmlFor={`${idPrefix}-sample-context`}>
          Sample context (JSON)
        </label>
        <Textarea
          id={`${idPrefix}-sample-context`}
          aria-label="Sample context (JSON)"
          value={sampleContext}
          rows={7}
          spellCheck={false}
          disabled={disabled}
          onChange={(event) => {
            setSampleContext(event.target.value);
            setSampleError(null);
          }}
        />
        <p style={mutedNoteStyle}>
          The JqAuthContext the condition is evaluated against. Blank tests compile-only (no
          allow/deny).
        </p>
        {sampleError !== null ? (
          <p role="alert" style={sampleErrorStyle}>
            {sampleError}
          </p>
        ) : null}
      </div>
      <div>
        <Button
          type="button"
          disabled={disabled || value.trim().length === 0 || validate.isPending}
          onClick={() => {
            runTest(value);
          }}
        >
          {validate.isPending ? <Spinner label="Testing" /> : null}
          Test condition
        </Button>
      </div>
      {conditionError !== null ? <ErrorState message={conditionError} /> : null}
      {validateOutcome !== null ? (
        <div role="status">
          <OutcomeBadge outcome={validateOutcome} />
        </div>
      ) : null}
    </div>
  );
}
