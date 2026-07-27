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
  ArrowLeftIcon,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  ExternalLinkButton,
  ScrollRegion,
  Skeleton,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TagChips,
  errorMessage,
  useApi,
  useProseScrollRegions,
} from '@tai42/studio-sdk';
import type {
  MarketplaceInstallResult,
  MarketplaceInstalledPlugin,
  MarketplacePluginDetail,
  MarketplaceVersion,
} from '@tai42/api-client';

import { advisoriesForListing, severityVariant, WarningBlock } from './advisories';
import { ListingIcon, listingTitle } from './display';
import { marketplaceAdvisoriesKey, marketplaceInstalledKey, marketplacePluginKey } from './keys';

/** Which mutation dialog is open (each is mounted only while active). */
type ActiveAction = 'install' | 'update' | 'uninstall';

/** The last completed action's receipt, rendered as an inline success line. */
interface ActionResult {
  readonly verb: string;
  readonly ref: string;
  readonly version: string | null;
  readonly notes: readonly string[];
  readonly advisories: MarketplaceInstallResult['advisories'];
}

const sectionStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
} as const;
const cardHeadingStyle = {
  margin: '0 0 var(--tai-space-3)',
  fontSize: 'var(--tai-text-lg)',
} as const;

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
  // one that actually scrolls becomes a named keyboard target.
  const readmeRef = useProseScrollRegions();
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
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--tai-space-2)',
            minWidth: 0,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 'var(--tai-text-xl)', wordBreak: 'break-word' }}>
            {title}
          </h2>
          <code style={{ color: 'var(--tai-color-text-muted)', fontSize: 'var(--tai-text-sm)' }}>
            {detail.package}
          </code>
          <p style={{ margin: 0 }}>{detail.description}</p>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--tai-space-2)',
              alignItems: 'center',
            }}
          >
            <Badge>{detail.trust_tier}</Badge>
            <Badge>{detail.pricing}</Badge>
            <span style={{ color: 'var(--tai-color-text-muted)', fontSize: 'var(--tai-text-sm)' }}>
              {detail.downloads} downloads
            </span>
            {detail.license !== null ? (
              <span
                style={{ color: 'var(--tai-color-text-muted)', fontSize: 'var(--tai-text-sm)' }}
              >
                License: {detail.license}
              </span>
            ) : null}
          </div>
          <TagChips tags={[...detail.categories, ...detail.tags]} />
          {detail.homepage_url !== null || detail.repository_url !== null ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--tai-space-2)' }}>
              {detail.homepage_url !== null ? (
                <ExternalLinkButton url={detail.homepage_url}>Homepage</ExternalLinkButton>
              ) : null}
              {detail.repository_url !== null ? (
                <ExternalLinkButton url={detail.repository_url}>Repository</ExternalLinkButton>
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
      <h2 style={cardHeadingStyle}>Contained items</h2>
      {items.length === 0 ? (
        <EmptyState title="No items" description="This plugin has no published items yet." />
      ) : (
        <ScrollRegion label="Contained items">
          <Table>
            <THead>
              <TR>
                <TH>Kind</TH>
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

/** The version history, latest first as the wire orders it. */
function VersionsCard({
  versions,
}: {
  readonly versions: readonly MarketplaceVersion[];
}): ReactNode {
  return (
    <Card>
      <h2 style={cardHeadingStyle}>Versions</h2>
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

  const onInstallSuccess = (receipt: MarketplaceInstallResult, verb: string): void => {
    setActiveAction(null);
    setResult({
      verb,
      ref: receipt.ref,
      version: receipt.version,
      notes: receipt.notes,
      advisories: receipt.advisories,
    });
    // The app pip-installed/uninstalled a plugin and reloaded: tools, agents,
    // extensions, channels, the manifest — ANY server-derived cache — may now be
    // stale. Invalidate the whole cache rather than a hand-picked subset.
    void queryClient.invalidateQueries();
  };

  const installMutation = useMutation({
    mutationFn: () => api.installMarketplacePlugin({ ref: refValue }),
    onSuccess: (receipt) => {
      onInstallSuccess(receipt, 'Installed');
    },
  });
  const updateMutation = useMutation({
    mutationFn: () => api.updateMarketplacePlugin({ ref: refValue }),
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
      });
      void queryClient.invalidateQueries();
    },
  });

  if (slash < 0) {
    return (
      <div style={sectionStyle}>
        <BackButton onBack={onBack} />
        <ErrorState
          message={`Malformed plugin reference "${refValue}" (expected "namespace/name").`}
        />
      </div>
    );
  }

  if (detailQuery.isPending) {
    return (
      <div style={sectionStyle}>
        <BackButton onBack={onBack} />
        <Skeleton height={48} />
        <Skeleton height={120} />
        <Skeleton height={120} />
      </div>
    );
  }
  if (detailQuery.isError) {
    return (
      <div style={sectionStyle}>
        <BackButton onBack={onBack} />
        <ErrorState
          message={errorMessage(detailQuery.error)}
          onRetry={() => void detailQuery.refetch()}
        />
      </div>
    );
  }

  const detail = detailQuery.data;
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
    <div style={sectionStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-3)' }}>
        <BackButton onBack={onBack} />
        <h1 style={{ margin: 0, fontSize: 'var(--tai-text-xl)', wordBreak: 'break-word' }}>
          {refValue}
        </h1>
      </div>

      <InfoCard detail={detail} />

      <ActionsCard
        detail={detail}
        installedQuery={installedQuery}
        onOpen={(action) => {
          setActiveAction(action);
        }}
      />

      {result !== null ? (
        <div
          role="status"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--tai-space-2)',
            padding: 'var(--tai-space-4)',
            borderRadius: 'var(--tai-radius-md)',
            border: '1px solid var(--tai-color-success)',
            background: 'color-mix(in srgb, var(--tai-color-success) 12%, transparent)',
          }}
        >
          <strong>
            {result.verb} {result.ref}
            {result.version !== null ? ` ${result.version}` : ''}
          </strong>
          {result.notes.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: 'var(--tai-space-4)' }}>
              {result.notes.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
          ) : null}
          {result.advisories.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-1)' }}>
              {result.advisories.map((advisory) => (
                <div
                  key={advisory.id}
                  style={{ display: 'flex', gap: 'var(--tai-space-2)', alignItems: 'center' }}
                >
                  <Badge variant={severityVariant(advisory.severity)}>{advisory.severity}</Badge>
                  <span>{advisory.summary}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
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
            <div
              key={advisory.id}
              style={{
                display: 'flex',
                gap: 'var(--tai-space-2)',
                alignItems: 'baseline',
                flexWrap: 'wrap',
              }}
            >
              <Badge variant={severityVariant(advisory.severity)}>{advisory.severity}</Badge>
              <span>{advisory.summary}</span>
              <span style={{ fontSize: 'var(--tai-text-sm)' }}>
                Affects {advisory.affected_versions}
              </span>
            </div>
          ))}
        </WarningBlock>
      ) : null}

      <ItemsCard detail={detail} />
      <VersionsCard versions={detail.versions} />

      {activeAction === 'install' ? (
        <ConfirmDialog
          title="Install plugin"
          confirmLabel="Install"
          pendingLabel="Installing"
          confirmVariant="primary"
          isPending={installMutation.isPending}
          error={installMutation.error}
          onConfirm={() => {
            installMutation.mutate();
          }}
          onClose={closeAction}
        >
          <p style={{ margin: 0 }}>
            Install {refValue}
            {detail.latest !== null ? ` v${detail.latest.version}` : ''}? The app will pip-install
            the package and reload.
          </p>
        </ConfirmDialog>
      ) : null}
      {activeAction === 'update' ? (
        <ConfirmDialog
          title="Update plugin"
          confirmLabel="Update"
          pendingLabel="Updating"
          confirmVariant="primary"
          isPending={updateMutation.isPending}
          error={updateMutation.error}
          onConfirm={() => {
            updateMutation.mutate();
          }}
          onClose={closeAction}
        >
          <p style={{ margin: 0 }}>
            Update {refValue} to the latest version? The app will pip-install the package and
            reload.
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
    </div>
  );
}

function BackButton({ onBack }: { readonly onBack: () => void }): ReactNode {
  return (
    <div>
      <Button onClick={onBack}>
        <ArrowLeftIcon />
        Back to marketplace
      </Button>
    </div>
  );
}

/** The install-state badges + action buttons, from the installed query. */
function ActionsCard({
  detail,
  installedQuery,
  onOpen,
}: {
  readonly detail: MarketplacePluginDetail;
  readonly installedQuery: ReturnType<
    typeof useQuery<readonly MarketplaceInstalledPlugin[], Error>
  >;
  readonly onOpen: (action: ActiveAction) => void;
}): ReactNode {
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

  const installed = installedQuery.data.find((row) => row.ref === ref);

  return (
    <Card>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--tai-space-3)',
          alignItems: 'center',
        }}
      >
        {installed === undefined ? (
          <Button
            variant="primary"
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
    </Card>
  );
}
