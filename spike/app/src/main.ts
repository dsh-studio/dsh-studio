import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const out = document.getElementById("out")!;
listen<string>("dsh-line", (e) => {
  out.textContent += e.payload + "\n";
  out.scrollTop = out.scrollHeight;
});

document.getElementById("btn-dump")!.addEventListener("click", () => {
  out.textContent = "";
  invoke("run_dsh", { args: ["--profile", "headless", "--dump-default-config"] })
    .catch((e) => { out.textContent = "invoke error: " + e; });
});
document.getElementById("btn-task")!.addEventListener("click", () => {
  out.textContent = "";
  invoke("run_dsh", { args: ["--profile", "headless", "用一句话介绍你自己"] })
    .catch((e) => { out.textContent = "invoke error: " + e; });
});
