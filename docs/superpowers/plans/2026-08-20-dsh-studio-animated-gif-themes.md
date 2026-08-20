# DSH Studio Animated GIF Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users import a bounded animated GIF as a local DSH Studio wallpaper while keeping a static WebP gallery thumbnail and the existing safe atomic theme store.

**Architecture:** Extend the Rust image pipeline with the `image` crate's GIF decoder, stream every decoded frame through explicit resource budgets, retain the validated original as `background.gif`, and create `thumbnail.webp` from the first composited frame. Keep `ThemeManifest.image` as the asset selector, teach the store to handle exactly one safe background kind, and pass a `data:image/gif` URL through the unchanged CSS wallpaper renderer.

**Tech Stack:** Rust 2021, `image 0.25` with `gif`, Tauri 2, React 18, TypeScript, Vitest, Rust unit tests.

---

## File map

- `spike/app/src-tauri/Cargo.toml` — enable the already-used image crate's GIF decoder.
- `spike/app/src-tauri/src/theme/image.rs` — signature checks, streamed GIF budgets, source preservation, thumbnail generation.
- `spike/app/src-tauri/src/theme/model.rs` — permit `background.gif` only for user themes.
- `spike/app/src-tauri/src/theme/store.rs` — atomically copy and load the manifest-selected background with the correct MIME type.
- `spike/app/src-tauri/src/theme/mod.rs` — expose GIF draft previews as `data:image/gif`.
- `spike/app/src-tauri/src/theme/commands.rs` — include GIF in the native picker filter.
- `spike/app/src-tauri/src/theme/tests.rs` — real GIF fixtures and end-to-end store/service coverage.
- `spike/plugins/dsh-studio-themes/src/ThemeSettingsSection.tsx` — show GIF in accepted-format copy.
- `spike/plugins/dsh-studio-themes/tests/ThemeSettingsSection.test.tsx` — lock the copy.
- `spike/plugins/dsh-studio-themes/tests/renderer.test.ts` — prove GIF data URLs reach the wallpaper layer unchanged.
- `docs/superpowers/verification/2026-08-20-dsh-studio-theme-switcher.md` — record final automated and native verification.

### Task 1: Decode and bound animated GIF input

**Files:**
- Modify: `spike/app/src-tauri/Cargo.toml`
- Modify: `spike/app/src-tauri/src/theme/image.rs`
- Test: `spike/app/src-tauri/src/theme/tests.rs`

- [ ] **Step 1: Enable the GIF decoder and write real failing fixtures**

Add `gif` to the existing explicit image features:

```toml
image = { version = "0.25", default-features = false, features = ["gif", "jpeg", "png", "webp"] }
```

In `tests.rs`, build real multi-frame fixtures with `GifEncoder`:

```rust
use image::codecs::gif::{GifEncoder, Repeat};
use image::{Delay, Frame};

fn write_test_gif(root: &Path, name: &str, width: u32, height: u32, frames: usize, delay_ms: u32) -> PathBuf {
    let path = root.join(name);
    let file = std::fs::File::create(&path).unwrap();
    let mut encoder = GifEncoder::new(file);
    encoder.set_repeat(Repeat::Infinite).unwrap();
    for index in 0..frames {
        let buffer = ImageBuffer::from_pixel(width, height, image::Rgba([
            (index % 255) as u8,
            80,
            180,
            255,
        ]));
        encoder
            .encode_frame(Frame::from_parts(
                buffer,
                0,
                0,
                Delay::from_numer_denom_ms(delay_ms, 1),
            ))
            .unwrap();
    }
    path
}
```

Add focused expectations:

```rust
#[test]
fn gif_input_accepts_bounded_animation_and_rejects_resource_bombs() {
    let dir = tempfile::tempdir().unwrap();
    let valid = write_test_gif(dir.path(), "motion.gif", 64, 48, 3, 80);
    assert_eq!(inspect_source(&valid).unwrap().format, SupportedImage::Gif);

    let too_wide = write_test_gif(dir.path(), "wide.gif", 2561, 1, 2, 80);
    assert_eq!(inspect_source(&too_wide).unwrap_err().code(), "gif_dimensions");

    let too_many = write_test_gif(dir.path(), "frames.gif", 2, 2, 301, 10);
    assert_eq!(inspect_source(&too_many).unwrap_err().code(), "gif_frame_limit");

    let too_long = write_test_gif(dir.path(), "long.gif", 2, 2, 2, 30_001);
    assert_eq!(inspect_source(&too_long).unwrap_err().code(), "gif_duration_limit");
}
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd spike/app/src-tauri
cargo test gif_input_accepts_bounded_animation_and_rejects_resource_bombs
```

