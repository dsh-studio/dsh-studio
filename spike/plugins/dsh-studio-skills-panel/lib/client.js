window.__ModuleLoader__.load({ id: "dsh-studio-skills-panel", factory: (require) => {
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

//#region src/client.tsx
const SKILLS = [
	{
		id: "file-organizer-zh",
		title: "整理文件夹",
		hint: "先出方案再动手,绝不误删",
		detail: "扫描目标目录后先给出分类方案等确认,只移动不删除,同名自动改名,隐藏文件不动。",
		prefill: "/file-organizer-zh 帮我整理下载文件夹",
		iconPath: "M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2h9A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z"
	},
	{
		id: "research-report-zh",
		title: "调研报告",
		hint: "多来源交叉核验,结论带引用",
		detail: "把问题拆成可检索的小问题,多角度搜索并交叉验证,产出带来源清单的 Markdown 报告,事实与推断分开标注。",
		prefill: "/research-report-zh 帮我调研:",
		iconPath: "M7 3.5h7L18.5 8v12a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1zM14 3.5V8h4.5M9.5 12h5M9.5 15.5h5"
	},
	{
		id: "spreadsheet-zh",
		title: "处理表格",
		hint: "清洗汇总,数字验证后交付",
		detail: "CSV/Excel 清洗、合并、汇总、透视。原文件只读、输出新文件,汇总数字抽查复算后才交付,敏感号码默认脱敏。",
		prefill: "/spreadsheet-zh 把这个表按月汇总:",
		iconPath: "M4 5.5h16v13H4zM4 10h16M9.5 10v8.5M15 10v8.5"
	}
];
const wrapStyle = {
	display: "flex",
	gap: "8px",
	flexWrap: "wrap",
	justifyContent: "center",
	paddingBottom: "2px"
};
const cardStyle = {
	display: "flex",
	alignItems: "flex-start",
	gap: "8px",
	padding: "9px 12px",
	borderRadius: "12px",
	border: "1px solid var(--dsw-alias-border-l1)",
	background: "var(--dsw-alias-bg-layer-1)",
	color: "var(--dsw-alias-label-primary)",
	cursor: "pointer",
	textAlign: "left",
	maxWidth: "220px"
};
const cardTitleStyle = {
	fontSize: "13px",
	fontWeight: 500,
	lineHeight: "18px"
};
const cardHintStyle = {
	fontSize: "12px",
	lineHeight: "16px",
	marginTop: "1px",
	color: "var(--dsw-alias-label-secondary)",
	display: "block"
};
function SkillIcon({ path, size = 16 }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "var(--dsw-alias-label-secondary)",
		strokeWidth: 1.6,
		strokeLinecap: "round",
		strokeLinejoin: "round",
		style: {
			flex: "none",
			marginTop: "2px"
		},
		"aria-hidden": true,
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: path })
	});
}
function SkillCards(props) {
	const conversationEmpty = (props.session?.nodes?.length ?? 0) === 0;
	const draftEmpty = (props.input?.draft ?? "") === "";
	const setDraft = props.inputActions?.setDraft;
	if (!conversationEmpty || !draftEmpty || setDraft === void 0) return null;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		style: wrapStyle,
		"data-testid": "dsh-studio-skills-panel",
		children: SKILLS.map((skill) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
			type: "button",
			className: "dshstudio-skill-card",
			style: cardStyle,
			onClick: () => {
				setDraft(skill.prefill);
			},
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillIcon, { path: skill.iconPath }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				style: cardTitleStyle,
				children: skill.title
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				style: cardHintStyle,
				children: skill.hint
			})] })]
		}, skill.id))
	});
}
const sectionTitleStyle = {
	fontSize: "18px",
	fontWeight: 600,
	color: "var(--dsw-alias-label-primary)"
};
const sectionDescStyle = {
	fontSize: "13px",
	marginTop: "6px",
	marginBottom: "18px",
	color: "var(--dsw-alias-label-secondary)"
};
const skillRowStyle = {
	display: "flex",
	alignItems: "flex-start",
	gap: "12px",
	padding: "14px 16px",
	borderRadius: "12px",
	border: "1px solid var(--dsw-alias-border-l1)",
	background: "var(--dsw-alias-bg-layer-1)",
	marginBottom: "10px"
};
const slugStyle = {
	fontFamily: "ui-monospace, SFMono-Regular, monospace",
	fontSize: "12px",
	padding: "2px 8px",
	borderRadius: "6px",
	background: "var(--dsw-alias-bg-layer-2)",
	color: "var(--dsw-alias-label-secondary)"
};
const copyBtnStyle = {
	flex: "none",
	padding: "6px 12px",
	borderRadius: "9px",
	fontSize: "12.5px",
	cursor: "pointer",
	border: "1px solid var(--dsw-alias-border-l1)",
	background: "var(--dsw-alias-bg-layer-1)",
	color: "var(--dsw-alias-label-primary)",
	whiteSpace: "nowrap"
};
function SkillRow({ skill }) {
	const [copied, setCopied] = (0, react.useState)(false);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		style: skillRowStyle,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillIcon, {
				path: skill.iconPath,
				size: 18
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					flex: 1,
					minWidth: 0
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: "8px",
						flexWrap: "wrap"
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							fontSize: "14px",
							fontWeight: 500,
							color: "var(--dsw-alias-label-primary)"
						},
						children: skill.title
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: slugStyle,
						children: ["/", skill.id]
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						fontSize: "12.5px",
						lineHeight: "18px",
						marginTop: "5px",
						color: "var(--dsw-alias-label-secondary)"
					},
					children: skill.detail
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: "dshstudio-skill-card",
				style: copyBtnStyle,
				onClick: () => {
					navigator.clipboard.writeText(`/${skill.id} `).then(() => {
						setCopied(true);
						window.setTimeout(() => {
							setCopied(false);
						}, 1500);
					});
				},
				children: copied ? "已复制" : "复制触发词"
			})
		]
	});
}
function SkillsSection(_props) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		"data-testid": "dsh-studio-skills-section",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: sectionTitleStyle,
				children: "技能"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: sectionDescStyle,
				children: [
					"DSH Studio 内置的中文技能。新会话页点击建议卡即可使用;也可以在输入框输入",
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							...slugStyle,
							margin: "0 4px"
						},
						children: "/"
					}),
					"唤出全部技能列表。"
				]
			}),
			SKILLS.map((skill) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillRow, { skill }, skill.id)),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					fontSize: "12px",
					marginTop: "14px",
					color: "var(--dsw-alias-label-secondary)"
				},
				children: "技能文件位于数据目录 skills/ 下,新增自定义技能后重启应用即可生效。"
			})
		]
	});
}
/** hover 态与 hero 排序(内联 style 做不了伪类/兄弟重排)。 */
function injectStudioStyles() {
	const tagId = "dsh-studio-skills-panel/styles";
	if (document.querySelector(`style[data-plugin-css="${tagId}"]`) !== null) return;
	const tag = document.createElement("style");
	tag.dataset.plugin = "dsh-studio-skills-panel";
	tag.dataset.pluginCss = tagId;
	tag.textContent = [
		".dshstudio-skill-card:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);}",
		"[class*=\"composerHero\"]>[class*=\"heroWorkspaceRow\"]{order:1;}",
		"[class*=\"composerHero\"]>div>[class*=\"_hero\"]{order:2;}",
		"[class*=\"composerHero\"] [data-testid=\"dsh-studio-skills-panel\"]{order:0;margin-bottom:2px;}"
	].join("\n");
	document.head.appendChild(tag);
}
const inject = ["slots"];
function apply(ctx) {
	injectStudioStyles();
	ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
		name: "conversation.input.dock",
		id: "dsh-studio-skills",
		order: 5
	}, SkillCards));
	ctx.slots.inject("settings.section", () => ctx.slots.register({
		name: "settings.section",
		id: "dsh-studio-skills",
		order: 16,
		label: () => "技能"
	}, SkillsSection));
}

//#endregion
exports.apply = apply;
exports.inject = inject;
return module.exports; } });