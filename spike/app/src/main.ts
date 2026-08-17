import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type RunState = "running" | "done" | "error";
interface Run { id: number; title: string; lines: { text: string; err: boolean }[]; state: RunState; }

const root = document.getElementById("root")!;
const threadsEl = document.getElementById("threads")!;
const stageTitle = document.getElementById("stage-title")!;
const statusText = document.getElementById("status-text")!;
const elapsedEl = document.getElementById("elapsed")!;
const idleEl = document.getElementById("idle")!;
const tInner = document.getElementById("t-inner")!;
const uMsg = document.getElementById("u-msg")!;
const aOut = document.getElementById("a-out")!;
const transcript = document.getElementById("transcript")!;
const taskInput = document.getElementById("task") as HTMLInputElement;
const btnRun = document.getElementById("btn-run") as HTMLButtonElement;
const btnDump = document.getElementById("btn-dump") as HTMLButtonElement;
const btnNew = document.getElementById("btn-new") as HTMLButtonElement;

const runs: Run[] = [];
let current: Run | null = null;
let viewing: Run | null = null;
let seq = 0;
let timer: number | undefined;
let startedAt = 0;

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
    b.innerHTML = `<span class="st" data-s="${r.state}"></span><span class="t"></span>`;
    (b.querySelector(".t") as HTMLElement).textContent = r.title;
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
  transcript.scrollTop = transcript.scrollHeight;
}

function view(r: Run) {
  viewing = r;
  idleEl.hidden = true;
  tInner.hidden = false;
  stageTitle.textContent = r.title;
  uMsg.textContent = r.title;
  setChip(r.state, r.state === "running" ? "运行中" : r.state === "done" ? "完成" : "失败");
  renderOut(r);
  renderThreads();
}

function showIdle() {
  viewing = null;
  idleEl.hidden = false;
  tInner.hidden = true;
  stageTitle.textContent = "新任务";
  elapsedEl.textContent = "";
  setChip("idle", "待命");
  renderThreads();
  taskInput.focus();
}

function finish(state: RunState) {
  if (!current) return;
  current.state = state;
  if (viewing === current) setChip(state, state === "done" ? "完成" : "失败");
  if (timer !== undefined) { clearInterval(timer); timer = undefined; }
  btnRun.disabled = false;
  btnDump.disabled = false;
  current = null;
  renderThreads();
}

listen<string>("dsh-line", (e) => {
  if (!current) return;
  const line = e.payload;
  if (line === "[exit]") { finish("done"); return; }
  const err = line.startsWith("[err]");
  current.lines.push({ text: line, err });
  if (viewing === current) {
    const el = document.createElement("span");
    if (err) el.className = "err";
    el.textContent = line + "\n";
    aOut.appendChild(el);
    transcript.scrollTop = transcript.scrollHeight;
  }
});

function run(args: string[], title: string) {
  const r: Run = { id: ++seq, title, lines: [], state: "running" };
  runs.push(r);
  current = r;
  view(r);
  setChip("running", "运行中");
  btnRun.disabled = true;
  btnDump.disabled = true;
  startedAt = performance.now();
  elapsedEl.textContent = "0.0s";
  timer = window.setInterval(() => {
    elapsedEl.textContent = ((performance.now() - startedAt) / 1000).toFixed(1) + "s";
  }, 100);
  invoke("run_dsh", { args }).catch((err) => {
    r.lines.push({ text: "invoke error: " + err, err: true });
    if (viewing === r) renderOut(r);
    finish("error");
  });
}

btnRun.addEventListener("click", () => {
  const task = taskInput.value.trim();
  if (!task) { taskInput.focus(); return; }
  taskInput.value = "";
  run(["--profile", "headless", task], task);
});
btnDump.addEventListener("click", () => run(["--profile", "headless", "--dump-default-config"], "查看配置树"));
btnNew.addEventListener("click", showIdle);
taskInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !btnRun.disabled) btnRun.click();
});

showIdle();
