import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ExpressionEditorsProvider } from './context';
import { ExpressionField, ExpressionEditorLauncher } from './ExpressionField';
import {
  EXPRESSION_EDITOR_CONTRACT_VERSION,
  type ExpressionEditorContribution,
  type ExpressionEditorProps,
  type ExpressionFieldDeclaration,
} from './types';

const shape = {
  id: 'test.node',
  label: 'node envelope',
  blurb: 'the node input',
  keys: [{ name: 'item', gloss: 'the current item' }],
  returns: 'an object',
};

const declaration: ExpressionFieldDeclaration = { language: 'jq', shape };

/** A stand-in editor that echoes the props it was mounted with. */
function StubEditor({
  initialExpression,
  fieldLabel,
  readOnly,
  declaration: decl,
  onSave,
  onClose,
}: ExpressionEditorProps): ReactNode {
  return (
    <div data-testid="editor">
      <span data-testid="editor-initial">{initialExpression}</span>
      <span data-testid="editor-label">{fieldLabel}</span>
      <span data-testid="editor-readonly">{readOnly === true ? 'ro' : 'rw'}</span>
      <span data-testid="editor-shape">{decl.shape?.label ?? 'none'}</span>
      <button
        type="button"
        onClick={() => {
          onSave('saved-expr');
        }}
      >
        editor-save
      </button>
      <button type="button" onClick={onClose}>
        editor-close
      </button>
    </div>
  );
}

const contribution = (
  overrides: Partial<ExpressionEditorContribution> = {},
): ExpressionEditorContribution => ({
  language: 'jq',
  contractVersion: EXPRESSION_EDITOR_CONTRACT_VERSION,
  load: () => Promise.resolve({ Editor: StubEditor }),
  ...overrides,
});

function withProvider(node: ReactNode, editor?: ExpressionEditorContribution): ReactNode {
  const editors = new Map(editor ? [[editor.language, editor]] : []);
  return <ExpressionEditorsProvider editors={editors}>{node}</ExpressionEditorsProvider>;
}

