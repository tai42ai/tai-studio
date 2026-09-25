/** Marketplace listing, version, install and advisory schemas. */
import { z } from 'zod';

/**
 * The CLOSED HTTP-method enum fixed by the contract's RouteMethod, the one source
 * for every route-method field (declaration and install/preview responses alike):
 * a wire method the contract does not define fails loudly as drift rather than
 * passing through silently.
 */
export const routeMethod = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
export type RouteMethod = z.infer<typeof routeMethod>;

/**
 * How the plugin is delivered, derived server-side from whether its spec names a
 * package: `package` is pip-installed, `descriptor` (marketplace `source` `spec`)
 * installs nothing but the manifest entry. A CLOSED enum, so a wire value the
 * server does not derive fails loudly as drift.
 */
export const marketplaceDelivery = z.enum(['package', 'descriptor']);
export type MarketplaceDelivery = z.infer<typeof marketplaceDelivery>;

/**
 * The install-provenance vocabulary a listing/version resolves from: a pip index
 * (`pypi`), a git tag (`github`), or a descriptor yml (`spec`). CLOSED, so a wire
 * value outside it fails as drift.
 */
export const marketplaceSource = z.enum(['pypi', 'github', 'spec']);
export type MarketplaceSource = z.infer<typeof marketplaceSource>;

/**
 * One env var an item requires before install: its `name` and whether its value is
 * a `secret` (an OAuth client secret is; a client id or a plain marker var is not).
 * The install dialog seeds each toggle from `secret` and collects the missing ones.
 */
export const marketplaceRequiredEnvVar = z.object({ name: z.string(), secret: z.boolean() });
export type MarketplaceRequiredEnvVar = z.infer<typeof marketplaceRequiredEnvVar>;

/**
 * One HTTP route an item declares in its `tai-plugin.yml`: a `path` relative to
 * the item's mount base, the `methods` it answers, and whether it is served
 * `public` (without authentication). The absolute path an operator sees is
 * resolved from the base at install time.
 */
export const marketplaceRouteDecl = z.object({
  path: z.string(),
  methods: z.array(routeMethod),
  public: z.boolean(),
});
export type MarketplaceRouteDecl = z.infer<typeof marketplaceRouteDecl>;

/**
 * A route-carrying item's declared mount: the default `base` prefix the routes
 * hang off (an operator may remap it at install) and the `paths` it registers.
 */
export const marketplaceRoutesDecl = z.object({
  base: z.string(),
  paths: z.array(marketplaceRouteDecl),
});
export type MarketplaceRoutesDecl = z.infer<typeof marketplaceRoutesDecl>;

/**
 * One contained item of a marketplace plugin's published version: its kind
 * (tool / agent / extension / …), name, description, free-form tags, and the
 * logical group it belongs to (`null` when ungrouped). `routes` is present only
 * on a route-carrying item (a router or channel); absent/null on every other.
 * `required_env` is the env vars the item needs before install — but the REGISTRY's
 * plugin-detail body does NOT carry it per item: required-env is server-computed
 * (`required_env_for_spec`) and rides the install PREVIEW, never the listing detail,
 * so the registry OMITS it here and it parses as `undefined`. Optional (not
 * defaulted) so the type mirrors the wire; the authority the install dialog collects
 * from is the preview's `required_env`/`missing_env`, never this field.
 */
export const marketplaceItem = z.object({
  kind: z.string(),
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  group: z.string().nullable(),
  routes: marketplaceRoutesDecl.nullish(),
  required_env: z.array(marketplaceRequiredEnvVar).optional(),
});
export type MarketplaceItem = z.infer<typeof marketplaceItem>;

/**
 * One kind summary of a search row: an item kind, how many UNGROUPED items of
 * that kind the listing's latest published version carries, and their names.
 * The registry orders the array count DESC then kind ASC, and each entry's
 * `names` ASC; the UI renders in that order.
 */
export const marketplaceSearchKind = z.object({
  kind: z.string(),
  count: z.number(),
  names: z.array(z.string()),
});
export type MarketplaceSearchKind = z.infer<typeof marketplaceSearchKind>;

/**
 * One logical group of a search row: the group name and how many items the
 * listing's latest published version places in it. The registry orders the
 * array count DESC then name ASC; the UI renders in that order.
 */
export const marketplaceSearchGroup = z.object({
  name: z.string(),
  count: z.number(),
});
export type MarketplaceSearchGroup = z.infer<typeof marketplaceSearchGroup>;

