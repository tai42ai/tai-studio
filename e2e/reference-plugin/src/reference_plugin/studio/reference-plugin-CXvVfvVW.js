import { Button as e, Card as t, Checkbox as n, ErrorState as r, JsonTree as i, Spinner as a, TextInput as o, useApi as s } from "@tai42/studio-sdk";
import * as c from "react";
import { useState as l } from "react";
import { jsx as u, jsxs as d } from "react/jsx-runtime";
// reference-plugin/studio-src/index.tsx
window.__pluginReact = c;
var f = "studio_demo_echo", p = "synthetic";
function m(e) {
	if (typeof e != "object" || !e) return !1;
	let t = e;
	return typeof t.original == "string" && typeof t.echoed == "string" && typeof t.shouted == "boolean";
}
function h(c) {
	let p = s(), [h, g] = l("hello from the reference plugin"), [_, v] = l(!1), [y, b] = l("idle"), [x, S] = l(null), [C, w] = l(null);
	return /* @__PURE__ */ u(t, { children: /* @__PURE__ */ d("div", {
		"data-testid": "reference-echo-panel",
		style: {
			display: "flex",
			flexDirection: "column",
			gap: 12
		},
		children: [
			/* @__PURE__ */ d("strong", { children: ["Reference plugin panel — ", f] }),
			/* @__PURE__ */ u(o, {
				"aria-label": "message",
				"data-testid": "echo-message",
				value: h,
				onChange: (e) => {
					g(e.target.value);
				}
			}),
			/* @__PURE__ */ u(n, {
				checked: _,
				onCheckedChange: v,
				label: "Shout (upper-case the echo)"
			}),
			/* @__PURE__ */ u(e, {
				variant: "primary",
				"data-testid": "echo-run",
				disabled: y === "running",
				onClick: () => {
					b("running"), w(null), S(null), p.runTool({
						tool: f,
						kwargs: {
							message: h,
							shout: _
						}
					}).then((e) => {
						if (e.kind !== "result" || !m(e.result)) throw Error("studio_demo_echo returned an unexpected shape");
						S(e.result);
					}).catch((e) => {
						w(e instanceof Error ? e.message : String(e));
					}).finally(() => {
						b("idle");
					});
				},
				children: y === "running" ? "Running…" : "Run echo"
			}),
			y === "running" && /* @__PURE__ */ u(a, {}),
			C !== null && /* @__PURE__ */ u(r, { message: C }),
			x !== null && /* @__PURE__ */ u("div", {
				"data-testid": "echo-result",
				children: /* @__PURE__ */ u(i, {
					data: x,
					label: `${f} result`
				})
			})
		]
	}) });
}
function g() {
	return /* @__PURE__ */ d("svg", {
		width: "1em",
		height: "1em",
		viewBox: "0 0 16 16",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: "1.5",
		"aria-hidden": "true",
		children: [/* @__PURE__ */ u("rect", {
			x: "2.5",
			y: "2.5",
			width: "11",
			height: "11",
			rx: "2.5"
		}), /* @__PURE__ */ u("path", {
			d: "M5.5 8h5M8 5.5v5",
			strokeLinecap: "round"
		})]
	});
}
function _({ pluginId: e }) {
	return /* @__PURE__ */ u(t, { children: /* @__PURE__ */ d("div", {
		"data-testid": "reference-demo-page",
		style: {
			display: "flex",
			flexDirection: "column",
			gap: 8
		},
		children: [
			/* @__PURE__ */ u("h1", { children: "Reference Studio plugin" }),
			/* @__PURE__ */ d("p", { children: [
				"This page is contributed by the ",
				/* @__PURE__ */ u("code", { children: e }),
				" Studio plugin. It renders inside the host shell using the host’s React and design-system singletons, loaded through the server-injected import map."
			] }),
			/* @__PURE__ */ d("p", { children: [
				"Open the ",
				/* @__PURE__ */ u("code", { children: f }),
				" tool to see the custom panel this plugin registers; other tools fall back to the auto-generated form."
			] }),
			/* @__PURE__ */ u("div", {
				className: "reference_plugin-demo",
				"data-testid": "reference-demo-scoped",
				children: "This box is styled by the plugin’s scoped stylesheet, using design-system tokens."
			})
		]
	}) });
}
function v({ pluginId: e }) {
	return /* @__PURE__ */ u(t, { children: /* @__PURE__ */ d("div", {
		"data-testid": "reference-settings-tab",
		style: {
			display: "flex",
			flexDirection: "column",
			gap: 8
		},
		children: [/* @__PURE__ */ u("strong", { children: "Reference plugin settings" }), /* @__PURE__ */ d("p", { children: [
			"This tab is contributed by the ",
			/* @__PURE__ */ u("code", { children: e }),
			" Studio plugin through",
			/* @__PURE__ */ u("code", { children: " registerSettingsTab" }),
			"; the host mounts it in the Settings workbench after the core tabs."
		] })]
	}) });
}
function y({ pluginId: e, route: n }) {
	return /* @__PURE__ */ u(t, { children: /* @__PURE__ */ d("div", {
		"data-testid": "reference-route-panel",
		children: [/* @__PURE__ */ u("strong", { children: "Reference route panel" }), /* @__PURE__ */ d("p", { children: [
			"Contributed by ",
			/* @__PURE__ */ u("code", { children: e }),
			" for the route ",
			/* @__PURE__ */ u("code", { children: n.route_name }),
			" at",
			" ",
			/* @__PURE__ */ u("code", { children: n.our_identity }),
			"."
		] })]
	}) });
}
function b(e) {
	e.registerToolPanel({
		toolName: f,
		component: h
	}), e.registerPage({
		path: "demo",
		title: "Reference",
		component: _
	}), e.registerNavEntry({
		path: "demo",
		title: "Reference",
		icon: g
	}), e.registerSettingsTab({
		id: "demo",
		title: "Reference",
		component: v
	}), e.registerRoutePanel({
		channel: p,
		title: "Reference route panel",
		component: y
	});
}
export { b as register };