describe('ExpressionField', () => {
  it('renders a plain text field with no launcher when no provider is mounted', () => {
    const onChange = vi.fn();
    render(
      <ExpressionField label="Filter" declaration={declaration} value="." onChange={onChange} />,
    );

    expect(screen.getByRole('textbox')).toHaveValue('.');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders a plain text field when a provider is mounted but no editor covers the language', () => {
    render(
      withProvider(
        <ExpressionField label="Filter" declaration={declaration} value="." onChange={vi.fn()} />,
      ),
    );
    // Provider present, but its editor is for a different language.
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('edits through the textarea', () => {
    const onChange = vi.fn();
    render(
      withProvider(
        <ExpressionField label="Filter" declaration={declaration} value="." onChange={onChange} />,
        contribution(),
      ),
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '.foo' } });
    expect(onChange).toHaveBeenCalledWith('.foo');
  });

  it('grows a launcher and opens the editor, saving back through onChange', async () => {
    const onChange = vi.fn();
    render(
      withProvider(
        <ExpressionField label="Filter" declaration={declaration} value=".x" onChange={onChange} />,
        contribution(),
      ),
    );

    const launcher = screen.getByRole('button', { name: /open the visual editor for filter/i });
    // The shape label enriches the accessible name before the editor even opens.
    expect(launcher).toHaveAccessibleName(/input: node envelope/i);
    expect(launcher.textContent).toContain('Visual editor');

    fireEvent.click(launcher);

    const editor = await screen.findByTestId('editor');
    expect(editor).toBeInTheDocument();
    expect(screen.getByTestId('editor-initial')).toHaveTextContent('.x');
    expect(screen.getByTestId('editor-label')).toHaveTextContent('Filter');
    expect(screen.getByTestId('editor-readonly')).toHaveTextContent('rw');
    expect(screen.getByTestId('editor-shape')).toHaveTextContent('node envelope');

    fireEvent.click(screen.getByText('editor-save'));
    expect(onChange).toHaveBeenCalledWith('saved-expr');
    // Saving closes the editor.
    await waitFor(() => {
      expect(screen.queryByTestId('editor')).toBeNull();
    });
  });

  it('closes the editor without saving on close', async () => {
    const onChange = vi.fn();
    render(
      withProvider(
        <ExpressionField label="Filter" declaration={declaration} value=".x" onChange={onChange} />,
        contribution(),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: /open the visual editor/i }));
    fireEvent.click(await screen.findByText('editor-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('editor')).toBeNull();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('warms the editor chunk on open-intent (hover and focus) and on click', () => {
    const preload = vi.fn();
    render(
      withProvider(
        <ExpressionField label="Filter" declaration={declaration} value="." onChange={vi.fn()} />,
        contribution({ preload }),
      ),
    );
    const launcher = screen.getByRole('button', { name: /open the visual editor/i });

    fireEvent.mouseEnter(launcher);
    expect(preload).toHaveBeenCalledTimes(1);
    fireEvent.focus(launcher);
    expect(preload).toHaveBeenCalledTimes(2);
    fireEvent.click(launcher);
    expect(preload).toHaveBeenCalledTimes(3);
  });

  it('opens even when the contribution declares no preload', async () => {
    render(
      withProvider(
        <ExpressionField label="Filter" declaration={declaration} value="." onChange={vi.fn()} />,
        contribution({ preload: undefined }),
      ),
    );
    const launcher = screen.getByRole('button', { name: /open the visual editor/i });
    fireEvent.mouseEnter(launcher);
    fireEvent.click(launcher);
    expect(await screen.findByTestId('editor')).toBeInTheDocument();
  });

  it('renders an icon-only launcher when compact (name on aria-label, no visible text)', () => {
    render(
      withProvider(
        <ExpressionField
          label="Filter"
          declaration={declaration}
          value="."
          onChange={vi.fn()}
          compact
        />,
        contribution(),
      ),
    );
    const launcher = screen.getByRole('button', { name: /open the visual editor for filter/i });
    expect(launcher.textContent).not.toContain('Visual editor');
  });

  it('disables the textarea and opens the editor read-only when disabled', async () => {
    render(
      withProvider(
        <ExpressionField
          label="Filter"
          declaration={declaration}
          value=".x"
          onChange={vi.fn()}
          disabled
        />,
        contribution(),
      ),
    );
    expect(screen.getByRole('textbox')).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /open the visual editor/i }));
    expect(await screen.findByTestId('editor-readonly')).toHaveTextContent('ro');
  });

  it('surfaces a loud inline error when the editor chunk fails to load', async () => {
    // An unhandled-rejection listener keeps the rejected load() from failing the run;
    // React re-throws it through Suspense into the boundary, which is what we assert.
    const onUnhandled = (event: PromiseRejectionEvent): void => {
      event.preventDefault();
    };
    window.addEventListener('unhandledrejection', onUnhandled);
    try {
      render(
        withProvider(
          <ExpressionField label="Filter" declaration={declaration} value="." onChange={vi.fn()} />,
          contribution({ load: () => Promise.reject(new Error('chunk gone')) }),
        ),
      );
      fireEvent.click(screen.getByRole('button', { name: /open the visual editor/i }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/visual editor/i);
      expect(alert).toHaveTextContent(/chunk gone/i);
    } finally {
      window.removeEventListener('unhandledrejection', onUnhandled);
    }
  });

  it('titles the editor with an explicit fieldLabel override', async () => {
    render(
      withProvider(
        <ExpressionField
          label="Filter"
          fieldLabel="Response filter"
          declaration={declaration}
          value="."
          onChange={vi.fn()}
        />,
        contribution(),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: /response filter/i }));
    expect(await screen.findByTestId('editor-label')).toHaveTextContent('Response filter');
  });

  it('uses a plain launcher title when the declaration carries no shape', () => {
    render(
      withProvider(
        <ExpressionField
          label="Filter"
          declaration={{ language: 'jq' }}
          value="."
          onChange={vi.fn()}
        />,
        contribution(),
      ),
    );
    const launcher = screen.getByRole('button', { name: 'Open the visual editor for Filter' });
    expect(launcher).toHaveAttribute('title', 'Visual editor');
  });

  it('renders the expression content in monospace by default (multiline textarea)', () => {
    render(
      <ExpressionField label="Filter" declaration={declaration} value="." onChange={vi.fn()} />,
    );
    const control = screen.getByRole('textbox');
    expect(control.tagName).toBe('TEXTAREA');
    expect(control).toHaveClass('tai-textarea', 'tai-textarea-mono');
  });

  it('drops the monospace class when monospace is false', () => {
    render(
      <ExpressionField
        label="Filter"
        declaration={declaration}
        value="."
        onChange={vi.fn()}
        monospace={false}
      />,
    );
    const control = screen.getByRole('textbox');
    expect(control).toHaveClass('tai-textarea');
    expect(control).not.toHaveClass('tai-textarea-mono');
  });

  it('authors on a single line (a monospace TextInput) when multiline is false', () => {
    render(
      <ExpressionField
        label="Filter"
        declaration={declaration}
        value=".x"
        onChange={vi.fn()}
        multiline={false}
      />,
    );
    const control = screen.getByRole('textbox');
    expect(control.tagName).toBe('INPUT');
    expect(control).toHaveClass('tai-input', 'tai-input-mono');
    expect(control).toHaveValue('.x');
  });

  it('forwards narrow native attributes through textareaProps without severing the wiring', () => {
    const onChange = vi.fn();
    render(
      <ExpressionField
        label="Filter"
        declaration={declaration}
        value="."
        onChange={onChange}
        textareaProps={{ name: 'jqBody', maxLength: 120, style: { minHeight: '8rem' } }}
      />,
    );
    const control = screen.getByRole('textbox');
    expect(control).toHaveAttribute('name', 'jqBody');
    expect(control).toHaveAttribute('maxlength', '120');
    expect((control as HTMLTextAreaElement).style.minHeight).toBe('8rem');
    // The field still owns the edit wiring the pass-through cannot touch.
    fireEvent.change(control, { target: { value: '.foo' } });
    expect(onChange).toHaveBeenCalledWith('.foo');
  });

  it('keeps the label as the accessible name while visually hiding it (hideLabel)', () => {
    render(
      withProvider(
        <ExpressionField
          label="Argument 2 expression"
          declaration={declaration}
          value=".x"
          onChange={vi.fn()}
          hideLabel
        />,
        contribution(),
      ),
    );
    const control = screen.getByRole('textbox');
    expect(control).toHaveAccessibleName('Argument 2 expression');
    expect(screen.getByText('Argument 2 expression')).toHaveClass('tai-visually-hidden');
  });

  it('overrides the launcher hover title with launcherTitle (a rerun-style hint)', () => {
    render(
      withProvider(
        <ExpressionField
          label="Filter"
          declaration={declaration}
          value="."
          onChange={vi.fn()}
          launcherTitle="Editing reruns downstream nodes"
        />,
        contribution(),
      ),
    );
    expect(screen.getByRole('button', { name: /open the visual editor/i })).toHaveAttribute(
      'title',
      'Editing reruns downstream nodes',
    );
  });

  it('opens the editor read-only for a disabled field but keeps it editable when editorReadOnly is false', async () => {
    render(
      withProvider(
        <ExpressionField
          label="Filter"
          declaration={declaration}
          value=".x"
          onChange={vi.fn()}
          disabled
          editorReadOnly={false}
        />,
        contribution(),
      ),
    );
    // The textarea stays disabled, but the editor opens read-WRITE because
    // editorReadOnly decouples the two.
    expect(screen.getByRole('textbox')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /open the visual editor/i }));
    expect(await screen.findByTestId('editor-readonly')).toHaveTextContent('rw');
  });
});

