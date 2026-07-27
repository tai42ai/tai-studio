#!/usr/bin/env bash
#
# End-to-end boot recipe. Brings up everything the Playwright suites drive:
#
#   1. a throwaway loopback Redis (docker compose)
#   2. the reference Studio plugin, installed into the tai42-skeleton env
#   3. the built Studio SPA
#   4. a tai42-skeleton with ACCESS CONTROL ON, a seeded test-only API key, the
#      two-tier route mappings, and studio_dist_path pointing at the SPA dist
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
#   SKELETON_DIR     path to the tai-skeleton checkout (default: sibling repo)
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
SKELETON_DIR="${SKELETON_DIR:-$(cd "${STUDIO_REPO}/../tai-skeleton" && pwd)}"

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
PG_HOST_PORT=55432

# The accounts docs-demo (APPLY_ACCOUNTS_DDL=1, set by docs-screenshots.sh) needs the
# accounts plugin's own Postgres env group pointed at the SAME compose database:
#   TAI_ACCOUNTS_PG_*    the accounts plugin's own tables (double-PG is correct —
#                        the PostgresConnectionSettings field `pg_host` under the
#                        `TAI_ACCOUNTS_PG_` env_prefix reads `TAI_ACCOUNTS_PG_PG_HOST`).
# (The `VERSIONING_STORE_*` group, which also backs the seeded role templates, is
# exported in step 5.)
# Exported here (before the DDL apply and the skeleton launch, both of which read
# them) using PG_HOST_PORT; gated so the lean e2e boot is untouched.
if [[ "${APPLY_ACCOUNTS_DDL:-0}" == "1" ]]; then
  export TAI_ACCOUNTS_PG_PG_HOST=127.0.0.1
  export TAI_ACCOUNTS_PG_PG_PORT="${PG_HOST_PORT}"
  export TAI_ACCOUNTS_PG_PG_USER=postgres
  export TAI_ACCOUNTS_PG_PG_PASSWORD=postgres
  export TAI_ACCOUNTS_PG_PG_DB=tai
fi

# A deterministic throwaway base64 32-byte key (test-only).
TEST_B64_KEY="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="

log() { printf '\033[1;34m[boot]\033[0m %s\n' "$*" >&2; }

# --- 1. Redis + Postgres ----------------------------------------------------
log "starting loopback Redis + Postgres (docker compose)"
docker compose -f "${COMPOSE_FILE}" up -d --wait

redis_cli() { docker compose -f "${COMPOSE_FILE}" exec -T redis redis-cli "$@"; }
pg_exec() { docker compose -f "${COMPOSE_FILE}" exec -T postgres psql -q -U postgres -d tai "$@"; }

# Apply the connector-framework DDL (idempotent CREATE TABLE IF NOT EXISTS).
CONNECTOR_DDL="${SKELETON_DIR}/src/tai42_skeleton/sql/resources/tai42_skeleton.init.sql"
if [[ ! -f "${CONNECTOR_DDL}" ]]; then
  log "ERROR: connector DDL not found at ${CONNECTOR_DDL}"
  exit 1
fi
log "applying connector-framework schema to the 'tai' database"
pg_exec < "${CONNECTOR_DDL}" >/dev/null

# --- 2. Reference plugin into the skeleton env ------------------------------
SKELETON_PY="${SKELETON_DIR}/.venv/bin/python"
if [[ ! -x "${SKELETON_PY}" ]]; then
  log "ERROR: skeleton venv not found at ${SKELETON_PY} (set SKELETON_DIR)"
  exit 1
fi
log "installing reference-plugin into the skeleton env"
uv pip install --python "${SKELETON_PY}" --quiet "${E2E_DIR}/reference-plugin"

# The GitHub webhook-verifier plugin; its import registers a "github" verifier on the
# app's `webhook_verifiers` facet. Import-only, no env config.
WEBHOOK_VERIFIER_DIR="${SKELETON_DIR}/../tai-webhook-verifier-github"
if [[ -d "${WEBHOOK_VERIFIER_DIR}" ]]; then
  log "installing webhook-verifier-github into the skeleton env"
  uv pip install --python "${SKELETON_PY}" --quiet "${WEBHOOK_VERIFIER_DIR}"
else
  log "ERROR: webhook-verifier-github not found at ${WEBHOOK_VERIFIER_DIR}"
  exit 1
fi

# Extra plugin packages installed into the skeleton venv (space-separated uv-pip
# install specs; paths must not contain spaces). The docs-screenshot runner uses
# this to add the agents/storage/toolbox/monitoring plugins the docs-demo manifest
# loads. Unset for the lean e2e boot (no extra installs). `set -f` disables
# pathname expansion for the split so a pip extras spec like
# `/abs/tai-toolbox[prometheus]` is passed literally (the `[...]` is a glob bracket
# that must not be expanded against on-disk siblings).
if [[ -n "${EXTRA_PLUGINS:-}" ]]; then
  set -f
  for plugin_spec in ${EXTRA_PLUGINS}; do
    log "installing extra plugin: ${plugin_spec}"
    uv pip install --python "${SKELETON_PY}" --quiet "${plugin_spec}"
  done
  set +f
fi

