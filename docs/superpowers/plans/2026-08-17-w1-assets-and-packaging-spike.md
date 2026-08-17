# W1：占位资产 + Tauri Sidecar 打包 Spike — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 注册 DSH Studio 全部命名资产并发布占位内容（技能包/中文指南/预置 profile），同时用一个 Tauri 最小壳证伪"捆绑 Node+dsh 作 sidecar"这一全项目最大技术风险。

**Architecture:** 三个仓库——主仓 `dsh-studio`（Tauri 壳 + spike）、`dsh-studio-skills-zh`（中文技能包）、`dsh-guide-zh`（中文指南）。Spike 代码放 `spike/`，定性为可抛弃验证品，结论落文档后 W2 重写正式结构。dsh 版本全程锁定 `0.1.0-rc.6`（npm latest，已实查）。

**Tech Stack:** Tauri v2（Rust + vanilla-TS 前端）、Node v24.14.0（捆绑 runtime）、pnpm、dsh `0.1.0-rc.6`。

**Timebox:** Spike 部分（Task 6-8）限时 2 天；如资源捆绑卡死超时，落"postinstall 下载 runtime"备选方案并记录，不恋战。

**前置事实（已实查，执行者不必复查）:**
- npm `@deepseek-ai/dsh` latest = `0.1.0-rc.6`。
- dsh 技能 = 目录含 `SKILL.md`（YAML frontmatter：`name`、`description`），用户级技能扫描目录为 `~/.dsh/skills`（另有项目级 `<projectRoot>/.dsh/skills`）。
- 自定义 profile 不会自动初始化（只有 `web`/`headless` 模板会），需手工创建 `$DSH_HOME/profiles/<name>/package.json` + `cordis.patch.yml`，结构照抄 headless 模板。
- `npx @deepseek-ai/dsh` 在含 pnpm workspace 的目录下会解析失败（`sh: dsh: command not found`），必须在干净目录运行——指南第 3 章要写这个坑。
- GitHub org `dsh-studio`、npm 包名 `dsh-studio` 截至 2026-08-17 均为空位；`dsh-desktop` 已被占。

---

### Task 0：注册命名资产（人工操作，阻塞所有 push）

**Files:** 无（浏览器操作 + 终端验证）

- [ ] **Step 1: 注册 GitHub org**

浏览器打开 https://github.com/account/organizations/new （Free plan），org 名填 `dsh-studio`。

- [ ] **Step 2: 验证 org 存在**

```bash
gh api /orgs/dsh-studio --jq .login
```
Expected: `dsh-studio`

- [ ] **Step 3: npm 登录检查**

```bash
npm whoami || npm login
```
Expected: 打印你的 npm 用户名。

（npm 包名占位在 Task 2 通过真实发布完成；域名 `dshstudio.com` / `dsh.studio` 本周内自查注册商，非阻塞项。）

---

### Task 1：主仓库整备

**Files:**
- Create: `/Users/aisenyc/work/dsh-studio/README.md`
- Create: `/Users/aisenyc/work/dsh-studio/LICENSE`
- Create: `/Users/aisenyc/work/dsh-studio/.gitignore`

- [ ] **Step 1: 写 README.md**

```markdown
<div align="center">

# DSH Studio

**桌面上的 AI 数字同事 · Your AI coworker on the desktop**

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的开源桌面工作台。
下载即用，自然语言派活，AI 在本机沙箱里真的动手干——每一步可审批、可回放。

An open-source desktop workbench built on DeepSeek Harness (dsh).
Download and go: assign tasks in plain language, the AI actually does the work
in a local sandbox — every step approvable and replayable.

🚧 **开发中 / Under construction** — alpha 目标 2026-09。

</div>

## 生态伙伴仓库 / Sibling repos

- [dsh-studio-skills-zh](https://github.com/dsh-studio/dsh-studio-skills-zh) — 中文技能包
- [dsh-guide-zh](https://github.com/dsh-studio/dsh-guide-zh) — DeepSeek Harness 中文入门指南

## License

MIT · 本项目为社区项目，与 DeepSeek 官方无隶属关系。
Community project, not affiliated with DeepSeek.
```

- [ ] **Step 2: 写 LICENSE（MIT，版权行 `Copyright (c) 2026 DSH Studio contributors`）和 .gitignore**

```gitignore
node_modules/
dist/
target/
spike/runtime/
.DS_Store
.env
```

