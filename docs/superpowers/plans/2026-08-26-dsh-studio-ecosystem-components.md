# DSH Studio Ecosystem Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the seven selected DeepSeek Harness ecosystem capabilities inside the local DSH Studio application, with three core Web components enabled by default and Browser, ModLens, TUI, and the read-only Market catalog opt-in.

**Architecture:** Upgrade the bundled official DSH runtime to `0.1.0-rc.8`, assemble immutable reviewed plugin artifacts, and let the existing transactional workbench composer own only Studio-managed profile entries. Web plugins run in the official Web profile, TUI gets an isolated profile opened in Terminal, Browser includes a pinned Chrome extension plus host bridge, and Market exposes its pinned offline snapshot without loading its mutation-capable host plugin.

**Tech Stack:** Node.js 24, DSH `0.1.0-rc.8`, pnpm/npm build-time packaging, Rust 2021, Tauri 2, React 18, TypeScript 5.6, Vitest 3.

**Execution status (2026-08-26):** Tasks 1-7 and Task 8 automated verification/documentation are complete. The two bundled integration tests cover real loopback DSH Web startup for both the default set and Browser-enabled set, TUI profile/version execution, extension preparation, and the pinned Market snapshot. A final interactive GUI click-through and Windows runner remain release acceptance items rather than implementation blockers; exact evidence is recorded in `docs/superpowers/verification/2026-08-26-dsh-studio-ecosystem-components.md`.

---

## Locked sources

| Component | Package/artifact | Version | Immutable source |
|---|---|---:|---|
| Better Sidebar | `dsh-better-sidebar` | `0.16.1` | `omdsh-dev/DSH-better-sidebar@f9153dfc1ce47cf43445c1b351ee3ae47b4ad9f1` |
| At File | `dsh-at-file` | `0.4.0` | `omdsh-dev/dsh-at-file@7f090d0d6a3f1d680d98d2a553d17accd190c65e` |
| Agent Teams | `@nanmicoder/dsh-agent-teams` | `0.1.13` | `NanmiCoder/dsh-agent-teams@912aae5225d3d85fa841a1b0c8a5c77021876c25` |
| ModLens | `@liustack/modlens` | `3.25.0` | `liustack/modlens@00f3658c30655314b013edbb5687c4ec5f5dab27` |
| Browser | `@yuxianglin/dsh-bridge-browser` + Chrome extension | `0.0.2` / `0.1.1` | `Lum1104/dsh-browser@82eed45837c8878727f6231b0ca0fec2049ccc0a` (last rc.8-compatible commit) |
| TUI | `@deepseek-harness-tui/dsh-tui` | `0.9.3` | `ccch1mneyyy/dsh-TUI@a3439a3c7d7e7b3c9cfc505e833525376e8558d0` |
| Market | `dshmarket` offline snapshot only | `1.31.1` | `dsh-market/dsh-market@3cbe62c9c706a85de8e5b980a3e51604a24d8157` |

`dsh-web-ui` remains excluded because it duplicates the selected shell and UI owners. `dsh-memory` and `dsh-hud` remain excluded because no unambiguous source was selected.

## File map

- Modify `spike/prepare-runtime.sh` and `spike/prepare-runtime-win.sh` to install the exact rc.8 runtime and the published plugin dependency trees at build time.
- Create `spike/vendor/dsh-at-file/` from the reviewed v0.4.0 runtime files.
- Create `spike/vendor/dsh-browser/` from the reviewed rc.8-compatible bridge build and Chrome extension build.
- Modify `spike/workbench/workbench.source.json` and `spike/workbench/assemble.mjs` to record source commit, supported DSH versions, profile role, and shared runtime dependencies.
- Modify `spike/app/src-tauri/src/workbench/{model,artifact,composer,service,commands,tests}.rs` for compatibility status, copied plugin packages, shared dependency links, a TUI profile, Browser preparation, and read-only Market data.
- Modify `spike/app/src-tauri/src/lib.rs` and Tauri permissions/capabilities for the two narrow actions `workbench_open_tui` and `workbench_prepare_browser` plus the read-only `workbench_market_catalog` command.
- Modify `spike/plugins/dsh-studio-workbench/src/` and tests to expose TUI/Browser actions and local Market search.
- Modify `.github/workflows/build.yml`, `README.md`, `CHANGELOG.md`, and add verification evidence.

