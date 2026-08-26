use std::path::{Path, PathBuf};
use std::process::Command;

use super::browser::prepare_browser_extension;
use super::market::{search_market_catalog, MarketCatalogPage};
use super::model::{ProfileRole, WorkbenchCatalog, WorkbenchMode};
use super::service::WorkbenchService;
use super::tui::{prepare_tui_launcher, TuiLauncherPaths};
use super::WorkbenchError;
use tauri::{AppHandle, Manager};

pub trait RestartScheduler {
    fn schedule(&self, mode: WorkbenchMode) -> Result<(), WorkbenchError>;
}

pub fn set_enabled_and_schedule(
    service: &WorkbenchService,
    scheduler: &impl RestartScheduler,
    component_id: &str,
    enabled: bool,
) -> Result<WorkbenchCatalog, WorkbenchError> {
    let catalog = service.set_enabled(component_id, enabled)?;
    if service.requires_web_restart(component_id)? {
        scheduler.schedule(WorkbenchMode::Normal)?;
    }
    Ok(catalog)
}

pub fn repair_and_schedule(
    service: &WorkbenchService,
    scheduler: &impl RestartScheduler,
) -> Result<WorkbenchCatalog, WorkbenchError> {
    let catalog = service.repair()?;
    scheduler.schedule(WorkbenchMode::Normal)?;
    Ok(catalog)
}

pub fn safe_mode_and_schedule(
    service: &WorkbenchService,
    scheduler: &impl RestartScheduler,
) -> Result<WorkbenchCatalog, WorkbenchError> {
    let catalog = service.catalog()?;
    scheduler.schedule(WorkbenchMode::Safe)?;
    Ok(WorkbenchCatalog {
        mode: WorkbenchMode::Safe,
        ..catalog
    })
}

struct TauriRestartScheduler {
    app: AppHandle,
}

impl RestartScheduler for TauriRestartScheduler {
    fn schedule(&self, mode: WorkbenchMode) -> Result<(), WorkbenchError> {
        crate::schedule_workbench_restart(self.app.clone(), mode)
    }
}

fn service(app: &AppHandle) -> Result<tauri::State<'_, WorkbenchService>, String> {
    app.try_state::<WorkbenchService>()
        .ok_or_else(|| "workbench_unavailable: 工作台组件服务尚未就绪".into())
}

