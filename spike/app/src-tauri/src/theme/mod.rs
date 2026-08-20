pub mod commands;
pub mod error;
pub mod image;
pub mod model;
pub mod store;

use std::path::PathBuf;

use base64::Engine;
use uuid::Uuid;

use error::{ThemeError, ThemeResult};
use image::normalize_image;
use model::{
    Appearance, ResolvedTheme, SaveThemeRequest, ThemeArt, ThemeCatalog, ThemeColors, ThemeDraft,
    ThemeDraftValues, ThemeEffects, GIF_BACKGROUND_FILE, THUMBNAIL_FILE,
};
use store::ThemeStore;

#[derive(Debug, Clone)]
pub struct ThemeService {
    store: ThemeStore,
}

impl ThemeService {
    pub fn new(bundled_root: PathBuf, data_root: PathBuf) -> ThemeResult<Self> {
        Ok(Self {
            store: ThemeStore::new(bundled_root, data_root)?,
        })
    }

    pub fn recover(&self) -> ThemeResult<()> {
        self.store.recover()
    }

    pub fn catalog(&self) -> ThemeResult<ThemeCatalog> {
        self.store.catalog()
    }

    pub fn load(&self, theme_id: &str) -> ThemeResult<ResolvedTheme> {
        self.store.load(theme_id)
    }

    pub fn import_path(&self, selected: Option<PathBuf>) -> ThemeResult<Option<ThemeDraft>> {
        let Some(source) = selected else {
            return Ok(None);
        };
        let stage_id = format!("stage-{}", Uuid::new_v4().simple());
        let stage_dir = self.store.data_root().join("staging").join(&stage_id);
        let normalized = match normalize_image(&source, &stage_dir) {
            Ok(normalized) => normalized,
            Err(error) => {
                if stage_dir.exists() {
                    let _ = std::fs::remove_dir_all(&stage_dir);
                }
                return Err(error);
            }
        };

        let name = source
            .file_stem()
            .and_then(|name| name.to_str())
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .unwrap_or("我的主题")
            .chars()
            .take(48)
            .collect();
        let background =
            std::fs::read(&normalized.background).map_err(|_| ThemeError::io("read"))?;
        let thumbnail = std::fs::read(&normalized.thumbnail).map_err(|_| ThemeError::io("read"))?;
        Ok(Some(ThemeDraft {
            stage_id,
            values: ThemeDraftValues {
                name,
                appearance: Appearance::Auto,
                colors: ThemeColors {
                    accent: normalized.accent,
                },
                art: ThemeArt {
                    focus_x: 0.5,
                    focus_y: 0.5,
                },
                effects: ThemeEffects {
                    brightness: 1.0,
                    panel_opacity: 0.4,
                    blur: 0,
                },
            },
            background_data_url: image_data_url(
                normalized
                    .background
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or_default(),
                &background,
            ),
            thumbnail_data_url: image_data_url(THUMBNAIL_FILE, &thumbnail),
        }))
    }

    pub fn save(&self, request: SaveThemeRequest) -> ThemeResult<ResolvedTheme> {
        self.store.save(request)
    }

    pub fn activate(&self, theme_id: &str) -> ThemeResult<ResolvedTheme> {
        self.store.activate(theme_id)
    }

    pub fn delete(&self, theme_id: &str) -> ThemeResult<ThemeCatalog> {
        self.store.delete(theme_id)?;
        self.store.catalog()
    }

    pub fn discard_stage(&self, stage_id: &str) -> ThemeResult<()> {
        self.store.discard_stage(stage_id)
    }
}

fn image_data_url(name: &str, bytes: &[u8]) -> String {
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

#[cfg(test)]
mod tests;
