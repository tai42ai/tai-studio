#!/usr/bin/env bash
#
# End-to-end boot recipe. Brings up everything the Playwright suites drive:
#
#   1. a throwaway loopback Redis (docker compose)
#   2. the built Studio SPA and the reference plugin's front-end bundle
#   3. the reference Studio plugin, installed into the tai42-skeleton env
#   4. a tai42-skeleton with ACCESS CONTROL ON, a seeded test-only API key, the
#      two-tier route mappings, and studio_dist_path pointing at the SPA dist
#
# Steps 2 and 3 are in that order on purpose — see the note at step 2.
#
# It runs the skeleton in the FOREGROUND so Playwright's `webServer` can own its
# lifecycle (it polls the skeleton URL, then kills this process on teardown).
#
# NOT A PRODUCTION TEMPLATE. The API key is obviously test-only, Redis has no
# auth, the crypto keys are throwaway, and access is granted with a wildcard
# scope. A real deployment provisions keys out of band, runs a managed Redis, and
# uses least-privilege scopes.
#
# Env knobs (all have safe defaults for local runs):
#   STUDIO_API_KEY   the seeded key the Studio pastes at /login (default below)
#   STUDIO_USER_ID   the user_id that key resolves to (default below)
#   MONOREPO_DIR     path to the tai42 monorepo checkout (default: sibling repo);
#                    the skeleton lives at its core/skeleton and the uv workspace
#                    venv at its .venv
#   STUDIO_PORT      skeleton port (default 8765)
#   SKIP_SPA_BUILD   set to 1 to reuse an existing apps/studio/dist instead of
#                    building it; unset (or anything else) builds the SPA AND every
#                    workspace package it depends on from the working tree, so the
#                    suites test the code they are run against. Playwright's
#                    webServer passes it explicitly.
#   MANIFEST_PATH    the skeleton manifest to serve (default: boot/manifest.yml,
#                    the lean e2e manifest; the docs-screenshot runner overrides
#                    this with boot/../docs-demo/manifest.yml)
#   EXTRA_PLUGINS    space-separated uv-pip install specs installed into the
#                    skeleton venv IN ADDITION to the reference plugin (paths must
#                    not contain spaces); the docs-screenshot runner uses it to add
#                    the agents/storage/toolbox/monitoring plugins
set -euo pipefail

# --- Paths ------------------------------------------------------------------
BOOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
E2E_DIR="$(cd "${BOOT_DIR}/.." && pwd)"
STUDIO_REPO="$(cd "${E2E_DIR}/.." && pwd)"
# The tai42 monorepo: skeleton at core/skeleton, plugins under plugins/, and the
# single uv workspace venv at its root .venv.
MONOREPO_DIR="${MONOREPO_DIR:-$(cd "${STUDIO_REPO}/../tai42" && pwd)}"

STUDIO_DIST="${STUDIO_REPO}/apps/studio/dist"
MANIFEST_PATH="${MANIFEST_PATH:-${BOOT_DIR}/manifest.yml}"
COMPOSE_FILE="${BOOT_DIR}/compose.yaml"

# --- Test-only configuration (see the header — NOT for production) ----------
export STUDIO_API_KEY="${STUDIO_API_KEY:-sk-e2e-DO-NOT-USE-IN-PRODUCTION-000}"
STUDIO_PORT="${STUDIO_PORT:-8765}"
export STUDIO_USER_ID="${STUDIO_USER_ID:-studio-e2e}"

REDIS_HOST_PORT=6380
REDIS_URL="redis://127.0.0.1:${REDIS_HOST_PORT}/0"
CONNECTOR_STORE_REDIS_URL="redis://127.0.0.1:${REDIS_HOST_PORT}/1"
INTERACTIONS_REDIS_URL="redis://127.0.0.1:${REDIS_HOST_PORT}/2"
TOOL_RUNS_REDIS_URL="redis://127.0.0.1:${REDIS_HOST_PORT}/3"
HOOKS_REDIS_URL="redis://127.0.0.1:${REDIS_HOST_PORT}/4"
CONVERSATIONS_REDIS_URL="redis://127.0.0.1:${REDIS_HOST_PORT}/5"
PG_HOST_PORT=55432