- [ ] **Step 3: 提交**

```bash
cd /Users/aisenyc/work/dsh-studio && git add -A && git commit -m "chore: 主仓 README/LICENSE/.gitignore"
```

- [ ] **Step 4: 推送到 org（依赖 Task 0）**

```bash
gh repo create dsh-studio/dsh-studio --public --source . --push
```
Expected: 输出仓库 URL。

---

### Task 2：npm 占位包发布（锁名）

**Files:**
- Create: `/Users/aisenyc/work/dsh-studio/npm-placeholder/package.json`
- Create: `/Users/aisenyc/work/dsh-studio/npm-placeholder/index.js`

- [ ] **Step 1: 写占位包**

`package.json`:
```json
{
  "name": "dsh-studio",
  "version": "0.0.1",
  "description": "DSH Studio — desktop workbench for DeepSeek Harness (dsh). Coming soon.",
  "bin": { "dsh-studio": "./index.js" },
  "repository": "github:dsh-studio/dsh-studio",
  "license": "MIT"
}
```

`index.js`:
```js
#!/usr/bin/env node
console.log('DSH Studio — coming soon: https://github.com/dsh-studio/dsh-studio');
```

- [ ] **Step 2: 发布并验证**

```bash
cd /Users/aisenyc/work/dsh-studio/npm-placeholder && npm publish --access public
npm view dsh-studio version
```
Expected: `0.0.1`

- [ ] **Step 3: 提交**

```bash
cd /Users/aisenyc/work/dsh-studio && git add npm-placeholder && git commit -m "chore: npm 占位包 dsh-studio@0.0.1"
```

---

### Task 3：skills-zh 仓库 + 首个技能「批量文件整理」

**Files:**
- Create: `/Users/aisenyc/work/dsh-studio-skills-zh/README.md`
- Create: `/Users/aisenyc/work/dsh-studio-skills-zh/skills/file-organizer-zh/SKILL.md`
- Create: `/Users/aisenyc/work/dsh-studio-skills-zh/install.sh`
- Create: `/Users/aisenyc/work/dsh-studio-skills-zh/tests/check-frontmatter.sh`
- Create: `/Users/aisenyc/work/dsh-studio-skills-zh/tests/acceptance-file-organizer.sh`

- [ ] **Step 1: 建仓 + README**

```bash
mkdir -p /Users/aisenyc/work/dsh-studio-skills-zh/{skills/file-organizer-zh,tests}
cd /Users/aisenyc/work/dsh-studio-skills-zh && git init -b main
```

README.md:
```markdown
# dsh-studio-skills-zh · DSH 中文技能包

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 用的中文技能集。
安装：`./install.sh`（复制到 `~/.dsh/skills/`）。

| 技能 | 一句话 |
|---|---|
| file-organizer-zh | 批量整理乱糟糟的文件夹：按类型/日期归类，先出方案再动手 |

MIT · GitHub topic: `dsh-plugin`
```

- [ ] **Step 2: 写 SKILL.md**

```markdown
---
name: file-organizer-zh
description: 用户要求整理、归类、清理某个文件夹（"帮我整理下载文件夹"、"这堆文件分个类"）时使用。先扫描出整理方案给用户确认，再批量移动，绝不静默删除任何文件。
---

# 批量文件整理

## 流程（必须按序）

1. **扫描**：用 glob 列出目标目录全部文件（含扩展名、大小、修改时间），统计各类型数量。
2. **出方案**：按下面的默认分类法生成"移动清单"（源路径 → 目标路径），以表格形式向用户展示，**等待确认后才执行**。
3. **执行**：确认后用 bash 批量 `mkdir -p` + `mv`。同名冲突时在文件名后缀 `-1`、`-2`，绝不覆盖。
4. **汇报**：列出移动了多少文件到哪些目录、跳过了什么及原因。

## 默认分类法

- `图片/`：jpg png gif webp heic svg
- `文档/`：pdf doc docx xls xlsx ppt pptx md txt csv
- `压缩包/`：zip rar 7z tar gz
- `安装包/`：dmg pkg exe msi apk
- `音视频/`：mp3 mp4 mov mkv wav
- `其他/`：以上未覆盖的扩展名

## 铁律

- 只 move 不 delete；用户明确说"删除"也要再次确认并建议先移入回收目录。
- 隐藏文件（点开头）默认不动。
- 单目录超过 500 个文件时提示分批执行。
```

