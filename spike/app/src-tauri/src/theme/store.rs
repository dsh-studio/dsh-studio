use std::collections::HashSet;
use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use base64::Engine;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::error::{ThemeError, ThemeResult};
use super::model::{
    is_bundled_theme_id, is_stage_id, is_user_theme_id, validate_manifest, validate_save_identity,
    validate_values, Appearance, ResolvedTheme, SaveThemeRequest, ThemeArt, ThemeCatalog,
    ThemeColors, ThemeEffects, ThemeManifest, ThemeSource, ThemeSummary, BACKGROUND_FILE,
    GIF_BACKGROUND_FILE, SCHEMA_VERSION, SYSTEM_THEME_ID, THUMBNAIL_FILE,
};

const MANIFEST_FILE: &str = "theme.json";
const ACTIVE_FILE: &str = "active.json";

#[derive(Debug, Clone)]
pub struct ThemeStore {
    bundled_root: PathBuf,
    data_root: PathBuf,
    fail_active_write: Arc<AtomicBool>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ActiveRecord {
    theme_id: String,
}

impl ThemeStore {
    pub fn new(bundled_root: PathBuf, data_root: PathBuf) -> ThemeResult<Self> {
        std::fs::create_dir_all(data_root.join("user")).map_err(|_| ThemeError::io("save"))?;
        std::fs::create_dir_all(data_root.join("staging")).map_err(|_| ThemeError::io("save"))?;
        Ok(Self {
            bundled_root,
            data_root,
            fail_active_write: Arc::new(AtomicBool::new(false)),
        })
    }

    pub fn bundled_root(&self) -> &Path {
        &self.bundled_root
    }

    pub fn data_root(&self) -> &Path {
        &self.data_root
    }

    pub fn catalog(&self) -> ThemeResult<ThemeCatalog> {
        self.recover()?;
        let (mut bundled, bundled_corrupt) =
            self.read_collection(&self.bundled_root, ThemeSource::Bundled)?;
        let (mut users, user_corrupt) =
            self.read_collection(&self.user_root(), ThemeSource::User)?;
        bundled.sort_by(|left, right| left.manifest.name.cmp(&right.manifest.name));
        users.sort_by(|left, right| left.manifest.name.cmp(&right.manifest.name));
        let mut themes = bundled;
        themes.append(&mut users);

        let mut warnings = Vec::new();
        if bundled_corrupt > 0 {
            warnings.push(format!("已忽略 {bundled_corrupt} 个损坏的内置主题"));
        }
        if user_corrupt > 0 {
            warnings.push(format!("已忽略 {user_corrupt} 个损坏的本地主题"));
        }

        let known: HashSet<&str> = themes
            .iter()
            .map(|summary| summary.manifest.id.as_str())
            .collect();
        let mut active_id = self.read_active()?;
        if active_id != SYSTEM_THEME_ID && !known.contains(active_id.as_str()) {
            active_id = SYSTEM_THEME_ID.into();
            let _ = self.write_active(SYSTEM_THEME_ID);
            warnings.push("当前主题不可用，已还原为系统主题".into());
        }

        Ok(ThemeCatalog {
            active_id,
            themes,
            warning: (!warnings.is_empty()).then(|| warnings.join("；")),
        })
    }

    pub fn load(&self, theme_id: &str) -> ThemeResult<ResolvedTheme> {
        if theme_id == SYSTEM_THEME_ID {
            return Ok(system_theme());
        }
        if is_bundled_theme_id(theme_id) {
            return self.load_from_dir(&self.bundled_root.join(theme_id), ThemeSource::Bundled);
        }
        if is_user_theme_id(theme_id) {
            return self.load_from_dir(&self.user_root().join(theme_id), ThemeSource::User);
        }
        Err(ThemeError::invalid("invalid_theme_id", "主题标识无效"))
    }

    pub fn activate(&self, theme_id: &str) -> ThemeResult<ResolvedTheme> {
        let resolved = self.load(theme_id)?;
        self.write_active(theme_id)?;
        Ok(resolved)
    }

    pub fn delete(&self, theme_id: &str) -> ThemeResult<()> {
        if is_bundled_theme_id(theme_id) {
            return Err(ThemeError::invalid("bundled_read_only", "内置主题不能删除"));
        }
        if !is_user_theme_id(theme_id) {
            return Err(ThemeError::invalid("invalid_theme_id", "主题标识无效"));
        }
        let target = self.user_root().join(theme_id);
        if !target.exists() && target.symlink_metadata().is_err() {
            return Err(ThemeError::invalid("theme_not_found", "找不到这个主题"));
        }
        ensure_safe_directory(&self.user_root(), &target)?;
        if self.read_active()? == theme_id {
            self.write_active(SYSTEM_THEME_ID)?;
        }
        std::fs::remove_dir_all(&target).map_err(|_| ThemeError::io("delete"))?;
        Ok(())
    }

