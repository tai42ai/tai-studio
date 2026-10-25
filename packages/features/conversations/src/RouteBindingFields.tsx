/**
 * The route form's binding fields, in order: the route name, the target (its kind and
 * the agent or tool it runs), the door (a channel and the address on it, or a callback
 * URL) and the execution key. Each name is picked from the deployment's own list through
 * the SDK pickers, which draw the read's loading, empty, refused and failed states and
 * flag a stored value the list does not hold. The rest of the route is the dialog's
 * schema-driven settings form.
 */
import {
  AgentPicker,
  AppLink,
  channelIdentityHint,
  ChannelPicker,
  ExecutionKeyPicker,
  Field,
  isForbiddenError,
  type SchemaFormErrors,
  Select,
  TextInput,
  ToolPicker,
} from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import {
  CALLBACK_URL_DESCRIPTION,
  ROUTE_NAME_DESCRIPTION,
  type RouteFormValue,
} from './route-schema';
import type { RoutePickers } from './use-route-pickers';

export interface RouteBindingFieldsProps {
  readonly value: RouteFormValue;
  readonly onChange: (next: RouteFormValue) => void;
  readonly errors: SchemaFormErrors | undefined;
  /** The stored route's name when editing (shown read-only), else `undefined`. */
  readonly fixedRouteName: string | undefined;
  readonly pickers: RoutePickers;
}

const TARGET_DESCRIPTION = {
  agent: 'Each turn runs this agent as a threaded conversation.',
  tool: 'Each message dispatches this tool on its own, with no thread memory.',
  none: 'What an inbound turn on this route runs.',
} as const;

const DOOR_DESCRIPTION =
  'Where messages arrive and how the answer goes back: a channel answers on its own medium; the API door answers to a callback URL, or the caller polls.';

const EXECUTION_KEY_DESCRIPTION =
  "The api key each turn runs AS. Every tool call the turn makes is authorized against that key's live grants — prefer a least-privilege service key over a human's broad one.";

const IDENTITY_FALLBACK = 'The address on this channel that clients message.';

/** The "Our identity" description: the picked channel's declared hint, or why there is none. */
export function ourIdentityDescription(
  channels: RoutePickers['channels'],
  channel: string,
): string {
  if (channel === '') return 'Pick a channel to see what to enter here.';
  if (channels.isError) {
    return isForbiddenError(channels.error)
      ? `${IDENTITY_FALLBACK} This session cannot read the channel list, so no hint is shown.`
      : `${IDENTITY_FALLBACK} The channel's hint could not be loaded.`;
  }
  if (channels.data === undefined) return "Loading this channel's hint…";
  const hint = channelIdentityHint(channels.data, channel);
  if (hint === undefined)
    return `${IDENTITY_FALLBACK} This channel is not installed, so it offers no hint.`;
  return hint ?? IDENTITY_FALLBACK;
}

function RouteNameField({
  value,
  onChange,
  errors,
  fixedRouteName,
}: Omit<RouteBindingFieldsProps, 'pickers'>): ReactNode {
  if (fixedRouteName !== undefined) {
    return (
      <Field label="Route name">
        <TextInput value={fixedRouteName} disabled readOnly />
      </Field>
    );
  }
  return (
    <Field label="Route name" description={ROUTE_NAME_DESCRIPTION} error={errors?.route_name}>
      <TextInput
        value={value.route_name ?? ''}
        onChange={(event) => {
          onChange({ ...value, route_name: event.target.value });
        }}
      />
    </Field>
  );
}

