use super::image::{
    inspect_gif_with_limits, inspect_source, normalize_image, sha256_file, GifLimits,
    SupportedImage,
};
use super::model::{
    is_user_theme_id, validate_manifest, Appearance, ThemeArt, ThemeColors, ThemeEffects,
    ThemeManifest, ThemeSource, BACKGROUND_FILE, GIF_BACKGROUND_FILE, SCHEMA_VERSION,
};
use super::model::{Attribution, SaveThemeRequest, SYSTEM_THEME_ID, THUMBNAIL_FILE};
use super::store::ThemeStore;
use super::ThemeService;
use image::codecs::gif::{GifEncoder, Repeat};
use image::{Delay, DynamicImage, Frame, ImageBuffer, ImageFormat, Rgb};
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};

fn valid_user_manifest() -> ThemeManifest {
    ThemeManifest {
        schema_version: SCHEMA_VERSION,
        id: "user-550e8400e29b41d4a716446655440000".into(),
        name: "本地主题".into(),
        appearance: Appearance::Auto,
        image: BACKGROUND_FILE.into(),
        colors: ThemeColors {
            accent: "#4f8cff".into(),
        },
        art: ThemeArt {
            focus_x: 0.5,
            focus_y: 0.5,
        },
        effects: ThemeEffects {
            brightness: 0.8,
            panel_opacity: 0.76,
            blur: 12,
        },
        attribution: None,
    }
}

#[test]
fn manifest_validation_rejects_paths_and_out_of_range_values() {
    let mut theme = valid_user_manifest();
    theme.image = "../outside.webp".into();
    assert_eq!(
        validate_manifest(&theme, ThemeSource::User)
            .unwrap_err()
            .code(),
        "invalid_image_name"
    );

    let mut theme = valid_user_manifest();
    theme.art.focus_x = 1.01;
    assert_eq!(
        validate_manifest(&theme, ThemeSource::User)
            .unwrap_err()
            .code(),
        "invalid_focus"
    );

    let mut theme = valid_user_manifest();
    theme.colors.accent = "url(https://example.invalid/x)".into();
    assert_eq!(
        validate_manifest(&theme, ThemeSource::User)
            .unwrap_err()
            .code(),
        "invalid_color"
    );
}

#[test]
fn user_ids_and_names_are_bounded() {
    assert!(is_user_theme_id("user-550e8400e29b41d4a716446655440000"));
    assert!(!is_user_theme_id("preset-gothic-void-crusade"));
    assert!(!is_user_theme_id("user-../../escape"));

    let mut theme = valid_user_manifest();
    theme.name = " ".into();
    assert_eq!(
        validate_manifest(&theme, ThemeSource::User)
            .unwrap_err()
            .code(),
        "invalid_name"
    );
}

#[test]
fn manifest_validation_rejects_wrong_source_identity_and_attribution() {
    let theme = valid_user_manifest();
    assert_eq!(
        validate_manifest(&theme, ThemeSource::Bundled)
            .unwrap_err()
            .code(),
        "invalid_theme_id"
    );

    let mut theme = valid_user_manifest();
    theme.effects.panel_opacity = 0.39;
    assert_eq!(
        validate_manifest(&theme, ThemeSource::User)
            .unwrap_err()
            .code(),
        "invalid_panel_opacity"
    );
}

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
        validate_manifest(&bundled, ThemeSource::Bundled)
            .unwrap_err()
            .code(),
        "invalid_image_name"
    );

    user.image = "other.gif".into();
    assert_eq!(
        validate_manifest(&user, ThemeSource::User)
            .unwrap_err()
            .code(),
        "invalid_image_name"
    );
}

fn write_test_png(root: &Path, name: &str, width: u32, height: u32) -> PathBuf {
    let path = root.join(name);
    let image = ImageBuffer::from_fn(width, height, |x, y| {
        image::Rgba([(x % 255) as u8, (y % 255) as u8, 150, 255])
    });
    DynamicImage::ImageRgba8(image)
        .save_with_format(&path, ImageFormat::Png)
        .unwrap();
    path
}

