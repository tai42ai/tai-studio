import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SubjectScopeFields } from './SubjectScopeFields';

/** A controlled harness so a typed value accumulates as it would under a real parent. */
function Harness({ onScope }: { readonly onScope: (value: string | null) => void }) {
  const [subject, setSubject] = useState('');
  const [scope, setScope] = useState<string | null>('seed');
  return (
    <SubjectScopeFields
      subjectExpr={subject}
      scopeExpr={scope}
      onSubjectChange={setSubject}
      onScopeChange={(next) => {
        setScope(next);
        onScope(next);
      }}
    />
  );
}

describe('SubjectScopeFields', () => {
  it('renders the subject and scope help copy', () => {
    render(
      <SubjectScopeFields
        subjectExpr=""
        scopeExpr={null}
        onSubjectChange={vi.fn()}
        onScopeChange={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        'The record key this binding reads and updates: a key string, or a full subject object.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Optional. A jq condition; when it is false this state is skipped for the run.',
      ),
    ).toBeInTheDocument();
  });

  it('reports subject edits', async () => {
    const user = userEvent.setup();
    const onSubjectChange = vi.fn();
    render(
      <SubjectScopeFields
        subjectExpr=""
        scopeExpr={null}
        onSubjectChange={onSubjectChange}
        onScopeChange={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText('Subject'), '.id');
    expect(onSubjectChange).toHaveBeenCalled();
  });

  it('reports a non-blank scope verbatim and a cleared scope as null', async () => {
    const user = userEvent.setup();
    const onScope = vi.fn();
    render(<Harness onScope={onScope} />);
    const scope = screen.getByLabelText('Scope');
    await user.clear(scope);
    expect(onScope).toHaveBeenLastCalledWith(null);
    await user.type(scope, '.t');
    expect(onScope).toHaveBeenLastCalledWith('.t');
  });

  it('surfaces a subject error', () => {
    render(
      <SubjectScopeFields
        subjectExpr=""
        scopeExpr={null}
        onSubjectChange={vi.fn()}
        onScopeChange={vi.fn()}
        subjectError="This is not valid jq."
      />,
    );
    expect(screen.getByText('This is not valid jq.')).toBeInTheDocument();
  });
});