## Task 1: Extend the immutable component contract

**Files:**
- Modify: `spike/workbench/assemble.test.mjs`
- Modify: `spike/workbench/assemble.mjs`
- Modify: `spike/app/src-tauri/src/workbench/model.rs`
- Modify: `spike/app/src-tauri/src/workbench/artifact.rs`
- Modify: `spike/app/src-tauri/src/workbench/tests.rs`

- [ ] **Step 1: Write failing assembler tests**

Add fixture fields `commit`, `supportedDsh`, `profileRole`, and `runtimeDependencies`. Assert that a missing 40-character commit, an empty supported-version list, an unsupported profile role, or a dependency containing `/../` fails with `invalid_component`.

- [ ] **Step 2: Run the Node RED test**

Run `node --test spike/workbench/assemble.test.mjs`.

Expected: the new provenance validation cases fail because the assembler ignores the fields.

- [ ] **Step 3: Write failing Rust contract tests**

Add a lock fixture with:

```rust
commit: "0123456789abcdef0123456789abcdef01234567".into(),
supported_dsh: vec!["0.1.0-rc.8".into()],
profile_role: ProfileRole::Web,
runtime_dependencies: vec!["ws".into(), "@deepseek-ai/dsh-settings".into()],
```

Assert malformed commits, unknown DSH versions, unsafe package names, and empty profile lists are rejected before composition.

- [ ] **Step 4: Run the Rust RED test**

Run `cargo test --manifest-path spike/app/src-tauri/Cargo.toml workbench::tests::lock_ -- --nocapture`.

Expected: compilation fails until the new lock fields and `ProfileRole` exist.

- [ ] **Step 5: Implement and serialize the contract**

Add `ProfileRole::{Web,Tui,Catalog}` and the four fields to source validation, the generated lock, `LockedComponent`, and the Rust lock validator. Package names must be either `name` or `@scope/name`, and `supportedDsh` entries must be exact prerelease versions rather than ranges.

- [ ] **Step 6: Run GREEN**

Run:

```bash
node --test spike/workbench/assemble.test.mjs
cargo test --manifest-path spike/app/src-tauri/Cargo.toml workbench::tests::lock_ -- --nocapture
```

Expected: all assembler and lock tests pass.

## Task 2: Pin runtime and reviewed artifacts

**Files:**
- Modify: `spike/prepare-runtime.sh`
- Modify: `spike/prepare-runtime-win.sh`
- Create: `spike/vendor/dsh-at-file/`
- Create: `spike/vendor/dsh-browser/`
- Create: `spike/vendor/README.md`
- Modify: `.github/workflows/build.yml`

- [ ] **Step 1: Add a failing runtime manifest check**

Extend `spike/workbench/assemble.test.mjs` with a test that reads the prepared runtime package and requires exact `@deepseek-ai/dsh` version `0.1.0-rc.8`. It must also require exact published plugin versions for Better Sidebar, Agent Teams, ModLens, TUI, and Market.

- [ ] **Step 2: Run RED against the current rc.6 runtime**

Run `node --test spike/workbench/assemble.test.mjs`.

Expected: failure reports bundled DSH `0.1.0-rc.6`.

- [ ] **Step 3: Update both runtime preparation scripts**

Install exact versions with scripts disabled during resolution, then explicitly rebuild only the already-reviewed native `node-pty` package on the target platform:

