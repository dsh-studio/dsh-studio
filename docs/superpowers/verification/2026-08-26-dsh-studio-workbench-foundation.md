# DSH Studio Workbench Foundation Verification

**Date:** 2026-08-26

**Host:** macOS

**Branch:** `main`

## Outcome

- A deterministic offline assembler produces one locked `workbench/` resource with five first-party components: Brand, Providers, Themes, Skills Panel, and Workbench.
- Rust verifies lock structure, provenance, path containment, package identity, notices, symlinks, and artifact digests before composing the DSH Web Profile.
- Desired component choices are persisted separately from the last ready set. A new set is promoted only after the loopback host reports ready.
- Profile composition owns only Studio-managed dependencies, bundles, and links. Unmanaged user entries are retained.
- A failed normal launch restores the previous Profile, rolls desired choices back to active choices, and requests exactly one safe-mode launch. A failed safe-mode launch stops automatic retry.
- Tauri exposes only catalog, toggle, repair, and safe-mode commands to the random loopback Web host.

The current foundation does not include Better Sidebar, Agent Teams, Browser, TUI, Market, or other ecosystem plugins. They remain follow-up compatibility work.

## Automated verification

| Check | Result |
| --- | --- |
| `node --test spike/workbench/assemble.test.mjs` | Pass, 4 tests |
| `pnpm --dir spike/plugins --filter dsh-studio-themes test` | Pass, 24 tests in 8 files |
| `pnpm --dir spike/plugins --filter dsh-studio-workbench test` | Pass, 12 tests in 4 files |
| `pnpm --dir spike/plugins bundle` | Pass, 5 plugin packages selected; all client bundles built |
| `cargo test --manifest-path spike/app/src-tauri/Cargo.toml` | Pass, 44 tests |
| `cargo check --manifest-path spike/app/src-tauri/Cargo.toml` | Pass |
| `pnpm --dir spike/app build` | Pass; workbench resource reassembled before Vite build |
| `git diff --check` | Pass |

The assembler tests cover the allowlist, deterministic generation, symlink rejection, and required provenance. The Rust suite covers structural and digest validation, conflict resolution, atomic desired/active state, user-entry preservation, transactional composition, mid-transaction rollback, no-op composition, optional damage, readiness promotion, one-shot safe recovery, command validation, and failed-snapshot cleanup. The client suite covers desktop bridge errors, catalog state, toggle scheduling, required-component protection, permission labels, and repair/safe-mode controls.

## Native macOS verification

All DSH homes used below were new directories under `/private/tmp`; `spike/dev-home` and its credentials were not used.

### Healthy launch

- The app assembled the resource before development startup.
- DSH listened on `127.0.0.1:63536` only.
- The supervisor logged host readiness before confirming the workbench launch.
- The isolated Web Profile contained exactly the five managed packages and the matching five bundle entries.
- The generated lock generation was `32a30a0e43cdb9569ee26c509f61040305384054ec1111037b04630d74657565`.
- A separately opened loopback page showed exactly one `工作台组件` settings navigation entry and its component-management section. As expected outside Tauri, desktop IPC reported `desktop_only`.

### Optional artifact damage

A copy of the assembled resource was made under `/private/tmp`, then only `dsh-studio-skills-panel/lib/client.js` was altered.

- The app still became ready on `127.0.0.1:51012`.
- Brand, Providers, Themes, and Workbench remained linked and active.
- The damaged optional Skills Panel was omitted from dependencies, bundles, managed ownership, and `node_modules` links.
- No production resource was changed.

### Rollback, safe mode, and user ownership

A temporary unmanaged `user-extra` bundle was added to the isolated Profile. Its first fixture intentionally lacked the required `dsh.bundle` declaration, producing a controlled pre-readiness host failure.

- The normal launch failed, then one safe-mode launch was attempted and failed for the same unmanaged bundle; no third launch occurred.
- The Profile was restored to the previous managed set while retaining the unmanaged dependency, bundle, and package directory.
- Component state recorded `desired == active` and a bounded rollback warning.
- After making the temporary unmanaged bundle valid and restoring the verified resource, the app became ready on `127.0.0.1:53951`.
- All five Studio components returned, `user-extra` remained unchanged, and the rollback warning cleared.

The native runs were stopped with Ctrl-C; each Node listener was checked afterward and no tested listener remained. Test-created, process-inaccessible generation snapshots were moved from application data to `/private/tmp/dsh-studio-workbench-test-generations` after verification, so they remain recoverable but do not pollute normal application data.

## Verification gap

The native WebView's visible toggle and confirmation buttons were not clicked automatically because macOS denied Accessibility access to the automation process. Therefore the native visual toggle flow is **not confirmed in this run**. The same command path is covered by Rust command-boundary tests and the rendered component UI is covered by Vitest, but a later manual native pass should still turn Skills Panel off and on and observe the two supervised restarts.

Windows remains build-target scope and was not executed on this macOS host.
