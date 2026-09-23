/**
 * The shared subject sub-form: the `buildSubject` parse (untouched → no subject, fully
 * filled → a subject, partial → a loud refusal), the target-option mapping, the field
 * state hook, and the presentational section's collapsed/expanded render with its
 * host-supplied copy.
 */
import { act, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  buildSubject,
  SUBJECT_INCOMPLETE_MESSAGE,
  SubjectSection,
  toSubjectTargetOptions,
  useSubjectFields,
} from './subject-section';

describe('buildSubject', () => {
  it('sends no subject when the sub-form is untouched', () => {
    expect(buildSubject({ target: '', kind: '', key: '' })).toEqual({ ok: true, subject: null });
  });

  it('builds a subject when target, kind and key are all filled', () => {
    expect(buildSubject({ target: 'agent:assistant', kind: 'person', key: 'a-42' })).toEqual({
      ok: true,
      subject: { target_kind: 'agent', target_name: 'assistant', kind: 'person', key: 'a-42' },
    });
  });

  it('splits only on the first colon so a target name may contain one', () => {
    expect(buildSubject({ target: 'tool:a:b', kind: 'k', key: 'v' })).toEqual({
      ok: true,
      subject: { target_kind: 'tool', target_name: 'a:b', kind: 'k', key: 'v' },
    });
  });

  it('refuses a partial subject (a target but no kind/key)', () => {
    expect(buildSubject({ target: 'agent:assistant', kind: '', key: '' })).toEqual({
      ok: false,
      message: SUBJECT_INCOMPLETE_MESSAGE,
    });
  });

  it('refuses a kind/key with no target', () => {
    expect(buildSubject({ target: '', kind: 'person', key: 'a-42' })).toEqual({
      ok: false,
      message: SUBJECT_INCOMPLETE_MESSAGE,
    });
  });

  it('refuses a target with an empty kind segment (a leading colon)', () => {
    expect(buildSubject({ target: ':assistant', kind: 'person', key: 'a-42' })).toEqual({
      ok: false,
      message: SUBJECT_INCOMPLETE_MESSAGE,
    });
  });
});

describe('toSubjectTargetOptions', () => {
  it('maps routes to `kind:name` values with a `kind · name` label', () => {
    expect(
      toSubjectTargetOptions([
        { target_kind: 'agent', target_name: 'assistant' },
        { target_kind: 'tool', target_name: 'echo' },
      ]),
    ).toEqual([
      { value: 'agent:assistant', label: 'agent · assistant' },
      { value: 'tool:echo', label: 'tool · echo' },
    ]);
  });
});

describe('useSubjectFields', () => {
  it('starts collapsed and empty and updates each field', () => {
    const { result } = renderHook(() => useSubjectFields());
    expect(result.current.open).toBe(false);
    expect(result.current.target).toBe('');
    act(() => {
      result.current.setOpen(true);
      result.current.setTarget('agent:assistant');
      result.current.setKind('person');
      result.current.setKey('a-42');
      result.current.setError('nope');
    });
    expect(result.current.open).toBe(true);
    expect(result.current.target).toBe('agent:assistant');
    expect(result.current.kind).toBe('person');
    expect(result.current.key).toBe('a-42');
    expect(result.current.error).toBe('nope');
  });
});

const SECTION_COPY = {
  caption: 'Track the run’s result on a subject.',
  targetPlaceholder: 'No subject',
  subjectKeyDescription: 'A literal key within the subject family.',
} as const;

describe('SubjectSection', () => {
  it('renders only the toggle while collapsed', () => {
    render(
      <SubjectSection
        open={false}
        onToggle={vi.fn()}
        target=""
        onTargetChange={vi.fn()}
        kind=""
        onKindChange={vi.fn()}
        subjectKey=""
        onKeyChange={vi.fn()}
        error={null}
        targetOptions={[]}
        {...SECTION_COPY}
      />,
    );
    expect(screen.getByRole('button', { name: 'Subject (optional)' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByLabelText('Subject kind')).toBeNull();
  });

  it('renders the fields, caption and error while expanded', () => {
    render(
      <SubjectSection
        open
        onToggle={vi.fn()}
        target=""
        onTargetChange={vi.fn()}
        kind=""
        onKindChange={vi.fn()}
        subjectKey=""
        onKeyChange={vi.fn()}
        error={SUBJECT_INCOMPLETE_MESSAGE}
        targetOptions={[{ value: 'agent:assistant', label: 'agent · assistant' }]}
        {...SECTION_COPY}
      />,
    );
    expect(screen.getByText(SECTION_COPY.caption)).toBeInTheDocument();
    expect(screen.getByLabelText('Subject kind')).toBeInTheDocument();
    expect(screen.getByLabelText('Subject key')).toBeInTheDocument();
    expect(screen.getByText(SECTION_COPY.subjectKeyDescription)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(SUBJECT_INCOMPLETE_MESSAGE);
  });
});