```text
@deepseek-ai/dsh@0.1.0-rc.8
dsh-better-sidebar@0.16.1
@nanmicoder/dsh-agent-teams@0.1.13
@liustack/modlens@3.25.0
@deepseek-harness-tui/dsh-tui@0.9.3
dshmarket@1.31.1
```

Smoke-check `dsh --version`, every package identity, and the `node-pty` native module before pruning npm/pnpm from the distributable runtime.

- [ ] **Step 4: Vendor the two GitHub-only artifacts**

Copy only these reviewed runtime files:

```text
spike/vendor/dsh-at-file/{package.json,cordis.patch.yml,lib/,LICENSE}
spike/vendor/dsh-browser/{package.json,cordis.patch.yml,lib/,browser-extension/,LICENSE,PROVENANCE.json}
```

The Browser package is built from commit `82eed458...`; `PROVENANCE.json` records the commit, build command, archive SHA-256, bridge version, and extension version. Source maps may ship; tests, repository metadata, and lifecycle scripts do not.

- [ ] **Step 5: Reorder CI**

Prepare the runtime before workbench assembly so `workbench.source.json` can read the exact installed npm artifacts. Keep plugin source builds before both steps.

- [ ] **Step 6: Run GREEN and integrity checks**

Run:

```bash
bash spike/prepare-runtime.sh
node --test spike/workbench/assemble.test.mjs
node spike/workbench/assemble.mjs
```

Expected: exact rc.8 identities pass and the generated lock contains immutable artifact digests.

## Task 3: Compose the three default Web components

**Files:**
- Modify: `spike/workbench/workbench.source.json`
- Modify: `spike/app/src-tauri/src/workbench/composer.rs`
- Modify: `spike/app/src-tauri/src/workbench/tests.rs`

- [ ] **Step 1: Write failing composition tests**

Create Web fixtures for Better Sidebar, At File, and Agent Teams. Assert all three appear in `dependencies` and `dsh.profile.bundles` on first composition; assert Better Sidebar alone owns `workbench-shell`; assert Themes alone owns `theme-engine`; assert an unrelated user bundle and user dependency remain byte-for-byte present.

- [ ] **Step 2: Add a failing dependency-resolution test**

Give Better Sidebar runtime dependencies `ws`, `schemastery`, and `node-pty`. Assert the composed profile contains managed links for those packages pointing at the bundled runtime dependency directory, without adding them to `package.json` or deleting a user-owned collision.

- [ ] **Step 3: Run RED**

Run `cargo test --manifest-path spike/app/src-tauri/Cargo.toml workbench::tests::composer_ -- --nocapture`.

Expected: ecosystem packages and shared runtime dependencies are absent.

- [ ] **Step 4: Implement profile-role filtering and portable copies**

Compose only `ProfileRole::Web` components into the Web profile. Copy each verified plugin artifact into the staged profile instead of symlinking the immutable resource, then create managed links for its declared shared runtime dependencies. Track copied component digests and managed dependency links in `.dsh-studio-managed.json` so rollback restores only Studio-owned paths.

- [ ] **Step 5: Add the component records**

Enable Better Sidebar, At File, and Agent Teams by default. Set Better Sidebar conflict group `workbench-shell`; do not assign any external component to `theme-engine`. Record their permissions separately: workspace read/write and terminal for Better Sidebar, workspace read for At File, and agent/subagent/workspace write for Agent Teams.

- [ ] **Step 6: Run GREEN**

Run the complete Rust workbench suite and `node spike/workbench/assemble.mjs`.

Expected: the three Web components compose by default, unknown profile content survives, and rollback tests pass.

## Task 4: Add ModLens and Browser as opt-in Web components

