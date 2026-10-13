import { jsx as e, jsxs as n } from "react/jsx-runtime";
import { useApi as b, Card as l, TextInput as R, Checkbox as S, Button as T, Spinner as k, ErrorState as v, JsonTree as x } from "@tai42/studio-sdk";
import * as _ from "react";
import { useState as i } from "react";
window.__pluginReact = _;
const s = "studio_demo_echo", C = "synthetic";
function E(t) {
  if (typeof t != "object" || t === null) return !1;
  const o = t;
  return typeof o.original == "string" && typeof o.echoed == "string" && typeof o.shouted == "boolean";
}
function w(t) {
  const o = b(), [d, m] = i("hello from the reference plugin"), [a, y] = i(!1), [c, h] = i("idle"), [u, g] = i(null), [p, f] = i(null);
  return /* @__PURE__ */ e(l, { children: /* @__PURE__ */ n(
    "div",
    {
      "data-testid": "reference-echo-panel",
      style: { display: "flex", flexDirection: "column", gap: 12 },
      children: [
        /* @__PURE__ */ n("strong", { children: [
          "Reference plugin panel — ",
          s
        ] }),
        /* @__PURE__ */ e(
          R,
          {
            "aria-label": "message",
            "data-testid": "echo-message",
            value: d,
            onChange: (r) => {
              m(r.target.value);
            }
          }
        ),
        /* @__PURE__ */ e(S, { checked: a, onCheckedChange: y, label: "Shout (upper-case the echo)" }),
        /* @__PURE__ */ e(
          T,
          {
            variant: "primary",
            "data-testid": "echo-run",
            disabled: c === "running",
            onClick: () => {
              h("running"), f(null), g(null), o.runTool({ tool: s, kwargs: { message: d, shout: a } }).then((r) => {
                if (r.kind !== "result" || !E(r.result))
                  throw new Error("studio_demo_echo returned an unexpected shape");
                g(r.result);
              }).catch((r) => {
                f(r instanceof Error ? r.message : String(r));
              }).finally(() => {
                h("idle");
              });
            },
            children: c === "running" ? "Running…" : "Run echo"
          }
        ),
        c === "running" && /* @__PURE__ */ e(k, {}),
        p !== null && /* @__PURE__ */ e(v, { message: p }),
        u !== null && /* @__PURE__ */ e("div", { "data-testid": "echo-result", children: /* @__PURE__ */ e(x, { data: u, label: `${s} result` }) })
      ]
    }
  ) });
}
function D() {
  return /* @__PURE__ */ n(
    "svg",
    {
      width: "1em",
      height: "1em",
      viewBox: "0 0 16 16",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.5",
      "aria-hidden": "true",
      children: [
        /* @__PURE__ */ e("rect", { x: "2.5", y: "2.5", width: "11", height: "11", rx: "2.5" }),
        /* @__PURE__ */ e("path", { d: "M5.5 8h5M8 5.5v5", strokeLinecap: "round" })
      ]
    }
  );
}
function N({ pluginId: t }) {
  return /* @__PURE__ */ e(l, { children: /* @__PURE__ */ n(
    "div",
    {
      "data-testid": "reference-demo-page",
      style: { display: "flex", flexDirection: "column", gap: 8 },
      children: [
        /* @__PURE__ */ e("h1", { children: "Reference Studio plugin" }),
        /* @__PURE__ */ n("p", { children: [
          "This page is contributed by the ",
          /* @__PURE__ */ e("code", { children: t }),
          " Studio plugin. It renders inside the host shell using the host’s React and design-system singletons, loaded through the server-injected import map."
        ] }),
        /* @__PURE__ */ n("p", { children: [
          "Open the ",
          /* @__PURE__ */ e("code", { children: s }),
          " tool to see the custom panel this plugin registers; other tools fall back to the auto-generated form."
        ] }),
        /* @__PURE__ */ e("div", { className: "reference_plugin-demo", "data-testid": "reference-demo-scoped", children: "This box is styled by the plugin’s scoped stylesheet, using design-system tokens." })
      ]
    }
  ) });
}
function P({ pluginId: t }) {
  return /* @__PURE__ */ e(l, { children: /* @__PURE__ */ n(
    "div",
    {
      "data-testid": "reference-settings-tab",
      style: { display: "flex", flexDirection: "column", gap: 8 },
      children: [
        /* @__PURE__ */ e("strong", { children: "Reference plugin settings" }),
        /* @__PURE__ */ n("p", { children: [
          "This tab is contributed by the ",
          /* @__PURE__ */ e("code", { children: t }),
          " Studio plugin through",
          /* @__PURE__ */ e("code", { children: " registerSettingsTab" }),
          "; the host mounts it in the Settings workbench after the core tabs."
        ] })
      ]
    }
  ) });
}
function j({ pluginId: t, route: o }) {
  return /* @__PURE__ */ e(l, { children: /* @__PURE__ */ n("div", { "data-testid": "reference-route-panel", children: [
    /* @__PURE__ */ e("strong", { children: "Reference route panel" }),
    /* @__PURE__ */ n("p", { children: [
      "Contributed by ",
      /* @__PURE__ */ e("code", { children: t }),
      " for the route ",
      /* @__PURE__ */ e("code", { children: o.route_name }),
      " at",
      " ",
      /* @__PURE__ */ e("code", { children: o.our_identity }),
      "."
    ] })
  ] }) });
}
function A(t) {
  t.registerToolPanel({ toolName: s, component: w }), t.registerPage({ path: "demo", title: "Reference", component: N }), t.registerNavEntry({ path: "demo", title: "Reference", icon: D }), t.registerSettingsTab({ id: "demo", title: "Reference", component: P }), t.registerRoutePanel({
    channel: C,
    title: "Reference route panel",
    component: j
  });
}
export {
  A as register
};
