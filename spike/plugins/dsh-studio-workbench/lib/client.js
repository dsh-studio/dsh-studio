window.__ModuleLoader__.load({ id: "dsh-studio-workbench", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
//#region rolldown:runtime
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));

//#endregion
let react = require("react");
react = __toESM(react);
let react_jsx_runtime = require("react/jsx-runtime");
react_jsx_runtime = __toESM(react_jsx_runtime);

//#region src/bridge.ts
function desktopInvoke() {
	const tauri = window.__TAURI__;
	if (typeof tauri?.core?.invoke !== "function") throw new Error("desktop_only: 工作台组件仅在 DSH Studio 桌面应用中可用");
	return tauri.core.invoke;
}
function createWorkbenchBridge() {
	return {
		catalog: async () => desktopInvoke()("workbench_catalog"),
		setEnabled: async (componentId, enabled) => desktopInvoke()("workbench_set_enabled", {
			componentId,
			enabled
		}),
		repair: async () => desktopInvoke()("workbench_repair"),
		startSafeMode: async () => desktopInvoke()("workbench_start_safe_mode")
	};
}

//#endregion
//#region src/controller.ts
const INITIAL_SNAPSHOT = Object.freeze({
	phase: "loading",
	catalog: null,
	pendingComponentId: null,
	pendingGlobalAction: null,
	error: null
});
var WorkbenchController = class {
	snapshot = INITIAL_SNAPSHOT;
	listeners = /* @__PURE__ */ new Set();
	operation = 0;
	disposed = false;
	constructor(bridge) {
		this.bridge = bridge;
	}
	subscribe = (listener) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};
	getSnapshot = () => this.snapshot;
	async load() {
		const operation = this.nextOperation();
		this.publish({
			...this.snapshot,
			phase: "loading",
			error: null
		});
		try {
			const catalog = await this.bridge.catalog();
			if (!this.isCurrent(operation)) return;
			this.publish({
				phase: "ready",
				catalog,
				pendingComponentId: null,
				pendingGlobalAction: null,
				error: null
			});
		} catch (error) {
			if (!this.isCurrent(operation)) return;
			this.publish({
				...this.snapshot,
				phase: "error",
				error: messageOf(error)
			});
		}
	}
	async setEnabled(componentId, enabled) {
		if (this.busy()) return;
		const operation = this.nextOperation();
		this.publish({
			...this.snapshot,
			pendingComponentId: componentId,
			error: null
		});
		try {
			const catalog = await this.bridge.setEnabled(componentId, enabled);
			this.finish(operation, catalog);
		} catch (error) {
			this.fail(operation, error);
		}
	}
	async repair() {
		await this.runGlobal("repair", () => this.bridge.repair());
	}
	async startSafeMode() {
		await this.runGlobal("safeMode", () => this.bridge.startSafeMode());
	}
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.operation += 1;
		this.listeners.clear();
	}
	async runGlobal(action, run) {
		if (this.busy()) return;
		const operation = this.nextOperation();
		this.publish({
			...this.snapshot,
			pendingGlobalAction: action,
			error: null
		});
		try {
			this.finish(operation, await run());
		} catch (error) {
			this.fail(operation, error);
		}
	}
	busy() {
		return this.disposed || this.snapshot.pendingComponentId !== null || this.snapshot.pendingGlobalAction !== null;
	}
	finish(operation, catalog) {
		if (!this.isCurrent(operation)) return;
		this.publish({
			phase: "ready",
			catalog,
			pendingComponentId: null,
			pendingGlobalAction: null,
			error: null
		});
	}
	fail(operation, error) {
		if (!this.isCurrent(operation)) return;
		this.publish({
			...this.snapshot,
			phase: this.snapshot.catalog === null ? "error" : "ready",
			pendingComponentId: null,
			pendingGlobalAction: null,
			error: messageOf(error)
		});
	}
	nextOperation() {
		this.operation += 1;
		return this.operation;
	}
	isCurrent(operation) {
		return !this.disposed && operation === this.operation;
	}
	publish(snapshot) {
		if (this.disposed) return;
		this.snapshot = Object.freeze(snapshot);
		for (const listener of this.listeners) listener();
	}
};
function messageOf(error) {
	return error instanceof Error ? error.message : String(error);
}

//#endregion
//#region src/styles.ts
const STYLE_ID = "dsh-studio-workbench/styles";
function installWorkbenchStyles() {
	if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) !== null) return () => void 0;
	const style = document.createElement("style");
	style.dataset.plugin = "dsh-studio-workbench";
	style.dataset.pluginCss = STYLE_ID;
	style.textContent = `
.dshstudio-workbench{color:var(--dsw-alias-label-primary);max-width:860px}
.dshstudio-workbench__intro{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;margin:6px 0 16px}
.dshstudio-workbench__notice,.dshstudio-workbench__error{border-radius:10px;padding:10px 12px;margin:10px 0;font-size:13px;line-height:19px}
.dshstudio-workbench__notice{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 88%,#d8a43b 12%)}
.dshstudio-workbench__error{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 84%,#d9534f 16%);color:var(--dsw-alias-label-primary)}
.dshstudio-workbench__list{display:grid;gap:10px}
.dshstudio-workbench__row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;padding:14px 16px;border-radius:12px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1)}
.dshstudio-workbench__name{font-size:14px;font-weight:600}
.dshstudio-workbench__description,.dshstudio-workbench__meta{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;margin-top:4px}
.dshstudio-workbench__chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.dshstudio-workbench__chip{padding:2px 7px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);font-size:11px;color:var(--dsw-alias-label-secondary)}
.dshstudio-workbench__status{font-size:12px;margin-top:6px}
.dshstudio-workbench__switch{min-width:54px;border:0;border-radius:999px;padding:6px 10px;cursor:pointer;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dshstudio-workbench__switch[aria-checked="true"]{background:var(--dsw-alias-brand-primary);color:white}
.dshstudio-workbench__switch:disabled{cursor:not-allowed;opacity:.62}
.dshstudio-workbench__actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
.dshstudio-workbench__button{border:1px solid var(--dsw-alias-border-l1);border-radius:9px;padding:7px 12px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);cursor:pointer}
.dshstudio-workbench__button:disabled{cursor:wait;opacity:.65}
`;
	document.head.appendChild(style);
	return () => style.remove();
}