fn write_test_gif(
    root: &Path,
    name: &str,
    width: u32,
    height: u32,
    frames: usize,
    delay_ms: u32,
) -> PathBuf {
    let path = root.join(name);
    let file = std::fs::File::create(&path).unwrap();
    let mut encoder = GifEncoder::new(file);
    encoder.set_repeat(Repeat::Infinite).unwrap();
    for index in 0..frames {
        let buffer = ImageBuffer::from_pixel(
            width,
            height,
            image::Rgba([(index % 255) as u8, 80, 180, 255]),
        );
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

fn png_crc(bytes: &[u8]) -> u32 {
    let mut crc = 0xffff_ffffu32;
    for byte in bytes {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            let mask = (crc & 1).wrapping_neg();
            crc = (crc >> 1) ^ (0xedb8_8320 & mask);
        }
    }
    !crc
}

fn write_png_header_only(root: &Path, name: &str, width: u32, height: u32) -> PathBuf {
    let path = root.join(name);
    let mut ihdr = Vec::from(*b"IHDR");
    ihdr.extend_from_slice(&width.to_be_bytes());
    ihdr.extend_from_slice(&height.to_be_bytes());
    ihdr.extend_from_slice(&[8, 6, 0, 0, 0]);

    let mut bytes = Vec::from(*b"\x89PNG\r\n\x1a\n");
    bytes.extend_from_slice(&13u32.to_be_bytes());
    bytes.extend_from_slice(&ihdr);
    bytes.extend_from_slice(&png_crc(&ihdr).to_be_bytes());
    std::fs::write(&path, bytes).unwrap();
    path
}

fn write_animated_webp_header(root: &Path) -> PathBuf {
    let path = root.join("animated.webp");
    let mut bytes = Vec::from(*b"RIFF");
    bytes.extend_from_slice(&22u32.to_le_bytes());
    bytes.extend_from_slice(b"WEBPVP8X");
    bytes.extend_from_slice(&10u32.to_le_bytes());
    bytes.extend_from_slice(&[0x02, 0, 0, 0]);
    bytes.extend_from_slice(&[9, 0, 0, 9, 0, 0]);
    std::fs::write(&path, bytes).unwrap();
    path
}

#[test]
fn image_input_checks_signature_extension_and_limits() {
    let dir = tempfile::tempdir().unwrap();
    let png = write_test_png(dir.path(), "wall.png", 120, 80);
    assert_eq!(inspect_source(&png).unwrap().format, SupportedImage::Png);

    let mismatch = dir.path().join("wall.jpg");
    std::fs::copy(&png, &mismatch).unwrap();
    assert_eq!(
        inspect_source(&mismatch).unwrap_err().code(),
        "signature_mismatch"
    );

    let huge = write_png_header_only(dir.path(), "huge.png", 10_000, 5_000);
    assert_eq!(inspect_source(&huge).unwrap_err().code(), "pixel_limit");
}

#[test]
fn image_input_rejects_large_corrupt_and_animated_files() {
    let dir = tempfile::tempdir().unwrap();
    let large = dir.path().join("large.png");
    OpenOptions::new()
        .create(true)
        .write(true)
        .open(&large)
        .unwrap()
        .set_len(20 * 1024 * 1024 + 1)
        .unwrap();
    assert_eq!(inspect_source(&large).unwrap_err().code(), "file_limit");

    let corrupt = dir.path().join("corrupt.png");
    std::fs::write(&corrupt, b"\x89PNG\r\n\x1a\nnot-an-image").unwrap();
    assert_eq!(
        inspect_source(&corrupt).unwrap_err().code(),
        "decode_failed"
    );

    let animated = write_animated_webp_header(dir.path());
    assert_eq!(
        inspect_source(&animated).unwrap_err().code(),
        "animated_image"
    );
}

#[test]
fn gif_input_accepts_bounded_animation_and_rejects_resource_bombs() {
    let dir = tempfile::tempdir().unwrap();
    let valid = write_test_gif(dir.path(), "motion.gif", 64, 48, 3, 80);
    assert_eq!(inspect_source(&valid).unwrap().format, SupportedImage::Gif);

    let too_wide = write_test_gif(dir.path(), "wide.gif", 2561, 1, 2, 80);
    assert_eq!(
        inspect_source(&too_wide).unwrap_err().code(),
        "gif_dimensions"
    );

    let too_many = write_test_gif(dir.path(), "frames.gif", 2, 2, 301, 10);
    assert_eq!(
        inspect_source(&too_many).unwrap_err().code(),
        "gif_frame_limit"
    );

    let too_long = write_test_gif(dir.path(), "long.gif", 2, 2, 2, 30_010);
    assert_eq!(
        inspect_source(&too_long).unwrap_err().code(),
        "gif_duration_limit"
    );
}

#[test]
fn gif_input_rejects_decoded_pixel_budget_and_corrupt_later_frames() {
    let dir = tempfile::tempdir().unwrap();
    let pixel_heavy = write_test_gif(dir.path(), "pixel-heavy.gif", 32, 32, 5, 40);
    let limits = GifLimits {
        max_edge: 2560,
        max_frames: 300,
        max_decoded_pixels: 4 * 32 * 32,
        max_duration_ms: 60_000,
    };
    assert_eq!(
        inspect_gif_with_limits(&pixel_heavy, 32, 32, limits)
            .unwrap_err()
            .code(),
        "gif_pixel_budget"
    );

    let valid = write_test_gif(dir.path(), "source.gif", 32, 32, 3, 40);
    let mut truncated = std::fs::read(valid).unwrap();
    truncated.truncate(truncated.len() - 10);
    let corrupt = dir.path().join("corrupt.gif");
    std::fs::write(&corrupt, truncated).unwrap();
    assert_eq!(
        inspect_source(&corrupt).unwrap_err().code(),
        "decode_failed"
    );
}

#[test]
fn gif_preparation_preserves_animation_bytes_and_creates_static_webp_thumbnail() {
    let dir = tempfile::tempdir().unwrap();
    let source = write_test_gif(dir.path(), "motion.gif", 64, 48, 3, 80);
    let prepared = normalize_image(&source, &dir.path().join("prepared")).unwrap();

    assert_eq!(
        prepared
            .background
            .file_name()
            .and_then(|name| name.to_str()),
        Some(GIF_BACKGROUND_FILE)
    );
    assert_eq!(
        sha256_file(&prepared.background).unwrap(),
        sha256_file(&source).unwrap()
    );
    let thumbnail = std::fs::read(&prepared.thumbnail).unwrap();
    assert_eq!(&thumbnail[..4], b"RIFF");
    assert_eq!(&thumbnail[8..12], b"WEBP");
}

fn write_gradient_jpeg_with_exif(root: &Path, width: u32, height: u32) -> PathBuf {
    let path = root.join("gradient.jpg");
    let pixels = ImageBuffer::from_fn(width, height, |x, y| {
        Rgb([
            ((x * 255) / width.max(1)) as u8,
            ((y * 255) / height.max(1)) as u8,
            176,
        ])
    });
    DynamicImage::ImageRgb8(pixels)
        .save_with_format(&path, ImageFormat::Jpeg)
        .unwrap();
    OpenOptions::new()
        .append(true)
        .open(&path)
        .unwrap()
        .write_all(b"Exif-test-metadata")
        .unwrap();
    path
}

#[test]
fn image_normalization_is_bounded_metadata_free_and_deterministic() {
    let dir = tempfile::tempdir().unwrap();
    let source = write_gradient_jpeg_with_exif(dir.path(), 3000, 1500);
    let first = normalize_image(&source, &dir.path().join("first")).unwrap();
    let second = normalize_image(&source, &dir.path().join("second")).unwrap();

    assert_eq!((first.width, first.height), (2560, 1280));
    assert!(first.thumbnail_width <= 480 && first.thumbnail_height <= 300);
    assert_eq!(first.accent, second.accent);
    assert_eq!(
        sha256_file(&first.background).unwrap(),
        sha256_file(&second.background).unwrap()
    );
    assert!(!std::fs::read(&first.background)
        .unwrap()
        .windows(4)
        .any(|window| window == b"Exif"));
}

struct ThemeStoreFixture {
    _temp: tempfile::TempDir,
    bundled: PathBuf,
    data: PathBuf,
    store: ThemeStore,
}

impl ThemeStoreFixture {
    fn new() -> Self {
        let temp = tempfile::tempdir().unwrap();
        let bundled = temp.path().join("bundled/presets");
        let data = temp.path().join("data/themes");
        std::fs::create_dir_all(&bundled).unwrap();
        let store = ThemeStore::new(bundled.clone(), data.clone()).unwrap();
        Self {
            _temp: temp,
            bundled,
            data,
            store,
        }
    }

    fn add_bundled(&self, id: &str) {
        let mut manifest = valid_user_manifest();
        manifest.id = id.into();
        manifest.name = id.into();
        manifest.attribution = Some(Attribution {
            author: "Theme Author".into(),
            license: "MIT".into(),
            source_url: "https://example.com/theme".into(),
            checksum: "a".repeat(64),
        });
        write_theme_dir(&self.bundled.join(id), &manifest);
    }

    fn add_user(&self, id: &str) {
        let mut manifest = valid_user_manifest();
        manifest.id = id.into();
        manifest.name = id.into();
        write_theme_dir(&self.user_dir(id), &manifest);
    }

    fn user_dir(&self, id: &str) -> PathBuf {
        self.data.join("user").join(id)
    }

    fn write_active(&self, id: &str) {
        std::fs::write(
            self.data.join("active.json"),
            format!("{{\"themeId\":\"{id}\"}}"),
        )
        .unwrap();
    }

    fn stage_import(&self, stage_id: &str) {
        let dir = self.data.join("staging").join(stage_id);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(BACKGROUND_FILE), b"background").unwrap();
        std::fs::write(dir.join(THUMBNAIL_FILE), b"thumbnail").unwrap();
    }

    fn stage_gif(&self, stage_id: &str) {
        let dir = self.data.join("staging").join(stage_id);
        std::fs::create_dir_all(&dir).unwrap();
        write_test_gif(&dir, GIF_BACKGROUND_FILE, 8, 8, 2, 40);
        std::fs::write(dir.join(THUMBNAIL_FILE), b"thumbnail").unwrap();
    }

    fn sibling_sentinel(&self) -> PathBuf {
        let sentinel = self.data.join("keep-me");
        std::fs::write(&sentinel, b"safe").unwrap();
        sentinel
    }
}

