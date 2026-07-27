import { jsx as e, jsxs as r } from "react/jsx-runtime";
import * as y from "react";
import { useState as i } from "react";
import { useApi as R, Card as c, TextInput as S, Checkbox as x, Button as k, Spinner as v, ErrorState as T, JsonTree as _ } from "@tai42/studio-sdk";
window.__pluginReact = y;
const s = "studio_demo_echo";
function w(t) {
  if (typeof t != "object" || t === null) return !1;
  const o = t;
  return typeof o.original == "string" && typeof o.echoed == "string" && typeof o.shouted == "boolean";
}
function E(t) {
  const o = R(), [d, m] = i("hello from the reference plugin"), [a, b] = i(!1), [l, h] = i("idle"), [u, g] = i(null), [p, f] = i(null);
  return /* @__PURE__ */ e(c, { children: /* @__PURE__ */ r(
    "div",
    {
      "data-testid": "reference-echo-panel",
      style: { display: "flex", flexDirection: "column", gap: 12 },
      children: [
        /* @__PURE__ */ r("strong", { children: [
          "Reference plugin panel — ",
          s
        ] }),
        /* @__PURE__ */ e(
          S,
          {
            "aria-label": "message",
            "data-testid": "echo-message",
            value: d,
            onChange: (n) => {
              m(n.target.value);
            }
          }
        ),
        /* @__PURE__ */ e(x, { checked: a, onCheckedChange: b, label: "Shout (upper-case the echo)" }),
        /* @__PURE__ */ e(
          k,
          {
            variant: "primary",
            "data-testid": "echo-run",
            disabled: l === "running",
            onClick: () => {
              h("running"), f(null), g(null), o.runTool({ tool: s, kwargs: { message: d, shout: a } }).then((n) => {
                if (!w(n))
                  throw new Error("studio_demo_echo returned an unexpected shape");
                g(n);
              }).catch((n) => {
                f(n instanceof Error ? n.message : String(n));
              }).finally(() => {
                h("idle");
              });
            },
            children: l === "running" ? "Running…" : "Run echo"
          }
        ),
        l === "running" && /* @__PURE__ */ e(v, {}),
        p !== null && /* @__PURE__ */ e(T, { message: p }),
        u !== null && /* @__PURE__ */ e("div", { "data-testid": "echo-result", children: /* @__PURE__ */ e(_, { data: u, label: `${s} result` }) })
      ]
    }
  ) });
}
function C() {
  return /* @__PURE__ */ r(
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
function D({ pluginId: t }) {
  return /* @__PURE__ */ e(c, { children: /* @__PURE__ */ r(
    "div",
    {
      "data-testid": "reference-demo-page",
      style: { display: "flex", flexDirection: "column", gap: 8 },
      children: [
        /* @__PURE__ */ e("h1", { children: "Reference Studio plugin" }),
        /* @__PURE__ */ r("p", { children: [
          "This page is contributed by the ",
          /* @__PURE__ */ e("code", { children: t }),
          " Studio plugin. It renders inside the host shell using the host’s React and design-system singletons, loaded through the server-injected import map."
        ] }),
        /* @__PURE__ */ r("p", { children: [
          "Open the ",
          /* @__PURE__ */ e("code", { children: s }),
          " tool to see the custom panel this plugin registers; other tools fall back to the auto-generated form."
        ] }),
        /* @__PURE__ */ e("div", { className: "reference_plugin-demo", "data-testid": "reference-demo-scoped", children: "This box is styled by the plugin’s scoped stylesheet, using design-system tokens." })
      ]
    }
  ) });
}
function j({ pluginId: t }) {
  return /* @__PURE__ */ e(c, { children: /* @__PURE__ */ r(
    "div",
    {
      "data-testid": "reference-settings-tab",
      style: { display: "flex", flexDirection: "column", gap: 8 },
      children: [
        /* @__PURE__ */ e("strong", { children: "Reference plugin settings" }),
        /* @__PURE__ */ r("p", { children: [
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
function N(t) {
  t.registerToolPanel({ toolName: s, component: E }), t.registerPage({ path: "demo", title: "Reference", component: D }), t.registerNavEntry({ path: "demo", title: "Reference", icon: C }), t.registerSettingsTab({ id: "demo", title: "Reference", component: j });
}
export {
  N as register
};
