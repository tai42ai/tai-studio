/**
 * The schemas the server emits for its jq-typed fields, verbatim — the shapes a
 * marked expression field really arrives in:
 *
 * - a tool form (`GET /api/tools/{name}/schema`) inlines every `$ref`: a required
 *   templated-text property is the type's own object with the property's keys merged
 *   in, and an optional one is `anyOf[<the type's object>, null]` with the property's
 *   keys on the wrapper — so the type's docstring rides along as `description`;
 * - a request model keeps `$ref` into `$defs`, with the property's keys beside it.
 *
 * Each export is the tool form (or model) cut down to the named properties, each
 * property unchanged.
 */
import type { JsonSchema } from './types';

/** A tool's `*_chain` variant: its required `jq_expression` merged into the inlined type. */
export const CHAIN_TOOL_FORM: JsonSchema = {
  additionalProperties: false,
  properties: {
    query: { type: 'string' },
    jq_expression: {
      additionalProperties: false,
      description:
        'A renderable text: its source plus the parameters its render takes.\n\nEXACTLY ONE source is set — ``content`` (the text inline) or ``id`` (the id of a\nstored resource holding the text); neither and both are refused at construction.\n``kwargs`` are the render parameters for the TEXT and apply either way, so moving a\ntext from inline to stored (or back) leaves its parameters untouched.',
      properties: {
        content: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null },
        id: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null },
        kwargs: { additionalProperties: true, type: 'object' },
      },
      type: 'object',
      'x-tai42-templated-text': { language: 'jinja' },
      'x-tai42-expression': {
        blurb: "the first tool's raw output",
        label: 'expression',
        language: 'jq',
        returns: "the second tool's kwargs object",
      },
    },
    next_tool_name: { type: 'string' },
  },
  required: ['query', 'jq_expression', 'next_tool_name'],
  type: 'object',
};

/** Hook registration: the optional `condition`, `anyOf[<inlined type>, null]`. */
export const HOOK_CONDITION_TOOL_FORM: JsonSchema = {
  type: 'object',
  properties: {
    condition: {
      anyOf: [
        {
          additionalProperties: false,
          description:
            'A renderable text: its source plus the parameters its render takes.\n\nEXACTLY ONE source is set — ``content`` (the text inline) or ``id`` (the id of a\nstored resource holding the text); neither and both are refused at construction.\n``kwargs`` are the render parameters for the TEXT and apply either way, so moving a\ntext from inline to stored (or back) leaves its parameters untouched.',
          properties: {
            content: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null },
            id: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null },
            kwargs: { additionalProperties: true, type: 'object' },
          },
          type: 'object',
          'x-tai42-templated-text': { language: 'jinja' },
        },
        { type: 'null' },
      ],
      default: null,
      'x-tai42-expression': {
        blurb:
          'the parsed webhook delivery (structured bodies merged top-level with query params; arbitrary text under raw_body)',
        caveats: [
          'an absent/empty condition always fires; a present condition that produces no output errors the fire loudly (it is not a silent skip)',
        ],
        label: 'condition',
        language: 'jq',
        returns: 'truthy to fire the hook; a falsy result skips it',
      },
    },
  },
};