fn write_theme_dir(dir: &Path, manifest: &ThemeManifest) {
    std::fs::create_dir_all(dir).unwrap();
    std::fs::write(
        dir.join("theme.json"),
        serde_json::to_vec_pretty(manifest).unwrap(),
    )
    .unwrap();
    std::fs::write(dir.join(&manifest.image), b"background").unwrap();
    std::fs::write(dir.join(THUMBNAIL_FILE), b"thumbnail").unwrap();
}

fn save_request_for(stage_id: &str) -> SaveThemeRequest {
    let manifest = valid_user_manifest();
    SaveThemeRequest {
        theme_id: None,
        stage_id: Some(stage_id.into()),
        values: super::model::ThemeDraftValues {
            name: "新主题".into(),
            appearance: manifest.appearance,
            colors: manifest.colors,
            art: manifest.art,
            effects: manifest.effects,
        },
    }
}

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
fn store_deleting_active_user_theme_persists_system_before_scoped_removal() {
    let fixture = ThemeStoreFixture::new();
    let id = "user-550e8400e29b41d4a716446655440000";
    fixture.add_user(id);
    let sentinel = fixture.sibling_sentinel();
    fixture.store.activate(id).unwrap();
    fixture.store.delete(id).unwrap();

    assert_eq!(fixture.store.read_active().unwrap(), SYSTEM_THEME_ID);
    assert!(!fixture.user_dir(id).exists());
    assert!(sentinel.exists());
}