# Apply the tai42-accounts-postgres schema (accounts_users / accounts_sessions /
# accounts_invites) when the docs-screenshot runner requests it. The plugin owns
# its tables out-of-band via `python -m tai42_accounts_postgres.db apply` (idempotent),
# which connects through the TAI_ACCOUNTS_PG_* env the runner exports. Gated so the
# lean e2e boot (no accounts plugin installed) is untouched. The compose Postgres is
# already up (step 1) and the plugin is installed above, so this runs cleanly here.
if [[ "${APPLY_ACCOUNTS_DDL:-0}" == "1" ]]; then
  log "applying tai42-accounts-postgres schema (python -m tai42_accounts_postgres.db apply)"
  "${SKELETON_PY}" -m tai42_accounts_postgres.db apply >&2
fi

# --- 3. Build the SPA -------------------------------------------------------
if [[ "${SKIP_SPA_BUILD:-0}" == "1" && -f "${STUDIO_DIST}/index.html" ]]; then
  log "reusing existing SPA dist (SKIP_SPA_BUILD=1)"
else
  log "building the Studio SPA + reference plugin bundle"
  # `@tai42/studio-app...` — the trailing `...` selects the app AND every workspace
  # package it depends on, in topological order. The app resolves each of those
  # through its `dist/` (`exports` points there), so filtering to the app alone
  # rebuilt the SPA around whatever `dist/` happened to be on disk: a source change
  # anywhere outside `apps/studio` was invisible to the suites under a green exit
  # code, which is the same staleness this step exists to prevent.
  ( cd "${STUDIO_REPO}" && pnpm --filter '@tai42/studio-app...' run build && pnpm --filter @tai42/e2e run build:reference-plugin )
fi

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
pg_exec -c "INSERT INTO access_control_routes (url, scope_id) VALUES ('studio_authed','studio'),('public_spa','public'),('public_assets','public'),('public_callback','public') ON CONFLICT (url) DO UPDATE SET scope_id = EXCLUDED.scope_id;" >/dev/null

# Tier one: path regex -> route template (fully-anchored via fullmatch in the
# verifier). The public matchers match ONLY their intended shape:
#   - public_assets:  the plugin bundle files (NOT the /api/plugins registry)
#   - public_callback: the OAuth/interaction callback door
#   - public_spa:     everything that is not /api (the SPA, static files, vendor)
#   - studio_authed:  every other /api route (incl. the /api/plugins registry) —
#                     a negative lookahead excludes the two public /api shapes so
#                     the registry listing stays authed (the prefix-collision pin).
export ACCESS_CONTROL_PATH_PATTERNS='{"/api/(?!plugins/[^/]+/studio/)(?!interactions/callback(?:/|$)).*":"studio_authed","/(?!api(?:/|$)).*":"public_spa","/api/plugins/[^/]+/studio/.*":"public_assets","/api/interactions/callback(?:/.*)?":"public_callback"}'

# --- 5. Skeleton env + launch -----------------------------------------------
export ACCESS_CONTROL_ENABLE=true
export ACCESS_CONTROL_REDIS_URL="${REDIS_URL}"
# The access-control POLICY store is Postgres (policy bodies + route mappings); it
# has its own `ACCESS_CONTROL_STORE_*` DSN namespace. Point it at the compose
# Postgres the DDL was applied to and the seeds above were written to.
export ACCESS_CONTROL_STORE_PG_HOST=127.0.0.1
export ACCESS_CONTROL_STORE_PG_PORT="${PG_HOST_PORT}"
export ACCESS_CONTROL_STORE_PG_USER=postgres
export ACCESS_CONTROL_STORE_PG_PASSWORD=postgres
export ACCESS_CONTROL_STORE_PG_DB=tai

# The versioned-document store (`VERSIONING_STORE_*` DSN) backs the policy-version
# history every api-key mint/edit appends. Point it at the same compose Postgres.
export VERSIONING_STORE_PG_HOST=127.0.0.1
export VERSIONING_STORE_PG_PORT="${PG_HOST_PORT}"
export VERSIONING_STORE_PG_USER=postgres
export VERSIONING_STORE_PG_PASSWORD=postgres
export VERSIONING_STORE_PG_DB=tai
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

# Connectors engine: a throwaway HMAC/KEK so the connectors router boots and the
# oauth/complete route can sign/verify state. The bridge origin (optional) and
# the redirect allow-list include the app origin so a Connect flow would validate.
export CONNECTORS_STATE_HMAC_KEY="${TEST_B64_KEY}"
export CONNECTORS_KEK="${TEST_B64_KEY}"
export CONNECTORS_REDIRECT_URI_ALLOWLIST="http://127.0.0.1:${STUDIO_PORT}"
# export CONNECTORS_OAUTH_BRIDGE_URL="http://127.0.0.1:${STUDIO_PORT}"  # opt-in bridge
export CONNECTOR_STORE_REDIS_URL="${CONNECTOR_STORE_REDIS_URL}"
export CONNECTOR_STORE_PG_HOST=127.0.0.1
export CONNECTOR_STORE_PG_PORT="${PG_HOST_PORT}"
export CONNECTOR_STORE_PG_USER=postgres
export CONNECTOR_STORE_PG_PASSWORD=postgres
export CONNECTOR_STORE_PG_DB=tai

log "launching tai serve on http://127.0.0.1:${STUDIO_PORT} (access control ON)"
log "  API key (test-only): ${STUDIO_API_KEY}"
cd "${SKELETON_DIR}"
exec uv run --no-sync tai serve \
  --manifest-path "${MANIFEST_PATH}" \
  --host 127.0.0.1 \
  --port "${STUDIO_PORT}"
