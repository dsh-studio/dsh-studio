# Spike:内嵌官方 client shell + ui-slots 注入(2026-08-20 验证通过)

改造决策:放弃自写前端聊天 UI,直接跑官方 `dsh web` shell,DSH Studio 的
所有定制通过标准 dsh 插件注入。本目录是第一个验证插件。

## 已验证的最小链路

1. `dsh plugin --profile web add <本插件路径>`(转发 pnpm,link: 安装)
2. 包内 `dsh.bundle.patch` 指向 cordis.patch.yml → 插件行进入 profile 层
3. 包内 `dsh.client`(inject + platform: web)+ `exports["./client"]`
   → host 自动把 client bundle 哈希进 `__DSH_BOOT__` graph,从 `/plugins/<pkg>/client.js` 下发
4. 浏览器模块加载器实例化 factory → `ctx.slots.register` 进 `sidebar.footer.action`
5. 结果:官方 shell 左下角出现「🦝 DSH Studio · 小浣熊驻场」,控制台零报错

验证环境:dsh 0.1.0-rc.6(spike/runtime 捆绑),`dsh web --host 127.0.0.1 --port 4477`,
DSH_HOME=spike/dsh-home。

## 踩过的坑

- **patch 不能新增行**:bundle 的 cordis.patch.yml 里裸写 `- id: x` 是"按 id 改已有行",
  会报 `patch: entry "x" not found`;新增插件必须用 `- insert:` 块(见本目录 yaml)。
- **没有 `dsh.bundle` 字段只算普通依赖**:`dsh plugin add` 会装上但不激活,
  警告 "installed as a plain dependency, not a profile layer"。
- **client bundle 是 lazy-CJS 格式**:`window.__ModuleLoader__.load({id, factory})`,
  副作用全部放 factory 里;runtime `require()` 白名单只有平台模块
  (react 系、@deepseek-ai/cordis、ui-slots、web-react、ui-primitives、ui-attachment、
  schema-form)+ `dsh-client-runtime/client`,其余必须内联。
- **shell 不能裸跑**:`__DSH_BOOT__` 必须由 host 注入,vite serve 被上游插件主动拦截。
  所以桌面壳的正确姿势是 webview 指向本地 host,不是自己 serve dist。
- 本插件的 client.js 是**手写**的 loader 格式(spike 从简);正式做要换 tsdown
  `clientBundle()` 预设(见上游 packages/client/tsdown.client.ts,含 CSS Modules、
  sourcemap、纯度门禁)。

## Tauri 壳改造(2026-08-20 下午完成)

- `spike/app` 不再有自写聊天 UI:启动页(白底+圆角 logo)→ Rust 在 setup 里
  spawn 捆绑的 `dsh web --host 127.0.0.1 --port 0`,从 stdout 解析
  `dsh web: http://...` 后把主窗口 navigate 过去;RunEvent::Exit 回收子进程。
- profile 自动接线:`provision_web_profile()` 免 pnpm 复刻 `dsh plugin add` 的产物
  (package.json 声明 bundles + node_modules 符号链接指向应用资源里的插件)。
- 开发环境变量:`DSH_STUDIO_HOME`(dsh home 覆盖,开发用 `spike/dev-home`,
  **里面存着真实 API key,别删**)、`DSH_STUDIO_RUNTIME_DIR`、`DSH_STUDIO_PLUGINS_DIR`。
- 品牌修正:macOS Dock 图标必须自带圆角矩形+透明留白(系统不裁),
  全出血方形直接进 icns 会变方砖;`assets/brand/icon-macos-1024.png` 是处理后的版本
  (内容 824/1024、圆角 185),`pnpm tauri icon` 用它生成。侧栏徽章禁 emoji,
  用内联 base64 的品牌图 + "DSH Studio"。启动页白底、logo 用圆角版(用户定稿)。

## 开发期踩坑(续)

- 重启 `tauri dev` 必须整组清:pnpm 启动器、cargo-tauri 监视器、target/debug/app、
  dsh host(node bin.js)、1420 端口,漏一个就互相打架(app 会被旧监视器重启/杀掉)。
- 日志带 ANSI 色码,grep 匹配 `Running \`target...\`` 这类跨色码字符串会失配。
- 本机公司代理会把死端口的请求劫持成 502,curl 000/502 ≠ 服务在,先 lsof 看监听。

## 下一步(未做)

- 版本 lockstep:client 类型包与捆绑 dsh 按同一 release tag 整套锁定(现 rc.6,上游已 rc.8)
- 插件构建正规化:手写 client.js 换 tsdown `clientBundle()` 预设
- 正经插件:中文 locale 字典、技能面板、返佣 provider 预设
