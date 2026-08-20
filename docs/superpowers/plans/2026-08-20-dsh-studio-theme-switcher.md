# DSH Studio Theme Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe, offline, full-window theme gallery and local-image theme editor to the macOS and Windows DSH Studio desktop application.

**Architecture:** A Rust `theme` module owns validation, image normalization, app-data storage, atomic persistence, native file selection, and seven narrowly permitted Tauri commands. The `dsh-studio-themes` client plugin owns a typed bridge, external-store controller, DSH `ThemeRuntime` adapter, wallpaper layer, and a dedicated `settings.section`; no Codex DOM injection, custom CSS input, generic filesystem permission, or runtime network access is introduced.

**Tech Stack:** Tauri 2, Rust 2021, `image`/`base64`/`sha2`/`uuid`/`tempfile`, React 18, TypeScript 5.6, DSH client slots and `ThemeRuntime`, Vitest, Testing Library, pnpm.

---

## Execution Preconditions

The current worktree contains uncommitted DSH web-host migration and plugin files that this feature depends on. Before executing code tasks:

1. Run `git status --short` and save the output in the execution notes.
2. Do not stage or commit unrelated paths such as brand icons, provider/skills plugins, `spike/dev-home`, `spike/dsh-home`, or research files.
3. For already-modified shared files (`Cargo.toml`, `Cargo.lock`, `lib.rs`, `tauri.conf.json`), inspect `git diff` before and after every task and stage only theme-related hunks with `git add -p`. Never run whole-file `git add` on those shared paths while their pre-existing diff is present.
4. Do not delete or rewrite the user's current local configuration directories.
5. Keep downloaded source packages under a fresh `/tmp` directory; only normalized, audited preset artifacts enter the repository.

## File Map

### Rust desktop core

- Create `spike/app/src-tauri/src/theme/mod.rs`: module exports, application path resolution, and `ThemeService` construction.
- Create `spike/app/src-tauri/src/theme/error.rs`: stable typed theme errors and user-facing messages.
- Create `spike/app/src-tauri/src/theme/model.rs`: schema-v1 types, validation, catalog/draft/resolved DTOs, and command request types.
- Create `spike/app/src-tauri/src/theme/image.rs`: signature/dimension checks, decode, normalization, metadata stripping, WebP output, thumbnail, and deterministic accent extraction.
- Create `spike/app/src-tauri/src/theme/store.rs`: bundled/user discovery, staging, active record, atomic replace/recovery, and scoped deletion.
- Create `spike/app/src-tauri/src/theme/commands.rs`: seven Tauri command functions and native dialog integration.
- Create `spike/app/src-tauri/src/theme/tests.rs`: Rust domain, security, store, and recovery tests.
- Create `spike/app/src-tauri/examples/prepare_theme_asset.rs`: deterministic preset normalization using the production image pipeline.
- Modify `spike/app/src-tauri/src/lib.rs`: expose `theme`, construct the service, clean stale staging, and register commands.
- Modify `spike/app/src-tauri/Cargo.toml` and generated `spike/app/src-tauri/Cargo.lock`: add the image/storage test dependencies.
- Create `spike/app/src-tauri/permissions/theme-commands.toml`: allow only the seven application commands.
- Create `spike/app/src-tauri/capabilities/theme-loopback.json`: attach those permissions to `http://127.0.0.1:*` for the `main` window on macOS and Windows.
- Modify `spike/app/src-tauri/tauri.conf.json`: bundle the read-only `spike/themes` resource directory.

### Client plugin

- Replace `spike/plugins/dsh-studio-themes/src/client.tsx`: plugin wiring only; remove the raccoon-warm and ink-green definitions.
- Create `spike/plugins/dsh-studio-themes/src/types.ts`: exact camelCase mirror of Rust DTOs plus DSH/Tauri service faces.
- Create `spike/plugins/dsh-studio-themes/src/bridge.ts`: typed wrapper over `window.__TAURI__.core.invoke`.
- Create `spike/plugins/dsh-studio-themes/src/controller.ts`: catalog/editor state machine and persistence/render orchestration.
- Create `spike/plugins/dsh-studio-themes/src/renderer.ts`: DSH theme registration, preview overrides, wallpaper DOM, and home/conversation surface tracking.
- Create `spike/plugins/dsh-studio-themes/src/tokens.ts`: deterministic semantic-token derivation and contrast guards.
- Create `spike/plugins/dsh-studio-themes/src/ThemeSettingsSection.tsx`: gallery, import/editor, focus point, save/cancel, and delete confirmation UI.
- Create `spike/plugins/dsh-studio-themes/src/styles.ts`: plugin-owned CSS text and idempotent style installation.
- Create `spike/plugins/dsh-studio-themes/tests/setup.ts`: jsdom cleanup and Tauri mock reset.
- Create `spike/plugins/dsh-studio-themes/tests/bridge.test.ts`: command/argument contract tests.
- Create `spike/plugins/dsh-studio-themes/tests/controller.test.ts`: load/apply/preview/cancel/save/delete state-machine tests.
- Create `spike/plugins/dsh-studio-themes/tests/renderer.test.ts`: DOM ownership, pointer behavior, surface state, and restoration tests.
- Create `spike/plugins/dsh-studio-themes/tests/tokens.test.ts`: readable token and range tests.
- Create `spike/plugins/dsh-studio-themes/tests/ThemeSettingsSection.test.tsx`: keyboard, accessible state, editor, retry, and deletion tests.
- Create `spike/plugins/dsh-studio-themes/vitest.config.ts`: jsdom test configuration.
- Modify `spike/plugins/dsh-studio-themes/package.json`, `spike/plugins/package.json`, and generated `spike/plugins/pnpm-lock.yaml`: test scripts and dev dependencies.
- Regenerate `spike/plugins/dsh-studio-themes/lib/client.js`; do not hand-edit it.

### Bundled presets and evidence

- Create `spike/themes/asset-audit.json`: pinned source/version/package/image hashes and rights evidence for exactly three presets.
- Create `spike/themes/NOTICE.md`: author, source, license, AI/provenance, and downstream notice.
- Create `spike/themes/verify-assets.mjs`: offline manifest/count/checksum/attribution verifier.
- Create `spike/themes/presets/preset-gothic-void-crusade/`: manifest, normalized background, thumbnail, and license.
- Create `spike/themes/presets/preset-milky-way/`: manifest, normalized background, thumbnail, and license.
- Create `spike/themes/presets/preset-sunset-voyage/`: manifest, normalized background, thumbnail, and license.

