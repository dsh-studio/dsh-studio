use serde::{Deserialize, Serialize};

use super::error::{ThemeError, ThemeResult};

pub const SCHEMA_VERSION: u32 = 1;
pub const BACKGROUND_FILE: &str = "background.webp";
pub const GIF_BACKGROUND_FILE: &str = "background.gif";
pub const THUMBNAIL_FILE: &str = "thumbnail.webp";
pub const SYSTEM_THEME_ID: &str = "system";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Appearance {
    Auto,
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ThemeSource {
    Bundled,
    User,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ThemeColors {
    pub accent: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ThemeArt {
    pub focus_x: f32,
    pub focus_y: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ThemeEffects {
    pub brightness: f32,
    pub panel_opacity: f32,
    pub blur: u8,
}

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ThemeSummary {
    pub manifest: ThemeManifest,
    pub source: ThemeSource,
    pub thumbnail_data_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ThemeCatalog {
    pub active_id: String,
    pub themes: Vec<ThemeSummary>,
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedTheme {
    pub manifest: ThemeManifest,
    pub source: ThemeSource,
    pub background_data_url: String,
}

pub fn is_user_theme_id(id: &str) -> bool {
    let Some(suffix) = id.strip_prefix("user-") else {
        return false;
    };
    suffix.len() == 32
        && suffix
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

pub fn is_bundled_theme_id(id: &str) -> bool {
    let Some(suffix) = id.strip_prefix("preset-") else {
        return false;
    };
    !suffix.is_empty()
        && !suffix.starts_with('-')
        && !suffix.ends_with('-')
        && suffix
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

pub fn validate_manifest(manifest: &ThemeManifest, source: ThemeSource) -> ThemeResult<()> {
    if manifest.schema_version != SCHEMA_VERSION {
        return Err(ThemeError::invalid(
            "unsupported_schema",
            "不支持这个主题版本",
        ));
    }

    let identity_is_valid = match source {
        ThemeSource::Bundled => is_bundled_theme_id(&manifest.id),
        ThemeSource::User => is_user_theme_id(&manifest.id),
    };
    if !identity_is_valid {
        return Err(ThemeError::invalid("invalid_theme_id", "主题标识无效"));
    }

    validate_values(&ThemeDraftValues {
        name: manifest.name.clone(),
        appearance: manifest.appearance,
        colors: manifest.colors.clone(),
        art: manifest.art.clone(),
        effects: manifest.effects.clone(),
    })?;

    let valid_image = match source {
        ThemeSource::Bundled => manifest.image == BACKGROUND_FILE,
        ThemeSource::User => {
            manifest.image == BACKGROUND_FILE || manifest.image == GIF_BACKGROUND_FILE
        }
    };
    if !valid_image {
        return Err(ThemeError::invalid(
            "invalid_image_name",
            "主题图片文件名无效",
        ));
    }

    match (source, &manifest.attribution) {
        (ThemeSource::Bundled, Some(attribution)) if valid_attribution(attribution) => {}
        (ThemeSource::Bundled, _) => {
            return Err(ThemeError::invalid(
                "missing_attribution",
                "内置主题缺少来源说明",
            ));
        }
        (ThemeSource::User, None) => {}
        (ThemeSource::User, Some(_)) => {
            return Err(ThemeError::invalid(
                "unexpected_attribution",
                "本地主题不能提交来源字段",
            ));
        }
    }

    Ok(())
}

pub fn validate_values(values: &ThemeDraftValues) -> ThemeResult<()> {
    let name_len = values.name.chars().count();
    if values.name.trim().is_empty()
        || !(1..=48).contains(&name_len)
        || values.name.chars().any(char::is_control)
    {
        return Err(ThemeError::invalid(
            "invalid_name",
            "主题名称需要包含 1 到 48 个字符",
        ));
    }
    if !is_hex_color(&values.colors.accent) {
        return Err(ThemeError::invalid("invalid_color", "主题强调色无效"));
    }
    if !unit_interval(values.art.focus_x) || !unit_interval(values.art.focus_y) {
        return Err(ThemeError::invalid("invalid_focus", "图片焦点超出范围"));
    }
    if !values.effects.brightness.is_finite() || !(0.35..=1.20).contains(&values.effects.brightness)
    {
        return Err(ThemeError::invalid(
            "invalid_brightness",
            "图片亮度超出范围",
        ));
    }
    if !values.effects.panel_opacity.is_finite()
        || !(0.40..=0.96).contains(&values.effects.panel_opacity)
    {
        return Err(ThemeError::invalid(
            "invalid_panel_opacity",
            "面板透明度超出范围",
        ));
    }
    if values.effects.blur > 32 {
        return Err(ThemeError::invalid("invalid_blur", "背景模糊超出范围"));
    }
    Ok(())
}

pub fn validate_save_identity(request: &SaveThemeRequest) -> ThemeResult<()> {
    match (&request.theme_id, &request.stage_id) {
        (None, Some(stage_id)) if is_stage_id(stage_id) => Ok(()),
        (Some(theme_id), None) if is_user_theme_id(theme_id) => Ok(()),
        _ => Err(ThemeError::invalid(
            "invalid_save_identity",
            "主题保存请求无效",
        )),
    }
}

pub fn is_stage_id(id: &str) -> bool {
    let Some(suffix) = id.strip_prefix("stage-") else {
        return false;
    };
    suffix.len() == 32
        && suffix
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn unit_interval(value: f32) -> bool {
    value.is_finite() && (0.0..=1.0).contains(&value)
}

fn is_hex_color(value: &str) -> bool {
    value.len() == 7
        && value.starts_with('#')
        && value.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
}

fn valid_attribution(attribution: &Attribution) -> bool {
    !attribution.author.trim().is_empty()
        && !attribution.license.trim().is_empty()
        && (attribution.source_url.starts_with("https://")
            || attribution.source_url.starts_with("http://"))
        && attribution.checksum.len() == 64
        && attribution
            .checksum
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}