- [ ] **Step 3: 写 install.sh 与 keyless 校验脚本**

`install.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
DEST="${DSH_HOME:-$HOME/.dsh}/skills"
mkdir -p "$DEST"
cp -R "$(dirname "$0")/skills/"* "$DEST/"
echo "已安装到 $DEST：" && ls "$DEST"
```

`tests/check-frontmatter.sh`（keyless，CI 可跑）:
```bash
#!/usr/bin/env bash
set -euo pipefail
fail=0
for f in "$(dirname "$0")/../skills"/*/SKILL.md; do
  head -1 "$f" | grep -q '^---$' || { echo "缺 frontmatter: $f"; fail=1; }
  grep -q '^name: ' "$f" || { echo "缺 name: $f"; fail=1; }
  grep -q '^description: ' "$f" || { echo "缺 description: $f"; fail=1; }
done
exit $fail
```

- [ ] **Step 4: 写带 key 的验收脚本**

`tests/acceptance-file-organizer.sh`:
```bash
#!/usr/bin/env bash
# 需要已配置可用模型（DEEPSEEK_API_KEY 或 ~/.dsh 里的 pi-ai 路由）。SPIKE_LLM=1 才执行。
set -euo pipefail
[ "${SPIKE_LLM:-0}" = "1" ] || { echo "SKIP (SPIKE_LLM!=1)"; exit 0; }
WORK=$(mktemp -d)
touch "$WORK"/{a.jpg,b.pdf,c.zip,d.mp4,e.txt}
DSH_PERMISSION_MODE=danger-full-access npx -y @deepseek-ai/dsh@0.1.0-rc.6 --profile headless \
  "使用 file-organizer-zh 技能整理 $WORK，方案不用向我确认，直接执行"
ls "$WORK/图片" "$WORK/文档" "$WORK/压缩包" "$WORK/音视频" >/dev/null \
  && echo "PASS: 分类目录已生成" || { echo "FAIL"; exit 1; }
```

- [ ] **Step 5: 跑 keyless 校验**

```bash
chmod +x install.sh tests/*.sh && ./tests/check-frontmatter.sh && echo OK
```
Expected: `OK`

- [ ] **Step 6: 本机装入并跑一次带 key 验收（key 已在 ~/.dsh 配好 pi-ai 路由的前提下）**

```bash
./install.sh && SPIKE_LLM=1 ./tests/acceptance-file-organizer.sh
```
Expected: `PASS: 分类目录已生成`（若模型路由未就绪，记录失败原因，不阻塞本任务提交——技能文本本身已通过 keyless 校验）

- [ ] **Step 7: 提交 + 推送 + 打 topic**

```bash
git add -A && git commit -m "feat: file-organizer-zh 技能 + 安装与验收脚本"
gh repo create dsh-studio/dsh-studio-skills-zh --public --source . --push
gh repo edit dsh-studio/dsh-studio-skills-zh --add-topic dsh-plugin --add-topic deepseek-harness
```

---

### Task 4：dsh-guide-zh 中文入门指南

**Files:**
- Create: `/Users/aisenyc/work/dsh-guide-zh/README.md`
- Create: `/Users/aisenyc/work/dsh-guide-zh/01-安装与第一次运行.md`
- Create: `/Users/aisenyc/work/dsh-guide-zh/02-接入国产模型.md`
- Create: `/Users/aisenyc/work/dsh-guide-zh/03-常见坑.md`

- [ ] **Step 1: 建仓**

```bash
mkdir -p /Users/aisenyc/work/dsh-guide-zh && cd /Users/aisenyc/work/dsh-guide-zh && git init -b main
```

- [ ] **Step 2: README.md（指南目录页）**

```markdown
# DeepSeek Harness 中文入门指南

非官方社区指南，基于 dsh `0.1.0-rc.6` 实测撰写（dsh 处于开发者预览期，破坏性变更频繁，以版本号为准）。

1. [安装与第一次运行](01-安装与第一次运行.md)
2. [接入国产模型（OpenAI/Anthropic 兼容网关）](02-接入国产模型.md)
3. [常见坑](03-常见坑.md)

由 [DSH Studio](https://github.com/dsh-studio/dsh-studio) 团队维护 · MIT
```

- [ ] **Step 3: 三章正文**

