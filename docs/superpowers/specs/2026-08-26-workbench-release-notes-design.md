# DSH Studio Workbench Release Notes Design

**Date:** 2026-08-26

**Status:** Approved

## Goal

Make the new Workbench foundation visible to people evaluating or installing DSH Studio, while keeping a durable history for future releases and avoiding claims that unreleased ecosystem plugins are already included.

## User-facing structure

### README latest-progress block

Add a compact `## 最新进展` section immediately after the Alpha notice and before `## 为什么是 DSH Studio`.

The block will:

- lead with the practical outcome: DSH Studio now has a locally managed, recoverable component workbench;
- name the current five managed components: Brand, Providers, Themes, Skills Panel, and Workbench;
- summarize offline integrity checks, component status/repair, rollback, and one-shot safe mode in user language;
- link to the detailed `## 工作台组件` README section and `CHANGELOG.md`;
- label the work as `Unreleased` until an actual release version is cut.

The existing detailed Workbench section remains the canonical explanation. The new block is a discovery surface, not a duplicate technical specification.

### Changelog

Create a root `CHANGELOG.md` with an `Unreleased` entry dated 2026-08-26. Organize this update under three reader-oriented groups:

- `Added`: component settings, offline locked assembly, repair and safe mode;
- `Changed`: transactional Web Profile composition and single packaged Workbench resource;
- `Safety`: optional-damage isolation, ready-before-promote, rollback, bounded retry, and preservation of user-installed plugins.

End the entry with an explicit scope note: Better Sidebar, Agent Teams, Browser, TUI, Market, and the ambiguous Memory/HUD plugins are not included yet.

## Tone and accuracy

- Chinese first, with product language understandable without Rust, Tauri, Cordis, or Profile internals.
- Use precise phrases such as `最多自动尝试一次安全模式` instead of broad promises like `永不崩溃`.
- Do not call this `alpha.3` until a release/tag exists.
- Do not imply that the listed future ecosystem plugins are installed or available.
- Do not add screenshots until a native Workbench settings capture is available.

## Verification

- Confirm README links resolve to the root changelog and existing Workbench heading.
- Confirm the README announcement and changelog describe the same five current components and the same excluded future scope.
- Run `git diff --check` and inspect the final documentation diff.
- Do not commit or push without an explicit user request.