# The one named "default" database every store binds to (TAI_DB_BINDING_* unset, so
# each component's chain, guard, and stores resolve to `default`): the access-control
# policy store, the versioning history, the tool-meta overlay, the connector store, and
# the accounts plugin's own tables all read this single TAI_DATABASE_DEFAULT_PG_* group.
# Points at the compose Postgres the DDL is applied to and the seeds are written to.
# Exported before the accounts DDL apply and the skeleton launch, both of which read it.
export TAI_DATABASE_DEFAULT_PG_HOST=127.0.0.1
export TAI_DATABASE_DEFAULT_PG_PORT="${PG_HOST_PORT}"
export TAI_DATABASE_DEFAULT_PG_USER=postgres
export TAI_DATABASE_DEFAULT_PG_PASSWORD=postgres
export TAI_DATABASE_DEFAULT_PG_DB=tai

# A deterministic throwaway base64 32-byte key (test-only).
TEST_B64_KEY="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="

log() { printf '\033[1;34m[boot]\033[0m %s\n' "$*" >&2; }

# --- 1. Redis + Postgres ----------------------------------------------------
log "starting loopback Redis + Postgres (docker compose)"
docker compose -f "${COMPOSE_FILE}" up -d --wait

redis_cli() { docker compose -f "${COMPOSE_FILE}" exec -T redis redis-cli "$@"; }
pg_exec() { docker compose -f "${COMPOSE_FILE}" exec -T postgres psql -q -U postgres -d tai "$@"; }

# --- 2. Build the SPA and the reference-plugin bundle ------------------------
# BEFORE step 3. `uv pip install` COPIES the plugin package into the venv, bundle
# and all, and the skeleton serves that copy — so a bundle built after the install
# reaches site-packages only on the NEXT boot, and the suites judge the previous
# run's `studio-src`. Neither the SPA build nor the bundle build touches the venv,
# so both belong here.
if [[ "${SKIP_SPA_BUILD:-0}" == "1" && -f "${STUDIO_DIST}/index.html" ]]; then
  log "reusing existing SPA dist (SKIP_SPA_BUILD=1)"
else
  log "building the Studio SPA + reference plugin bundle"
  # `@tai42/studio-app...` — the trailing `...` selects the app AND every workspace
  # package it depends on, in topological order. The app resolves each of those
  # through its `dist/` (`exports` points there), so filtering to the app alone
  # rebuilds the SPA around whatever `dist/` happens to be on disk: a source change
  # anywhere outside `apps/studio` would be invisible to the suites under a green
  # exit code, which is the same staleness this step exists to prevent.
  ( cd "${STUDIO_REPO}" && pnpm --filter '@tai42/studio-app...' run build && pnpm --filter @tai42/e2e run build:reference-plugin )
fi

# --- 3. Reference plugin into the skeleton env ------------------------------
VENV_PY="${MONOREPO_DIR}/.venv/bin/python"
if [[ ! -x "${VENV_PY}" ]]; then
  log "ERROR: workspace venv not found at ${VENV_PY} (set MONOREPO_DIR; sync it with 'uv sync' from the monorepo root)"
  exit 1
fi
log "installing reference-plugin into the skeleton env"
uv pip install --python "${VENV_PY}" --quiet "${E2E_DIR}/reference-plugin"

# The GitHub webhook-verifier plugin; its import registers a "github" verifier on the
# app's `webhook_verifiers` facet. Import-only, no env config.
WEBHOOK_VERIFIER_DIR="${MONOREPO_DIR}/plugins/webhook-verifier-github"
if [[ -d "${WEBHOOK_VERIFIER_DIR}" ]]; then
  log "installing webhook-verifier-github into the skeleton env"
  uv pip install --python "${VENV_PY}" --quiet "${WEBHOOK_VERIFIER_DIR}"
else
  log "ERROR: webhook-verifier-github not found at ${WEBHOOK_VERIFIER_DIR}"
  exit 1
fi

# Extra plugin packages installed into the skeleton venv (space-separated uv-pip
# install specs; paths must not contain spaces). The docs-screenshot runner uses
# this to add the agents/storage/toolbox/monitoring plugins the docs-demo manifest
# loads. Unset for the lean e2e boot (no extra installs). `set -f` disables
# pathname expansion for the split so a pip extras spec like
# `/abs/plugins/toolbox[prometheus]` is passed literally (the `[...]` is a glob
# bracket that must not be expanded against on-disk paths).
if [[ -n "${EXTRA_PLUGINS:-}" ]]; then
  set -f
  for plugin_spec in ${EXTRA_PLUGINS}; do
    log "installing extra plugin: ${plugin_spec}"
    uv pip install --python "${VENV_PY}" --quiet "${plugin_spec}"
  done
  set +f