**Files:**
- Modify: `spike/workbench/workbench.source.json`
- Modify: `spike/app/src-tauri/src/workbench/commands.rs`
- Modify: `spike/app/src-tauri/src/workbench/tests.rs`
- Modify: `spike/app/src-tauri/permissions/workbench-commands.toml`
- Modify: `spike/app/src-tauri/capabilities/workbench-loopback.json`
- Modify: `spike/app/src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing optional-component tests**

Assert ModLens and Browser are present but disabled by default, safe mode omits them, and enabling either changes only the next normal Web composition.

- [ ] **Step 2: Write a failing Browser preparation test**

Given a verified Browser artifact with `browser-extension/manifest.json`, call the pure preparation helper and assert it copies to `<app-data>/browser-extension/0.1.1`, rejects symlinks, preserves the previous copy on a failed stage, and returns the stable directory path.

- [ ] **Step 3: Run RED**

Run `cargo test --manifest-path spike/app/src-tauri/Cargo.toml workbench::tests::browser_ -- --nocapture`.

- [ ] **Step 4: Implement the narrow preparation command**

Add `workbench_prepare_browser`. It may only copy the locked extension subtree to the Studio app-data directory and, on macOS, open `chrome://extensions` in Google Chrome. It must not download an engine, execute extension scripts, or expose an arbitrary path/URL argument.

- [ ] **Step 5: Add records and compatibility**

ModLens uses the pinned npm artifact and is off until its provider is available. Browser uses the rc.8-compatible commit artifact and is off until the Chrome extension is prepared. Both declare network permission; Browser additionally declares browser-control permission.

- [ ] **Step 6: Run GREEN**

Run the Browser tests, command permission tests, and full Rust suite.

## Task 5: Add isolated TUI launch

**Files:**
- Create: `spike/app/src-tauri/src/workbench/tui.rs`
- Modify: `spike/app/src-tauri/src/workbench/mod.rs`
- Modify: `spike/app/src-tauri/src/workbench/commands.rs`
- Modify: `spike/app/src-tauri/src/workbench/tests.rs`
- Modify: `spike/app/src-tauri/src/lib.rs`
- Modify: Tauri workbench permission and capability files

- [ ] **Step 1: Write failing TUI profile tests**

Assert the TUI composer writes only `profiles/dsh-tui`, uses bundles `@deepseek-ai/dsh-base` and `@deepseek-harness-tui/dsh-tui`, links the declared runtime dependencies, and never changes `profiles/web`.

- [ ] **Step 2: Write failing launch-script tests**

Assert the generated `.command` script contains the exact bundled Node path, exact DSH entry path, `DSH_HOME`, `--profile dsh-tui`, and a safely shell-quoted working directory. Reject a disabled or damaged TUI component.

- [ ] **Step 3: Run RED**

Run `cargo test --manifest-path spike/app/src-tauri/Cargo.toml workbench::tests::tui_ -- --nocapture`.

- [ ] **Step 4: Implement `TuiProfileComposer` and `workbench_open_tui`**

Compose the isolated profile transactionally, write the launcher under Studio app data with mode `0700`, and open it with Terminal.app on macOS. The command accepts no executable or profile arguments from the Web page. Closing Terminal leaves the Web host untouched.

- [ ] **Step 5: Run GREEN**

Run TUI tests and the full Rust suite. Then manually launch TUI from a temporary DSH home and verify the Web host PID remains alive after the terminal session exits.

## Task 6: Add the controlled read-only Market catalog

**Files:**
- Modify: `spike/workbench/workbench.source.json`
- Modify: `spike/app/src-tauri/src/workbench/model.rs`
- Modify: `spike/app/src-tauri/src/workbench/commands.rs`
- Modify: `spike/app/src-tauri/src/workbench/tests.rs`
- Modify: Tauri workbench permission and capability files

- [ ] **Step 1: Write failing catalog tests**

Use a small `registry-snapshot.json` fixture. Assert `workbench_market_catalog("browser", 20)` returns only normalized name, description, source, stars, version, and compatibility fields; caps results at 50; and never returns install commands or filesystem mutation endpoints.

- [ ] **Step 2: Run RED**

