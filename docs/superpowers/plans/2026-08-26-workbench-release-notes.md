# DSH Studio Workbench Release Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the new DSH Studio Workbench foundation immediately visible to repository visitors and preserve the update in a durable changelog.

**Architecture:** Add one compact discovery block near the top of the root README, keep the existing detailed Workbench section as the canonical explanation, and add a root changelog for release history. Treat the current work as `Unreleased` because no new release tag exists.

**Tech Stack:** Markdown, GitHub-flavored Markdown, repository-relative links

---

### Task 1: Add the README latest-progress block

**Files:**
- Modify: `README.md`

- [x] **Step 1: Insert the announcement after the Alpha notice**

Add this block between the closing `</div>` and `## 为什么是 DSH Studio`:

```markdown
## 最新进展 · Unreleased

DSH Studio 现在拥有一套可恢复的本机组件工作台。品牌、模型供应商、Dream Skin 主题、中文技能面板和工作台管理器会在构建时离线锁定,并在本机启动时再次校验。

- 在 **设置 → 工作台组件** 查看版本、来源、权限和运行状态
- 可修复组件或以安全模式重启;新组合启动失败会回滚,并最多自动尝试一次安全模式
- 只管理 Studio 自带条目,不覆盖会话、主题、模型配置或用户自行安装的 dsh 插件

查看[工作台组件说明](#工作台组件) 和[完整更新记录](CHANGELOG.md)。
```

- [x] **Step 2: Check README structure and links**

Run:

```bash
rg -n '^## 最新进展|^## 为什么是 DSH Studio|^## 工作台组件|CHANGELOG.md' README.md
```

Expected: the latest-progress heading appears before the product rationale, the detailed Workbench heading remains present, and the changelog link is visible.

### Task 2: Add the durable changelog entry

**Files:**
- Create: `CHANGELOG.md`

- [x] **Step 1: Create the changelog**

Create the file with this content:

```markdown
# DSH Studio 更新记录

本文档记录面向使用者的重要变化。尚未发布的开发进展放在 `Unreleased`;正式打标签时再改为对应版本。

## Unreleased · 2026-08-26

### 新增

- 新增 **设置 → 工作台组件**,集中展示 Studio 自带组件的版本、来源、权限和运行状态。
- 新增组件修复和安全模式入口。
- 品牌、模型供应商、Dream Skin 主题、中文技能面板和工作台管理器改为离线组装与 SHA-256 锁定。

### 改进

- DSH Web Profile 改为事务式组合:只修改 Studio 自己管理的条目,保留用户自行安装的插件。
- 开发、构建和 CI 统一使用同一份工作台组件清单,应用只打包一个经过校验的 `workbench/` 资源。

### 安全与恢复

- 可选组件文件损坏时会被单独隔离,不影响核心组件启动。
- 新组合只有在本地 host ready 后才会成为当前状态。
- 启动失败会恢复上一份可用 Profile,回退未生效的选择,并最多自动尝试一次安全模式。
- 组件管理不删除会话、模型配置或主题数据。

### 当前范围

Better Sidebar、Agent Teams、Browser、TUI、Market,以及存在同名歧义的 Memory/HUD 插件尚未包含。这些生态组件将在逐个完成来源、权限和兼容性审查后再接入。
```

- [x] **Step 2: Verify wording parity and Markdown hygiene**

Run:

```bash
rg -n 'Brand|Providers|Themes|Skills Panel|Workbench|Better Sidebar|Agent Teams|Browser|TUI|Market|Memory/HUD' README.md CHANGELOG.md
git diff --check -- README.md CHANGELOG.md
```

Expected: the current and excluded scopes are explicit, and Git reports no whitespace errors.

### Task 3: Review the documentation-only diff

**Files:**
- Review: `README.md`
- Review: `CHANGELOG.md`

- [x] **Step 1: Inspect the final diff**

Run:

```bash
git diff -- README.md CHANGELOG.md
```

Expected: only the approved README discovery block and the new changelog entry appear; existing detailed documentation remains intact.

- [x] **Step 2: Leave changes uncommitted**

Run:

```bash
git status --short
```

Expected: `README.md` is modified and `CHANGELOG.md` is untracked alongside the already approved Workbench implementation files. Do not commit or push without a new explicit user request.