/**
 * One listing-level search row (`GET /api/marketplace/search`). `ref` is the
 * "namespace/name" install target, so every row carries enough to link to its
 * plugin. `latest_version` is nullable defensively; the search relation only
 * emits listings with a published version. `kinds` summarizes that latest
 * version's UNGROUPED items; `groups` summarizes its logical groups (`[]` when
 * none). Both keys are always present.
 */
export const marketplaceSearchRow = z.object({
  ref: z.string(),
  namespace: z.string(),
  name: z.string(),
  display_name: z.string().nullable(),
  icon_url: z.string().nullable(),
  // Null for a descriptor listing (`source` `spec`): it names no package.
  package: z.string().nullable(),
  description: z.string(),
  categories: z.array(z.string()),
  tags: z.array(z.string()),
  trust_tier: z.string(),
  pricing: z.string(),
  // A display-only premium flag: a badge, never a payment surface. Nullable
  // + optional: an older registry omits it, and it is absent on non-premium rows.
  premium: z.boolean().nullish(),
  latest_version: z.string().nullable(),
  downloads: z.number(),
  updated_at: z.string(),
  kinds: z.array(marketplaceSearchKind),
  groups: z.array(marketplaceSearchGroup),
});
export type MarketplaceSearchRow = z.infer<typeof marketplaceSearchRow>;

/**
 * One page of listing rows. The wire carries no next-page field — has-next is
 * COMPUTED: `page * page_size < total`.
 */
export const marketplaceSearchPage = z.object({
  listings: z.array(marketplaceSearchRow),
  total: z.number(),
  page: z.number(),
  page_size: z.number(),
});
export type MarketplaceSearchPage = z.infer<typeof marketplaceSearchPage>;

/**
 * One version of a listing as the versions list carries it (`version`, its
 * publication `status`, the `contract_range` it was validated against, and when
 * it was `published_at`). `contract_range` and `published_at` are null until a
 * version reaches the published state, so both are nullable.
 */
export const marketplaceVersion = z.object({
  version: z.string(),
  contract_range: z.string().nullable(),
  status: z.string(),
  published_at: z.string().nullable(),
});
export type MarketplaceVersion = z.infer<typeof marketplaceVersion>;

/**
 * The listing's latest published version as embedded in its detail: the version
 * (with the `marketplaceVersion` lifecycle fields) and the items it contains. The
 * registry's detail body carries NO per-version `delivery` field — delivery is
 * server-computed from whether the spec names a package, and the detail surface
 * derives it from the listing's `package` (null ⇒ `descriptor`, else `package`).
 * Env to collect comes from the install preview (`required_env` / `missing_env`),
 * never from these items.
 */
export const marketplaceLatestVersion = marketplaceVersion.extend({
  items: z.array(marketplaceItem),
});
export type MarketplaceLatestVersion = z.infer<typeof marketplaceLatestVersion>;

/** One advisory row; `withdrawn_at` non-null means it no longer applies. */
export const marketplaceAdvisory = z.object({
  id: z.number(),
  // The "namespace/name" listing ref exactly as the registry serves it — the
  // wire field consumers match installed plugins against.
  listing: z.string(),
  affected_versions: z.string(),
  severity: z.string(),
  summary: z.string(),
  created_at: z.string(),
  withdrawn_at: z.string().nullable(),
});
export type MarketplaceAdvisory = z.infer<typeof marketplaceAdvisory>;

/**
 * A plugin's full detail (`GET /api/marketplace/plugins/{ns}/{name}`): the
 * listing, its latest published version (`null` when nothing is published yet,
 * carrying the contained items), and the known version history.
 */
export const marketplacePluginDetail = z.object({
  namespace: z.string(),
  name: z.string(),
  display_name: z.string().nullable(),
  icon_url: z.string().nullable(),
  // Null for a descriptor listing (`source` `spec`): it names no package.
  package: z.string().nullable(),
  // The install-provenance vocabulary (`pypi` / `github` / `spec`). Nullish: an
  // older registry omits it, and a listing with nothing published carries none.
  source: marketplaceSource.nullish(),
  description: z.string(),
  readme_md: z.string().nullable(),
  license: z.string().nullable(),
  homepage_url: z.string().nullable(),
  repository_url: z.string().nullable(),
  // The marketplace-stored docs-site URL: the store is the source, the UI a
  // link. Nullable + optional: absent on a listing with no published docs.
  docs_url: z.string().nullish(),
  categories: z.array(z.string()),
  tags: z.array(z.string()),
  trust_tier: z.string(),
  pricing: z.string(),
  // A display-only premium flag: a badge, never a payment surface.
  premium: z.boolean().nullish(),
  downloads: z.number(),
  latest: marketplaceLatestVersion.nullable(),
  versions: z.array(marketplaceVersion),
});
export type MarketplacePluginDetail = z.infer<typeof marketplacePluginDetail>;