`01-安装与第一次运行.md` 要点（实测内容展开成文，每条带命令与预期输出）：Node ≥22.19 或 ≥24；`npx @deepseek-ai/dsh web` 起 Web UI（127.0.0.1:3080）；`npx @deepseek-ai/dsh --profile headless "任务"` 一次性运行；`--dump-config` 看配置树。

`02-接入国产模型.md` 核心是这份**实测过的** patch（放 `~/.dsh/profiles/headless/cordis.patch.yml`，key 放 `~/.dsh/.env`）：

```yaml
- id: llm-pi-ai
  config:
    providers:
      my-openai-compat:        # OpenAI 兼容网关示例
        displayName: 我的网关
        apiKeyEnv: MY_API_KEY
        api: openai-completions
        baseURL: https://api.example.com/v1
        models:
          - id: my-model
            contextWindow: 131072
            maxTokens: 8192
      my-anthropic-compat:     # Anthropic 协议示例
        displayName: 我的Claude兼容
        apiKeyEnv: MY_ANTHROPIC_KEY
        api: anthropic-messages
        baseURL: https://api.example.com/anthropic
        models:
          - id: my-claude-model
            contextWindow: 200000
            maxTokens: 8192
- id: agent-default-model
  config:
    provider: my-openai-compat
    model: my-model
```

并说明：三种协议 `openai-completions` / `openai-responses` / `anthropic-messages`；`apiKeyEnv` 是引用，密钥不进配置文件；改完 `--dump-config` 验证叠加。

`03-常见坑.md`：① 在含 pnpm workspace 的目录跑 npx 会报 `sh: dsh: command not found`，换干净目录；② 遥测默认 DISABLED，开关是 `DSH_TELEMETRY_MODE` 环境变量；③ 预览期磁盘格式零兼容，升级前备份 `~/.dsh`；④ 模型名写错会收到网关原样 400（如 `Unsupported model`），先 curl 网关 `/models` 核对。

- [ ] **Step 4: 提交推送**

```bash
git add -A && git commit -m "docs: 中文入门指南首发三章(基于 0.1.0-rc.6 实测)"
gh repo create dsh-studio/dsh-guide-zh --public --source . --push
gh repo edit dsh-studio/dsh-guide-zh --add-topic deepseek-harness --add-topic chinese
```

---

### Task 5：预置 profile 模板 `zh-starter`

**Files:**
- Create: `/Users/aisenyc/work/dsh-studio/profiles/zh-starter/package.json`
- Create: `/Users/aisenyc/work/dsh-studio/profiles/zh-starter/cordis.patch.yml`
- Create: `/Users/aisenyc/work/dsh-studio/profiles/zh-starter/README.md`

- [ ] **Step 1: 写 profile（结构照抄 headless 模板，实测过的字段）**

`package.json`:
```json
{
  "name": "dsh-profile-zh-starter",
  "private": true,
  "dependencies": {},
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-headless"]
    }
  }
}
```

`cordis.patch.yml`（默认审批从严 + 模型路由留空模板，注释即文档）:
```yaml
# DSH Studio zh-starter：中文起步 profile。
# 用法：整个目录复制到 ~/.dsh/profiles/zh-starter，
#       然后 npx @deepseek-ai/dsh --profile zh-starter "你的任务"
# 模型接入：按 dsh-guide-zh 第 2 章把 providers 换成你的网关。
- id: llm-pi-ai
  config:
    providers: {}   # ← 在这里声明你的模型路由（见指南第 2 章）
```

- [ ] **Step 2: 验证组合**

```bash
mkdir -p ~/.dsh/profiles/zh-starter && cp profiles/zh-starter/{package.json,cordis.patch.yml} ~/.dsh/profiles/zh-starter/
cd /Users/aisenyc/work/dsh-poc && npx -y @deepseek-ai/dsh@0.1.0-rc.6 --profile zh-starter --dump-config | grep -A2 "llm-pi-ai"
```
Expected: 输出含 `providers: {}`（patch 已叠加）。

- [ ] **Step 3: 提交**

```bash
cd /Users/aisenyc/work/dsh-studio && git add profiles && git commit -m "feat: zh-starter 预置 profile 模板"
```

---

### Task 6：Spike——runtime 捆绑准备

**Files:**
- Create: `/Users/aisenyc/work/dsh-studio/spike/prepare-runtime.sh`

- [ ] **Step 1: 写脚本**

