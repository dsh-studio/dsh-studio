# Sidecar 打包 Spike 结论

日期：2026-08-17 · 状态：进行中（构建结果待回填）

## 数字

- runtime 体积（未压缩）：node **191MB** + dsh node_modules（531 包）**343MB** = **534MB**
- .app 总体积：（构建后回填）
- Rust 首次构建耗时：（回填）；codesign 耗时：（回填）
- 冷启动到窗口可交互：（回填）

## 验收结果

- [x] `prepare-runtime.sh` 一键产出可捆绑 runtime，smoke `dsh --version` → `0.1.0-rc.6`
- [ ] 打包产物内 keyless dump-config 通（回填）
- [ ] 带 key 真任务通 / 未测（原因）
- [ ] Windows CI 通 / 失败摘要（推送 org 后触发）

## 坑与结论

1. **dsh CLI 入口是 `lib/bin.js`**（`package.json` bin 字段实查），不是猜的 `cli.js`——lib.rs 已按实查回填。
2. **534MB 未压缩 runtime 是最大问题**。node 目录 191MB 里含 npm/npx/corepack 及头文件，实际只需 node 二进制（~90MB）；dsh 的 343MB 依赖树有多平台二进制冗余的嫌疑（@vscode/ripgrep 等）。W2 优化方向：只捆 node 二进制 + `npm prune`/裁剪多平台产物 + DMG 压缩后预计可到 150-250MB 区间。若仍不可接受 → 转"首启下载 runtime"方案。
3. bash 脚本里 `$VAR` 后紧跟全角标点会被 zsh/bash 误解析进变量名——中文文案脚本统一用 `${VAR}`。

## 判定

（构建验收后回填：sidecar 路线 GO / 转 postinstall 下载方案）