/**
 * One installed plugin's compat verdict against the RUNNING tai42-contract:
 * `compatible` / `incompatible` per its declared contract range, `unknown` when
 * no verdict could be computed. `reason` is the human-readable explanation of a
 * non-`compatible` verdict, `null` when compatible. CLOSED (`.strict()`): the
 * server is built against exactly this shape, so an unknown key is drift and
 * throws instead of being stripped.
 */
export const marketplaceInstalledCompat = z
  .object({
    status: z.enum(['compatible', 'incompatible', 'unknown']),
    reason: z.string().nullable(),
  })
  .strict();
export type MarketplaceInstalledCompat = z.infer<typeof marketplaceInstalledCompat>;

/**
 * One installed marketplace plugin as the local attribution store records it.
 * `latest` is the newest registry version (`null` when unknown);
 * `update_available` advertises only a newer COMPATIBLE version, and
 * `incompatible_newer` names the newest version blocked by the running
 * contract (`null` when none), so "an update exists but needs a newer core" is
 * visible. `missing_upstream` flags a plugin the registry no longer lists.
 * `compat` is the row's verdict against the running contract. CLOSED, like
 * every shape of the installed listing.
 */
export const marketplaceInstalledPlugin = z
  .object({
    ref: z.string(),
    version: z.string(),
    source: z.string(),
    // How the row was delivered: `package` for a pip-installed plugin, `descriptor`
    // for a descriptor-only plugin whose stored spec names no package.
    delivery: marketplaceDelivery,
    installed_at: z.string(),
    latest: z.string().nullable(),
    update_available: z.boolean(),
    incompatible_newer: z.string().nullable(),
    missing_upstream: z.boolean(),
    compat: marketplaceInstalledCompat,
    // The `{kind, name}` of every item this plugin's stored spec provides
    // (local truth). The connectors page's McpServersSection joins the mcp-server
    // item names against the manifest's mcp-entry titles to render an
    // installer-written entry read-only.
    items: z.array(marketplaceItem.pick({ kind: true, name: true })),
    // The persisted `{item_name: base}` mount this plugin is installed at (local
    // truth; `{}` means every item at its declared base). Studio seeds the update
    // flow and renders routes at the ACTUAL mounted base from this.
    route_mounts: z.record(z.string(), z.string()),
  })
  .strict();
export type MarketplaceInstalledPlugin = z.infer<typeof marketplaceInstalledPlugin>;

/**
 * The installed inventory (`GET /api/marketplace/installed`): the attributed
 * rows, each with its per-row compat verdict and update picture. CLOSED.
 */
export const marketplaceInstalled = z
  .object({
    installed: z.array(marketplaceInstalledPlugin),
  })
  .strict();
export type MarketplaceInstalled = z.infer<typeof marketplaceInstalled>;

/**
 * One per-plugin outcome of `POST /api/marketplace/upgrade-all`: `upgraded`,
 * already `up-to-date`, `no-compatible-version` in the registry, or `failed`;
 * `detail` always carries the human-readable specifics. CLOSED.
 */
export const marketplaceUpgradeAllRow = z
  .object({
    ref: z.string(),
    outcome: z.enum(['upgraded', 'up-to-date', 'no-compatible-version', 'failed']),
    detail: z.string(),
  })
  .strict();
export type MarketplaceUpgradeAllRow = z.infer<typeof marketplaceUpgradeAllRow>;

/** The whole upgrade-all readout: one outcome row per installed plugin. CLOSED. */
export const marketplaceUpgradeAllResult = z
  .object({
    results: z.array(marketplaceUpgradeAllRow),
  })
  .strict();
export type MarketplaceUpgradeAllResult = z.infer<typeof marketplaceUpgradeAllResult>;

/** The advisory state for installed plugins, with when it was last fetched. */
export const marketplaceAdvisories = z.object({
  advisories: z.array(marketplaceAdvisory),
  fetched_at: z.string(),
});

/** The registry's controlled category list, proxied through the skeleton. */
export const marketplaceCategories = z.array(z.string());

/** The registry's controlled item-kind list, proxied through the skeleton. */
export const marketplaceKinds = z.array(z.string());

