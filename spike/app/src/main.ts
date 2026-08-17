import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

type RunState = "running" | "done" | "error";
interface Run {
  id: number; title: string;
  lines: { text: string; err: boolean }[];
  state: RunState; ts: number;
  kind: "task" | "diag";
}

const root = document.getElementById("root")!;
const threadsEl = document.getElementById("threads")!;
const stageTitle = document.getElementById("stage-title")!;
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

function ago(ts: number): string {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return "刚刚";
  if (s < 3600) return Math.floor(s / 60) + "分钟前";
  if (s < 86400) return Math.floor(s / 3600) + "小时前";
  return Math.floor(s / 86400) + "天前";
}

function setState(state: "idle" | RunState) {
  root.dataset.state = state;
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

/* ── 安全 Markdown 渲染(纯 DOM 构建,textContent 赋值,无 innerHTML 注入面) ── */
function inline(text: string): Node[] {
  const nodes: Node[] = [];
  for (const part of text.split(/(`[^`]+`)/)) {
    if (/^`[^`]+`$/.test(part)) {
      const c = document.createElement("code");
      c.textContent = part.slice(1, -1);
      nodes.push(c);
    } else {
      for (const b of part.split(/(\*\*[^*]+\*\*)/)) {
        if (/^\*\*[^*]+\*\*$/.test(b)) {
          const s = document.createElement("strong");
          s.textContent = b.slice(2, -2);
          nodes.push(s);
        } else if (b) nodes.push(document.createTextNode(b));
      }
    }
  }
  return nodes;
}

function renderMarkdown(text: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  let list: HTMLElement | null = null;
  let listType = "";
  let code: string[] | null = null;
  const closeList = () => { if (list) { frag.appendChild(list); list = null; listType = ""; } };
  for (const line of text.split("\n")) {
    if (code) {
      if (/^\s*```/.test(line)) {
        const pre = document.createElement("pre");
        pre.className = "md-pre";
        pre.textContent = code.join("\n");
        frag.appendChild(pre);
        code = null;
      } else code.push(line);
      continue;
    }
    if (/^\s*```/.test(line)) { closeList(); code = []; continue; }
    const h = line.match(/^(#{1,3})\s+(.*)/);
    if (h) {
      closeList();
      const el = document.createElement("div");
      el.className = "md-h md-h" + h[1].length;
      el.append(...inline(h[2]));
      frag.appendChild(el);
      continue;
    }
    const ul = line.match(/^\s*[-*]\s+(.*)/);
    const ol = ul ? null : line.match(/^\s*\d+[.、)]\s+(.*)/);
    if (ul || ol) {
      const type = ul ? "ul" : "ol";
      if (!list || listType !== type) { closeList(); list = document.createElement(type); listType = type; }
      const li = document.createElement("li");
      li.append(...inline((ul ?? ol)![1]));
      list.appendChild(li);
      continue;
    }
    if (!line.trim()) { closeList(); continue; }
    closeList();
    const p = document.createElement("p");
    p.className = "md-p";
    p.append(...inline(line));
    frag.appendChild(p);
  }
  closeList();
  if (code) {
    const pre = document.createElement("pre");
    pre.className = "md-pre";
    pre.textContent = code.join("\n");
    frag.appendChild(pre);
  }
  return frag;
}

/* ── 输出渲染:diag=等宽原文;task=正文排版 + <think> 折叠抽屉 ── */
function renderOut(r: Run) {
  aOut.className = r.kind === "diag" ? "a-out mono" : "a-out prose";
  aOut.textContent = "";
  const frag = document.createDocumentFragment();

  if (r.kind === "diag") {
    for (const l of r.lines) {
      const el = document.createElement("span");
      if (l.err) el.className = "err";
      el.textContent = l.text + "\n";
      frag.appendChild(el);
    }
  } else {
    let normal = "";
    let think = "";
    let inThink = false;
    const flushNormal = () => {
      const t = normal.replace(/^\n+/, "");
      if (t.trim()) frag.appendChild(renderMarkdown(t));
      normal = "";
    };
    const flushThink = (open: boolean) => {
      if (think.trim()) {
        const det = document.createElement("details");
        det.className = "think";
        det.open = open;
        const sum = document.createElement("summary");
        sum.textContent = "思考过程";
        det.appendChild(sum);
        const div = document.createElement("div");
        div.textContent = think.trim();
        det.appendChild(div);
        frag.appendChild(det);
      }
      think = "";
    };
    for (const l of r.lines) {
      if (l.err) {
        flushNormal();
        const e = document.createElement("div");
        e.className = "err";
        e.textContent = l.text.replace(/^\[err\]\s?/, "");
        frag.appendChild(e);
        continue;
      }
      let text = l.text + "\n";
      while (text.length) {
        if (!inThink) {
          const m = text.match(/<think(?:ing)?>/i);
          if (!m || m.index === undefined) { normal += text; text = ""; }
          else {
            normal += text.slice(0, m.index);
            flushNormal();
            inThink = true;
            text = text.slice(m.index + m[0].length);
          }
        } else {
          const m = text.match(/<\/think(?:ing)?>/i);
          if (!m || m.index === undefined) { think += text; text = ""; }
          else {
            think += text.slice(0, m.index);
            flushThink(false);
            inThink = false;
            text = text.slice(m.index + m[0].length);
          }
        }
      }
    }
    if (inThink) flushThink(true);
    flushNormal();
  }
  aOut.appendChild(frag);
  content.scrollTop = content.scrollHeight;
}

function view(r: Run) {
  viewing = r;
  heroEl.hidden = true;
  tInner.hidden = false;
  stageTitle.textContent = r.title;
  uMsg.textContent = r.title;
  setState(r.state);
  renderOut(r);
  renderThreads();
}

function showIdle() {
  viewing = null;
  heroEl.hidden = false;
  tInner.hidden = true;
  stageTitle.textContent = "";
  setState("idle");
  renderThreads();
  taskInput.focus();
}

function finish(state: RunState) {
  if (!current) return;
  current.state = state;
  if (viewing === current) setState(state);
  btnDump.disabled = false;
  current = null;
  renderThreads();
}

/* 流式:行进 run.lines,按帧整体重渲(答案体量小,重渲比增量简单可靠) */
let flushScheduled = false;
function scheduleRender() {
  if (flushScheduled) return;
  flushScheduled = true;
  requestAnimationFrame(() => {
    flushScheduled = false;
    if (viewing) renderOut(viewing);
  });
}

listen<string>("dsh-line", (e) => {
  if (!current) return;
  const line = e.payload;
  if (line === "[exit]") { finish("done"); return; }
  current.lines.push({ text: line, err: line.startsWith("[err]") });
  if (viewing === current) scheduleRender();
});

function run(args: string[], title: string, kind: "task" | "diag" = "task") {
  const r: Run = { id: ++seq, title, lines: [], state: "running", ts: Date.now(), kind };
  runs.push(r);
  current = r;
  view(r);
  setState("running");
  btnDump.disabled = true;
  invoke("run_dsh", { args, mode: permSel.value, cwd: workDir }).catch((err) => {
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
    finish("error");
    return;
  }
  const task = taskInput.value.trim();
  if (!task) { taskInput.focus(); return; }
  taskInput.value = "";
  autosize();
  run(["--profile", "headless", task], task, "task");
});
btnDump.addEventListener("click", () => {
  if (root.dataset.state === "running") return;
  run(["--profile", "headless", "--dump-default-config"], "运行诊断", "diag");
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

/* ── 工作目录选择(= dsh 沙箱工作区) ── */
const dirLabel = document.getElementById("dir-label")!;
let workDir: string = localStorage.getItem("workdir") ?? "";
function applyDirLabel() {
  dirLabel.textContent = workDir ? "工作目录:" + (workDir.split("/").pop() || workDir) : "工作目录:主目录";
}
async function pickWorkDir() {
  const picked = await openDialog({ directory: true, title: "选择 AI 的工作目录", defaultPath: workDir || undefined });
  if (typeof picked === "string" && picked) {
    workDir = picked;
    localStorage.setItem("workdir", workDir);
    applyDirLabel();
  }
}
document.getElementById("btn-dir")!.addEventListener("click", pickWorkDir);
applyDirLabel();

/* ── 设置面板 ── */
const sModal = document.getElementById("s-modal")!;
const sModelV = document.getElementById("s-model-v")!;
const sDirV = document.getElementById("s-dir-v")!;
const sPerm = document.getElementById("s-perm") as HTMLSelectElement;

function refreshSettings() {
  sModelV.textContent = modelLabel.textContent === "配置模型…" ? "未配置" : modelLabel.textContent;
  sDirV.textContent = workDir || "主目录";
  sPerm.value = permSel.value;
}
document.getElementById("btn-settings")!.addEventListener("click", () => {
  refreshSettings();
  sModal.hidden = false;
});
document.getElementById("s-close")!.addEventListener("click", () => { sModal.hidden = true; });
sModal.addEventListener("click", (e) => { if (e.target === sModal) sModal.hidden = true; });
document.getElementById("s-model-btn")!.addEventListener("click", () => {
  sModal.hidden = true;
  modelChip.click();
});
document.getElementById("s-dir-btn")!.addEventListener("click", async () => {
  await pickWorkDir();
  refreshSettings();
});
sPerm.addEventListener("change", () => { permSel.value = sPerm.value; });
document.getElementById("s-diag")!.addEventListener("click", () => {
  sModal.hidden = true;
  btnDump.click();
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
