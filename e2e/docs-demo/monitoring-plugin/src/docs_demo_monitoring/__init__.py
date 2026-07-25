"""docs_demo_monitoring — the self-contained monitoring backend for the Studio
docs-screenshot pipeline.

The backend serves a seeded, deterministic observability dataset so the Studio
dashboard, run list, and trace views render populated real data with no external
service.

Registration is an import side-effect of :mod:`docs_demo_monitoring.monitoring`
(its module-level ``@tai42_app.monitoring.register_monitoring``). The skeleton
activates the backend by naming ``docs_demo_monitoring`` in a manifest's
``monitoring_module``: the runtime discovers and imports every module under this
package, firing that decorator. Importing this ``__init__`` alone does NOT
register (the decorator needs a bound ``tai42_app``, which only exists inside a
running skeleton) — mirroring the ecosystem's monitoring-plugin convention.
"""

from __future__ import annotations