/**
 * One route the install / update actually mounted: the item that owns it, the
 * absolute `full_path` it now answers, the `methods`, and whether it is served
 * `public`. The receipt lists these so the operator sees what was opened where.
 */
export const marketplaceMountedRoute = z.object({
  item: z.string(),
  full_path: z.string(),
  methods: z.array(routeMethod),
  public: z.boolean(),
});
export type MarketplaceMountedRoute = z.infer<typeof marketplaceMountedRoute>;

/**
 * The receipt of an install / update: what landed and at which version.
 * `notes` (env-selected items naming their activating env var) and any
 * non-critical `advisories` ride BOTH the install and update receipts.
 * `routes` is the mounted-route list — empty for a plugin that registers none.
 * The wire also carries `package`, `reload`, and `pip_output`, which the receipt
 * does not model — zod's default strip drops them; the UI renders the receipt,
 * not the raw install log.
 */
export const marketplaceInstallResult = z.object({
  ref: z.string(),
  version: z.string(),
  notes: z.array(z.string()),
  advisories: z.array(marketplaceAdvisory),
  routes: z.array(marketplaceMountedRoute),
});
export type MarketplaceInstallResult = z.infer<typeof marketplaceInstallResult>;

/** One resolved route in an install preview: the declared `path`, its resolved
 * absolute `full_path`, the `methods`, and whether it is `public`. */
export const marketplacePreviewRoute = z.object({
  path: z.string(),
  full_path: z.string(),
  methods: z.array(routeMethod),
  public: z.boolean(),
});
export type MarketplacePreviewRoute = z.infer<typeof marketplacePreviewRoute>;

/** One route-carrying item in an install preview: its resolved `base` (the
 * override or the default), the `default_base` it declares, and the routes that
 * mount under it. */
export const marketplacePreviewItem = z.object({
  item: z.string(),
  kind: z.string(),
  base: z.string(),
  default_base: z.string(),
  routes: z.array(marketplacePreviewRoute),
});
export type MarketplacePreviewItem = z.infer<typeof marketplacePreviewItem>;

/** One collision the preview found: a route whose resolved shape+method clashes
 * with an already-owned route. `conflict_owner` is `core` or `plugin:<ref>`; the
 * remedy is to remap the item's base. */
export const marketplacePreviewCollision = z.object({
  item: z.string(),
  full_path: z.string(),
  methods: z.array(routeMethod),
  conflict_owner: z.string(),
  conflict_path: z.string(),
});
export type MarketplacePreviewCollision = z.infer<typeof marketplacePreviewCollision>;

/** One public route the operator is asked to accept: served WITHOUT
 * authentication once installed. */
export const marketplacePreviewPublicRoute = z.object({
  item: z.string(),
  full_path: z.string(),
  methods: z.array(routeMethod),
});
export type MarketplacePreviewPublicRoute = z.infer<typeof marketplacePreviewPublicRoute>;

/**
 * The install preview (`POST /api/marketplace/install/preview`): the resolved
 * routes per item with any base overrides applied, the collisions against the
 * live registry, the public routes requiring acceptance, and whether acceptance
 * is required at all. `new_public_routes` narrows to rows not already approved
 * (the update case); on a fresh install it equals `public_routes`.
 *
 * `required_env` is every env var the spec requires with its derived secret-ness;
 * `missing_env` is the bare names not already present in the env store union
 * process env (server-computed — the ONE authority the dialog collects), and
 * `delivery` is the one word the surface shows (`package` / `descriptor`).
 */
export const marketplaceInstallPreview = z.object({
  ref: z.string(),
  version: z.string(),
  items: z.array(marketplacePreviewItem),
  collisions: z.array(marketplacePreviewCollision),
  public_routes: z.array(marketplacePreviewPublicRoute),
  new_public_routes: z.array(marketplacePreviewPublicRoute),
  requires_public_acceptance: z.boolean(),
  required_env: z.array(marketplaceRequiredEnvVar),
  missing_env: z.array(z.string()),
  delivery: marketplaceDelivery,
});
export type MarketplaceInstallPreview = z.infer<typeof marketplaceInstallPreview>;

/**
 * The receipt of an uninstall. `notes` carries operator warnings (e.g. a config
 * provider still selected by its env var); render them like the install
 * receipt's notes.
 */
export const marketplaceUninstallResult = z.object({
  ref: z.string(),
  uninstalled: z.literal(true),
  notes: z.array(z.string()),
});
export type MarketplaceUninstallResult = z.infer<typeof marketplaceUninstallResult>;
