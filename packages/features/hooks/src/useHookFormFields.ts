/**
 * The register form's local field state, in two modes: a blank create form, or a
 * form prefilled from an existing hook (the per-row Edit door). `reset` clears the
 * fields after a successful create and bumps `formResetToken` so the seeded-once
 * condition/expr controls remount blank.
 */
import { useState } from 'react';
import type { HookParams, StateBinding, TemplatedText } from '@tai42/api-client';

/** Serialize a hook's `tool_kwargs` for the textarea; an empty map prefills blank. */
function serializeToolKwargs(kwargs: Record<string, unknown>): string {
  return Object.keys(kwargs).length === 0 ? '' : JSON.stringify(kwargs, null, 2);
}

interface IdentitySeed {
  readonly name: string;
  readonly topic: string;
  readonly tool: string;
  readonly toolKwargs: string;
  readonly condition: TemplatedText | null;
  readonly expr: TemplatedText | null;
  readonly executionKey: string;
  readonly stateBinding: StateBinding | null;
}

interface SubjectSeed {
  readonly subjectTarget: string;
  readonly subjectKind: string;
  readonly subjectKeyExpr: string;
  readonly subjectOpen: boolean;
}

/** The blank-or-prefilled seed for the identity + kwargs + gate fields. */
function identitySeed(initial?: HookParams): IdentitySeed {
  if (initial === undefined) {
    return {
      name: '',
      topic: '',
      tool: '',
      toolKwargs: '',
      condition: null,
      expr: null,
      executionKey: '',
      stateBinding: null,
    };
  }
  return {
    name: initial.name,
    topic: initial.topic,
    tool: initial.tool,
    toolKwargs: serializeToolKwargs(initial.tool_kwargs),
    condition: initial.condition,
    expr: initial.expr,
    executionKey: initial.execution_key,
    stateBinding: initial.state_binding,
  };
}

/** The blank-or-prefilled seed for the optional subject group. */
function subjectSeed(initial?: HookParams): SubjectSeed {
  const subject = initial?.subject ?? null;
  if (subject === null) {
    return { subjectTarget: '', subjectKind: '', subjectKeyExpr: '', subjectOpen: false };
  }
  return {
    subjectTarget: `${subject.target_kind}:${subject.target_name}`,
    subjectKind: subject.kind,
    subjectKeyExpr: subject.key_expr.content ?? '',
    subjectOpen: true,
  };
}

export interface HookFormFields {
  readonly name: string;
  readonly setName: (value: string) => void;
  readonly topic: string;
  readonly setTopic: (value: string) => void;
  readonly tool: string;
  readonly setTool: (value: string) => void;
  readonly toolKwargs: string;
  readonly setToolKwargs: (value: string) => void;
  readonly condition: TemplatedText | null;
  readonly setCondition: (value: TemplatedText | null) => void;
  readonly expr: TemplatedText | null;
  readonly setExpr: (value: TemplatedText | null) => void;
  readonly executionKey: string;
  readonly setExecutionKey: (value: string) => void;
  readonly subjectTarget: string;
  readonly setSubjectTarget: (value: string) => void;
  readonly subjectKind: string;
  readonly setSubjectKind: (value: string) => void;
  readonly subjectKeyExpr: string;
  readonly setSubjectKeyExpr: (value: string) => void;
  readonly subjectOpen: boolean;
  readonly setSubjectOpen: (updater: (open: boolean) => boolean) => void;
  readonly stateBinding: StateBinding | null;
  readonly setStateBinding: (value: StateBinding | null) => void;
  readonly submitted: boolean;
  readonly setSubmitted: (value: boolean) => void;
  readonly kwargsError: string | null;
  readonly setKwargsError: (value: string | null) => void;
  readonly subjectError: string | null;
  readonly setSubjectError: (value: string | null) => void;
  readonly formResetToken: number;
  readonly reset: () => void;
}

export function useHookFormFields(initial?: HookParams): HookFormFields {
  const [identity] = useState(() => identitySeed(initial));
  const [subject] = useState(() => subjectSeed(initial));

  const [name, setName] = useState(identity.name);
  const [topic, setTopic] = useState(identity.topic);
  const [tool, setTool] = useState(identity.tool);
  const [toolKwargs, setToolKwargs] = useState(identity.toolKwargs);
  const [condition, setCondition] = useState<TemplatedText | null>(identity.condition);
  const [expr, setExpr] = useState<TemplatedText | null>(identity.expr);
  const [executionKey, setExecutionKey] = useState(identity.executionKey);
  const [subjectTarget, setSubjectTarget] = useState(subject.subjectTarget);
  const [subjectKind, setSubjectKind] = useState(subject.subjectKind);
  const [subjectKeyExpr, setSubjectKeyExpr] = useState(subject.subjectKeyExpr);
  const [subjectOpen, setSubjectOpen] = useState(subject.subjectOpen);
  const [stateBinding, setStateBinding] = useState<StateBinding | null>(identity.stateBinding);
  const [submitted, setSubmitted] = useState(false);
  const [kwargsError, setKwargsError] = useState<string | null>(null);
  const [subjectError, setSubjectError] = useState<string | null>(null);
  const [formResetToken, setFormResetToken] = useState(0);

  const reset = (): void => {
    setName('');
    setTopic('');
    setTool('');
    setToolKwargs('');
    setCondition(null);
    setExpr(null);
    setExecutionKey('');
    setSubjectTarget('');
    setSubjectKind('');
    setSubjectKeyExpr('');
    setSubmitted(false);
    setKwargsError(null);
    setSubjectError(null);
    setFormResetToken((token) => token + 1);
  };

  return {
    name,
    setName,
    topic,
    setTopic,
    tool,
    setTool,
    toolKwargs,
    setToolKwargs,
    condition,
    setCondition,
    expr,
    setExpr,
    executionKey,
    setExecutionKey,
    subjectTarget,
    setSubjectTarget,
    subjectKind,
    setSubjectKind,
    subjectKeyExpr,
    setSubjectKeyExpr,
    subjectOpen,
    setSubjectOpen,
    stateBinding,
    setStateBinding,
    submitted,
    setSubmitted,
    kwargsError,
    setKwargsError,
    subjectError,
    setSubjectError,
    formResetToken,
    reset,
  };
}
