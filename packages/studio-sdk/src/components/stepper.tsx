/**
 * `Stepper` — the progress of a short multi-step flow: a named `<nav>` over an
 * ordered list, one entry per step with a numbered (or marked) 24 px marker and
 * its label. The `current` step carries `aria-current="step"`; every marker says
 * its state in visually-hidden text, so a state is never told by colour alone.
 *
 * A `done` step is a button when `onStepSelect` is given (Tab reaches it,
 * Enter/Space selects it); without it no step is interactive. The stepper holds
 * no step content: the caller renders the current step's body.
 *
 * At the narrow breakpoint the list collapses to one line, "Step 2 of 3: Pick
 * tools", with the other steps visually hidden (still in the list).
 */
import type { ReactNode } from 'react';

import { AlertTriangleIcon, CheckIcon } from './icons';

export type StepperStatus = 'done' | 'current' | 'upcoming' | 'error';

export interface StepperStep {
  readonly id: string;
  readonly label: string;
  readonly status: StepperStatus;
}

export interface StepperProps {
  readonly steps: readonly StepperStep[];
  readonly 'aria-label': string;
  /** Called with a `done` step's id; when omitted no step is interactive. */
  readonly onStepSelect?: (id: string) => void;
}

const STATUS_TEXT: Record<StepperStatus, string> = {
  done: 'completed',
  current: 'current step',
  upcoming: 'not started',
  error: 'failed',
};

const MARKER_CLASS: Record<StepperStatus, string> = {
  done: 'tai-stepper-marker tai-stepper-marker-done',
  current: 'tai-stepper-marker tai-stepper-marker-current',
  upcoming: 'tai-stepper-marker tai-stepper-marker-upcoming',
  error: 'tai-stepper-marker tai-stepper-marker-error',
};

const STEP_CLASS: Record<StepperStatus, string> = {
  done: 'tai-stepper-step tai-stepper-step-done',
  current: 'tai-stepper-step tai-stepper-step-current',
  upcoming: 'tai-stepper-step tai-stepper-step-upcoming',
  error: 'tai-stepper-step',
};

function Marker({ status, index }: { status: StepperStatus; index: number }): ReactNode {
  return (
    <span className={MARKER_CLASS[status]} aria-hidden="true">
      {status === 'done' ? (
        <CheckIcon />
      ) : status === 'error' ? (
        <AlertTriangleIcon />
      ) : (
        String(index + 1)
      )}
    </span>
  );
}

export function Stepper({ steps, 'aria-label': label, onStepSelect }: StepperProps): ReactNode {
  const currentIndex = steps.findIndex((step) => step.status === 'current');
  return (
    <nav aria-label={label}>
      <ol className="tai-stepper">
        {steps.map((step, index) => {
          const body = (
            <>
              <Marker status={step.status} index={index} />
              <span className="tai-stepper-label">
                {currentIndex === index ? (
                  <span className="tai-stepper-position">{`Step ${String(index + 1)} of ${String(steps.length)}: `}</span>
                ) : null}
                {step.label}
              </span>
              <span className="tai-visually-hidden">{`, ${STATUS_TEXT[step.status]}`}</span>
            </>
          );
          return (
            <li
              key={step.id}
              className={STEP_CLASS[step.status]}
              aria-current={step.status === 'current' ? 'step' : undefined}
            >
              {step.status === 'done' && onStepSelect !== undefined ? (
                <button
                  type="button"
                  className="tai-stepper-button"
                  onClick={() => {
                    onStepSelect(step.id);
                  }}
                >
                  {body}
                </button>
              ) : (
                <span className="tai-stepper-button">{body}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
