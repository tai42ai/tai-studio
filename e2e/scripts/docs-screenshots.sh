#!/usr/bin/env bash
#
# docs-screenshots.sh — the ONE-COMMAND, permanent Studio docs-screenshot
# pipeline. Regenerates ALL 18 Studio screens (light + dark = 36 PNGs) into
# tai-docs/images/studio/, each populated and showing the current Studio build
# (branding included) — the full-admin screens plus the capability-scoped screens
# (the owned-key views + the mint→claim-link QR). Rerun it after any UI or branding
# change.
#
#   cd tai-studio && bash e2e/scripts/docs-screenshots.sh
#
# What it does, end to end:
#   1. builds the Studio SPA + reference-plugin bundle and boots a DOCS-DEMO
#      tai42-skeleton (e2e/docs-demo/manifest.yml) via e2e/boot/boot.sh, installing
#      the agents / storage-local / toolbox / seeded-monitoring plugins into the
#      skeleton venv;
#   2. waits for /health, warms up the Prometheus counters with real tool runs,
#      then seeds the demo accounts AND the scoped surfaces (an owned key plus its
#      audience-addressed notification + pending question);
#   3. captures every screen in both themes with e2e/scripts/docs-screenshots.mjs
#      (which FAILS the run rather than shipping an empty/broken shot); and
#   4. copies the five shell screens the tai-studio README embeds into
#      docs/screenshots/, from the same capture (one source of truth).
#
# NOT A PRODUCTION TEMPLATE — it inherits boot.sh's test-only key + loopback
# Redis/Postgres.
#
# Prerequisites:
#   - a Linux-like host: the runner uses curl + setsid + pkill (boot.sh also uses
#     shasum). curl and setsid are required — a missing one surfaces as a failed
#     boot/readiness (a loud non-zero exit), not a captured shot.
#   - docker (boot.sh brings up its own loopback Redis + Postgres compose)
#   - pnpm + uv on PATH; the e2e workspace installed (pnpm -w install)
#   - the Playwright chromium browser: pnpm --dir e2e exec playwright install chromium
#
# Env knobs (all default to sibling checkouts / sensible values):
#   SKELETON_DIR TAI_DOCS_DIR TAI_AGENTS_DIR TAI_STORAGE_LOCAL_DIR TAI_TOOLBOX_DIR
#   OUT_DIR          where the PNGs are written (default: <tai-docs>/images/studio)
#   STUDIO_PORT      skeleton port (default 8765)
#   SKIP_SPA_BUILD   set to 1 to reuse an existing apps/studio/dist (fast reruns)
#   KEEP_UP          set to 1 to leave the skeleton running after capture (debug)
set -euo pipefail

