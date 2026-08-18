/**
 * A marketplace plugin's detail view, reached by drilling in on a `namespace/name`
 * ref: the listing info (readme, license, links, categories, tags), its contained
 * items, its version history, the advisories that currently apply, and the
 * install / update / uninstall actions. The detail query gates the page; the
 * installed and advisory queries never blank it — their failures surface as loud
 * inline strips in their own sections.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AppLink,
  ArrowLeftIcon,
  Badge,
  Button,
  Card,
  CheckCircleIcon,
  ConfirmDialog,
  CopyField,
  EmptyState,
  ErrorState,
  ExternalLinkButton,
  FeatureDisabled,
  ScrollRegion,
  Skeleton,
  Stack,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TagChips,
  errorMessage,
  featureDisabledMessage,
  isFeatureDisabled,
  useApi,
  useProseScrollRegions,
} from '@tai42/studio-sdk';
import type {
  MarketplaceInstallBody,
  MarketplaceInstallResult,
  MarketplaceInstalled,
  MarketplacePluginDetail,
  MarketplaceVersion,
} from '@tai42/api-client';

import { advisoriesForListing, severityVariant, WarningBlock } from './advisories';
import { ListingIcon, listingTitle } from './display';
import {
  MountInstallDialog,
  collectEnv,
  EnvVarFields,
  routeItemsOf,
  type RouteItem,
} from './install-dialog';
import {
  envConfigKey,
  marketplaceAdvisoriesKey,
  marketplaceInstalledKey,
  marketplacePluginKey,
} from './keys';

// A manifest env leaf is `!ENV ${VAR}` or `!ENV ${VAR:default}` (the pyaml_env
// marker). A REQUIRED var is the bare form with no `:default`.
const ENV_MARKER = /^!ENV\s+\$\{([^}]+)\}$/;

/**
 * The bare-marker `!ENV` vars an mcp-server listing's PUBLIC spec requires: a
 * `!ENV ${VAR}` leaf under a provides item's `mcp.env` with no `:default`.
 * Defaulted markers (the server resolves the default) and literal values (not env
 * refs) are skipped. Display-only — the install-time dangling-ref refusal is the
 * real gate — so this only decides which inputs the install dialog collects.
 */
function requiredEnvVars(detail: MarketplacePluginDetail): string[] {
  const vars = new Set<string>();
  for (const item of detail.latest?.spec?.provides ?? []) {
    const env = item.mcp?.env;
    if (env === null || env === undefined) continue;
    for (const value of Object.values(env)) {
      const match = ENV_MARKER.exec(value);
      if (match === null) continue;
      const inner = match[1];
      if (inner === undefined || inner.includes(':')) continue;
      vars.add(inner);
    }
  }
  return [...vars];
}

/** Which mutation dialog is open (each is mounted only while active). */
type ActiveAction = 'install' | 'update' | 'uninstall';

/** The last completed action's receipt, rendered as an inline success line. */
interface ActionResult {
  readonly verb: string;
  readonly ref: string;
  readonly version: string | null;
  readonly notes: readonly string[];
  readonly advisories: MarketplaceInstallResult['advisories'];
  // The routes the install/update mounted — what was opened where. Empty for an
  // uninstall and for a plugin that registers none.
  readonly routes: MarketplaceInstallResult['routes'];
}

/**
 * Map a version's lifecycle status to a badge tier: published is a success,
 * scan_failed / killed are terminal failures (danger), and pending / validating
 * are in-progress states (warning, not a failure). Any unknown status falls back
 * to neutral.
 */
function versionStatusVariant(status: string): string {
  switch (status) {
    case 'published':
      return 'success';
    case 'scan_failed':
    case 'killed':
      return 'danger';
    case 'pending':
    case 'validating':
      return 'warning';
    default:
      return 'neutral';
  }
}

function VersionStatusBadge({ status }: { readonly status: string }): ReactNode {
  return <Badge variant={versionStatusVariant(status)}>{status}</Badge>;
}

