import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";

type RunState = "running" | "done" | "error";
interface Run { id: number; title: string; lines: { text: string; err: boolean }[]; state: RunState; ts: number; }

const root = document.getElementById("root")!;
const threadsEl = document.getElementById("threads")!;
const stageTitle = document.getElementById("stage-title")!;
const statusText = document.getElementById("status-text")!;
const elapsedEl = document.getElementById("elapsed")!;
const heroEl = document.getElementById("hero")!;
const tInner = document.getElementById("t-inner")!;
const uMsg = document.getElementById("u-msg")!;
const aOut = document.getElementById("a-out")!;
const content = document.getElementById("content")!;
const taskInput = document.getElementById("task") as HTMLTextAreaElement;
const btnRun = document.getElementById("btn-run") as HTMLButtonElement;
const btnDump = document.getElementById("btn-dump") as HTMLButtonElement;
const btnNew = document.getElementById("btn-new") as HTMLButtonElement;
const permSel = document.getElementById("perm") as HTMLSelectElement;

const runs: Run[] = [];
let current: Run | null = null;
let viewing: Run | null = null;
let seq = 0;
let timer: number | undefined;
let startedAt = 0;

function ago(ts: number): string {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return "刚刚";
  if (s < 3600) return Math.floor(s / 60) + "分钟前";
  if (s < 86400) return Math.floor(s / 3600) + "小时前";
  return Math.floor(s / 86400) + "天前";
}

function setChip(state: "idle" | RunState, label: string) {
  root.dataset.state = state;
  statusText.textContent = label;
}

function renderThreads() {
  threadsEl.textContent = "";
  if (!runs.length) {
    threadsEl.innerHTML = '<div class="threads-empty">还没有会话</div>';
    return;
  }
  for (const r of [...runs].reverse()) {
    const b = document.createElement("button");
    b.className = "thread-item" + (viewing === r ? " active" : "");
    b.innerHTML = `<span class="st" data-s="${r.state}"></span><span class="t"></span><span class="ago"></span>`;
    (b.querySelector(".t") as HTMLElement).textContent = r.title;
    (b.querySelector(".ago") as HTMLElement).textContent = ago(r.ts);
    b.addEventListener("click", () => view(r));
    threadsEl.appendChild(b);
  }
}

function renderOut(r: Run) {
  aOut.textContent = "";
  for (const l of r.lines) {
    const el = document.createElement("span");
    if (l.err) el.className = "err";
    el.textContent = l.text + "\n";
    aOut.appendChild(el);
  }
  content.scrollTop = content.scrollHeight;
}

function view(r: Run) {
  viewing = r;
  heroEl.hidden = true;
  tInner.hidden = false;
  stageTitle.textContent = r.title;
  uMsg.textContent = r.title;
  setChip(r.state, r.state === "running" ? "运行中" : r.state === "done" ? "完成" : "失败");
  renderOut(r);
  renderThreads();
}

function showIdle() {
  viewing = null;
  heroEl.hidden = false;
  tInner.hidden = true;
  stageTitle.textContent = "";
  elapsedEl.textContent = "";
  setChip("idle", "待命");
  renderThreads();
  taskInput.focus();
}

function finish(state: RunState, label?: string) {
  if (!current) return;
  current.state = state;
  if (viewing === current) setChip(state, label ?? (state === "done" ? "完成" : "失败"));
  if (timer !== undefined) { clearInterval(timer); timer = undefined; }
  btnDump.disabled = false;
  current = null;
  renderThreads();
}

/* 输出按帧批量渲染:大量流式行不逐行刷 DOM,避免主线程卡死拖拽/滚动 */
let pendingLines: { text: string; err: boolean }[] = [];
let flushScheduled = false;
function flushLines() {
  flushScheduled = false;
  if (!pendingLines.length) return;
  const frag = document.createDocumentFragment();
  for (const l of pendingLines) {
    const el = document.createElement("span");
    if (l.err) el.className = "err";
    el.textContent = l.text + "\n";
    frag.appendChild(el);
  }
  pendingLines = [];
  aOut.appendChild(frag);
  content.scrollTop = content.scrollHeight;
}

listen<string>("dsh-line", (e) => {
  if (!current) return;
  const line = e.payload;
  if (line === "[exit]") { finish("done"); return; }
  const err = line.startsWith("[err]");
  current.lines.push({ text: line, err });
  if (viewing === current) {
    pendingLines.push({ text: line, err });
    if (!flushScheduled) {
      flushScheduled = true;
      requestAnimationFrame(flushLines);
    }
  }
});

function run(args: string[], title: string) {
  const r: Run = { id: ++seq, title, lines: [], state: "running", ts: Date.now() };
  runs.push(r);
  current = r;
  view(r);
  setChip("running", "运行中");
  btnDump.disabled = true;
  startedAt = performance.now();
  elapsedEl.textContent = "0.0s";
  timer = window.setInterval(() => {
    elapsedEl.textContent = ((performance.now() - startedAt) / 1000).toFixed(1) + "s";
  }, 100);
  invoke("run_dsh", { args, mode: permSel.value }).catch((err) => {
    r.lines.push({ text: "invoke error: " + err, err: true });
    if (viewing === r) renderOut(r);
    finish("error");
  });
}