log() { printf '\033[1;35m[docs-shots]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[docs-shots] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }
count_pngs() { find "$1" -maxdepth 1 -name '*.png' | wc -l | tr -d ' '; }

# --- 1. Resolve paths -------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
E2E_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
STUDIO_REPO="$(cd "${E2E_DIR}/.." && pwd)"

require_dir() {
  local var="$1" path="$2"
  [[ -d "$path" ]] || die "${var} not found at '${path}' — set ${var} to the checkout path"
  ( cd "$path" && pwd )
}
SKELETON_DIR="$(require_dir SKELETON_DIR "${SKELETON_DIR:-${STUDIO_REPO}/../tai-skeleton}")"
TAI_DOCS_DIR="$(require_dir TAI_DOCS_DIR "${TAI_DOCS_DIR:-${STUDIO_REPO}/../tai-docs}")"
TAI_AGENTS_DIR="$(require_dir TAI_AGENTS_DIR "${TAI_AGENTS_DIR:-${STUDIO_REPO}/../tai-agents}")"
TAI_STORAGE_LOCAL_DIR="$(require_dir TAI_STORAGE_LOCAL_DIR "${TAI_STORAGE_LOCAL_DIR:-${STUDIO_REPO}/../tai-storage-local}")"
TAI_TOOLBOX_DIR="$(require_dir TAI_TOOLBOX_DIR "${TAI_TOOLBOX_DIR:-${STUDIO_REPO}/../tai-toolbox}")"
# The Postgres accounts plugin: its lifecycle module + login/users routers power the
# login screen's password form and the users-admin page, and its shipped studio/ dist
# mounts the users-admin Studio page. Installed into the skeleton venv below.
TAI_ACCOUNTS_POSTGRES_DIR="$(require_dir TAI_ACCOUNTS_POSTGRES_DIR "${TAI_ACCOUNTS_POSTGRES_DIR:-${STUDIO_REPO}/../tai-accounts-postgres}")"

STUDIO_PORT="${STUDIO_PORT:-8765}"
BASE_URL="http://127.0.0.1:${STUDIO_PORT}"
OUT_DIR="${OUT_DIR:-${TAI_DOCS_DIR}/images/studio}"
DEMO_KEY="sk-docs-demo-full-privilege-key"  # exported as STUDIO_API_KEY; docs-screenshots.mjs reads it from there
PROM_DIR="${TMPDIR:-/tmp}/tai-docs-demo-prometheus"

[[ -d "${E2E_DIR}/node_modules/@playwright/test" ]] || \
  die "Playwright is not installed in e2e/ — run: pnpm -w install"

mkdir -p "${OUT_DIR}" "${PROM_DIR}"

# --- 2. Docs-demo configuration (exported into boot.sh) ---------------------
export MANIFEST_PATH="${E2E_DIR}/docs-demo/manifest.yml"
export STUDIO_API_KEY="${DEMO_KEY}"
export STUDIO_PORT
export SKELETON_DIR
# Extra plugins the docs-demo manifest loads, installed into the skeleton venv.
export EXTRA_PLUGINS="${E2E_DIR}/docs-demo/monitoring-plugin ${TAI_AGENTS_DIR} ${TAI_STORAGE_LOCAL_DIR} ${TAI_TOOLBOX_DIR}[prometheus] ${TAI_ACCOUNTS_POSTGRES_DIR}"
# Accounts world: order the identity resolution (accounts claims tai-sess- sessions,
# redis claims sk- keys), pin the first-owner bootstrap gate to a known token so the
# runner can seed the owner deterministically, and tell boot.sh to apply the accounts
# schema + export the TAI_ACCOUNTS_PG_*/VERSIONING_STORE_* env (see boot.sh). The
# seeded sk- studio key still authenticates every signed-in shot (redis provider);
# the accounts provider only adds the password-login + users-admin surfaces.
export ACCESS_CONTROL_AUTH_PROVIDERS='["accounts-postgres", "redis"]'
export TAI_ACCOUNTS_BOOTSTRAP_TOKEN="docs-demo-accounts-bootstrap-token"
export APPLY_ACCOUNTS_DDL=1
# Storage backend: the seeded template files. CREATE_DIRS=false so a missing dir
# fails loudly rather than being papered over with an empty templates list.
export STORAGE_LOCAL_ROOT_PATH="${E2E_DIR}/docs-demo/templates"
export STORAGE_LOCAL_CREATE_DIRS="false"
# Prometheus multiproc dir (absolute — the validator rejects relative paths).
export PROMETHEUS_MULTIPROC_DIR="${PROM_DIR}"

# --- 3. Pre-flight: STUDIO_PORT must be free --------------------------------
# A server already answering on STUDIO_PORT — a leftover KEEP_UP session, or a
# prior run whose EXIT teardown never fired (e.g. kill -9) — would make the
# readiness poll below pass against the WRONG backend on its first iteration,
# long before the freshly-launched skeleton binds. The result: you rerun to
# regenerate shots after a UI/branding change but silently capture the STALE
# server. Fail fast instead of capturing the wrong target.
if curl -s -m 2 "${BASE_URL}/health" >/dev/null 2>&1; then
  die "a server is already listening on ${BASE_URL} — it would be captured instead of a fresh skeleton. Stop it first (e.g. 'pkill -f \"tai serve\"') and rerun."
fi

# --- 4. Boot the docs-demo skeleton -----------------------------------------
log "booting docs-demo skeleton (manifest: ${MANIFEST_PATH})"
BOOT_LOG="$(mktemp -t docs-shots-boot.XXXXXX.log)"
setsid bash "${E2E_DIR}/boot/boot.sh" >"${BOOT_LOG}" 2>&1 </dev/null &
BOOT_PID=$!

teardown() {
  if [[ "${KEEP_UP:-0}" == "1" ]]; then
    log "KEEP_UP=1 — leaving the skeleton running on ${BASE_URL} (pid ${BOOT_PID})"
    return
  fi
  # setsid made BOOT_PID a process-group leader; kill the whole group.
  kill -- -"${BOOT_PID}" 2>/dev/null || true
  pkill -f "tai serve .*--port ${STUDIO_PORT}" 2>/dev/null || true
}
trap teardown EXIT

# --- 5. Wait for readiness --------------------------------------------------
# /health returning the literal OK proves BOTH the server is up AND the health
# router beat the SPA catch-all (otherwise it would serve index.html). First run
# builds the SPA + resolves the agent deps, so allow a generous window.
log "waiting for ${BASE_URL}/health (up to 600s)"
ready=0
for _ in $(seq 1 600); do
  if ! kill -0 "${BOOT_PID}" 2>/dev/null; then
    log "boot process exited early — last 60 log lines:"; tail -60 "${BOOT_LOG}" >&2
    die "docs-demo skeleton failed to boot"
  fi
  if [[ "$(curl -s -m 2 "${BASE_URL}/health" 2>/dev/null || true)" == "OK" ]]; then
    ready=1; break
  fi
  sleep 1
done
[[ "${ready}" == 1 ]] || { tail -60 "${BOOT_LOG}" >&2; die "/health never returned OK"; }
log "skeleton is up"

api() { curl -s -m 8 -H "x-api-key: ${DEMO_KEY}" -H "accept: application/json" "$@"; }

# --- 6. Sanity-check the instrumented tool variant --------------------------
if ! api "${BASE_URL}/api/tools" | grep -q "studio_demo_echo_prometheus_metrics"; then
  die "studio_demo_echo_prometheus_metrics not registered — the prometheus_metrics extension wiring is broken"
fi

# --- 7. Warm up the Prometheus counters -------------------------------------
log "warming up /metrics (5 real tool runs)"
for _ in 1 2 3 4 5; do
  api -H "content-type: application/json" -X POST "${BASE_URL}/api/run-tool" \
    -d '{"tool_name":"studio_demo_echo_prometheus_metrics","arguments":{"message":"docs metrics warm-up"}}' \
    >/dev/null || die "warm-up tool run failed"
done
if ! curl -s -m 5 "${BASE_URL}/metrics" | grep -q "tai_tool_call_count"; then
  die "/metrics has no tai_tool_call_count after warm-up — the System screen would be empty"
fi

# --- 7b. Seed realistic demo accounts (login + users-admin screens) ---------
# Through the REAL accounts HTTP API (never poking Postgres): bootstrap the first
# owner under the pinned token, then invite an editor + a viewer and accept their
# invites (Active rows), and leave one editor invite pending (an "Invite pending"
# badge) — a realistic human-accounts table. The seed is idempotent across reruns:
# the compose Postgres persists, so a re-seed hits email-taken 409s, which are fine
# (the rows already exist). A fresh sk- studio key authorizes the create-user calls
# (its wildcard policy carries no admin-fence condition), so no owner session is
# needed to populate the table.
log "seeding demo accounts (owner + editor/viewer + a pending invite)"
DEMO_PASSWORD="demo-password-4242"
OWNER_EMAIL="ada.lovelace@demo.tai"

# Bootstrap the first owner (public /api/login prefix). A 409 "Already initialized"
# on a rerun is fine — the owner row persists.
boot_resp="$(api -H "content-type: application/json" -X POST "${BASE_URL}/api/login/bootstrap" \
  -d "{\"email\":\"${OWNER_EMAIL}\",\"password\":\"${DEMO_PASSWORD}\",\"bootstrap_token\":\"${TAI_ACCOUNTS_BOOTSTRAP_TOKEN}\"}")"
case "${boot_resp}" in
  *'"token"'*|*'Already initialized'*) : ;;
  *) die "bootstrap owner failed: ${boot_resp}" ;;