## Stable Command Contract

The permission file, Rust commands, TypeScript bridge, and tests must use exactly these command names:

```text
theme_catalog
theme_load
theme_import_image
theme_save
theme_activate
theme_delete
theme_discard_stage
```

The client sends camelCase Tauri arguments: `themeId`, `stageId`, and `request`. Rust DTO fields use `#[serde(rename_all = "camelCase")]` so the wire contract is identical on both sides.

### Task 1: Lock the schema and validation boundary

**Files:**
- Create: `spike/app/src-tauri/src/theme/error.rs`
- Create: `spike/app/src-tauri/src/theme/model.rs`
- Create: `spike/app/src-tauri/src/theme/mod.rs`
- Create: `spike/app/src-tauri/src/theme/tests.rs`
- Modify: `spike/app/src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing manifest-validation tests**

Add tests covering the fixed filenames, generated identifiers, value bounds, and forbidden path/URL input:

```rust
#[test]
fn manifest_validation_rejects_paths_and_out_of_range_values() {
    let mut theme = valid_user_manifest();
    theme.image = "../outside.webp".into();
    assert_eq!(validate_manifest(&theme, ThemeSource::User).unwrap_err().code(), "invalid_image_name");

    let mut theme = valid_user_manifest();
    theme.art.focus_x = 1.01;
    assert_eq!(validate_manifest(&theme, ThemeSource::User).unwrap_err().code(), "invalid_focus");

    let mut theme = valid_user_manifest();
    theme.colors.accent = "url(https://example.invalid/x)".into();
    assert_eq!(validate_manifest(&theme, ThemeSource::User).unwrap_err().code(), "invalid_color");
}