#[tauri::command]
pub fn workbench_catalog(app: AppHandle) -> Result<WorkbenchCatalog, String> {
    service(&app)?.catalog().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn workbench_set_enabled(
    app: AppHandle,
    component_id: String,
    enabled: bool,
) -> Result<WorkbenchCatalog, String> {
    let scheduler = TauriRestartScheduler { app: app.clone() };
    let workbench = service(&app)?;
    set_enabled_and_schedule(&workbench, &scheduler, &component_id, enabled)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn workbench_repair(app: AppHandle) -> Result<WorkbenchCatalog, String> {
    let scheduler = TauriRestartScheduler { app: app.clone() };
    let workbench = service(&app)?;
    repair_and_schedule(&workbench, &scheduler).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn workbench_start_safe_mode(app: AppHandle) -> Result<WorkbenchCatalog, String> {
    let scheduler = TauriRestartScheduler { app: app.clone() };
    let workbench = service(&app)?;
    safe_mode_and_schedule(&workbench, &scheduler).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn workbench_open_tui(app: AppHandle) -> Result<String, String> {
    let profile = service(&app)?
        .prepare_tui_profile()
        .map_err(|error| error.to_string())?;
    let runtime = crate::runtime_dir(&app)?;
    let data = app
        .path()
        .app_data_dir()
        .map_err(|_| "tui_path_invalid: 无法定位应用数据目录".to_string())?;
    let dsh_home = crate::dsh_home(&app)?;
    let node = bundled_node(&runtime);
    let dsh_bin_dir = runtime.join("app/node_modules/.bin");
    let dsh_entry = runtime.join("app/node_modules/@deepseek-ai/dsh/lib/bin.js");
    let profile_bin = profile.join("node_modules/@deepseek-harness-tui/dsh-tui/bin/dsh-tui.js");
    let workspace = PathBuf::from(crate::home_dir_fallback());
    #[cfg(windows)]
    let script = data.join("workbench/tui/launch.cmd");
    #[cfg(not(windows))]
    let script = data.join("workbench/tui/launch.command");
    let launcher = prepare_tui_launcher(&TuiLauncherPaths {
        script: &script,
        node: &node,
        dsh_bin_dir: &dsh_bin_dir,
        dsh_entry: &dsh_entry,
        dsh_home: &dsh_home,
        profile_bin: &profile_bin,
        workspace: &workspace,
    })
    .map_err(|error| error.to_string())?;
    open_tui_script(&launcher)?;
    Ok(launcher.display().to_string())
}

#[tauri::command]
pub fn workbench_prepare_browser(app: AppHandle) -> Result<String, String> {
    let artifact = service(&app)?
        .enabled_artifact("browser", ProfileRole::Web)
        .map_err(|error| error.to_string())?;
    let data = app
        .path()
        .app_data_dir()
        .map_err(|_| "browser_extension_prepare_failed: 无法定位应用数据目录".to_string())?;
    let prepared = prepare_browser_extension(
        &artifact.join("browser-extension"),
        &data.join("browser-extension"),
        "0.1.1",
    )
    .map_err(|error| error.to_string())?;
    open_chrome_extensions()?;
    Ok(prepared.display().to_string())
}

#[tauri::command]
pub fn workbench_market_catalog(
    app: AppHandle,
    query: Option<String>,
    limit: Option<usize>,
) -> Result<MarketCatalogPage, String> {
    let artifact = service(&app)?
        .enabled_artifact("market", ProfileRole::Catalog)
        .map_err(|error| error.to_string())?;
    search_market_catalog(
        &artifact.join("data/plugins.json"),
        query.as_deref().unwrap_or_default(),
        limit.unwrap_or(50),
    )
    .map_err(|error| error.to_string())
}

#[cfg(not(windows))]
fn bundled_node(runtime: &Path) -> PathBuf {
    runtime.join("node/bin/node")
}

#[cfg(windows)]
fn bundled_node(runtime: &Path) -> PathBuf {
    runtime.join("node/node.exe")
}

#[cfg(target_os = "macos")]
fn open_tui_script(script: &Path) -> Result<(), String> {
    Command::new("open")
        .args(["-a", "Terminal"])
        .arg(script)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("tui_open_failed: 无法打开 Terminal: {error}"))
}

#[cfg(windows)]
fn open_tui_script(script: &Path) -> Result<(), String> {
    Command::new("cmd")
        .args(["/C", "start", ""])
        .arg(script)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("tui_open_failed: 无法打开终端: {error}"))
}

#[cfg(not(any(target_os = "macos", windows)))]
fn open_tui_script(_script: &Path) -> Result<(), String> {
    Err("tui_open_unsupported: 当前系统暂不支持自动打开 TUI".into())
}

#[cfg(target_os = "macos")]
fn open_chrome_extensions() -> Result<(), String> {
    Command::new("open")
        .args(["-a", "Google Chrome", "chrome://extensions"])
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("browser_open_failed: 无法打开 Chrome: {error}"))
}

#[cfg(windows)]
fn open_chrome_extensions() -> Result<(), String> {
    Command::new("cmd")
        .args(["/C", "start", "", "chrome://extensions"])
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("browser_open_failed: 无法打开浏览器扩展页: {error}"))
}

#[cfg(not(any(target_os = "macos", windows)))]
fn open_chrome_extensions() -> Result<(), String> {
    Err("browser_open_unsupported: 当前系统暂不支持自动打开 Chrome".into())
}