    pub fn save(&self, request: SaveThemeRequest) -> ThemeResult<ResolvedTheme> {
        validate_save_identity(&request)?;
        validate_values(&request.values)?;

        let is_new = request.theme_id.is_none();
        let theme_id = request
            .theme_id
            .clone()
            .unwrap_or_else(|| format!("user-{}", Uuid::new_v4().simple()));
        let target = self.user_root().join(&theme_id);
        let incoming = self.user_root().join(format!("{theme_id}.new"));
        let backup = self.user_root().join(format!("{theme_id}.bak"));
        remove_owned_dir_if_present(&self.user_root(), &incoming)?;
        std::fs::create_dir(&incoming).map_err(|_| ThemeError::io("save"))?;

        let assets_from = if let Some(stage_id) = request.stage_id.as_deref() {
            if !is_stage_id(stage_id) {
                return Err(ThemeError::invalid("invalid_stage_id", "导入暂存标识无效"));
            }
            let stage = self.staging_root().join(stage_id);
            ensure_safe_directory(&self.staging_root(), &stage)?;
            stage
        } else {
            if !target.exists() {
                return Err(ThemeError::invalid("theme_not_found", "找不到这个主题"));
            }
            ensure_safe_directory(&self.user_root(), &target)?;
            target.clone()
        };

        let background_name = background_name(&assets_from)?;
        for name in [background_name, THUMBNAIL_FILE] {
            copy_and_sync(&assets_from.join(name), &incoming.join(name))?;
        }
        let manifest = ThemeManifest {
            schema_version: SCHEMA_VERSION,
            id: theme_id.clone(),
            name: request.values.name,
            appearance: request.values.appearance,
            image: background_name.into(),
            colors: request.values.colors,
            art: request.values.art,
            effects: request.values.effects,
            attribution: None,
        };
        validate_manifest(&manifest, ThemeSource::User)?;
        write_json_synced(&incoming.join(MANIFEST_FILE), &manifest)?;
        self.load_from_dir(&incoming, ThemeSource::User)?;

        remove_owned_dir_if_present(&self.user_root(), &backup)?;
        if target.exists() {
            std::fs::rename(&target, &backup).map_err(|_| ThemeError::io("save"))?;
        }
        if std::fs::rename(&incoming, &target).is_err() {
            if backup.exists() {
                let _ = std::fs::rename(&backup, &target);
            }
            return Err(ThemeError::io("save"));
        }
        remove_owned_dir_if_present(&self.user_root(), &backup)?;

        if let Err(error) = self.write_active(&theme_id) {
            return Err(if error.code() == "active_write_failed" {
                error
            } else {
                ThemeError::new("active_write_failed", "主题已保存，但无法设为当前主题")
            });
        }

        if is_new {
            if let Some(stage_id) = request.stage_id.as_deref() {
                let _ = self.discard_stage(stage_id);
            }
        }
        self.load(&theme_id)
    }

    pub fn discard_stage(&self, stage_id: &str) -> ThemeResult<()> {
        if !is_stage_id(stage_id) {
            return Err(ThemeError::invalid("invalid_stage_id", "导入暂存标识无效"));
        }
        let stage = self.staging_root().join(stage_id);
        if stage.symlink_metadata().is_err() {
            return Ok(());
        }
        ensure_safe_directory(&self.staging_root(), &stage)?;
        std::fs::remove_dir_all(stage).map_err(|_| ThemeError::io("delete"))
    }

    pub fn read_active(&self) -> ThemeResult<String> {
        let path = self.data_root.join(ACTIVE_FILE);
        if !path.exists() {
            return Ok(SYSTEM_THEME_ID.into());
        }
        let bytes = std::fs::read(path).map_err(|_| ThemeError::io("read"))?;
        let record: ActiveRecord = serde_json::from_slice(&bytes)
            .map_err(|_| ThemeError::new("invalid_active_record", "当前主题记录已损坏"))?;
        Ok(record.theme_id)
    }

    pub fn fail_next_active_write(&self) {
        self.fail_active_write.store(true, Ordering::SeqCst);
    }

    pub fn recover(&self) -> ThemeResult<()> {
        self.recover_swaps()?;
        self.cleanup_staging()?;
        Ok(())
    }

