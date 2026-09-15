/**
 * The route-mounting install / update flow: a base prefix per route-carrying
 * item, a live preview of the resulting absolute paths, loud collision blocking,
 * and explicit acceptance of the routes served without authentication — composed
 * with the preview's missing-env collection into one install dialog.
 */
import type { MarketplaceInstallPreview, MarketplaceRoutesDecl } from '@tai42/api-client';
import {
  Badge,
  Checkbox,
  ErrorState,
  Field,
  FormDialog,
  Skeleton,
  TextInput,
  XCircleIcon,
} from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import type { InstallExtras } from './install-mount';
import { useMountInstall } from './use-mount-install';

export type { InstallExtras } from './install-mount';
export { collectEnv } from './install-mount';
export { useDebouncedValue } from './use-mount-install';

/** A route-carrying item as the dialog drives it: its name, kind, and declaration. */
export interface RouteItem {
  readonly name: string;
  readonly kind: string;
  readonly routes: MarketplaceRoutesDecl;
}

/** The route-carrying items of a published version, in declaration order. */
export function routeItemsOf(
  items: readonly { kind: string; name: string; routes?: MarketplaceRoutesDecl | null }[],
): RouteItem[] {
  const out: RouteItem[] = [];
  for (const item of items) {
    if (item.routes === null || item.routes === undefined) continue;
    out.push({ name: item.name, kind: item.kind, routes: item.routes });
  }
  return out;
}

/**
 * One input + secret toggle per required env var, fully controlled. `requiredSecret`
 * is the server's per-var secret-ness: a `true` var (an OAuth client secret) is
 * LOCKED on — the server masks it regardless, so an off toggle would lie — while a
 * `false` var starts off and stays free. `hints` names the item that needs each var.
 */
export function EnvVarFields({
  requiredVars,
  values,
  secret,
  requiredSecret,
  hints,
  onChangeValue,
  onToggleSecret,
}: {
  readonly requiredVars: readonly string[];
  readonly values: Record<string, string>;
  readonly secret: Record<string, boolean>;
  readonly requiredSecret?: Record<string, boolean>;
  readonly hints?: Record<string, string>;
  readonly onChangeValue: (name: string, value: string) => void;
  readonly onToggleSecret: (name: string, checked: boolean) => void;
}): ReactNode {
  return (
    <>
      {requiredVars.map((name) => {
        const locked = requiredSecret?.[name] === true;
        const hint = hints?.[name];
        return (
          <div key={name} className="tai-stack tai-stack-2">
            <Field label={name}>
              <TextInput
                value={values[name] ?? ''}
                onChange={(event) => {
                  onChangeValue(name, event.currentTarget.value);
                }}
              />
            </Field>
            {hint !== undefined ? <span className="tai-muted">Required by {hint}</span> : null}
            <Checkbox
              checked={secret[name] === true}
              disabled={locked}
              onCheckedChange={(checked) => {
                onToggleSecret(name, checked);
              }}
              label="Store as secret"
            />
          </div>
        );
      })}
    </>
  );
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
 * The public-route acceptance block, warn-toned like the settings pin-public
 * dialog: it names every route that will answer WITHOUT authentication and gates
 * submit on an explicit checkbox.
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

/**
 * The route-mounting install / update dialog. It previews the resolved routes on
 * open and on every (debounced) base edit, blocks submit on a collision or an
 * unaccepted public route, and — on install — collects the preview's missing env
 * vars in the same flow. The parent owns the mutation; `onSubmit` returns its
 * promise so the dialog closes on success and surfaces a failure loudly.
 */
export function MountInstallDialog({
  refValue,
  version,
  verb,
  routeItems,
  storedMounts,
  requiredEnvSecret,
  envHints,
  onSubmit,
  onClose,
}: {
  readonly refValue: string;
  readonly version: string | null;
  readonly verb: 'Install' | 'Update';
  readonly routeItems: readonly RouteItem[];
  // On UPDATE, the installed row's stored `{item_name: base}` — the CURRENT mount
  // each base input seeds from (declared default only for an item with no stored
  // mount). Absent on INSTALL, where every input seeds from the declared default.
  readonly storedMounts?: Record<string, string>;
  // The server's per-var secret-ness for the whole spec: a toggle for a var with
  // `true` is locked on. The vars to COLLECT come from the preview's `missing_env`.
  readonly requiredEnvSecret?: Record<string, boolean>;
  // Per-var "which item needs it" hint.
  readonly envHints?: Record<string, string>;
  readonly onSubmit: (extras: InstallExtras) => Promise<void>;
  readonly onClose: () => void;
}): ReactNode {
  const {
    bases,
    setBases,
    accepted,
    setAccepted,
    envValues,
    setEnvValues,
    setEnvSecretOverride,
    preview,
    previewIsError,
    collisions,
    publicRows,
    requiresAccept,
    envToCollect,
    envSecretMap,
    blocked,
    submit,
  } = useMountInstall({
    refValue,
    version,
    verb,
    routeItems,
    storedMounts,
    requiredEnvSecret,
    onSubmit,
  });

  return (
    <FormDialog
      title={`${verb} plugin`}
      submitLabel={verb}
      pendingLabel={verb === 'Install' ? 'Installing' : 'Updating'}
      submitDisabled={blocked}
      onSubmit={submit}
      onClose={onClose}
    >
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
                value={bases[item.name] ?? ''}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  setBases((prev) => ({ ...prev, [item.name]: next }));
                }}
              />
            </Field>
            <ItemRoutes item={item} preview={preview} />
          </div>
        ))}
        {previewIsError ? (
          <ErrorState message="The install preview failed. Fix the error and edit a base to retry." />
        ) : null}
        {collisions.length > 0 ? <CollisionBlock collisions={collisions} /> : null}
        {requiresAccept ? (
          <PublicAcceptance rows={publicRows} accepted={accepted} onAccept={setAccepted} />
        ) : null}
        {envToCollect.length > 0 ? (
          <EnvVarFields
            requiredVars={envToCollect}
            values={envValues}
            secret={envSecretMap}
            requiredSecret={requiredEnvSecret}
            hints={envHints}
            onChangeValue={(name, value) => {
              setEnvValues((prev) => ({ ...prev, [name]: value }));
            }}
            onToggleSecret={(name, checked) => {
              setEnvSecretOverride((prev) => ({ ...prev, [name]: checked }));
            }}
          />
        ) : null}
      </div>
    </FormDialog>
  );
}