fi

# Apply the platform migration chains the way production does: the kit Flyway-model
# runner (tai42_kit.db.apply_migrations) over the packaged chains, recorded in
# `tai_schema_history`. The skeleton chain always; the tai42-accounts-postgres plugin
# chain (accounts_users / accounts_sessions / accounts_invites) when the docs-screenshot
# runner sets APPLY_ACCOUNTS_DDL=1 — gated so the lean e2e boot (no accounts plugin
# installed) is untouched. NOT `tai db migrate`: that discovers only marketplace-installed
# plugins, so it would migrate the skeleton chain but skip the pip-installed accounts
# plugin — the entries are built directly instead. Both chains bind to the `default`
# database (TAI_DATABASE_DEFAULT_PG_* exported above), resolved through the registry's
# migrator identity. The compose Postgres is up (step 1) and the plugins are installed
# above, so this runs cleanly here; a discovery/apply failure exits non-zero.
log "applying the platform migration chains (kit migration runner)"
APPLY_ACCOUNTS_DDL="${APPLY_ACCOUNTS_DDL:-0}" "${VENV_PY}" - <<'PY' >&2
import asyncio
import importlib.resources
import os

from tai42_kit.db import apply_migrations
from tai42_kit.plugins import parse_plugin_spec
from tai42_skeleton.db.discovery import plugin_migration_entry, skeleton_entry

entries = [skeleton_entry()]
if os.environ.get("APPLY_ACCOUNTS_DDL", "0") == "1":
    package = importlib.resources.files("tai42_accounts_postgres")
    spec = parse_plugin_spec(
        package.joinpath("tai-plugin.yml").read_bytes(),
        source="tai42_accounts_postgres/tai-plugin.yml",
    )
    entry = plugin_migration_entry(spec)
    if entry is None:
        raise RuntimeError("tai42-accounts-postgres declares no 'migrations' chain; its schema cannot be applied")
    entries.append(entry)

applied = asyncio.run(apply_migrations(entries))
print(f"[boot] applied {len(applied)} migration file(s) across {len(entries)} chain(s)")
PY

# --- 4. Seed the test API key (Redis), policy + route mappings (Postgres) ----
log "seeding the test API key (Redis), policy + route mappings (Postgres)"
KEY_HASH="$(printf '%s' "${STUDIO_API_KEY}" | shasum -a 256 | cut -d' ' -f1)"

# Identity record — PLAIN Redis HASH `ac:key:{sha256(raw)}` -> {user_id, description}.
# The tai42-identity-redis provider reads it with HGETALL and resolves `user_id`; no
# RedisJSON module is involved (the whole point of the plain-redis stack).
redis_cli HSET "ac:key:${KEY_HASH}" user_id "${STUDIO_USER_ID}" description "e2e studio key" >/dev/null

# Policy body — Postgres `access_control_policies` (the SOLE policy store).
# Full-privilege wildcard scope: the Studio key is full-execution; the `*` scope
# satisfies every protected resource id. ON CONFLICT keeps a boot re-run idempotent.
#
# `policy_data` carries the `key_fingerprint` claim an execution-key binding resolves
# at fire time. This key is seeded out-of-band, so set it here to a stable test-only value.
STUDIO_KEY_FINGERPRINT="e2e00000000000000000000000000000"
pg_exec -c "INSERT INTO access_control_policies (user_id, scopes, policy_data) VALUES ('${STUDIO_USER_ID}', ARRAY['*']::text[], '{\"key_fingerprint\":\"${STUDIO_KEY_FINGERPRINT}\"}'::jsonb) ON CONFLICT (user_id) DO UPDATE SET scopes = EXCLUDED.scopes, policy_data = EXCLUDED.policy_data;" >/dev/null

# Route mappings — Postgres `access_control_routes`. Each row's `url` is the route
# TEMPLATE the ACCESS_CONTROL_PATH_PATTERNS regexes below resolve to (the verifier
# fullmatches a request path to a template, then reads the template's row). "public"
# is the access-control public_resource_id; "studio" is the single protected
# resource the wildcard key is authorized for.
pg_exec -c "INSERT INTO access_control_routes (url, scope_id) VALUES ('studio_authed','studio'),('public_spa','public'),('public_assets','public'),('public_callback','public'),('public_media','public') ON CONFLICT (url) DO UPDATE SET scope_id = EXCLUDED.scope_id;" >/dev/null