Expected: compilation or assertion failure because `SupportedImage::Gif` and GIF validation do not exist.

- [ ] **Step 3: Implement streamed validation and GIF preparation**

In `image.rs`, add:

```rust
use image::codecs::gif::GifDecoder;
use image::{AnimationDecoder, Frame};

const MAX_GIF_EDGE: u32 = 2560;
const MAX_GIF_FRAMES: u64 = 300;
const MAX_GIF_DECODED_PIXELS: u64 = 180_000_000;
const MAX_GIF_DURATION_MS: u64 = 60_000;

pub const GIF_BACKGROUND_FILE: &str = "background.gif";

pub enum SupportedImage {
    Png,
    Jpeg,
    WebP,
    Gif,
}
```

Route `.gif` to `ImageFormat::Gif`, accept only a matching signature, and keep animated PNG/WebP rejection. Decode GIF frames through `GifDecoder::new(BufReader<File>)?.into_frames()` one at a time. Increment frame count, `width * height * frame_count`, and delay from `frame.delay().numer_denom_ms()`; return the exact codes `gif_dimensions`, `gif_frame_limit`, `gif_pixel_budget`, `gif_duration_limit`, or `decode_failed` at the corresponding boundary.

Dispatch `normalize_image` by format. For GIF, retain the first decoded `Frame`, copy and `sync_all` the validated source to `background.gif`, resize its RGBA buffer to the current 480×300 thumbnail bound, and call the existing deterministic `encode_webp` for `thumbnail.webp`. Return the GIF path in `NormalizedImage.background`; static inputs continue returning `background.webp`.

- [ ] **Step 4: Verify valid, corrupt, and over-budget GIF behavior**

Add a corrupt-later-frame case by truncating a valid three-frame fixture and assert `decode_failed`. Keep production bounds in `const PRODUCTION_GIF_LIMITS: GifLimits`, route the decoder through `inspect_gif_with_limits`, and test the pixel calculation cheaply with a `GifLimits { decoded_pixels: 4 * 32 * 32, ..PRODUCTION_GIF_LIMITS }` override plus a 32×32 five-frame fixture.

Run:

```bash
cargo test gif_ -- --nocapture
cargo test image_ -- --nocapture
```

Expected: all GIF and existing static-image tests pass.

- [ ] **Step 5: Commit the decoder unit**

```bash
git add spike/app/src-tauri/Cargo.toml spike/app/src-tauri/Cargo.lock spike/app/src-tauri/src/theme/image.rs spike/app/src-tauri/src/theme/tests.rs
git commit -m "feat: validate animated GIF theme assets"
```

### Task 2: Preserve GIF assets through the atomic theme store

**Files:**
- Modify: `spike/app/src-tauri/src/theme/model.rs`
- Modify: `spike/app/src-tauri/src/theme/store.rs`
- Test: `spike/app/src-tauri/src/theme/tests.rs`

- [ ] **Step 1: Write failing manifest and store tests**

Add:

```rust
#[test]
fn user_manifest_allows_only_fixed_static_or_gif_background_names() {
    let mut user = valid_user_manifest();
    user.image = GIF_BACKGROUND_FILE.into();
    assert!(validate_manifest(&user, ThemeSource::User).is_ok());

    let mut bundled = user.clone();
    bundled.id = "preset-motion".into();
    bundled.attribution = Some(Attribution {
        author: "Theme Author".into(),
        license: "MIT".into(),
        source_url: "https://example.com/theme".into(),
        checksum: "a".repeat(64),
    });
    assert_eq!(
        validate_manifest(&bundled, ThemeSource::Bundled).unwrap_err().code(),
        "invalid_image_name"
    );
}

#[test]
fn store_saves_and_reloads_gif_with_correct_manifest_and_mime() {
    let fixture = ThemeStoreFixture::new();
    let stage_id = "stage-1234567890abcdef1234567890abcdef";
    fixture.stage_gif(stage_id);

    let saved = fixture.store.save(save_request_for(stage_id)).unwrap();
    assert_eq!(saved.manifest.image, GIF_BACKGROUND_FILE);
    assert!(saved.background_data_url.starts_with("data:image/gif;base64,"));
    assert!(fixture.user_dir(&saved.manifest.id).join(GIF_BACKGROUND_FILE).is_file());
    assert!(!fixture.user_dir(&saved.manifest.id).join(BACKGROUND_FILE).exists());
}
```

