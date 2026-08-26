# DSH Studio 更新记录

本文档记录面向使用者的重要变化。尚未发布的开发进展放在 `Unreleased`;正式打标签时再改为对应版本。

## Unreleased · 2026-08-26

### 新增

- 新增 **设置 → 工作台组件**,集中展示 Studio 自带组件的版本、来源、权限和运行状态。
- 新增组件修复和安全模式入口。
- 品牌、模型供应商、Dream Skin 主题、中文技能面板和工作台管理器改为离线组装与 SHA-256 锁定。
- 内置 Better Sidebar `0.16.1`、`dsh-at-file` `0.4.0` 和 Agent Teams `0.1.13`,并默认启用。
- 新增按需开启的 ModLens `3.25.0`、DSH Browser bridge `0.0.2` + Chrome 扩展 `0.1.1`,以及 DSH TUI `0.9.3`。
- 新增 DSH Market `1.31.1` 只读目录,固定官方 `dsh-plugin-catalog@2026.826.2432` 的 2189 条目录数据,不加载安装/卸载路由。

### 改进

- DSH Web Profile 改为事务式组合:只修改 Studio 自己管理的条目,保留用户自行安装的插件。
- 开发、构建和 CI 统一使用同一份工作台组件清单,应用只打包一个经过校验的 `workbench/` 资源。
- 捆绑 DSH runtime 升级到 `0.1.0-rc.8`;Web/React 18 与 TUI/React 19 使用两棵隔离依赖树。
- 第三方组件从软链接改为校验后复制,并只链接清单中声明的宿主运行依赖,避免 ESM 从真实源路径解析时找不到 DSH peer。

### 安全与恢复

- 可选组件文件损坏时会被单独隔离,不影响核心组件启动。
- 新组合只有在本地 host ready 后才会成为当前状态。
- 启动失败会恢复上一份可用 Profile,回退未生效的选择,并最多自动尝试一次安全模式。
- 组件管理不删除会话、模型配置或主题数据。

### 当前范围

- Dream Skin 继续独占主题引擎,Better Sidebar 独占外部工作区 Shell,TUI 使用独立 Profile。
- `dsh-web-ui` 因与当前 Shell/UI 重复暂不接入。
- 存在同名来源歧义的 `dsh-memory` 和 `dsh-hud` 暂不接入,待选定明确上游后再审查。
