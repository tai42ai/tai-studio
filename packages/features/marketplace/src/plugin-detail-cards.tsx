/** The read-only plugin-detail cards: listing info + readme, contained items, routes,
 * version history, the back control, and the post-action receipt. */
import type { MarketplacePluginDetail, MarketplaceVersion } from '@tai42/api-client';
import {
  ArrowLeftIcon,
  Badge,
  Button,
  Card,
  CheckCircleIcon,
  EmptyState,
  ExternalLinkButton,
  ScrollRegion,
  Table,
  TagChips,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useProseScrollRegions,
} from '@tai42/studio-sdk';
import { type ReactNode, useMemo } from 'react';

import { severityVariant } from './advisories';
import { ListingIcon, listingTitle } from './display';
import type { RouteItem } from './install-dialog';
import { type ActionResult, deliveryOf, versionStatusVariant } from './plugin-detail-data';

export function BackButton({ onBack }: { readonly onBack: () => void }): ReactNode {
  return (
    <div>
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeftIcon />
        Back to marketplace
      </Button>
    </div>
  );
}

function VersionStatusBadge({ status }: { readonly status: string }): ReactNode {
  return <Badge variant={versionStatusVariant(status)}>{status}</Badge>;
}

/** The listing header + readme + metadata. */
export function InfoCard({ detail }: { readonly detail: MarketplacePluginDetail }): ReactNode {
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
          {/* A descriptor listing names no package; show an em dash in its place. */}
          <code className="tai-mono tai-muted">{detail.package ?? '—'}</code>
          <p style={{ margin: 0 }}>{detail.description}</p>
          <div className="tai-row">
            <Badge>{detail.trust_tier}</Badge>
            <Badge>{detail.pricing}</Badge>
            {/* How the plugin is delivered: a pip-installed `package` or a
                declarative `descriptor` (nothing installed but the manifest entry),
                derived from the listing's package the way the server derives it. */}
            {detail.latest !== null ? <Badge>{deliveryOf(detail)}</Badge> : null}
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
export function ItemsCard({ detail }: { readonly detail: MarketplacePluginDetail }): ReactNode {
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
 * whether it is served public. Renders nothing when the plugin declares no routes.
 */
export function RoutesCard({
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
export function VersionsCard({
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

/** The receipt of the last completed install/update/uninstall as an inline success line. */
export function ActionResultCard({ result }: { readonly result: ActionResult }): ReactNode {
  return (
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
  );
}