esac

# Create a user (returns a one-time invite) and, when mode=accept, consume the
# invite to set a password so the row reads Active rather than Invite-pending. An
# email-taken 409 (rerun) has no invite_token and is treated as already-seeded.
seed_user() {
  local email="$1" role="$2" mode="${3:-invite}" resp token
  resp="$(api -H "content-type: application/json" -X POST "${BASE_URL}/api/auth/users" \
    -d "{\"email\":\"${email}\",\"role\":\"${role}\"}")"
  token="$(printf '%s' "${resp}" | grep -oP '"invite_token":\s*"\K[^"]+' || true)"
  if [[ -z "${token}" ]]; then
    case "${resp}" in
      *'already registered'*) log "  ${email}: already seeded"; return 0 ;;
      *) die "seed_user ${email}: unexpected response: ${resp}" ;;
    esac
  fi
  if [[ "${mode}" == "accept" ]]; then
    api -H "content-type: application/json" -X POST "${BASE_URL}/api/login/invite/accept" \
      -d "{\"invite_token\":\"${token}\",\"password\":\"${DEMO_PASSWORD}\",\"password_confirm\":\"${DEMO_PASSWORD}\"}" >/dev/null \
      || die "seed_user ${email}: invite accept failed"
  fi
}

seed_user "grace.hopper@demo.tai"      editor accept
seed_user "alan.turing@demo.tai"       viewer accept
seed_user "katherine.johnson@demo.tai" editor  # left pending → "Invite pending" badge