/** Preset creation: `input_map`/`output_map`, typed `TemplatedText | str | None`, inlined. */
export const PRESET_MAPS_TOOL_FORM: JsonSchema = {
  type: 'object',
  properties: {
    input_map: {
      anyOf: [
        {
          additionalProperties: false,
          description:
            'A renderable text: its source plus the parameters its render takes.\n\nEXACTLY ONE source is set — ``content`` (the text inline) or ``id`` (the id of a\nstored resource holding the text); neither and both are refused at construction.\n``kwargs`` are the render parameters for the TEXT and apply either way, so moving a\ntext from inline to stored (or back) leaves its parameters untouched.',
          properties: {
            content: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null },
            id: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null },
            kwargs: { additionalProperties: true, type: 'object' },
          },
          type: 'object',
          'x-tai42-templated-text': { language: 'jinja' },
        },
        { type: 'string' },
        { type: 'null' },
      ],
      default: null,
      'x-tai42-expression': {
        blurb: "the caller's object, validated against the preset's input_schema",
        caveats: ['a key both the map result and fixed_kwargs set is refused'],
        label: 'input map',
        language: 'jq',
        returns: "an object of the base tool's arguments, merged with fixed_kwargs",
        sample: { query: 'status' },
        variables: [
          { blurb: "the preset's stored fixed_kwargs", name: 'fixed', sample: { limit: 10 } },
        ],
      },
    },
    output_map: {
      anyOf: [
        {
          additionalProperties: false,
          description:
            'A renderable text: its source plus the parameters its render takes.\n\nEXACTLY ONE source is set — ``content`` (the text inline) or ``id`` (the id of a\nstored resource holding the text); neither and both are refused at construction.\n``kwargs`` are the render parameters for the TEXT and apply either way, so moving a\ntext from inline to stored (or back) leaves its parameters untouched.',
          properties: {
            content: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null },
            id: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null },
            kwargs: { additionalProperties: true, type: 'object' },
          },
          type: 'object',
          'x-tai42-templated-text': { language: 'jinja' },
        },
        { type: 'string' },
        { type: 'null' },
      ],
      default: null,
      'x-tai42-expression': {
        blurb: "the base tool's result",
        caveats: ['the map never runs over a result that carries a secret'],
        label: 'output map',
        language: 'jq',
        returns:
          "the mapped result, then validated against the preset's output_schema when one is set",
        sample: { items: [{ id: 'a' }] },
      },
    },
  },
};

/** The preset creation request model: the same maps as `anyOf[$ref, string, null]`. */
export const PRESET_MAPS_MODEL: JsonSchema = {
  type: 'object',
  properties: {
    input_map: {
      anyOf: [{ $ref: '#/$defs/TemplatedText' }, { type: 'string' }, { type: 'null' }],
      default: null,
      title: 'Input Map',
      'x-tai42-expression': {
        blurb: "the caller's object, validated against the preset's input_schema",
        caveats: ['a key both the map result and fixed_kwargs set is refused'],
        label: 'input map',
        language: 'jq',
        returns: "an object of the base tool's arguments, merged with fixed_kwargs",
        sample: { query: 'status' },
        variables: [
          { blurb: "the preset's stored fixed_kwargs", name: 'fixed', sample: { limit: 10 } },
        ],
      },
    },
    output_map: {
      anyOf: [{ $ref: '#/$defs/TemplatedText' }, { type: 'string' }, { type: 'null' }],
      default: null,
      title: 'Output Map',
      'x-tai42-expression': {
        blurb: "the base tool's result",
        caveats: ['the map never runs over a result that carries a secret'],
        label: 'output map',
        language: 'jq',
        returns:
          "the mapped result, then validated against the preset's output_schema when one is set",
        sample: { items: [{ id: 'a' }] },
      },
    },
  },
  $defs: {
    TemplatedText: {
      additionalProperties: false,
      description:
        'A renderable text: its source plus the parameters its render takes.\n\nEXACTLY ONE source is set — ``content`` (the text inline) or ``id`` (the id of a\nstored resource holding the text); neither and both are refused at construction.\n``kwargs`` are the render parameters for the TEXT and apply either way, so moving a\ntext from inline to stored (or back) leaves its parameters untouched.',
      properties: {
        content: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null, title: 'Content' },
        id: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null, title: 'Id' },
        kwargs: { additionalProperties: true, title: 'Kwargs', type: 'object' },
      },
      title: 'TemplatedText',
      type: 'object',
      'x-tai42-templated-text': { language: 'jinja' },
    },
  },
};

