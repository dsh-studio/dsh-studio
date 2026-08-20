# DSH Studio Theme Switcher Verification

**Date:** 2026-08-20

**Host:** macOS 26.3.1 (25D2128)

**Branch:** `main`

## Outcome

- Theme controls render inside General Settings through `settings.general.item`; no standalone theme settings section remains.
- The gallery contains exactly six audited bundled themes.
- Theme surfaces are translucent and borderless while keyboard focus indicators remain explicit.
- Local PNG, JPEG, WebP, and animated GIF imports are represented in the UI contract.
- Accepted GIF files remain `background.gif`; the gallery thumbnail is a static `thumbnail.webp`; the wallpaper receives `data:image/gif` and animates in the Tauri webview.

## Automated verification

| Check | Result |
| --- | --- |
| `cargo fmt -- --check` | Pass |
| `cargo test` | Pass, 26 tests |
| `cargo check` | Pass |
| `pnpm test` in `spike/plugins/dsh-studio-themes` | Pass, 24 tests in 8 files |
| `pnpm --dir spike/plugins bundle` | Pass |
| `pnpm --dir spike/app build` | Pass |
| `node spike/themes/verify-assets.mjs` | Pass, 6 themes with checksums and attribution |
| `git diff --check` | Pass |
| Theme-feature secret-pattern scan | Pass, no matches |
| `settings.section` source/bundle scan | Pass, no matches |

The Rust suite covers GIF signature and full-frame decoding, file/canvas/frame/pixel/duration limits, corrupt later frames, staging cleanup, source-byte preservation, static WebP thumbnail generation, atomic save, manifest asset selection, correct MIME, edit/reload/activation/deletion, and rejection of directories containing both background kinds.

The client suite covers the accepted-format copy, exactly six presets, the General Settings slot, borderless styles, wallpaper visibility defaults, and unchanged passage of a GIF data URL into the CSS wallpaper layer.

## Native macOS verification

An isolated Tauri dev instance was launched with temporary `DSH_STUDIO_HOME` and `DSH_STUDIO_THEME_DIR`; the installed application and its data were not touched.

- [Theme settings with six presets and GIF copy](assets/theme-settings-six-presets.png)
- [GIF playback frame A](assets/gif-playback-frame-a.png)
- [GIF playback frame B, one second later](assets/gif-playback-frame-b.png)

The two playback captures show different Earth rotations in the same DSH Studio window, confirming animation rather than a retained first frame. Sidebar, title, controls, and the borderless input surface remain readable over both frames.

The native file chooser itself was not driven to completion because macOS accessibility access was unavailable for reliable multi-display automation. Its GIF filter is compiled and the same `ThemeService::import_path` route is exercised end to end by Rust tests; native cold-start loading and webview playback were exercised with an isolated, valid user-theme directory.

## Platform boundary

Windows remains build-target scope but was not executed on this macOS host.
