import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { TemplatedText } from '@tai42/api-client';

import { SubjectScopeFields } from './SubjectScopeFields';

/** A controlled harness so a typed value accumulates as it would under a real parent. */
function Harness({ onScope }: { readonly onScope: (value: TemplatedText | null) => void }) {
  const [subject, setSubject] = useState<TemplatedText>({ content: '' });
  const [scope, setScope] = useState<TemplatedText | null>({ content: 'seed' });
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
        subjectExpr={{ content: '' }}
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

  it('reports subject edits as inline content', async () => {
    const user = userEvent.setup();
    const onSubjectChange = vi.fn();
    render(
      <SubjectScopeFields
        subjectExpr={{ content: '' }}
        scopeExpr={null}
        onSubjectChange={onSubjectChange}
        onScopeChange={vi.fn()}
      />,
    );
    await user.type(screen.getByRole('textbox', { name: 'Subject' }), '.id');
    expect(onSubjectChange).toHaveBeenLastCalledWith({ content: '.id' });
  });

  it('reports a non-blank scope as inline content and a cleared scope as null', async () => {
    const user = userEvent.setup();
    const onScope = vi.fn();
    render(<Harness onScope={onScope} />);
    const scope = screen.getByRole('textbox', { name: 'Scope' });
    await user.clear(scope);
    expect(onScope).toHaveBeenLastCalledWith(null);
    await user.type(scope, '.t');
    expect(onScope).toHaveBeenLastCalledWith({ content: '.t' });
  });

  it('surfaces a subject error', () => {
    render(
      <SubjectScopeFields
        subjectExpr={{ content: '' }}
        scopeExpr={null}
        onSubjectChange={vi.fn()}
        onScopeChange={vi.fn()}
        subjectError="This is not valid jq."
      />,
    );
    expect(screen.getByText('This is not valid jq.')).toBeInTheDocument();
  });

  it('authors the subject as a stored template when the stored source is chosen', async () => {
    const user = userEvent.setup();
    const onSubjectChange = vi.fn();
    render(
      <SubjectScopeFields
        subjectExpr={{ content: '' }}
        scopeExpr={null}
        onSubjectChange={onSubjectChange}
        onScopeChange={vi.fn()}
        templates={{ templates: [{ id: 'subject_key' }] }}
      />,
    );
    const subjectSource = screen.getByRole('radiogroup', { name: 'Subject source' });
    await user.click(within(subjectSource).getByRole('radio', { name: 'Stored template' }));
    await user.click(screen.getByRole('combobox', { name: 'Subject' }));
    await user.click(await screen.findByRole('option', { name: 'subject_key' }));
    expect(onSubjectChange).toHaveBeenLastCalledWith({ id: 'subject_key' });
  });
});
