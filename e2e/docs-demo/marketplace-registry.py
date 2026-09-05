#!/usr/bin/env python3
"""A minimal marketplace registry for the docs-demo screenshot pipeline.

Serves the registry public read API (``/api/v1/*``) the skeleton's
``RegistryClient`` calls, seeded with exactly ONE generic route-carrying plugin
(``acme/alerts-relay``): a ``router`` item that declares a remappable base plus a
public inbound webhook and an authed status route. That is enough for the Studio
marketplace detail page to render and for the install dialog to preview its routes,
prefix remap, and public-acceptance gate — the `marketplace-install` screenshot.

Stdlib only (no deps): the docs-screenshots runner starts it on a loopback port,
exports ``MARKETPLACE_URL`` at it, and reaps it on teardown. It answers three seed
endpoints and ``/healthz``; any other path is a loud 404 so a wrong ref never
captures a half-rendered dialog.

NOT A PRODUCTION REGISTRY — a fixed, in-memory fixture with no auth, no search
index, and no ingest, matching the docs-demo's test-only posture.
"""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# The one seeded generic plugin's validated PluginSpec — a router item with a
# remappable base, one public route (an inbound webhook, which must answer
# unauthenticated) and one authed route.
_SPEC = {
    "spec_version": 1,
    "namespace": "acme",
    "name": "alerts-relay",
    "display_name": "Alerts Relay",
    "package": "acme-alerts-relay",
    "version": "1.0.0",
    "description": "Relays inbound alerts into the assistant.",
    "license": "MIT",
    "homepage": "https://example.com/alerts-relay",
    "repository": "https://github.com/acme/alerts-relay",
    # Range must include the docs-demo's running contract line so the install
    # preview resolves (the skeleton refuses a spec whose contract_range excludes the
    # installed tai42-contract). Pinned to the current major the same way every
    # shipped plugin's tai-plugin.yml is (`>=7.0,<8`) so it tracks the contract bump.
    "contract": ">=7.0,<8",
    "categories": ["channels"],
    "tags": ["alerts", "relay", "webhook"],
    "provides": [
        {
            "kind": "router",
            "name": "relay",
            "module": "acme_alerts_relay.routes",
            "description": "An inbound alerts webhook and its status read.",
            "tags": ["relay"],
            "routes": {
                "base": "alerts/relay",
                "paths": [
                    {"path": "/inbound", "methods": ["POST"], "public": True},
                    {"path": "/status/{event_id}", "methods": ["GET"], "public": False},
                ],
            },
        }
    ],
}

_REF = f"{_SPEC['namespace']}/{_SPEC['name']}"
_VERSION = _SPEC["version"]
_PUBLISHED_AT = "2026-01-15T00:00:00Z"

# The route-carrying item as the detail page's `latest.items` carries it (drives
# the Routes card and the install dialog's route rows).
_ITEM = {
    "kind": "router",
    "name": "relay",
    "description": "An inbound alerts webhook and its status read.",
    "tags": ["relay"],
    "group": None,
    "routes": _SPEC["provides"][0]["routes"],
}

# The listing detail (``GET /api/v1/plugins/{ns}/{name}``); the skeleton composes
# the version rows onto it, so `versions` is served separately below.
_LISTING = {
    "namespace": _SPEC["namespace"],
    "name": _SPEC["name"],
    "display_name": _SPEC["display_name"],
    "icon_url": None,
    "package": _SPEC["package"],
    "description": _SPEC["description"],
    "readme_md": None,
    "license": _SPEC["license"],
    "homepage_url": _SPEC["homepage"],
    "repository_url": _SPEC["repository"],
    "docs_url": None,
    "categories": _SPEC["categories"],
    "tags": _SPEC["tags"],
    "trust_tier": "community",
    "pricing": "free",
    "premium": False,
    "downloads": 128,
    "latest": {
        "version": _VERSION,
        "contract_range": _SPEC["contract"],
        "status": "published",
        "published_at": _PUBLISHED_AT,
        "items": [_ITEM],
        "spec": _SPEC,
    },
}

_VERSIONS = [
    {
        "version": _VERSION,
        "contract_range": _SPEC["contract"],
        "status": "published",
        "published_at": _PUBLISHED_AT,
    }
]

# The install-time pinning response (``POST .../resolve``): the pinned version, the
# full stored spec, a pypi source (no github artifact provenance needed), the
# contract range, and no advisories.
_RESOLVE = {
    "version": _VERSION,
    "spec": _SPEC,
    "source": "pypi",
    "contract_range": _SPEC["contract"],
    "advisories": [],
}


class _Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802 (BaseHTTPRequestHandler API)
        path = self.path.split("?", 1)[0]
        if path == "/healthz":
            self._send(200, {"data": "OK"})
        elif path == f"/api/v1/plugins/{_REF}":
            self._send(200, {"data": _LISTING})
        elif path == f"/api/v1/plugins/{_REF}/versions":
            self._send(200, {"data": {"versions": _VERSIONS}})
        else:
            self._send(404, {"error": f"not found: {path}"})

    def do_POST(self) -> None:  # noqa: N802 (BaseHTTPRequestHandler API)
        path = self.path.split("?", 1)[0]
        # Drain the request body so the socket is reusable.
        length = int(self.headers.get("content-length", "0") or "0")
        if length:
            self.rfile.read(length)
        if path == f"/api/v1/plugins/{_REF}/resolve":
            self._send(200, {"data": _RESOLVE})
        else:
            self._send(404, {"error": f"not found: {path}"})

    def log_message(self, *_args) -> None:  # silence per-request logging
        return


def main() -> None:
    port = int(os.environ.get("MARKETPLACE_REGISTRY_PORT", "8799"))
    server = ThreadingHTTPServer(("127.0.0.1", port), _Handler)
    print(f"[docs-registry] serving seeded {_REF} on http://127.0.0.1:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
