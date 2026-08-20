use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

use super::model::{ResolvedTheme, SaveThemeRequest, ThemeCatalog, ThemeDraft};
use super::ThemeService;

fn service(app: &AppHandle) -> Result<tauri::State<'_, ThemeService>, String> {
    app.try_state::<ThemeService>()
        .ok_or_else(|| "theme_unavailable: 主题服务尚未就绪".into())
}

#[tauri::command]
pub fn theme_catalog(app: AppHandle) -> Result<ThemeCatalog, String> {
    service(&app)?.catalog().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn theme_load(app: AppHandle, theme_id: String) -> Result<ResolvedTheme, String> {
    service(&app)?
        .load(&theme_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn theme_import_image(app: AppHandle) -> Result<Option<ThemeDraft>, String> {
    let selected = app
        .dialog()
        .file()
        .add_filter("主题图片", &["png", "jpg", "jpeg", "webp", "gif"])
        .blocking_pick_file()
        .and_then(|file| file.into_path().ok());
    service(&app)?
        .import_path(selected)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn theme_save(app: AppHandle, request: SaveThemeRequest) -> Result<ResolvedTheme, String> {
    service(&app)?
        .save(request)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn theme_activate(app: AppHandle, theme_id: String) -> Result<ResolvedTheme, String> {
    service(&app)?
        .activate(&theme_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn theme_delete(app: AppHandle, theme_id: String) -> Result<ThemeCatalog, String> {
    service(&app)?
        .delete(&theme_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn theme_discard_stage(app: AppHandle, stage_id: String) -> Result<(), String> {
    service(&app)?
        .discard_stage(&stage_id)
        .map_err(|error| error.to_string())
}