```bash
#!/usr/bin/env bash
# 下载独立 Node 并离线安装 dsh，产出 spike/runtime/{node,app} 两个可捆绑目录。
set -euo pipefail
cd "$(dirname "$0")"
NODE_VER=v24.14.0
ARCH=darwin-arm64
mkdir -p runtime && cd runtime
if [ ! -d node ]; then
  curl -fLO "https://nodejs.org/dist/${NODE_VER}/node-${NODE_VER}-${ARCH}.tar.gz"
  tar xzf "node-${NODE_VER}-${ARCH}.tar.gz" && mv "node-${NODE_VER}-${ARCH}" node && rm "node-${NODE_VER}-${ARCH}.tar.gz"
fi
mkdir -p app && cd app
[ -f package.json ] || ../node/bin/npm init -y >/dev/null
PATH="$(pwd)/../node/bin:$PATH" ../node/bin/npm install @deepseek-ai/dsh@0.1.0-rc.6
echo "--- smoke ---"
DSH_HOME=$(mktemp -d) PATH="$(pwd)/../node/bin:$PATH" ./node_modules/.bin/dsh --version
```

- [ ] **Step 2: 跑通 smoke**

```bash
chmod +x spike/prepare-runtime.sh && ./spike/prepare-runtime.sh
```
Expected: 末行打印 `0.1.0-rc.6`。若 `.bin/dsh` shim 解析失败，改用直接入口：`head -3 spike/runtime/app/node_modules/.bin/dsh` 找到真实入口 js，用 `../node/bin/node <入口>` 方式调用并更新脚本。

- [ ] **Step 3: 记录体积基线**

```bash
du -sh spike/runtime/node spike/runtime/app
```
把两个数字记进 Task 10 的结论文档草稿。

- [ ] **Step 4: 提交（runtime/ 已在 .gitignore，只提交脚本）**

```bash
git add spike/prepare-runtime.sh && git commit -m "spike: runtime 捆绑准备脚本(Node24+dsh rc.6)"
```

---

### Task 7：Spike——Tauri 最小壳

**Files:**
- Create: `/Users/aisenyc/work/dsh-studio/spike/app/`（create-tauri-app 生成）
- Modify: `spike/app/src-tauri/tauri.conf.json`
- Modify: `spike/app/src-tauri/src/lib.rs`
- Modify: `spike/app/src/main.ts`、`spike/app/index.html`

- [ ] **Step 1: 脚手架**

```bash
cd /Users/aisenyc/work/dsh-studio/spike && pnpm create tauri-app app -- --template vanilla-ts --manager pnpm --yes
cd app && pnpm install
```

- [ ] **Step 2: 资源捆绑配置**（`src-tauri/tauri.conf.json` 的 `bundle` 节）

```json
"bundle": {
  "active": true,
  "targets": ["app"],
  "resources": { "../../runtime/": "runtime/" }
}
```

- [ ] **Step 3: Rust 侧 spawn 命令**（`src-tauri/src/lib.rs` 全文替换）

```rust
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter, Manager};

#[tauri::command]
fn run_dsh(app: AppHandle, args: Vec<String>) -> Result<(), String> {
    let res = app.path().resource_dir().map_err(|e| e.to_string())?;
    let node = res.join("runtime/node/bin/node");
    let dsh = res.join("runtime/app/node_modules/@deepseek-ai/dsh");
    // 入口以 package.json bin 字段为准；prepare 脚本 smoke 时人工确认一次后写死。
    let entry = dsh.join("lib/cli.js");
    let home = app.path().app_data_dir().map_err(|e| e.to_string())?.join("dsh-home");
    std::fs::create_dir_all(&home).map_err(|e| e.to_string())?;
    let mut child = Command::new(&node)
        .arg(&entry).args(&args)
        .env("DSH_HOME", &home)
        .stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().map_err(|e| e.to_string())?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let app2 = app.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let _ = app2.emit("dsh-line", line);
        }
        let _ = app2.emit("dsh-line", "[exit]".to_string());
    });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![run_dsh])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

注意：`entry` 的真实路径在 Task 6 Step 2 的 smoke 中用 `node -p "require('@deepseek-ai/dsh/package.json').bin"`（在 `spike/runtime/app` 下执行）确认后回填，不要凭猜。

- [ ] **Step 4: 前端**（`index.html` 加两个按钮和 `<pre id="out">`；`src/main.ts` 全文替换）

```ts
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const out = document.getElementById("out")!;
listen<string>("dsh-line", (e) => { out.textContent += e.payload + "\n"; });