    fn write_active(&self, theme_id: &str) -> ThemeResult<()> {
        if self.fail_active_write.swap(false, Ordering::SeqCst) {
            return Err(ThemeError::new("active_write_failed", "无法保存当前主题"));
        }
        let next = self.data_root.join("active.json.new");
        let target = self.data_root.join(ACTIVE_FILE);
        let backup = self.data_root.join("active.json.bak");
        write_json_synced(
            &next,
            &ActiveRecord {
                theme_id: theme_id.into(),
            },
        )?;
        if backup.exists() {
            std::fs::remove_file(&backup).map_err(|_| ThemeError::io("activate"))?;
        }
        if target.exists() {
            std::fs::rename(&target, &backup).map_err(|_| ThemeError::io("activate"))?;
        }
        if std::fs::rename(&next, &target).is_err() {
            if backup.exists() {
                let _ = std::fs::rename(&backup, &target);
            }
            return Err(ThemeError::new("active_write_failed", "无法保存当前主题"));
        }
        if backup.exists() {
            std::fs::remove_file(backup).map_err(|_| ThemeError::io("activate"))?;
        }
        Ok(())
    }

    fn read_collection(
        &self,
        root: &Path,
        source: ThemeSource,
    ) -> ThemeResult<(Vec<ThemeSummary>, usize)> {
        if !root.exists() {
            return Ok((Vec::new(), 0));
        }
        let entries = std::fs::read_dir(root).map_err(|_| ThemeError::io("read"))?;
        let mut themes = Vec::new();
        let mut corrupt = 0;
        for entry in entries.flatten() {
            let name = entry.file_name();
            let Some(name) = name.to_str() else {
                corrupt += 1;
                continue;
            };
            if name.ends_with(".new") || name.ends_with(".bak") {
                continue;
            }
            match self.summary_from_dir(&entry.path(), source) {
                Ok(summary) => themes.push(summary),
                Err(_) => corrupt += 1,
            }
        }
        Ok((themes, corrupt))
    }

    fn summary_from_dir(&self, dir: &Path, source: ThemeSource) -> ThemeResult<ThemeSummary> {
        let root = match source {
            ThemeSource::Bundled => &self.bundled_root,
            ThemeSource::User => &self.user_root(),
        };
        ensure_safe_directory(root, dir)?;
        let manifest = read_manifest(dir, source)?;
        let thumbnail = read_asset(dir, THUMBNAIL_FILE)?;
        if background_name(dir)? != manifest.image {
            return Err(ThemeError::new("invalid_asset", "主题背景资源无效"));
        }
        Ok(ThemeSummary {
            manifest,
            source,
            thumbnail_data_url: data_url(THUMBNAIL_FILE, &thumbnail),
        })
    }

    fn load_from_dir(&self, dir: &Path, source: ThemeSource) -> ThemeResult<ResolvedTheme> {
        let root = match source {
            ThemeSource::Bundled => &self.bundled_root,
            ThemeSource::User => &self.user_root(),
        };
        if !dir.exists() && dir.symlink_metadata().is_err() {
            return Err(ThemeError::invalid("theme_not_found", "找不到这个主题"));
        }
        ensure_safe_directory(root, dir)?;
        let manifest = read_manifest(dir, source)?;
        if background_name(dir)? != manifest.image {
            return Err(ThemeError::new("invalid_asset", "主题背景资源无效"));
        }
        let background = read_asset(dir, &manifest.image)?;
        require_asset(dir, THUMBNAIL_FILE)?;
        Ok(ResolvedTheme {
            background_data_url: data_url(&manifest.image, &background),
            manifest,
            source,
        })
    }

    fn recover_swaps(&self) -> ThemeResult<()> {
        let root = self.user_root();
        let entries = std::fs::read_dir(&root).map_err(|_| ThemeError::io("read"))?;
        let names: Vec<String> = entries
            .flatten()
            .filter_map(|entry| entry.file_name().to_str().map(ToOwned::to_owned))
            .collect();
        for name in &names {
            if let Some(id) = name.strip_suffix(".bak") {
                if !is_user_theme_id(id) {
                    continue;
                }
                let backup = root.join(name);
                ensure_safe_directory(&root, &backup)?;
                let target = root.join(id);
                if target.exists() {
                    std::fs::remove_dir_all(backup).map_err(|_| ThemeError::io("save"))?;
                } else {
                    std::fs::rename(backup, target).map_err(|_| ThemeError::io("save"))?;
                }
            }
        }
        for name in names {
            if let Some(id) = name.strip_suffix(".new") {
                if !is_user_theme_id(id) {
                    continue;
                }
                remove_owned_dir_if_present(&root, &root.join(name))?;
            }
        }
        Ok(())
    }