btnRun.addEventListener("click", () => {
  if (root.dataset.state === "running") {
    invoke("stop_dsh").catch(() => {});
    if (current) {
      current.lines.push({ text: "—— 已被用户停止 ——", err: true });
      if (viewing === current) renderOut(current);
    }
    finish("error", "已停止");
    return;
  }
  const task = taskInput.value.trim();
  if (!task) { taskInput.focus(); return; }
  taskInput.value = "";
  autosize();
  run(["--profile", "headless", task], task);
});
btnDump.addEventListener("click", () => {
  if (root.dataset.state === "running") return;
  run(["--profile", "headless", "--dump-default-config"], "运行时配置");
});
btnNew.addEventListener("click", showIdle);

taskInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && root.dataset.state !== "running") {
    e.preventDefault();
    btnRun.click();
  }
});
function autosize() {
  taskInput.style.height = "auto";
  taskInput.style.height = Math.min(taskInput.scrollHeight, 140) + "px";
}
taskInput.addEventListener("input", autosize);

for (const card of document.querySelectorAll<HTMLButtonElement>(".card")) {
  card.addEventListener("click", () => {
    taskInput.value = card.dataset.fill ?? "";
    autosize();
    taskInput.focus();
    const pos = taskInput.value.indexOf("「」");
    if (pos >= 0) taskInput.setSelectionRange(pos + 1, pos + 1);
  });
}

/* ── 模型设置 ── */
const modal = document.getElementById("modal")!;
const modelChip = document.getElementById("model-chip") as HTMLButtonElement;
const modelLabel = document.getElementById("model-label")!;
const mKind = document.getElementById("m-kind") as HTMLSelectElement;
const mBaseRow = document.getElementById("m-base-row")!;
const mBase = document.getElementById("m-base") as HTMLInputElement;
const mKey = document.getElementById("m-key") as HTMLInputElement;
const mModel = document.getElementById("m-model") as HTMLInputElement;

interface ModelConfig { kind: string; base_url: string; model: string; api_key_set: boolean; }

function applyModelLabel(cfg: ModelConfig | null) {
  if (cfg && cfg.model) {
    modelLabel.textContent = cfg.model;
    modelChip.classList.remove("unset");
  } else if (cfg && cfg.kind === "deepseek") {
    modelLabel.textContent = "deepseek-v4-flash";
    modelChip.classList.remove("unset");
  } else {
    modelLabel.textContent = "配置模型…";
    modelChip.classList.add("unset");
  }
}

function syncKindUI() {
  mBaseRow.style.display = mKind.value === "deepseek" ? "none" : "block";
}
mKind.addEventListener("change", syncKindUI);

modelChip.addEventListener("click", async () => {
  const cfg = await invoke<ModelConfig | null>("load_model_config").catch(() => null);
  if (cfg) {
    mKind.value = cfg.kind;
    mBase.value = cfg.base_url;
    mModel.value = cfg.model;
    mKey.value = "";
    mKey.placeholder = cfg.api_key_set ? "已保存,留空则不变" : "sk-…";
  }
  syncKindUI();
  modal.hidden = false;
  (mKind.value === "deepseek" ? mKey : mBase).focus();
});
document.getElementById("m-cancel")!.addEventListener("click", () => { modal.hidden = true; });
modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });

document.getElementById("m-save")!.addEventListener("click", async () => {
  const kind = mKind.value;
  const baseUrl = mBase.value.trim();
  const model = mModel.value.trim();
  const apiKey = mKey.value.trim();
  if (kind !== "deepseek" && (!baseUrl || !model)) { alert("接口地址和模型 ID 必填"); return; }
  try {
    await invoke("save_model_config", { kind, baseUrl, model, apiKey });
    applyModelLabel({ kind, base_url: baseUrl, model, api_key_set: true });
    modal.hidden = true;
  } catch (e) {
    alert("保存失败: " + e);
  }
});

/* 领 key 教程:选供应商即预填表单;链接待换成推荐官邀请码版(TODO) */
const guide = document.getElementById("guide")!;
const tabSilicon = document.getElementById("tab-silicon")!;
const tabDeepseek = document.getElementById("tab-deepseek")!;
const gSilicon = document.getElementById("g-silicon")!;
const gDeepseek = document.getElementById("g-deepseek")!;

document.getElementById("toggle-guide")!.addEventListener("click", () => {
  guide.hidden = !guide.hidden;
  if (!guide.hidden) pickSilicon();
});
function pickSilicon() {
  tabSilicon.classList.add("active"); tabDeepseek.classList.remove("active");
  gSilicon.hidden = false; gDeepseek.hidden = true;
  mKind.value = "openai";
  if (!mBase.value) mBase.value = "https://api.siliconflow.cn/v1";
  syncKindUI();
}
function pickDeepseek() {
  tabDeepseek.classList.add("active"); tabSilicon.classList.remove("active");
  gDeepseek.hidden = false; gSilicon.hidden = true;
  mKind.value = "deepseek";
  syncKindUI();
}
tabSilicon.addEventListener("click", pickSilicon);
tabDeepseek.addEventListener("click", pickDeepseek);
document.getElementById("g-s-open")!.addEventListener("click", () => openUrl("https://cloud.siliconflow.cn"));
document.getElementById("g-s-keys")!.addEventListener("click", () => openUrl("https://cloud.siliconflow.cn/account/ak"));
document.getElementById("g-s-models")!.addEventListener("click", () => openUrl("https://cloud.siliconflow.cn/models"));
document.getElementById("g-d-open")!.addEventListener("click", () => openUrl("https://platform.deepseek.com"));
document.getElementById("g-d-keys")!.addEventListener("click", () => openUrl("https://platform.deepseek.com/api_keys"));

invoke<ModelConfig | null>("load_model_config").then(applyModelLabel).catch(() => {});

setInterval(renderThreads, 60_000);
showIdle();