document.getElementById("btn-dump")!.addEventListener("click", () => {
  out.textContent = "";
  invoke("run_dsh", { args: ["--profile", "headless", "--dump-default-config"] });
});
document.getElementById("btn-task")!.addEventListener("click", () => {
  out.textContent = "";
  invoke("run_dsh", { args: ["--profile", "headless", "用一句话介绍你自己"] });
});
```

- [ ] **Step 5: dev 模式验证**

```bash
pnpm tauri dev
```
点「dump」按钮。Expected: 窗口内滚出 YAML 配置树（keyless 即可）。

- [ ] **Step 6: 提交**

```bash
cd /Users/aisenyc/work/dsh-studio && git add spike/app && git commit -m "spike: Tauri 最小壳,spawn 捆绑 dsh 流式回显"
```

---

### Task 8：Spike——打包验收（核心验证点）

**Files:** 无新文件（构建 + 手工验收）

- [ ] **Step 1: 构建**

```bash
cd /Users/aisenyc/work/dsh-studio/spike/app && pnpm tauri build 2>&1 | tail -5
```
Expected: 产出 `src-tauri/target/release/bundle/macos/*.app`。**计时 codesign 阶段**（runtime 内上万小文件是已知风险点）。

- [ ] **Step 2: 从打包产物运行验收**

```bash
open src-tauri/target/release/bundle/macos/*.app
```
验收清单（逐项记录到 Task 10 文档）：
1. 窗口正常打开；
2. 点 dump → YAML 树出现（证明资源路径/spawn/DSH_HOME 全链路通）；
3. （可选，key 就绪时）点任务按钮 → 模型回复流式出现；
4. `du -sh *.app` 记录体积；冷启动到窗口可交互秒数。

- [ ] **Step 3: 判定**

- 1+2 通过 = **spike 成功**，sidecar 路线确认，W2 按 spec 架构开工；
- codesign 超 10 分钟或资源路径不可行 = 记录失败细节，启用备选：app 首启时下载 runtime 到 app-data（参考 Cursor 模式），W2 架构相应调整。

---

### Task 9：Windows 可行性检查（CI，非阻塞）

**Files:**
- Create: `/Users/aisenyc/work/dsh-studio/.github/workflows/spike-win.yml`

- [ ] **Step 1: 写 workflow**

```yaml
name: spike-win
on: workflow_dispatch
jobs:
  win-runtime:
    runs-on: windows-latest
    steps:
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: npm install @deepseek-ai/dsh@0.1.0-rc.6
      - run: npx dsh --version
      - run: npx dsh --profile headless --dump-default-config | Select-Object -First 40
        shell: pwsh
```

- [ ] **Step 2: 推送后手动触发并记录结果**

```bash
git add .github && git commit -m "ci: windows runtime 可行性检查" && git push
gh workflow run spike-win && sleep 90 && gh run list --workflow spike-win --limit 1
```
Expected: conclusion `success`。失败则把日志摘要记入 Task 10（Windows 是 W5 的事，此处只收集情报）。

---

### Task 10：Spike 结论文档

**Files:**
- Create: `/Users/aisenyc/work/dsh-studio/docs/superpowers/spikes/2026-08-XX-sidecar-spike-findings.md`（XX=实际完成日）

- [ ] **Step 1: 按模板填写**

```markdown
# Sidecar 打包 Spike 结论

## 数字
- runtime 体积：node __ MB + dsh node_modules __ MB；.app 总体积 __ MB
- 构建耗时 __；codesign 耗时 __；冷启动 __ 秒

## 验收结果
- [ ] 打包产物内 keyless dump-config 通
- [ ] 带 key 真任务通 / 未测（原因）
- [ ] Windows CI 通 / 失败摘要

## 坑与结论
- （逐条：现象 → 原因 → 对 W2 架构的修正）

## 判定
sidecar 路线：GO / 转 postinstall 下载方案
```

- [ ] **Step 2: 若结论与 spec 冲突，同步修订 spec 对应小节并在提交信息注明**

- [ ] **Step 3: 提交推送**

```bash
git add -A && git commit -m "docs: sidecar spike 结论" && git push
```

---

## 任务依赖

- Task 0 阻塞：1.4、2.2、3.7、4.4、9.2（所有 push/publish）
- Task 6 → 7 → 8 严格串行（spike 主线，限时 2 天）
- Task 1-5 与 6-8 可并行