/** The listing header + readme + metadata. */
function InfoCard({ detail }: { readonly detail: MarketplacePluginDetail }): ReactNode {
  const title = listingTitle(detail.display_name, detail.name);
  // A rendered README carries the two surfaces that outrun their column — wide
  // tables and code blocks — and React never rendered them, so they cannot be
  // wrapped in a `ScrollRegion`. This instruments them in place instead, so each
  // one that actually scrolls becomes a named keyboard target. The labels name
  // the document these surfaces come from: an unheaded table on this page lands
  // in the landmark list beside the listing's other regions, and "Table" alone
  // would not say which of them a reader had arrived in.
  const readmeRef = useProseScrollRegions({
    table: 'README table',
    pre: 'README code block',
  });
  // The prop object, not its string, is what React compares: a fresh literal
  // makes every re-render of this card re-write the README's `innerHTML`,
  // destroying the instrumented regions and dropping a reader standing in one
  // onto the document body. Held by identity, the write happens only when the
  // README itself changes.
  const readme = useMemo(
    () => (detail.readme_md === null ? null : { __html: detail.readme_md }),
    [detail.readme_md],
  );
  return (
    <Card>
      <div style={{ display: 'flex', gap: 'var(--tai-space-4)', alignItems: 'flex-start' }}>
        <ListingIcon iconUrl={detail.icon_url} title={title} size={56} />
        <div className="tai-stack tai-stack-2" style={{ minWidth: 0 }}>
          <h2 className="tai-card-title" style={{ wordBreak: 'break-word' }}>
            {title}
          </h2>
          <code className="tai-mono tai-muted">{detail.package}</code>
          <p style={{ margin: 0 }}>{detail.description}</p>
          <div className="tai-row">
            <Badge>{detail.trust_tier}</Badge>
            <Badge>{detail.pricing}</Badge>
            {/* A display-only premium mark — a badge, never a payment surface. */}
            {detail.premium === true ? <Badge variant="primary">Premium</Badge> : null}
            <span className="tai-muted">{detail.downloads} downloads</span>
            {detail.license !== null ? (
              <span className="tai-muted">License: {detail.license}</span>
            ) : null}
          </div>
          <TagChips tags={[...detail.categories, ...detail.tags]} />
          {detail.homepage_url !== null ||
          detail.repository_url !== null ||
          (detail.docs_url !== null && detail.docs_url !== undefined) ? (
            <div className="tai-row">
              {detail.homepage_url !== null ? (
                <ExternalLinkButton url={detail.homepage_url}>Homepage</ExternalLinkButton>
              ) : null}
              {detail.repository_url !== null ? (
                <ExternalLinkButton url={detail.repository_url}>Repository</ExternalLinkButton>
              ) : null}
              {/* The marketplace-stored docs-site link, null-guarded like the
                  other two. */}
              {detail.docs_url !== null && detail.docs_url !== undefined ? (
                <ExternalLinkButton url={detail.docs_url}>Docs</ExternalLinkButton>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {readme === null ? null : (
        // readme_md is server-sanitized trusted HTML (sanitized at ingest); the
        // client is not the sanitization boundary and renders it as-is.
        <div
          ref={readmeRef}
          className="tai-prose"
          style={{ marginTop: 'var(--tai-space-4)' }}
          dangerouslySetInnerHTML={readme}
        />
      )}
    </Card>
  );
}

/** The items contained by the latest published version. */
function ItemsCard({ detail }: { readonly detail: MarketplacePluginDetail }): ReactNode {
  const items = detail.latest?.items ?? [];
  return (
    <Card>
      <h2 className="tai-card-title" style={{ marginBottom: 'var(--tai-space-3)' }}>
        Contained items
      </h2>
      {items.length === 0 ? (
        <EmptyState title="No items" description="This plugin has no published items yet." />
      ) : (
        <ScrollRegion label="Contained items">
          <Table>
            <THead>
              <TR>
                <TH>Kind</TH>
                <TH>Group</TH>
                <TH>Name</TH>
                <TH>Description</TH>
                <TH>Tags</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((item) => (
                <TR key={`${item.kind}/${item.name}`}>
                  <TD>
                    <Badge>{item.kind}</Badge>
                  </TD>
                  {/* The item's logical group, or an em dash when it is ungrouped. */}
                  <TD>{item.group ?? '—'}</TD>
                  <TD>{item.name}</TD>
                  <TD>{item.description}</TD>
                  <TD>
                    <TagChips tags={item.tags} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </ScrollRegion>
      )}
    </Card>
  );
}

/**
 * The routes the plugin's route-carrying items declare, at their DEFAULT bases:
 * the absolute path each route mounts at (`/api/<base><path>`), its methods, and
 * whether it is served public. An operator sees where the plugin would open its
 * surface before opening the install dialog to remap it. Renders nothing when the
 * plugin declares no routes.
 */
function RoutesCard({
  routeItems,
  mounts,
}: {
  readonly routeItems: readonly RouteItem[];
  // The installed row's `{item_name: base}` mounts, so an INSTALLED plugin renders
  // at its ACTUAL mounted base; absent (not installed / query not ready) each item
  // falls back to its declared default.
  readonly mounts?: Record<string, string>;
}): ReactNode {
  if (routeItems.length === 0) return null;
  return (
    <Card>
      <h2 className="tai-card-title" style={{ marginBottom: 'var(--tai-space-3)' }}>
        Routes
      </h2>
      <div className="tai-stack">
        {routeItems.map((item) => {
          const base = mounts?.[item.name] ?? item.routes.base;
          return (
            <div key={item.name} className="tai-stack tai-stack-2">
              <div className="tai-row">
                <Badge>{item.kind}</Badge>
                <strong>{item.name}</strong>
                <code className="tai-mono tai-muted">/api/{base}</code>
              </div>
              <ScrollRegion label={`${item.name} routes`}>
                <Table>
                  <THead>
                    <TR>
                      <TH>Path</TH>
                      <TH>Methods</TH>
                      <TH>Public</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {item.routes.paths.map((route) => (
                      <TR key={`${route.path}/${route.methods.join(',')}`}>
                        <TD>
                          <code className="tai-mono">
                            /api/{base}
                            {route.path}
                          </code>
                        </TD>
                        <TD>{route.methods.join(', ')}</TD>
                        <TD>{route.public ? <Badge variant="warning">public</Badge> : '—'}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </ScrollRegion>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** The version history, latest first as the wire orders it. */
function VersionsCard({
  versions,
}: {
  readonly versions: readonly MarketplaceVersion[];
}): ReactNode {
  return (
    <Card>
      <h2 className="tai-card-title" style={{ marginBottom: 'var(--tai-space-3)' }}>
        Versions
      </h2>
      {versions.length === 0 ? (
        <EmptyState title="No versions" description="This plugin has no versions yet." />
      ) : (
        <ScrollRegion label="Versions">
          <Table>
            <THead>
              <TR>
                <TH>Version</TH>
                <TH>Status</TH>
                <TH>Published</TH>
              </TR>
            </THead>
            <TBody>
              {versions.map((version) => (
                <TR key={version.version}>
                  <TD>{version.version}</TD>
                  <TD>
                    <VersionStatusBadge status={version.status} />
                  </TD>
                  <TD>{version.published_at ?? '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </ScrollRegion>
      )}
    </Card>
  );
}

export function PluginDetail({
  refValue,
  onBack,
}: {
  readonly refValue: string;
  readonly onBack: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);

  const slash = refValue.indexOf('/');
  const namespace = slash >= 0 ? refValue.slice(0, slash) : '';
  const name = slash >= 0 ? refValue.slice(slash + 1) : '';

  const detailQuery = useQuery({
    queryKey: marketplacePluginKey(refValue),
    queryFn: ({ signal }) => api.getMarketplacePlugin(namespace, name, signal),
    enabled: slash >= 0,
  });
  const installedQuery = useQuery({
    queryKey: marketplaceInstalledKey,
    queryFn: ({ signal }) => api.listInstalledMarketplacePlugins(signal),
    enabled: slash >= 0,
  });
  const advisoriesQuery = useQuery({
    queryKey: marketplaceAdvisoriesKey,
    queryFn: ({ signal }) => api.getMarketplaceAdvisories(signal),
    enabled: slash >= 0,
  });
  // Bare `!ENV` markers the public spec requires — computed once the detail lands.
  const bareEnvVars = detailQuery.data !== undefined ? requiredEnvVars(detailQuery.data) : [];
  // The deployment env's var NAMES (never values), read only to PRE-SATISFY a
  // required marker the deployment already provides — and only once the operator
  // opens the install dialog for a listing that has required markers. On error the
  // set is empty (fail-open: the var stays collectable, the server stays the gate).
  const envConfigQuery = useQuery({
    queryKey: envConfigKey,
    queryFn: ({ signal }) => api.getEnvConfig(signal),
    enabled: slash >= 0 && bareEnvVars.length > 0 && activeAction === 'install',
  });

  const onInstallSuccess = (receipt: MarketplaceInstallResult, verb: string): void => {
    setActiveAction(null);
    setResult({
      verb,
      ref: receipt.ref,
      version: receipt.version,
      notes: receipt.notes,
      advisories: receipt.advisories,
      routes: receipt.routes,
    });
    // The app pip-installed/uninstalled a plugin and reloaded: tools, agents,
    // extensions, channels, the manifest — ANY server-derived cache — may now be
    // stale. Invalidate the whole cache rather than a hand-picked subset.
    void queryClient.invalidateQueries();
  };

  // The install/update body minus the ref the mutation supplies: the env dialog
  // adds an mcp-server's `!ENV` values + secret marks, the mount dialog adds the
  // chosen route bases + public-route consent; a plain install/update sends none.
  const installMutation = useMutation({
    mutationFn: (body: Omit<MarketplaceInstallBody, 'ref'>) =>
      api.installMarketplacePlugin({ ref: refValue, ...body }),
    onSuccess: (receipt) => {
      onInstallSuccess(receipt, 'Installed');
    },
  });
  const updateMutation = useMutation({
    mutationFn: (body: Omit<MarketplaceInstallBody, 'ref'>) =>
      api.updateMarketplacePlugin({ ref: refValue, ...body }),
    onSuccess: (receipt) => {
      onInstallSuccess(receipt, 'Updated');
    },
  });
  const uninstallMutation = useMutation({
    mutationFn: () => api.uninstallMarketplacePlugin({ ref: refValue }),
    onSuccess: (receipt) => {
      setActiveAction(null);
      setResult({
        verb: 'Uninstalled',
        ref: receipt.ref,
        version: null,
        notes: receipt.notes,
        advisories: [],
        routes: [],
      });
      void queryClient.invalidateQueries();
    },
  });

  if (slash < 0) {
    return (
      <Stack>
        <BackButton onBack={onBack} />
        <ErrorState
          message={`Malformed plugin reference "${refValue}" (expected "namespace/name").`}
        />
      </Stack>
    );
  }

  if (detailQuery.isPending) {
    return (
      <Stack>
        <BackButton onBack={onBack} />
        <Skeleton height={48} />
        <Skeleton height={120} />
        <Skeleton height={120} />
      </Stack>
    );
  }
  if (detailQuery.isError) {
    return (
      <Stack>
        <BackButton onBack={onBack} />
        <ErrorState
          message={errorMessage(detailQuery.error)}
          onRetry={() => void detailQuery.refetch()}
        />
      </Stack>
    );
  }

  // The marketplace install store is unconfigured: an install/update/uninstall
  // answered with a 501 `marketplace-not-configured`. Disable the write buttons and
  // show the muted OFF note. Browse/detail reads never need the store, so they stay
  // untouched. Uninstall is folded in for symmetry even though its button unmounts
  // when the store is off (an unconfigured store carries no installed rows to remove).
  const storeRefusal = [installMutation.error, updateMutation.error, uninstallMutation.error].find(
    isFeatureDisabled,
  );
  const storeRefusalMessage =
    storeRefusal !== undefined ? featureDisabledMessage(storeRefusal) : null;

  const detail = detailQuery.data;
  // The required markers still to collect: the bare `!ENV` vars minus any the
  // deployment env already provides (pre-satisfied). Empty → a plain one-click
  // install with no env dialog, non-empty → the env dialog collects them.
  const presetEnvKeys = new Set(Object.keys(envConfigQuery.data?.env ?? {}));
  const requiredEnvVarsToCollect = requiredEnvVars(detail).filter(
    (name) => !presetEnvKeys.has(name),
  );
  // The route-carrying items of the latest version — a channel or router that
  // declares HTTP routes. When present, install/update runs through the mount
  // dialog so the operator sees, remaps, and accepts the resulting paths.
  const routeItems = routeItemsOf(detail.latest?.items ?? []);
  const version = detail.latest?.version ?? null;
  // The stored `{item_name: base}` mounts of this plugin's installed row (absent
  // until the installed query lands, or when not installed). Threaded into the
  // routes card (render at the ACTUAL base) and the update dialog (seed the base
  // inputs from the CURRENT mount, not the declared default).
  const installedMounts = installedQuery.data?.installed.find(
    (row) => row.ref === refValue,
  )?.route_mounts;
  const matching =
    advisoriesQuery.data !== undefined
      ? advisoriesForListing(advisoriesQuery.data.advisories, refValue)
      : [];
  const closeAction = (): void => {
    if (activeAction === 'install') installMutation.reset();
    if (activeAction === 'update') updateMutation.reset();
    if (activeAction === 'uninstall') uninstallMutation.reset();
    setActiveAction(null);
  };

  return (
    <Stack>
      <div className="tai-row">
        <BackButton onBack={onBack} />
        <h1 className="tai-page-title" style={{ wordBreak: 'break-word' }}>
          {refValue}
        </h1>
      </div>

      <InfoCard detail={detail} />

      <ActionsCard
        detail={detail}
        installedQuery={installedQuery}
        storeRefusalMessage={storeRefusalMessage}
        onOpen={(action) => {
          setActiveAction(action);
        }}
      />

      <Card>
        <CopyField label="Package" value={detail.package} idPrefix="install-package" />
      </Card>

      {result !== null ? (
        <Card>
          <div role="status" className="tai-stack tai-stack-2">
            <span className="tai-status tai-status-ok">
              <CheckCircleIcon />
              <strong>
                {result.verb} {result.ref}
                {result.version !== null ? ` ${result.version}` : ''}
              </strong>
            </span>
            {result.notes.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 'var(--tai-space-4)' }}>
                {result.notes.map((note, index) => (
                  <li key={index}>{note}</li>
                ))}
              </ul>
            ) : null}
            {result.advisories.length > 0 ? (
              <div className="tai-stack tai-stack-2">
                {result.advisories.map((advisory) => (
                  <div key={advisory.id} className="tai-row">
                    <Badge variant={severityVariant(advisory.severity)}>{advisory.severity}</Badge>
                    <span>{advisory.summary}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {result.routes.length > 0 ? (
              <div className="tai-stack tai-stack-2">
                <span className="tai-muted">Mounted routes</span>
                <ul style={{ margin: 0, paddingLeft: 'var(--tai-space-4)' }}>
                  {result.routes.map((route) => (
                    <li key={`${route.item}/${route.full_path}/${route.methods.join(',')}`}>
                      <code className="tai-mono">{route.full_path}</code>{' '}
                      <span className="tai-muted">{route.methods.join(', ')}</span>{' '}
                      {route.public ? <Badge variant="warning">public</Badge> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {advisoriesQuery.isError ? (
        <ErrorState
          message={errorMessage(advisoriesQuery.error)}
          onRetry={() => void advisoriesQuery.refetch()}
        />
      ) : matching.length > 0 ? (
        <WarningBlock>
          <strong className="tai-status-warn">Security advisories</strong>
          {matching.map((advisory) => (
            <div key={advisory.id} className="tai-row">
              <Badge variant={severityVariant(advisory.severity)}>{advisory.severity}</Badge>
              <span>{advisory.summary}</span>
              <span className="tai-muted">Affects {advisory.affected_versions}</span>
            </div>
          ))}
        </WarningBlock>
      ) : null}

      <ItemsCard detail={detail} />
      <RoutesCard routeItems={routeItems} mounts={installedMounts} />
      <VersionsCard versions={detail.versions} />

      {activeAction === 'install' ? (
        routeItems.length > 0 ? (
          // Route-carrying plugins mount through the preview dialog, which also
          // collects any required mcp-server env in the same flow.
          <MountInstallDialog
            refValue={refValue}
            version={version}
            verb="Install"
            routeItems={routeItems}
            requiredEnvVars={requiredEnvVarsToCollect}
            onSubmit={(extras) => installMutation.mutateAsync(extras).then(() => undefined)}
            onClose={closeAction}
          />
        ) : requiredEnvVarsToCollect.length > 0 ? (
          // Same Install button, kind-agnostic: the env dialog is inserted
          // only when the public spec's markers require values to be collected.
          <InstallEnvDialog
            refValue={refValue}
            version={detail.latest?.version ?? null}
            requiredVars={requiredEnvVarsToCollect}
            isPending={installMutation.isPending}
            error={installMutation.error}
            onSubmit={(env, secretKeys) => {
              installMutation.mutate({ env, secret_keys: secretKeys });
            }}
            onClose={closeAction}
          />
        ) : (
          <ConfirmDialog
            title="Install plugin"
            confirmLabel="Install"
            pendingLabel="Installing"
            confirmVariant="primary"
            isPending={installMutation.isPending}
            // An OFF 501 `marketplace-not-configured` is a state, not an error: show
            // the muted note in the dialog (blocking retry), never a loud red alert.
            error={isFeatureDisabled(installMutation.error) ? null : installMutation.error}
            disabledNote={
              isFeatureDisabled(installMutation.error) ? (
                <FeatureDisabled
                  feature="Marketplace installs"
                  message={featureDisabledMessage(installMutation.error)}
                />
              ) : undefined
            }
            onConfirm={() => {
              installMutation.mutate({});
            }}
            onClose={closeAction}
          >
            <p style={{ margin: 0 }}>
              Install {refValue}
              {detail.latest !== null ? ` v${detail.latest.version}` : ''}? The app will pip-install
              the package and reload.
            </p>
          </ConfirmDialog>
        )
      ) : null}
      {activeAction === 'update' && routeItems.length > 0 ? (
        // Route-carrying plugins update through the same mount dialog: the
        // preview surfaces any new collision or newly-public route to accept.
        <MountInstallDialog
          refValue={refValue}
          version={version}
          verb="Update"
          routeItems={routeItems}
          storedMounts={installedMounts}
          requiredEnvVars={[]}
          onSubmit={(extras) => updateMutation.mutateAsync(extras).then(() => undefined)}
          onClose={closeAction}
        />
      ) : null}
      {activeAction === 'update' && routeItems.length === 0 ? (
        <ConfirmDialog
          title="Update plugin"
          confirmLabel="Update"
          pendingLabel="Updating"
          confirmVariant="primary"
          isPending={updateMutation.isPending}
          error={isFeatureDisabled(updateMutation.error) ? null : updateMutation.error}
          disabledNote={
            isFeatureDisabled(updateMutation.error) ? (
              <FeatureDisabled
                feature="Marketplace installs"
                message={featureDisabledMessage(updateMutation.error)}
              />
            ) : undefined
          }
          onConfirm={() => {
            updateMutation.mutate({});
          }}
          onClose={closeAction}
        >
          <p style={{ margin: 0 }}>
            Update {refValue} to the latest version? The app will pip-install the package and
            reload.
          </p>
          {/* An upgrade that adds a required mcp-server variable is loudly refused by
              the server (no env dialog on update); name the recourse. */}
          <p className="tai-muted" style={{ margin: 0 }}>
            If the update needs a new required variable, set it in the{' '}
            <AppLink to="settings">environment editor</AppLink>, then retry.
          </p>
        </ConfirmDialog>
      ) : null}
      {activeAction === 'uninstall' ? (
        <ConfirmDialog
          title="Uninstall plugin"
          confirmLabel="Uninstall"
          pendingLabel="Uninstalling"
          isPending={uninstallMutation.isPending}
          error={uninstallMutation.error}
          onConfirm={() => {
            uninstallMutation.mutate();
          }}
          onClose={closeAction}
        >
          <p style={{ margin: 0 }}>
            Uninstall {refValue}? The app will remove the package and reload.
          </p>
        </ConfirmDialog>
      ) : null}
    </Stack>
  );
}

function BackButton({ onBack }: { readonly onBack: () => void }): ReactNode {
  return (
    <div>
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeftIcon />
        Back to marketplace
      </Button>
    </div>
  );
}

/**
 * The install confirm for an mcp-server whose spec carries required `!ENV` markers:
 * one input per required var, each with a "Store as secret" toggle DEFAULTING ON.
 *
 * Security: `read_env` returns real values on the wire (masking is display-side
 * only), so an UNMARKED credential would render in cleartext in the env editor —
 * defaulting the toggle on lands each collected value in `secret_keys`. A blank
 * field is omitted (the deployment may already provide it); the server's
 * install-time dangling-`!ENV` refusal is the real enforcement, surfaced loudly here.
 */
function InstallEnvDialog({
  refValue,
  version,
  requiredVars,
  isPending,
  error,
  onSubmit,
  onClose,
}: {
  readonly refValue: string;
  readonly version: string | null;
  readonly requiredVars: readonly string[];
  readonly isPending: boolean;
  readonly error: Error | null;
  readonly onSubmit: (env: Record<string, string>, secretKeys: string[]) => void;
  readonly onClose: () => void;
}): ReactNode {
  const [values, setValues] = useState<Record<string, string>>({});
  const [secret, setSecret] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(requiredVars.map((name) => [name, true])),
  );
  const disabled = isFeatureDisabled(error);
  const submit = (): void => {
    const { env, secretKeys } = collectEnv(requiredVars, values, secret);
    onSubmit(env, secretKeys);
  };
  return (
    <ConfirmDialog
      title="Install plugin"
      confirmLabel="Install"
      pendingLabel="Installing"
      confirmVariant="primary"
      isPending={isPending}
      // An OFF 501 `marketplace-not-configured` is a state, not an error.
      error={disabled ? null : error}
      disabledNote={
        disabled ? (
          <FeatureDisabled feature="Marketplace installs" message={featureDisabledMessage(error)} />
        ) : undefined
      }
      onConfirm={submit}
      onClose={onClose}
    >
      <div className="tai-stack tai-stack-3">
        <p style={{ margin: 0 }}>
          Install {refValue}
          {version !== null ? ` v${version}` : ''}? This server needs the following settings. Leave
          a field blank if the deployment already provides it.
        </p>
        <EnvVarFields
          requiredVars={requiredVars}
          values={values}
          secret={secret}
          onChangeValue={(name, value) => {
            setValues((prev) => ({ ...prev, [name]: value }));
          }}
          onToggleSecret={(name, checked) => {
            setSecret((prev) => ({ ...prev, [name]: checked }));
          }}
        />
      </div>
    </ConfirmDialog>
  );
}

/** The install-state badges + action buttons, from the installed query. */
function ActionsCard({
  detail,
  installedQuery,
  storeRefusalMessage,
  onOpen,
}: {
  readonly detail: MarketplacePluginDetail;
  readonly installedQuery: ReturnType<typeof useQuery<MarketplaceInstalled, Error>>;
  readonly storeRefusalMessage: string | null;
  readonly onOpen: (action: ActiveAction) => void;
}): ReactNode {
  const storeDisabled = storeRefusalMessage !== null;
  const ref = `${detail.namespace}/${detail.name}`;

  if (installedQuery.isPending) {
    return (
      <Card>
        <Skeleton height={32} />
      </Card>
    );
  }
  if (installedQuery.isError) {
    return (
      <Card>
        <ErrorState
          message={errorMessage(installedQuery.error)}
          onRetry={() => void installedQuery.refetch()}
        />
      </Card>
    );
  }

  const installed = installedQuery.data.installed.find((row) => row.ref === ref);

  return (
    <Card>
      <div className="tai-row">
        {installed === undefined ? (
          <Button
            variant="primary"
            disabled={storeDisabled}
            onClick={() => {
              onOpen('install');
            }}
          >
            Install
          </Button>
        ) : (
          <>
            <Badge variant="success">Installed v{installed.version}</Badge>
            {installed.missing_upstream ? (
              <Badge>Not in the registry</Badge>
            ) : installed.update_available && installed.latest !== null ? (
              <>
                <Badge variant="warning">Update available: v{installed.latest}</Badge>
                <Button
                  variant="primary"
                  disabled={storeDisabled}
                  onClick={() => {
                    onOpen('update');
                  }}
                >
                  Update
                </Button>
              </>
            ) : null}
            <Button
              variant="danger"
              onClick={() => {
                onOpen('uninstall');
              }}
            >
              Uninstall
            </Button>
          </>
        )}
      </div>
      {storeRefusalMessage !== null ? (
        <FeatureDisabled feature="Marketplace installs" message={storeRefusalMessage} />
      ) : null}
    </Card>
  );
}
