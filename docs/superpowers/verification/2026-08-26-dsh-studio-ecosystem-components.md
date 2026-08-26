# DSH Studio ecosystem components verification

Date: 2026-08-26

## Verified scope

- The assembled workbench contains 12 immutable components: the existing five Studio components plus Better Sidebar, At File, Agent Teams, ModLens, Browser, TUI, and Market.
- Better Sidebar `0.16.1`, At File `0.4.0`, and Agent Teams `0.1.13` are enabled by default.
- ModLens `3.25.0`, Browser bridge `0.0.2` plus extension `0.1.1`, TUI `0.9.3`, and Market `1.31.1` are opt-in.
- The bundled Web runtime uses DSH `0.1.0-rc.8` with React `18.3.1`; the isolated TUI tree uses React `19.2.8`.
- All 54 declared TUI runtime dependencies resolve from the isolated TUI tree first and the Web runtime peer closure second; none are missing.
- The read-only Market artifact contains the pinned `dsh-plugin-catalog@2026.826.2432` snapshot with 2189 entries. IPC returns only allowlisted display metadata, caps a response at 50 rows, and omits `install`, `tarball`, update, and uninstall data.
- Vendored package manifests contain no lifecycle scripts or development dependency paths.

## Fresh command evidence

All commands below exited with status 0 unless noted as an intentional RED test during development.

```text
bash spike/prepare-runtime.sh
  DSH 0.1.0-rc.8
  Web React/react-dom 18.3.1
  TUI 0.9.3 / React 19.2.8
  node-pty load succeeded

node --test spike/workbench/assemble.test.mjs
  7 passed, 0 failed

pnpm --dir spike/plugins --filter dsh-studio-workbench test
  4 files passed, 14 tests passed

pnpm --dir spike/plugins --filter dsh-studio-themes test
  8 files passed, 24 tests passed

pnpm --dir spike/plugins bundle
  all declared client bundle scripts completed (workbench, themes, skills panel)

cargo test --manifest-path spike/app/src-tauri/Cargo.toml -- --nocapture
  56 passed, 0 failed, 2 bundled tests ignored by default

cargo test --manifest-path spike/app/src-tauri/Cargo.toml workbench::tests::bundled_ -- --ignored --nocapture
  2 passed, 0 failed

cargo check --manifest-path spike/app/src-tauri/Cargo.toml
  completed successfully

pnpm --dir spike/app build
  workbench assembly and Vite production build completed successfully
```

The bundled tests exercised real processes and artifacts rather than only fixtures:

1. A temporary DSH home was composed with the three default ecosystem plugins, and the bundled DSH Web process reached a random `127.0.0.1` ready URL.
2. Browser was enabled through the normal desired-to-active Web transition; DSH Web reached ready with the bridge loaded and created its local bridge-token file.
3. The versioned Chrome extension was copied transactionally from the digest-verified artifact and its manifest version was checked as `0.1.1`.
4. The isolated TUI profile was composed, resolved React `19.2.8`, and its bundled launcher reported version `0.9.3` using the bundled Node executable.
5. Market search read the digest-verified 2189-entry local snapshot without modifying it.

## Release acceptance still to run

- Interactive macOS click-through of all settings controls, Browser extension loading, theme switching, At File search, and Agent Teams panel registration.
- Windows CI/runtime preparation and TUI `.cmd` launch on a Windows runner.
- ModLens provider-backed image execution with an explicitly configured compatible vision provider.

These items require a GUI, platform, extension session, or user credential. They do not broaden the shipped default permission set: ModLens, Browser, TUI, and Market remain off until the user enables them.