#[test]
fn user_ids_and_names_are_bounded() {
    assert!(is_user_theme_id("user-550e8400e29b41d4a716446655440000"));
    assert!(!is_user_theme_id("preset-gothic-void-crusade"));
    assert!(!is_user_theme_id("user-../../escape"));

    let mut theme = valid_user_manifest();
    theme.name = " ".into();
    assert_eq!(validate_manifest(&theme, ThemeSource::User).unwrap_err().code(), "invalid_name");
}
```

- [ ] **Step 2: Run the tests and confirm the red state**

Run:

```bash
cargo test --manifest-path spike/app/src-tauri/Cargo.toml theme::tests::manifest_validation -- --nocapture
```

Expected: compilation fails because the `theme` module and validation types do not exist.

- [ ] **Step 3: Implement the exact domain model**

Define these durable and wire types in `model.rs`:

```rust
pub const SCHEMA_VERSION: u32 = 1;
pub const BACKGROUND_FILE: &str = "background.webp";
pub const THUMBNAIL_FILE: &str = "thumbnail.webp";
pub const SYSTEM_THEME_ID: &str = "system";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Appearance { Auto, Light, Dark }

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ThemeSource { Bundled, User }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ThemeColors { pub accent: String }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ThemeArt { pub focus_x: f32, pub focus_y: f32 }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ThemeEffects { pub brightness: f32, pub panel_opacity: f32, pub blur: u8 }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Attribution {
    pub author: String,
    pub license: String,
    pub source_url: String,
    pub checksum: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ThemeManifest {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub appearance: Appearance,
    pub image: String,
    pub colors: ThemeColors,
    pub art: ThemeArt,
    pub effects: ThemeEffects,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub attribution: Option<Attribution>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ThemeDraftValues {
    pub name: String,
    pub appearance: Appearance,
    pub colors: ThemeColors,
    pub art: ThemeArt,
    pub effects: ThemeEffects,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ThemeDraft {
    pub stage_id: String,
    pub values: ThemeDraftValues,
    pub background_data_url: String,
    pub thumbnail_data_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveThemeRequest {
    pub theme_id: Option<String>,
    pub stage_id: Option<String>,
    pub values: ThemeDraftValues,
}
```

Use these limits in one `validate_manifest` function: name length `1..=48` Unicode scalar values, `focusX/focusY` `0.0..=1.0`, brightness `0.35..=1.20`, panel opacity `0.40..=0.96`, blur `0..=32`, accent matching `^#[0-9a-fA-F]{6}$`, image exactly `background.webp`, user IDs matching `user-` plus 32 lowercase hex characters, and bundled IDs matching `preset-` plus lowercase ASCII letters/digits/hyphens. Bundled themes require complete attribution; user themes reject attribution from the request and store `None`.

Validate save identity as an exclusive pair: a new theme requires `themeId = null` plus a valid `stageId`; editing requires a valid user `themeId` plus `stageId = null`. The store generates the final `user-` ID only when a new save commits, so a cancelled import never consumes a durable theme ID.

- [ ] **Step 4: Add stable errors without exposing local paths**

Implement `ThemeError { code: &'static str, message: String }`, `Display`, and `From` conversions. Error display sent over IPC must include the code and user-facing Chinese message, but filesystem errors must be mapped to operation names such as “无法保存主题” rather than embedding absolute paths.

- [ ] **Step 5: Re-run the model tests**

Run:

```bash
cargo test --manifest-path spike/app/src-tauri/Cargo.toml theme::tests::manifest -- --nocapture
```

Expected: all manifest tests pass.

- [ ] **Step 6: Commit the domain boundary**

```bash
git add spike/app/src-tauri/src/theme/error.rs spike/app/src-tauri/src/theme/model.rs spike/app/src-tauri/src/theme/mod.rs spike/app/src-tauri/src/theme/tests.rs
git add -p spike/app/src-tauri/src/lib.rs
git commit -m "feat: define safe desktop theme schema"
```

### Task 2: Build the secure image normalization pipeline

**Files:**
- Create: `spike/app/src-tauri/src/theme/image.rs`
- Modify: `spike/app/src-tauri/src/theme/mod.rs`
- Modify: `spike/app/src-tauri/src/theme/tests.rs`
- Modify: `spike/app/src-tauri/Cargo.toml`
- Modify: `spike/app/src-tauri/Cargo.lock`

- [ ] **Step 1: Add dependencies**

Add:

```toml
[dependencies]
base64 = "0.22"
image = { version = "0.25", default-features = false, features = ["jpeg", "png", "webp"] }
sha2 = "0.10"
uuid = { version = "1", features = ["v4", "serde"] }

[dev-dependencies]
tempfile = "3"
```

Run `cargo check --manifest-path spike/app/src-tauri/Cargo.toml` once to update the lockfile. Expected: exit 0.

- [ ] **Step 2: Write failing file-signature and size tests**

Create in-memory PNG/JPEG/WebP fixtures and assert:

```rust
#[test]
fn image_input_checks_signature_extension_and_limits() {
    let dir = tempfile::tempdir().unwrap();
    let png = write_test_png(dir.path(), "wall.png", 120, 80);
    assert_eq!(inspect_source(&png).unwrap().format, SupportedImage::Png);

    let mismatch = dir.path().join("wall.jpg");
    std::fs::copy(&png, &mismatch).unwrap();
    assert_eq!(inspect_source(&mismatch).unwrap_err().code(), "signature_mismatch");

    let huge = write_png_header_only(dir.path(), "huge.png", 10_000, 5_000);
    assert_eq!(inspect_source(&huge).unwrap_err().code(), "pixel_limit");
}
```

Also test a sparse file of `20 * 1024 * 1024 + 1` bytes returns `file_limit`, corrupt bytes return `decode_failed`, and an animated WebP fixture returns `animated_image`.

- [ ] **Step 3: Run the focused tests and confirm failure**

```bash
cargo test --manifest-path spike/app/src-tauri/Cargo.toml theme::tests::image_input -- --nocapture
```

Expected: compilation fails because `inspect_source` and `SupportedImage` do not exist.

- [ ] **Step 4: Implement inspection before full decode**

`inspect_source` must:

1. read metadata and reject files over `20 * 1024 * 1024` bytes;
2. map `.png`, `.jpg`/`.jpeg`, and `.webp` to an expected format;
3. call `image::guess_format` and require it to match the extension;
4. read dimensions from the decoder header and reject `width * height > 40_000_000` using checked multiplication;
5. reject zero dimensions and animated sources;
6. only then perform the full decode.

- [ ] **Step 5: Write failing normalization tests**

```rust
#[test]
fn normalized_assets_are_bounded_metadata_free_and_deterministic() {
    let dir = tempfile::tempdir().unwrap();
    let source = write_gradient_jpeg_with_exif(dir.path(), 4000, 2000);
    let first = normalize_image(&source, &dir.path().join("first")).unwrap();
    let second = normalize_image(&source, &dir.path().join("second")).unwrap();

    assert_eq!((first.width, first.height), (2560, 1280));
    assert!(first.thumbnail_width <= 480 && first.thumbnail_height <= 300);
    assert_eq!(first.accent, second.accent);
    assert_eq!(sha256_file(&first.background).unwrap(), sha256_file(&second.background).unwrap());
    assert!(!read_bytes(&first.background).windows(4).any(|w| w == b"Exif"));
}
```

- [ ] **Step 6: Implement deterministic output**

Resize without upscaling to a maximum edge of 2560 using `FilterType::Lanczos3`; create a maximum `480x300` thumbnail; re-encode both as WebP from decoded RGBA pixels; never copy source metadata. Derive the accent by sampling the normalized image on a fixed 32-pixel grid, discarding pixels with luminance below `0.08` or above `0.92`, selecting the highest chroma bucket, and clamping the final RGB color to a readable saturation/luminance range. Return `#rrggbb` in lowercase.

- [ ] **Step 7: Run all image tests**

```bash
cargo test --manifest-path spike/app/src-tauri/Cargo.toml theme::tests::image -- --nocapture
```

Expected: all image tests pass.

- [ ] **Step 8: Commit the image pipeline**

```bash
git add spike/app/src-tauri/src/theme/image.rs spike/app/src-tauri/src/theme/mod.rs spike/app/src-tauri/src/theme/tests.rs
git add -p spike/app/src-tauri/Cargo.toml spike/app/src-tauri/Cargo.lock
git commit -m "feat: normalize imported theme artwork safely"
```

### Task 3: Implement the atomic local theme store

**Files:**
- Create: `spike/app/src-tauri/src/theme/store.rs`
- Modify: `spike/app/src-tauri/src/theme/model.rs`
- Modify: `spike/app/src-tauri/src/theme/mod.rs`
- Modify: `spike/app/src-tauri/src/theme/tests.rs`

- [ ] **Step 1: Write failing catalog, activation, and deletion tests**

Use two separate temporary roots, `bundled/presets` and `data/themes`, then assert:

```rust
#[test]
fn store_lists_sources_and_falls_back_from_a_missing_active_theme() {
    let fixture = ThemeStoreFixture::new();
    fixture.add_bundled("preset-a");
    fixture.add_user("user-550e8400e29b41d4a716446655440000");
    fixture.write_active("user-deadbeefdeadbeefdeadbeefdeadbeef");

    let catalog = fixture.store.catalog().unwrap();
    assert_eq!(catalog.active_id, SYSTEM_THEME_ID);
    assert_eq!(catalog.themes.len(), 2);
    assert!(catalog.warning.unwrap().contains("已还原为系统主题"));
}

#[test]
fn deleting_active_user_theme_persists_system_before_scoped_removal() {
    let fixture = ThemeStoreFixture::new();
    let id = "user-550e8400e29b41d4a716446655440000";
    fixture.add_user(id);
    fixture.store.activate(id).unwrap();
    fixture.store.delete(id).unwrap();

    assert_eq!(fixture.store.read_active().unwrap(), SYSTEM_THEME_ID);
    assert!(!fixture.user_dir(id).exists());
    assert!(fixture.sibling_sentinel().exists());
}
```

Add explicit tests that bundled deletion/update is rejected, unknown IDs are rejected, symlinks/reparse-point escapes are rejected, and corrupt user manifests are omitted but left on disk.

- [ ] **Step 2: Run the store tests and confirm failure**

```bash
cargo test --manifest-path spike/app/src-tauri/Cargo.toml theme::tests::store -- --nocapture
```

Expected: compilation fails because `ThemeStore` is undefined.

- [ ] **Step 3: Implement paths and catalog DTOs**

Define:

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeSummary {
    pub manifest: ThemeManifest,
    pub source: ThemeSource,
    pub thumbnail_data_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeCatalog {
    pub active_id: String,
    pub themes: Vec<ThemeSummary>,
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedTheme {
    pub manifest: ThemeManifest,
    pub source: ThemeSource,
    pub background_data_url: String,
}
```

`ThemeStore::new(bundled_root, data_root)` creates only `data_root/user` and `data_root/staging`. Bundled resources are never created or modified by the store.

- [ ] **Step 4: Implement safe catalog and asset reads**

For each immediate child directory, reject links/reparse points, parse `theme.json` with `deny_unknown_fields`, validate the manifest against its source, require the fixed background and thumbnail files, and encode image bytes as `data:image/webp;base64,...`. Sort bundled themes first by manifest name, then user themes by name. A corrupt user entry produces one catalog warning and remains on disk.

- [ ] **Step 5: Write failing save/replace/recovery tests**

Cover new-save, edit, failure before active write, target-exists replacement, and abandoned backup recovery:

```rust
#[test]
fn save_commits_complete_theme_before_active_record() {
    let fixture = ThemeStoreFixture::new();
    let draft = fixture.stage_import();
    fixture.store.fail_next_active_write();
    let result = fixture.store.save(save_request_for(&draft));

    assert_eq!(result.unwrap_err().code(), "active_write_failed");
    assert_eq!(fixture.store.read_active().unwrap(), SYSTEM_THEME_ID);
    assert_eq!(fixture.store.catalog().unwrap().themes.len(), 1);
}
```

- [ ] **Step 6: Implement atomic writes and Windows-safe directory swap**

Use sibling paths ending in `.new` and `.bak`. Write and flush each file, validate the complete `.new` directory, rename the existing target to `.bak`, rename `.new` to the target, restore `.bak` if the second rename fails, then remove `.bak`. Write `active.json.new`, flush, and replace `active.json` after the theme commit. On startup, recover a missing target from `.bak`, remove a stale `.new`, and delete staging directories older than 24 hours.

- [ ] **Step 7: Run all theme-store tests**

```bash
cargo test --manifest-path spike/app/src-tauri/Cargo.toml theme::tests::store -- --nocapture
```

Expected: all store tests pass.

- [ ] **Step 8: Commit the store**

```bash
git add spike/app/src-tauri/src/theme/model.rs spike/app/src-tauri/src/theme/store.rs spike/app/src-tauri/src/theme/mod.rs spike/app/src-tauri/src/theme/tests.rs
git commit -m "feat: persist desktop themes atomically"
```

### Task 4: Expose only the Theme Bridge to the loopback UI

**Files:**
- Create: `spike/app/src-tauri/src/theme/commands.rs`
- Create: `spike/app/src-tauri/permissions/theme-commands.toml`
- Create: `spike/app/src-tauri/capabilities/theme-loopback.json`
- Modify: `spike/app/src-tauri/src/lib.rs`
- Modify: `spike/app/src-tauri/src/theme/mod.rs`
- Modify: `spike/app/src-tauri/src/theme/tests.rs`

- [ ] **Step 1: Add command-service tests without an AppHandle**

Test a `ThemeService` constructed from temporary roots: `catalog`, `load`, `save`, `activate`, `delete`, and `discard_stage`. Assert that import cancellation returns `None` and makes no staging directory, while a selected path returns a validated draft.

- [ ] **Step 2: Run the service tests and confirm failure**

```bash
cargo test --manifest-path spike/app/src-tauri/Cargo.toml theme::tests::service -- --nocapture
```

Expected: compilation fails because `ThemeService` and command DTOs are not defined.

- [ ] **Step 3: Implement the seven commands**

Use these signatures in `commands.rs`:

```rust
#[tauri::command]
pub fn theme_catalog(app: AppHandle) -> Result<ThemeCatalog, String>;

#[tauri::command]
pub fn theme_load(app: AppHandle, theme_id: String) -> Result<ResolvedTheme, String>;

#[tauri::command]
pub async fn theme_import_image(app: AppHandle) -> Result<Option<ThemeDraft>, String>;

#[tauri::command]
pub fn theme_save(app: AppHandle, request: SaveThemeRequest) -> Result<ResolvedTheme, String>;

#[tauri::command]
pub fn theme_activate(app: AppHandle, theme_id: String) -> Result<ResolvedTheme, String>;

#[tauri::command]
pub fn theme_delete(app: AppHandle, theme_id: String) -> Result<ThemeCatalog, String>;

#[tauri::command]
pub fn theme_discard_stage(app: AppHandle, stage_id: String) -> Result<(), String>;
```

The async import command uses `tauri_plugin_dialog::DialogExt` in Rust, filters PNG/JPEG/WebP, and passes only the native selected `PathBuf` to `ThemeService`. The loopback page never receives an arbitrary-path read command.

- [ ] **Step 4: Register commands and startup recovery**

Add `pub mod theme;` near the top of `lib.rs`. During setup, construct the service roots from `DSH_STUDIO_THEME_DIR` or `app_data_dir()/themes`, and from `DSH_STUDIO_THEMES_DIR` or bundled `themes/`; run nonfatal recovery before `start_studio`. Add all seven names to `tauri::generate_handler!`.

- [ ] **Step 5: Define application permissions**

Create `permissions/theme-commands.toml`:

```toml
[[permission]]
identifier = "allow-theme-commands"
description = "Allows DSH Studio's loopback UI to manage only the app-owned theme store."
commands.allow = [
  "theme_catalog",
  "theme_load",
  "theme_import_image",
  "theme_save",
  "theme_activate",
  "theme_delete",
  "theme_discard_stage",
]
```

Create `capabilities/theme-loopback.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "theme-loopback",
  "description": "Theme-only IPC for the DSH web host on a random loopback port.",
  "local": false,
  "windows": ["main"],
  "remote": { "urls": ["http://127.0.0.1:*/*"] },
  "permissions": ["allow-theme-commands"],
  "platforms": ["macOS", "windows"]
}
```

Do not add `dialog:*`, `fs:*`, `shell:*`, `opener:*`, or `core:default` to this remote capability.

- [ ] **Step 6: Verify generated ACL and Rust compilation**

Run:

```bash
cargo test --manifest-path spike/app/src-tauri/Cargo.toml
cargo check --manifest-path spike/app/src-tauri/Cargo.toml
```

Expected: all tests pass and the Tauri build script accepts the capability and application permission identifiers.

- [ ] **Step 7: Commit the Theme Bridge**

```bash
git add spike/app/src-tauri/src/theme spike/app/src-tauri/permissions/theme-commands.toml spike/app/src-tauri/capabilities/theme-loopback.json
git add -p spike/app/src-tauri/src/lib.rs
git commit -m "feat: expose a least-privilege theme bridge"
```

### Task 5: Add the typed client bridge and controller state machine

**Files:**
- Create: `spike/plugins/dsh-studio-themes/src/types.ts`
- Create: `spike/plugins/dsh-studio-themes/src/bridge.ts`
- Create: `spike/plugins/dsh-studio-themes/src/controller.ts`
- Create: `spike/plugins/dsh-studio-themes/tests/setup.ts`
- Create: `spike/plugins/dsh-studio-themes/tests/bridge.test.ts`
- Create: `spike/plugins/dsh-studio-themes/tests/controller.test.ts`
- Create: `spike/plugins/dsh-studio-themes/vitest.config.ts`
- Modify: `spike/plugins/dsh-studio-themes/package.json`
- Modify: `spike/plugins/package.json`
- Modify: `spike/plugins/pnpm-lock.yaml`

- [ ] **Step 1: Install the focused test harness**

Add package scripts:

```json
{
  "scripts": {
    "bundle": "tsdown",
    "test": "vitest run"
  }
}
```

Add workspace dev dependencies for `vitest`, `jsdom`, `react`, `react-dom`, `@types/react-dom`, `@testing-library/react`, and `@testing-library/user-event`. Run:

```bash
pnpm --dir spike/plugins install
```

Expected: lockfile updates successfully.

- [ ] **Step 2: Write failing bridge contract tests**

```ts
it('uses only the seven allowed command names and camelCase arguments', async () => {
  const invoke = vi.fn().mockResolvedValue(undefined)
  installTauriMock(invoke)
  const bridge = createThemeBridge()

  await bridge.activate('preset-milky-way')
  await bridge.discardStage('stage-123')

  expect(invoke).toHaveBeenNthCalledWith(1, 'theme_activate', { themeId: 'preset-milky-way' })
  expect(invoke).toHaveBeenNthCalledWith(2, 'theme_discard_stage', { stageId: 'stage-123' })
})
```

Also assert that missing `window.__TAURI__` throws the stable desktop-only error before any state mutation.

- [ ] **Step 3: Implement exact TypeScript DTOs and bridge methods**

Mirror every Rust DTO in `types.ts`; no optional property may differ between the languages. `ThemeBridge` exposes:

```ts
export interface ThemeDraftValues {
  name: string
  appearance: Appearance
  colors: ThemeColors
  art: ThemeArt
  effects: ThemeEffects
}

export interface ThemeDraftPatch {
  name?: string
  appearance?: Appearance
  colors?: Partial<ThemeColors>
  art?: Partial<ThemeArt>
  effects?: Partial<ThemeEffects>
}

export interface SaveThemeRequest {
  themeId: string | null
  stageId: string | null
  values: ThemeDraftValues
}

export interface ThemeBridge {
  catalog(): Promise<ThemeCatalog>
  load(themeId: string): Promise<ResolvedTheme>
  importImage(): Promise<ThemeDraft | null>
  save(request: SaveThemeRequest): Promise<ResolvedTheme>
  activate(themeId: string): Promise<ResolvedTheme>
  delete(themeId: string): Promise<ThemeCatalog>
  discardStage(stageId: string): Promise<void>
}
```

- [ ] **Step 4: Write failing controller transition tests**

Test these exact sequences with a fake bridge and renderer:

```ts
it('restores the rollback theme and discards staging on cancel', async () => {
  const { controller, bridge, renderer } = readyController('preset-milky-way')
  bridge.importImage.mockResolvedValue(importDraft('stage-123'))

  await controller.importImage()
  controller.patchDraft({ effects: { brightness: 0.55 } })
  await controller.cancelEditor()

  expect(renderer.restoreCommitted).toHaveBeenCalledWith('preset-milky-way')
  expect(bridge.discardStage).toHaveBeenCalledWith('stage-123')
  expect(controller.getSnapshot().editor).toBeNull()
})

it('keeps draft values and active selection when save fails', async () => {
  const { controller, bridge } = readyController('preset-milky-way')
  await controller.importImage()
  controller.patchDraft({ name: '海边工作室' })
  bridge.save.mockRejectedValue(new Error('disk full'))

  await controller.saveEditor()

  expect(controller.getSnapshot().editor?.draft.name).toBe('海边工作室')
  expect(controller.getSnapshot().activeId).toBe('preset-milky-way')
  expect(controller.getSnapshot().error).toContain('disk full')
})
```

Also cover initial corrupt-active warning, immediate card activation, editing a user theme, deleting the active theme, save retry, and ignoring stale async completions with an operation counter.

- [ ] **Step 5: Implement `ThemeController` as an external store**

The snapshot shape is:

```ts
export interface ThemeControllerSnapshot {
  phase: 'loading' | 'ready' | 'error'
  catalog: ThemeCatalog | null
  activeId: string
  editor: null | {
    mode: 'create' | 'edit'
    rollbackId: string
    stageId: string | null
    draft: ThemeDraftValues
    backgroundDataUrl: string
    thumbnailDataUrl: string
    saving: boolean
  }
  error: string | null
}
```

Expose `subscribe`, `getSnapshot`, `load`, `activate`, `restoreDefault`, `importImage`, `edit`, `patchDraft(patch: ThemeDraftPatch)`, `cancelEditor`, `saveEditor`, `deleteUserTheme`, and `dispose`. `patchDraft` performs an immutable deep merge of `colors`, `art`, and `effects`; it never replaces omitted nested fields. Never mutate a published snapshot or nested draft. Preview calls are synchronous; persistence calls publish loading/error states and discard stale results by operation sequence.

- [ ] **Step 6: Run bridge and controller tests**

```bash
pnpm --dir spike/plugins --filter dsh-studio-themes test -- bridge.test.ts controller.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 7: Commit the client state boundary**

```bash
git add spike/plugins/package.json spike/plugins/pnpm-lock.yaml spike/plugins/dsh-studio-themes/package.json spike/plugins/dsh-studio-themes/vitest.config.ts spike/plugins/dsh-studio-themes/src/types.ts spike/plugins/dsh-studio-themes/src/bridge.ts spike/plugins/dsh-studio-themes/src/controller.ts spike/plugins/dsh-studio-themes/tests
git commit -m "feat: add typed theme client state"
```

### Task 6: Render a full-window theme without breaking native controls

**Files:**
- Create: `spike/plugins/dsh-studio-themes/src/tokens.ts`
- Create: `spike/plugins/dsh-studio-themes/src/renderer.ts`
- Create: `spike/plugins/dsh-studio-themes/src/styles.ts`
- Create: `spike/plugins/dsh-studio-themes/tests/tokens.test.ts`
- Create: `spike/plugins/dsh-studio-themes/tests/renderer.test.ts`

- [ ] **Step 1: Write failing token contrast tests**

```ts
it.each(['#000000', '#ffffff', '#d4a15f', '#23eaee'])('derives readable semantic tokens from %s', (accent) => {
  for (const scheme of ['light', 'dark'] as const) {
    const tokens = deriveTokens(themeWith({ accent, appearance: scheme }), scheme)
    expect(contrast(tokens['--dsw-alias-label-primary'], composite(tokens['--dsw-alias-bg-layer-1']))).toBeGreaterThanOrEqual(4.5)
    expect(tokens['--dsw-alias-bg-base']).toBe('transparent')
    expect(tokens['--dsw-alias-state-error-primary']).toBeDefined()
  }
})
```

Test every returned token is a safe literal color/rgba/transparent value, opacity affects panels only, and the accent is adjusted when it fails 3:1 against the panel.

- [ ] **Step 2: Implement semantic token derivation**

Return values for background base, layer 1, layer 2, overlay, border L1/L2, brand primary, label primary/secondary, error/success/warn, and sidebar fill. Use fixed readable light/dark foregrounds, derive panel alpha from `panelOpacity`, and adjust only the accent luminance until it reaches 3:1 against the panel. Do not emit selectors or arbitrary user strings.

- [ ] **Step 3: Write failing renderer lifecycle tests**

```ts
it('owns one noninteractive wallpaper and restores system on dispose', () => {
  const theme = fakeThemeRuntime()
  const sessions = fakeSessions({ current: undefined })
  const renderer = new ThemeRenderer(theme, sessions)

  renderer.apply(committedTheme())
  const wall = document.querySelector('[data-dsh-studio-wallpaper]') as HTMLElement
  expect(wall).not.toBeNull()
  expect(getComputedStyle(wall).pointerEvents).toBe('none')
  expect(document.body.dataset.dshStudioSurface).toBe('home')

  renderer.dispose()
  expect(document.querySelector('[data-dsh-studio-wallpaper]')).toBeNull()
  expect(theme.setTheme).toHaveBeenLastCalledWith('system')
})
```

Also verify a selected blank session maps to `home`, a nonblank current session maps to `conversation`, preview replacement does not persist, cancel re-renders the committed theme, and changing Auto appearance follows `matchMedia`.

- [ ] **Step 4: Implement renderer ownership**

`ThemeRenderer` owns generic registered IDs `dsh-studio-active` and `dsh-studio-preview`; individual catalog IDs never enter DSH preferences. It disposes and re-registers the active definition when the scheme changes, uses `theme.overrideTokens('dsh-studio-themes:preview', pairs)` for continuous editor changes, and calls `theme.setTheme` only with a registered generic ID or `system`.

The wallpaper DOM is:

```html
<div data-dsh-studio-wallpaper aria-hidden="true">
  <div data-dsh-studio-wallpaper-image></div>
  <div data-dsh-studio-wallpaper-scrim></div>
</div>
```

`styles.ts` sets it fixed to the full viewport with `pointer-events:none` and `z-index:0`, sets `body > #root` to a transparent positioned layer with `z-index:1`, and makes the conversation scrim stronger than the home scrim. The image layer uses `background-size:cover`, focal percentages, brightness, and blur with an overscan transform that prevents blurred edges.

- [ ] **Step 5: Subscribe to the stable DSH session store**

Read `ctx.sessions.list.getSnapshot()` and subscribe to `ctx.sessions.list`. Surface is `home` when no current session exists or the selected summary has `blank === true`; otherwise it is `conversation`. Do not query CSS-module class names or Codex DOM selectors.

- [ ] **Step 6: Run renderer tests**

```bash
pnpm --dir spike/plugins --filter dsh-studio-themes test -- tokens.test.ts renderer.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 7: Commit rendering**

```bash
git add spike/plugins/dsh-studio-themes/src/tokens.ts spike/plugins/dsh-studio-themes/src/renderer.ts spike/plugins/dsh-studio-themes/src/styles.ts spike/plugins/dsh-studio-themes/tests/tokens.test.ts spike/plugins/dsh-studio-themes/tests/renderer.test.ts
git commit -m "feat: render full-window desktop themes"
```

### Task 7: Replace the experimental row with the complete settings experience

**Files:**
- Replace: `spike/plugins/dsh-studio-themes/src/client.tsx`
- Create: `spike/plugins/dsh-studio-themes/src/ThemeSettingsSection.tsx`
- Create: `spike/plugins/dsh-studio-themes/tests/ThemeSettingsSection.test.tsx`
- Modify: `spike/plugins/dsh-studio-themes/src/styles.ts`
- Modify: `spike/plugins/dsh-studio-themes/package.json`
- Regenerate: `spike/plugins/dsh-studio-themes/lib/client.js`

- [ ] **Step 1: Write failing settings-section accessibility tests**

Render with a ready controller and assert:

```tsx
expect(screen.getByRole('heading', { name: '主题与外观' })).toBeVisible()
expect(screen.getByRole('button', { name: '还原默认' })).toBeEnabled()
expect(screen.getAllByRole('button', { name: /应用主题/ })).toHaveLength(3)
expect(screen.getByRole('button', { name: '导入本地图片' })).toBeEnabled()
expect(screen.getByRole('button', { name: /银河 Milky Way/ })).toHaveAttribute('aria-pressed', 'true')
```

Add user-event tests for keyboard activation, non-color selection labels, import cancellation, all editor controls, focal-point click math, Cancel, unmount while editing, save failure/retry, edit, two-step delete confirmation, deleting active theme, and bundled cards lacking edit/delete buttons.

- [ ] **Step 2: Run the UI test and confirm failure**

```bash
pnpm --dir spike/plugins --filter dsh-studio-themes test -- ThemeSettingsSection.test.tsx
```

Expected: compilation fails because the section component does not exist.

- [ ] **Step 3: Implement the settings gallery**

The section renders:

1. title and short offline/local explanation;
2. current-theme card with source, author/license when bundled, and Restore Default;
3. exactly three bundled cards;
4. My Themes cards and Import Local Image;
5. loading, empty, warning, and retry states.

Cards are native buttons with `aria-pressed`; Edit/Delete are separate buttons outside the apply button to avoid nested interactive controls. Thumbnail alt text is empty because the adjacent name is the accessible label.

- [ ] **Step 4: Implement the editor without custom CSS input**

Use controlled fields for name, Auto/Light/Dark, native color input plus hex text, brightness range `0.35..1.20`, opacity range `0.40..0.96`, blur range `0..32`, and a focus preview. Convert pointer coordinates through `getBoundingClientRect`, clamp to `0..1`, and call `controller.patchDraft` on every valid change. Render Cancel and Save as explicit footer actions; disable Save only while invalid or saving.

- [ ] **Step 5: Wire the plugin at startup**

`client.tsx` injects `slots`, `theme`, and `sessions`; constructs one bridge, renderer, and controller; starts `controller.load()`; registers `settings.section` with ID `dsh-studio-themes`, order `15`, and label `主题与外观`; and disposes controller/renderer/style registrations through `ctx.effect`. Remove every reference to `studio-raccoon-warm`, `studio-ink-green`, `RACCOON_WARM`, `INK_GREEN`, and `settings.general.item`.

- [ ] **Step 6: Run UI and full client tests**

```bash
pnpm --dir spike/plugins --filter dsh-studio-themes test
pnpm --dir spike/plugins --filter dsh-studio-themes bundle
```

Expected: all tests pass and `lib/client.js` is regenerated without the two rejected theme IDs.

- [ ] **Step 7: Verify the built bundle contains only supported externals**

```bash
rg -n "require\(" spike/plugins/dsh-studio-themes/lib/client.js
rg -n "studio-raccoon-warm|studio-ink-green" spike/plugins/dsh-studio-themes
```

Expected: requires are limited to the configured React/DSH platform modules; the rejected IDs produce no matches.

- [ ] **Step 8: Commit the settings experience**

```bash
git add spike/plugins/dsh-studio-themes/src spike/plugins/dsh-studio-themes/tests spike/plugins/dsh-studio-themes/lib/client.js spike/plugins/dsh-studio-themes/package.json
git commit -m "feat: add theme gallery and live editor"
```

### Task 8: Vendor exactly three audited offline presets

**Files:**
- Create: `spike/app/src-tauri/examples/prepare_theme_asset.rs`
- Create: `spike/themes/asset-audit.json`
- Create: `spike/themes/NOTICE.md`
- Create: `spike/themes/verify-assets.mjs`
- Create: `spike/themes/presets/preset-gothic-void-crusade/theme.json`
- Create: `spike/themes/presets/preset-gothic-void-crusade/background.webp`
- Create: `spike/themes/presets/preset-gothic-void-crusade/thumbnail.webp`
- Create: `spike/themes/presets/preset-gothic-void-crusade/LICENSE.txt`
- Create: `spike/themes/presets/preset-milky-way/theme.json`
- Create: `spike/themes/presets/preset-milky-way/background.webp`
- Create: `spike/themes/presets/preset-milky-way/thumbnail.webp`
- Create: `spike/themes/presets/preset-milky-way/LICENSE.txt`
- Create: `spike/themes/presets/preset-sunset-voyage/theme.json`
- Create: `spike/themes/presets/preset-sunset-voyage/background.webp`
- Create: `spike/themes/presets/preset-sunset-voyage/thumbnail.webp`
- Create: `spike/themes/presets/preset-sunset-voyage/LICENSE.txt`
- Modify: `spike/app/src-tauri/tauri.conf.json`
- Modify: `spike/app/src-tauri/src/theme/tests.rs`

- [ ] **Step 1: Re-fetch rights and hashes before downloading assets**

Verify these pinned records against their live primary sources:

| Preset | Rights evidence | Source package/file SHA-256 |
|---|---|---|
| Gothic Void Crusade by seansong-ideogram | Upstream `macos/NOTICE.md` says it was contributed through PR #134 for the MIT project and is the redistributable installer default | source JPEG `b76a7cbe2ff9d923846e931984d243a7ba1f25de8d190b5c6412c809c41aee42` |
| 银河 Milky Way by F4 | Gallery version `ver_5f02aacdf1fc16b53c90`, MIT; manifest provenance says it was photographed by the publisher with a Sony camera in Malaysia | package `1d0bdb18bec984ef509e396c6c87c686d20fc28781d19bd0ef575d44a0d5a26e`; source JPEG `f2084edb518161876f7573c7a6eb6c86c65351e751f3d2e38c67f393c7cbdcd3` |
| 见夕阳 by Joker Pan | Gallery version `ver_39e9254e451200ea80b0`, MIT; manifest provenance says AI-generated with GPT; inspected image is a generic landscape with no person or protected character | package `6f0869f962c9e5a49c5fc84c0b83b8e5dd1f1eb784b0e6a5f5abfaf66bf10181`; source PNG `22f399e981ac3f93cf1b3ae35a0cd70b3a5432ed8ed9e2bc7c8aec885af3f5eb` |

If a version, license, provenance, or hash differs, stop asset bundling and report the mismatch. Do not substitute a recognizable person, franchise, wallpaper-aggregator image, or theme with only “personal use” rights.

- [ ] **Step 2: Download to a fresh temporary directory and verify bytes**

Run with a task-specific directory returned by `mktemp -d`:

```bash
DSH_THEME_TMP="$(mktemp -d /tmp/dsh-theme-assets.XXXXXX)"
export DSH_THEME_TMP
curl -fsSL https://raw.githubusercontent.com/Fei-Away/Codex-Dream-Skin/main/macos/presets/preset-gothic-void-crusade/background.jpg -o "$DSH_THEME_TMP/gothic.jpg"
curl -fsSL https://api.dreamskin.cc/v1/themes/ver_5f02aacdf1fc16b53c90/download -o "$DSH_THEME_TMP/milky-way.zip"
curl -fsSL https://api.dreamskin.cc/v1/themes/ver_39e9254e451200ea80b0/download -o "$DSH_THEME_TMP/sunset.zip"
shasum -a 256 "$DSH_THEME_TMP/gothic.jpg" "$DSH_THEME_TMP/milky-way.zip" "$DSH_THEME_TMP/sunset.zip"
```

Set `DSH_THEME_TMP` to the explicit `mktemp -d` result, never to a home or workspace directory. Expected hashes are the three file/package hashes in the table.

- [ ] **Step 3: Implement the deterministic preparation example**

`prepare_theme_asset.rs` accepts `--input`, `--output`, and `--thumbnail` arguments, calls the production `normalize_image`, and prints the output SHA-256 values. It refuses an output outside the repository's explicit `spike/themes/presets` target passed by the operator.

- [ ] **Step 4: Normalize and create exact manifests**

Create the three manifests with IDs `preset-gothic-void-crusade`, `preset-milky-way`, and `preset-sunset-voyage`. Preserve source appearance, focal point, and accent; use these safe defaults:

```json
{
  "preset-gothic-void-crusade": { "brightness": 0.72, "panelOpacity": 0.78, "blur": 14 },
  "preset-milky-way": { "brightness": 0.68, "panelOpacity": 0.76, "blur": 12 },
  "preset-sunset-voyage": { "brightness": 0.80, "panelOpacity": 0.72, "blur": 10 }
}
```

Set each manifest attribution checksum to the SHA-256 of its normalized `background.webp`, not the downloaded source. Record both source and normalized hashes in `asset-audit.json`.

- [ ] **Step 5: Add attribution and offline verification**

`NOTICE.md` records author, exact source URL, source version, license, provenance, source hash, normalized hash, and the Dream Skin non-affiliation notice. Each preset's `LICENSE.txt` contains the applicable MIT text and copyright attribution. `verify-assets.mjs` must fail unless there are exactly three immediate preset directories, every manifest passes the fixed schema subset, every checksum matches, every license file exists, and each attribution appears in `NOTICE.md`.

- [ ] **Step 6: Add resource packaging and preset tests**

Add to `tauri.conf.json` resources:

```json
"../../themes/": "themes/"
```

Add a Rust test that loads `../../themes/presets`, asserts exactly three bundled themes, requires attribution on all three, and verifies background hashes.

- [ ] **Step 7: Run the asset and Rust verification**

```bash
node spike/themes/verify-assets.mjs
cargo test --manifest-path spike/app/src-tauri/Cargo.toml theme::tests::bundled -- --nocapture
cargo check --manifest-path spike/app/src-tauri/Cargo.toml
```

Expected: verifier reports three presets, Rust tests pass, and Tauri config accepts the resource mapping.

- [ ] **Step 8: Commit audited presets**

```bash
git add spike/themes spike/app/src-tauri/examples/prepare_theme_asset.rs spike/app/src-tauri/src/theme/tests.rs
git add -p spike/app/src-tauri/tauri.conf.json
git commit -m "feat: bundle three audited offline themes"
```

### Task 9: Verify the integrated desktop workflow

**Files:**
- Modify only if failures require it: theme-related files listed above
- Create: `docs/superpowers/verification/2026-08-20-dsh-studio-theme-switcher.md`

- [ ] **Step 1: Run the complete automated suite from fresh commands**

```bash
cargo test --manifest-path spike/app/src-tauri/Cargo.toml
cargo check --manifest-path spike/app/src-tauri/Cargo.toml
pnpm --dir spike/plugins --filter dsh-studio-themes test
pnpm --dir spike/plugins --filter dsh-studio-themes bundle
pnpm --dir spike/app build
node spike/themes/verify-assets.mjs
git diff --check
```

Expected: every command exits 0; client tests show zero failures; asset verifier reports exactly three themes; `git diff --check` prints nothing.

- [ ] **Step 2: Start the real macOS app with isolated theme data**

Use a fresh explicit temporary theme directory while preserving the real `DSH_STUDIO_HOME` credentials/profile path:

```bash
DSH_THEME_TEST_DIR="$(mktemp -d /tmp/dsh-theme-test.XXXXXX)"
export DSH_THEME_TEST_DIR
DSH_STUDIO_THEME_DIR="$DSH_THEME_TEST_DIR" pnpm --dir spike/app tauri dev
```

Set `DSH_THEME_TEST_DIR` to a newly created temporary directory. Confirm the main window leaves the splash screen and the DSH host is healthy before visual testing.

- [ ] **Step 3: Execute the macOS acceptance matrix**

Record pass/fail and screenshots for:

1. each bundled theme on home and nonblank conversation;
2. keyboard navigation and visible selected state;
3. local PNG/JPEG/WebP import;
4. every editor control and focal-point selection;
5. Cancel restoring the exact previous theme;
6. Save, restart, and persisted reapplication;
7. edit and retry after a forced unwritable-store failure;
8. delete active theme and System fallback;
9. approval, stop, composer, error, modal, and focus-ring readability;
10. pointer interaction through every wallpaper region;
11. offline startup and switching;
12. a browser-console attempt to invoke `data_dir`, `clear_sessions`, `dialog.open`, and filesystem commands from the loopback page, all of which must be denied.

- [ ] **Step 4: Run the Windows acceptance matrix**

Build on Windows with the same repository revision and repeat the twelve checks. Additionally verify target-existing theme edits recover correctly across an interrupted directory replacement and that no console window appears in release mode.

- [ ] **Step 5: Write the evidence report**

The verification document must include commit hash, OS versions, exact commands and exit codes, automated test counts, paths to screenshots, each acceptance result, any contrast adjustment made, and confirmation that test theme data was isolated from the user's real theme store.

- [ ] **Step 6: Run final scope and secret checks**

```bash
git status --short
git diff --cached --name-only
rg -n "API_KEY|SECRET|TOKEN|DSH_STUDIO_HOME|/Users/" spike/themes spike/plugins/dsh-studio-themes spike/app/src-tauri/src/theme docs/superpowers/verification
```

Expected: no credentials or absolute user paths; staged paths are theme implementation/evidence only; unrelated dirty files remain unstaged.

- [ ] **Step 7: Commit verified evidence**

```bash
git add docs/superpowers/verification/2026-08-20-dsh-studio-theme-switcher.md
git commit -m "test: verify desktop theme switching"
```

## Completion Gate

Do not claim the feature complete until all of these are true:

- Rust tests cover manifest validation, image limits/signatures, normalization, path escapes, atomic recovery, preset immutability, deletion scope, and active fallback.
- Client tests cover bridge arguments, controller rollback/retry, renderer ownership, token contrast, keyboard access, editor behavior, and delete confirmation.
- The built bundle contains neither rejected experimental theme ID.
- `theme-loopback.json` grants only `allow-theme-commands` to the loopback origin.
- Exactly three licensed preset directories pass the offline hash verifier.
- Real macOS and Windows evidence covers home, conversation, persistence, delete-active fallback, native controls, pointer pass-through, and offline use.
- Existing unrelated worktree changes are preserved and excluded from theme commits.
