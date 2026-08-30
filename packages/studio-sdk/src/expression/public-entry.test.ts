import { describe, expect, it } from 'vitest';

import * as sdk from '../index';
import type {
  ExpressionLanguage,
  ExpressionInputKey,
  ExpressionShapeDescriptor,
  ExpressionSampleInputProvider,
  ExpressionValidationResult,
  ExpressionServerValidate,
  ExpressionFieldDeclaration,
  ExpressionEditorProps,
  ExpressionEditorContribution,
  ExpressionEditorsProviderProps,
  ExpressionFieldProps,
  ExpressionEditorLauncherProps,
  ExpressionControlProps,
} from '../index';

describe('public entry — expression surface', () => {
  it('exports the runtime values from the plugin surface', () => {
    expect(sdk.EXPRESSION_EDITOR_CONTRACT_VERSION).toBe(1);
    expect(typeof sdk.ExpressionField).toBe('function');
    expect(typeof sdk.ExpressionEditorLauncher).toBe('function');
    expect(typeof sdk.ExpressionEditorsProvider).toBe('function');
    expect(typeof sdk.useExpressionEditor).toBe('function');
  });

  it('exports the declaration + editor types (compile-time construction)', () => {
    // Each binding here fails to compile if the type is not exported or its shape
    // drifts — the typecheck gate is the real assertion; the runtime expect keeps
    // the test non-empty.
    const language: ExpressionLanguage = 'jq';
    const key: ExpressionInputKey = { name: 'item', gloss: 'the current item' };
    const shape: ExpressionShapeDescriptor = {
      id: 'x.node',
      label: 'node',
      blurb: 'the node input',
      keys: [key],
      returns: 'an object',
      caveats: ['none'],
      sample: {},
    };
    const sample: ExpressionSampleInputProvider = () => ({});
    const validate: ExpressionServerValidate = () =>
      Promise.resolve({ ok: true } satisfies ExpressionValidationResult);
    const declaration: ExpressionFieldDeclaration = {
      language,
      shape,
      sampleInput: sample,
      serverValidate: validate,
    };
    const editorProps: ExpressionEditorProps = {
      declaration,
      open: true,
      initialExpression: '.',
      fieldLabel: 'Filter',
      readOnly: false,
      onSave: () => undefined,
      onClose: () => undefined,
    };
    const contribution: ExpressionEditorContribution = {
      language,
      contractVersion: sdk.EXPRESSION_EDITOR_CONTRACT_VERSION,
      load: () => Promise.resolve({ Editor: () => null }),
    };
    const providerProps: ExpressionEditorsProviderProps = {
      editors: new Map([[language, contribution]]),
      children: null,
    };
    const controlProps: ExpressionControlProps = { name: 'jqBody', 'aria-describedby': 'x' };
    const fieldProps: ExpressionFieldProps = {
      label: 'Filter',
      declaration,
      value: '.',
      onChange: () => undefined,
      hideLabel: true,
      multiline: false,
      monospace: false,
      editorReadOnly: true,
      launcherTitle: 'Rerun hint',
      textareaProps: controlProps,
    };
    const launcherProps: ExpressionEditorLauncherProps = {
      declaration,
      value: '.',
      onSave: () => undefined,
      fieldLabel: 'Filter',
      compact: true,
      editorReadOnly: true,
      title: 'Rerun hint',
    };

    expect(declaration.language).toBe('jq');
    expect(editorProps.open).toBe(true);
    expect(providerProps.editors.get('jq')).toBe(contribution);
    expect(fieldProps.value).toBe('.');
    expect(launcherProps.fieldLabel).toBe('Filter');
  });
});