- [ ] **Step 2: Run the tests and verify RED**

```bash
cargo test user_manifest_allows_only_fixed_static_or_gif_background_names
cargo test store_saves_and_reloads_gif_with_correct_manifest_and_mime
```

Expected: GIF manifest validation and store-save assertions fail.

- [ ] **Step 3: Implement fixed-name asset selection**

In `model.rs`, export `GIF_BACKGROUND_FILE` alongside `BACKGROUND_FILE` and validate:

```rust
let image_is_valid = match source {
    ThemeSource::Bundled => manifest.image == BACKGROUND_FILE,
    ThemeSource::User => manifest.image == BACKGROUND_FILE || manifest.image == GIF_BACKGROUND_FILE,
};
```

In `store.rs`, add a helper that requires exactly one regular, non-symlink background:

```rust
fn background_name(dir: &Path) -> ThemeResult<&'static str> {
    let webp = safe_asset_exists(dir, BACKGROUND_FILE)?;
    let gif = safe_asset_exists(dir, GIF_BACKGROUND_FILE)?;
    match (webp, gif) {
        (true, false) => Ok(BACKGROUND_FILE),
        (false, true) => Ok(GIF_BACKGROUND_FILE),
        _ => Err(ThemeError::new("invalid_asset", "主题背景资源无效")),
    }
}

fn safe_asset_exists(dir: &Path, name: &str) -> ThemeResult<bool> {
    let path = dir.join(name);
    let Ok(metadata) = path.symlink_metadata() else { return Ok(false) };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(ThemeError::new("invalid_asset", "主题背景资源无效"));
    }
    Ok(true)
}
```

Use that name when copying a staged or existing asset and assign it to `ThemeManifest.image`. In `summary_from_dir` and `load_from_dir`, read `manifest.image` rather than the WebP constant. Replace `data_url(bytes)` with:

```rust
fn data_url(name: &str, bytes: &[u8]) -> String {
    let mime = if name == GIF_BACKGROUND_FILE { "image/gif" } else { "image/webp" };
    format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    )
}
```

Thumbnail calls always pass `THUMBNAIL_FILE`; background calls pass `manifest.image`.

- [ ] **Step 4: Verify atomic save, reload, edit, and deletion**

Extend the GIF store test to call `catalog`, `load`, `activate`, an edit save with `stage_id: None`, and `delete`. Assert the filename/MIME survive editing and that deletion removes only the selected user directory.

Run:

```bash
cargo test store_ -- --nocapture
cargo test manifest_ -- --nocapture
```

Expected: all store, recovery, path-safety, and manifest tests pass.

- [ ] **Step 5: Commit the store unit**

```bash
git add spike/app/src-tauri/src/theme/model.rs spike/app/src-tauri/src/theme/store.rs spike/app/src-tauri/src/theme/tests.rs
git commit -m "feat: persist animated GIF themes"
```

### Task 3: Expose GIF import through the service and native picker

**Files:**
- Modify: `spike/app/src-tauri/src/theme/mod.rs`
- Modify: `spike/app/src-tauri/src/theme/commands.rs`
- Test: `spike/app/src-tauri/src/theme/tests.rs`

- [ ] **Step 1: Write a failing service import test**

```rust
#[test]
fn service_imports_gif_with_animated_preview_and_static_thumbnail() {
    let fixture = ThemeStoreFixture::new();
    let service = ThemeService::new(fixture.bundled.clone(), fixture.data.clone()).unwrap();
    let gif = write_test_gif(fixture._temp.path(), "动态星空.gif", 64, 48, 3, 80);

    let draft = service.import_path(Some(gif)).unwrap().unwrap();
    assert_eq!(draft.values.name, "动态星空");
    assert!(draft.background_data_url.starts_with("data:image/gif;base64,"));
    assert!(draft.thumbnail_data_url.starts_with("data:image/webp;base64,"));

    let saved = service.save(SaveThemeRequest {
        theme_id: None,
        stage_id: Some(draft.stage_id),
        values: draft.values,
    }).unwrap();
    assert_eq!(saved.manifest.image, GIF_BACKGROUND_FILE);
}
```

- [ ] **Step 2: Run it and verify RED**

```bash
cargo test service_imports_gif_with_animated_preview_and_static_thumbnail
```

Expected: the background preview uses the WebP MIME or import fails.

