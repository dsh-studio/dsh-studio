# DSH Studio Animated GIF Theme Design

**Date:** 2026-08-20

**Status:** Approved in conversation

**Scope:** Extend the existing local theme importer with animated GIF wallpaper support.

## Decision

Preserve an accepted GIF as `background.gif` and let the desktop webview render its native animation. Generate a static, metadata-free `thumbnail.webp` from the first composited frame for the settings gallery. Do not flatten the GIF to one frame and do not transcode it to animated WebP.

This keeps the source timing and appearance intact, avoids a large animation-transcoding subsystem, and leaves the existing PNG/JPEG/WebP normalization path unchanged.

## Accepted inputs and limits

The native picker accepts PNG, JPEG, WebP, and GIF. Static formats retain their current 20 MB and 40-million-pixel checks and normalize to `background.webp`.

GIF import additionally requires:

- a `.gif` extension and matching `GIF87a` or `GIF89a` signature;
- a file no larger than 20 MB;
- a logical canvas no larger than 2,560 pixels on either edge;
- no more than 300 decoded frames;
- no more than 180 million total decoded canvas pixels across all frames;
- no more than 60 seconds in one animation cycle;
- every frame to decode successfully.

The importer must stop as soon as a bound is exceeded, remove the incomplete staging directory, and return a specific Chinese error. Animated PNG and animated WebP remain unsupported in this revision.

## Data model and storage

`ThemeManifest.image` remains the asset selector. Bundled themes continue to require `background.webp`. User themes may use exactly one of `background.webp` or `background.gif`; paths and arbitrary filenames remain invalid.

The staging directory contains one background plus `thumbnail.webp`. Saving discovers and validates that single staged background, copies it through the existing atomic `.new`/`.bak` transaction, and records the exact filename in `theme.json`. Editing a theme preserves its existing background kind.

Catalog thumbnails remain `data:image/webp`. Loading a GIF theme returns `data:image/gif`; loading a static theme returns `data:image/webp`. Theme assets remain local and are never uploaded.

## Rendering and UI

The current wallpaper renderer already uses a CSS background image, so a GIF data URL animates without a new playback component. Brightness, focal position, scrim, translucent surfaces, and borderless visual tokens apply unchanged. Blur remains user-adjustable but defaults to zero.

The import button and empty-state copy explicitly list `PNG / JPEG / WebP / GIF`. The editor preview displays the running GIF; the gallery uses the static thumbnail to avoid six or more simultaneous animated previews.

## Verification

Rust tests cover signature matching, a valid multi-frame GIF, frame/pixel/duration rejection, corrupt later-frame rejection, staging cleanup, atomic save, manifest filename, MIME data URLs, reload, activation, and deletion. Existing static-image and path-safety tests must remain green.

Client tests cover the updated format copy and ensure a GIF data URL is passed to the unchanged wallpaper layer. Final verification includes the full Rust and plugin suites, asset audit, build checks, and one real Tauri import/playback check when a safe fixture is available.

## Non-goals

- GIF editing, trimming, speed controls, pause controls, or transcoding.
- Animated WebP or APNG import.
- Network-hosted wallpapers.
- Bundled animated themes.
