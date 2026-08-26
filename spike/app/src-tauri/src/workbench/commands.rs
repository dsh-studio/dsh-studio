use super::model::{WorkbenchCatalog, WorkbenchMode};
use super::service::WorkbenchService;
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
    scheduler.schedule(WorkbenchMode::Normal)?;
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