    fn cleanup_staging(&self) -> ThemeResult<()> {
        let root = self.staging_root();
        let entries = std::fs::read_dir(&root).map_err(|_| ThemeError::io("read"))?;
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(metadata) = path.symlink_metadata() else {
                continue;
            };
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                continue;
            }
            let stale = metadata
                .modified()
                .ok()
                .and_then(|modified| modified.elapsed().ok())
                .is_some_and(|age| age > Duration::from_secs(24 * 60 * 60));
            if stale {
                ensure_safe_directory(&root, &path)?;
                std::fs::remove_dir_all(path).map_err(|_| ThemeError::io("delete"))?;
            }
        }
        Ok(())
    }

    fn user_root(&self) -> PathBuf {
        self.data_root.join("user")
    }

    fn staging_root(&self) -> PathBuf {
        self.data_root.join("staging")
    }
}

fn read_manifest(dir: &Path, source: ThemeSource) -> ThemeResult<ThemeManifest> {
    let bytes = std::fs::read(dir.join(MANIFEST_FILE)).map_err(|_| ThemeError::io("read"))?;
    let manifest: ThemeManifest = serde_json::from_slice(&bytes)
        .map_err(|_| ThemeError::new("invalid_manifest", "主题清单已损坏"))?;
    validate_manifest(&manifest, source)?;
    let expected_name = dir
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .trim_end_matches(".new")
        .trim_end_matches(".bak");
    if manifest.id != expected_name {
        return Err(ThemeError::new(
            "manifest_id_mismatch",
            "主题目录与清单不一致",
        ));
    }
    Ok(manifest)
}

fn require_asset(dir: &Path, name: &str) -> ThemeResult<()> {
    let path = dir.join(name);
    let metadata = path
        .symlink_metadata()
        .map_err(|_| ThemeError::io("read"))?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(ThemeError::new("invalid_asset", "主题资源无效"));
    }
    Ok(())
}

fn read_asset(dir: &Path, name: &str) -> ThemeResult<Vec<u8>> {
    require_asset(dir, name)?;
    std::fs::read(dir.join(name)).map_err(|_| ThemeError::io("read"))
}

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
    let Ok(metadata) = path.symlink_metadata() else {
        return Ok(false);
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(ThemeError::new("invalid_asset", "主题背景资源无效"));
    }
    Ok(true)
}

fn data_url(name: &str, bytes: &[u8]) -> String {
    let mime = if name == GIF_BACKGROUND_FILE {
        "image/gif"
    } else {
        "image/webp"
    };
    format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    )
}

fn ensure_safe_directory(root: &Path, target: &Path) -> ThemeResult<()> {
    let metadata = target
        .symlink_metadata()
        .map_err(|_| ThemeError::new("theme_not_found", "找不到这个主题"))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(ThemeError::new("unsafe_theme_path", "主题路径不安全"));
    }
    let canonical_root = root
        .canonicalize()
        .map_err(|_| ThemeError::new("unsafe_theme_path", "主题路径不安全"))?;
    let canonical_target = target
        .canonicalize()
        .map_err(|_| ThemeError::new("unsafe_theme_path", "主题路径不安全"))?;
    if canonical_target.parent() != Some(canonical_root.as_path()) {
        return Err(ThemeError::new("unsafe_theme_path", "主题路径不安全"));
    }
    Ok(())
}

fn remove_owned_dir_if_present(root: &Path, target: &Path) -> ThemeResult<()> {
    if target.symlink_metadata().is_err() {
        return Ok(());
    }
    ensure_safe_directory(root, target)?;
    std::fs::remove_dir_all(target).map_err(|_| ThemeError::io("delete"))
}

fn copy_and_sync(source: &Path, target: &Path) -> ThemeResult<()> {
    let metadata = source
        .symlink_metadata()
        .map_err(|_| ThemeError::io("read"))?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(ThemeError::new("invalid_asset", "主题资源无效"));
    }
    std::fs::copy(source, target).map_err(|_| ThemeError::io("save"))?;
    OpenOptions::new()
        .write(true)
        .open(target)
        .and_then(|file| file.sync_all())
        .map_err(|_| ThemeError::io("save"))
}

fn write_json_synced<T: Serialize>(path: &Path, value: &T) -> ThemeResult<()> {
    let mut bytes = serde_json::to_vec_pretty(value).map_err(|_| ThemeError::io("save"))?;
    bytes.push(b'\n');
    let mut file = File::create(path).map_err(|_| ThemeError::io("save"))?;
    file.write_all(&bytes).map_err(|_| ThemeError::io("save"))?;
    file.sync_all().map_err(|_| ThemeError::io("save"))
}

fn system_theme() -> ResolvedTheme {
    ResolvedTheme {
        manifest: ThemeManifest {
            schema_version: SCHEMA_VERSION,
            id: SYSTEM_THEME_ID.into(),
            name: "系统默认".into(),
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
                brightness: 1.0,
                panel_opacity: 0.96,
                blur: 0,
            },
            attribution: None,
        },
        source: ThemeSource::User,
        background_data_url: String::new(),
    }
}
