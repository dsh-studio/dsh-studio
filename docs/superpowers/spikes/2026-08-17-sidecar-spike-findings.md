# Sidecar 打包 Spike 结论

日期：2026-08-17 · 状态：核心验证完成

## 数字

- runtime 体积（未压缩）：node **191MB** + dsh node_modules（531 包）**343MB** = **534MB**
- .app 总体积：**544MB**（arm64，ad-hoc 签名）
- 构建耗时：**141s 全程**（其中 Rust release 编译 130s；资源拷贝+codesign 仅 **~11s**——担心的万文件签名卡死未发生）
- 冷启动到窗口可交互：（待人工点按记录）

## 验收结果

- [x] `prepare-runtime.sh` 一键产出可捆绑 runtime，smoke `dsh --version` → `0.1.0-rc.6`
- [x] **打包产物内 keyless dump-config 通**：直接以 `.app/Contents/Resources/runtime/node/bin/node + .../dsh/lib/bin.js` 调用，完整配置树输出，DSH_HOME 隔离正常
- [ ] GUI 按钮 → Rust spawn → 流式回显（app 已启动，待人工点按确认）
- [ ] 带 key 真任务：未测（模型路由未就绪，非阻塞）
- [ ] Windows CI：待推送 org 后手动触发

## 坑与结论

1. **dsh CLI 入口是 `lib/bin.js`**（`package.json` bin 字段实查），不是猜的 `cli.js`——lib.rs 已按实查回填。
2. **534MB 未压缩 runtime 是最大问题**。node 目录 191MB 里含 npm/npx/corepack 及头文件，实际只需 node 二进制（~90MB）；dsh 的 343MB 依赖树有多平台二进制冗余的嫌疑（@vscode/ripgrep 等）。W2 优化方向：只捆 node 二进制 + `npm prune`/裁剪多平台产物 + DMG 压缩后预计可到 150-250MB 区间。若仍不可接受 → 转"首启下载 runtime"方案。
3. bash 脚本里 `$VAR` 后紧跟全角标点会被 zsh/bash 误解析进变量名——中文文案脚本统一用 `${VAR}`。

## 判定

**sidecar 路线 GO**。资源捆绑、包内 spawn、DSH_HOME 隔离、签名速度全部通过；唯一的实质问题是 544MB 体积，属于可优化项而非路线否决项（见"坑与结论"第 2 条的裁剪路径）。W2 按 spec 架构开工，体积优化排入 W5 打包周。