/** A state binding: marked fields inside array items, merged-required and optional alike. */
export const STATE_BINDING_TOOL_FORM: JsonSchema = {
  type: 'object',
  properties: {
    state_binding: {
      anyOf: [
        {
          additionalProperties: false,
          description:
            'The optional binding a door carries: one or more :class:`StateAttach` entries. Frozen.\n\nThe same shape is stored on ``PresetBody``/``PresetSeed``, ``TargetConversationConfig``,\n``HookRegister`` and ``ScheduleCreate``, deposited on ``ToolInvocation`` through the\nambient dispatch context, and re-applied per binding site by a consumer.',
          properties: {
            states: {
              items: {
                additionalProperties: false,
                description:
                  "One state attached by a binding.\n\nCarries the ``state`` name, the ``templates`` to attach on it (attach-on-use, idempotent at save),\nthe ``subject_expr`` (a templated text rendering to a jq over the run input → a full subject object\nor the record KEY, its scope taken from the ambient door context and its kind from the state's\ndeclared subject kind), an optional ``scope_expr`` (a templated text rendering to a BOOLEAN predicate\nover the run input evaluated first — ``false`` skips this state for the run, a non-boolean is a loud\nerror, absent engages), and the ordered ``input_injections`` / ``updates``. Frozen.",
                properties: {
                  state: { type: 'string' },
                  templates: { items: { type: 'string' }, type: 'array' },
                  subject_expr: {
                    additionalProperties: false,
                    description:
                      'A renderable text: its source plus the parameters its render takes.\n\nEXACTLY ONE source is set — ``content`` (the text inline) or ``id`` (the id of a\nstored resource holding the text); neither and both are refused at construction.\n``kwargs`` are the render parameters for the TEXT and apply either way, so moving a\ntext from inline to stored (or back) leaves its parameters untouched.',
                    properties: {
                      content: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null },
                      id: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null },
                      kwargs: { additionalProperties: true, type: 'object' },
                    },
                    type: 'object',
                    'x-tai42-templated-text': { language: 'jinja' },
                    'x-tai42-expression': {
                      blurb: 'the run input the dispatch is about to run on',
                      label: 'subject expression',
                      language: 'jq',
                      returns:
                        'a full subject object {target_kind, target_name, kind, key}, or a bare key string',
                      sample: { account_id: 'acct_42' },
                    },
                  },
                  scope_expr: {
                    anyOf: [
                      {
                        additionalProperties: false,
                        description:
                          'A renderable text: its source plus the parameters its render takes.\n\nEXACTLY ONE source is set — ``content`` (the text inline) or ``id`` (the id of a\nstored resource holding the text); neither and both are refused at construction.\n``kwargs`` are the render parameters for the TEXT and apply either way, so moving a\ntext from inline to stored (or back) leaves its parameters untouched.',
                        properties: {
                          content: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null },
                          id: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null },
                          kwargs: { additionalProperties: true, type: 'object' },
                        },
                        type: 'object',
                        'x-tai42-templated-text': { language: 'jinja' },
                      },
                      { type: 'null' },
                    ],
                    default: null,
                    'x-tai42-expression': {
                      blurb: 'the run input the dispatch is about to run on',
                      label: 'scope expression',
                      language: 'jq',
                      returns:
                        'a boolean — false skips this state for the run, true (or absent) engages it',
                      sample: { account_id: 'acct_42' },
                    },
                  },
                  input_injections: {
                    items: {
                      additionalProperties: false,
                      description:
                        'One input injection placed into the run input under ``into`` before the dispatch.\n\nExactly one source is set: ``template_jq`` names an ``input``-purpose template jq\n(``name`` or ``<template>.<name>``) evaluated over the record, or ``jq`` is a templated\ntext rendering to a custom program over the record (its ``.``) with the run input bound as\n``$input``. ``into`` IS the adapter for an injection — the run-input field the value lands\nunder. Frozen.',
                      properties: {
                        template_jq: {
                          anyOf: [{ type: 'string' }, { type: 'null' }],
                          default: null,
                        },
                        jq: {
                          anyOf: [
                            {
                              additionalProperties: false,
                              description:
                                'A renderable text: its source plus the parameters its render takes.\n\nEXACTLY ONE source is set — ``content`` (the text inline) or ``id`` (the id of a\nstored resource holding the text); neither and both are refused at construction.\n``kwargs`` are the render parameters for the TEXT and apply either way, so moving a\ntext from inline to stored (or back) leaves its parameters untouched.',
                              properties: {
                                content: {
                                  anyOf: [{ type: 'string' }, { type: 'null' }],
                                  default: null,
                                },
                                id: {
                                  anyOf: [{ type: 'string' }, { type: 'null' }],
                                  default: null,
                                },
                                kwargs: { additionalProperties: true, type: 'object' },
                              },
                              type: 'object',
                              'x-tai42-templated-text': { language: 'jinja' },
                            },
                            { type: 'null' },
                          ],
                          default: null,
                          'x-tai42-expression': {
                            blurb: "the attached record's subtree, or {} when no record exists yet",
                            label: 'injection jq',
                            language: 'jq',
                            returns: "the value placed into the run input at 'into'",
                            sample: { count: 3 },
                            variables: [
                              {
                                blurb: 'the run input the dispatch is about to run on',
                                name: 'input',
                                sample: { value: 2 },
                              },
                            ],
                          },
                        },
                        into: { minLength: 1, type: 'string' },
                      },
                      required: ['into'],
                      type: 'object',
                    },
                    type: 'array',
                  },
                  updates: {
                    items: {
                      additionalProperties: false,
                      description:
                        "One update applied through the store after the dispatch.\n\nExactly one source is set: ``template_jq`` names an ``update``-purpose template jq\n(``name`` or ``<template>.<name>``) whose ``.input`` object the optional ``adapter`` (a\ntemplated text rendering to a jq over the tool output, its ``.``, with the run input bound\nas ``$input``) shapes from the run's output/input; or ``jq`` is a templated text rendering\nto a custom program over the tool output (its ``.``) with the run input bound as ``$input``\nand the record as ``$record``, authoring the whole op batch itself (a custom update carries\nno adapter). ``op_id`` is an optional templated text rendering to an idempotency-key\nexpression. Frozen.",
                      properties: {
                        template_jq: {
                          anyOf: [{ type: 'string' }, { type: 'null' }],
                          default: null,
                        },
                        jq: {
                          anyOf: [
                            {
                              additionalProperties: false,
                              description:
                                'A renderable text: its source plus the parameters its render takes.\n\nEXACTLY ONE source is set — ``content`` (the text inline) or ``id`` (the id of a\nstored resource holding the text); neither and both are refused at construction.\n``kwargs`` are the render parameters for the TEXT and apply either way, so moving a\ntext from inline to stored (or back) leaves its parameters untouched.',
                              properties: {
                                content: {
                                  anyOf: [{ type: 'string' }, { type: 'null' }],
                                  default: null,
                                },
                                id: {
                                  anyOf: [{ type: 'string' }, { type: 'null' }],
                                  default: null,
                                },
                                kwargs: { additionalProperties: true, type: 'object' },
                              },
                              type: 'object',
                              'x-tai42-templated-text': { language: 'jinja' },
                            },
                            { type: 'null' },
                          ],
                          default: null,
                          'x-tai42-expression': {
                            blurb: "the run's output the update runs after",
                            label: 'custom update jq',
                            language: 'jq',
                            returns: 'the op batch (a list of ops) applied to the record',
                            sample: { ok: true },
                            variables: [
                              {
                                blurb: 'the run input the dispatch ran on',
                                name: 'input',
                                sample: { value: 2 },
                              },
                              {
                                blurb:
                                  "the attached record's subtree, or {} when no record exists yet",
                                name: 'record',
                                sample: { count: 3 },
                              },
                            ],
                          },
                        },
                        adapter: {
                          anyOf: [
                            {
                              additionalProperties: false,
                              description:
                                'A renderable text: its source plus the parameters its render takes.\n\nEXACTLY ONE source is set — ``content`` (the text inline) or ``id`` (the id of a\nstored resource holding the text); neither and both are refused at construction.\n``kwargs`` are the render parameters for the TEXT and apply either way, so moving a\ntext from inline to stored (or back) leaves its parameters untouched.',
                              properties: {
                                content: {
                                  anyOf: [{ type: 'string' }, { type: 'null' }],
                                  default: null,
                                },
                                id: {
                                  anyOf: [{ type: 'string' }, { type: 'null' }],
                                  default: null,
                                },
                                kwargs: { additionalProperties: true, type: 'object' },
                              },
                              type: 'object',
                              'x-tai42-templated-text': { language: 'jinja' },
                            },
                            { type: 'null' },
                          ],
                          default: null,
                          'x-tai42-expression': {
                            blurb: "the run's output the update runs after",
                            label: 'update adapter',
                            language: 'jq',
                            returns: "the template program's '.input' object",
                            sample: { ok: true },
                            variables: [
                              {
                                blurb: 'the run input the dispatch ran on',
                                name: 'input',
                                sample: { value: 2 },
                              },
                            ],
                          },
                        },
                        op_id: {
                          anyOf: [
                            {
                              additionalProperties: false,
                              description:
                                'A renderable text: its source plus the parameters its render takes.\n\nEXACTLY ONE source is set — ``content`` (the text inline) or ``id`` (the id of a\nstored resource holding the text); neither and both are refused at construction.\n``kwargs`` are the render parameters for the TEXT and apply either way, so moving a\ntext from inline to stored (or back) leaves its parameters untouched.',
                              properties: {
                                content: {
                                  anyOf: [{ type: 'string' }, { type: 'null' }],
                                  default: null,
                                },
                                id: {
                                  anyOf: [{ type: 'string' }, { type: 'null' }],
                                  default: null,
                                },
                                kwargs: { additionalProperties: true, type: 'object' },
                              },
                              type: 'object',
                              'x-tai42-templated-text': { language: 'jinja' },
                            },
                            { type: 'null' },
                          ],
                          default: null,
                          'x-tai42-expression': {
                            blurb: "the run's output the update runs after",
                            label: 'op_id expression',
                            language: 'jq',
                            returns: 'a string idempotency key, or null for no key',
                            sample: { ok: true },
                            variables: [
                              {
                                blurb: 'the run input the dispatch ran on',
                                name: 'input',
                                sample: { value: 2 },
                              },
                            ],
                          },
                        },
                      },
                      type: 'object',
                    },
                    type: 'array',
                  },
                },
                required: ['state', 'subject_expr'],
                type: 'object',
              },
              minItems: 1,
              type: 'array',
            },
          },
          required: ['states'],
          type: 'object',
        },
        { type: 'null' },
      ],
      default: null,
    },
  },
};