function TargetFields({
  value,
  onChange,
  errors,
  pickers,
}: Omit<RouteBindingFieldsProps, 'fixedRouteName'>): ReactNode {
  const target = value.target ?? {};
  const kind = target.target_kind;
  const name = target.target_name ?? '';
  const nameError = errors?.['target.target_name'];
  const setName = (next: string): void => {
    onChange({ ...value, target: { ...target, target_name: next } });
  };
  return (
    <Field group label="Target" description={TARGET_DESCRIPTION[kind ?? 'none']}>
      <Field label="Target kind" error={errors?.target}>
        <Select
          value={kind ?? ''}
          placeholder="Select a target kind"
          options={[
            { value: 'agent', label: 'Agent' },
            { value: 'tool', label: 'Tool' },
          ]}
          onValueChange={(next) => {
            if (next !== 'agent' && next !== 'tool') return;
            const { target_name: _cleared, ...rest } = target;
            onChange({ ...value, target: { ...rest, target_kind: next } });
          }}
        />
      </Field>
      {kind === 'agent' ? (
        <AgentPicker
          query={pickers.agents}
          value={name}
          onValueChange={setName}
          error={nameError}
        />
      ) : null}
      {kind === 'tool' ? (
        <ToolPicker
          query={pickers.tools}
          value={name}
          onChange={setName}
          label="Tool"
          unlistedLabel="not registered"
          error={nameError}
          emptyNote="No tools are registered on this deployment."
          emptyAction={
            <AppLink to="marketplace" className="tai-link">
              Browse plugins
            </AppLink>
          }
          forbiddenNote="This session cannot list tools. Picking one needs read access to GET /api/tools; ask an administrator to grant it."
        />
      ) : null}
    </Field>
  );
}

function DoorFields({
  value,
  onChange,
  errors,
  pickers,
}: Omit<RouteBindingFieldsProps, 'fixedRouteName'>): ReactNode {
  const delivery = value.delivery ?? {};
  const setDelivery = (next: NonNullable<RouteFormValue['delivery']>): void => {
    onChange({ ...value, delivery: next });
  };
  return (
    <Field group label="Door" description={DOOR_DESCRIPTION}>
      <Field label="Door" error={errors?.delivery}>
        <Select
          value={delivery.door ?? ''}
          placeholder="Select a door"
          options={[
            { value: 'channel', label: 'Channel' },
            { value: 'api', label: 'API' },
          ]}
          onValueChange={(next) => {
            if (next !== 'channel' && next !== 'api') return;
            setDelivery({ door: next });
          }}
        />
      </Field>
      {delivery.door === 'channel' ? (
        <>
          <ChannelPicker
            query={pickers.channels}
            value={delivery.channel ?? ''}
            onValueChange={(next) => {
              setDelivery({ ...delivery, channel: next });
            }}
            error={errors?.['delivery.channel']}
          />
          <Field
            label="Our identity"
            description={ourIdentityDescription(pickers.channels, delivery.channel ?? '')}
            error={errors?.['delivery.our_identity']}
          >
            <TextInput
              value={delivery.our_identity ?? ''}
              onChange={(event) => {
                setDelivery({ ...delivery, our_identity: event.target.value });
              }}
            />
          </Field>
        </>
      ) : null}
      {delivery.door === 'api' ? (
        <Field
          label="Callback URL"
          description={CALLBACK_URL_DESCRIPTION}
          error={errors?.['delivery.callback_url']}
        >
          <TextInput
            value={delivery.callback_url ?? ''}
            onChange={(event) => {
              setDelivery({ ...delivery, callback_url: event.target.value });
            }}
          />
        </Field>
      ) : null}
    </Field>
  );
}

export function RouteBindingFields(props: RouteBindingFieldsProps): ReactNode {
  const { value, onChange, errors, pickers } = props;
  return (
    <>
      <RouteNameField
        value={value}
        onChange={onChange}
        errors={errors}
        fixedRouteName={props.fixedRouteName}
      />
      <TargetFields value={value} onChange={onChange} errors={errors} pickers={pickers} />
      <DoorFields value={value} onChange={onChange} errors={errors} pickers={pickers} />
      <ExecutionKeyPicker
        query={pickers.keys}
        binding={pickers.binding}
        value={value.execution_key ?? ''}
        onValueChange={(next) => {
          onChange({ ...value, execution_key: next });
        }}
        error={errors?.execution_key}
        description={EXECUTION_KEY_DESCRIPTION}
      />
    </>
  );
}