# Tier one: path regex -> route template (fully-anchored via fullmatch in the
# verifier). The public matchers match ONLY their intended shape:
#   - public_assets:  the plugin bundle files (NOT the /api/plugins registry)
#   - public_callback: the OAuth/interaction callback door
#   - public_media:   the served-media capability url (a tokenless browser <img> fetch)
#   - public_spa:     everything that is not /api (the SPA, static files, vendor)
#   - studio_authed:  every other /api route (incl. the /api/plugins registry) —
#                     a negative lookahead excludes the public /api shapes so
#                     the registry listing stays authed (the prefix-collision pin).
export ACCESS_CONTROL_PATH_PATTERNS='{"/api/(?!plugins/[^/]+/studio/)(?!interactions/callback(?:/|$))(?!interactions/media(?:/|$)).*":"studio_authed","/(?!api(?:/|$)).*":"public_spa","/api/plugins/[^/]+/studio/.*":"public_assets","/api/interactions/callback(?:/.*)?":"public_callback","/api/interactions/media(?:/.*)?":"public_media"}'

# --- 5. Skeleton env + launch -----------------------------------------------
export ACCESS_CONTROL_ENABLE=true
export ACCESS_CONTROL_REDIS_URL="${REDIS_URL}"
# The access-control policy store (policy bodies + route mappings), the versioned-document
# store (the policy-version history every api-key mint/edit appends), and the tool-metadata
# overlay store (the tools page's folder tree + per-tool overlay, read on every ToolsPage
# mount) all bind to the `default` named database exported above, so no per-store DSN is set
# here. Their tables ship in the skeleton migration chain applied above.
export STUDIO_DIST_PATH="${STUDIO_DIST}"

# Interactions (ask_user): its Redis defaults to loopback :6379 and always
# connects (never in-memory), so it must be pointed at the compose Redis. The
# public base URL is the skeleton's own origin — the external-question callback
# URL is minted from it, so an ask_external question fails without it (http://
# is accepted for a loopback host).
export INTERACTIONS_REDIS_URL="${INTERACTIONS_REDIS_URL}"
export INTERACTIONS_PUBLIC_BASE_URL="http://127.0.0.1:${STUDIO_PORT}"

# Background tool-runs (the `tool_runs` router in the manifest): its run store
# defaults to loopback :6379 and always connects, so point it at the compose Redis
# (db 3, isolated from access-control/connector/interactions). Every RunPanel GETs
# `/api/tool-runs?tool_name=...` on mount, so this must resolve.
export TAI_TOOL_RUNS_REDIS_URL="${TOOL_RUNS_REDIS_URL}"

# Hooks registry: with no HOOKS_REDIS_URL the hooks manager runs in-memory
# per-process, and trigger links (a durable public URL must be shared across
# workers) refuse with a loud 501. Point it at the compose Redis (db 4, isolated
# from the stores above) so the hooks-page trigger-link flow works end to end.
export HOOKS_REDIS_URL="${HOOKS_REDIS_URL}"

# Conversation bridge: the routing rows and every conversation record live in this
# Redis; with no url the manager is in-memory and every routing door refuses with a loud
# 501, so the docs-demo manifest's conversations router would serve a Conversations screen
# that can hold nothing. Point it at the compose Redis (db 5, isolated from the stores
# above).
export CONVERSATIONS_REDIS_URL="${CONVERSATIONS_REDIS_URL}"

# Connectors engine: a throwaway HMAC/KEK so the connectors router boots and the
# oauth/complete route can sign/verify state. The bridge origin (optional) and
# the redirect allow-list include the app origin so a Connect flow would validate.
export CONNECTORS_STATE_HMAC_KEY="${TEST_B64_KEY}"
export CONNECTORS_KEK="${TEST_B64_KEY}"
export CONNECTORS_REDIRECT_URI_ALLOWLIST="http://127.0.0.1:${STUDIO_PORT}"
# export CONNECTORS_OAUTH_BRIDGE_URL="http://127.0.0.1:${STUDIO_PORT}"  # opt-in bridge
export CONNECTOR_STORE_REDIS_URL="${CONNECTOR_STORE_REDIS_URL}"

log "launching tai serve on http://127.0.0.1:${STUDIO_PORT} (access control ON)"
log "  API key (test-only): ${STUDIO_API_KEY}"
cd "${MONOREPO_DIR}"
exec uv run --no-sync tai serve \
  --manifest-path "${MANIFEST_PATH}" \
  --host 127.0.0.1 \
  --port "${STUDIO_PORT}"