//#endregion
//#region src/WorkbenchSettingsSection.tsx
const PERMISSION_LABELS = {
	"workspace-read": "工作区读取",
	"workspace-write": "工作区写入",
	terminal: "终端执行",
	browser: "浏览器控制",
	network: "网络访问",
	model: "模型调用"
};
const HEALTH_LABELS = {
	active: "运行中",
	disabled: "已关闭",
	safeModeDisabled: "安全模式下已停用",
	damaged: "组件文件损坏",
	restarting: "等待重启"
};
function WorkbenchSettingsSection({ controller }) {
	const snapshot = (0, react.useSyncExternalStore)(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
	const [confirmSafeMode, setConfirmSafeMode] = (0, react.useState)(false);
	const busy = snapshot.pendingComponentId !== null || snapshot.pendingGlobalAction !== null;
	const catalog = snapshot.catalog;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		className: "dshstudio-workbench",
		"aria-busy": busy,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
				style: {
					margin: 0,
					fontSize: "18px"
				},
				children: "工作台组件"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dshstudio-workbench__intro",
				children: "DSH Studio 在本机离线加载经过锁定的组件。关闭或修复组件时，只调整 Studio 管理的 Profile 条目，不会覆盖会话和用户自行安装的插件。"
			}),
			catalog?.warning !== null && catalog?.warning !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dshstudio-workbench__notice",
				role: "status",
				children: catalog.warning
			}) : catalog?.rolledBack ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dshstudio-workbench__notice",
				role: "status",
				children: "已恢复上一组可用组件"
			}) : null,
			catalog?.mode === "safe" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dshstudio-workbench__notice",
				role: "status",
				children: "当前处于安全模式，第三方和可选组件已停用。"
			}) : null,
			snapshot.error !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dshstudio-workbench__error",
				role: "alert",
				children: snapshot.error
			}) : null,
			catalog === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				role: "status",
				children: "正在读取组件状态…"
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dshstudio-workbench__list",
				children: catalog.components.map((component) => {
					const pending = snapshot.pendingComponentId === component.id;
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
						className: "dshstudio-workbench__row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dshstudio-workbench__name",
								children: component.displayName
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dshstudio-workbench__description",
								children: component.description
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dshstudio-workbench__meta",
								children: [
									component.package,
									" · ",
									component.version,
									" · ",
									component.license
								]
							}),
							component.permissions.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dshstudio-workbench__chips",
								"aria-label": "组件权限",
								children: component.permissions.map((permission) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dshstudio-workbench__chip",
									children: PERMISSION_LABELS[permission] ?? permission
								}, permission))
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dshstudio-workbench__status",
								children: [HEALTH_LABELS[component.health], component.required ? " · 核心组件" : ""]
							})
						] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							role: "switch",
							"aria-label": component.displayName,
							"aria-checked": component.enabled,
							className: "dshstudio-workbench__switch",
							disabled: component.required || busy || component.health === "damaged",
							onClick: () => {
								controller.setEnabled(component.id, !component.enabled);
							},
							children: pending ? "切换中" : component.enabled ? "开启" : "关闭"
						})]
					}, component.id);
				})
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dshstudio-workbench__actions",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "dshstudio-workbench__button",
					disabled: busy,
					onClick: () => void controller.repair(),
					children: snapshot.pendingGlobalAction === "repair" ? "正在修复…" : "修复组件"
				}), !confirmSafeMode ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "dshstudio-workbench__button",
					disabled: busy,
					onClick: () => setConfirmSafeMode(true),
					children: "以安全模式重启"
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "dshstudio-workbench__button",
					disabled: busy,
					onClick: () => {
						setConfirmSafeMode(false);
						controller.startSafeMode();
					},
					children: "确认安全模式重启"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "dshstudio-workbench__button",
					disabled: busy,
					onClick: () => setConfirmSafeMode(false),
					children: "取消"
				})] })]
			}),
			busy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				role: "status",
				children: "正在重启本地 DSH…"
			}) : null
		]
	});
}

//#endregion
//#region src/client.tsx
const inject = ["slots"];
function apply(ctx) {
	const controller = new WorkbenchController(createWorkbenchBridge());
	ctx.effect(() => {
		const removeStyles = installWorkbenchStyles();
		controller.load();
		return () => {
			controller.dispose();
			removeStyles();
		};
	}, "dsh-studio-workbench: component lifecycle");
	function StudioWorkbenchSection() {
		return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkbenchSettingsSection, { controller });
	}
	ctx.slots.inject("settings.section", () => ctx.slots.register({
		name: "settings.section",
		id: "dsh-studio-workbench",
		order: 15,
		label: () => "工作台组件"
	}, StudioWorkbenchSection));
}

//#endregion
exports.apply = apply;
exports.inject = inject;
return module.exports; } });