#[test]
fn store_rejects_bundled_unknown_and_link_deletion() {
    let fixture = ThemeStoreFixture::new();
    fixture.add_bundled("preset-a");
    assert_eq!(
        fixture.store.delete("preset-a").unwrap_err().code(),
        "bundled_read_only"
    );
    assert_eq!(
        fixture
            .store
            .delete("user-../../escape")
            .unwrap_err()
            .code(),
        "invalid_theme_id"
    );
    assert_eq!(
        fixture
            .store
            .delete("user-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
            .unwrap_err()
            .code(),
        "theme_not_found"
    );

    #[cfg(unix)]
    {
        let outside = fixture.data.join("outside");
        std::fs::create_dir_all(&outside).unwrap();
        let id = "user-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
        std::os::unix::fs::symlink(&outside, fixture.user_dir(id)).unwrap();
        assert_eq!(
            fixture.store.delete(id).unwrap_err().code(),
            "unsafe_theme_path"
        );
        assert!(outside.exists());
    }
}

#[test]
fn store_omits_corrupt_user_manifest_without_deleting_it() {
    let fixture = ThemeStoreFixture::new();
    let id = "user-cccccccccccccccccccccccccccccccc";
    let dir = fixture.user_dir(id);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("theme.json"), b"not-json").unwrap();

    let catalog = fixture.store.catalog().unwrap();
    assert!(catalog.themes.is_empty());
    assert!(catalog
        .warning
        .unwrap()
        .contains("已忽略 1 个损坏的本地主题"));
    assert!(dir.exists());
}