describe('ExpressionEditorLauncher (standalone)', () => {
  it('renders nothing with no provider above it (graceful absence)', () => {
    const { container } = render(
      <ExpressionEditorLauncher
        declaration={declaration}
        value="."
        onSave={vi.fn()}
        fieldLabel="Argument 1 expression"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when a provider is mounted but no editor covers the language', () => {
    const { container } = render(
      withProvider(
        <ExpressionEditorLauncher
          declaration={declaration}
          value="."
          onSave={vi.fn()}
          fieldLabel="Argument 1 expression"
        />,
      ),
    );
    expect(container.querySelector('button')).toBeNull();
  });

  it('mounts standalone and opens the editor, saving through onSave', async () => {
    const onSave = vi.fn();
    render(
      withProvider(
        <ExpressionEditorLauncher
          declaration={declaration}
          value=".x"
          onSave={onSave}
          fieldLabel="Argument 1 expression"
          compact
        />,
        contribution(),
      ),
    );
    // Compact: icon-only, the full name on aria-label.
    const launcher = screen.getByRole('button', {
      name: /open the visual editor for argument 1 expression/i,
    });
    expect(launcher.textContent).not.toContain('Visual editor');

    fireEvent.click(launcher);
    expect(await screen.findByTestId('editor-initial')).toHaveTextContent('.x');
    fireEvent.click(screen.getByText('editor-save'));
    expect(onSave).toHaveBeenCalledWith('saved-expr');
  });

  it('opens read-only when editorReadOnly is set', async () => {
    render(
      withProvider(
        <ExpressionEditorLauncher
          declaration={declaration}
          value=".x"
          onSave={vi.fn()}
          fieldLabel="Argument 1 expression"
          editorReadOnly
        />,
        contribution(),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: /open the visual editor/i }));
    expect(await screen.findByTestId('editor-readonly')).toHaveTextContent('ro');
  });

  it('overrides the hover title', () => {
    render(
      withProvider(
        <ExpressionEditorLauncher
          declaration={declaration}
          value="."
          onSave={vi.fn()}
          fieldLabel="Argument 1 expression"
          title="Rerun hint"
        />,
        contribution(),
      ),
    );
    expect(screen.getByRole('button', { name: /open the visual editor/i })).toHaveAttribute(
      'title',
      'Rerun hint',
    );
  });

  it('warms the chunk on open-intent (hover and focus) and on click', () => {
    const preload = vi.fn();
    render(
      withProvider(
        <ExpressionEditorLauncher
          declaration={declaration}
          value="."
          onSave={vi.fn()}
          fieldLabel="Argument 1 expression"
        />,
        contribution({ preload }),
      ),
    );
    const launcher = screen.getByRole('button', { name: /open the visual editor/i });
    fireEvent.mouseEnter(launcher);
    fireEvent.focus(launcher);
    fireEvent.click(launcher);
    expect(preload).toHaveBeenCalledTimes(3);
  });

  it('surfaces a loud inline error when the standalone editor chunk fails to load', async () => {
    const onUnhandled = (event: PromiseRejectionEvent): void => {
      event.preventDefault();
    };
    window.addEventListener('unhandledrejection', onUnhandled);
    try {
      render(
        withProvider(
          <ExpressionEditorLauncher
            declaration={declaration}
            value="."
            onSave={vi.fn()}
            fieldLabel="Argument 1 expression"
          />,
          contribution({ load: () => Promise.reject(new Error('chunk gone')) }),
        ),
      );
      fireEvent.click(screen.getByRole('button', { name: /open the visual editor/i }));
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/visual editor/i);
      expect(alert).toHaveTextContent(/chunk gone/i);
    } finally {
      window.removeEventListener('unhandledrejection', onUnhandled);
    }
  });
});
