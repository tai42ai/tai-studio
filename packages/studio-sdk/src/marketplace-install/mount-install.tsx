/**
 * The route-mounting install / update form: a base prefix per route-carrying item, a
 * live preview of the resulting absolute paths, loud collision blocking, explicit
 * acceptance of the routes served without authentication, and — on install — the
 * preview's missing env collected in the same form. `MountInstallForm` renders it in
 * place; `MountInstallDialog` renders it in a dialog.
 */
import type { MarketplaceInstallPreview, MarketplaceInstallResult } from '@tai42/api-client';
import { type ReactNode, useRef } from 'react';

import { Badge } from '../components/badge';
import { Checkbox } from '../components/checkbox';
import { Field } from '../components/field';
import { FormDialog } from '../components/form-dialog';
import { XCircleIcon } from '../components/icons';
import { TextInput } from '../components/inputs';
import { ErrorState, Skeleton } from '../components/primitives';
import { EnvVarFields } from './env-var-fields';
import { InstallShell, storeOffNote } from './install-shell';
import type { RouteItem } from './route-items';
import { useInstallAction } from './use-install-action';
import { type MountInstallModel, useMountInstall } from './use-mount-install';

export interface MountInstallDialogProps {
  readonly refValue: string;
  readonly version: string | null;
  readonly verb: 'Install' | 'Update';
  readonly routeItems: readonly RouteItem[];
  /**
   * On UPDATE, the installed row's stored `{item_name: base}` — the CURRENT mount each
   * base input seeds from (declared default only for an item with no stored mount).
   * Absent on INSTALL, where every input seeds from the declared default.
   */
  readonly storedMounts?: Record<string, string>;
  /** The server's per-var secret-ness: a toggle for a `true` var is locked on. */
  readonly requiredEnvSecret?: Record<string, boolean>;
  /** Per-var "which item needs it" hint. */
  readonly envHints?: Record<string, string>;
  /** After a 2xx install or update. */
  readonly onDone: (result: MarketplaceInstallResult) => void;
  /** After a failed call, already rendered in place. */
  readonly onFailed?: (error: unknown) => void;
  /** The user closed or cancelled without a completed call. */
  readonly onDismiss: () => void;
}

