window.__ModuleLoader__.load({ id: "dsh-studio-themes", factory: (require) => {
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
	if (typeof tauri?.core?.invoke !== "function") throw new Error("desktop_only: 主题功能仅在 DSH Studio 桌面应用中可用");
	return tauri.core.invoke;
}
function createThemeBridge() {
	return {
		catalog: async () => desktopInvoke()("theme_catalog"),
		load: async (themeId) => desktopInvoke()("theme_load", { themeId }),
		importImage: async () => desktopInvoke()("theme_import_image"),
		save: async (request) => desktopInvoke()("theme_save", { request }),
		activate: async (themeId) => desktopInvoke()("theme_activate", { themeId }),
		delete: async (themeId) => desktopInvoke()("theme_delete", { themeId }),
		discardStage: async (stageId) => desktopInvoke()("theme_discard_stage", { stageId })
	};
}

//#endregion
//#region src/controller.ts
const INITIAL_SNAPSHOT = freezeSnapshot({
	phase: "loading",
	catalog: null,
	activeId: "system",
	editor: null,
	error: null
});
var ThemeController = class {
	snapshot = INITIAL_SNAPSHOT;
	listeners = /* @__PURE__ */ new Set();
	operation = 0;
	disposed = false;
	constructor(bridge, renderer) {
		this.bridge = bridge;
		this.renderer = renderer;
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
			if (catalog.activeId === "system") this.renderer.restoreCommitted("system");
			else {
				const active = await this.bridge.load(catalog.activeId);
				if (!this.isCurrent(operation)) return;
				this.renderer.applyCommitted(active);
			}
			this.publish({
				phase: "ready",
				catalog,
				activeId: catalog.activeId,
				editor: null,
				error: catalog.warning
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
	async activate(themeId) {
		if (themeId === this.snapshot.activeId) return;
		const operation = this.nextOperation();
		try {
			const resolved = await this.bridge.activate(themeId);
			if (!this.isCurrent(operation)) return;
			if (themeId === "system") this.renderer.restoreCommitted("system");
			else this.renderer.applyCommitted(resolved);
			this.publish({
				...this.snapshot,
				activeId: themeId,
				catalog: withActive(this.snapshot.catalog, themeId),
				error: null
			});
		} catch (error) {
			if (!this.isCurrent(operation)) return;
			this.publish({
				...this.snapshot,
				error: messageOf(error)
			});
		}
	}
	async restoreDefault() {
		await this.activate("system");
	}
	async importImage() {
		const operation = this.nextOperation();
		try {
			const imported = await this.bridge.importImage();
			if (!this.isCurrent(operation)) {
				if (imported !== null) this.bridge.discardStage(imported.stageId);
				return;
			}
			if (imported === null) return;
			const editor = {
				mode: "create",
				themeId: null,
				rollbackId: this.snapshot.activeId,
				stageId: imported.stageId,
				draft: cloneValues(imported.values),
				backgroundDataUrl: imported.backgroundDataUrl,
				thumbnailDataUrl: imported.thumbnailDataUrl,
				saving: false
			};
			this.renderer.preview(editor.draft, editor.backgroundDataUrl);
			this.publish({
				...this.snapshot,
				editor,
				error: null
			});
		} catch (error) {
			if (!this.isCurrent(operation)) return;
			this.publish({
				...this.snapshot,
				error: messageOf(error)
			});
		}
	}
	async edit(themeId) {
		if (!themeId.startsWith("user-")) {
			this.publish({
				...this.snapshot,
				error: "只有本地主题可以编辑"
			});
			return;
		}
		const operation = this.nextOperation();
		try {
			const resolved = await this.bridge.load(themeId);
			if (!this.isCurrent(operation)) return;
			const summary = this.snapshot.catalog?.themes.find((candidate) => candidate.manifest.id === themeId);
			const editor = {
				mode: "edit",
				themeId,
				rollbackId: this.snapshot.activeId,
				stageId: null,
				draft: valuesFromResolved(resolved),
				backgroundDataUrl: resolved.backgroundDataUrl,
				thumbnailDataUrl: summary?.thumbnailDataUrl ?? resolved.backgroundDataUrl,
				saving: false
			};
			this.renderer.preview(editor.draft, editor.backgroundDataUrl);
			this.publish({
				...this.snapshot,
				editor,
				error: null
			});
		} catch (error) {
			if (!this.isCurrent(operation)) return;
			this.publish({
				...this.snapshot,
				error: messageOf(error)
			});
		}
	}
	patchDraft(patch) {
		const editor = this.snapshot.editor;
		if (editor === null || editor.saving) return;
		const draft = {
			...editor.draft,
			...patch.name === void 0 ? {} : { name: patch.name },
			...patch.appearance === void 0 ? {} : { appearance: patch.appearance },
			colors: {
				...editor.draft.colors,
				...patch.colors
			},
			art: {
				...editor.draft.art,
				...patch.art
			},
			effects: {
				...editor.draft.effects,
				...patch.effects
			}
		};
		const nextEditor = {
			...editor,
			draft
		};
		this.renderer.preview(draft, editor.backgroundDataUrl);
		this.publish({
			...this.snapshot,
			editor: nextEditor,
			error: null
		});
	}
	async cancelEditor() {
		const editor = this.snapshot.editor;
		if (editor === null) return;
		this.nextOperation();
		this.renderer.restoreCommitted(editor.rollbackId);
		this.publish({
			...this.snapshot,
			editor: null,
			error: null
		});
		if (editor.stageId !== null) try {
			await this.bridge.discardStage(editor.stageId);
		} catch (error) {
			if (this.disposed) return;
			this.publish({
				...this.snapshot,
				error: messageOf(error)
			});
		}
	}
	async saveEditor() {
		const editor = this.snapshot.editor;
		if (editor === null || editor.saving) return;
		const operation = this.nextOperation();
		this.publish({
			...this.snapshot,
			editor: {
				...editor,
				saving: true
			},
			error: null
		});
		try {
			const resolved = await this.bridge.save({
				themeId: editor.themeId,
				stageId: editor.stageId,
				values: cloneValues(editor.draft)
			});
			if (!this.isCurrent(operation)) return;
			this.renderer.applyCommitted(resolved);
			const summary = {
				manifest: resolved.manifest,
				source: resolved.source,
				thumbnailDataUrl: editor.thumbnailDataUrl
			};
			this.publish({
				phase: "ready",
				catalog: upsertSummary(this.snapshot.catalog, summary),
				activeId: resolved.manifest.id,
				editor: null,
				error: null
			});
		} catch (error) {
			if (!this.isCurrent(operation)) return;
			this.publish({
				...this.snapshot,
				editor: {
					...editor,
					saving: false
				},
				error: messageOf(error)
			});
		}
	}
	async deleteUserTheme(themeId) {
		const operation = this.nextOperation();
		try {
			const catalog = await this.bridge.delete(themeId);
			if (!this.isCurrent(operation)) return;
			if (catalog.activeId !== this.snapshot.activeId) this.renderer.restoreCommitted(catalog.activeId);
			this.publish({
				...this.snapshot,
				catalog,
				activeId: catalog.activeId,
				editor: this.snapshot.editor?.themeId === themeId ? null : this.snapshot.editor,
				error: catalog.warning
			});
		} catch (error) {
			if (!this.isCurrent(operation)) return;
			this.publish({
				...this.snapshot,
				error: messageOf(error)
			});
		}
	}
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.operation += 1;
		const stageId = this.snapshot.editor?.stageId;
		if (stageId !== null && stageId !== void 0) this.bridge.discardStage(stageId);
		this.listeners.clear();
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
		this.snapshot = freezeSnapshot(snapshot);
		for (const listener of this.listeners) listener();
	}
};
function valuesFromResolved(theme) {
	return cloneValues({
		name: theme.manifest.name,
		appearance: theme.manifest.appearance,
		colors: theme.manifest.colors,
		art: theme.manifest.art,
		effects: theme.manifest.effects
	});
}
function cloneValues(values) {
	return {
		...values,
		colors: { ...values.colors },
		art: { ...values.art },
		effects: { ...values.effects }
	};
}
function freezeSnapshot(snapshot) {
	if (snapshot.editor !== null) {
		Object.freeze(snapshot.editor.draft.colors);
		Object.freeze(snapshot.editor.draft.art);
		Object.freeze(snapshot.editor.draft.effects);
		Object.freeze(snapshot.editor.draft);
		Object.freeze(snapshot.editor);
	}
	if (snapshot.catalog !== null) {
		Object.freeze(snapshot.catalog.themes);
		Object.freeze(snapshot.catalog);
	}
	return Object.freeze(snapshot);
}
function withActive(catalog, activeId) {
	return catalog === null ? null : {
		...catalog,
		activeId
	};
}
function upsertSummary(catalog, summary) {
	const themes = catalog?.themes.filter((candidate) => candidate.manifest.id !== summary.manifest.id) ?? [];
	return {
		activeId: summary.manifest.id,
		warning: null,
		themes: [...themes, summary]
	};
}
function messageOf(error) {
	return error instanceof Error ? error.message : String(error);
}

//#endregion
//#region src/visuals.ts
const HOME_SCRIM_OPACITY = .04;
const CONVERSATION_SCRIM_OPACITY = .12;

//#endregion
//#region src/styles.ts
const STYLE_ID = "dsh-studio-themes/styles";
function installThemeStyles() {
	if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) !== null) return () => void 0;
	const style = document.createElement("style");
	style.dataset.plugin = "dsh-studio-themes";
	style.dataset.pluginCss = STYLE_ID;
	style.textContent = `
[data-dsh-studio-wallpaper]{position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:0;background:#111318}
[data-dsh-studio-wallpaper-image]{position:absolute;inset:-40px;background-position:center;background-repeat:no-repeat;background-size:cover;transform:scale(1.035);will-change:filter,background-position;transition:filter .18s ease,background-position .18s ease}
[data-dsh-studio-wallpaper-scrim]{position:absolute;inset:0;background:rgba(8,10,14,${HOME_SCRIM_OPACITY});transition:background .18s ease}
body[data-dsh-studio-surface="conversation"] [data-dsh-studio-wallpaper-scrim]{background:rgba(8,10,14,${CONVERSATION_SCRIM_OPACITY})}
body>[id="root"]{position:relative;z-index:1;background:transparent!important}
body[data-dsh-studio-theme-active="true"] [class$="_centerCol"]{background:radial-gradient(ellipse at 54% 52%,var(--dsh-studio-readable-wash) 0%,transparent 72%)}
body[data-dsh-studio-theme-active="true"] [class$="_sidebarCol"]{border-right-color:transparent!important}
body[data-dsh-studio-theme-active="true"] [class$="_card"]{border-color:transparent!important}
.dsh-theme-button:focus-visible,.dsh-theme-input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsh-theme-section,.dsh-theme-editor{color:var(--dsw-alias-label-primary);padding:26px 0 28px}
.dsh-theme-section *,.dsh-theme-editor *{box-sizing:border-box}
.dsh-theme-hero,.dsh-theme-editor__header{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:22px}
.dsh-theme-hero h2,.dsh-theme-editor h2{font-size:24px;line-height:1.2;letter-spacing:-.02em;margin:5px 0 7px}
.dsh-theme-hero p,.dsh-theme-editor p,.dsh-theme-group__heading p{margin:0;color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:1.55}
.dsh-theme-eyebrow{font-size:9px;letter-spacing:.16em;font-weight:700;color:var(--dsw-alias-brand-primary)}
.dsh-theme-button{font:inherit;color:inherit;cursor:pointer;border:0;background:var(--dsw-alias-bg-layer-1);border-radius:10px;transition:background .16s ease,transform .16s ease,box-shadow .16s ease}
.dsh-theme-button:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);box-shadow:0 6px 18px rgba(0,0,0,.08)}
.dsh-theme-button:active:not(:disabled){transform:translateY(1px)}
.dsh-theme-button:disabled{cursor:not-allowed;opacity:.5}
.dsh-theme-button--quiet{padding:8px 13px;font-size:12px;white-space:nowrap}
.dsh-theme-button--primary{padding:9px 14px;color:#fff;background:var(--dsw-alias-brand-primary);font-weight:600;font-size:12px}
.dsh-theme-button--primary:hover:not(:disabled){background:var(--dsw-alias-brand-primary);filter:brightness(1.08)}
.dsh-theme-button--danger{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}
.dsh-theme-notice{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 12px;margin:0 0 16px;border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 12%,var(--dsw-alias-bg-layer-1));font-size:12px}
.dsh-theme-notice button{border:0;background:none;color:var(--dsw-alias-brand-primary);cursor:pointer;font-weight:600}
.dsh-theme-current{display:flex;align-items:center;gap:12px;padding:13px 15px;border:0;border-radius:14px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 10px 30px rgba(0,0,0,.06);margin-bottom:26px}
.dsh-theme-current__swatch{width:34px;height:34px;border-radius:10px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.28)}
.dsh-theme-current>div:last-child{display:grid;grid-template-columns:auto 1fr;gap:1px 10px;align-items:baseline}
.dsh-theme-current span{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.dsh-theme-current strong{font-size:13px}.dsh-theme-current small{grid-column:1/-1;font-size:11px;color:var(--dsw-alias-label-secondary)}
.dsh-theme-group{margin-top:24px}.dsh-theme-group__heading{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:12px}
.dsh-theme-group__heading h3{font-size:14px;margin:0 0 3px}.dsh-theme-group__heading>span{font-size:10px;color:var(--dsw-alias-label-secondary)}
.dsh-theme-group__heading--mine{align-items:center}
.dsh-theme-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.dsh-theme-card{position:relative;overflow:hidden;border-radius:14px;border:0;background:var(--dsw-alias-bg-layer-1);transition:transform .18s ease,box-shadow .18s ease}
.dsh-theme-card:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(0,0,0,.12)}
.dsh-theme-card.is-active{box-shadow:0 14px 32px rgba(0,0,0,.14)}
.dsh-theme-card__apply{position:relative;display:block;width:100%;height:112px;overflow:hidden;padding:0;border:0;border-radius:0;background:#20242c}
.dsh-theme-card__apply img{width:100%;height:100%;display:block;object-fit:cover;transition:transform .3s ease}.dsh-theme-card:hover img{transform:scale(1.035)}
.dsh-theme-card__shade{position:absolute;inset:0;background:linear-gradient(180deg,transparent 52%,rgba(0,0,0,.32))}
.dsh-theme-card__check{position:absolute;right:9px;top:9px;width:23px;height:23px;display:grid;place-items:center;border-radius:50%;font-size:11px;color:#fff;background:rgba(12,15,20,.62);backdrop-filter:blur(8px)}
.dsh-theme-card.is-active .dsh-theme-card__check{background:var(--dsw-alias-brand-primary)}
.dsh-theme-card__meta{display:flex;flex-direction:column;gap:3px;padding:10px 11px 11px}.dsh-theme-card__meta strong{font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dsh-theme-card__meta span{font-size:10.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-theme-card__actions{display:flex;gap:6px;flex-wrap:wrap;padding-top:6px}.dsh-theme-card__actions button{padding:5px 8px;font-size:10.5px}
.dsh-theme-empty{min-height:72px;display:flex;align-items:center;justify-content:center;gap:10px;border:0;background:var(--dsw-alias-bg-layer-1);border-radius:14px;color:var(--dsw-alias-label-secondary);font-size:12px}.dsh-theme-empty>span{font-size:22px}.dsh-theme-empty div{display:flex;flex-direction:column;gap:2px}.dsh-theme-empty strong{font-size:12px;color:var(--dsw-alias-label-primary)}.dsh-theme-empty small{font-size:10.5px}
.dsh-theme-editor__status{padding:5px 9px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:10px}
.dsh-theme-editor__layout{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(220px,.85fr);gap:20px}
.dsh-theme-editor__preview small{display:block;margin-top:7px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:10.5px}
.dsh-theme-focus{position:relative;width:100%;aspect-ratio:16/10;border:0;border-radius:16px;background-size:cover;background-repeat:no-repeat;overflow:hidden;box-shadow:0 14px 32px rgba(0,0,0,.14)}
.dsh-theme-focus__marker{position:absolute;width:22px;height:22px;border:2px solid #fff;border-radius:50%;transform:translate(-50%,-50%);box-shadow:0 1px 8px rgba(0,0,0,.55)}.dsh-theme-focus__marker:after{content:"";position:absolute;width:4px;height:4px;border-radius:50%;background:#fff;left:7px;top:7px}
.dsh-theme-editor__controls{display:flex;flex-direction:column;gap:13px}.dsh-theme-field{display:flex;flex-direction:column;gap:6px;font-size:11px;font-weight:600}.dsh-theme-field>span{display:flex;justify-content:space-between}.dsh-theme-field output{font-weight:400;color:var(--dsw-alias-label-secondary)}
.dsh-theme-input:not([type="range"]){width:100%;border:0;border-radius:9px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);padding:8px 10px;font:inherit;font-weight:400}.dsh-theme-input[aria-invalid="true"]{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,var(--dsw-alias-bg-layer-1))}
.dsh-theme-color-row{display:flex;gap:8px}.dsh-theme-color{width:38px;height:34px;padding:3px;border:0;border-radius:9px;background:var(--dsw-alias-bg-layer-1)}.dsh-theme-color-text{flex:1}
.dsh-theme-range input{width:100%;accent-color:var(--dsw-alias-brand-primary)}
.dsh-theme-editor__footer{display:flex;justify-content:flex-end;gap:9px;margin-top:22px;padding-top:16px}
.dsh-theme-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:760px){.dsh-theme-grid{grid-template-columns:1fr 1fr}.dsh-theme-editor__layout{grid-template-columns:1fr}.dsh-theme-hero{align-items:center}}
@media (prefers-reduced-motion:reduce){[data-dsh-studio-wallpaper-image],[data-dsh-studio-wallpaper-scrim]{transition:none}}
`;
	document.head.appendChild(style);
	return () => style.remove();
}

//#endregion
//#region src/tokens.ts
function deriveTokens(values, scheme) {
	const alpha = values.effects.panelOpacity.toFixed(2);
	const strongAlpha = Math.min(.82, values.effects.panelOpacity + .16).toFixed(2);
	const hoverAlpha = Math.min(.88, values.effects.panelOpacity + .22).toFixed(2);
	const accent = readableAccent(values.colors.accent, scheme);
	if (scheme === "light") return {
		"--dsw-alias-bg-base": "transparent",
		"--dsw-alias-bg-layer-1": `rgba(255, 255, 255, ${alpha})`,
		"--dsw-alias-bg-layer-2": `rgba(250, 251, 253, ${strongAlpha})`,
		"--dsw-alias-bg-layer-3": "rgba(255, 255, 255, 0.92)",
		"--dsw-alias-bg-overlay": "rgba(255, 255, 255, 0.90)",
		"--dsw-alias-bg-module-platform": `rgba(250, 251, 253, ${strongAlpha})`,
		"--dsw-alias-bg-multi-select": `rgba(250, 251, 253, ${strongAlpha})`,
		"--dsw-alias-border-inverted2": "transparent",
		"--dsw-alias-border-inverted": "transparent",
		"--dsw-alias-border-l1": "transparent",
		"--dsw-alias-border-l2": "transparent",
		"--dsw-alias-border-l2-darkmode-thin": "transparent",
		"--dsw-alias-border-l3": "transparent",
		"--dsw-alias-border-l4": "transparent",
		"--dsw-alias-brand-primary": accent,
		"--dsw-alias-label-primary": "#171a21",
		"--dsw-alias-label-secondary": "#525a68",
		"--dsw-alias-label-tertiary": "#687180",
		"--dsw-alias-label-caption": "#7b8492",
		"--dsw-alias-label-dimmed": "#adb4bf",
		"--dsw-alias-state-business-primary": accent,
		"--dsw-alias-state-error-primary": "#b4232f",
		"--dsw-alias-state-success-primary": "#14733f",
		"--dsw-alias-state-warn-primary": "#8a5500",
		"--dsw-alias-button-elevated-fill": `rgba(255, 255, 255, ${strongAlpha})`,
		"--dsw-alias-button-floating-fill": `rgba(255, 255, 255, ${strongAlpha})`,
		"--dsw-alias-button-floating-hover": `rgba(255, 255, 255, ${hoverAlpha})`,
		"--dsw-alias-button-info-fill": accent,
		"--dsw-alias-button-info-hover": accent,
		"--dsw-alias-button-primary-fill": accent,
		"--dsw-alias-button-primary-hover": accent,
		"--dsw-alias-interactive-bg-hover": "rgba(255, 255, 255, 0.24)",
		"--dsw-alias-interactive-bg-hover-solid": `rgba(255, 255, 255, ${hoverAlpha})`,
		"--dsw-alias-interactive-bg-hover-accent": "rgba(255, 255, 255, 0.32)",
		"--dsw-alias-interactive-bg-active": "rgba(255, 255, 255, 0.34)",
		"--dsw-alias-markdown-code-block": `rgba(255, 255, 255, ${strongAlpha})`,
		"--dsw-alias-markdown-code-block-banner": `rgba(255, 255, 255, ${hoverAlpha})`,
		"--dsw-alias-markdown-inline-code": "rgba(255, 255, 255, 0.46)",
		"--dsw-alias-markdown-placeholder": "rgba(255, 255, 255, 0.30)",
		"--dsw-alias-markdown-tag": "rgba(255, 255, 255, 0.38)",
		"--dsw-specific-input-major": `rgba(255, 255, 255, ${strongAlpha})`,
		"--dsw-specific-login-input": `rgba(255, 255, 255, ${strongAlpha})`,
		"--dsw-specific-selector": `rgba(255, 255, 255, ${strongAlpha})`,
		"--dsw-specific-tip": `rgba(255, 255, 255, ${strongAlpha})`,
		"--dsw-specific-bubble": `rgba(255, 255, 255, ${strongAlpha})`,
		"--dsw-specific-menu": "rgba(255, 255, 255, 0.92)",
		"--dsw-specific-sidebar-fill": `rgba(247, 248, 251, ${alpha})`,
		"--dsw-specific-sidebar-nav-item-active-accent": "rgba(79, 140, 255, 0.16)",
		"--dsw-specific-sidebar-nav-item-active": "rgba(255, 255, 255, 0.30)",
		"--dsw-specific-sidebar-nav-item-hover": "rgba(255, 255, 255, 0.20)",
		"--dsh-studio-readable-wash": "rgba(255, 255, 255, 0.18)"
	};
	return {
		"--dsw-alias-bg-base": "transparent",
		"--dsw-alias-bg-layer-1": `rgba(17, 20, 26, ${alpha})`,
		"--dsw-alias-bg-layer-2": `rgba(20, 23, 30, ${strongAlpha})`,
		"--dsw-alias-bg-layer-3": "rgba(20, 23, 30, 0.92)",
		"--dsw-alias-bg-overlay": "rgba(20, 23, 30, 0.90)",
		"--dsw-alias-bg-module-platform": `rgba(20, 23, 30, ${strongAlpha})`,
		"--dsw-alias-bg-multi-select": `rgba(20, 23, 30, ${strongAlpha})`,
		"--dsw-alias-border-inverted2": "transparent",
		"--dsw-alias-border-inverted": "transparent",
		"--dsw-alias-border-l1": "transparent",
		"--dsw-alias-border-l2": "transparent",
		"--dsw-alias-border-l2-darkmode-thin": "transparent",
		"--dsw-alias-border-l3": "transparent",
		"--dsw-alias-border-l4": "transparent",
		"--dsw-alias-brand-primary": accent,
		"--dsw-alias-label-primary": "#f3f5f8",
		"--dsw-alias-label-secondary": "#c0c6d0",
		"--dsw-alias-label-tertiary": "#a2aab7",
		"--dsw-alias-label-caption": "#858e9c",
		"--dsw-alias-label-dimmed": "#626b78",
		"--dsw-alias-state-business-primary": accent,
		"--dsw-alias-state-error-primary": "#ff7b86",
		"--dsw-alias-state-success-primary": "#68d391",
		"--dsw-alias-state-warn-primary": "#f5bd61",
		"--dsw-alias-button-elevated-fill": `rgba(17, 20, 26, ${strongAlpha})`,
		"--dsw-alias-button-floating-fill": `rgba(17, 20, 26, ${strongAlpha})`,
		"--dsw-alias-button-floating-hover": `rgba(27, 31, 39, ${hoverAlpha})`,
		"--dsw-alias-button-info-fill": accent,
		"--dsw-alias-button-info-hover": accent,
		"--dsw-alias-button-primary-fill": accent,
		"--dsw-alias-button-primary-hover": accent,
		"--dsw-alias-interactive-bg-hover": "rgba(255, 255, 255, 0.10)",
		"--dsw-alias-interactive-bg-hover-solid": `rgba(27, 31, 39, ${hoverAlpha})`,
		"--dsw-alias-interactive-bg-hover-accent": "rgba(255, 255, 255, 0.18)",
		"--dsw-alias-interactive-bg-active": "rgba(255, 255, 255, 0.16)",
		"--dsw-alias-markdown-code-block": `rgba(13, 16, 21, ${strongAlpha})`,
		"--dsw-alias-markdown-code-block-banner": `rgba(13, 16, 21, ${hoverAlpha})`,
		"--dsw-alias-markdown-inline-code": "rgba(13, 16, 21, 0.56)",
		"--dsw-alias-markdown-placeholder": "rgba(13, 16, 21, 0.42)",
		"--dsw-alias-markdown-tag": "rgba(13, 16, 21, 0.50)",
		"--dsw-specific-input-major": `rgba(13, 16, 21, ${strongAlpha})`,
		"--dsw-specific-login-input": `rgba(13, 16, 21, ${strongAlpha})`,
		"--dsw-specific-selector": `rgba(13, 16, 21, ${strongAlpha})`,
		"--dsw-specific-tip": `rgba(13, 16, 21, ${strongAlpha})`,
		"--dsw-specific-bubble": `rgba(13, 16, 21, ${strongAlpha})`,
		"--dsw-specific-menu": "rgba(20, 23, 30, 0.92)",
		"--dsw-specific-sidebar-fill": `rgba(13, 16, 21, ${alpha})`,
		"--dsw-specific-sidebar-nav-item-active-accent": "rgba(79, 140, 255, 0.20)",
		"--dsw-specific-sidebar-nav-item-active": "rgba(255, 255, 255, 0.12)",
		"--dsw-specific-sidebar-nav-item-hover": "rgba(255, 255, 255, 0.08)",
		"--dsh-studio-readable-wash": "rgba(6, 8, 12, 0.20)"
	};
}
function deriveTokenPairs(values) {
	const light = deriveTokens(values, "light");
	const dark = deriveTokens(values, "dark");
	return Object.fromEntries(Object.keys(light).map((name) => [name, {
		light: light[name],
		dark: dark[name]
	}]));
}
function contrast(foreground, background) {
	const first = relativeLuminance(parseColor(foreground, [
		255,
		255,
		255
	]));
	const second = relativeLuminance(parseColor(background, [
		255,
		255,
		255
	]));
	const lighter = Math.max(first, second);
	const darker = Math.min(first, second);
	return (lighter + .05) / (darker + .05);
}
function readableAccent(accent, scheme) {
	let rgb = parseHex(accent);
	const panel = scheme === "light" ? "#f8f9fb" : "#14171d";
	const toward = scheme === "light" ? [
		0,
		0,
		0
	] : [
		255,
		255,
		255
	];
	for (let step = 0; step < 20 && contrast(toHex(rgb), panel) < 3; step += 1) rgb = rgb.map((channel, index) => channel + (toward[index] - channel) * .08);
	return toHex(rgb);
}
function parseColor(value, backdrop) {
	if (value === "transparent") return backdrop;
	const rgba = value.match(/^rgba\((\d+), (\d+), (\d+), (0?\.\d+)\)$/);
	if (rgba !== null) {
		const alpha = Number(rgba[4]);
		return [
			Number(rgba[1]) * alpha + backdrop[0] * (1 - alpha),
			Number(rgba[2]) * alpha + backdrop[1] * (1 - alpha),
			Number(rgba[3]) * alpha + backdrop[2] * (1 - alpha)
		];
	}
	return parseHex(value);
}
function parseHex(value) {
	const normalized = normalizeHex(value);
	return [
		Number.parseInt(normalized.slice(1, 3), 16),
		Number.parseInt(normalized.slice(3, 5), 16),
		Number.parseInt(normalized.slice(5, 7), 16)
	];
}
function normalizeHex(value) {
	return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : "#4f8cff";
}
function toHex(channels) {
	return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}
function relativeLuminance(channels) {
	const [red, green, blue] = channels.map((channel) => {
		const value = channel / 255;
		return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
	});
	return .2126 * red + .7152 * green + .0722 * blue;
}

//#endregion
//#region src/renderer.ts
const ACTIVE_ID = "dsh-studio-active";
const PREVIEW_ID = "dsh-studio-preview";
const PREVIEW_SOURCE = "dsh-studio-themes:preview";
var ThemeRenderer = class {
	committed = /* @__PURE__ */ new Map();
	activeDispose = null;
	previewDispose = null;
	overrideDispose = null;
	wallpaper = null;
	wallpaperImage = null;
	stopSessions;
	stopStyles;
	media;
	current = null;
	disposed = false;
	constructor(theme, sessions) {
		this.theme = theme;
		this.stopStyles = installThemeStyles();
		this.stopSessions = sessions.list.subscribe(() => this.updateSurface(sessions));
		this.updateSurface(sessions);
		this.media = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
		this.media?.addEventListener("change", this.handleSchemeChange);
	}
	applyCommitted(theme) {
		if (this.disposed) return;
		this.committed.set(theme.manifest.id, theme);
		this.clearPreview();
		this.registerActive(theme);
		this.paint(valuesFrom(theme), theme.backgroundDataUrl, "active");
	}
	preview(values, backgroundDataUrl) {
		if (this.disposed) return;
		const scheme = this.resolveScheme(values);
		if (this.previewDispose === null) this.previewDispose = this.theme.register({
			id: PREVIEW_ID,
			colorScheme: scheme,
			tokens: deriveTokens(values, scheme)
		});
		this.overrideDispose?.();
		this.overrideDispose = this.theme.overrideTokens(PREVIEW_SOURCE, deriveTokenPairs(values));
		this.theme.setTheme(PREVIEW_ID);
		this.paint(values, backgroundDataUrl, "preview");
	}
	restoreCommitted(themeId) {
		if (this.disposed) return;
		this.clearPreview();
		if (themeId === "system") {
			this.activeDispose?.();
			this.activeDispose = null;
			this.removeWallpaper();
			this.theme.setTheme("system");
			return;
		}
		const theme = this.committed.get(themeId);
		if (theme === void 0) {
			this.removeWallpaper();
			this.theme.setTheme("system");
			return;
		}
		this.registerActive(theme);
		this.paint(valuesFrom(theme), theme.backgroundDataUrl, "active");
	}
	dispose() {
		if (this.disposed) return;
		this.clearPreview();
		this.activeDispose?.();
		this.activeDispose = null;
		this.stopSessions();
		this.media?.removeEventListener("change", this.handleSchemeChange);
		this.removeWallpaper();
		delete document.body.dataset.dshStudioSurface;
		this.theme.setTheme("system");
		this.stopStyles();
		this.disposed = true;
	}
	registerActive(theme) {
		this.activeDispose?.();
		const values = valuesFrom(theme);
		const scheme = this.resolveScheme(values);
		this.activeDispose = this.theme.register({
			id: ACTIVE_ID,
			colorScheme: scheme,
			tokens: deriveTokens(values, scheme)
		});
		this.theme.setTheme(ACTIVE_ID);
	}
	clearPreview() {
		this.overrideDispose?.();
		this.overrideDispose = null;
		this.previewDispose?.();
		this.previewDispose = null;
	}
	paint(values, image, mode) {
		const imageLayer = this.ensureWallpaper();
		imageLayer.style.backgroundImage = `url("${image.replaceAll("\"", "%22")}")`;
		imageLayer.style.backgroundPosition = `${values.art.focusX * 100}% ${values.art.focusY * 100}%`;
		imageLayer.style.filter = `brightness(${values.effects.brightness}) blur(${values.effects.blur}px)`;
		document.body.dataset.dshStudioThemeActive = "true";
		this.current = {
			values,
			image,
			mode
		};
	}
	ensureWallpaper() {
		if (this.wallpaperImage !== null) return this.wallpaperImage;
		const wallpaper = document.createElement("div");
		wallpaper.dataset.dshStudioWallpaper = "";
		wallpaper.setAttribute("aria-hidden", "true");
		const image = document.createElement("div");
		image.dataset.dshStudioWallpaperImage = "";
		const scrim = document.createElement("div");
		scrim.dataset.dshStudioWallpaperScrim = "";
		wallpaper.append(image, scrim);
		document.body.prepend(wallpaper);
		this.wallpaper = wallpaper;
		this.wallpaperImage = image;
		return image;
	}
	removeWallpaper() {
		this.wallpaper?.remove();
		this.wallpaper = null;
		this.wallpaperImage = null;
		this.current = null;
		delete document.body.dataset.dshStudioThemeActive;
	}
	updateSurface(sessions) {
		const state = sessions.list.getSnapshot();
		const current = state.current === void 0 ? void 0 : state.byId[state.current];
		document.body.dataset.dshStudioSurface = current === void 0 || current.blank ? "home" : "conversation";
	}
	resolveScheme(values) {
		if (values.appearance !== "auto") return values.appearance;
		if (this.media !== null) return this.media.matches ? "dark" : "light";
		return this.theme.getTheme().active.colorScheme;
	}
	handleSchemeChange = () => {
		const current = this.current;
		if (current === null || current.values.appearance !== "auto") return;
		if (current.mode === "preview") {
			this.previewDispose?.();
			this.previewDispose = null;
			this.preview(current.values, current.image);
			return;
		}
		const committed = [...this.committed.values()].find((theme) => theme.backgroundDataUrl === current.image);
		if (committed !== void 0) this.registerActive(committed);
	};
};
function valuesFrom(theme) {
	return {
		name: theme.manifest.name,
		appearance: theme.manifest.appearance,
		colors: { ...theme.manifest.colors },
		art: { ...theme.manifest.art },
		effects: { ...theme.manifest.effects }
	};
}

//#endregion
//#region src/ThemeSettingsSection.tsx
function ThemeSettingsSection({ controller }) {
	const snapshot = (0, react.useSyncExternalStore)(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
	(0, react.useEffect)(() => () => {
		if (controller.getSnapshot().editor !== null) controller.cancelEditor();
	}, [controller]);
	if (snapshot.editor !== null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ThemeEditor, {
		controller,
		editor: snapshot.editor,
		error: snapshot.error
	});
	const bundled = snapshot.catalog?.themes.filter((theme) => theme.source === "bundled") ?? [];
	const users = snapshot.catalog?.themes.filter((theme) => theme.source === "user") ?? [];
	const current = snapshot.catalog?.themes.find((theme) => theme.manifest.id === snapshot.activeId);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		className: "dsh-theme-section",
		"aria-labelledby": "dsh-theme-title",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
				className: "dsh-theme-hero",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsh-theme-eyebrow",
						children: "DSH STUDIO · DREAM SKIN"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						id: "dsh-theme-title",
						children: "主题皮肤"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "直接选择 Dream Skin 精选主题，也可以把自己的图片做成桌面皮肤。" })
				] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "dsh-theme-button dsh-theme-button--quiet",
					onClick: () => {
						controller.restoreDefault();
					},
					disabled: snapshot.phase === "loading" || snapshot.activeId === "system",
					children: "还原默认"
				})]
			}),
			snapshot.error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-theme-notice",
				role: "alert",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: snapshot.error }), snapshot.phase === "error" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => {
						controller.load();
					},
					children: "重试"
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-theme-current",
				"aria-label": "当前主题",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsh-theme-current__swatch",
					style: { background: current?.manifest.colors.accent ?? "#7b8495" }
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "当前主题" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: current?.manifest.name ?? "系统默认" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: current === void 0 ? "跟随 DSH 默认外观" : current.source === "bundled" ? `${current.manifest.attribution?.author ?? "未知作者"} · ${current.manifest.attribution?.license ?? "来源已记录"}` : "我的本地主题" })
				] })]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "dsh-theme-group",
				"aria-labelledby": "dsh-theme-curated",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-theme-group__heading",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						id: "dsh-theme-curated",
						children: "精选主题"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "来自 Dream Skin 的已审核离线主题" })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [bundled.length, " 套"] })]
				}), snapshot.phase === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsh-theme-empty",
					"aria-live": "polite",
					children: "正在载入主题…"
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsh-theme-grid",
					children: bundled.map((theme) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ThemeCard, {
						theme,
						active: snapshot.activeId === theme.manifest.id,
						onApply: () => {
							controller.activate(theme.manifest.id);
						}
					}, theme.manifest.id))
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "dsh-theme-group",
				"aria-labelledby": "dsh-theme-mine",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-theme-group__heading dsh-theme-group__heading--mine",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						id: "dsh-theme-mine",
						children: "我的主题"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "图片只保存在这台电脑，不会上传" })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "dsh-theme-button dsh-theme-button--primary",
						onClick: () => {
							controller.importImage();
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							"aria-hidden": "true",
							children: "＋"
						}), " 导入本地图片"]
					})]
				}), users.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-theme-empty",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						"aria-hidden": "true",
						children: "◇"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "还没有本地主题" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "支持 PNG、JPEG、WebP、GIF，最大 20 MB" })] })]
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsh-theme-grid",
					children: users.map((theme) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UserThemeCard, {
						theme,
						active: snapshot.activeId === theme.manifest.id,
						onApply: () => {
							controller.activate(theme.manifest.id);
						},
						onEdit: () => {
							controller.edit(theme.manifest.id);
						},
						onDelete: () => controller.deleteUserTheme(theme.manifest.id)
					}, theme.manifest.id))
				})]
			})
		]
	});
}
function ThemeCard({ theme, active, onApply }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
		className: `dsh-theme-card${active ? " is-active" : ""}`,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
			type: "button",
			className: "dsh-theme-card__apply dsh-theme-button",
			"aria-label": `应用主题：${theme.manifest.name}`,
			"aria-pressed": active,
			onClick: onApply,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
					src: theme.thumbnailDataUrl,
					alt: ""
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dsh-theme-card__shade" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "dsh-theme-card__check",
					"aria-hidden": "true",
					children: active ? "✓" : "↗"
				})
			]
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "dsh-theme-card__meta",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: theme.manifest.name }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: theme.source === "bundled" ? `${theme.manifest.attribution?.author ?? "未知作者"} · ${theme.manifest.attribution?.license ?? "来源已记录"}` : "本地图片" })]
		})]
	});
}
function UserThemeCard({ theme, active, onApply, onEdit, onDelete }) {
	const [confirming, setConfirming] = (0, react.useState)(false);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ThemeCard, {
		theme,
		active,
		onApply
	}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "dsh-theme-card__actions",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
			type: "button",
			className: "dsh-theme-button",
			onClick: onEdit,
			children: ["编辑 ", theme.manifest.name]
		}), confirming ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
			type: "button",
			className: "dsh-theme-button dsh-theme-button--danger",
			onClick: () => {
				onDelete();
			},
			children: ["确认删除 ", theme.manifest.name]
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
			type: "button",
			className: "dsh-theme-button",
			onClick: () => setConfirming(false),
			children: "取消删除"
		})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
			type: "button",
			className: "dsh-theme-button",
			onClick: () => setConfirming(true),
			children: ["删除 ", theme.manifest.name]
		})]
	})] });
}
function ThemeEditor({ controller, editor, error }) {
	const valid = editor.draft.name.trim().length > 0 && [...editor.draft.name].length <= 48 && /^#[0-9a-fA-F]{6}$/.test(editor.draft.colors.accent);
	const moveFocus = (event) => {
		const rect = event.currentTarget.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) return;
		controller.patchDraft({ art: {
			focusX: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
			focusY: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
		} });
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		className: "dsh-theme-editor",
		"aria-labelledby": "dsh-theme-editor-title",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
				className: "dsh-theme-editor__header",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsh-theme-eyebrow",
						children: "LIVE PREVIEW"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						id: "dsh-theme-editor-title",
						children: "编辑主题"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "所有变化会立即预览，保存前不会覆盖原主题。" })
				] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "dsh-theme-editor__status",
					children: editor.mode === "create" ? "新主题" : "编辑本地主题"
				})]
			}),
			error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dsh-theme-notice",
				role: "alert",
				children: error
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-theme-editor__layout",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-theme-editor__preview",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dsh-theme-focus dsh-theme-button",
						"aria-label": "选择图片焦点",
						onPointerDown: moveFocus,
						style: {
							backgroundImage: `linear-gradient(rgba(0,0,0,.08),rgba(0,0,0,.18)),url("${editor.backgroundDataUrl}")`,
							backgroundPosition: `${editor.draft.art.focusX * 100}% ${editor.draft.art.focusY * 100}%`,
							filter: `brightness(${editor.draft.effects.brightness})`
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-theme-focus__marker",
							style: {
								left: `${editor.draft.art.focusX * 100}%`,
								top: `${editor.draft.art.focusY * 100}%`
							}
						})
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "点击画面设置构图焦点" })]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-theme-editor__controls",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: "dsh-theme-field",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "主题名称" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: "dsh-theme-input",
								value: editor.draft.name,
								maxLength: 48,
								"aria-invalid": editor.draft.name.trim().length === 0,
								onChange: (event) => controller.patchDraft({ name: event.currentTarget.value })
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-theme-field",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "强调色" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-theme-color-row",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-theme-sr-only",
									children: "强调色选择器"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "color",
									className: "dsh-theme-color",
									value: /^#[0-9a-fA-F]{6}$/.test(editor.draft.colors.accent) ? editor.draft.colors.accent : "#4f8cff",
									onChange: (event) => controller.patchDraft({ colors: { accent: event.currentTarget.value } })
								})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "dsh-theme-color-text",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dsh-theme-sr-only",
										children: "强调色十六进制值"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: "dsh-theme-input",
										"aria-label": "强调色十六进制值",
										value: editor.draft.colors.accent,
										"aria-invalid": !/^#[0-9a-fA-F]{6}$/.test(editor.draft.colors.accent),
										onChange: (event) => controller.patchDraft({ colors: { accent: event.currentTarget.value } })
									})]
								})]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RangeField, {
							label: "图片亮度",
							value: editor.draft.effects.brightness,
							min: .35,
							max: 1.2,
							step: .01,
							format: (value) => `${Math.round(value * 100)}%`,
							onChange: (brightness) => controller.patchDraft({ effects: { brightness } })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RangeField, {
							label: "面板透明度",
							value: editor.draft.effects.panelOpacity,
							min: .4,
							max: .96,
							step: .01,
							format: (value) => `${Math.round(value * 100)}%`,
							onChange: (panelOpacity) => controller.patchDraft({ effects: { panelOpacity } })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RangeField, {
							label: "背景模糊",
							value: editor.draft.effects.blur,
							min: 0,
							max: 32,
							step: 1,
							format: (value) => `${value}px`,
							onChange: (blur) => controller.patchDraft({ effects: { blur } })
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
				className: "dsh-theme-editor__footer",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "dsh-theme-button dsh-theme-button--quiet",
					onClick: () => {
						controller.cancelEditor();
					},
					disabled: editor.saving,
					children: "取消编辑"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "dsh-theme-button dsh-theme-button--primary",
					onClick: () => {
						controller.saveEditor();
					},
					disabled: !valid || editor.saving,
					children: editor.saving ? "正在保存…" : "保存主题"
				})]
			})
		]
	});
}
function RangeField({ label, value, min, max, step, format, onChange }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
		className: "dsh-theme-field dsh-theme-range",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [label, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("output", { children: format(value) })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
			className: "dsh-theme-input",
			type: "range",
			min,
			max,
			step,
			value,
			onChange: (event) => onChange(Number(event.currentTarget.value))
		})]
	});
}

//#endregion
//#region src/client.tsx
const inject = [
	"slots",
	"theme",
	"sessions"
];
function apply(ctx) {
	const bridge = createThemeBridge();
	const renderer = new ThemeRenderer(ctx.theme, ctx.sessions);
	const controller = new ThemeController(bridge, renderer);
	ctx.effect(() => {
		controller.load();
		return () => {
			controller.dispose();
			renderer.dispose();
		};
	}, "dsh-studio-themes: desktop theme lifecycle");
	function StudioThemeSection() {
		return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ThemeSettingsSection, { controller });
	}
	ctx.slots.inject("settings.general.item", () => ctx.slots.register({
		name: "settings.general.item",
		id: "dsh-studio-themes",
		order: 90
	}, StudioThemeSection));
}

//#endregion
exports.apply = apply;
exports.inject = inject;
return module.exports; } });