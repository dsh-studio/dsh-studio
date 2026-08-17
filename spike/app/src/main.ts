import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const root = document.getElementById("root")!;
const out = document.getElementById("out")!;
const statusText = document.getElementById("status-text")!;
const taskEcho = document.getElementById("task-echo")!;
const elapsedEl = document.getElementById("elapsed")!;
const taskInput = document.getElementById("task") as HTMLInputElement;
const btnRun = document.getElementById("btn-run") as HTMLButtonElement;
const btnDump = document.getElementById("btn-dump") as HTMLButtonElement;

let timer: number | undefined;
let startedAt = 0;

function setState(state: "idle" | "running" | "done" | "error", label: string) {
  root.dataset.state = state;
  statusText.textContent = label;
  const busy = state === "running";
  btnRun.disabled = busy;
  btnDump.disabled = busy;
  if (busy) {
    startedAt = performance.now();
    timer = window.setInterval(() => {
      elapsedEl.textContent = ((performance.now() - startedAt) / 1000).toFixed(1) + "s";
    }, 100);
  } else if (timer !== undefined) {
    clearInterval(timer);
    timer = undefined;
  }
}

listen<string>("dsh-line", (e) => {
  const line = e.payload;
  if (line === "[exit]") {
    setState("done", "完成");
    return;
  }
  const el = document.createElement("span");
  if (line.startsWith("[err]")) el.className = "err";
  el.textContent = line + "\n";
  out.appendChild(el);
  out.scrollTop = out.scrollHeight;
});

function run(args: string[], label: string, echo: string) {
  out.textContent = "";
  taskEcho.textContent = echo;
  elapsedEl.textContent = "0.0s";
  setState("running", label);
  invoke("run_dsh", { args }).catch((e) => {
    setState("error", "启动失败");
    out.textContent = "invoke error: " + e;
  });
}

btnDump.addEventListener("click", () =>
  run(["--profile", "headless", "--dump-default-config"], "读取中", "dsh --dump-default-config"),
);
btnRun.addEventListener("click", () => {
  const task = taskInput.value.trim() || "用一句话介绍你自己";
  run(["--profile", "headless", task], "运行中", task);
});
taskInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !btnRun.disabled) btnRun.click();
});