#[test]
fn store_omits_user_theme_with_two_background_kinds() {
    let fixture = ThemeStoreFixture::new();
    let id = "user-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    let dir = fixture.user_dir(id);
    let mut manifest = valid_user_manifest();
    manifest.id = id.into();
    write_theme_dir(&dir, &manifest);
    write_test_gif(&dir, GIF_BACKGROUND_FILE, 8, 8, 2, 40);

    let catalog = fixture.store.catalog().unwrap();
    assert!(catalog.themes.is_empty());
    assert!(catalog
        .warning
        .unwrap()
        .contains("已忽略 1 个损坏的本地主题"));
    assert!(dir.join(BACKGROUND_FILE).exists());
    assert!(dir.join(GIF_BACKGROUND_FILE).exists());
}

#[test]
fn store_save_commits_complete_theme_before_active_record() {
    let fixture = ThemeStoreFixture::new();
    let stage_id = "stage-1234567890abcdef1234567890abcdef";
    fixture.stage_import(stage_id);
    fixture.store.fail_next_active_write();
    let result = fixture.store.save(save_request_for(stage_id));

    assert_eq!(result.unwrap_err().code(), "active_write_failed");
    assert_eq!(fixture.store.read_active().unwrap(), SYSTEM_THEME_ID);
    assert_eq!(fixture.store.catalog().unwrap().themes.len(), 1);
}

#[test]
fn store_saves_and_reloads_gif_with_correct_manifest_and_mime() {
    let fixture = ThemeStoreFixture::new();
    let stage_id = "stage-1234567890abcdef1234567890abcdef";
    fixture.stage_gif(stage_id);

    let saved = fixture.store.save(save_request_for(stage_id)).unwrap();
    let id = saved.manifest.id.clone();
    assert_eq!(saved.manifest.image, GIF_BACKGROUND_FILE);
    assert!(saved
        .background_data_url
        .starts_with("data:image/gif;base64,"));
    assert!(fixture.user_dir(&id).join(GIF_BACKGROUND_FILE).is_file());
    assert!(!fixture.user_dir(&id).join(BACKGROUND_FILE).exists());

    let loaded = fixture.store.load(&id).unwrap();
    assert_eq!(loaded.manifest.image, GIF_BACKGROUND_FILE);
    assert!(loaded
        .background_data_url
        .starts_with("data:image/gif;base64,"));
    fixture.store.activate(&id).unwrap();
    assert_eq!(fixture.store.read_active().unwrap(), id);

    let edit = SaveThemeRequest {
        theme_id: Some(id.clone()),
        stage_id: None,
        values: save_request_for(stage_id).values,
    };
    let edited = fixture.store.save(edit).unwrap();
    assert_eq!(edited.manifest.image, GIF_BACKGROUND_FILE);
    fixture.store.delete(&id).unwrap();
    assert!(!fixture.user_dir(&id).exists());
}

#[test]
fn store_recovers_abandoned_backup_and_removes_stale_new_directory() {
    let fixture = ThemeStoreFixture::new();
    let id = "user-dddddddddddddddddddddddddddddddd";
    let mut manifest = valid_user_manifest();
    manifest.id = id.into();
    write_theme_dir(
        &fixture.data.join("user").join(format!("{id}.bak")),
        &manifest,
    );
    std::fs::create_dir_all(fixture.data.join("user").join(format!("{id}.new"))).unwrap();

    fixture.store.recover().unwrap();

    assert!(fixture.user_dir(id).exists());
    assert!(!fixture.data.join("user").join(format!("{id}.bak")).exists());
    assert!(!fixture.data.join("user").join(format!("{id}.new")).exists());
}