# Fail loudly before capture if the users table is empty (a broken shot the .mjs
# would refuse anyway — but a clearer message here).
if ! api "${BASE_URL}/api/auth/users" | grep -q "${OWNER_EMAIL}"; then
  die "users list is missing the seeded owner — the users-admin screen would be empty"
fi

# --- 7c. Seed the capability-scoped surfaces (owned key + addressed inbox rows) ---
# The scoped Studio shots authenticate as a NON-admin OWNED key. Minting one through
# the REAL /api/auth/api-keys door (as the admin DEMO_KEY) stamps its owner_user_id
# (the seeded editor) and fences it with a jq condition, so its capability projection
# — and thus the scoped nav + tools slice — covers only the tools / interactions /
# notifications / auth surfaces. An owned key is ISOLATED to its OWN identity (its
# own key id), not its owner's, so an audience-addressed notification and a PENDING
# audience-addressed question are seeded to that owned key's OWN id — the audience the
# scoped inboxes (server-filtered to the caller's own identity) render honestly.
log "seeding the scoped owned key + audience-addressed inbox rows"

# The owned key's identity: the id it is minted under and, being an isolated owned key,
# the identity its audience-filtered inboxes are confined to. The two inbox rows below
# address THIS id so the scoped shots render them; the key's owner_user_id (grace,
# resolved below) marks it owned but is never the inbox audience.
OWNED_KEY_ID="svc-demo-owned"

# The owner identity: the seeded editor (grace). Read her user_id back from the
# accounts API — robust across reruns (the row persists in the compose Postgres) and
# adjacent to her email in each serialized record, so a scoped \K lookbehind isolates
# exactly her id.
OWNER_USER_ID="$(api "${BASE_URL}/api/auth/users" \
  | grep -oP '"user_id":\s*"\K[^"]+(?=",\s*"email":\s*"grace\.hopper@demo\.tai")' || true)"
[[ -n "${OWNER_USER_ID}" ]] || die "could not resolve the seeded editor's user_id — the scoped owner is unknown"