/** The resolved routes for one item, from the live preview. */
function ItemRoutes({
  item,
  preview,
}: {
  readonly item: RouteItem;
  readonly preview: MarketplaceInstallPreview | undefined;
}): ReactNode {
  if (preview === undefined) return <Skeleton height={48} />;
  const resolved = preview.items.find((row) => row.item === item.name);
  if (resolved === undefined) return null;
  return (
    <ul style={{ margin: 0, paddingLeft: 'var(--tai-space-4)' }}>
      {resolved.routes.map((route) => (
        <li key={`${route.path}/${route.methods.join(',')}`}>
          <code className="tai-mono">{route.full_path}</code>{' '}
          <span className="tai-muted">{route.methods.join(', ')}</span>{' '}
          {route.public ? <Badge variant="warning">public</Badge> : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * The loud collision block: each clashing route, its owner, and the remap remedy.
 * `role="alert"` on the error ground, with its own headline — a collision is a
 * refusal the operator resolves, not a malfunction, so it never wears the generic
 * "something went wrong".
 */
function CollisionBlock({
  collisions,
}: {
  readonly collisions: MarketplaceInstallPreview['collisions'];
}): ReactNode {
  return (
    <div role="alert" className="tai-error-state tai-stack tai-stack-2">
      <strong className="tai-error-state-title">
        <XCircleIcon />
        Route collision
      </strong>
      <p style={{ margin: 0 }}>
        These routes already have an owner. Remap the base above until they no longer clash.
      </p>
      <ul style={{ margin: 0, paddingLeft: 'var(--tai-space-4)' }}>
        {collisions.map((collision) => (
          <li key={`${collision.item}/${collision.full_path}/${collision.methods.join(',')}`}>
            <code className="tai-mono">{collision.full_path}</code>{' '}
            <span className="tai-muted">{collision.methods.join(', ')}</span> — owned by{' '}
            <strong>{collision.conflict_owner}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The public-route acceptance block: it names every route that will answer WITHOUT
 * authentication and gates submit on an explicit checkbox.
 */
function PublicAcceptance({
  rows,
  accepted,
  onAccept,
}: {
  readonly rows: MarketplaceInstallPreview['new_public_routes'];
  readonly accepted: boolean;
  readonly onAccept: (checked: boolean) => void;
}): ReactNode {
  return (
    <div role="alert" className="tai-warn-state tai-stack tai-stack-2">
      <strong className="tai-status-warn">Public routes</strong>
      <p style={{ margin: 0 }}>
        These routes are served WITHOUT API-key authentication — anyone who can reach the server can
        call them.
      </p>
      <ul style={{ margin: 0, paddingLeft: 'var(--tai-space-4)' }}>
        {rows.map((row) => (
          <li key={`${row.item}/${row.full_path}/${row.methods.join(',')}`}>
            <code className="tai-mono">{row.full_path}</code>{' '}
            <span className="tai-muted">{row.methods.join(', ')}</span>
          </li>
        ))}
      </ul>
      <Checkbox
        checked={accepted}
        onCheckedChange={onAccept}
        label="I accept these routes are served without authentication"
      />
    </div>
  );
}

/** The form body both frames render: the bases, the preview, and the env to collect. */
function MountInstallFields({
  model,
  refValue,
  version,
  verb,
  routeItems,
  requiredEnvSecret,
  envHints,
}: {
  readonly model: MountInstallModel;
  readonly refValue: string;
  readonly version: string | null;
  readonly verb: 'Install' | 'Update';
  readonly routeItems: readonly RouteItem[];
  readonly requiredEnvSecret?: Record<string, boolean>;
  readonly envHints?: Record<string, string>;
}): ReactNode {
  return (
    <div className="tai-stack tai-stack-3">
      <p style={{ margin: 0 }}>
        {verb} {refValue}
        {version !== null ? ` v${version}` : ''}? Its routes mount under the bases below. Remap a
        base to move where a route answers.
      </p>
      {routeItems.map((item) => (
        <div key={item.name} className="tai-stack tai-stack-2">
          <Field label={`${item.name} base`}>
            <TextInput
              value={model.bases[item.name] ?? ''}
              onChange={(event) => {
                const next = event.currentTarget.value;
                model.setBases((prev) => ({ ...prev, [item.name]: next }));
              }}
            />
          </Field>
          <ItemRoutes item={item} preview={model.preview} />
        </div>
      ))}
      {model.previewIsError ? (
        <ErrorState message="The install preview failed. Fix the error and edit a base to retry." />
      ) : null}
      {model.collisions.length > 0 ? <CollisionBlock collisions={model.collisions} /> : null}
      {model.requiresAccept ? (
        <PublicAcceptance
          rows={model.publicRows}
          accepted={model.accepted}
          onAccept={model.setAccepted}
        />
      ) : null}
      {model.envToCollect.length > 0 ? (
        <EnvVarFields
          requiredVars={model.envToCollect}
          values={model.envValues}
          secret={model.envSecretMap}
          requiredSecret={requiredEnvSecret}
          hints={envHints}
          onChangeValue={(name, value) => {
            model.setEnvValues((prev) => ({ ...prev, [name]: value }));
          }}
          onToggleSecret={(name, checked) => {
            model.setEnvSecretOverride((prev) => ({ ...prev, [name]: checked }));
          }}
        />
      ) : null}
    </div>
  );
}

/** The mount form in place, with its own Cancel and submit buttons. */
export function MountInstallForm(props: MountInstallDialogProps): ReactNode {
  const { refValue, version, verb, routeItems, requiredEnvSecret, envHints } = props;
  const model = useMountInstall(props);
  const action = useInstallAction(refValue, verb);
  const failure = action.state.status === 'failed' ? action.state.error : null;
  return (
    <InstallShell
      layout="panel"
      title={`${verb} plugin`}
      submitLabel={verb}
      pendingLabel={verb === 'Install' ? 'Installing' : 'Updating'}
      isPending={action.state.status === 'pending'}
      error={storeOffNote(failure) === undefined ? failure : null}
      disabledNote={storeOffNote(failure)}
      submitDisabled={model.blocked}
      onSubmit={() => {
        action.run(model.extras()).then(props.onDone, (error: unknown) => {
          props.onFailed?.(error);
        });
      }}
      onDismiss={props.onDismiss}
    >
      <MountInstallFields
        model={model}
        refValue={refValue}
        version={version}
        verb={verb}
        routeItems={routeItems}
        requiredEnvSecret={requiredEnvSecret}
        envHints={envHints}
      />
    </InstallShell>
  );
}

/**
 * The mount form in a dialog. It previews the resolved routes on open and on every
 * (debounced) base edit, blocks submit on a collision or an unaccepted public route,
 * and closes only after a 2xx; a failure renders in the dialog and it stays open.
 */
export function MountInstallDialog(props: MountInstallDialogProps): ReactNode {
  const { refValue, version, verb, routeItems, requiredEnvSecret, envHints } = props;
  const model = useMountInstall(props);
  const action = useInstallAction(refValue, verb);
  // The dialog's own close after a 2xx is not a dismissal.
  const doneRef = useRef(false);
  const submit = async (): Promise<void> => {
    let result: MarketplaceInstallResult;
    try {
      result = await action.run(model.extras());
    } catch (error: unknown) {
      props.onFailed?.(error);
      throw error;
    }
    doneRef.current = true;
    props.onDone(result);
  };
  return (
    <FormDialog
      title={`${verb} plugin`}
      submitLabel={verb}
      pendingLabel={verb === 'Install' ? 'Installing' : 'Updating'}
      submitDisabled={model.blocked}
      onSubmit={submit}
      onClose={() => {
        if (!doneRef.current) props.onDismiss();
      }}
    >
      <MountInstallFields
        model={model}
        refValue={refValue}
        version={version}
        verb={verb}
        routeItems={routeItems}
        requiredEnvSecret={requiredEnvSecret}
        envHints={envHints}
      />
    </FormDialog>
  );
}