- [ ] **Step 3: Return MIME by prepared asset name and update picker**

Replace the WebP-only helper in `mod.rs` with the same fixed filename-to-MIME mapping used by the store. Pass `normalized.background.file_name()` for the draft background and keep `thumbnail.webp` fixed.

Update `commands.rs`:

```rust
.add_filter("主题图片", &["png", "jpg", "jpeg", "webp", "gif"])
```

- [ ] **Step 4: Verify cleanup and the complete service flow**

Add a service test that imports an over-budget GIF and asserts the staging directory remains empty. Run:

```bash
cargo test service_ -- --nocapture
cargo test theme::tests -- --nocapture
```

Expected: every service and theme test passes.

- [ ] **Step 5: Commit the service unit**

```bash
git add spike/app/src-tauri/src/theme/mod.rs spike/app/src-tauri/src/theme/commands.rs spike/app/src-tauri/src/theme/tests.rs
git commit -m "feat: import GIF wallpapers from the native picker"
```

### Task 4: Update the theme UI contract

**Files:**
- Modify: `spike/plugins/dsh-studio-themes/src/ThemeSettingsSection.tsx`
- Modify: `spike/plugins/dsh-studio-themes/tests/ThemeSettingsSection.test.tsx`
- Modify: `spike/plugins/dsh-studio-themes/tests/renderer.test.ts`

- [ ] **Step 1: Write failing client tests**

In the settings test:

```ts
expect(screen.getByText('支持 PNG、JPEG、WebP、GIF，最大 20 MB')).toBeVisible()
```

In the renderer test, apply a user theme whose manifest image is `background.gif` and whose background is `data:image/gif;base64,animated`; assert the wallpaper layer's `style.backgroundImage` contains that exact payload.

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
cd spike/plugins/dsh-studio-themes
pnpm vitest run tests/ThemeSettingsSection.test.tsx tests/renderer.test.ts
```

Expected: the format-copy assertion fails; the renderer assertion documents existing pass-through behavior.

- [ ] **Step 3: Update the accepted-format copy**

Change the empty-state line to:

```tsx
<small>支持 PNG、JPEG、WebP、GIF，最大 20 MB</small>
```

Do not add playback controls or animate gallery thumbnails.

- [ ] **Step 4: Run the full plugin suite and bundle**

```bash
pnpm test
pnpm bundle
```

Expected: all client tests pass and `lib/client.js` rebuilds successfully.

- [ ] **Step 5: Commit the UI unit**

```bash
git add spike/plugins/dsh-studio-themes/src/ThemeSettingsSection.tsx spike/plugins/dsh-studio-themes/tests/ThemeSettingsSection.test.tsx spike/plugins/dsh-studio-themes/tests/renderer.test.ts spike/plugins/dsh-studio-themes/lib/client.js
git commit -m "feat: expose animated GIF theme imports"
```

### Task 5: Complete cross-layer verification

**Files:**
- Create or modify: `docs/superpowers/verification/2026-08-20-dsh-studio-theme-switcher.md`

- [ ] **Step 1: Run automated verification**

```bash
cd spike/app/src-tauri && cargo test
cd ../../plugins/dsh-studio-themes && pnpm test && pnpm bundle
cd ../.. && pnpm --dir plugins bundle
pnpm --dir app build
node themes/verify-assets.mjs
git diff --check
```

Expected: 0 failures; six audited static bundled themes remain valid; no whitespace errors.

- [ ] **Step 2: Run Rust compile verification**

```bash
cd spike/app/src-tauri
cargo check
```

Expected: exit 0 without warnings introduced by the GIF path.

- [ ] **Step 3: Run a native GIF playback smoke test**

Start DSH Studio with isolated `DSH_STUDIO_HOME` and `DSH_STUDIO_THEME_DIR`, import a small generated multi-frame fixture through the native picker, save it, and capture two screenshots at least one frame interval apart. Confirm the wallpaper pixels differ while the input surface remains borderless and readable.

- [ ] **Step 4: Record platform evidence and limitations**

Write the exact commands, test counts, fixture limits, screenshot paths, macOS version, and the fact that Windows native picker/playback remains unverified without a Windows environment. Do not claim Windows runtime evidence from compilation alone.

- [ ] **Step 5: Final scoped status review**

```bash
git status --short
git diff --stat
git diff --check
```

Expected: only theme-feature files and the user's pre-existing unrelated changes are present; no temporary GIF fixture or isolated app data is staged.