# The jq fence: the owned key reaches only these route prefixes, so its projection
# (the scoped nav + tools slice) is limited to them. It must cover EVERY door the
# scoped pages hit: /api/tools* (tools list + tags), /api/tool-runs* (the background-
# runs door — a NON-admin-fenced tool-run door, so reaching it makes the projection's
# `tools` list the full registry rather than empty; without it a non-admin key
# projects ZERO tools and the scoped tools page is empty), /api/interactions* (the
# inbox SSE stream + answer door) AND /api/channels (the interactions ChannelsCard),
# /api/notifications* (the notifications inbox), and /api/auth* (the shell's /me
# projection + the settings self-service surfaces). The only non-public scope with a
# route mapping in this boot is 'studio' (studio_authed → studio), so the key carries
# THAT scope and the fence narrows it — '*' has no mapping and the mint door rejects it.
OWNED_CONDITION='(.request.path | startswith("/api/tools")) or (.request.path | startswith("/api/tool-runs")) or (.request.path | startswith("/api/interactions")) or (.request.path | startswith("/api/channels")) or (.request.path | startswith("/api/notifications")) or (.request.path | startswith("/api/auth"))'

# Mint is NOT idempotent (a duplicate user_id hits the door's duplicate guard) and a
# raw key is returned ONLY at mint, so revoke any prior owned key first, then re-mint
# to obtain a fresh raw sk- key. The revoke 404s on a first run — ignored. (The key
# the mint-claim-link shot mints live needs no pre-revoke: that action mints a unique
# per-invocation user_id, so it never collides with a persisted row.)
api -X DELETE "${BASE_URL}/api/auth/api-keys/${OWNED_KEY_ID}" >/dev/null 2>&1 || true

# Build the mint body with python3 (robust JSON quoting for the jq condition).
mint_body="$(OWNER_USER_ID="${OWNER_USER_ID}" OWNED_CONDITION="${OWNED_CONDITION}" OWNED_KEY_ID="${OWNED_KEY_ID}" python3 -c '
import json, os
print(json.dumps({
    "user_id": os.environ["OWNED_KEY_ID"],
    "description": "Demo owned service key",
    "scopes": ["studio"],
    "owner_user_id": os.environ["OWNER_USER_ID"],
    "condition": os.environ["OWNED_CONDITION"],
}))')"
mint_resp="$(api -H "content-type: application/json" -X POST "${BASE_URL}/api/auth/api-keys" -d "${mint_body}")"
# The raw sk- key is the response `data` (surfaced exactly once).
OWNED_KEY="$(printf '%s' "${mint_resp}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"])' 2>/dev/null || true)"
[[ "${OWNED_KEY}" == sk-* ]] || die "minting the scoped owned key failed: ${mint_resp}"
export STUDIO_OWNED_KEY="${OWNED_KEY}"

# Deterministic inboxes across reruns: the interactions store AND the internal
# notifications sink share the dedicated interactions Redis (db 2, isolated from the
# access-control db 0), and neither exposes an HTTP clear door — so flush db 2 before
# seeding the two inbox rows below. Without this, every rerun against the persisted
# backend stacks another copy of the same question/notification and the scoped inboxes
# read as duplicated. db 2 holds ONLY interactions/notifications state, so the flush
# never touches the seeded api keys (db 0).
docker compose -f "${E2E_DIR}/boot/compose.yaml" exec -T redis redis-cli -n 2 FLUSHDB >/dev/null \
  || die "could not flush the interactions Redis (db 2) — the scoped inboxes would not be deterministic"

# An audience-addressed notification to the owned key's OWN identity (admin caller may
# address any audience; the owned key's inbox is filtered to its own id). The
# scoped-notifications shot waits on this exact message.
DEMO_NOTIFICATION="Your nightly export finished — 1,204 rows written."
notify_resp="$(api -H "content-type: application/json" -X POST "${BASE_URL}/api/notifications" \
  -d "$(MESSAGE="${DEMO_NOTIFICATION}" AUDIENCE="${OWNED_KEY_ID}" python3 -c '
import json, os
print(json.dumps({"message": os.environ["MESSAGE"], "audience": os.environ["AUDIENCE"]}))')")"
case "${notify_resp}" in
  *'"data"'*) : ;;
  *) die "seeding the audience-addressed notification failed: ${notify_resp}" ;;