/** A list and a record whose items are a marked templated text. */
export const CONTAINERS_TOOL_FORM: JsonSchema = {
  additionalProperties: false,
  properties: {
    listed: {
      items: {
        additionalProperties: false,
        description:
          'A renderable text: its source plus the parameters its render takes.\n\nEXACTLY ONE source is set — ``content`` (the text inline) or ``id`` (the id of a\nstored resource holding the text); neither and both are refused at construction.\n``kwargs`` are the render parameters for the TEXT and apply either way, so moving a\ntext from inline to stored (or back) leaves its parameters untouched.',
        properties: {
          content: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null },
          id: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null },
          kwargs: { additionalProperties: true, type: 'object' },
        },
        type: 'object',
        'x-tai42-templated-text': { language: 'jinja' },
        'x-tai42-expression': { blurb: 'the event', label: 'check', language: 'jq' },
      },
      type: 'array',
    },
    named: {
      additionalProperties: {
        additionalProperties: false,
        description:
          'A renderable text: its source plus the parameters its render takes.\n\nEXACTLY ONE source is set — ``content`` (the text inline) or ``id`` (the id of a\nstored resource holding the text); neither and both are refused at construction.\n``kwargs`` are the render parameters for the TEXT and apply either way, so moving a\ntext from inline to stored (or back) leaves its parameters untouched.',
        properties: {
          content: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null },
          id: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null },
          kwargs: { additionalProperties: true, type: 'object' },
        },
        type: 'object',
        'x-tai42-templated-text': { language: 'jinja' },
        'x-tai42-expression': { blurb: 'the event', label: 'check', language: 'jq' },
      },
      type: 'object',
    },
  },
  required: ['listed', 'named'],
  type: 'object',
};
