/**
 * The route-mounting install / update flow: a base prefix per route-carrying
 * item, a live preview of the resulting absolute paths, loud collision blocking,
 * and explicit acceptance of the routes served without authentication — composed
 * with the preview's missing-env collection into one install dialog.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Checkbox,
  ErrorState,
  Field,
  FormDialog,
  Skeleton,
  TextInput,
  XCircleIcon,
  useApi,
} from '@tai42/studio-sdk';
import type { MarketplaceInstallPreview, MarketplaceRoutesDecl } from '@tai42/api-client';

import { marketplacePreviewKey } from './keys';

/** How long after the last base keystroke the preview refetches. */
const PREVIEW_DEBOUNCE_MS = 250;

/** A route-carrying item as the dialog drives it: its name, kind, and declaration. */
export interface RouteItem {
  readonly name: string;
  readonly kind: string;
  readonly routes: MarketplaceRoutesDecl;
}

/** The install/update body fields this dialog contributes. */
export interface InstallExtras {
  route_mounts: Record<string, string>;
  accept_public_routes: boolean;
  env?: Record<string, string>;
  secret_keys?: string[];
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
 * Track a value that only settles `delayMs` after it last changed. The first
 * value settles immediately, so a preview fires on open before any edit.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);
  return settled;
}

/**
 * The env value + secret-key split from the collected inputs: a blank field is
 * omitted (the deployment may already provide it); a filled field is marked secret
 * only when its toggle is ON.
 *
 * The toggle state is SEEDED from the server's per-var `required_env[].secret`, so
 * secret-ness comes from that authority, not a blanket default: a `secret: true`
 * var (an OAuth client secret) is masked, a `secret: false` var (a client id) is
 * not unless the operator turns it on. Keying off `=== true` honors an off toggle
 * and never force-masks — an un-seeded var stays out of the secret band.
 */
export function collectEnv(
  requiredVars: readonly string[],
  values: Record<string, string>,
  secret: Record<string, boolean>,
): { env: Record<string, string>; secretKeys: string[] } {
  const env: Record<string, string> = {};
  const secretKeys: string[] = [];
  for (const name of requiredVars) {
    const value = values[name] ?? '';
    if (value === '') continue;
    env[name] = value;
    if (secret[name] === true) secretKeys.push(name);
  }
  return { env, secretKeys };
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
  const api = useApi();
  // The base each item is CURRENTLY mounted at: the stored mount on update, the
  // declared default on install (or for an item the install added). This seeds the
  // inputs and, on update, is the baseline the submit diffs against so an untouched
  // base is OMITTED and the server preserves it.
  const seededBases = useMemo(
    () =>
      Object.fromEntries(
        routeItems.map((item) => [item.name, storedMounts?.[item.name] ?? item.routes.base]),
      ),
    [routeItems, storedMounts],
  );
  const [bases, setBases] = useState<Record<string, string>>(seededBases);
  const [accepted, setAccepted] = useState(false);
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  // Only OPERATOR overrides live in state; each toggle's baseline is the derived
  // `requiredEnvSecret`, so a var starts secret iff the server marks it so — no
  // async seed to miss when the preview lands.
  const [envSecretOverride, setEnvSecretOverride] = useState<Record<string, boolean>>({});

  // The serialized map is the debounce + cache key: a stable string that only
  // changes when a base actually changes, so identity churn never refetches.
  const basesKey = JSON.stringify(bases);
  const debouncedKey = useDebouncedValue(basesKey, PREVIEW_DEBOUNCE_MS);
  const debouncedBases = useMemo(
    () => JSON.parse(debouncedKey) as Record<string, string>,
    [debouncedKey],
  );

  const previewQuery = useQuery({
    queryKey: marketplacePreviewKey(refValue, version, debouncedKey),
    queryFn: ({ signal }) =>
      api.previewMarketplaceInstall(
        { ref: refValue, version: version ?? undefined, route_mounts: debouncedBases },
        signal,
      ),
    // Keep the last resolved paths on screen while a remap re-previews, so the
    // list does not blank on every keystroke.
    placeholderData: (prev) => prev,
  });

  const preview = previewQuery.data;
  const collisions = preview?.collisions ?? [];
  const publicRows = preview?.new_public_routes ?? [];
  const requiresAccept = preview?.requires_public_acceptance ?? false;
  // The env to collect is the preview's server-computed missing set — only on
  // INSTALL: an update that would add a required var is refused server-side, so the
  // update flow never collects env. Each var's effective secret band is the SERVER's
  // per-var `required_env[].secret` from this same preview (the authority; the
  // registry's plugin-detail body carries no per-item required-env), OR the
  // `requiredEnvSecret` prop, OR an operator override.
  const envToCollect = verb === 'Install' ? (preview?.missing_env ?? []) : [];
  const previewEnvSecret: Record<string, boolean> = {};
  for (const req of preview?.required_env ?? []) previewEnvSecret[req.name] = req.secret;
  const envSecretMap = Object.fromEntries(
    envToCollect.map((name) => [
      name,
      previewEnvSecret[name] === true ||
        requiredEnvSecret?.[name] === true ||
        envSecretOverride[name] === true,
    ]),
  );
  // Submit is blocked until a clean preview exists with no collision and any
  // required public acceptance given. A preview error blocks too — an unverified
  // mount must never be committed.
  const blocked =
    previewQuery.isError ||
    preview === undefined ||
    collisions.length > 0 ||
    (requiresAccept && !accepted);

  const submit = (): Promise<void> => {
    // INSTALL sends every base (declared default is correct). UPDATE sends ONLY the
    // items whose base the operator changed from its current stored base — omitted
    // items are preserved by the server's stored-mount precedence, so a plugin
    // installed at a non-default base is never reset to default on an edit-free update.
    const route_mounts =
      verb === 'Update'
        ? Object.fromEntries(
            Object.entries(bases).filter(([name, base]) => base !== seededBases[name]),
          )
        : bases;
    const extras: InstallExtras = { route_mounts, accept_public_routes: accepted };
    if (envToCollect.length > 0) {
      const { env, secretKeys } = collectEnv(envToCollect, envValues, envSecretMap);
      if (Object.keys(env).length > 0) {
        extras.env = env;
        extras.secret_keys = secretKeys;
      }
    }
    return onSubmit(extras);
  };

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
        {previewQuery.isError ? (
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