#[test]
fn service_import_cancellation_does_not_create_staging() {
    let fixture = ThemeStoreFixture::new();
    let service = ThemeService::new(fixture.bundled.clone(), fixture.data.clone()).unwrap();

    assert!(service.import_path(None).unwrap().is_none());
    assert_eq!(
        std::fs::read_dir(fixture.data.join("staging"))
            .unwrap()
            .count(),
        0
    );
}

#[test]
fn service_imports_validated_image_and_exposes_store_operations() {
    let fixture = ThemeStoreFixture::new();
    fixture.add_bundled("preset-a");
    let service = ThemeService::new(fixture.bundled.clone(), fixture.data.clone()).unwrap();
    let image = write_test_png(fixture._temp.path(), "我的星空.png", 640, 360);

    let draft = service.import_path(Some(image)).unwrap().unwrap();
    assert!(draft.stage_id.starts_with("stage-"));
    assert_eq!(draft.values.name, "我的星空");
    assert!(draft
        .background_data_url
        .starts_with("data:image/webp;base64,"));

    let saved = service
        .save(SaveThemeRequest {
            theme_id: None,
            stage_id: Some(draft.stage_id.clone()),
            values: draft.values,
        })
        .unwrap();
    assert!(saved.manifest.id.starts_with("user-"));
    assert_eq!(service.catalog().unwrap().active_id, saved.manifest.id);
    assert_eq!(service.load(&saved.manifest.id).unwrap(), saved);
    service.activate(SYSTEM_THEME_ID).unwrap();
    service.delete(&saved.manifest.id).unwrap();
    assert_eq!(service.catalog().unwrap().themes.len(), 1);
    service.discard_stage(&draft.stage_id).unwrap();
}

#[test]
fn service_imports_gif_with_animated_preview_and_static_thumbnail() {
    let fixture = ThemeStoreFixture::new();
    let service = ThemeService::new(fixture.bundled.clone(), fixture.data.clone()).unwrap();
    let gif = write_test_gif(fixture._temp.path(), "动态星空.gif", 64, 48, 3, 80);

    let draft = service.import_path(Some(gif)).unwrap().unwrap();
    assert_eq!(draft.values.name, "动态星空");
    assert!(draft
        .background_data_url
        .starts_with("data:image/gif;base64,"));
    assert!(draft
        .thumbnail_data_url
        .starts_with("data:image/webp;base64,"));

    let saved = service
        .save(SaveThemeRequest {
            theme_id: None,
            stage_id: Some(draft.stage_id),
            values: draft.values,
        })
        .unwrap();
    assert_eq!(saved.manifest.image, GIF_BACKGROUND_FILE);
    assert!(saved
        .background_data_url
        .starts_with("data:image/gif;base64,"));
}

#[test]
fn service_cleans_staging_after_rejected_gif() {
    let fixture = ThemeStoreFixture::new();
    let service = ThemeService::new(fixture.bundled.clone(), fixture.data.clone()).unwrap();
    let gif = write_test_gif(fixture._temp.path(), "too-wide.gif", 2561, 1, 2, 80);

    assert_eq!(
        service.import_path(Some(gif)).unwrap_err().code(),
        "gif_dimensions"
    );
    assert_eq!(
        std::fs::read_dir(fixture.data.join("staging"))
            .unwrap()
            .count(),
        0
    );
}

#[test]
fn bundled_presets_are_exactly_six_and_attributed() {
    let bundled = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../themes/presets");
    let temp = tempfile::tempdir().unwrap();
    let store = ThemeStore::new(bundled.clone(), temp.path().join("themes")).unwrap();
    let catalog = store.catalog().unwrap();

    assert_eq!(catalog.themes.len(), 6);
    for summary in catalog.themes {
        assert_eq!(summary.source, ThemeSource::Bundled);
        let attribution = summary.manifest.attribution.unwrap();
        assert_eq!(
            sha256_file(&bundled.join(&summary.manifest.id).join(BACKGROUND_FILE)).unwrap(),
            attribution.checksum
        );
    }
}
