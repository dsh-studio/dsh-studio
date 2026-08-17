import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const out = document.getElementById("out")!;
const status = document.getElementById("status")!;
const statusText = document.getElementById("status-text")!;
const taskInput = document.getElementById("task") as HTMLInputElement;
const btnRun = document.getElementById("btn-run") as HTMLButtonElement;
const btnDump = document.getElementById("btn-dump") as HTMLButtonElement;

function setState(state: "idle" | "running" | "done" | "error", label: string) {
  status.dataset.state = state;
  statusText.textContent = label;
  const busy = state === "running";
  btnRun.disabled = busy;
  btnDump.disabled = busy;
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

function run(args: string[], label: string) {
  out.textContent = "";
  setState("running", label);
  invoke("run_dsh", { args }).catch((e) => {
    setState("error", "启动失败");
    out.textContent = "invoke error: " + e;
  });
}

btnDump.addEventListener("click", () =>
  run(["--profile", "headless", "--dump-default-config"], "读取配置树…"),
);
btnRun.addEventListener("click", () => {
  const task = taskInput.value.trim() || "用一句话介绍你自己";
  run(["--profile", "headless", task], "运行中…");
});
taskInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !btnRun.disabled) btnRun.click();
});