esac

# A PENDING audience-addressed question. `ask_user` BLOCKS until answered/timeout, so
# fire it in the background (its own session group via setsid) with a long timeout:
# the question persists to the interactions store immediately, then the call parks
# there and the EXIT teardown reaps it. The scoped-interactions shot waits on this text.
#
# The question carries display-only media so the inbox shot shows the media gallery
# honestly: one HERMETIC inline `data:image/png` item (a tiny 1×1 PNG — renders under
# the CSP with zero network, so the shot never depends on a third-party image host)
# with a caption, plus one https `link` item exercising the second media kind.
DEMO_QUESTION="Approve the staging deploy to production?"
DEMO_MEDIA_IMAGE="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
DEMO_MEDIA_LINK="https://tai42.ai/concepts/interactions"
ask_body="$(QUESTION="${DEMO_QUESTION}" AUDIENCE="${OWNED_KEY_ID}" \
  MEDIA_IMAGE="${DEMO_MEDIA_IMAGE}" MEDIA_LINK="${DEMO_MEDIA_LINK}" python3 -c '
import json, os
print(json.dumps({"tool_name": "ask_user", "arguments": {
    "question": os.environ["QUESTION"], "answer_format": "text",
    "audience": os.environ["AUDIENCE"], "timeout": 3600,
    "media": [
        {"kind": "image", "url": os.environ["MEDIA_IMAGE"], "caption": "Staging build preview"},
        {"kind": "link", "url": os.environ["MEDIA_LINK"], "caption": "Release notes"},
    ],
}}))')"
setsid bash -c "curl -s -m 3600 -H 'x-api-key: ${DEMO_KEY}' -H 'content-type: application/json' \
  -X POST '${BASE_URL}/api/run-tool' -d '${ask_body}' >/dev/null 2>&1" &

# Confirm both inbox rows are readable before capture (a bounded stream read for the
# pending question, whose backlog frame carries it; a direct read for the notification).
sleep 2
stream_dump="$(timeout 5 curl -sN -H "x-api-key: ${DEMO_KEY}" "${BASE_URL}/api/interactions/stream" || true)"
grep -q "${DEMO_QUESTION}" <<<"${stream_dump}" \
  || die "the seeded audience-addressed question is not on the interactions stream — the scoped-interactions screen would be empty"
if ! api "${BASE_URL}/api/notifications" | grep -q "nightly export finished"; then
  die "the seeded audience-addressed notification is not in the sink — the scoped-notifications screen would be empty"
fi

# --- 8. Capture every screen (light + dark) ---------------------------------
log "capturing screenshots into ${OUT_DIR}"
STUDIO_URL="${BASE_URL}" OUT_DIR="${OUT_DIR}" node "${E2E_DIR}/scripts/docs-screenshots.mjs"

# --- 9. Refresh the tai-studio README shell shots ---------------------------
# The README embeds five shell screens; refresh them from the SAME capture so
# there is a single source of truth and no stale branding lingers.
README_SHOTS_DIR="${STUDIO_REPO}/docs/screenshots"
mkdir -p "${README_SHOTS_DIR}"
for screen in extensions login settings tool-run tools; do
  for theme in light dark; do
    cp "${OUT_DIR}/${screen}-${theme}.png" "${README_SHOTS_DIR}/${screen}-${theme}.png"
  done
done
log "refreshed ${README_SHOTS_DIR} (5 shell screens × 2 themes)"

# Success: drop the boot log. On any failure path execution exits before this line
# (via die, or set -e on the capture/refresh steps), so the log survives on disk
# for post-mortem (the readiness dies also tail it first).
rm -f "${BOOT_LOG}"
log "done — $(count_pngs "${OUT_DIR}") PNGs in ${OUT_DIR}, $(count_pngs "${README_SHOTS_DIR}") in ${README_SHOTS_DIR}"