Run `cargo test --manifest-path spike/app/src-tauri/Cargo.toml workbench::tests::market_ -- --nocapture`.

- [ ] **Step 3: Implement the read-only catalog command**

Read only the digest-verified Market artifact's bundled snapshot. Do not load `dshmarket` into the Web profile and do not expose its install, update, uninstall, enable/disable, restart, or setup routes.

- [ ] **Step 4: Run GREEN**

Run Market tests and the full Rust suite.

## Task 7: Expose concrete actions in Workbench Components UI

**Files:**
- Modify: `spike/plugins/dsh-studio-workbench/src/types.ts`
- Modify: `spike/plugins/dsh-studio-workbench/src/runtime.ts`
- Modify: `spike/plugins/dsh-studio-workbench/src/WorkbenchSection.tsx`
- Modify: `spike/plugins/dsh-studio-workbench/src/*.test.ts*`

- [ ] **Step 1: Write failing UI tests**

Assert the page displays the seven ecosystem components; Better Sidebar, At File, and Agent Teams are On; ModLens, Browser, TUI, and Market are Off. Assert Browser shows `准备 Chrome 扩展`, TUI shows `在终端打开`, and enabled Market shows local search without install buttons.

- [ ] **Step 2: Run RED**

Run `pnpm --dir spike/plugins --filter dsh-studio-workbench test`.

- [ ] **Step 3: Implement typed runtime calls and UI**

Add typed wrappers for the three narrow commands. Keep source, exact version, license, permissions, health, and compatibility visible. Map `incompatible` and `needsConfiguration` without treating them as active.

- [ ] **Step 4: Run GREEN and bundle**

Run:

```bash
pnpm --dir spike/plugins --filter dsh-studio-workbench test
pnpm --dir spike/plugins --filter dsh-studio-workbench bundle
```

Expected: all workbench UI tests pass and `lib/client.js` is rebuilt.

## Task 8: Packaged application verification and documentation

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Create: `docs/superpowers/verification/2026-08-26-dsh-studio-ecosystem-components.md`

- [ ] **Step 1: Run all automated verification fresh**

Run:

```bash
node --test spike/workbench/assemble.test.mjs
pnpm --dir spike/plugins --filter dsh-studio-workbench test
pnpm --dir spike/plugins --filter dsh-studio-themes test
cargo test --manifest-path spike/app/src-tauri/Cargo.toml
cargo check --manifest-path spike/app/src-tauri/Cargo.toml
pnpm --dir spike/app build
```

- [ ] **Step 2: Run native acceptance**

With a fresh temporary `DSH_STUDIO_HOME`, launch the native app and verify:

1. DSH reports rc.8 and binds only to `127.0.0.1`.
2. Better Sidebar mounts once and all DSH Studio themes still switch and persist.
3. `@file` returns workspace paths and does not escape the workspace.
4. Agent Teams registers its tools and panel.
5. Browser remains off until prepared, then its bridge loads with the Chrome extension.
6. ModLens missing configuration is bounded to its component.
7. TUI opens in Terminal with a separate profile and does not stop Web.
8. Market search works from the bundled snapshot and exposes no mutation action.
9. A broken optional artifact still permits safe-mode startup.
10. Relaunch performs no npm, registry, or GitHub request.

- [ ] **Step 3: Update user-facing documentation**

Lead README/CHANGELOG with the seven included capabilities, exact defaults, Browser extension setup, TUI isolation, Market read-only boundary, rc.8 runtime requirement, and the explicit exclusions for aggregate Web UI, Memory, and HUD.

- [ ] **Step 4: Record evidence and inspect the final diff**

Write exact commands, exit codes, component versions, native observations, and remaining limitations in the verification file. Run `git status --short`, `git diff --check`, and inspect that no generated workbench `dist/`, temporary source archive, API key, session data, or local DSH home is staged.

No commit or push is performed until the user explicitly requests it for this new scope.
