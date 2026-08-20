# DSH Studio Theme Switcher Design

**Date:** 2026-08-20
**Status:** Approved in conversation; awaiting written-spec review
**Scope:** macOS and Windows desktop builds of DSH Studio

## 1. Summary

DSH Studio will gain a native theme-switching experience under **Settings → Themes & Appearance**. The feature borrows the visual model and theme-gallery ideas of [Codex Dream Skin](https://github.com/Fei-Away/Codex-Dream-Skin), while implementing rendering, storage, validation, and persistence directly in DSH Studio.

The first release includes:

- Three bundled, offline-ready themes selected from Dream Skin-compatible artwork whose redistribution rights are explicit.
- Multiple named user themes created from local PNG, JPEG, or WebP images.
- A full-window continuous background behind both the sidebar and main content.
- Safe appearance controls only: no arbitrary CSS, JavaScript, or network-loaded assets.
- Real-time full-window preview with explicit Cancel and Save behavior.
- Persistent active-theme selection across app restarts.

The existing experimental `studio-raccoon-warm` and `studio-ink-green` themes are outside this design and must not be retained as dependencies or defaults.

## 2. Goals

1. Make theme selection a first-class DSH Studio desktop feature rather than a Codex skin-management tool.
2. Preserve native DSH controls, accessibility, and interaction semantics while adding expressive backgrounds and color treatments.
3. Keep all theme use offline after installation.
4. Support safe user image import without exposing general filesystem access to the loopback web UI.
5. Produce consistent behavior on macOS and Windows.
6. Credit and redistribute bundled artwork only when its license explicitly permits it.

## 3. Non-goals for Version 1

- Applying themes to Codex or any other application.
- An online gallery, marketplace, or runtime theme update checks.
- Arbitrary CSS, JavaScript, HTML, or remote URLs inside themes.
- ZIP/theme-package import or export.
- Cloud synchronization.
- Linux support.
- Menu-bar or system-tray controls.
- Changes to the upstream DSH theme preference schema.

## 4. Why Dream Skin Is a Reference, Not a Runtime Dependency

Dream Skin injects a theme into the Codex Electron application through the Chrome DevTools Protocol and relies on Codex DOM structure. DSH Studio is a Tauri desktop application whose web UI is hosted in a WKWebView on macOS and WebView2 on Windows. Directly reusing the Dream Skin injector would therefore be fragile and platform-inappropriate.

DSH Studio will instead reuse the parts that transfer cleanly:

- the gallery and theme-card interaction model;
- the idea of a declarative theme manifest plus local artwork;
- attribution and license metadata;
- background-driven palette and effect controls.

Rendering and persistence remain native to DSH Studio and Tauri.

## 5. Architecture

### 5.1 Components

The feature has two cooperating layers.

#### DSH client plugin: `dsh-studio-themes`

Responsibilities:

- Register the **Themes & Appearance** settings section.
- Render the current-theme summary, bundled-theme gallery, user-theme gallery, and editor.
- Apply semantic colors through DSH `ThemeRuntime`.
- Maintain ephemeral preview state using token overrides rather than persisting every edit.
- Render a fixed, non-interactive wallpaper layer beneath the application UI.
- Track whether the current surface is the home view or a conversation and adjust artwork prominence without relying on brittle Codex DOM selectors.
- Invoke only the narrowly scoped Tauri theme commands.

The wallpaper layer must use `pointer-events: none` and must never overlap native controls in the input or accessibility trees.

#### Tauri core: Theme Bridge

Responsibilities:

- List bundled and user themes.
- Open the native image picker.
- Validate, decode, normalize, and store imported images.
- Generate thumbnails and palette candidates.
- Create and clean staging data.
- Save, update, delete, and activate user themes.
- Read theme artwork through a controlled command or asset response.
- Persist `active.json` atomically.
- Recover from missing or corrupt theme data without preventing app startup.

The DSH page is loaded from a random loopback port. It must receive a separate Tauri remote capability restricted to `http://127.0.0.1:*` and to theme-specific commands only. The feature must not grant the page generic filesystem or shell permissions, and must not broaden the existing main-window capability.

### 5.2 Runtime Flow

```text
Settings UI
   │
   ├── preview values ──> client preview controller ──> ThemeRuntime + wallpaper layer
   │
   └── save/import/delete/activate
                 │
                 ▼
          narrow Tauri commands
                 │
        ┌────────┴────────┐
        ▼                 ▼
 bundled resources    app-data theme store
   read-only          validated + atomic writes
```

At app startup, the client asks the Theme Bridge for the theme catalog and active-theme record. A valid active theme is registered and applied. If the record or referenced assets are missing or corrupt, the app falls back to the DSH system theme and shows a non-blocking notice; the settings page remains usable.

### 5.3 Theme Storage

Bundled presets are packaged as read-only application resources. User themes live in the platform-specific application-data directory:

```text
themes/
  active.json
  user/
    <theme-id>/
      theme.json
      background.webp
      thumbnail.webp
  staging/
    <operation-id>/
      background.webp
      thumbnail.webp
```

The implementation must generate opaque theme and staging identifiers. User-supplied names never become filesystem paths.

`active.json` contains only the selected theme identifier and schema version. It must not contain absolute paths, so the store remains portable across upgrades and platform directory changes.

### 5.4 Rendering Model

The renderer separates artwork from controls:

1. A fixed wallpaper layer covers the entire content window, including the space beneath the sidebar and main pane.
2. DSH surfaces use semantic tokens for readable foregrounds, panels, borders, and focus states.
3. Panel opacity and blur reveal the wallpaper while preserving control affordances.
4. The home view may show stronger artwork. Conversation views lower artwork prominence to reduce distraction.
5. Approval UI, stop controls, composer, error states, dialogs, and focus rings remain visibly distinct and fully interactive.

The implementation should use supported DSH plugin state and slots. It must not depend on Codex selectors or fixed assumptions about upstream DOM nesting.

## 6. Theme and Appearance Experience

### 6.1 Settings Page

**Settings → Themes & Appearance** is a dedicated page with three sections:

1. **Current theme**
   - Large preview and theme name.
   - Source label: Bundled or My Theme.
   - **Restore Default** action, which selects the DSH system theme and persists it.
2. **Bundled themes**
   - Three theme cards with preview, name, author, and license summary.
   - Clicking a card applies and persists it immediately.
   - Bundled themes cannot be edited or deleted.
3. **My Themes**
   - User-theme cards with preview and name.
   - **Import Image** entry point.
   - Each saved theme can be applied, edited, or deleted.

All cards require keyboard focus, an accessible name, a visible selected state, and a non-color-only indicator of activation.

### 6.2 Import and Editor Flow

1. The user selects **Import Image**.
2. Tauri opens the native file picker for PNG, JPEG, and WebP.
3. The Theme Bridge validates and normalizes the image, generates a thumbnail and palette candidate, and returns a staging identifier.
4. The editor opens with a real-time full-window preview.
5. The user may adjust:
   - theme name;
   - appearance: Auto, Light, or Dark;
   - derived accent color, with manual override;
   - background brightness;
   - panel opacity;
   - background blur;
   - focal point by clicking or dragging on the preview.
6. **Cancel** restores the theme that was active before editing and discards staging data.
7. **Save** atomically commits the user theme and then makes it active.

Editing an existing theme uses the same experience. Until Save succeeds, the stored theme and `active.json` remain unchanged.

### 6.3 Apply, Cancel, Save, and Delete Semantics

- Selecting an existing bundled or user theme applies it immediately and persists the selection.
- Opening the editor records the previously active theme as the rollback target.
- Preview changes are memory-only and must not modify persistent theme files.
- Cancel always restores the rollback target, even after multiple preview adjustments.
- Save first commits the theme directory, then updates `active.json`. A failure in either operation must not leave a partially valid user theme selected.
- If Save fails, the editor remains open with the user's values intact and offers retry.
- Deleting the active user theme first activates and persists the DSH system theme, then removes only that theme's directory.
- Bundled themes and other user themes are never deletion targets of that operation.

## 7. Declarative Theme Format

Version 1 accepts only a controlled manifest. A user theme resembles:

```json
{
  "schemaVersion": 1,
  "id": "user-seaside-studio",
  "name": "海边工作室",
  "appearance": "auto",
  "image": "background.webp",
  "colors": {
    "accent": "#d4a15f"
  },
  "art": {
    "focusX": 0.62,
    "focusY": 0.42
  },
  "effects": {
    "brightness": 0.78,
    "panelOpacity": 0.76,
    "blur": 10
  }
}
```

Bundled manifests additionally contain:

```json
{
  "author": "Artist Name",
  "license": "License identifier or exact grant",
  "sourceUrl": "https://example.invalid/original-source",
  "checksum": "sha256:<digest>"
}
```

The exact schema must enforce:

- `schemaVersion` equal to `1`;
- generated, path-safe identifiers;
- a bounded display-name length;
- `appearance` in `auto`, `light`, or `dark`;
- six-digit hexadecimal colors only;
- focal coordinates clamped to `0.0...1.0`;
- bounded brightness, opacity, and blur values;
- fixed local filenames rather than arbitrary paths or URLs;
- rejection of unknown executable or styling fields.

Theme manifests cannot contain CSS, JavaScript, HTML, shell commands, remote URLs for runtime loading, or filesystem paths.

## 8. Image Processing and Security

Accepted source files are PNG, JPEG, and WebP with both of these limits:

- maximum encoded file size: 20 MiB;
- maximum decoded image size: 40 megapixels.

The Theme Bridge must:

1. Verify content signatures and successfully decode the image rather than trusting the extension or reported MIME type.
2. Reject animated or unsupported image forms unless the decoder deliberately flattens them to a documented first frame.
3. Check decoded dimensions before allocating derived buffers where the image library permits it.
4. Normalize the longest edge to at most 2560 pixels without upscaling.
5. Strip EXIF and other source metadata.
6. Re-encode the normalized background as WebP and create a separate WebP thumbnail.
7. Produce a deterministic palette candidate in Rust so macOS and Windows receive equivalent defaults.
8. Apply a contrast-safe fallback when the derived palette does not meet the application's readability thresholds.
9. Keep all source and generated data local; no upload or runtime network request is permitted.

All filesystem operations resolve under the known app-data theme root. The core must reject path traversal, symlinks or reparse points that escape the root, and deletion requests for bundled presets or unrecognized identifiers.

## 9. Atomicity and Recovery

Theme creation and update use a sibling temporary directory under the same app-data volume:

1. Write normalized assets and manifest to the temporary directory.
2. Flush and validate the complete staged theme.
3. Replace the target user-theme directory using platform-appropriate rename/replace behavior.
4. Write a temporary active record, flush it, and replace `active.json`.
5. Clean abandoned staging data on a later safe startup.

The implementation must account for Windows rename behavior when the target already exists. It may use a backup-and-swap sequence, but recovery must always yield either the previous complete theme or the new complete theme, never a mixed directory.

If theme activation fails after a new theme directory has been committed, the new theme may remain in **My Themes**, but the previous `active.json` and active UI theme remain authoritative. The user receives a retryable error.

## 10. Bundled Theme Selection and Licensing Gate

The release will include exactly three bundled themes sourced from the current Dream Skin gallery or its linked original sources. Asset selection happens during implementation and must pass all of these gates before a file enters the repository:

1. The source provides an explicit license or grant that permits redistribution inside DSH Studio.
2. Required attribution and license text can be shipped with the app.
3. The asset does not depict a recognizable real person or third-party character/IP whose rights are unclear.
4. The exact downloaded file has a stable source URL and recorded SHA-256 checksum.
5. The bundled manifest, in-app credit, and top-level theme `NOTICE` agree on author, source, and license.

Dream Skin's current `NOTICE.md` identifies **Gothic Void Crusade** as a redistributable candidate and explicitly excludes **Arina Hashimoto** from the repository's MIT license. The latter must not be bundled. Every other candidate requires the same source-level rights check; repository MIT licensing alone is not evidence that third-party gallery artwork is redistributable.

If fewer than three safe candidates pass the gate, implementation must stop before bundling questionable artwork and report the exact shortfall. The feature code and user-import flow may still be developed and tested with generated fixtures, but release acceptance requires three compliant bundled themes.

## 11. Error Handling

Errors must be specific, actionable, and non-destructive:

- Unsupported format: identify accepted formats.
- File or decoded-image limit exceeded: show the applicable limit.
- Decode failure or signature mismatch: explain that the file is not a valid supported image.
- Storage failure: retain editor state and offer retry.
- Missing active theme at startup: fall back to System and show a non-blocking notice.
- Corrupt user theme: omit it from selectable cards, preserve its files, and offer a safe removal action from settings.
- Delete failure: keep the fallback theme active and report that cleanup did not complete.

No theme error may prevent access to settings, the composer, or core conversation controls.

## 12. Testing Strategy

### 12.1 Rust Unit Tests

- Reject path traversal and escaping links/reparse points.
- Reject fake extensions and invalid signatures.
- Reject encoded files over 20 MiB and decoded images over 40 megapixels.
- Exercise valid PNG, JPEG, and WebP decoding and normalization.
- Verify metadata stripping and 2560-pixel maximum edge.
- Verify deterministic thumbnail and palette generation.
- Round-trip version 1 manifests and reject invalid ranges/fields.
- Verify atomic create/update behavior and interrupted-write recovery.
- Verify bundled-preset immutability and deletion scoping.
- Verify missing/corrupt active records fall back to System.

### 12.2 Client Unit Tests

- Catalog grouping and selected-state rendering.
- Semantic-token derivation and contrast fallback.
- Real-time preview without persistence.
- Cancel restoration after multiple edits.
- Save success and save-failure retry behavior.
- Delete-active-theme fallback sequence.
- Keyboard navigation, accessible names, focus visibility, and non-color-only selection state.

### 12.3 Desktop Integration and Acceptance

Run on real macOS and Windows desktop builds:

1. Apply each of the three bundled themes.
2. Import a local image, change every safe control, and confirm full-window preview.
3. Cancel and verify exact restoration of the prior theme.
4. Save a named theme, restart the app, and verify theme and settings persistence.
5. Edit and save the user theme.
6. Delete the active user theme and verify fallback to System.
7. Restore Default from each theme type.
8. Repeat the visual checks on the home and conversation surfaces.
9. Exercise approval, stop, composer, error, dialog, and keyboard-focus states.
10. Confirm the wallpaper never captures pointer input.
11. Disconnect the network and confirm all bundled and saved themes still work.
12. Confirm the loopback page cannot call general filesystem or shell APIs.

Acceptance requires readable text and controls at supported window sizes. Theme defaults that fail contrast checks must be adjusted before release rather than relying only on automatic fallback.

## 13. Delivery Boundaries

Implementation should be divided into reviewable changes:

1. Theme schema, storage, image processing, and Tauri command tests.
2. Narrow Tauri capability and client bridge.
3. Wallpaper renderer and semantic-token integration.
4. Settings gallery, import/editor workflow, and accessibility tests.
5. Three licensed preset assets, attribution records, checksums, and offline packaging.
6. macOS and Windows acceptance pass.

The existing user worktree may contain unrelated experimental changes. Each implementation change must be scoped and staged explicitly so unrelated files are neither overwritten nor committed.

## 14. Reference Material

- [Codex Dream Skin repository](https://github.com/Fei-Away/Codex-Dream-Skin)
- [Codex Dream Skin notice and third-party asset terms](https://github.com/Fei-Away/Codex-Dream-Skin/blob/main/macos/NOTICE.md)
- [Tauri capability configuration](https://v2.tauri.app/reference/acl/capability/)
- [Tauri runtime authority](https://v2.tauri.app/security/runtime-authority/)
